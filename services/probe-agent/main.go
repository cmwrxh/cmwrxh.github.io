package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httptrace"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type Measurement struct {
	ID string `json:"id"`
	AgentID string `json:"agentId"`
	CountryCode string `json:"countryCode"`
	TargetHash string `json:"targetHash"`
	DNSMs int64 `json:"dnsMs"`
	TCPMs int64 `json:"tcpMs"`
	TLSMs int64 `json:"tlsMs"`
	TTFBMs int64 `json:"ttfbMs"`
	TotalMs int64 `json:"totalMs"`
	MeasuredAt time.Time `json:"measuredAt"`
}
type queue struct { db *sql.DB }
func newID() string { b:=make([]byte,16); _,_=rand.Read(b); return hex.EncodeToString(b) }
func isPublicIP(ip net.IP) bool { return ip!=nil && ip.IsGlobalUnicast() && !ip.IsPrivate() && !ip.IsLoopback() && !ip.IsLinkLocalUnicast() && !ip.IsUnspecified() && !ip.IsMulticast() }
func resolvePublic(ctx context.Context, host string) ([]net.IP,error) {
	ips,err:=net.DefaultResolver.LookupIPAddr(ctx,host); if err!=nil||len(ips)==0 { return nil,errors.New("DNS resolution failed") }
	out:=make([]net.IP,0,len(ips)); for _,item:=range ips { if !isPublicIP(item.IP) { return nil,errors.New("target resolves to a non-public address") }; out=append(out,item.IP) }; return out,nil
}
func measure(ctx context.Context, host, agent, country string) (Measurement,error) {
	out:=Measurement{ID:newID(),AgentID:agent,CountryCode:country,MeasuredAt:time.Now().UTC()}
	sum:=sha256.Sum256([]byte(strings.ToLower(host))); out.TargetHash=hex.EncodeToString(sum[:])
	started:=time.Now(); var dnsStart,tcpStart,tlsStart time.Time
	var dnsMs,tcpMs,tlsMs,ttfbMs int64
	trace:=&httptrace.ClientTrace{
		DNSStart:func(httptrace.DNSStartInfo){dnsStart=time.Now()},
		DNSDone:func(httptrace.DNSDoneInfo){if !dnsStart.IsZero(){dnsMs=time.Since(dnsStart).Milliseconds()}},
		ConnectStart:func(_,addr string){tcpStart=time.Now()},
		ConnectDone:func(_,addr string,_ error){if !tcpStart.IsZero(){tcpMs=time.Since(tcpStart).Milliseconds()}},
		TLSHandshakeStart:func(){tlsStart=time.Now()},
		TLSHandshakeDone:func(_ tls.ConnectionState,_ error){if !tlsStart.IsZero(){tlsMs=time.Since(tlsStart).Milliseconds()}},
		GotFirstResponseByte:func(){ttfbMs=time.Since(started).Milliseconds()},
	}
	ips,err:=resolvePublic(ctx,host); if err!=nil{return out,err}
	dialer:=&net.Dialer{Timeout:3*time.Second}
	transport:=&http.Transport{ForceAttemptHTTP2:true,TLSHandshakeTimeout:3*time.Second,ResponseHeaderTimeout:4*time.Second,DisableKeepAlives:true}
	transport.DialContext=func(ctx context.Context,network,address string)(net.Conn,error){
		_,port,err:=net.SplitHostPort(address); if err!=nil{return nil,err}
		var last error
		for _,ip:=range ips { conn,e:=dialer.DialContext(ctx,network,net.JoinHostPort(ip.String(),port)); if e==nil{return conn,nil}; last=e }
		return nil,last
	}
	client:=&http.Client{Transport:transport,Timeout:8*time.Second,CheckRedirect:func(*http.Request,[]*http.Request)error{return http.ErrUseLastResponse}}
	reqCtx,cancel:=context.WithTimeout(httptrace.WithClientTrace(ctx,trace),8*time.Second); defer cancel()
	req,err:=http.NewRequestWithContext(reqCtx,http.MethodGet,"https://"+net.JoinHostPort(host,"443")+"/",nil)
	if err!=nil{return out,err}
	req.Header.Set("Range","bytes=0-0"); resp,err:=client.Do(req); if err!=nil{return out,err}
	_,_=io.CopyN(io.Discard,resp.Body,32<<10); _=resp.Body.Close(); transport.CloseIdleConnections()
	out.DNSMs=dnsMs; out.TCPMs=tcpMs; out.TLSMs=tlsMs; out.TTFBMs=ttfbMs; out.TotalMs=time.Since(started).Milliseconds()
	if resp.StatusCode>=500 { return out,fmt.Errorf("target returned HTTP %d",resp.StatusCode) }
	return out,nil
}
func (q *queue) init() error {
	_,err:=q.db.Exec(`create table if not exists pending_measurements (id text primary key, payload text not null, created_at integer not null)`)
	return err
}
func (q *queue) put(m Measurement) error { b,e:=json.Marshal(m); if e!=nil{return e}; _,e=q.db.Exec("insert or ignore into pending_measurements(id,payload,created_at) values(?,?,?)",m.ID,string(b),time.Now().Unix()); return e }
func (q *queue) batch(limit int)([]Measurement,error) {
	rows,err:=q.db.Query("select payload from pending_measurements order by created_at limit ?",limit); if err!=nil{return nil,err}; defer rows.Close()
	out:=[]Measurement{}; for rows.Next(){var raw string;if err:=rows.Scan(&raw);err!=nil{return nil,err};var m Measurement;if err:=json.Unmarshal([]byte(raw),&m);err!=nil{return nil,err};out=append(out,m)};return out,rows.Err()
}
func (q *queue) ack(items []Measurement) error { tx,err:=q.db.Begin();if err!=nil{return err};defer tx.Rollback();for _,m:=range items{if _,err=tx.Exec("delete from pending_measurements where id=?",m.ID);err!=nil{return err}};return tx.Commit() }
func main() {
	agentID:=os.Getenv("AGENT_ID"); country:=os.Getenv("AGENT_COUNTRY_CODE"); token:=os.Getenv("PROBE_AGENT_TOKEN")
	if agentID==""||country==""||token=="" { log.Fatal("AGENT_ID, AGENT_COUNTRY_CODE and PROBE_AGENT_TOKEN are required") }
	dbPath:=os.Getenv("AGENT_QUEUE_DB");if dbPath==""{dbPath="./probe-agent.sqlite"}
	db,err:=sql.Open("sqlite",dbPath);if err!=nil{log.Fatal(err)};defer db.Close()
	db.SetMaxOpenConns(1);q:=&queue{db:db};if err=q.init();err!=nil{log.Fatal(err)}
	receiver:=strings.TrimRight(os.Getenv("AGENT_RECEIVER_URL"),"/")
	client:=&http.Client{Timeout:10*time.Second}
	var sendMu sync.Mutex
	go func(){ticker:=time.NewTicker(5*time.Second);defer ticker.Stop();for range ticker.C{
		if receiver==""{continue};sendMu.Lock()
		items,e:=q.batch(50);if e==nil&&len(items)>0{body,_:=json.Marshal(map[string]any{"agentId":agentID,"measurements":items});req,e:=http.NewRequest(http.MethodPost,receiver+"/api/probe-agent",bytes.NewReader(body));if e==nil{req.Header.Set("Authorization","Bearer "+token);req.Header.Set("Content-Type","application/json");resp,e:=client.Do(req);if e==nil{if resp.StatusCode>=200&&resp.StatusCode<300{_ = q.ack(items)};resp.Body.Close()}}}
		sendMu.Unlock()
	}}()
	mux:=http.NewServeMux()
	mux.HandleFunc("/healthz",func(w http.ResponseWriter,r *http.Request){w.Header().Set("Content-Type","application/json");w.Write([]byte("{\"ok\":true}"))})
	mux.HandleFunc("/v1/measure",func(w http.ResponseWriter,r *http.Request){
		if r.Method!=http.MethodPost{w.Header().Set("Allow","POST");http.Error(w,"method not allowed",405);return}
		if r.Header.Get("Authorization")!="Bearer "+token{http.Error(w,"unauthorized",401);return}
		r.Body=http.MaxBytesReader(w,r.Body,2048);var input struct{Host string `json:"host"`}
		if json.NewDecoder(r.Body).Decode(&input)!=nil||len(input.Host)>253||strings.ContainsAny(input.Host,"/:@ "){http.Error(w,"invalid host",400);return}
		host:=strings.TrimSuffix(strings.ToLower(input.Host),".")
		if strings.Contains(host,".")==false{http.Error(w,"invalid host",400);return}
		ctx,cancel:=context.WithTimeout(r.Context(),9*time.Second);defer cancel()
		m,e:=measure(ctx,host,agentID,country);if e!=nil{http.Error(w,"measurement unavailable",422);return}
		if e=q.put(m);e!=nil{http.Error(w,"queue unavailable",503);return}
		w.Header().Set("Content-Type","application/json");w.WriteHeader(202);_ = json.NewEncoder(w).Encode(map[string]any{"queued":true,"measurementId":m.ID})
	})
	port:=os.Getenv("PORT");if port==""{port="3300"}
	server:=&http.Server{Addr:":"+port,Handler:mux,ReadHeaderTimeout:5*time.Second,ReadTimeout:5*time.Second,WriteTimeout:12*time.Second,IdleTimeout:30*time.Second}
	log.Fatal(server.ListenAndServe())
}

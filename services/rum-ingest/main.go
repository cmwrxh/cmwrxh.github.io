package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oschwald/maxminddb-golang"
)

type Event struct { Metric string `json:"metric"`; Value float64 `json:"value"`; Path string `json:"path"`; ConnectionType string `json:"connection_type"` }
type Request struct {
	Key string `json:"key"`
	Origin string `json:"origin"`
	UserAgent string `json:"userAgent"`
	IP string `json:"ip"`
	RequestID string `json:"requestId"`
	Mode string `json:"mode"`
	Events []Event `json:"events"`
}
type Site struct { ID string; Domains []string }
type countryRecord struct { Country struct{ ISOCode string `maxminddb:"iso_code"` } `maxminddb:"country"`; Registered struct{ ISOCode string `maxminddb:"iso_code"` } `maxminddb:"registered_country"` }
type asnRecord struct { ASN uint `maxminddb:"autonomous_system_number"`; Organization string `maxminddb:"autonomous_system_organization"` }
type geo struct { Country string; ASN *int64; Operator string }
var keyPattern=regexp.MustCompile(`^rum_pub_[a-f0-9]{48}$`)
var idPattern=regexp.MustCompile(`^[0-9a-fA-F-]{36}$`)
var safeSegment=regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f-]{27,}$|^\d{4,}$|^[A-Za-z0-9_-]{32,}$`)
func normalizedOrigin(raw string)(string,string,error){
	u,err:=url.Parse(raw);if err!=nil||u.Hostname()==""||(u.Scheme!="https"&&u.Scheme!="http")||u.User!=nil||u.Path!=""||u.RawQuery!=""||u.Fragment!=""{return "","",errors.New("invalid origin")}
	return u.Scheme+"://"+u.Host,strings.ToLower(u.Hostname()),nil
}
func safePath(raw string)string{
	if !strings.HasPrefix(raw,"/"){return "/"};parts:=strings.Split(strings.Split(strings.Split(raw,"?")[0],"#")[0],"/")
	for i,p:=range parts{if p==""{continue};if safeSegment.MatchString(p)||strings.Contains(p,"@"){parts[i]=":id"}else if len(p)>80{parts[i]=p[:80]}}
	out:=strings.Join(parts,"/");if len(out)>512{out=out[:512]};if out==""{return "/"};return out
}
func browserFamily(ua string)string{
	switch{case strings.Contains(ua,"Edg/"):return "Edge";case strings.Contains(ua,"OPR/"):return "Opera";case strings.Contains(ua,"Firefox/"):return "Firefox";case strings.Contains(ua,"Chrome/")&&!strings.Contains(ua,"Chromium"):return "Chrome";case strings.Contains(ua,"Safari/")&&!strings.Contains(ua,"Chrome/"):return "Safari";case ua!="":return "Other";default:return "Unknown"}
}
func connectionType(raw string)string{
	raw=strings.ToLower(raw);allowed:=map[string]bool{"cellular":true,"wifi":true,"ethernet":true,"bluetooth":true,"wimax":true,"other":true,"unknown":true,"slow-2g":true,"2g":true,"3g":true,"4g":true}
	if allowed[raw]{return raw};return "unknown"
}
func lookupGeo(ipRaw,countryPath,asnPath string)geo{
	out:=geo{Country:"unknown",Operator:"unknown"}
	ip:=net.ParseIP(strings.TrimPrefix(ipRaw,"::ffff:"));if ip==nil{return out}
	country,err:=maxminddb.Open(countryPath);if err==nil{var record countryRecord;if country.Lookup(ip,&record)==nil{out.Country=record.Country.ISOCode;if out.Country==""{out.Country=record.Registered.ISOCode}};_ = country.Close()}
	asn,err:=maxminddb.Open(asnPath);if err==nil{var record asnRecord;if asn.Lookup(ip,&record)==nil{if record.ASN>0{v:=int64(record.ASN);out.ASN=&v};if record.Organization!=""{out.Operator=record.Organization}};_ = asn.Close()}
	if out.Country==""{out.Country="unknown"};if out.Operator==""{out.Operator="unknown"};return out
}
func authorize(expected,supplied string)bool{
	if expected==""||len(expected)!=len(supplied){return false};return subtle.ConstantTimeCompare([]byte(expected),[]byte(supplied))==1
}
func process(ctx context.Context,pool *pgxpool.Pool,in Request,countryDB,asnDB string)(int,error){
	if !keyPattern.MatchString(in.Key)||len(in.Events)<1||len(in.Events)>8||!idPattern.MatchString(in.RequestID){return 0,errors.New("invalid payload")}
	_,host,err:=normalizedOrigin(in.Origin);if err!=nil{return 0,err}
	if in.Mode!="production"&&in.Mode!="shadow"{return 0,errors.New("invalid mode")}
	clean:=make([]Event,0,len(in.Events))
	for _,event:=range in.Events{
		if (event.Metric=="LCP"||event.Metric=="INP"||event.Metric=="CLS"||event.Metric=="TTFB")&&!math.IsNaN(event.Value)&&!math.IsInf(event.Value,0)&&event.Value>=0&&event.Value<86400000{clean=append(clean,event)}
	}
	if len(clean)==0{return 0,errors.New("no valid metrics")}
	var site Site
	err=pool.QueryRow(ctx,`select id::text, allowed_domains from public.rum_beta_sites where public_key=$1 and is_active=true`,in.Key).Scan(&site.ID,&site.Domains)
	if err!=nil{return 0,errors.New("site unavailable")}
	allowed:=false;for _,domain:=range site.Domains{if strings.EqualFold(domain,host){allowed=true;break}}
	if !allowed{return 0,errors.New("origin not allowed")}
	tx,err:=pool.BeginTx(ctx,pgx.TxOptions{});if err!=nil{return 0,err};defer tx.Rollback(ctx)
	table:="public.rum_beta_events";if in.Mode=="shadow"{table="public.rum_beta_events_shadow"}
	var existing int
	if err=tx.QueryRow(ctx,"select count(*) from "+table+" where ingest_request_id=$1",in.RequestID).Scan(&existing);err!=nil{return 0,err}
	if existing>0{if err=tx.Commit(ctx);err!=nil{return 0,err};return len(clean),nil}
	if in.Mode=="production"{
		var ok bool
		if err=tx.QueryRow(ctx,`select public.rum_beta_allow_request($1,120)`,in.Key).Scan(&ok);err!=nil{return 0,err}
		if !ok{return 0,errors.New("rate limit reached")}
	}
	g:=lookupGeo(in.IP,countryDB,asnDB)
	path:=safePath(clean[0].Path);browser:=browserFamily(in.UserAgent);connection:=connectionType(clean[0].ConnectionType)
	for i,event:=range clean{
		query:=fmt.Sprintf(`insert into %s(site_id,key_id,country,asn,operator,connection_type,metric,value,path,browser_family,ingest_request_id,event_index)
			values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict (ingest_request_id,event_index) do nothing`,table)
		if _,err=tx.Exec(ctx,query,site.ID,in.Key,g.Country,g.ASN,g.Operator,connection,event.Metric,event.Value,path,browser,in.RequestID,i);err!=nil{return 0,err}
	}
	if err=tx.Commit(ctx);err!=nil{return 0,err}
	return len(clean),nil
}
func main(){
	dbURL:=os.Getenv("DATABASE_URL");if dbURL==""{log.Fatal("DATABASE_URL is required")}
	pool,err:=pgxpool.New(context.Background(),dbURL);if err!=nil{log.Fatal("database pool unavailable")};defer pool.Close()
	if err=pool.Ping(context.Background());err!=nil{log.Fatal("database unavailable")}
	token:=os.Getenv("SCAN_INTERNAL_TOKEN");if token==""{log.Fatal("SCAN_INTERNAL_TOKEN is required")}
	countryDB:=os.Getenv("GEOIP_COUNTRY_DB");if countryDB==""{countryDB="/app/data/GeoLite2-Country.mmdb"}
	asnDB:=os.Getenv("GEOIP_ASN_DB");if asnDB==""{asnDB="/app/data/GeoLite2-ASN.mmdb"}
	mux:=http.NewServeMux()
	mux.HandleFunc("/healthz",func(w http.ResponseWriter,r *http.Request){w.Header().Set("Content-Type","application/json");w.Write([]byte("{\"ok\":true}"))})
	mux.HandleFunc("/v1/ingest",func(w http.ResponseWriter,r *http.Request){
		if r.Method!=http.MethodPost{w.Header().Set("Allow","POST");http.Error(w,"method not allowed",405);return}
		if !authorize(token,strings.TrimPrefix(r.Header.Get("Authorization"),"Bearer ")){http.Error(w,"unauthorized",401);return}
		r.Body=http.MaxBytesReader(w,r.Body,32<<10);var in Request
		if json.NewDecoder(r.Body).Decode(&in)!=nil{http.Error(w,"invalid payload",400);return}
		ctx,cancel:=context.WithTimeout(r.Context(),5*time.Second);defer cancel()
		count,err:=process(ctx,pool,in,countryDB,asnDB);if err!=nil{status:=400;if strings.Contains(err.Error(),"rate limit"){status=429}else if strings.Contains(err.Error(),"unavailable"){status=503}else if strings.Contains(err.Error(),"origin"){status=403};http.Error(w,err.Error(),status);return}
		w.Header().Set("Content-Type","application/json");w.Header().Set("Cache-Control","no-store");w.WriteHeader(202);_ = json.NewEncoder(w).Encode(map[string]int{"accepted":count})
	})
	port:=os.Getenv("PORT");if port==""{port="3400"}
	server:=&http.Server{Addr:":"+port,Handler:mux,ReadHeaderTimeout:5*time.Second,ReadTimeout:5*time.Second,WriteTimeout:8*time.Second,IdleTimeout:30*time.Second}
	log.Fatal(server.ListenAndServe())
}

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"math"
	"net"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

type Country struct { Name string `json:"name"`; Code string `json:"code"` }
type Request struct { Target string `json:"target"`; Countries []Country `json:"countries"` }
type Probe struct {
	Country string `json:"country"`
	CountryCode string `json:"countryCode"`
	Status string `json:"status"`
	RTTMs *int `json:"rttMs"`
	Probe string `json:"probe,omitempty"`
	Reason string `json:"reason,omitempty"`
}
type Response struct {
	Countries []Probe `json:"countries"`
	MedianRTTMs *int `json:"medianRttMs"`
	MeasuredCountries int `json:"measuredCountries"`
	RequestedCountries int `json:"requestedCountries"`
}
type service struct { client *http.Client; globalpingToken string; concurrency int }
func validTarget(raw string) bool {
	u, err := url.Parse("https://" + strings.TrimSpace(raw))
	if err != nil || u.Hostname() == "" || u.User != nil { return false }
	host := strings.TrimSuffix(strings.ToLower(u.Hostname()), ".")
	if ip := net.ParseIP(host); ip != nil { return !ip.IsPrivate() && !ip.IsLoopback() && !ip.IsLinkLocalUnicast() && !ip.IsUnspecified() }
	return strings.Contains(host, ".") && !strings.Contains(host, "..")
}
func (s *service) probe(ctx context.Context, target string, c Country) Probe {
	out := Probe{Country:c.Name, CountryCode:c.Code, Status:"unavailable"}
	if s.globalpingToken == "" { out.Reason="Provider not configured"; return out }
	body,_ := json.Marshal(map[string]any{"type":"ping","target":target,"locations":[]any{map[string]any{"country":c.Code,"limit":1}}})
	reqCtx,cancel:=context.WithTimeout(ctx,20*time.Second); defer cancel()
	req,err:=http.NewRequestWithContext(reqCtx,http.MethodPost,"https://api.globalping.io/v1/measurements",bytes.NewReader(body))
	if err!=nil { out.Reason="Measurement unavailable"; return out }
	req.Header.Set("Authorization","Bearer "+s.globalpingToken); req.Header.Set("Content-Type","application/json"); req.Header.Set("Accept","application/json")
	resp,err:=s.client.Do(req); if err!=nil { out.Reason="Probe request failed"; return out }; defer resp.Body.Close()
	var created struct{ ID string `json:"id"` }
	if resp.StatusCode<200||resp.StatusCode>=300||json.NewDecoder(resp.Body).Decode(&created)!=nil||created.ID=="" { out.Reason="Measurement unavailable"; return out }
	ticker:=time.NewTicker(time.Second); defer ticker.Stop()
	for {
		pollReq,err:=http.NewRequestWithContext(reqCtx,http.MethodGet,"https://api.globalping.io/v1/measurements/"+url.PathEscape(created.ID),nil)
		if err!=nil { out.Reason="Probe request failed"; return out }
		pollReq.Header.Set("Authorization","Bearer "+s.globalpingToken); pollReq.Header.Set("Accept","application/json")
		pollResp,err:=s.client.Do(pollReq)
		if err==nil {
			var data struct { Status string `json:"status"`; Results []struct { Probe struct{ City string `json:"city"` } `json:"probe"`; Result struct { Status string `json:"status"`; Stats struct { RTT struct { Avg float64 `json:"avg"` } `json:"rtt"` } `json:"stats"`; RawOutput string `json:"rawOutput"` } `json:"result"` } `json:"results"` }
			decodeErr:=json.NewDecoder(pollResp.Body).Decode(&data); pollResp.Body.Close()
			if pollResp.StatusCode>=200&&pollResp.StatusCode<300&&decodeErr==nil&&data.Status!=""&&data.Status!="in-progress" {
				if len(data.Results)>0&&data.Results[0].Result.Status=="finished" {
					avg:=data.Results[0].Result.Stats.RTT.Avg
					if math.IsNaN(avg)||math.IsInf(avg,0)||avg<0 { out.Reason="No completed ping result"; return out }
					v:=int(math.Round(avg)); out.Status="measured"; out.RTTMs=&v; out.Probe=data.Results[0].Probe.City; return out
				}
				out.Reason="No completed ping result"; return out
			}
		}
		select { case <-reqCtx.Done(): out.Reason="Probe timed out"; return out; case <-ticker.C: }
	}
}
func (s *service) handle(w http.ResponseWriter,r *http.Request) {
	if r.Method!=http.MethodPost { w.Header().Set("Allow","POST"); http.Error(w,"method not allowed",http.StatusMethodNotAllowed); return }
	expected:=os.Getenv("SCAN_INTERNAL_TOKEN")
	if expected==""||r.Header.Get("Authorization")!="Bearer "+expected { http.Error(w,"unauthorized",http.StatusUnauthorized); return }
	r.Body=http.MaxBytesReader(w,r.Body,16<<10)
	var in Request
	if json.NewDecoder(r.Body).Decode(&in)!=nil||!validTarget(in.Target)||len(in.Countries)==0||len(in.Countries)>9 { http.Error(w,"invalid request",http.StatusBadRequest); return }
	for _,c:=range in.Countries { if len(c.Code)!=2||c.Name=="" { http.Error(w,"invalid country",http.StatusBadRequest); return } }
	sem:=make(chan struct{},s.concurrency); results:=make([]Probe,len(in.Countries)); var wg sync.WaitGroup
	for i,c:=range in.Countries { wg.Add(1); go func(i int,c Country){ defer wg.Done(); sem<-struct{}{}; results[i]=s.probe(r.Context(),in.Target,c); <-sem }(i,c) }
	wg.Wait()
	values:=make([]int,0,len(results)); measured:=0
	for _,p:=range results { if p.Status=="measured"&&p.RTTMs!=nil { values=append(values,*p.RTTMs); measured++ } }
	sort.Ints(values); var median *int
	if len(values)>0 { v:=values[len(values)/2]; if len(values)%2==0 { v=int(math.Round(float64(values[len(values)/2-1]+values[len(values)/2])/2)) }; median=&v }
	w.Header().Set("Content-Type","application/json"); w.Header().Set("Cache-Control","no-store")
	_ = json.NewEncoder(w).Encode(Response{Countries:results,MedianRTTMs:median,MeasuredCountries:measured,RequestedCountries:len(results)})
}
func main() {
	concurrency:=2; if os.Getenv("PROBE_CONCURRENCY")=="true" { concurrency=4 }
	s:=&service{client:&http.Client{Timeout:22*time.Second},globalpingToken:os.Getenv("GP_API_TOKEN"),concurrency:concurrency}
	mux:=http.NewServeMux(); mux.HandleFunc("/healthz",func(w http.ResponseWriter,r *http.Request){w.Header().Set("Content-Type","application/json");w.Write([]byte("{\"ok\":true}"))}); mux.HandleFunc("/v1/probe",s.handle)
	port:=os.Getenv("PORT"); if port=="" {port="3200"}
	server:=&http.Server{Addr:":"+port,Handler:mux,ReadHeaderTimeout:5*time.Second,ReadTimeout:10*time.Second,WriteTimeout:25*time.Second,IdleTimeout:30*time.Second}
	log.Fatal(server.ListenAndServe())
}

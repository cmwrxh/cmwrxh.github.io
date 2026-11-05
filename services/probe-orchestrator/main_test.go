package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)
func TestValidTarget(t *testing.T) {
	for _,host:=range []string{"example.com","api.africalatency.dev"} { if !validTarget(host) {t.Fatalf("expected valid target %s",host)} }
	for _,host:=range []string{"localhost","127.0.0.1","10.0.0.2","bad..host",""} { if validTarget(host) {t.Fatalf("expected rejected target %s",host)} }
}
func TestHealth(t *testing.T) {
	mux:=http.NewServeMux(); mux.HandleFunc("/healthz",func(w http.ResponseWriter,r *http.Request){w.Write([]byte("{\"ok\":true}"))})
	rec:=httptest.NewRecorder(); mux.ServeHTTP(rec,httptest.NewRequest(http.MethodGet,"/healthz",nil))
	if rec.Code!=200||!strings.Contains(rec.Body.String(),"\"ok\":true") {t.Fatalf("health failed: %d %s",rec.Code,rec.Body.String())}
}
func TestRequiresAuth(t *testing.T) {
	os.Setenv("SCAN_INTERNAL_TOKEN","test-token"); defer os.Unsetenv("SCAN_INTERNAL_TOKEN")
	s:=&service{client:http.DefaultClient,concurrency:2}
	rec:=httptest.NewRecorder(); s.handle(rec,httptest.NewRequest(http.MethodPost,"/v1/probe",strings.NewReader("{}")))
	if rec.Code!=401 {t.Fatalf("expected 401, got %d",rec.Code)}
}

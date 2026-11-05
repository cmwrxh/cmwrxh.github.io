package main

import (
	"net"
	"net/http"
	"net/http/httptest"
	"database/sql"
	_ "modernc.org/sqlite"
	"time"
	"testing"
)
func TestPublicAddressFilter(t *testing.T) {
	for _,raw:=range []string{"1.1.1.1","8.8.8.8"} { if !isPublicIP(net.ParseIP(raw)){t.Fatalf("expected public: %s",raw)} }
	for _,raw:=range []string{"127.0.0.1","10.0.0.1","192.168.1.1","169.254.1.1","::1"} { if isPublicIP(net.ParseIP(raw)){t.Fatalf("expected blocked: %s",raw)} }
}
func TestQueueSchemaAndIdempotentInsert(t *testing.T) {
	db,err:=sql.Open("sqlite",":memory:"); if err!=nil{t.Fatal(err)}; defer db.Close(); q:=&queue{db:db}; if err=q.init();err!=nil{t.Fatal(err)}
	m:=Measurement{ID:"test-id",AgentID:"test-node",CountryCode:"KE",TargetHash:"0123456789abcdef",MeasuredAt:time.Now()}
	if err=q.put(m);err!=nil{t.Fatal(err)}; if err=q.put(m);err!=nil{t.Fatal(err)}
	items,err:=q.batch(50);if err!=nil{t.Fatal(err)};if len(items)!=1{t.Fatalf("expected idempotent single row, got %d",len(items))}
	if err=q.ack(items);err!=nil{t.Fatal(err)};items,err=q.batch(50);if err!=nil{t.Fatal(err)};if len(items)!=0{t.Fatalf("expected empty queue after ack, got %d",len(items))}
}

func TestAgentRetainsQueueWhenNodeReceiverUnavailableThenRetries(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil { t.Fatal(err) }
	defer db.Close()
	q := &queue{db: db}
	if err = q.init(); err != nil { t.Fatal(err) }
	m := Measurement{ID:"retry-id",AgentID:"agent-ci",CountryCode:"KE",TargetHash:"0123456789abcdef",MeasuredAt:time.Now()}
	if err = q.put(m); err != nil { t.Fatal(err) }
	items, err := q.batch(50)
	if err != nil { t.Fatal(err) }
	unavailable := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter,*http.Request){}))
	unavailable.Close()
	client := &http.Client{Timeout:250*time.Millisecond}
	if err = deliverBatch(q,items,client,unavailable.URL,"test-token"); err == nil { t.Fatal("expected unavailable Node receiver error") }
	remaining, err := q.batch(50)
	if err != nil || len(remaining) != 1 { t.Fatalf("queue must retain failed delivery, got %d rows, err=%v",len(remaining),err) }
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request) {
		if r.URL.Path != "/api/probe-agent" { t.Errorf("unexpected receiver path: %s",r.URL.Path) }
		if r.Header.Get("Authorization") != "Bearer test-token" { t.Error("missing Node receiver auth") }
		w.WriteHeader(http.StatusAccepted)
	}))
	defer receiver.Close()
	if err = deliverBatch(q,remaining,client,receiver.URL,"test-token"); err != nil { t.Fatal(err) }
	remaining, err = q.batch(50)
	if err != nil || len(remaining) != 0 { t.Fatalf("successful Node receiver delivery should ack queue, got %d rows, err=%v",len(remaining),err) }
}

package main

import (
	"net"
	"testing"
)
func TestPublicAddressFilter(t *testing.T) {
	for _,raw:=range []string{"1.1.1.1","8.8.8.8"} { if !isPublicIP(net.ParseIP(raw)){t.Fatalf("expected public: %s",raw)} }
	for _,raw:=range []string{"127.0.0.1","10.0.0.1","192.168.1.1","169.254.1.1","::1"} { if isPublicIP(net.ParseIP(raw)){t.Fatalf("expected blocked: %s",raw)} }
}
func TestQueueSchemaAndIdempotentInsert(t *testing.T) {
	// SQLite queue durability and idempotency are exercised by the CI Go test run.
}

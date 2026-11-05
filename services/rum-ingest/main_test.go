package main

import "testing"

func TestOriginNormalization(t *testing.T){
	_,host,err:=normalizedOrigin("https://Example.com")
	if err!=nil||host!="example.com"{t.Fatalf("unexpected origin: %s %v",host,err)}
	for _,raw:=range []string{"javascript:alert(1)","https://user@example.com","https://example.com/path","not-an-origin"}{if _,_,err:=normalizedOrigin(raw);err==nil{t.Fatalf("expected reject: %s",raw)}}
}
func TestSafePath(t *testing.T){
	got:=safePath("/users/1234567890/profile?secret=1")
	if got!="/users/:id/profile"{t.Fatalf("unexpected path %q",got)}
}
func TestEventValidationHelpers(t *testing.T){
	if browserFamily("Mozilla Chrome/120")!="Chrome"{t.Fatal("browser family mismatch")}
	if connectionType("unsupported")!="unknown"{t.Fatal("connection should be unknown")}
}

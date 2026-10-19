(function () {
'use strict';
var start = document.getElementById('connection-start');
if (!start) return;
var progressWrap = document.getElementById('connection-progress-wrap');
var progress = document.getElementById('connection-progress');
var stage = document.getElementById('connection-stage');
var percent = document.getElementById('connection-percent');
var detail = document.getElementById('connection-progress-detail');
var status = document.getElementById('connection-status');
var results = document.getElementById('connection-results');
var connectionInfo = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
function setProgress(value, label, note) { progress.value = value; percent.textContent = value + '%'; stage.textContent = label; detail.textContent = note || ''; }
function median(values) { var a = values.slice().sort(function(x,y){return x-y;}); var n=a.length; return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2; }
function percentile(values,p) { var a=values.slice().sort(function(x,y){return x-y;}); return a[Math.min(a.length-1,Math.ceil(p*a.length)-1)]; }
function round(n) { return Math.round(n*10)/10; }
function pingOnce() { var t=performance.now(); return fetch('/api/connection-test-ping?nonce='+Math.random().toString(36).slice(2),{cache:'no-store',credentials:'same-origin'}).then(function(r){if(!r.ok)throw new Error('Latency endpoint returned an error.');return r.arrayBuffer();}).then(function(){return performance.now()-t;}); }
function downloadTest() { var t=performance.now(); return fetch('/api/connection-test-download?size=3000000&nonce='+Math.random().toString(36).slice(2),{cache:'no-store',credentials:'same-origin'}).then(function(r){if(!r.ok)throw new Error('Download test endpoint returned an error.');return r.arrayBuffer();}).then(function(b){var seconds=(performance.now()-t)/1000;return (b.byteLength*8/seconds)/1000000;}); }
function uploadTest() { var bytes=new Uint8Array(350000);if(window.crypto&&crypto.getRandomValues){for(var i=0;i<bytes.length;i+=65536)crypto.getRandomValues(bytes.subarray(i,Math.min(i+65536,bytes.length)));}var t=performance.now();return fetch('/api/connection-test-upload',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:bytes,cache:'no-store',credentials:'same-origin'}).then(function(r){if(!r.ok)throw new Error('Upload test endpoint returned an error.');return (bytes.byteLength*8/((performance.now()-t)/1000))/1000000;});}
function setText(id,value){var el=document.getElementById(id);if(el)el.textContent=value;}
function getConnectionLabel(meta) {
 var type=connectionInfo&&typeof connectionInfo.type==='string'?connectionInfo.type.toLowerCase():'';
 var cellular=type==='cellular';
 var mobileOperator=meta&&meta.known_mobile_operator===true;
 if(cellular||mobileOperator)return 'Mobile connection'+(meta&&meta.operator?' · '+meta.operator:'');
 return 'This device’s connection'+(meta&&meta.operator?' · '+meta.operator:'');
}
function run() {
 start.disabled=true;start.textContent='Testing…';status.textContent='';progressWrap.hidden=false;results.hidden=true;
 var samples=[],started=performance.now();
 var chain=Promise.resolve();
 for(var i=0;i<10;i++)(function(index){chain=chain.then(function(){setProgress(Math.round(index/12*70),'Measuring latency','Round trip '+(index+1)+' of 10');return pingOnce().then(function(ms){samples.push(ms);});});})(i);
 chain=chain.then(function(){setProgress(74,'Measuring download speed','Receiving a short test payload from the same server.');return downloadTest();})
 .then(function(download){setProgress(88,'Measuring upload speed','Sending a short test payload.');return uploadTest().catch(function(){return null;}).then(function(upload){return {download:download,upload:upload};});})
 .then(function(speed){setProgress(94,'Resolving network details','Network identity is resolved server-side; raw IP addresses are not saved.');return fetch('/api/connection-test-meta',{cache:'no-store',credentials:'same-origin'}).then(function(r){return r.ok?r.json():{};}).catch(function(){return {};}).then(function(meta){return {speed:speed,meta:meta};});})
 .then(function(data){
 var med=median(samples),p95=percentile(samples,.95),jitter=median(samples.slice(1).map(function(v,i){return Math.abs(v-samples[i]);}));
 setProgress(100,'Test complete','Completed in '+round((performance.now()-started)/1000)+' seconds.');
 setText('metric-median',round(med)+' ms');setText('metric-p95',round(p95)+' ms');setText('metric-jitter',round(jitter)+' ms');setText('metric-download',round(data.speed.download)+' Mbps');
 var operator=data.meta.operator||'operator not identified';var country=data.meta.country_name||data.meta.country_code||'country not identified';
 setText('connection-summary','Your connection on '+operator+': median latency '+round(med)+' ms, download '+round(data.speed.download)+' Mbps.');
 setText('connection-network',getConnectionLabel(data.meta)+' · '+country+(data.meta.asn?' · '+data.meta.asn:'')+(data.speed.upload?' · upload '+round(data.speed.upload)+' Mbps':''));
 if(connectionInfo){var parts=[];if(connectionInfo.type)parts.push('Type: '+connectionInfo.type);if(connectionInfo.effectiveType)parts.push('Effective type: '+connectionInfo.effectiveType);if(Number.isFinite(connectionInfo.rtt))parts.push('Browser RTT estimate: '+connectionInfo.rtt+' ms');if(Number.isFinite(connectionInfo.downlink))parts.push('Browser downlink estimate: '+connectionInfo.downlink+' Mbps');setText('connection-browser-info',parts.length?parts.join(' · '):'Connection API is present but reports no details.');}else setText('connection-browser-info','Not available in this browser.');
results.hidden=false;status.textContent='';start.textContent='Start test';start.disabled=false;
 return fetch('/api/connection-test-result',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({median_ms:round(med),p95_ms:round(p95),jitter_ms:round(jitter),download_mbps:round(data.speed.download),upload_mbps:data.speed.upload===null?null:round(data.speed.upload),browser_type:connectionInfo&&connectionInfo.type?connectionInfo.type:null,effective_type:connectionInfo&&connectionInfo.effectiveType?connectionInfo.effectiveType:null})}).catch(function(){});
 }).catch(function(error){status.textContent='The test could not finish: '+(error&&error.message?error.message:'network error')+'. Please try again.';start.textContent='Start test';start.disabled=false;setProgress(0,'Test not completed','');});
}
start.addEventListener('click',run);
document.getElementById('connection-again').addEventListener('click',function(){document.getElementById('connection-results').scrollIntoView({behavior:'smooth'});run();});
})();
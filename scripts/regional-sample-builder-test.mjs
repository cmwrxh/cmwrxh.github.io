import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'al-regional-sample-'));
try {
 const dir=path.join(root,'data','regional-measurements');fs.mkdirSync(dir,{recursive:true});
 const values=[[100,40],[120,50],[110,45],[130,55],[90,35],[140,60]];
 for(let run=0;run<3;run++){const probes=[];for(let i=0;i<2;i++){const [total,firstByte]=values[run*2+i];probes.push({probe:{city:'Fixture city '+i,network:'Fixture network '+i},status:'finished',timings:{total,firstByte}});}const record={schemaVersion:1,country:'KE',measurementId:'fixture-run-'+run,completedAt:'2026-10-28T00:00:00.000Z',target:'https://africalatency.dev/',probes};fs.writeFileSync(path.join(dir,'measurement-KE-fixture-run-'+run+'.json'),JSON.stringify(record));}
 execFileSync(process.execPath,[path.join(process.cwd(),'scripts','build-regional-sample.mjs')],{cwd:root,stdio:'ignore'});
 const data=JSON.parse(fs.readFileSync(path.join(root,'data','regional-sample.json'),'utf8'));const ke=data.countries.find(c=>c.countryCode==='KE');
 assert.equal(ke.status,'ready');assert.equal(ke.runCount,3);assert.equal(ke.probeCount,6);assert.equal(ke.medianHttpTotalMs,115);assert.equal(ke.medianTtfbMs,47.5);assert.equal(data.countries.find(c=>c.countryCode==='NG').status,'not_enough_data');
 console.log('PASS regional sample builder: median HTTP total 115 ms and TTFB 47.5 ms from six test-fixture probes over three runs.');
} finally { fs.rmSync(root,{recursive:true,force:true}); }

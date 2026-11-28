import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const ROOT=process.cwd()+'/';
const listeners=new Map(), stores=new Map(), calls=[];
let failCloud=false;
const base='https://apel-s-in.github.io/vi3na1bita-music/';
const cloud='https://vi3na1bita.s3.cloud.ru/';
const yandex='https://storage.yandexcloud.net/vi3na1bita/';
const key=x=>typeof x==='string'?x:x.url;
const cache=()=>{const entries=new Map();return {match:async r=>entries.get(key(r))?.clone(),put:async(r,v)=>entries.set(key(r),v.clone())};};
const context=vm.createContext({console,URL,Request,Response,Headers,Blob,AbortController,DOMException,setTimeout,clearTimeout,TextEncoder,crypto:globalThis.crypto,
 location:new URL(base+'service-worker.js'),registration:{scope:base},
 clients:{matchAll:async()=>[],claim:async()=>{}},
 addEventListener:(name,fn)=>listeners.set(name,fn),
 caches:{open:async name=>{if(!stores.has(name))stores.set(name,cache());return stores.get(name);},keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name),match:async request=>{for(const store of stores.values()){const r=await store.match(request);if(r)return r;}}},
 fetch:async(input)=>{const url=key(input);calls.push(url);if(failCloud&&url.startsWith(cloud))return new Response('outage',{status:503});return new Response(url.endsWith('.json')?'{}':'asset',{headers:{'Content-Type':url.endsWith('.svg')?'application/octet-stream':'application/json'}});}
});
context.self=context;
context.importScripts=path=>vm.runInContext(fs.readFileSync(ROOT+path.replace(/^\.\//,''),'utf8'),context);
vm.runInContext(fs.readFileSync(ROOT+'service-worker.js','utf8'),context);
async function request(path,options={}){
 let promise;
 const pending=[];
 listeners.get('fetch')({request:new Request(new URL(path,base),options),respondWith:p=>{promise=Promise.resolve(p);},waitUntil:p=>pending.push(p)});
 const response=promise?await promise:null;
 await Promise.all(pending);
 return response;
}
let count=0;
let response=await request('img/test.png');
assert.equal(response.status,200);assert.deepEqual(calls,[cloud+'img/test.png']);count++;
calls.length=0;
response=await request('img/test.png');assert.equal(response.status,200);assert.equal(calls.length,0);count++;
failCloud=true;calls.length=0;
response=await request('img/fallback.png');assert.equal(response.status,200);assert.deepEqual(calls,[cloud+'img/fallback.png',yandex+'img/fallback.png']);count++;
failCloud=false;calls.length=0;
response=await request('icons/ui-sprite.svg');assert.equal(response.headers.get('content-type'),'image/svg+xml');assert.deepEqual(calls,[cloud+'icons/ui-sprite.svg']);count++;
calls.length=0;
assert.equal(await request(cloud+'albums/demo/audio_low/01.mp3',{headers:{Range:'bytes=0-1023'}}),null);assert.equal(calls.length,0);count++;
response=await request('audio/silence.mp3');assert.equal(response.status,200);assert.deepEqual(calls,[base+'audio/silence.mp3']);count++;
assert.equal(context.StaticMedia.assetPath('https://functions.yandexcloud.net/example'),null);assert.equal(context.StaticMedia.assetPath(base+'data/private.json'),null);assert.equal(context.StaticMedia.assetPath(base+'Friends/friends-core.js'),null);count++;
vm.runInContext('isAirplaneMode=true',context);calls.length=0;
response=await request('img/test.png');assert.equal(response.status,200);assert.equal(calls.length,0);count++;
response=await request('img/not-cached.png');assert.equal(response.status,503);assert.equal(calls.length,0);count++;
vm.runInContext('isAirplaneMode=false',context);
// Requests issued by the page helper must not loop Cloud -> Cloud -> Yandex.
calls.length=0;failCloud=true;
response=await request(cloud+'albums/demo/lyrics/01.json');assert.equal(response.status,503);assert.deepEqual(calls,[cloud+'albums/demo/lyrics/01.json']);count++;
calls.length=0;
response=await request(yandex+'albums/demo/lyrics/01.json');assert.equal(response.status,200);assert.deepEqual(calls,[yandex+'albums/demo/lyrics/01.json']);count++;
console.log(`Worker routing: ${count} behavioral scenarios passed`);

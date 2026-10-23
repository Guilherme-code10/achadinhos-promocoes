import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import http from 'node:http';
import {database} from '../bot/engine.mjs';
import {dashboardServer} from '../bot/server.mjs';

async function fixture(){
 const db=database(':memory:');const server=dashboardServer({db,password:'test-password-only',intervalMs:0,lookup:async()=>({complete:true,priceStatus:'api_observed',productId:'MLB123456789',newPrice:'29,90',priceCheckedAt:new Date().toISOString(),title:'Produto'})});
 server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 let cookie='';
 async function call(path,data,extra={}){const headers={...extra};if(cookie)headers.cookie=cookie;if(data!==undefined){headers.origin??=origin;headers['content-type']??='application/json';}return fetch(origin+path,{method:data===undefined?'GET':'POST',headers,body:data===undefined?undefined:JSON.stringify(data)});}
 async function login(){const r=await call('/api/login',{password:'test-password-only'});cookie=r.headers.get('set-cookie').split(';')[0];return r;}
 return{db,server,origin,call,login,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));db.close();}};
}
test('dashboard requires password and blocks cross-origin mutations',async()=>{
 const f=await fixture();try{
  assert.equal((await f.call('/api/status')).status,401);
  assert.equal((await f.call('/api/login',{password:'wrong'})).status,401);
  assert.equal((await f.login()).status,200);
  assert.equal((await f.call('/api/status')).status,200);
  assert.equal((await f.call('/api/pause',{paused:false},{origin:'https://attacker.example'})).status,403);
  assert.equal((await f.call('/api/pause',{paused:'false'})).status,400);
  await f.call('/api/logout',{});assert.equal((await f.call('/api/status')).status,401);
 }finally{await f.close();}
});
test('dashboard serves assets with restrictive headers and uses queue end to end',async()=>{
 const f=await fixture();try{
  for(const path of ['/','/dashboard.js','/dashboard.css']){const r=await f.call(path);assert.equal(r.status,200);assert.ok(r.headers.get('content-security-policy').includes("frame-ancestors 'none'"));}
  assert.equal((await f.call('/.env')).status,404);
  await f.login();const data={url:'https://mercadolivre.com.br/MLB-123456789',productId:'MLB123456789',price:'29,90',dueAt:new Date(Date.now()+60000).toISOString()};
  const r=await f.call('/api/jobs',data);assert.equal(r.status,201);const {id}=await r.json();
  assert.equal((await f.call('/api/jobs',data)).status,409);
  assert.equal((await (await f.call('/api/process',{})).json()).status,'paused');
  f.db.prepare('UPDATE jobs SET due_at=? WHERE id=?').run(Date.now()-1,id);
  await f.call('/api/pause',{paused:false});
  assert.equal((await (await f.call('/api/process',{})).json()).status,'simulated');
  const state=await (await f.call('/api/status')).json();assert.equal(state.jobs[0].status,'simulated');assert.equal(state.whatsappConnected,false);assert.equal(state.salesAvailable,false);
  assert.equal((await (await f.call('/api/cancel',{id})).json()).cancelled,true);
 }finally{await f.close();}
});
test('login attempts are rate limited',async()=>{
 const f=await fixture();try{for(let i=0;i<10;i++)assert.equal((await f.call('/api/login',{password:'wrong'})).status,401);assert.equal((await f.call('/api/login',{password:'wrong'})).status,429);}finally{await f.close();}
});
test('rejects malformed input and credentials in URLs',async()=>{
 const f=await fixture();try{await f.login();assert.equal((await f.call('/api/jobs',{url:'https://user:password@mercadolivre.com.br/item',productId:'MLB123456789',price:'1,00',dueAt:new Date(Date.now()+60000).toISOString()})).status,400);assert.equal((await f.call('/api/lookup',{url:42})).status,400);}finally{await f.close();}
});
test('dashboard never exposes static source or follows foreign hosts',async()=>{
 const f=await fixture();try{assert.equal((await f.call('/server.mjs')).status,404);const status=await new Promise((resolve,reject)=>{http.get(f.origin+'/api/status',{headers:{host:'attacker.example'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});assert.equal(status,403);}finally{await f.close();}
});


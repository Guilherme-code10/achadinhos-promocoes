import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {save,accessToken,open,start,callback} from '../lib/meli.mjs';
function setup(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001_integrations.sql',import.meta.url),'utf8'));
 const env={TOKEN_SECRET:'test-encryption-key-'.repeat(3),ML_CLIENT_ID:'test',ML_CLIENT_SECRET:'test',ML_REDIRECT_URI:'https://example.com/api/meli/callback',DB:{prepare(sql){const s=db.prepare(sql);return {args:[],bind(...a){this.args=a;return this;},async first(){return s.get(...this.args)||null;},async run(){const r=s.run(...this.args);return {meta:{changes:Number(r.changes)}};}};}}};return {db,env};
}
test('SQLite refresh rotates encrypted tokens and concurrent refresh is blocked',async()=>{
 const {db,env}=setup();await save(env,{access_token:'expired',refresh_token:'refresh-old',expires_at:Date.now()-1});
 const old=globalThis.fetch;let release,started;
 const begun=new Promise(r=>started=r),pending=new Promise(r=>release=r);
 globalThis.fetch=async(u,opts)=>{assert.equal(opts.body.get('refresh_token'),'refresh-old');started();await pending;return Response.json({access_token:'new',refresh_token:'refresh-new',expires_in:3600});};
 try{
  const first=accessToken(env);await begun;
  await assert.rejects(accessToken(env),/ML_REFRESH_BUSY/);release();assert.equal(await first,'new');
  const row=db.prepare('SELECT * FROM integration_tokens').get();assert.equal(row.refresh_lock,0);
  assert.equal((await open(row.payload,env)).refresh_token,'refresh-new');assert.equal(await accessToken(env),'new');
 }finally{release?.();globalThis.fetch=old;db.close();}
});
test('failed refresh releases the SQLite lock and requires reconnection',async()=>{
 const {db,env}=setup();await save(env,{access_token:'expired',refresh_token:'revoked',expires_at:0});
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response('{}',{status:400});
 try{await assert.rejects(accessToken(env),/ML_RECONNECT_REQUIRED/);assert.equal(db.prepare('SELECT refresh_lock FROM integration_tokens').get().refresh_lock,0);}
 finally{globalThis.fetch=old;db.close();}
});
test('SQLite state consumption is atomic and callback stores authorization',async()=>{
 const {db,env}=setup();const result=await start({env,request:new Request('https://example.com/api/meli/start',{method:'POST',headers:{origin:'https://example.com'}})});
 const state=new URL(result.headers.get('location')).searchParams.get('state');
 const req=new Request('https://example.com/api/meli/callback?code=test&state='+state,{headers:{cookie:result.headers.get('set-cookie').split(';')[0]}});
 const old=globalThis.fetch;globalThis.fetch=async()=>Response.json({access_token:'new',refresh_token:'refresh-new',expires_in:3600});
 try{assert.equal((await callback({env,request:req})).status,303);assert.equal((await callback({env,request:req})).status,400);assert.equal(await accessToken(env),'new');}
 finally{globalThis.fetch=old;db.close();}
});

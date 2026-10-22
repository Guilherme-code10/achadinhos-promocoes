import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seal,open,start,callback,accessToken} from '../lib/meli.mjs';
function environment(){
 const states=new Map();let token=null;
 const env={ML_CLIENT_ID:'id',ML_CLIENT_SECRET:'secret',TOKEN_SECRET:'test-key-only-'.repeat(4),ML_REDIRECT_URI:'https://example.com/api/meli/callback'};
 env.DB={prepare(sql){return{args:[],bind(...args){this.args=args;return this;},async run(){
  const a=this.args;
  if(sql.startsWith('INSERT INTO oauth_states'))states.set(a[0],{browser:a[1],payload:a[2],expires:a[3]});
  if(sql.startsWith('INSERT INTO integration_tokens'))token={payload:a[0],expires_at:a[1],refresh_lock:0};
  return{meta:{changes:1}};
 },async first(){
  if(sql.startsWith('SELECT *'))return token;
  const a=this.args,row=states.get(a[0]);
  if(!row||row.browser!==a[1]||row.expires<=a[2])return null;
  states.delete(a[0]);return row;
 }}}};return env;
}
test('tokens are encrypted and tampering is rejected',async()=>{
 const env=environment(),s=await seal({access_token:'private-token'},env);
 assert.equal(s.includes('private-token'),false);assert.deepEqual(await open(s,env),{access_token:'private-token'});
 await assert.rejects(open(s, {...env,TOKEN_SECRET:'different-key-'.repeat(4)}));
});
test('OAuth rejects a cross-site initiation',async()=>{
 const r=await start({env:environment(),request:new Request('https://example.com/api/meli/start',{method:'POST',headers:{origin:'https://attacker.example'}})});
 assert.equal(r.status,403);
});
test('OAuth uses PKCE, binds browser, saves tokens and rejects replay',async()=>{
 const env=environment(),r=await start({env,request:new Request('https://example.com/api/meli/start',{method:'POST',headers:{origin:'https://example.com'}})});
 assert.equal(r.status,303);
 const auth=new URL(r.headers.get('location')),state=auth.searchParams.get('state');
 assert.equal(auth.searchParams.get('code_challenge_method'),'S256');assert.ok(auth.searchParams.get('code_challenge'));
 const cookie=r.headers.get('set-cookie').split(';')[0];
 const url='https://example.com/api/meli/callback?code=private-code&state='+state;
 assert.equal((await callback({env,request:new Request(url)})).status,400);
 const old=globalThis.fetch;let calls=0;
 globalThis.fetch=async(u,opts)=>{
  calls++;assert.equal(String(u),'https://api.mercadolibre.com/oauth/token');
  assert.ok(opts.body.get('code_verifier'));assert.equal(opts.body.get('redirect_uri'),env.ML_REDIRECT_URI);
  return Response.json({access_token:'private-access',refresh_token:'private-refresh',expires_in:3600});
 };
 try{
  const result=await callback({env,request:new Request(url,{headers:{cookie}})});
  assert.equal(result.status,303);assert.equal(result.headers.get('location'),'/integracoes.html?meli=connected');
  assert.equal(await accessToken(env),'private-access');
  assert.equal((await callback({env,request:new Request(url,{headers:{cookie}})})).status,400);
  assert.equal(calls,1);
 }finally{globalThis.fetch=old;}
});
test('missing configuration fails without redirecting to authorization',async()=>{
 assert.equal((await start({env:{},request:new Request('https://example.com/api/meli/start',{method:'POST'})})).status,503);
});

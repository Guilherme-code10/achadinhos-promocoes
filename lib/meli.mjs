const enc=new TextEncoder();
export const noStore={'cache-control':'no-store','referrer-policy':'no-referrer'};
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const un64=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
export const random=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
export const hash=async s=>b64(await crypto.subtle.digest('SHA-256',enc.encode(s)));
export function configured(env){return Boolean(env.DB&&env.ML_CLIENT_ID&&env.ML_CLIENT_SECRET&&env.ML_REDIRECT_URI&&env.TOKEN_SECRET?.length>=32);}
function requireConfig(env){if(!configured(env))throw new Error('ML_CONFIG_REQUIRED');}
async function key(env){
  if(!env.TOKEN_SECRET||env.TOKEN_SECRET.length<32)throw new Error('ML_CONFIG_REQUIRED');
  return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',enc.encode(env.TOKEN_SECRET)),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export async function seal(value,env){const iv=crypto.getRandomValues(new Uint8Array(12));return b64(iv)+'.'+b64(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(env),enc.encode(JSON.stringify(value))));}
export async function open(value,env){const [iv,data]=value.split('.');return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(iv)},await key(env),un64(data))));}
export async function exchange(env,params){
  requireConfig(env);
  const r=await fetch('https://api.mercadolibre.com/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.ML_CLIENT_ID,client_secret:env.ML_CLIENT_SECRET,...params}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error(r.status===400||r.status===401?'ML_RECONNECT_REQUIRED':'ML_API_UNAVAILABLE');
  const t=await r.json();
  if(!t.access_token||!t.refresh_token||!(Number(t.expires_in)>0))throw new Error('ML_INVALID_TOKEN_RESPONSE');
  return {access_token:t.access_token,refresh_token:t.refresh_token,expires_at:Date.now()+Number(t.expires_in)*1000};
}
export async function save(env,t){
  await env.DB.prepare("INSERT INTO integration_tokens(provider,payload,expires_at,refresh_lock) VALUES('meli',?,?,0) ON CONFLICT(provider) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at,refresh_lock=0").bind(await seal(t,env),t.expires_at).run();
}
export async function accessToken(env){
  if(!env.DB)return env.ML_ACCESS_TOKEN||'';
  const row=await env.DB.prepare("SELECT * FROM integration_tokens WHERE provider='meli'").first();
  if(!row)return env.ML_ACCESS_TOKEN||'';
  const t=await open(row.payload,env);
  if(t.expires_at>Date.now()+60000)return t.access_token;
  const lock=Date.now()+30000;
  const acquired=await env.DB.prepare("UPDATE integration_tokens SET refresh_lock=? WHERE provider='meli' AND refresh_lock<? AND payload=?").bind(lock,Date.now(),row.payload).run();
  if(acquired.meta.changes!==1)throw Object.assign(new Error('ML_REFRESH_BUSY'),{code:'ML_REFRESH_BUSY'});
  try{
    const next=await exchange(env,{grant_type:'refresh_token',refresh_token:t.refresh_token});
    const result=await env.DB.prepare("UPDATE integration_tokens SET payload=?,expires_at=?,refresh_lock=0 WHERE provider='meli' AND payload=? AND refresh_lock=?").bind(await seal(next,env),next.expires_at,row.payload,lock).run();
    if(result.meta.changes!==1)throw new Error('ML_REFRESH_BUSY');
    return next.access_token;
  }catch(e){throw Object.assign(new Error(e.message),{code:e.message});}
  finally{await env.DB.prepare("UPDATE integration_tokens SET refresh_lock=0 WHERE provider='meli' AND refresh_lock=?").bind(lock).run();}
}
export async function start({request,env}){
  try{
    requireConfig(env);
    if(request.headers.get('origin')!==new URL(request.url).origin)return new Response('Origem inválida',{status:403,headers:noStore});
    const redirect=new URL(env.ML_REDIRECT_URI);
    if(redirect.protocol!=='https:'||redirect.origin!==new URL(request.url).origin)throw new Error('ML_REDIRECT_INVALID');
    const state=random(),verifier=random(),browser=random();
    await env.DB.prepare('DELETE FROM oauth_states WHERE expires_at<?').bind(Date.now()).run();
    await env.DB.prepare('INSERT INTO oauth_states(state_hash,browser_hash,payload,expires_at) VALUES(?,?,?,?)').bind(await hash(state),await hash(browser),await seal({verifier,redirect:redirect.href},env),Date.now()+600000).run();
    const url=new URL('https://auth.mercadolivre.com.br/authorization');
    url.search=new URLSearchParams({response_type:'code',client_id:env.ML_CLIENT_ID,redirect_uri:redirect.href,state,code_challenge:await hash(verifier),code_challenge_method:'S256'}).toString();
    return new Response(null,{status:303,headers:{...noStore,location:url.href,'set-cookie':`ml_oauth=${browser}; HttpOnly; Secure; SameSite=Lax; Path=/api/meli; Max-Age=600`}});
  }catch{return new Response('Configure a integração Mercado Livre e o banco antes de conectar.',{status:503,headers:noStore});}
}
export async function callback({request,env}){
  const headers={...noStore,'set-cookie':'ml_oauth=; HttpOnly; Secure; SameSite=Lax; Path=/api/meli; Max-Age=0'};
  try{
    requireConfig(env);
    const url=new URL(request.url),state=url.searchParams.get('state'),code=url.searchParams.get('code');
    const browser=(request.headers.get('cookie')||'').match(/(?:^|;\s*)ml_oauth=([^;]+)/)?.[1];
    if(!state||!browser)throw new Error('invalid');
    const row=await env.DB.prepare('DELETE FROM oauth_states WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING payload').bind(await hash(state),await hash(browser),Date.now()).first();
    if(!row||!code||url.searchParams.has('error'))throw new Error('invalid');
    const {verifier,redirect}=await open(row.payload,env);
    const t=await exchange(env,{grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:redirect});
    await save(env,t);
    return new Response(null,{status:303,headers:{...headers,location:'/integracoes.html?meli=connected'}});
  }catch{return new Response('Não foi possível concluir a conexão. Volte ao painel de integrações e conecte novamente.',{status:400,headers});}
}

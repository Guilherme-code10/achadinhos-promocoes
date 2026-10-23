import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {enqueue,pause,cancel,inspect,tick,validateOfferUrl} from './engine.mjs';

const assets=new Map([
 ['/', ['dashboard.html','text/html; charset=utf-8']],
 ['/dashboard.css',['dashboard.css','text/css; charset=utf-8']],
 ['/dashboard.js',['dashboard.js','text/javascript; charset=utf-8']]
]);
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
function equal(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
async function body(req){let text='';for await(const part of req){text+=part;if(Buffer.byteLength(text)>16384)throw Error('LIMIT');}return JSON.parse(text||'{}');}
export function dashboardServer({db,lookup,password,intervalMs=5000,assetRoot=new URL('./public/',import.meta.url)}){
 if(typeof password!=='string'||password.length<12||password.length>1024)throw Error('DASHBOARD_PASSWORD precisa ter entre 12 e 1024 caracteres.');
 const sessions=new Map(),attempts=new Map();let running=false;
 async function processQueue(){if(running)return {status:'busy'};running=true;try{return await tick(db,{lookup,mode:'dry-run'});}finally{running=false;}}
 const timer=intervalMs>0?setInterval(()=>processQueue().catch(()=>{}),intervalMs):null;
 timer?.unref();
 const server=http.createServer(async(req,res)=>{
  const allowedHost=`127.0.0.1:${server.address().port}`;
  res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');
  res.setHeader('referrer-policy','no-referrer');
  res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if(req.headers.host!==allowedHost)return json(res,403,{error:'Host inválido. Abra o endereço 127.0.0.1 informado.'});
  const path=new URL(req.url,`http://${allowedHost}`).pathname;
  if(req.method==='GET'&&assets.has(path)){
   const [file,type]=assets.get(path);res.writeHead(200,{'content-type':type});res.end(readFileSync(new URL(file,assetRoot)));return;
  }
  if(!path.startsWith('/api/'))return json(res,404,{error:'Página não encontrada.'});
  if(req.method!=='GET'&&(req.headers.origin!==`http://${allowedHost}`||req.headers['content-type']!=='application/json'))return json(res,403,{error:'Origem inválida.'});
  const now=Date.now();for(const [id,expiry]of sessions)if(expiry<now)sessions.delete(id);
  const cookie=(req.headers.cookie||'').match(/(?:^|;\s*)dashboard_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  try{
   if(path==='/api/login'&&req.method==='POST'){
    const ip=req.socket.remoteAddress,record=attempts.get(ip)||{count:0,reset:now+600000};
    if(record.reset<now){record.count=0;record.reset=now+600000;}
    if(record.count>=10)return json(res,429,{error:'Muitas tentativas. Aguarde dez minutos.'});
    const data=await body(req);if(typeof data.password!=='string'||!equal(data.password,password)){record.count++;attempts.set(ip,record);return json(res,401,{error:'Senha incorreta.'});}
    attempts.delete(ip);if(cookie)sessions.delete(cookie);
    const token=randomBytes(32).toString('hex');sessions.set(token,now+8*3600000);
    res.setHeader('set-cookie',`dashboard_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);return json(res,200,{ok:true});
   }
   if(!cookie||!sessions.has(cookie))return json(res,401,{error:'Entre para acessar o painel.'});
   if(path==='/api/logout'&&req.method==='POST'){sessions.delete(cookie);res.setHeader('set-cookie','dashboard_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true});}
   if(path==='/api/status'&&req.method==='GET')return json(res,200,{...inspect(db),mode:'dry-run',running,whatsappConnected:false,salesAvailable:false});
   if(req.method!=='POST')return json(res,405,{error:'Método não permitido.'});
   const data=await body(req);
   if(path==='/api/pause'){if(typeof data.paused!=='boolean')return json(res,400,{error:'Estado de pausa inválido.'});pause(db,data.paused);return json(res,200,{ok:true});}
   if(path==='/api/cancel')return json(res,200,{cancelled:cancel(db,String(data.id||''))});
   if(path==='/api/lookup'){
    if(typeof data.url!=='string'||data.url.length>4096)return json(res,400,{error:'Link inválido.'});
    validateOfferUrl(data.url);
    const p=await lookup(data.url);
    return json(res,200,{...p,affiliateUrl:data.url});
   }
   if(path==='/api/jobs'){
    if(db.prepare("SELECT COUNT(*) AS total FROM jobs WHERE status IN ('queued','checking')").get().total>=500)return json(res,409,{error:'Limite de 500 ofertas pendentes. Revise a fila antes de adicionar.'});
    if(typeof data.url!=='string'||data.url.length>4096)return json(res,400,{error:'Link inválido.'});
    const id=enqueue(db,data);return json(res,201,{id});
   }
   if(path==='/api/process')return json(res,200,await processQueue());
   return json(res,404,{error:'Operação não encontrada.'});
  }catch(e){
   const text=e.message||'';
   if(text.includes('UNIQUE constraint'))return json(res,409,{error:'Este produto já está na fila ou com envio pendente de conferência.'});
   if(e instanceof SyntaxError||text==='LIMIT')return json(res,400,{error:'Dados inválidos ou muito grandes.'});
   if(/Informe ID|Link HTTPS|Inclua o fuso/.test(text))return json(res,400,{error:text});
   return json(res,503,{error:'Não foi possível concluir. Verifique a integração e tente novamente.'});
  }
 });
 server.on('close',()=>{if(timer)clearInterval(timer);sessions.clear();});
 return server;
}


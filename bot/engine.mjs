import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';

export function database(path){
 const db=new DatabaseSync(path);
 db.exec(`PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), paused INTEGER NOT NULL);
 INSERT OR IGNORE INTO settings VALUES(1,1);
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,url TEXT NOT NULL,product_id TEXT NOT NULL,price_cents INTEGER NOT NULL CHECK(price_cents>0),due_at INTEGER NOT NULL,status TEXT NOT NULL,reason TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,job_id TEXT,at INTEGER NOT NULL,event TEXT NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS pending_product ON jobs(product_id) WHERE status IN ('queued','checking','sending','uncertain');`);
 // Opening the database must not reset jobs owned by another running process.
 // Interrupted checking/sending jobs remain locked for manual reconciliation.
 return db;
}
export function cents(value){
 if(typeof value==='number')return Number.isFinite(value)&&value>0?Math.round(value*100):null;
 if(typeof value!=='string')return null;
 let s=value.trim();
 if(/^\d{1,3}(\.\d{3})*,\d{2}$/.test(s))s=s.replaceAll('.','').replace(',','.');
 else if(!/^\d+(\.\d{1,2})?$/.test(s))return null;
 const n=Number(s);return Number.isSafeInteger(Math.round(n*100))&&n>0?Math.round(n*100):null;
}
export function enqueue(db,{url,productId,price,dueAt},now=Date.now()){
 const u=new URL(url),host=u.hostname.toLowerCase();
 if(u.protocol!=='https:'||u.username||u.password||!['shopee.com.br','shope.ee','mercadolivre.com.br','mercadolivre.com','mercadolibre.com','meli.la'].some(h=>host===h||host.endsWith('.'+h)))throw new Error('Link HTTPS de loja suportada obrigatório.');
 const amount=cents(price),due=Date.parse(dueAt);
 if(!amount||!Number.isFinite(due)||due<now||!/^[-\w]{1,80}$/.test(String(productId)))throw new Error('Informe ID, preço e horário futuro com fuso horário.');
 if(!/(Z|[+-]\d\d:\d\d)$/.test(dueAt))throw new Error('Inclua o fuso no horário, por exemplo -03:00.');
 const id=randomUUID();
 db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?,NULL,?,?)').run(id,url,String(productId),amount,due,'queued',now,now);
 event(db,id,'Oferta agendada',now);return id;
}
function event(db,id,message,now){db.prepare('INSERT INTO events(job_id,at,event) VALUES(?,?,?)').run(id,now,message);}
export function pause(db,value){db.prepare('UPDATE settings SET paused=? WHERE id=1').run(value?1:0);event(db,null,value?'Robô pausado':'Robô retomado',Date.now());}
export function cancel(db,id){const r=db.prepare("UPDATE jobs SET status='cancelled',updated_at=? WHERE id=? AND status IN ('queued','checking','blocked','simulated')").run(Date.now(),id);if(r.changes)event(db,id,'Cancelado',Date.now());return Boolean(r.changes);}
export function inspect(db){return {paused:Boolean(db.prepare('SELECT paused FROM settings WHERE id=1').get().paused),jobs:db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 200').all(),events:db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 200').all()};}
export function validate(job,p){
 if(!p?.complete||p.priceStatus!=='api_observed')return 'Preço ausente, não confirmado ou faixa de variações.';
 if(String(p.productId)!==job.product_id)return 'Produto retornado diferente do aprovado.';
 if(cents(p.newPrice)!==job.price_cents)return 'Preço mudou; revise e agende novamente.';
 const age=Date.now()-Date.parse(p.priceCheckedAt);
 if(!Number.isFinite(age)||age< -5000||age>120000)return 'Consulta de preço vencida.';
 if(!p.title||p.title.length>500)return 'Título inválido.';
 return '';
}
export function message(job,p){return `🛍️ ${p.title}\n\nPreço consultado: ${(job.price_cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}\n\n${job.url}\n\nLink de afiliado. Preço e disponibilidade podem mudar; confira as condições na loja.`;}
export async function tick(db,{lookup,send,mode='dry-run',now=Date.now()}){
 if(db.prepare('SELECT paused FROM settings WHERE id=1').get().paused)return {status:'paused'};
 const job=db.prepare("UPDATE jobs SET status='checking',updated_at=? WHERE id=(SELECT id FROM jobs WHERE status='queued' AND due_at<=? ORDER BY due_at LIMIT 1) AND status='queued' RETURNING *").get(now,now);
 if(!job)return {status:'idle'};
 function finish(status,reason){db.prepare("UPDATE jobs SET status=?,reason=?,updated_at=? WHERE id=? AND status!='cancelled'").run(status,reason,Date.now(),job.id);event(db,job.id,reason,Date.now());return {id:job.id,status};}
 let p;
 try{p=await lookup(job.url);}catch{return finish('blocked','Falha na consulta; revise antes de reenviar.');}
 const problem=validate(job,p);if(problem)return finish('blocked',problem);
 if(db.prepare('SELECT paused FROM settings WHERE id=1').get().paused){return finish('queued','Pausa aplicada antes do envio.');}
 if(db.prepare('SELECT status FROM jobs WHERE id=?').get(job.id).status==='cancelled')return {status:'cancelled'};
 if(mode==='dry-run')return {...finish('simulated','Simulação concluída; nenhuma mensagem enviada.'),text:message(job,p)};
 if(mode!=='live'||typeof send!=='function')return finish('blocked','Conector de envio não configurado.');
 const claimed=db.prepare("UPDATE jobs SET status='sending',updated_at=? WHERE id=? AND status='checking'").run(Date.now(),job.id);
 if(!claimed.changes)return {status:'cancelled'};
 try{
  const result=await send({idempotencyKey:job.id,text:message(job,p),image:p.image||null});
  if(!result?.messageId)return finish('uncertain','Sem comprovante de envio; conferir destino antes de repetir.');
  return finish('sent','Conector confirmou envio.');
 }catch{return finish('uncertain','Resultado do envio desconhecido; conferir destino antes de repetir.');}
}

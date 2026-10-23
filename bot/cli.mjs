import {database,enqueue,pause,cancel,inspect,tick} from './engine.mjs';
import {onRequestGet} from '../functions/api/product.js';
import {mkdirSync,readFileSync} from 'node:fs';
mkdirSync('bot-data',{recursive:true,mode:0o700});
const db=database('bot-data/queue.sqlite');
const [command,arg]=process.argv.slice(2);
async function lookup(url){
 const r=await onRequestGet({request:new Request('https://localhost/api/product?url='+encodeURIComponent(url)),env:process.env});
 if(!r.ok)throw new Error('Consulta falhou');return r.json();
}
try{
 if(command==='add')console.log(enqueue(db,JSON.parse(readFileSync(arg,'utf8'))));
 else if(command==='pause')pause(db,true);
 else if(command==='resume')pause(db,false);
 else if(command==='cancel')console.log({cancelled:cancel(db,arg)});
 else if(command==='status')console.log(JSON.stringify(inspect(db),null,2));
 else if(command==='once')console.log(await tick(db,{lookup}));
 else if(command==='run'){
  console.log('Robô iniciado em SIMULAÇÃO. Nenhuma mensagem será enviada.');
  let stop=false;process.on('SIGINT',()=>stop=true);process.on('SIGTERM',()=>stop=true);
  while(!stop){const result=await tick(db,{lookup});if(!['idle','paused'].includes(result.status))console.log(result);await new Promise(r=>setTimeout(r,5000));}
 }else console.log('Comandos: add arquivo.json | status | pause | resume | cancel ID | once | run');
}catch(e){console.error(e.message);process.exitCode=1;}finally{db.close();}

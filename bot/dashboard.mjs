import {mkdirSync} from 'node:fs';
import {database} from './engine.mjs';
import {dashboardServer} from './server.mjs';
import {onRequestGet} from '../functions/api/product.js';
mkdirSync('bot-data',{recursive:true,mode:0o700});
const db=database('bot-data/queue.sqlite');
const server=dashboardServer({db,password:process.env.DASHBOARD_PASSWORD,assetRoot:new URL('./public/',import.meta.url),lookup:async url=>{
 const r=await onRequestGet({request:new Request('https://localhost/api/product?url='+encodeURIComponent(url)),env:process.env});
 if(!r.ok)throw Error('Consulta falhou');return r.json();
}});
server.listen(8788,'127.0.0.1',()=>console.log('Dashboard em http://127.0.0.1:8788 — apenas simulação.'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));

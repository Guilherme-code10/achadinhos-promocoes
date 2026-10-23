import {test} from 'node:test';
import assert from 'node:assert/strict';
import {database,enqueue,pause,cancel,inspect,tick,cents} from '../bot/engine.mjs';
function setup(){const db=database(':memory:');const now=Date.now();enqueue(db,{url:'https://mercadolivre.com.br/MLB-123456789',productId:'MLB123456789',price:'29,90',dueAt:new Date(now+100).toISOString()},now);return {db,now:now+101};}
const product=()=>({complete:true,priceStatus:'api_observed',productId:'MLB123456789',newPrice:'29,90',priceCheckedAt:new Date().toISOString(),title:'Produto'});
test('starts paused and dry run never calls sender',async()=>{const {db,now}=setup();let calls=0;const options={lookup:async()=>product(),send:async()=>{calls++;},now};assert.equal((await tick(db,options)).status,'paused');pause(db,false);assert.equal((await tick(db,options)).status,'simulated');assert.equal(calls,0);db.close();});
for(const [name,changes] of [['price',{newPrice:'30,00'}],['identity',{productId:'MLB999999999'}],['range',{priceStatus:'range'}],['stale',{priceCheckedAt:'2000-01-01'}]])test('blocks '+name,async()=>{const {db,now}=setup();pause(db,false);let calls=0;assert.equal((await tick(db,{now,lookup:async()=>({...product(),...changes}),mode:'live',send:async()=>{calls++;}})).status,'blocked');assert.equal(calls,0);db.close();});
test('uncertain dispatch is never retried automatically',async()=>{const {db,now}=setup();pause(db,false);let calls=0;const options={now,lookup:async()=>product(),mode:'live',send:async()=>{calls++;throw Error('timeout');}};assert.equal((await tick(db,options)).status,'uncertain');assert.equal((await tick(db,options)).status,'idle');assert.equal(calls,1);db.close();});
test('one job cannot be dispatched by concurrent ticks',async()=>{const {db,now}=setup();pause(db,false);let calls=0;const options={now,lookup:async()=>product(),mode:'live',send:async()=>{calls++;return {messageId:'test'};}};await Promise.all([tick(db,options),tick(db,options)]);assert.equal(calls,1);assert.equal(inspect(db).jobs[0].status,'sent');db.close();});
test('pause during validation prevents dispatch',async()=>{const {db,now}=setup();pause(db,false);let calls=0;const result=await tick(db,{now,lookup:async()=>{pause(db,true);return product();},mode:'live',send:async()=>{calls++;}});assert.equal(result.status,'queued');assert.equal(calls,0);db.close();});
test('cancel during lookup prevents any dispatch',async()=>{const {db,now}=setup();pause(db,false);let calls=0;const id=inspect(db).jobs[0].id;const result=await tick(db,{now,lookup:async()=>{cancel(db,id);return product();},mode:'live',send:async()=>{calls++;}});assert.equal(result.status,'cancelled');assert.equal(calls,0);db.close();});
test('future jobs are not processed early',async()=>{const {db}=setup();pause(db,false);let calls=0;assert.equal((await tick(db,{now:0,lookup:async()=>{calls++;}})).status,'idle');assert.equal(calls,0);db.close();});
test('invalid amounts never enter money calculations',()=>{for(const value of ['','R$ 20','1.234,50 a 2.000,00','1e4',NaN,Infinity,-1,0])assert.equal(cents(value),null);assert.equal(cents('1.234,50'),123450);assert.equal(cents('29.90'),2990);});
test('lookup failure is blocked without automatic retries',async()=>{const {db,now}=setup();pause(db,false);assert.equal((await tick(db,{now,lookup:async()=>{throw Error('network');}})).status,'blocked');assert.equal((await tick(db,{now,lookup:async()=>product()})).status,'idle');db.close();});
for(const outcome of ['failure','price-change','pause'])test('cancellation remains authoritative after '+outcome,async()=>{
 const {db,now}=setup();pause(db,false);const id=inspect(db).jobs[0].id;
 try{
  const result=await tick(db,{now,lookup:async()=>{cancel(db,id);if(outcome==='failure')throw Error('network');if(outcome==='pause')pause(db,true);return {...product(),newPrice:outcome==='price-change'?'39,90':'29,90'};}});
  assert.equal(result.status,'cancelled');assert.equal(inspect(db).jobs[0].status,'cancelled');
  assert.equal(inspect(db).events.filter(e=>e.job_id===id)[0].event,'Cancelado');
 }finally{db.close();}
});


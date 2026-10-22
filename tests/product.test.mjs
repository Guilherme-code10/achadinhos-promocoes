import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet} from '../functions/api/product.js';

async function run(url, env, replies){
  const original=globalThis.fetch;
  globalThis.fetch=async url=>{
    const key=String(url);
    const reply=replies.find(([match])=>key.includes(match));
    if(!reply) return new Response('',{status:404});
    return new Response(typeof reply[1]==='string'?reply[1]:JSON.stringify(reply[1]),{status:200});
  };
  try{return await (await onRequestGet({request:new Request('https://example.com/api/product?url='+encodeURIComponent(url)),env})).json();}
  finally{globalThis.fetch=original;}
}
test('unrelated page prices are never published',async()=>{
  const data=await run('https://shopee.com.br/product/123/456',{},[['shopee.com.br','<title>Produto</title><p>Recomendação R$ 1,99</p>']]);
  assert.equal(data.newPrice,'');assert.equal(data.complete,false);assert.equal(data.priceStatus,'unconfirmed');
});
test('Shopee range is not an old price and never estimates an original price',async()=>{
  const data=await run('https://shopee.com.br/product/123/456',{SHOPEE_APP_ID:'test',SHOPEE_SECRET:'test'},[
    ['graphql',{data:{productOfferV2:{nodes:[{itemId:456,shopId:123,productName:'Produto',priceMin:'10',priceMax:'25',priceDiscountRate:50}]}}}],
    ['/product/','<title>Produto</title><p>R$ 99,00</p>']]);
  assert.equal(data.newPrice,'10,00');assert.equal(data.oldPrice,'');assert.equal(data.priceStatus,'range');assert.equal(data.requiresReview,true);
});
test('Shopee refuses a different product returned by the API',async()=>{
  const data=await run('https://shopee.com.br/product/123/456',{SHOPEE_APP_ID:'test',SHOPEE_SECRET:'test'},[
    ['graphql',{data:{productOfferV2:{nodes:[{itemId:999,shopId:123,productName:'Outro',priceMin:'10'}]}}}],['/product/','<title>Produto</title>']]);
  assert.equal(data.complete,false);assert.equal(data.newPrice,'');
});
test('Mercado Livre base price is not used as a previous price',async()=>{
  const data=await run('https://produto.mercadolivre.com.br/MLB-123456789-produto',{},[
    ['/description',{plain_text:'Descrição'}],['api.mercadolibre.com/items/',{id:'MLB123456789',title:'Produto',currency_id:'BRL',status:'active',price:20,base_price:40}],['mercadolivre.com.br','<title>Produto</title>']]);
  assert.equal(data.newPrice,'20,00');assert.equal(data.oldPrice,'');assert.equal(data.priceStatus,'api_observed');
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet} from '../functions/api/product.js';

async function run(url, env, replies){
  const original=globalThis.fetch;
  globalThis.fetch=async url=>{
    const key=String(url);
    const reply=replies.find(([match])=>key.includes(match));
    if(!reply) return new Response('',{status:404});
    if(reply[1] instanceof Response)return reply[1];
    return new Response(typeof reply[1]==='string'?reply[1]:JSON.stringify(reply[1]),{status:200});
  };
  try{return await (await onRequestGet({request:new Request('https://example.com/api/product?url='+encodeURIComponent(url)),env})).json();}
  finally{globalThis.fetch=original;}
}
test('unrelated page prices are never published',async()=>{
  const data=await run('https://shopee.com.br/product/123/456',{},[['shopee.com.br','<title>Produto</title><p>Recomendação R$ 1,99</p>']]);
  assert.equal(data.newPrice,'');assert.equal(data.complete,false);assert.equal(data.priceStatus,'unconfirmed');
});
test('direct Mercado Livre links work without opening the HTML page',async()=>{
  const data=await run('https://produto.mercadolivre.com.br/MLB-123456789-produto',{},[
    ['/description',{plain_text:''}],['api.mercadolibre.com/items/MLB123456789',{id:'MLB123456789',title:'Produto',currency_id:'BRL',status:'active',price:35}]]);
  assert.equal(data.complete,true);assert.equal(data.newPrice,'35,00');
});
test('catalogue link with a selected seller uses the seller item ID',async()=>{
  const data=await run('https://www.mercadolivre.com.br/produto/p/MLB99999999?wid=MLB123456789',{},[
    ['/description',{plain_text:''}],['api.mercadolibre.com/items/MLB123456789',{id:'MLB123456789',title:'Vendedor correto',currency_id:'BRL',status:'active',price:35}]]);
  assert.equal(data.productId,'MLB123456789');assert.equal(data.complete,true);
});
test('catalogue without seller never uses recommendation IDs',async()=>{
  const data=await run('https://www.mercadolivre.com.br/produto/p/MLB99999999',{},[
    ['mercadolivre.com.br','<title>Produto</title><script>{"item_id":"MLB123456789"}</script>']]);
  assert.equal(data.productId,'');assert.equal(data.complete,false);assert.equal(data.issueCode,'ML_ITEM_ID_REQUIRED');
});
for(const [status,code] of [[401,'ML_AUTH_REQUIRED'],[403,'ML_ACCESS_DENIED'],[404,'ML_ITEM_NOT_FOUND'],[429,'ML_RATE_LIMIT'],[500,'ML_API_UNAVAILABLE']]){
  test(`Mercado Livre ${status} has a useful diagnostic and no price`,async()=>{
    const data=await run('https://produto.mercadolivre.com.br/MLB-123456789-produto',{},[['api.mercadolibre.com',new Response('{}',{status})]]);
    assert.equal(data.issueCode,code);assert.equal(data.newPrice,'');assert.equal(data.complete,false);
  });
}
test('short Mercado Livre links resolve to the correct seller',async()=>{
  const data=await run('https://meli.la/exemplo',{},[
    ['meli.la',new Response(null,{status:302,headers:{location:'https://produto.mercadolivre.com.br/MLB-123456789-produto'}})],
    ['/description',{plain_text:''}],['api.mercadolibre.com/items/',{id:'MLB123456789',title:'Produto',currency_id:'BRL',status:'active',price:25}],['mercadolivre.com.br','<title>Produto</title>']]);
  assert.equal(data.newPrice,'25,00');assert.equal(data.affiliateUrl,'https://meli.la/exemplo');
});
test('unavailable item is blocked',async()=>{
  const data=await run('https://produto.mercadolivre.com.br/MLB-123456789-produto',{},[['api.mercadolibre.com/items/',{id:'MLB123456789',title:'Produto',currency_id:'BRL',status:'paused',price:25}]]);
  assert.equal(data.issueCode,'ML_ITEM_UNAVAILABLE');assert.equal(data.complete,false);
});
test('Mercado Livre out of stock is blocked',async()=>{
 const data=await run('https://produto.mercadolivre.com.br/MLB-123456789-produto',{},[['api.mercadolibre.com/items/',{id:'MLB123456789',title:'Produto',currency_id:'BRL',status:'active',available_quantity:0,price:25}]]);
 assert.equal(data.complete,false);assert.equal(data.newPrice,'');
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

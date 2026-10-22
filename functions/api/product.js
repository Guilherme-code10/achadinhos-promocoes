const ALLOWED_HOSTS = [
  'shopee.com.br',
  's.shopee.com.br',
  'shope.ee',
  'mercadolivre.com.br',
  'mercadolivre.com',
  'mercadolibre.com',
  'meli.la'
];

function isAllowedHost(hostname=''){
  const h=hostname.toLowerCase().replace(/^www\./,'');
  return ALLOWED_HOSTS.some(base => h===base || h.endsWith('.'+base));
}
function platformFromUrl(url=''){
  try{
    const h=new URL(url).hostname.toLowerCase();
    if(h.includes('shopee') || h==='shope.ee' || h.endsWith('.shope.ee')) return 'SHOPEE';
    if(h.includes('mercadolivre') || h.includes('mercadolibre') || h==='meli.la' || h.endsWith('.meli.la')) return 'MERCADO LIVRE';
  }catch{}
  return '';
}
function decodeHtml(value=''){
  return String(value)
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'")
    .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
}
function clean(value=''){
  return decodeHtml(String(value)
    .replace(/<[^>]*>/g,' ')
    .replace(/\\u0026/g,'&')
    .replace(/\\u003c/gi,'<')
    .replace(/\\u003e/gi,'>')
    .replace(/\\u0022/g,'"')
    .replace(/\\n/g,' ')
    .replace(/\s+/g,' ')
    .trim());
}
function meta(html,name){
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const a=new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,`i`).exec(html);
  const b=new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]*>`,`i`).exec(html);
  return a?.[1] || b?.[1] || '';
}
function anyMeta(html,names){for(const n of names){const v=meta(html,n);if(v)return clean(v)}return ''}
function titleTag(html){const m=/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);return m?clean(m[1]):''}
function canonical(html){
  const m=/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i.exec(html)
    || /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/i.exec(html);
  return m?.[1] || '';
}
function numeric(value){
  if(value===null || value===undefined || value==='') return NaN;
  if(typeof value==='number') return value;
  let s=String(value).trim().replace(/R\$|BRL/gi,'').replace(/\s/g,'');
  if(/^\d{1,3}(\.\d{3})*,\d+$/.test(s)) s=s.replace(/\./g,'').replace(',','.');
  else if(/^\d+,\d+$/.test(s)) s=s.replace(',','.');
  else s=s.replace(/[^0-9.-]/g,'');
  const n=Number(s);
  return Number.isFinite(n)?n:NaN;
}
function normalizeShopeeNumber(value){
  let n=numeric(value);
  if(!Number.isFinite(n)) return NaN;
  // Valores internos da Shopee costumam vir multiplicados por 100000.
  if(Number.isInteger(n) && n>=1000000) n=n/100000;
  return n;
}
function formatPrice(value){
  const n=numeric(value);
  return Number.isFinite(n)&&n>0?n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'';
}
function formatShopeePrice(value){
  const n=normalizeShopeeNumber(value);
  return Number.isFinite(n)&&n>0?n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'';
}
function discountText(oldValue,newValue,explicit=''){
  if(explicit){
    const n=numeric(explicit);
    if(Number.isFinite(n)&&n>0){
      const pct=n>0&&n<1?n*100:n;
      if(pct<=100) return `${Math.round(pct)}% OFF`;
    }
    if(/%/.test(String(explicit))) return String(explicit).trim().replace(/\s*off/i,'')+' OFF';
  }
  const a=numeric(oldValue), b=numeric(newValue);
  return a>0 && b>=0 && b<a ? `${Math.round((1-b/a)*100)}% OFF` : '';
}
function calcOldFromDiscount(newValue,discount){
  const p=numeric(newValue), d=numeric(discount);
  const rate=d>0&&d<1?d:(d>0&&d<100?d/100:NaN);
  if(p>0 && Number.isFinite(rate) && rate>0 && rate<1) return formatPrice(p/(1-rate));
  return '';
}
function jsonLdProducts(html){
  const out=[];
  for(const block of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{
      const data=JSON.parse(block[1].trim());
      const walk=x=>{
        if(!x||typeof x!=='object')return;
        if(Array.isArray(x)){x.forEach(walk);return}
        if(x['@graph']) walk(x['@graph']);
        const types=Array.isArray(x['@type'])?x['@type']:[x['@type']];
        if(types.includes('Product')) out.push(x);
        if(x.itemListElement) walk(x.itemListElement);
      };
      walk(data);
    }catch{}
  }
  return out;
}
function pickJsonProduct(items){
  for(const p of items){
    const offer=Array.isArray(p.offers)?p.offers[0]:p.offers||{};
    const price=offer.price ?? offer.lowPrice ?? p.price;
    const image=Array.isArray(p.image)?p.image[0]:p.image;
    if(p.name||price||image||p.description){
      return {title:clean(p.name||''),description:clean(p.description||''),image:image||'',newPrice:formatPrice(price),oldPrice:''};
    }
  }
  return {title:'',description:'',image:'',newPrice:'',oldPrice:''};
}
function collectVisiblePrices(html){
  const found=[];
  const add=v=>{const p=formatPrice(v);if(p&&!found.includes(p))found.push(p)};
  for(const m of html.matchAll(/(?:R\$|BRL)\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?)/gi)) add(m[1]);
  for(const key of ['salePrice','currentPrice','priceValue','originalPrice','oldPrice','listPrice']){
    const re=new RegExp(`"${key}"\\s*:\\s*"?([0-9]+(?:\\.[0-9]+)?)"?`,'gi');
    for(const m of html.matchAll(re)) add(m[1]);
  }
  return found;
}
function genericHtmlData(html){
  const json=pickJsonProduct(jsonLdProducts(html));
  const title=json.title || anyMeta(html,['og:title','twitter:title','product:name']) || titleTag(html);
  const image=json.image || anyMeta(html,['og:image','twitter:image','image']) || '';
  const description=json.description || anyMeta(html,['description','og:description','twitter:description']) || '';
  const metaPrice=anyMeta(html,['product:price:amount','og:price:amount','price','product:price']) || json.newPrice;
  const newPrice=formatPrice(metaPrice || json.newPrice || '');
  const oldPrice='';
  return {title,description,image,newPrice,oldPrice,referencePrice:oldPrice};
}
function extractMercadoLivreId(url='',html=''){
  const hay=[url,canonical(html),html.slice(0,400000)].join(' ');
  const patterns=[/\b(MLB[-_]?(\d{6,}))\b/i,/\/p\/(MLB\d{6,})\b/i,/item[_-]?id["'=:\s]+["']?(MLB\d{6,})/i];
  for(const re of patterns){
    const m=re.exec(hay); if(m) return (m[1]||'').replace(/[-_]/g,'').toUpperCase();
  }
  return '';
}
function extractShopeeIds(url='',html=''){
  const hay=[url,canonical(html),html.slice(0,500000)].join(' ');
  const patterns=[
    /-i\.(\d+)\.(\d+)/i,
    /\/product\/(\d+)\/(\d+)/i,
    /[?&]shopid=(\d+).*?[?&]itemid=(\d+)/i,
    /"shopid"\s*:\s*(\d+)[\s\S]{0,500}?"itemid"\s*:\s*(\d+)/i,
    /"shop_id"\s*:\s*(\d+)[\s\S]{0,500}?"item_id"\s*:\s*(\d+)/i
  ];
  for(const re of patterns){const m=re.exec(hay);if(m)return {shopId:m[1],itemId:m[2]}}
  const item=/"itemid"\s*:\s*(\d+)/i.exec(hay)||/"item_id"\s*:\s*(\d+)/i.exec(hay);
  const shop=/"shopid"\s*:\s*(\d+)/i.exec(hay)||/"shop_id"\s*:\s*(\d+)/i.exec(hay);
  return {shopId:shop?.[1]||'',itemId:item?.[1]||''};
}
function shopeeEmbeddedData(html){
  const generic=genericHtmlData(html);
  const value=(keys,transform=x=>x)=>{
    for(const key of keys){
      const re=new RegExp(`"${key}"\\s*:\\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|(-?[0-9]+(?:\\.[0-9]+)?))`,'i');
      const m=re.exec(html); if(m){const raw=m[1]??m[2];const v=transform(raw);if(v)return v}
    }
    return '';
  };
  const title=generic.title || value(['name','product_name','productName'],clean);
  const image=generic.image || value(['image','image_url','imageUrl'],v=>{
    const s=clean(v); if(/^https?:\/\//i.test(s))return s;
    if(/^[a-f0-9]{20,}$/i.test(s))return `https://down-br.img.susercontent.com/file/${s}`;
    return '';
  });
  const newPrice=generic.newPrice || value(['price_min','price','priceMin'],formatShopeePrice);
  const oldPrice=generic.oldPrice || value(['price_before_discount','priceBeforeDiscount','original_price'],formatShopeePrice);
  const discount=value(['raw_discount','discount','priceDiscountRate'],v=>discountText('',newPrice,v));
  return {...generic,title,image,newPrice,oldPrice:oldPrice||calcOldFromDiscount(newPrice,discount),referencePrice:oldPrice||calcOldFromDiscount(newPrice,discount),discount};
}
async function fetchPage(input){
  let current=new URL(input);
  if(!['http:','https:'].includes(current.protocol) || !isAllowedHost(current.hostname)) throw new Error('Use um link da Shopee ou Mercado Livre.');
  let response=null;
  for(let i=0;i<6;i++){
    response=await fetch(current.toString(),{
      redirect:'manual',
      headers:{
        'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        'accept':'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'accept-language':'pt-BR,pt;q=0.9,en;q=0.8'
      }
    });
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location');
      if(!location)break;
      const next=new URL(location,current);
      if(!['http:','https:'].includes(next.protocol)) throw new Error('Redirecionamento inválido.');
      // Permite a cadeia oficial/curta apenas quando continua nas plataformas suportadas.
      if(!isAllowedHost(next.hostname)) throw new Error('O link redirecionou para um domínio não suportado.');
      current=next; continue;
    }
    break;
  }
  if(!response) throw new Error('Não foi possível abrir o link.');
  const html=await response.text();
  return {html,finalUrl:current.toString(),status:response.status};
}
async function mercadoLivreApi(itemId,env){
  if(!itemId) return null;
  const headers={'accept':'application/json'};
  if(env.ML_ACCESS_TOKEN) headers.authorization=`Bearer ${env.ML_ACCESS_TOKEN}`;
  const r=await fetch(`https://api.mercadolibre.com/items/${encodeURIComponent(itemId)}`,{headers});
  if(!r.ok) return null;
  const item=await r.json();
  if(item.id!==itemId || item.currency_id!=='BRL' || item.status!=='active') return null;
  let description='';
  try{
    const dr=await fetch(`https://api.mercadolibre.com/items/${encodeURIComponent(itemId)}/description`,{headers});
    if(dr.ok){const d=await dr.json();description=clean(d.plain_text||'')}
  }catch{}
  const image=item.pictures?.[0]?.secure_url || item.thumbnail || '';
  const newPrice=formatPrice(item.price);
  const oldPrice=numeric(item.original_price)>numeric(item.price)?formatPrice(item.original_price):'';
  return {
    title:clean(item.title||item.family_name||''),
    description,
    image,
    newPrice,
    oldPrice,
    referencePrice:oldPrice,
    discount:discountText(oldPrice,newPrice),
    productId:item.id||itemId,
    sourceMethod:'API Mercado Livre'
  };
}
async function sha256Hex(text){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function shopeeAffiliateApi(itemId,shopId,env){
  if(!itemId || !env.SHOPEE_APP_ID || !env.SHOPEE_SECRET) return null;
  const args=[`itemId: ${Number(itemId)}`];
  if(shopId) args.push(`shopId: ${Number(shopId)}`);
  args.push('page: 1','limit: 5');
  const query=`{ productOfferV2(${args.join(', ')}) { nodes { itemId productName productLink offerLink imageUrl priceMin priceMax priceDiscountRate shopId shopName } } }`;
  const payload=JSON.stringify({query});
  const timestamp=Math.floor(Date.now()/1000).toString();
  const signature=await sha256Hex(`${env.SHOPEE_APP_ID}${timestamp}${payload}${env.SHOPEE_SECRET}`);
  const r=await fetch('https://open-api.affiliate.shopee.com.br/graphql',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'authorization':`SHA256 Credential=${env.SHOPEE_APP_ID}, Timestamp=${timestamp}, Signature=${signature}`
    },
    body:payload
  });
  if(!r.ok) return null;
  const body=await r.json();
  const nodes=body?.data?.productOfferV2?.nodes||[];
  const node=nodes.find(x=>String(x.itemId)===String(itemId) && (!shopId || String(x.shopId)===String(shopId)));
  if(!node) return null;
  const newPrice=formatPrice(node.priceMin);
  const discount=discountText('',newPrice,node.priceDiscountRate);
  const oldPrice='';
  return {
    title:clean(node.productName||''),
    description:'',
    image:node.imageUrl||'',
    newPrice,
    oldPrice,
    referencePrice:oldPrice,
    discount,
    productId:String(node.itemId||itemId),
    shopId:String(node.shopId||shopId||''),
    shopName:clean(node.shopName||''),
    offerLink:node.offerLink||'',
    priceMax:formatPrice(node.priceMax),
    sourceMethod:'API de Afiliados Shopee'
  };
}
function merge(primary,fallback){
  const out={};
  for(const key of new Set([...Object.keys(fallback||{}),...Object.keys(primary||{})])) out[key]=(primary?.[key]!==undefined&&primary?.[key]!==''&&primary?.[key]!==null)?primary[key]:fallback?.[key];
  return out;
}
function compactDescription(desc,title){
  let d=clean(desc||'');
  if(!d) return '';
  d=d.replace(/\s*[|•-]\s*(Shopee Brasil|Mercado Livre).*$/i,'').trim();
  if(d.toLowerCase()===clean(title).toLowerCase())return '';
  return d.length>240?d.slice(0,237).trim()+'...':d;
}

export async function onRequestGet({request,env}){
  const originalUrl=new URL(request.url).searchParams.get('url');
  if(!originalUrl) return Response.json({error:'Informe um link.'},{status:400});
  let input;
  try{input=new URL(originalUrl)}catch{return Response.json({error:'Link inválido.'},{status:400})}
  if(!['http:','https:'].includes(input.protocol) || !isAllowedHost(input.hostname)) return Response.json({error:'Cole um link da Shopee ou do Mercado Livre.'},{status:400});

  try{
    const page=await fetchPage(input.toString());
    const p=platformFromUrl(page.finalUrl)||platformFromUrl(input.toString());
    const htmlData=genericHtmlData(page.html);
    let data={...htmlData,sourceMethod:'Metadados da página'};

    if(p==='MERCADO LIVRE'){
      const itemId=extractMercadoLivreId(page.finalUrl,page.html);
      const api=await mercadoLivreApi(itemId,env).catch(()=>null);
      if(api) data={...merge(api,data),newPrice:api.newPrice,oldPrice:api.oldPrice,referencePrice:api.referencePrice,discount:api.discount};
      data.productId=data.productId||itemId;
    }else if(p==='SHOPEE'){
      const ids=extractShopeeIds(page.finalUrl,page.html);
      const api=await shopeeAffiliateApi(ids.itemId,ids.shopId,env).catch(()=>null);
      if(api) data={...merge(api,data),newPrice:api.newPrice,oldPrice:api.oldPrice,referencePrice:api.referencePrice,discount:api.discount};
      data.productId=data.productId||ids.itemId;
      data.shopId=data.shopId||ids.shopId;
    }

    const apiPrice=Boolean(data.sourceMethod.startsWith('API') && data.newPrice);
    const priceRange=p==='SHOPEE' && numeric(data.priceMax)>numeric(data.newPrice);
    // HTML can include recommendations, installments and unrelated product prices.
    // Preserve descriptive metadata, but do not publish these prices as confirmed.
    if(!apiPrice){
      data.newPrice=''; data.oldPrice=''; data.referencePrice=''; data.discount='';
    }
    data.description=compactDescription(data.description,data.title);
    data.referencePrice=data.referencePrice||data.oldPrice||'';
    data.discount=data.discount||discountText(data.referencePrice||data.oldPrice,data.newPrice);
    const complete=Boolean(data.title && data.newPrice);

    return Response.json({
      platform:p,
      title:data.title||'',
      description:data.description||'',
      image:data.image||'',
      oldPrice:data.oldPrice||'',
      newPrice:data.newPrice||'',
      referencePrice:data.referencePrice||'',
      discount:data.discount||'',
      affiliateUrl:originalUrl,
      resolvedUrl:page.finalUrl,
      productId:data.productId||'',
      shopName:data.shopName||'',
      sourceMethod:data.sourceMethod||'Leitura automática',
      complete,
      priceStatus:apiPrice?(priceRange?'range':'api_observed'):'unconfirmed',
      priceCheckedAt:apiPrice?new Date().toISOString():null,
      priceMax:data.priceMax||'',
      requiresReview:true,
      warning:apiPrice?(priceRange?'Preço mínimo entre variações. Confira o modelo antes de divulgar.':'Preço consultado na API. Confira variação, pagamento e cupons antes de divulgar.'):'Preço não confirmado pela API. Revise o produto na loja.',
      error:complete?'':'Consegui abrir o link, mas a loja não entregou todos os dados automaticamente.',
      shopeeApiConfigured:Boolean(env.SHOPEE_APP_ID&&env.SHOPEE_SECRET)
    },{headers:{'cache-control':'no-store'}});
  }catch(e){
    return Response.json({error:e?.message||'Não foi possível ler esse produto automaticamente.'},{status:422,headers:{'cache-control':'no-store'}});
  }
}


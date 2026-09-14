const $ = (id) => document.getElementById(id);
const state = { platform:'', image:'', data:null, requestId:0 };

function money(v){
  if(v===null || v===undefined || v==='') return '';
  const s=String(v).trim();
  if(/^R\$\s?/.test(s)) return s.replace(/^R\$\s?/, 'R$ ');
  let normalized=s.replace(/[^0-9,.-]/g,'');
  if(/^\d{1,3}(\.\d{3})*,\d+$/.test(normalized)) normalized=normalized.replace(/\./g,'').replace(',','.');
  else if(/^\d+,\d+$/.test(normalized)) normalized=normalized.replace(',','.');
  const n=Number(normalized);
  return Number.isFinite(n) ? n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : s;
}
function parseNumber(v){
  let s=String(v||'').replace(/R\$|BRL/gi,'').replace(/\s/g,'');
  if(/^\d{1,3}(\.\d{3})*,\d+$/.test(s)) s=s.replace(/\./g,'').replace(',','.');
  else if(/^\d+,\d+$/.test(s)) s=s.replace(',','.');
  else s=s.replace(/[^0-9.-]/g,'');
  const n=Number(s);
  return Number.isFinite(n)?n:NaN;
}
function calcDiscount(oldP,newP){
  const a=parseNumber(oldP), b=parseNumber(newP);
  return a>0 && b>=0 && b<a ? `${Math.round((1-b/a)*100)}% OFF` : '';
}
function buildMessage(){
  const d=state.data||{};
  const title=(d.title||'Produto em oferta').trim();
  const description=(d.description||'').trim();
  const reference=money(d.referencePrice||d.oldPrice||'');
  const newP=money(d.newPrice||'');
  const disc=(d.discount||calcDiscount(d.referencePrice||d.oldPrice,d.newPrice)).trim();
  const link=(d.affiliateUrl||$('productUrl').value.trim());
  const lines=['🔥🔥 ACHADINHO DO DIA 🔥🔥','','Olha esse preço! 😱','',`📦 ${title}`,''];
  if(description) lines.push(description,'');
  if(reference && parseNumber(reference)>parseNumber(newP)) lines.push(`💵 De: ${reference}`);
  if(newP) lines.push(`🔥 Na promoção: ${newP}`);
  if(disc) lines.push(`🏷️ ${disc}`);
  lines.push('','🛒 COMPRE AQUI 👇',link);
  $('offerText').value=lines.join('\n');
}
function setStatus(text,type=''){
  $('mainStatus').textContent=text||'';
  $('mainStatus').className=`status-text${type?' '+type:''}`;
}
function setData(d){
  state.data=d;
  state.platform=d.platform||'';
  state.image=d.image||'';
  $('platformBadge').textContent=d.platform||'';
  $('platformBadge').classList.toggle('hidden',!d.platform);
  $('sourceBadge').textContent=d.sourceMethod||'Leitura automática';
  $('productTitle').textContent=d.title||'Produto encontrado';
  $('productDescription').textContent=d.description||'Descrição não informada pela loja.';
  $('oldPrice').textContent=money(d.referencePrice||d.oldPrice)||'—';
  $('newPrice').textContent=money(d.newPrice)||'—';
  $('discount').textContent=d.discount||calcDiscount(d.referencePrice||d.oldPrice,d.newPrice)||'—';
  $('productImage').src=d.image||'/assets/logo.png';
  $('productImage').onerror=()=>{$('productImage').src='/assets/logo.png'};
  $('shopName').textContent=d.shopName?`Loja: ${d.shopName}`:'';
  $('shopName').classList.toggle('hidden',!d.shopName);
  $('productId').textContent=d.productId?`ID: ${d.productId}`:'';
  $('productId').classList.toggle('hidden',!d.productId);
  const warning=!d.complete ? (d.error||'A loja não retornou todos os dados dessa oferta.') : '';
  $('autoWarning').textContent=warning;
  $('autoWarning').classList.toggle('hidden',!warning);
  buildMessage();
}
function looksLikeSupportedUrl(value){
  try{
    const u=new URL(value);
    const h=u.hostname.toLowerCase();
    return h.includes('shopee') || h.includes('mercadolivre') || h.includes('mercadolibre') || h==='shope.ee' || h.endsWith('.shope.ee') || h==='meli.la' || h.endsWith('.meli.la');
  }catch{return false}
}
async function generate(){
  const url=$('productUrl').value.trim();
  if(!url){$('productUrl').focus();return}
  try{new URL(url)}catch{setStatus('Cole um link válido.','error');$('productUrl').focus();return}
  const requestId=++state.requestId;
  $('loading').classList.remove('hidden');
  $('offerSection').classList.add('hidden');
  $('copyStatus').textContent='';
  setStatus('');
  $('generateBtn').disabled=true;
  $('generateBtn').textContent='Lendo...';
  try{
    const r=await fetch('/api/product?url='+encodeURIComponent(url),{headers:{'accept':'application/json'}});
    const d=await r.json().catch(()=>({}));
    if(requestId!==state.requestId)return;
    if(!r.ok) throw new Error(d.error||'Não foi possível buscar o produto.');
    setData(d);
    $('offerSection').classList.remove('hidden');
    if(d.complete) setStatus('Pronto! Produto lido e legenda gerada automaticamente.','success');
    else setStatus('O produto foi aberto, mas faltaram alguns dados automáticos.','warning');
  }catch(e){
    if(requestId!==state.requestId)return;
    $('offerSection').classList.add('hidden');
    setStatus(e.message||'Não foi possível ler esse produto.','error');
  }finally{
    if(requestId===state.requestId){
      $('loading').classList.add('hidden');
      $('generateBtn').disabled=false;
      $('generateBtn').textContent='Gerar oferta';
    }
  }
}
async function copyOffer(){
  buildMessage();
  try{
    await navigator.clipboard.writeText($('offerText').value);
    $('copyStatus').textContent='Oferta copiada. Agora é só colar no grupo do WhatsApp.';
  }catch{
    $('offerText').select(); document.execCommand('copy'); $('copyStatus').textContent='Oferta copiada.';
  }
  setTimeout(()=>$('copyStatus').textContent='',3500);
}
function openWhatsApp(){
  buildMessage();
  window.open('https://wa.me/?text='+encodeURIComponent($('offerText').value),'_blank','noopener,noreferrer');
}
function downloadArt(){
  const d=state.data||{};
  const canvas=document.createElement('canvas'); canvas.width=1080; canvas.height=1350; const c=canvas.getContext('2d');
  c.fillStyle='#f7faf9'; c.fillRect(0,0,canvas.width,canvas.height);
  c.fillStyle='#075f61'; c.fillRect(0,0,canvas.width,250);
  const logo=new Image(); logo.onload=()=>{c.save();c.beginPath();c.arc(950,125,72,0,Math.PI*2);c.clip();c.drawImage(logo,878,53,144,144);c.restore();drawHeader()}; logo.onerror=drawHeader; logo.src='/assets/logo.png';
  function drawHeader(){
    c.fillStyle='#fff'; c.font='bold 58px Georgia'; c.fillText('ACHADINHO DO DIA',70,105); c.font='34px Arial'; c.fillText('Ofertas que valem a pena!',70,165);
    const img=new Image(); img.crossOrigin='anonymous'; img.onload=()=>{const maxW=850,maxH=600; const ratio=Math.min(maxW/img.width,maxH/img.height); const w=img.width*ratio,h=img.height*ratio; c.fillStyle='#fff'; roundRect(c,70,300,940,650,28,true); c.drawImage(img,540-w/2,625-h/2,w,h); drawText();}; img.onerror=()=>drawText(); img.src=state.image ? '/api/image?url='+encodeURIComponent(state.image) : '/assets/logo.png';
  }
  function drawText(){
    c.fillStyle='#173235';c.font='bold 39px Arial';wrap(c,d.title||'Produto em oferta',70,1015,940,48);
    const desc=(d.description||'').trim(); if(desc){c.fillStyle='#687778';c.font='25px Arial';wrap(c,desc,70,1095,940,34)}
    const ref=money(d.referencePrice||d.oldPrice); if(ref){c.fillStyle='#c9a85d';c.font='bold 42px Arial';c.fillText(`De: ${ref}`,70,1175)}
    const price=money(d.newPrice)||'Confira o preço'; c.fillStyle='#075f61';c.font='bold 46px Arial';c.fillText(`Hoje: ${price}`,70,1230);
    const disc=d.discount||calcDiscount(d.referencePrice||d.oldPrice,d.newPrice); if(disc){c.fillStyle='#075f61';c.font='bold 31px Arial';c.fillText(disc,70,1270)}
    c.fillStyle='#687778';c.font='24px Arial';c.fillText('Achadinhos & Promoções',70,1315);
    const a=document.createElement('a');a.download='oferta-achadinhos-promocoes.png';a.href=canvas.toDataURL('image/png');a.click();
  }
  function wrap(ctx,text,x,y,maxWidth,lineHeight){let words=String(text).split(/\s+/),line='';for(const word of words){const test=line+word+' ';if(ctx.measureText(test).width>maxWidth&&line){ctx.fillText(line,x,y);line=word+' ';y+=lineHeight}else line=test}if(line)ctx.fillText(line,x,y)}
  function roundRect(ctx,x,y,w,h,r,fill){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill)ctx.fill()}
}

let pasteTimer;
$('generateBtn').addEventListener('click',generate);
$('productUrl').addEventListener('keydown',e=>{if(e.key==='Enter')generate()});
$('productUrl').addEventListener('paste',()=>{
  clearTimeout(pasteTimer);
  pasteTimer=setTimeout(()=>{if(looksLikeSupportedUrl($('productUrl').value.trim()))generate()},120);
});
$('copyBtn').addEventListener('click',copyOffer);
$('openWhatsAppBtn').addEventListener('click',openWhatsApp);
$('downloadBtn').addEventListener('click',downloadArt);
$('logoutBtn').addEventListener('click',async()=>{await fetch('/api/logout',{method:'POST'});location.href='/login.html'});

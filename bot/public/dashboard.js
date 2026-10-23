const $=id=>document.getElementById(id);
let state=null,candidate=null,requestVersion=0,refreshing=false;
const labels={queued:'Agendada',checking:'Consultando',sending:'Enviando',uncertain:'Conferir envio',blocked:'Revisão',simulated:'Simulada',sent:'Enviada',cancelled:'Cancelada'};
const money=n=>(n/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=n=>new Date(n).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
function feedback(text){$('feedback').textContent=text;}
async function api(path,data){
 const r=await fetch(path,data===undefined?{cache:'no-store'}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
 const value=await r.json();if(!r.ok){if(r.status===401){$('login').hidden=false;$('app').hidden=true;}throw Error(value.error||'Operação falhou.');}return value;
}
async function refresh(){if(refreshing)return;refreshing=true;try{state=await api('/api/status');$('login').hidden=true;$('app').hidden=false;render();}catch(e){if(!$('app').hidden)feedback(e.message);}finally{refreshing=false;}}
function render(){
 const jobs=state.jobs;
 $('queued').textContent=jobs.filter(j=>['queued','checking'].includes(j.status)).length;
 $('simulated').textContent=jobs.filter(j=>j.status==='simulated').length;
 $('blocked').textContent=jobs.filter(j=>['blocked','uncertain','sending'].includes(j.status)).length;
 $('run-status').textContent=state.paused?'Robô pausado':'Simulação em andamento';
 $('run-dot').classList.toggle('active',!state.paused);$('toggle').textContent=state.paused?'Retomar simulação':'Pausar robô';
 $('updated').textContent='Última atualização: '+date(Date.now());
 $('rows').replaceChildren();const filtered=jobs.filter(j=>$('filter').value==='all'||j.status===$('filter').value);
 $('empty').hidden=filtered.length>0;
 for(const j of filtered){
  const tr=document.createElement('tr'),product=document.createElement('td');
  const a=document.createElement('a');a.textContent=j.product_id;a.href=j.url;a.target='_blank';a.rel='noopener noreferrer';product.append(a);
  const host=document.createElement('small');try{host.textContent=new URL(j.url).hostname;}catch{host.textContent='Link inválido';}product.append(host);tr.append(product);
  for(const text of [money(j.price_cents),date(j.due_at)]){const td=document.createElement('td');td.textContent=text;tr.append(td);}
  const status=document.createElement('td'),badge=document.createElement('span');badge.className='status '+j.status;badge.textContent=labels[j.status]||j.status;status.append(badge);
  if(j.reason){const reason=document.createElement('small');reason.textContent=j.reason;status.append(reason);}tr.append(status);
  const actions=document.createElement('td');if(['queued','checking','blocked','simulated'].includes(j.status)){const b=document.createElement('button');b.className='secondary';b.textContent='Cancelar';b.onclick=async()=>{b.disabled=true;try{await api('/api/cancel',{id:j.id});await refresh();}catch(e){feedback(e.message);b.disabled=false;}};actions.append(b);}tr.append(actions);$('rows').append(tr);
 }
 $('events').replaceChildren();for(const e of state.events.slice(0,15)){const li=document.createElement('li'),time=document.createElement('time'),text=document.createElement('span');time.dateTime=new Date(e.at).toISOString();time.textContent=date(e.at);text.textContent=e.event;li.append(time,text);$('events').append(li);}
 if(!state.events.length){const li=document.createElement('li');li.textContent='As atividades aparecerão aqui quando você começar.';$('events').append(li);}
}
$('login-form').onsubmit=async e=>{e.preventDefault();$('login-error').textContent='';try{await api('/api/login',{password:$('password').value});$('password').value='';await refresh();}catch(err){$('login-error').textContent=err.message;}};
$('logout').onclick=async()=>{try{await api('/api/logout',{});$('app').hidden=true;$('login').hidden=false;state=null;candidate=null;$('schedule-form').hidden=true;}catch(e){feedback(e.message);}};
$('filter').onchange=()=>state&&render();
$('toggle').onclick=async()=>{if(!state)return;$('toggle').disabled=true;try{await api('/api/pause',{paused:!state.paused});await refresh();}catch(e){feedback(e.message);}finally{$('toggle').disabled=false;}};
$('process').onclick=async()=>{$('process').disabled=true;try{const r=await api('/api/process',{});feedback(r.status==='paused'?'Retome a simulação antes de testar.':r.status==='idle'?'Nenhuma oferta chegou ao horário agendado.':r.status==='busy'?'Uma consulta está em andamento.':'Processamento concluído: '+(labels[r.status]||r.status));await refresh();}catch(e){feedback(e.message);}finally{$('process').disabled=false;}};
$('url').oninput=()=>{requestVersion++;candidate=null;$('schedule-form').hidden=true;};
$('lookup-form').onsubmit=async e=>{
 e.preventDefault();const version=++requestVersion;candidate=null;$('schedule-form').hidden=true;$('lookup').disabled=true;$('lookup-status').textContent='Consultando a loja…';
 try{const p=await api('/api/lookup',{url:$('url').value.trim()});if(version!==requestVersion)return;
  if(!p.complete||p.priceStatus!=='api_observed'){throw Error(p.warning||p.error||'Preço ainda não confirmado.');}
  candidate=p;$('product-title').textContent=p.title;$('product-store').textContent=p.platform||'';$('product-price').textContent='R$ '+p.newPrice;$('product-warning').textContent=p.warning||'Confira as condições do preço na loja.';
  const img=$('product-image');img.hidden=true;try{if(new URL(p.image).protocol==='https:'){img.src=p.image;img.hidden=false;img.onerror=()=>img.hidden=true;}}catch{}
  $('approve').checked=false;$('schedule-form').hidden=false;$('lookup-status').textContent='Produto consultado. O preço será conferido novamente no horário agendado.';
  const t=new Date(Date.now()+5*60000);t.setMinutes(t.getMinutes()-t.getTimezoneOffset());$('due').value=t.toISOString().slice(0,16);
 }catch(err){if(version===requestVersion)$('lookup-status').textContent=err.message;}finally{$('lookup').disabled=false;}
};
$('schedule-form').onsubmit=async e=>{
 e.preventDefault();if(!candidate||!$('approve').checked)return;$('schedule').disabled=true;
 try{await api('/api/jobs',{url:candidate.affiliateUrl,productId:candidate.productId,price:candidate.newPrice,dueAt:new Date($('due').value).toISOString()});feedback('Oferta adicionada à fila de simulação.');candidate=null;$('schedule-form').hidden=true;$('url').value='';$('lookup-status').textContent='';await refresh();}catch(err){feedback(err.message);}finally{$('schedule').disabled=false;}
};
refresh();setInterval(()=>{if(!$('app').hidden)refresh();},5000);

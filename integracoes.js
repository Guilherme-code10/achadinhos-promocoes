async function load(){
 try{
  const r=await fetch('/api/integrations',{cache:'no-store'});
  if(r.status===401){location.href='/login.html';return;}
  if(!r.ok)throw new Error('Não foi possível consultar as integrações.');
  const d=await r.json();
  document.getElementById('meli').textContent=!d.meli.configured?'Configuração pendente na hospedagem.':d.meli.connected?(d.meli.expiresAt>Date.now()?'Autorização salva. O acesso aos anúncios será verificado na consulta.':'Autorização salva; a próxima consulta tentará renovar o acesso.'):'Pronto para conectar sua conta.';
  if(d.meli.manualToken&&!d.meli.connected)document.getElementById('meli').textContent+=' Existe um token manual, sem renovação automática.';
  document.getElementById('connect').disabled=!d.meli.configured;
  document.getElementById('connect').textContent=d.meli.connected?'Reconectar Mercado Livre':'Conectar Mercado Livre';
  document.getElementById('shopee').textContent=d.shopee.configured?'Credenciais cadastradas. A consulta de um produto confirma se estão válidas.':'Credenciais ainda não cadastradas.';
 }catch(e){document.getElementById('error').textContent=e.message;}
}
load();

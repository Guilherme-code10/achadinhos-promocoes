async function sign(value, secret){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
export async function onRequestPost({request,env}){
  const body=await request.json().catch(()=>({}));
  if(!env.APP_PASSWORD || !env.AUTH_SECRET) return Response.json({error:'Configure APP_PASSWORD e AUTH_SECRET no ambiente.'},{status:500});
  if(body.password!==env.APP_PASSWORD) return Response.json({error:'Senha inválida.'},{status:401});
  const payload=btoa(JSON.stringify({exp:Date.now()+1000*60*60*24*7})).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  const sig=await sign(payload,env.AUTH_SECRET); const token=payload+'.'+sig;
  return new Response(JSON.stringify({ok:true}),{headers:{'content-type':'application/json','set-cookie':`session=${token}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`}});
}

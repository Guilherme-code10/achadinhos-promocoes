export async function onRequestGet({request}){
  const url=new URL(request.url).searchParams.get('url'); if(!url)return new Response('Missing url',{status:400});
  try{const u=new URL(url); const r=await fetch(u.toString(),{headers:{'user-agent':'Mozilla/5.0','accept':'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'}}); if(!r.ok)return new Response('Image unavailable',{status:502}); const headers=new Headers(r.headers); headers.set('access-control-allow-origin','*'); headers.set('cache-control','public, max-age=86400'); return new Response(r.body,{status:r.status,headers});}catch{return new Response('Image unavailable',{status:502})}
}

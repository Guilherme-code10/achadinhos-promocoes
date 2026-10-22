import {configured,noStore} from '../../lib/meli.mjs';
export async function onRequestGet({env}){
  let row=null,storageReady=false;
  if(env.DB){try{row=await env.DB.prepare("SELECT expires_at FROM integration_tokens WHERE provider='meli'").first();storageReady=true;}catch{}}
  return Response.json({meli:{configured:configured(env)&&storageReady,connected:Boolean(row),expiresAt:row?.expires_at||null,manualToken:Boolean(env.ML_ACCESS_TOKEN)},shopee:{configured:Boolean(env.SHOPEE_APP_ID&&env.SHOPEE_SECRET)},whatsapp:{connected:false}}, {headers:noStore});
}

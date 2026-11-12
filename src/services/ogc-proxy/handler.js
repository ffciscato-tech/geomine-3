'use strict';
const endpoints=Object.freeze({
  segemar:'https://sigam.segemar.gov.ar/geoserver217/wfs',
  argentinaAmbiente:'https://geo.ambiente.gob.ar/geoserver/ows',
  argentinaIGN:'https://wms.ign.gob.ar/geoserver/ows',
  geoguyane:'https://datacarto.geoguyane.fr/wfs',
  guyaneSIG:'https://www.guyane-sig.fr/geoserver/wfs',
  uruguayHidro:'https://mapas.ide.uy/geoservicios/WFS/WFS_Uruguay_IDEuy_Hidrografia_Nacional'
});
const allowed=new Set(['SERVICE','VERSION','REQUEST','TYPENAMES','TYPENAME','SRSNAME','COUNT','MAXFEATURES','STARTINDEX','OUTPUTFORMAT','RESULTTYPE']);
function upstream(query){
  const endpoint=endpoints[query.source];if(!endpoint)throw Error('Fonte não permitida');const u=new URL(endpoint);
  for(const [key,v] of Object.entries(query)){if(key==='source')continue;const k=key.toUpperCase();if(!allowed.has(k)||typeof v!=='string'||v.length>500)throw Error('Parâmetro não permitido');u.searchParams.set(k,v);}
  if(u.searchParams.get('SERVICE')!=='WFS'||!['GetCapabilities','GetFeature'].includes(u.searchParams.get('REQUEST')))throw Error('Operação não permitida');
  if(!['2.0.0','1.1.0','1.0.0'].includes(u.searchParams.get('VERSION')))throw Error('Versão não permitida');
  for(const k of ['COUNT','MAXFEATURES'])if(u.searchParams.has(k)&&(!/^\d+$/.test(u.searchParams.get(k))||+u.searchParams.get(k)<1||+u.searchParams.get(k)>100))throw Error('Lote inválido');
  if(u.searchParams.has('STARTINDEX')&&(!/^\d+$/.test(u.searchParams.get('STARTINDEX'))||+u.searchParams.get('STARTINDEX')>1000000))throw Error('Página inválida');
  return u;
}
function createHandler({verify,fetchImpl=fetch}){return async(req,res)=>{
  res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.status(405).send('Método não permitido');return;}
  let user;try{const token=/^Bearer (.+)$/.exec(req.get('Authorization')||'')?.[1];if(!token)throw Error();user=await verify(token);if(!user.email_verified||!/@ccmeng\.net$/i.test(user.email||''))throw Error();}catch{res.status(401).send('Entre no GeoMine com sua conta CCM para baixar os dados');return;}
  let target;try{target=upstream(req.query);}catch(e){res.status(400).send(e.message);return;}
  try{
    const response=await fetchImpl(target,{redirect:'error',signal:AbortSignal.timeout(120000),headers:{Accept:'application/json, application/xml, text/xml'}});
    if(!response.ok){res.status(502).send('O órgão respondeu HTTP '+response.status);return;}
    const reader=response.body.getReader(),chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>30*1024*1024){await reader.cancel();res.status(413).send('A página excedeu o tamanho permitido');return;}chunks.push(Buffer.from(value));}
    res.type(response.headers.get('content-type')||'application/xml');res.status(200).send(Buffer.concat(chunks));
  }catch(e){res.status(502).send('O servidor oficial não respondeu à consulta. Tente novamente');}
};}
module.exports={endpoints,upstream,createHandler};

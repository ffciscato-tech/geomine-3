/* ============================================================================
   LEITOR DE SHAPEFILE (SHP + DBF + PRJ)
   ========================================================================== */
function rd(dv,o){return {i32(p){return dv.getInt32(p,true)},b32(p){return dv.getInt32(p,false)},
  f64(p){return dv.getFloat64(p,true)}};}

const SHP_TYPE = {1:'point',3:'line',5:'polygon',8:'point',11:'point',13:'line',15:'polygon',18:'point'};

function parseSHP(buf){
  const dv = new DataView(buf);
  const shapeType = dv.getInt32(32,true);
  const gtype = SHP_TYPE[shapeType]||'point';
  const feats=[]; let p=100; const len=buf.byteLength;
  while(p+8<=len){
    const recLen = dv.getInt32(p+4,false)*2; // bytes
    let o = p+8;
    const t = dv.getInt32(o,true); o+=4;
    if(t===0){ feats.push({geom:null}); p=o+recLen-4; continue; }
    const recEnd=(p+8)+recLen;                       // p/ ler o bloco Z com segurança
    if(t===1||t===11||t===21){ // point (11 = PointZ)
      const x=dv.getFloat64(o,true), y=dv.getFloat64(o+8,true);
      const f={geom:[[x,y]]};
      if(t===11 && o+24<=recEnd) f.zg=[dv.getFloat64(o+16,true)];  // Z logo após X,Y
      feats.push(f);
    } else if(t===3||t===5||t===13||t===15||t===23||t===25){ // polyline / polygon (13/15 = Z)
      o+=32; // bbox
      const nParts=dv.getInt32(o,true); o+=4;
      const nPts=dv.getInt32(o,true); o+=4;
      const parts=[]; for(let i=0;i<nParts;i++){parts.push(dv.getInt32(o,true));o+=4;}
      const pts=[]; for(let i=0;i<nPts;i++){pts.push([dv.getFloat64(o,true),dv.getFloat64(o+8,true)]);o+=16;}
      const rings=[]; for(let i=0;i<nParts;i++){const a=parts[i],b=(i+1<nParts)?parts[i+1]:nPts;rings.push(pts.slice(a,b));}
      /* Registro DEGENERADO: o tipo diz linha/polígono mas vêm zero partes ou
         zero pontos. Não é o "shape nulo" da especificação (tipo 0) e aparece
         com frequência em bases oficiais. Deixá-lo passar como geometria vazia
         quebrava toda rotina que abre o primeiro anel — era o que derrubava a
         árvore de camadas ao arrastar certos shapefiles. Vira nulo aqui. */
      const uteis=rings.filter(r=>Array.isArray(r)&&r.length);
      if(!uteis.length){ feats.push({geom:null}); p=(p+8)+recLen; continue; }
      const f={geom:uteis, multi:true};
      if((t===13||t===15) && o+16+8*nPts<=recEnd){   // Zmin,Zmax + array Z
        o+=16;
        const zs=[]; for(let i=0;i<nPts;i++){zs.push(dv.getFloat64(o,true));o+=8;}
        f.zg=[]; for(let i=0;i<nParts;i++){const a=parts[i],b=(i+1<nParts)?parts[i+1]:nPts;f.zg.push(zs.slice(a,b));}
      }
      feats.push(f);
    } else if(t===8||t===18||t===28){ // multipoint (18 = Z)
      o+=32; const n=dv.getInt32(o,true);o+=4; const pts=[];
      for(let i=0;i<n;i++){pts.push([dv.getFloat64(o,true),dv.getFloat64(o+8,true)]);o+=16;}
      const f={geom:pts};
      if(t===18 && o+16+8*n<=recEnd){ o+=16;
        f.zg=[]; for(let i=0;i<n;i++){f.zg.push(dv.getFloat64(o,true));o+=8;} }
      feats.push(f);
    } else { feats.push({geom:null}); }
    p = (p+8)+recLen;
  }
  return {gtype, feats};
}

function parseDBF(buf, cpg){
  // codificação: respeita o .cpg do QGIS (UTF-8) — antes era latin1 fixo,
  // e "Recirculação" virava "RecirculaÃ§Ã£o"
  let enc='latin1';
  if(cpg){ const c=String(cpg).trim().toUpperCase();
    if(c.includes('UTF-8')||c.includes('UTF8')||c==='65001') enc='utf-8';
    else if(c.includes('1252')) enc='windows-1252'; }
  const dv=new DataView(buf); let dec;
  try{ dec=new TextDecoder(enc); }catch(e){ dec=new TextDecoder('latin1'); }
  const nRec=dv.getUint32(4,true); const hSize=dv.getUint16(8,true); const rSize=dv.getUint16(10,true);
  const fields=[]; let p=32;
  while(p<hSize && dv.getUint8(p)!==0x0d){
    const nameBytes=new Uint8Array(buf,p,11); let nameSize=0;
    while(nameSize<nameBytes.length && nameBytes[nameSize]) nameSize++;
    const name=dec.decode(nameBytes.subarray(0,nameSize));
    fields.push({name, type:String.fromCharCode(dv.getUint8(p+11)),
      length:dv.getUint8(p+16), decimal:dv.getUint8(p+17)});
    p+=32;
  }
  /* Registros deletados NÃO são descartados aqui: a posição de cada linha do
     .dbf corresponde à posição da geometria no .shp, e remover uma linha no
     meio desloca todas as seguintes. Marca-se com _del e quem monta a camada
     descarta geometria e atributo pelo mesmo índice.                        */
  const rows=[]; let rp=hSize; let nDel=0;
  for(let r=0;r<nRec;r++){
    const del = dv.getUint8(rp)===0x2a;
    if(del) nDel++;
    let off=rp+1; const obj={};
    for(const f of fields){
      const raw=dec.decode(new Uint8Array(buf,off,f.length)).trim(); off+=f.length;
      let v=raw;
      if(f.type==='N'||f.type==='F') v = (raw===''||raw.includes('*'))?null:Number(raw);  // '****' = overflow dBase
      else if(f.type==='L') v = /^[YyTt]$/.test(raw);
      obj[f.name]=v;
    }
    if(del) Object.defineProperty(obj,'_del',{value:true, enumerable:false});
    rows.push(obj); rp+=rSize;
  }
  return {fields, rows, nDel};
}

/* ============================================================================
   ESCRITOR DE SHAPEFILE (round-trip)
   ========================================================================== */
function shpRingArea(r){
  if(r.length<3)return 0;const o=r[0];let sum=0,correction=0;
  for(let i=1;i<r.length-1;i++){const term=(r[i][0]-o[0])*(r[i+1][1]-o[1])-(r[i+1][0]-o[0])*(r[i][1]-o[1]),adjusted=term-correction,next=sum+adjusted;correction=(next-sum)-adjusted;sum=next;}
  return sum/2;
}
function ensureOrient(rings,outerCW){ // shapefile: outer CW, holes CCW
  const dentro=(p,r)=>{if(typeof measurePointInRing==='function')return measurePointInRing(p,r);if(!p)return false;let d=false;for(let i=0,j=r.length-1;i<r.length;j=i++){
    const a=r[i],b=r[j],dx=b[0]-a[0],dy=b[1]-a[1],px=p[0]-a[0],py=p[1]-a[1],eps=8*Number.EPSILON*Math.max(1,Math.abs(p[0]),Math.abs(p[1]),Math.abs(a[0]),Math.abs(a[1]),Math.abs(b[0]),Math.abs(b[1]));
    if(Math.abs(dx*py-dy*px)<=eps*(Math.abs(dx)+Math.abs(dy))&&p[0]>=Math.min(a[0],b[0])-eps&&p[0]<=Math.max(a[0],b[0])+eps&&p[1]>=Math.min(a[1],b[1])-eps&&p[1]<=Math.max(a[1],b[1])+eps)return false;
    if((a[1]>p[1])!==(b[1]>p[1])&&
      p[0]<(b[0]-a[0])*(p[1]-a[1])/((b[1]-a[1])||1e-20)+a[0])d=!d;}return d;};
  // Standalone SHP writers also need a strict interior sample. In the full
  // app use the same classifier as measurements and polygon operations.
  const interior=r=>{
    if(typeof measureRingInteriorPoint==='function')return measureRingInteriorPoint(r);
    const levels=[...new Set(r.map(p=>p[1]).filter(Number.isFinite))].sort((a,b)=>a-b);let gap=0,y=null;
    for(let i=1;i<levels.length;i++)if(levels[i]-levels[i-1]>gap){const mid=levels[i-1]+(levels[i]-levels[i-1])/2;if(mid>levels[i-1]&&mid<levels[i]){gap=levels[i]-levels[i-1];y=mid;}}
    if(y===null)return null;const xs=[];for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[j],b=r[i];if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]));}
    xs.sort((a,b)=>a-b);let width=0,p=null;for(let i=1;i<xs.length;i+=2)if(xs[i]-xs[i-1]>width){const x=xs[i-1]+(xs[i]-xs[i-1])/2;if(x>xs[i-1]&&x<xs[i]){width=xs[i]-xs[i-1];p=[x,y];}}return p;
  };
  const itens=rings.map(r=>{let q=r;
    if(r.length){const a=r[0],b=r[r.length-1];
      if(a[0]!==b[0]||a[1]!==b[1])q=r.concat([a.slice?a.slice():[a[0],a[1]]]);}
    return {q,a:Math.abs(shpRingArea(q)),point:interior(q)};});
  return itens.map(o=>{let prof=0;const p=o.point;
    for(const x of itens)if(x!==o&&x.a>o.a&&dentro(p,x.q))prof++;
    const cw=shpRingArea(o.q)<0,wantCW=(prof&1)?!outerCW:outerCW;
    return (cw===wantCW)?o.q:o.q.slice().reverse();});
}
function writeSHP(gtype, feats){
  const TYPE = gtype==='point'?1:gtype==='line'?3:5;
  // recolher records
  const recs=[]; let content=0;
  const bbox=[Infinity,Infinity,-Infinity,-Infinity];
  const upd=(x,y)=>{if(x<bbox[0])bbox[0]=x;if(y<bbox[1])bbox[1]=y;if(x>bbox[2])bbox[2]=x;if(y>bbox[3])bbox[3]=y;};
  feats.forEach(f=>{
    let body;
    if(TYPE===1){ const [x,y]=f.geom[0]; upd(x,y);
      body=new ArrayBuffer(20); const d=new DataView(body); d.setInt32(0,1,true); d.setFloat64(4,x,true); d.setFloat64(12,y,true);
    } else {
      let rings = f.multi? f.geom : [f.geom.flat?f.geom:f.geom];
      if(!Array.isArray(rings[0][0])) rings=[rings];
      if(TYPE===5) rings=ensureOrient(rings,true);
      const nParts=rings.length; const pts=[]; const parts=[];
      rings.forEach(r=>{parts.push(pts.length);r.forEach(pt=>{pts.push(pt);upd(pt[0],pt[1]);});});
      const size=44+nParts*4+pts.length*16; body=new ArrayBuffer(size); const d=new DataView(body); let o=0;
      d.setInt32(o,TYPE,true);o+=4;
      const lb=[Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))];
      lb.forEach(v=>{d.setFloat64(o,v,true);o+=8;});
      d.setInt32(o,nParts,true);o+=4; d.setInt32(o,pts.length,true);o+=4;
      parts.forEach(pp=>{d.setInt32(o,pp,true);o+=4;});
      pts.forEach(pt=>{d.setFloat64(o,pt[0],true);o+=8;d.setFloat64(o,pt[1],true);o+=8;});
    }
    recs.push(body); content+=body.byteLength+8;
  });
  const total=100+content; const shp=new ArrayBuffer(total); const dv=new DataView(shp);
  dv.setInt32(0,9994,false); dv.setInt32(24,total/2,false); dv.setInt32(28,1000,true); dv.setInt32(32,TYPE,true);
  [bbox[0],bbox[1],bbox[2],bbox[3],0,0,0,0].forEach((v,i)=>dv.setFloat64(36+i*8,v,true));
  // shx
  const shx=new ArrayBuffer(100+recs.length*8); const xv=new DataView(shx);
  xv.setInt32(0,9994,false); xv.setInt32(24,(100+recs.length*8)/2,false); xv.setInt32(28,1000,true); xv.setInt32(32,TYPE,true);
  [bbox[0],bbox[1],bbox[2],bbox[3],0,0,0,0].forEach((v,i)=>xv.setFloat64(36+i*8,v,true));
  let p=100, xo=100;
  recs.forEach((body,i)=>{
    dv.setInt32(p,i+1,false); dv.setInt32(p+4,body.byteLength/2,false);
    new Uint8Array(shp,p+8,body.byteLength).set(new Uint8Array(body)); 
    xv.setInt32(xo,(p)/2,false); xv.setInt32(xo+4,body.byteLength/2,false); xo+=8;
    p+=8+body.byteLength;
  });
  return {shp,shx};
}
function dbfCpgText(){ return 'UTF-8'; }
function dbfUtf8Truncate(bytes,maxBytes){
  if(bytes.length<=maxBytes) return bytes;
  let end=maxBytes;
  /* Não encerra o campo no meio de uma sequência UTF-8. O primeiro byte que
     ficaria de fora denuncia se o corte caiu dentro de um caractere. */
  while(end>0 && (bytes[end]&0xc0)===0x80) end--;
  return bytes.subarray(0,end);
}
/* O descritor dBase reserva 11 bytes para o nome, incluindo o terminador NUL;
   por isso o nome interoperavel do campo de um Shapefile tem no maximo 10
   bytes. O GeoMine conserva o nome completo em `sourceName`; somente o alias
   fisico gravado no DBF passa por esta normalizacao. */
const DBF_FIELD_NAME_BYTES=10;
function dbfPhysicalFieldStem(name,index){
  let stem=String(name==null?'':name).normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').toUpperCase()
    .replace(/[^A-Z0-9_]/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'');
  if(!stem) stem='CAMPO'+(index+1);
  if(!/^[A-Z_]/.test(stem)) stem='F_'+stem;
  return stem;
}
function dbfFieldNameHash(value){
  let hash=2166136261;
  const text=String(value==null?'':value);
  for(let i=0;i<text.length;i++){
    hash^=text.charCodeAt(i); hash=Math.imul(hash,16777619);
  }
  return (hash>>>0).toString(36).toUpperCase().padStart(7,'0');
}
function dbfUniquePhysicalFieldName(sourceName,index,used){
  const stem=dbfPhysicalFieldStem(sourceName,index);
  let candidate=stem.slice(0,DBF_FIELD_NAME_BYTES),attempt=0;
  while(used.has(candidate.toUpperCase())){
    /* O hash usa o nome ORIGINAL: variantes que viram o mesmo stem apos
       remover acentos, pontuacao ou caixa continuam recebendo aliases
       distintos. A tentativa adicional cobre inclusive campos duplicados e a
       remota possibilidade de colisao do proprio hash. */
    const token=dbfFieldNameHash(String(sourceName)+'|'+attempt).slice(-4);
    const suffix='_'+token;
    candidate=stem.slice(0,DBF_FIELD_NAME_BYTES-suffix.length)+suffix;
    attempt++;
  }
  used.add(candidate.toUpperCase());
  return candidate;
}
function dbfUtf8Fields(fields,rows,encoder){
  const usedNames=new Set();
  return (Array.isArray(fields)?fields:[]).filter(Boolean).map((source,index)=>{
    const sourceName=String(source.name==null?'':source.name);
    const name=dbfUniquePhysicalFieldName(sourceName,index,usedNames);
    const type=(String(source.type||'C').charAt(0)||'C').toUpperCase();
    let length=Math.floor(Number(source.length));
    if(!Number.isFinite(length)||length<1) length=type==='L'?1:type==='D'?8:(type==='N'||type==='F')?18:80;
    length=Math.min(254,length);
    /* Em UTF-8 largura é quantidade de bytes, não de caracteres. Amplia campos
       de texto quando necessário para que trocar Latin-1 por UTF-8 não corte
       nomes acentuados que antes cabiam na largura declarada. */
    if(type==='C'){
      let required=0;
      (Array.isArray(rows)?rows:[]).forEach(row=>{
        const value=row&&row[sourceName];
        if(value!=null) required=Math.max(required,encoder.encode(String(value)).length);
      });
      length=Math.min(254,Math.max(length,required));
    }
    let decimal=Math.floor(Number(source.decimal)||0);
    decimal=Math.max(0,Math.min(15,decimal));
    return {sourceName,name,type,length,decimal};
  });
}
function writeDBF(fields, rows){
  rows=Array.isArray(rows)?rows:[];
  const encoder=new TextEncoder(),specs=dbfUtf8Fields(fields,rows,encoder);
  const rSize=1+specs.reduce((sum,field)=>sum+field.length,0);
  const hSize=32+specs.length*32+1;
  if(rSize>65535) throw new Error('Registro DBF excede 65.535 bytes');
  if(hSize>65535) throw new Error('Cabeçalho DBF excede 65.535 bytes');
  const buf=new ArrayBuffer(hSize+rSize*rows.length+1); const dv=new DataView(buf); const u=new Uint8Array(buf);
  dv.setUint8(0,3); const d=new Date(); dv.setUint8(1,d.getFullYear()-1900);dv.setUint8(2,d.getMonth()+1);dv.setUint8(3,d.getDate());
  dv.setUint32(4,rows.length,true); dv.setUint16(8,hSize,true); dv.setUint16(10,rSize,true);
  dv.setUint8(29,0); // o .cpg é a declaração autoritativa de UTF-8
  let p=32;
  specs.forEach(field=>{
    const nameBytes=dbfUtf8Truncate(encoder.encode(field.name),DBF_FIELD_NAME_BYTES);
    u.set(nameBytes,p);
    dv.setUint8(p+11,field.type.charCodeAt(0)); dv.setUint8(p+16,field.length); dv.setUint8(p+17,field.decimal); p+=32;
  });
  dv.setUint8(p,0x0d); p++;
  rows.forEach(row=>{
    u[p]=0x20; p++;
    specs.forEach(field=>{
      const value=row&&row[field.sourceName]; let text='';
      if(value==null) text='';
      else if(field.type==='N'||field.type==='F') text=field.decimal?Number(value).toFixed(field.decimal):String(Math.round(value));
      else if(field.type==='L') text=value?'T':'F';
      else text=String(value);
      const bytes=dbfUtf8Truncate(encoder.encode(text),field.length);
      u.fill(0x20,p,p+field.length);
      const offset=(field.type==='C')?0:field.length-bytes.length;
      u.set(bytes,p+Math.max(0,offset)); p+=field.length;
    });
  });
  u[p]=0x1a;
  return buf;
}
function prjText(crs){
  const wkt={
    'EPSG:4326':'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]',
    'EPSG:4674':'GEOGCS["SIRGAS 2000",DATUM["Sistema_de_Referencia_Geocentrico_para_America_do_Sul_2000",SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]',
  };
  if(wkt[crs]) return wkt[crs];
  const m=crs.match(/EPSG:(319[6-8]\d)/); // SIRGAS UTM
  if(m){const zone=+m[1]-31960; return `PROJCS["SIRGAS 2000 / UTM zone ${zone}S",GEOGCS["SIRGAS 2000",DATUM["SIRGAS_2000",SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",${-183+zone*6}],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",10000000],UNIT["metre",1]]`;}
  return 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';
}

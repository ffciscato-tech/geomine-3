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
  const nRec=dv.getInt32(4,true); const hSize=dv.getInt16(8,true); const rSize=dv.getInt16(10,true);
  const fields=[]; let p=32;
  while(dv.getUint8(p)!==0x0d && p<hSize){
    const nameBytes=new Uint8Array(buf,p,11); let name='';
    for(let i=0;i<11 && nameBytes[i];i++) name+=String.fromCharCode(nameBytes[i]);
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
function shpRingArea(r){let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=(r[j][0]*r[i][1]-r[i][0]*r[j][1]);return a/2;}
function ensureOrient(rings,outerCW){ // shapefile: outer CW, holes CCW
  const dentro=(p,r)=>{let d=false;for(let i=0,j=r.length-1;i<r.length;j=i++){
    const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&
      p[0]<(b[0]-a[0])*(p[1]-a[1])/((b[1]-a[1])||1e-20)+a[0])d=!d;}return d;};
  const itens=rings.map(r=>{let q=r;
    if(r.length){const a=r[0],b=r[r.length-1];
      if(a[0]!==b[0]||a[1]!==b[1])q=r.concat([a.slice?a.slice():[a[0],a[1]]]);}
    return {q,a:Math.abs(shpRingArea(q))};});
  return itens.map(o=>{let prof=0;const p=o.q[0];
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
function writeDBF(fields, rows){
  const enc=s=>{const a=[];for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);a.push(c<256?c:63);}return a;};
  const rSize=1+fields.reduce((s,f)=>s+f.length,0);
  const hSize=32+fields.length*32+1;
  const buf=new ArrayBuffer(hSize+rSize*rows.length+1); const dv=new DataView(buf); const u=new Uint8Array(buf);
  dv.setUint8(0,3); const d=new Date(); dv.setUint8(1,d.getFullYear()-1900);dv.setUint8(2,d.getMonth()+1);dv.setUint8(3,d.getDate());
  dv.setInt32(4,rows.length,true); dv.setInt16(8,hSize,true); dv.setInt16(10,rSize,true);
  let p=32;
  fields.forEach(f=>{ const nm=enc(f.name.slice(0,11)); for(let i=0;i<11;i++)u[p+i]=nm[i]||0;
    dv.setUint8(p+11,f.type.charCodeAt(0)); dv.setUint8(p+16,f.length); dv.setUint8(p+17,f.decimal||0); p+=32; });
  dv.setUint8(p,0x0d); p++;
  rows.forEach(row=>{
    u[p]=0x20; p++;
    fields.forEach(f=>{
      let v=row[f.name]; let s='';
      if(v==null) s='';
      else if(f.type==='N'||f.type==='F'){ s=(f.decimal?Number(v).toFixed(f.decimal):String(Math.round(v))); }
      else if(f.type==='L') s = v?'T':'F';
      else s=String(v);
      s = (f.type==='C')? s.slice(0,f.length).padEnd(f.length,' ') : s.slice(0,f.length).padStart(f.length,' ');
      const bytes=enc(s); for(let i=0;i<f.length;i++)u[p+i]=bytes[i]||0x20; p+=f.length;
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

const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

const chain=r=>{const ch=[0];for(let i=1;i<=r.length;i++)ch.push(ch.at(-1)+
  Math.hypot(r[i%r.length][0]-r[i-1][0],r[i%r.length][1]-r[i-1][1]));return ch;};
const nearest=(r,ch,p)=>{let best=0,bd=Infinity;for(let i=0;i<r.length;i++){
  const a=r[i],b=r[(i+1)%r.length],dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy,
    t=Math.max(0,Math.min(1,L2?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L2:0)),
    x=a[0]+t*dx,y=a[1]+t*dy,d=Math.hypot(p[0]-x,p[1]-y);
  if(d<bd){bd=d;best=ch[i]+Math.sqrt(L2)*t;}}
  return best;};
const pointAt=(r,ch,s)=>{const per=ch.at(-1);s=((s%per)+per)%per;for(let i=1;i<ch.length;i++){
  if(s<=ch[i]+1e-9){const a=r[i-1],b=r[i%r.length],t=(s-ch[i-1])/((ch[i]-ch[i-1])||1);
    return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];}}return r[0].slice();};
const inside=(x,y,r)=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++){
  const a=r[i],b=r[j];if(((a[1]>y)!==(b[1]>y))&&
    x<(b[0]-a[0])*(y-a[1])/((b[1]-a[1])||1e-30)+a[0])yes=!yes;}return yes;};

const doc={getElementById:id=>({value:id==='rb31W'?'10':id==='rb31Dir'?'ccw':''})},
  ctx={console,Math,JSON,Date,Number,Array,Object,String,Set,Map,setTimeout,clearTimeout,
    document:doc,S:{_rb31:null,layers:[]},toast:()=>{},cmdLog:()=>{},refreshUI:()=>{},
    pointInRing:inside,cavaChain:chain,cavaNearestChain:nearest,cavaPointChain:pointAt,
    cavaDeloop:r=>r.map(p=>p.slice()),rb31Estado:()=>null,rb31Desenha:()=>{},
    rb31EstadoDaReceita:()=>null,rb31Gerar:()=>false,rb31Replay:()=>{},rb31LiveSync:()=>{}};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,
  'src/modules/mining/alagis-saidas-rampa-sem-cruzamento.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(root,
  'src/modules/mining/alagis-133-vinco-rampas-e-replay-total.js'),'utf8'),ctx);

const crista=[[0,0],[240,0],[240,160],[0,160]],
  vinco=ctx.rb133VincoNaLinha(crista,[35,0],10,'ccw');
assert(vinco,'o vinco deve existir na linha de crista');
const out=ctx.rb31Bancada(crista,100,{ang:45,H:10,W:10,grade:10,dir:'ccw',
  fora:false,up:false,startP:vinco.A,soleira:[vinco.A,vinco.B],berma:6});
assert(out&&out.bordaA&&out.bordaB,out&&out.warn||'a nova rampa deve ser gerada');
assert(Math.hypot(out.bordaA[0][0]-vinco.A[0],out.bordaA[0][1]-vinco.A[1])<1e-7,
  'a borda A deve nascer no primeiro extremo do vinco');
assert(Math.hypot(out.bordaB[0][0]-vinco.B[0],out.bordaB[0][1]-vinco.B[1])<1e-7,
  'a borda B deve nascer no segundo extremo do vinco');
assert(Math.abs(Math.hypot(out.bordaA[0][0]-out.bordaB[0][0],
  out.bordaA[0][1]-out.bordaB[0][1])-10)<1e-6,'a entrada deve conservar W');
assert(out.faceAudit&&Math.abs(out.faceAudit.faceMin-45)<.11&&
  Math.abs(out.faceAudit.faceMax-45)<.11,'o vinco não pode alterar o ângulo da face');
assert(Math.abs(out.faceAudit.grade-10)<.11,'o vinco não pode alterar a declividade');
console.log('OK: nova rampa nasce pelo vinco exato sem alterar face ou declividade.');

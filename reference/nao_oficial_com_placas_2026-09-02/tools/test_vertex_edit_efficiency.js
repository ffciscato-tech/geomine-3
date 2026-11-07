#!/usr/bin/env node
'use strict';

/* Ensaio deterministico do gesto que mais causou regressao: mover um vertice
   do limite e reconstruir a familia inteira. Mede tempo e, em cada passada,
   recusa truncamento, residuos, cruzamentos, largura/face/greide variaveis. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');

const root=path.resolve(__dirname,'..');
function chain(r){
  const ch=[0];for(let i=1;i<=r.length;i++){
    const a=r[i-1],b=r[i%r.length];ch.push(ch.at(-1)+Math.hypot(b[0]-a[0],b[1]-a[1]));
  }return ch;
}
function nearest(r,ch,p){
  let best=0,bd=Infinity;
  for(let i=0;i<r.length;i++){
    const a=r[i],b=r[(i+1)%r.length],dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy||1,
      t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L2)),
      q=[a[0]+t*dx,a[1]+t*dy],d=Math.hypot(p[0]-q[0],p[1]-q[1]);
    if(d<bd){bd=d;best=ch[i]+Math.sqrt(L2)*t;}
  }return best;
}
function pointAt(r,ch,s){
  const per=ch.at(-1);s=((s%per)+per)%per;
  for(let i=1;i<ch.length;i++)if(s<=ch[i]+1e-9){
    const a=r[i-1],b=r[i%r.length],t=(s-ch[i-1])/((ch[i]-ch[i-1])||1);
    return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  }return r[0].slice();
}
function inside(x,y,r){
  let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++){
    const a=r[i],b=r[j];
    if(((a[1]>y)!==(b[1]>y))&&x<(b[0]-a[0])*(y-a[1])/((b[1]-a[1])||1e-30)+a[0])yes=!yes;
  }return yes;
}
function context(){
  const c={console};c.window=c;c.pointInRing=inside;c.cavaChain=chain;
  c.cavaNearestChain=nearest;c.cavaPointChain=pointAt;c.cavaDeloop=r=>r.map(p=>p.slice());
  c.document={getElementById:()=>({value:'10'})};vm.createContext(c);
  for(const f of ['alagis-saidas-rampa-sem-cruzamento.js','alagis-106-continuidade-offset-rampa.js'])
    vm.runInContext(fs.readFileSync(path.join(root,'src/modules/mining',f),'utf8'),c);
  return c;
}
function crossings(A,B,self=false){
  let n=0;
  for(let i=0;i<A.length-1;i++)for(let j=0;j<B.length-1;j++){
    if(self&&Math.abs(i-j)<=1)continue;
    const a=A[i],b=A[i+1],c=B[j],d=B[j+1],
      den=(b[0]-a[0])*(d[1]-c[1])-(b[1]-a[1])*(d[0]-c[0]);
    if(Math.abs(den)<1e-11)continue;
    const t=((c[0]-a[0])*(d[1]-c[1])-(c[1]-a[1])*(d[0]-c[0]))/den,
      u=((c[0]-a[0])*(b[1]-a[1])-(c[1]-a[1])*(b[0]-a[0]))/den;
    if(t>1e-7&&t<1-1e-7&&u>1e-7&&u<1-1e-7)n++;
  }return n;
}
function offsetMiter(pts,d){
  const segs=[],n=pts.length;
  for(let i=0;i<n;i++){
    const a=pts[i],b=pts[(i+1)%n],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);
    if(L>1e-9)segs.push({a:[a[0]-dy/L*d,a[1]+dx/L*d],b:[b[0]-dy/L*d,b[1]+dx/L*d]});
  }
  const out=[];
  for(let i=0;i<segs.length;i++){
    const s=segs[i],q=segs[(i+1)%segs.length],x1=s.a[0],y1=s.a[1],x2=s.b[0],y2=s.b[1],
      x3=q.a[0],y3=q.a[1],x4=q.b[0],y4=q.b[1],den=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);
    if(Math.abs(den)<1e-9){out.push(s.b.slice(),q.a.slice());continue;}
    const t=((x1-x3)*(y3-y4)-(y1-y3)*(x3-x4))/den,
      p=[x1+t*(x2-x1),y1+t*(y2-y1)];
    if(Math.hypot(p[0]-s.b[0],p[1]-s.b[1])<=Math.abs(d)*8)out.push(p);
    else out.push(s.b.slice(),q.a.slice());
  }return out;
}
function generate(c,limit){
  const par={ang:45,H:10,B:6,W:10,grade:10,dir:'ccw'},banks=[],features=[];
  let crest=limit.map(p=>p.slice()),previous=null,z=100;
  for(let bank=1;bank<=3;bank++){
    const opt={ang:par.ang,H:par.H,W:par.W,grade:par.grade,dir:par.dir,
      fora:false,up:false,berma:par.B,_debug:true};
    if(bank===1)opt.startP=[40,15];
    else{
      const q=c.rb106ParLocal(crest,{A:previous.pFim,B:previous.pFimB,banco:bank},par.W),
        A=previous.bordaA,n=A.length,dx=A[n-1][0]-A[n-2][0],dy=A[n-1][1]-A[n-2][1],
        dl=Math.hypot(dx,dy)||1;
      Object.assign(opt,{startP:q.A,entradaDegrau:true,solIniA:q.A,solIniB:q.B,
        solDireto:true,solDir:[dx/dl,dy/dl]});
    }
    let factor=1,best=null;
    for(let k=0;k<24;k++){
      opt._fatorL=factor;const r=c.rb31Bancada(crest,z,opt);
      if(!r)break;
      const error=Math.abs(r.faceAudit.grade-par.grade);
      if(!best||error<best.error)best={r,error};
      if(error<.005)break;
      factor*=r.faceAudit.grade/par.grade;
    }
    assert(best&&best.r,`bancada ${bank} truncada`);const r=best.r,a=r.faceAudit;
    assert(Math.abs(a.faceMin-par.ang)<.1&&Math.abs(a.faceMax-par.ang)<.1,
      `face variou no banco ${bank}`);
    assert(Math.abs(a.grade-par.grade)<.15,`greide variou no banco ${bank}: ${a.grade}`);
    assert(Math.abs(a.widthMin-par.W)<.03&&Math.abs(a.widthMax-par.W)<.03,
      `largura variou no banco ${bank}`);
    assert.equal(crossings(r.bordaA,r.bordaA,true)+crossings(r.bordaB,r.bordaB,true)+
      crossings(r.bordaA,r.bordaB),0,`rampa cruzou no banco ${bank}`);
    const minSeg=Math.min(...r.bordaA.slice(1).map((p,i)=>Math.hypot(p[0]-r.bordaA[i][0],p[1]-r.bordaA[i][1])),
      ...r.bordaB.slice(1).map((p,i)=>Math.hypot(p[0]-r.bordaB[i][0],p[1]-r.bordaB[i][1])));
    assert(minSeg>.05,`residuo CAD no banco ${bank}: ${minSeg} m`);
    features.push({bank,type:'crest',g:crest},{bank,type:'toe',g:r.peEntregue},
      {bank,type:'ramp-a',g:r.bordaA},{bank,type:'ramp-b',g:r.bordaB});
    banks.push(r);previous=r;z-=par.H;
    crest=offsetMiter(r.peEntregue,par.B);
  }
  assert.equal(banks.length,3,'o replay deve conservar as tres bancadas');
  assert.equal(features.length,12,'o replay nao pode deixar feicoes antigas ou duplicadas');
  assert.equal(new Set(features.map(f=>`${f.bank}:${f.type}`)).size,12,
    'cada banco deve ter uma unica crista, pe e duas bordas de rampa');
  return {banks,features};
}

const base=[[0,0],[120,45],[260,80],[400,105],[420,220],[270,195],[120,155],[-30,80]],
  trials=[{i:-1,dx:0,dy:0}];
for(const i of [0,1,2,3,4,5,6,7])for(const [dx,dy] of [[.5,0],[-.5,0],[0,.5],[0,-.5],
  [1.5,1],[-1.5,-1],[3,-2],[-3,2]])trials.push({i,dx,dy});
const c=context(),times=[],fail=[];
for(const t of trials){
  const limit=base.map(p=>p.slice());if(t.i>=0){limit[t.i][0]+=t.dx;limit[t.i][1]+=t.dy;}
  const ini=performance.now();
  try{generate(c,limit);}catch(e){fail.push({...t,error:e.message});}
  times.push(performance.now()-ini);
}
times.sort((a,b)=>a-b);
const percentile=p=>times[Math.min(times.length-1,Math.ceil(times.length*p)-1)],
  result={trials:trials.length,success:trials.length-fail.length,rate:+(((trials.length-fail.length)/trials.length)*100).toFixed(1),
    medianMs:+percentile(.5).toFixed(2),p95Ms:+percentile(.95).toFixed(2),maxMs:+times.at(-1).toFixed(2),fail};
console.log(JSON.stringify(result,null,2));
assert.equal(fail.length,0,'todos os deslocamentos seguros devem reconstruir a familia: '+JSON.stringify(fail));
console.log('OK: edicao de vertices preservou geometria, completude e ausencia de residuos.');

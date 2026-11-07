/* APP de cursos naturais: regra federal geral, Lei 12.651/2012, art. 4º, I.
   Motor isolado em worker offline; não altera a hidrografia nem outros buffers.
   Medição local estimada ou largura informada; nunca usa área/perímetro. */
(function(){
'use strict';
const PC_SOURCE=__APP_POLYGON_CLIPPING__;
const LAW='https://www2.camara.leg.br/legin/fed/lei/2012/lei-12651-25-maio-2012-613076-normaatualizada-pl.html';
const RULE='Lei 12.651/2012, art. 4º, I (regra geral)';
const $=id=>document.getElementById('appRip'+id);
let context=null,job=null;
function widthNumber(v){
  if(typeof v==='string')v=v.trim().replace(',','.');
  if(v===''||v==null||!['number','string'].includes(typeof v))throw Error('Largura ausente.');
  const n=Number(v);if(!Number.isFinite(n)||n<=0)throw Error('A largura da calha deve ser um número positivo em metros.');
  return n;
}
function federalWidth(v){
  const w=widthNumber(v);
  // A redação sobrepõe 50 e 200 m. Convenção conservadora explícita na UI e atributos.
  return w<10?30:w<50?50:w<200?100:w<=600?200:500;
}
function engine(pc0,measurement,rule){
  /* A biblioteca de recorte às vezes aborta ("Unable to find segment…",
     "Unable to complete output ring") numa combinação infeliz de arredondamentos
     de ponto flutuante — a mesma calha passa quando o referencial muda (Braço
     do Norte v10: feições 73 e 204). Cada operação que falhar é refeita em
     referenciais deslocados por frações de metro e o resultado volta ao lugar
     (erro ~1e-12 m); só então a falha é dada como da geometria. */
  const pc=(()=>{
    const move=(g,dx,dy)=>Array.isArray(g)&&typeof g[0]==='number'?[g[0]+dx,g[1]+dy,...g.slice(2)]:g.map(x=>move(x,dx,dy));
    const wrap=k=>(...gs)=>{
      try{return pc0[k](...gs);}catch(e){
        for(const [dx,dy] of [[.37,.71],[-.53,.29],[1.13,-.83]]){
          try{return move(pc0[k](...gs.map(g=>move(g,dx,dy))),-dx,-dy);}catch(_){}
        }
        throw e;
      }
    };
    return {union:wrap('union'),difference:wrap('difference'),intersection:wrap('intersection'),xor:wrap('xor')};
  })();
  // Código autocontido para worker e testes. Sem tolerâncias aleatórias ou
  // redução silenciosa de vértices: só o arredondamento determinístico do
  // referencial local (1 mm; 1 cm na segunda tentativa de uma calha). Falha de
  // topologia que persista cancela a operação e aponta a feição.
  const close=r=>r[0][0]===r.at(-1)[0]&&r[0][1]===r.at(-1)[1]?r:[...r,r[0].slice()];
  function union(list){
    if(!list.length)return [];
    while(list.length>1){const next=[];for(let i=0;i<list.length;i+=16)next.push(pc.union(...list.slice(i,i+16)));list=next;}
    return list[0];
  }
  function band(rings,d,closed){
    let pieces=[];const chunks=[],n=128;
    const push=p=>{pieces.push(p);if(pieces.length===64){chunks.push(union(pieces));pieces=[];}};
    // Discos circunscritos: aproximação nunca encurta o afastamento mínimo.
    // Erro radial máximo d*(sec(pi/128)-1), ~0,16 m para APP de 500 m.
    const radius=d/Math.cos(Math.PI/n);
    for(const raw of rings){
      const r=closed?close(raw):raw;
      for(let i=0;i<r.length;i++){
        if(closed&&i===r.length-1)break;
        const a=r[i],disk=[];
        for(let k=0;k<n;k++){const t=2*Math.PI*k/n;disk.push([a[0]+radius*Math.cos(t),a[1]+radius*Math.sin(t)]);}
        push([[close(disk)]]);
        if(i+1<r.length){const b=r[i+1],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
          if(len){const x=-dy*d/len,y=dx*d/len;push([[[[a[0]+x,a[1]+y],[b[0]+x,b[1]+y],[b[0]-x,b[1]-y],[a[0]-x,a[1]-y],[a[0]+x,a[1]+y]]]]);}}
      }
    }
    if(pieces.length)chunks.push(union(pieces));return union(chunks);
  }
  /* GENERALIZAÇÃO EXPLÍCITA, SÓ PARA A FAIXA. A margem traçada no MDT de 15 cm
     tem um vértice a cada ~20 cm, e um disco por vértice tornava a faixa
     inviável (341 mil vértices na hidrografia de Braço do Norte). A faixa sai
     de uma cópia generalizada (Douglas-Peucker, tolerância GEN) com a distância
     acrescida do desvio REAL dos vértices retirados: todo ponto da margem
     original fica a ≤ desvio da cópia, então a APP medida da borda real fica
     inteira dentro da faixa (excesso ≤ 2 × desvio). Sem vértice retirado, a
     faixa é idêntica. A água continua recortada com a geometria ORIGINAL. */
  const GEN=0.1;
  function generaliza(line,t){
    const n=line.length;if(n<3)return {line:line.slice(),dev:0};
    const keep=new Uint8Array(n),st=[[0,n-1]];keep[0]=keep[n-1]=1;let dev=0;
    while(st.length){
      const [a,b]=st.pop(),A=line[a],B=line[b],dx=B[0]-A[0],dy=B[1]-A[1],ll=dx*dx+dy*dy;let best=-1,bi=-1;
      for(let i=a+1;i<b;i++){const px=line[i][0]-A[0],py=line[i][1]-A[1],u=ll?Math.max(0,Math.min(1,(px*dx+py*dy)/ll)):0,d=Math.hypot(px-u*dx,py-u*dy);if(d>best){best=d;bi=i;}}
      if(best>t){keep[bi]=1;st.push([a,bi],[bi,b]);}else if(best>dev)dev=best;
    }
    return {line:line.filter((_,i)=>keep[i]),dev};
  }
  // tolAtual: GEN, ou 0,5 m na última tentativa de seguro(); desvio = o da faixa que deu certo
  let tolAtual=GEN,desvio=0;
  function faixa(lines,d,closed){
    const gs=lines.map(l=>generaliza(l,tolAtual)),dev=gs.reduce((m,g)=>Math.max(m,g.dev),0);
    desvio=dev;
    return band(gs.map(g=>g.line),d+dev,closed);
  }
  function caixaMP(mp){
    const b=[Infinity,Infinity,-Infinity,-Infinity];
    for(const poly of mp)for(const p of poly[0]){if(p[0]<b[0])b[0]=p[0];if(p[1]<b[1])b[1]=p[1];if(p[0]>b[2])b[2]=p[0];if(p[1]>b[3])b[3]=p[1];}
    return b;
  }
  function area(mp){
    let sum=0;for(const poly of mp)poly.forEach((r,i)=>{let a=0;const o=r[0];for(let j=1;j<r.length;j++)a+=(r[j-1][0]-o[0])*(r[j][1]-o[1])-(r[j][0]-o[0])*(r[j-1][1]-o[1]);sum+=(i? -1:1)*Math.abs(a)/2;});return sum;
  }
  /* trechos de margem consecutivos (polilinhas) viram uma linha só; pontos
     colineares saem na generalização da faixa */
  function mergeBanks(lines){
    const out=[];
    for(const l of lines){const prev=out.at(-1),a=l[0];
      if(prev&&prev.at(-1)[0]===a[0]&&prev.at(-1)[1]===a[1])for(let i=1;i<l.length;i++)prev.push(l[i]);
      else out.push(l.slice());
    }return out;
  }
  /* REFERENCIAL LOCAL. Em UTM (~6,9 milhões de metros) a biblioteca de recorte
     perde precisão com vértices quase coincidentes e aborta com "Unable to
     find segment … in SweepLine tree" (hidrografia de Braço do Norte, 258
     calhas). Todo o cálculo é feito a partir de uma origem local, com as
     coordenadas arredondadas a 1 mm (determinístico, sem efeito numa APP de
     30 m ou mais), e o resultado volta para UTM no fim. */
  const mm=v=>Math.round(v*1000)/1000;
  function local(rows){
    let ox=Infinity,oy=Infinity;
    for(const r of rows)for(const ring of r.rings)for(const p of ring){if(p[0]<ox)ox=p[0];if(p[1]<oy)oy=p[1];}
    ox=Math.floor(ox);oy=Math.floor(oy);
    const anel=ring=>{const out=[];for(const p of ring){const q=[mm(p[0]-ox),mm(p[1]-oy)],u=out.at(-1);if(!u||u[0]!==q[0]||u[1]!==q[1])out.push(q);}return out;};
    return {ox,oy,rows:rows.map(r=>({...r,measurementRings:r.rings.map(ring=>ring.map(p=>[p[0]-ox,p[1]-oy])),rings:r.rings.map(anel)}))};
  }
  function devolve(g,ox,oy){
    if(!Array.isArray(g))return g;
    if(typeof g[0]==='number')return [g[0]+ox,g[1]+oy,...g.slice(2)];
    return g.map(x=>devolve(x,ox,oy));
  }
  /* recorte com segunda tentativa a 1 cm e terceira com a margem generalizada
     a 0,5 m (menos discos quase tangentes; a distância continua acrescida do
     desvio real, então a APP não encolhe); se ainda falhar, diz QUAL calha */
  function seguro(index,fn,linhas){
    try{return fn(linhas);}catch(e){
      const cm=linhas.map(l=>{const out=[];for(const p of l){const q=[Math.round(p[0]*100)/100,Math.round(p[1]*100)/100],u=out.at(-1);if(!u||u[0]!==q[0]||u[1]!==q[1])out.push(q);}return out;}).filter(l=>l.length>1);
      try{return fn(cm);}catch(e2){
        tolAtual=0.5;
        try{return fn(linhas);}
        catch(e3){throw Error('Feição '+index+': a geometria desta calha não pôde ser recortada ('+String(e2.message||e2).slice(0,90)+'). Confira vértices quase sobrepostos ou auto-interseções nesse polígono.');}
        finally{tolAtual=GEN;}
      }
    }
  }
  function run(data,progress=()=>{}){
    const L0=local(data.rows),ox=L0.ox,oy=L0.oy,rows=L0.rows,polygon=data.polygon;
    const out=calcula(rows,polygon,data,progress);
    return {falhas:out.falhas,saidas:out.saidas.map(q=>({...q,gen:Math.round((q.gen||0)*1000)/1000,mp:devolve(q.mp,ox,oy),sections:q.sections?q.sections.map(s=>({...s,line:devolve(s.line,ox,oy)})):q.sections}))};
  }
  function calcula(rows,polygon,data,progress){
    const bases=rows.map((r,i)=>{progress('Preparando calhas',i,rows.length);
      try{return polygon?pc.xor(...r.rings.map(x=>[[close(x)]])):band(r.rings,r.width/2,false);}
      catch(e){throw Error('Feição '+r.index+': calha inválida para o recorte ('+String(e.message||e).slice(0,90)+').');}});
    /* ÁGUA RECORTADA LOCALMENTE: cada faixa perde só as calhas cuja caixa a
       toca (geometria original). A união global de todas as calhas — uma
       operação sobre centenas de milhares de vértices — deixou de ser feita. */
    if(!bases.some(b=>b.length))throw Error('A calha não gerou área válida. Confira a geometria.');
    const caixas=bases.map(b=>b.length?caixaMP(b):null);
    const semAgua=mp=>{
      if(!mp.length)return mp;
      const bb=caixaMP(mp),agua=bases.filter((b,i)=>caixas[i]&&caixas[i][0]<=bb[2]&&caixas[i][2]>=bb[0]&&caixas[i][1]<=bb[3]&&caixas[i][3]>=bb[1]);
      return agua.length?pc.difference(mp,...agua):mp;
    };
    /* Uma calha que não pode ser medida/recortada (seção ambígua, geometria
       com defeito) não derruba as outras: fica de fora, INTEIRA, e é listada
       com o motivo. Erros gerais (configuração, resultado grande demais)
       continuam cancelando tudo. */
    const outputs=[],falhas=[],fatal=m=>Object.assign(Error(m),{fatal:true});
    if(data.automatic&&(!polygon||!measurement||!rule))throw fatal('Medição automática exige polígonos de calha e o módulo de medição.');
    rows.forEach((r,i)=>{
      progress('Gerando faixas de APP',i,rows.length);
      const daCalha=[];
      try{
      if(data.automatic){
        progress('Medindo larguras da calha',i,rows.length);
        let measured;try{measured=measurement.measure(r.measurementRings||r.rings,{step:data.step});}catch(e){throw Error('Feição '+r.index+': '+e.message);}
        const groups=new Map();
        for(const part of measured.segments){
          const app=rule(part.width);let group=groups.get(app);
          if(!group){group={app,lines:[],sections:[],widths:[]};groups.set(app,group);}
          group.lines.push(part.line);group.widths.push(part.width);
          group.sections.push({line:part.section,width:part.width,app,index:r.index,warning:part.warning||measured.warnings?.[0]||'Estimativa geométrica; conferir o trecho.'});
        }
        if(!groups.size)throw Error('Feição '+r.index+': não foi possível medir uma largura válida.');
        for(const g of groups.values()){
          const mp=seguro(r.index,linhas=>semAgua(faixa(linhas,g.app,false)),mergeBanks(g.lines)),a=area(mp);
          if(!mp.length||!(a>0))throw Error('Feição '+r.index+': faixa automática vazia.');
          const count=mp.reduce((n,p)=>n+p.reduce((s,r)=>s+r.length,0),0);
          daCalha.push({mp,area:a,count,index:r.index,app:g.app,width:Math.max(...g.widths),minWidth:Math.min(...g.widths),sections:g.sections,gen:desvio});
        }
      }else{
        const mp=seguro(r.index,aneis=>semAgua(polygon?faixa(aneis,r.app,true):faixa(aneis,r.app+r.width/2,false)),r.rings);
        if(!mp.length||!(area(mp)>0))throw Error('Trecho '+r.index+': faixa vazia. Confira sobreposições e a largura da calha.');
        const count=mp.reduce((n,p)=>n+p.reduce((s,g)=>s+g.length,0),0);
        daCalha.push({mp,area:area(mp),count,index:r.index,width:r.width,app:r.app,gen:desvio});
      }
      }catch(e){
        if(e&&e.fatal)throw e;
        falhas.push({index:r.index,motivo:String(e&&e.message||e).replace(/^(Feição|Trecho) \d+: /,'')});
        return;
      }
      outputs.push(...daCalha);
      if(outputs.reduce((n,q)=>n+q.count,0)>1500000)throw fatal('Resultado muito grande. Processe a hidrografia por trechos.');
    });
    /* Calha que não pôde ser medida seção a seção ainda recebe APP: a classe
       sai da LARGURA MÉDIA da calha (área ÷ metade do perímetro), e a faixa é
       marcada para conferência. Para quase todos os córregos isso dá 30 m. */
    if(data.automatic&&polygon){
      for(const f of falhas){
        const r=rows.find(x=>x.index===f.index);if(!r)continue;
        try{
          const w=larguraMedia(r.rings,bases[rows.indexOf(r)]),app=rule(w);
          const mp=seguro(r.index,aneis=>semAgua(faixa(aneis,app,true)),r.rings),a=area(mp);
          if(!mp.length||!(a>0))continue;
          outputs.push({mp,area:a,count:mp.reduce((n,p)=>n+p.reduce((s,g)=>s+g.length,0),0),index:r.index,app,width:w,minWidth:w,sections:[],estimada:true,gen:desvio});
          f.estimada={largura:w,app};
        }catch(e){f.motivo+=' (nem pela largura média)';}
      }
    }
    if(!outputs.length)throw Error('Nenhuma faixa de APP foi gerada. '+falhas.slice(0,3).map(f=>'Feição '+f.index+': '+f.motivo).join(' · '));
    progress('Fundindo faixas sobrepostas',0,1);
    return {saidas:funde(outputs),falhas};
  }
  /* área do polígono já resolvido (partes somam, furos descontam) ÷ metade
     do perímetro de todos os anéis */
  function larguraMedia(rings,base){
    let p=0;
    for(const r of rings)for(let j=0,k=r.length-1;j<r.length;k=j++)p+=Math.hypot(r[j][0]-r[k][0],r[j][1]-r[k][1]);
    const a=area(base||[]);
    if(!(a>0&&p>0))throw Error('calha sem área');
    return 2*a/p;
  }
  /* FUSÃO: APPs que se sobrepõem (confluências, calhas vizinhas, classes do
     mesmo curso) viram um polígono só — a área não é contada duas vezes.
     Cada área contínua leva as classes de APP, os trechos e as seções que
     contém. */
  function funde(outs){
    /* As faixas saem do recorte com precisão total; unidas assim a biblioteca
       falhava na hidrografia completa e a APP saía SEM fundir, calada. Agora:
       arredonda a 1 mm, une em lotes e, se um lote falhar, divide até isolar
       a faixa problemática (2ª tentativa a 1 cm). Só o que nem assim une fica
       separado — e é contado para o aviso. */
    const arred=(g,k)=>Array.isArray(g)&&typeof g[0]==='number'?[Math.round(g[0]*k)/k,Math.round(g[1]*k)/k]:g.map(x=>arred(x,k));
    let soltas=0;
    const lista=mps=>{let l=mps.slice();while(l.length>1){const next=[];for(let i=0;i<l.length;i+=16)next.push(pc.union(...l.slice(i,i+16)));l=next;}return l[0]?pc.union(l[0]):[];};
    const robusto=mps=>{
      try{return lista(mps);}catch(e){
        if(mps.length===1){try{return pc.union(arred(mps[0],100));}catch(e2){soltas++;return mps[0];}}
        const m=mps.length>>1,a=robusto(mps.slice(0,m)),b=robusto(mps.slice(m));
        if(!a.length)return b;if(!b.length)return a;
        try{return pc.union(a,b);}catch(e3){try{return pc.union(arred(a,100),arred(b,100));}catch(e4){soltas++;return a.concat(b);}}
      }
    };
    /* sem arredondar de saída: no referencial local a união costuma passar, e
       arredondar a 1 mm um vértice que está SOBRE uma margem inclinada o
       empurrava para dentro da água (lasca < 1 mm). O arredondamento a 1 cm
       continua como segunda tentativa de cada faixa que a união recusar. */
    const uni=robusto(outs.map(q=>q.mp));
    const caixa=poly=>{let b=[Infinity,Infinity,-Infinity,-Infinity];for(const p of poly[0]){if(p[0]<b[0])b[0]=p[0];if(p[1]<b[1])b[1]=p[1];if(p[0]>b[2])b[2]=p[0];if(p[1]>b[3])b[3]=p[1];}return b;};
    const dentroAnel=(p,r)=>{let d=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/((b[1]-a[1])||1e-12)+a[0])d=!d;}return d;};
    const naBorda=(p,r)=>{for(let i=1;i<r.length;i++){const a=r[i-1],b=r[i],dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0;if(Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)<=0.002)return true;}return false;};
    const pertence=(p,poly)=>poly.some(r=>naBorda(p,r))||(dentroAnel(p,poly[0])&&!poly.slice(1).some(h=>dentroAnel(p,h)));
    const comp=uni.map(poly=>({poly,box:caixa(poly),membros:[]}));
    /* Cada PARTE da faixa (ilha no meio do rio, parte separada de uma
       multiparte, pedaço cortado pela água) vai para a área contínua que
       toca. Antes só a parte do primeiro vértice contava e as áreas sem
       membro eram descartadas: a APP dessas partes sumia. As seções da
       calha entram uma vez só. */
    for(const q of outs){
      const vistos=new Set();
      for(const parte of q.mp){
        const p=parte[0][0];
        const cand=comp.filter(c=>p[0]>=c.box[0]-1e-3&&p[0]<=c.box[2]+1e-3&&p[1]>=c.box[1]-1e-3&&p[1]<=c.box[3]+1e-3);
        const alvo=cand.length===1?cand[0]:(cand.find(c=>pertence(p,c.poly))||cand[0]||comp[0]);
        if(!vistos.has(alvo)){vistos.add(alvo);alvo.membros.push(vistos.size>1?{...q,sections:[]}:q);}
      }
    }
    /* nenhuma área contínua some: a que ficou sem membro herda a faixa cuja
       extensão a toca */
    for(const c of comp)if(!c.membros.length){
      const q=outs.find(q=>q.mp.some(parte=>{const b=caixa(parte);return b[0]<=c.box[2]+1e-3&&b[2]>=c.box[0]-1e-3&&b[1]<=c.box[3]+1e-3&&b[3]>=c.box[1]-1e-3;}));
      if(q)c.membros.push({...q,sections:[]});
    }
    const res=comp.filter(c=>c.membros.length).map(c=>{
      const m=c.membros,mp=[c.poly],uniq=a=>[...new Set(a)].sort((x,y)=>x-y);
      return {mp,area:area(mp),count:c.poly.reduce((s,r)=>s+r.length,0),apps:uniq(m.map(q=>q.app)),app:Math.max(...m.map(q=>q.app)),
        indices:uniq(m.map(q=>q.index)),estimadas:uniq(m.filter(q=>q.estimada).map(q=>q.index)).length,
        width:Math.max(...m.map(q=>q.width)),minWidth:Math.min(...m.map(q=>q.minWidth??q.width)),
        sections:m.flatMap(q=>q.sections||[]),index:Math.min(...m.map(q=>q.index)),gen:Math.max(...m.map(q=>q.gen||0))};
    });
    if(soltas)res.forEach(q=>{q.soltas=soltas;});
    return res;
  }
  return {run,area};
}
function workerRun(data,onProgress){
  const source=PC_SOURCE+'\nconst widthNumber='+widthNumber.toString()+';const federalWidth='+federalWidth.toString()+';const measurement=('+GeoMineRiparianWidth.engine.toString()+')();const engine='+engine.toString()+';onmessage=e=>{try{const result=engine(polygonClipping,measurement,federalWidth).run(e.data,(stage,i,n)=>postMessage({stage,i,n}));postMessage({result});}catch(e){postMessage({error:e.message||String(e)});}};';
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  const worker=new Worker(url);URL.revokeObjectURL(url);
  return new Promise((resolve,reject)=>{
    job.worker=worker;job.reject=reject;
    worker.onmessage=e=>{const m=e.data;if(m.error)reject(Error(m.error));else if(m.result)resolve(m.result);else onProgress(m);};
    worker.onerror=e=>reject(Error(e.message||'Falha no cálculo de APP.'));
    /* 10 min: com a aba em segundo plano o navegador reduz a prioridade do
       cálculo (250 calhas levam ~1,5 min com a aba à vista). O botão Cancelar
       continua disponível o tempo todo. */
    job.timer=setTimeout(()=>{worker.terminate();reject(Error('O cálculo excedeu 10 minutos. Mantenha a aba do GeoMine à vista durante o cálculo ou divida a camada em trechos menores.'));},600000);
    worker.postMessage(data);
  });
}
function selected(L){
  if(typeof ED!=='undefined'&&ED.on&&ED.sel?.L===L&&L.features.includes(ED.sel.f))return ED.sel.f;
  const s=S.selFeat;return s&&(s.layer===L||s.layerId===L.id)?L.features[s.idx]||null:null;
}
function targets(L,scope){return L.features.map((f,i)=>({f,index:i+1})).filter(x=>scope==='feature'?x.f===selected(L):scope==='all'||featureVisible(L,x.f));}
function options(){return {mode:$('Mode').value,step:$('Step').value,field:$('Field').value,value:$('Width').value,scope:$('Scope').value,regime:$('Regime').value,confirmed:$('Confirm').checked,context:$('Context').value};}
function validate(L,o){
  if(!L||!S.layers.includes(L)||!['line','polygon'].includes(L.gtype))throw Error('Escolha uma camada de calhas (polígonos) ou eixos (linhas).');
  if(!o.confirmed)throw Error('Confirme a calha, a revisão das larguras e a aplicabilidade da regra geral.');
  if(!['perene','intermitente'].includes(o.regime))throw Error('Esta ferramenta atende cursos naturais perenes ou intermitentes. Efêmeros e canais artificiais exigem outro enquadramento.');
  if(o.context==='specific')throw Error('Este caso exige análise da norma/licença específica. A ferramenta não aplica automaticamente exceções à regra geral.');
  const crs=proj4(S.workCRS).oProj;
  if(crs.projName!=='utm'||Math.abs((crs.to_meter||1)-1)>1e-10)throw Error('Selecione o CRS UTM em metros da região do projeto antes de gerar a APP. Não calcule em graus ou Web Mercator.');
  if(o.mode==='auto'){
    if(L.gtype!=='polygon')throw Error('Para medir a largura automaticamente, escolha uma calha em polígono. Uma linha não informa suas margens.');
    const step=widthNumber(o.step);if(step<0.5||step>50)throw Error('O intervalo de medição deve ficar entre 0,5 e 50 m.');
  }
  const chosen=targets(L,o.scope);if(!chosen.length)throw Error(o.scope==='feature'?'Selecione primeiro um polígono/feição desta camada no mapa.':'Não há feições no escopo escolhido.');
  return chosen.map(({f,index})=>{
    if(o.mode==='auto')return {f,index,width:null,app:null};
    let width;try{width=widthNumber(o.field?f.props?.[o.field]:o.value);}catch(e){throw Error('Feição '+index+': '+e.message);}
    return {f,index,width,app:federalWidth(width)};
  });
}
function refresh(){
  if(job)return;
  const L=S.layers.find(l=>String(l.id)===$('Layer').value);context={L,project:S.projectId};
  const previous=$('Field').value;$('Field').replaceChildren(new Option('Largura única para todos os trechos',''));
  const names=new Set((L?.fields||[]).map(f=>f.name));(L?.features||[]).slice(0,100).forEach(f=>Object.keys(f.props||{}).forEach(k=>names.add(k)));
  names.forEach(n=>$('Field').append(new Option(n,n)));if(names.has(previous))$('Field').value=previous;
  $('Mode').querySelector('[value="auto"]').disabled=L?.gtype!=='polygon';if(L?.gtype!=='polygon')$('Mode').value='manual';
  $('Scope').querySelector('[value="feature"]').disabled=!L||!selected(L);
  if($('Scope').value==='feature'&&(!L||!selected(L)))$('Scope').value='visible';
  preview();
}
function preview(){
  const automatic=$('Mode').value==='auto';
  $('Manual').hidden=automatic;$('Sampling').hidden=!automatic;$('Width').disabled=automatic||!!$('Field').value;
  $('Method').textContent=automatic?'Mede larguras locais estimadas entre margens do polígono e aplica a faixa por trecho. Cria também seções para conferência. Não usa área/perímetro nem uma largura média para todo o rio. Revise confluências, ilhas, términos e mudanças próximas dos limites de classe.':context?.L?.gtype==='polygon'?'Borda mapeada: usa a largura informada e gera a faixa para fora da calha, excluindo a água.':'Eixo (estimativa): usa meia largura para estimar a margem. A linha sozinha não permite medir a calha; informe largura ou escolha seu polígono.';
  try{
    const o=options(),rows=validate(context?.L,{...o,confirmed:true,regime:'perene',context:'general'}),counts=new Map();
    if(automatic){$('Summary').textContent=rows.length+' polígono(s) · medição a cada '+widthNumber(o.step)+' m · exemplo: calha de 5 m → APP de 30 m por margem. Resultado estimado, sujeito à conferência das seções.';return;}
    rows.forEach(r=>counts.set(r.app,(counts.get(r.app)||0)+1));
    $('Summary').textContent=rows.length+' trecho(s) · '+[...counts].sort((a,b)=>a[0]-b[0]).map(([m,n])=>n+' com APP de '+m+' m').join(' · ');
  }catch(e){$('Summary').textContent=e.message;}
}
function open(){
  if(job)return;
  const layers=S.layers.filter(l=>['line','polygon'].includes(l.gtype));
  if(!$('Modal')){
    const bg=document.createElement('div');bg.id='appRipModal';bg.className='modal-bg';
    bg.innerHTML=`<style>#appRipModal [hidden]{display:none!important}</style><div class="modal" style="width:min(720px,96vw);max-height:90dvh;display:flex;flex-direction:column">
      <div class="modal-h"><b>APP de cursos d’água — largura da calha</b><div style="flex:1"></div><button class="tbtn" id="appRipClose">Fechar</button></div>
      <div class="modal-b" style="overflow:auto;min-height:0">
        <div class="hint">Regra federal geral · Lei 12.651/2012, art. 4º, I. A distância de proteção é medida a partir da borda da calha do leito regular, em cada margem.</div>
        <label class="field" for="appRipLayer">Calha mapeada (polígono) ou eixo do curso (linha)</label><select id="appRipLayer"></select>
        <div class="hint" id="appRipMethod"></div>
        <label class="field" for="appRipScope">Aplicar em</label><select id="appRipScope"><option value="feature">Somente o polígono/feição selecionado</option><option value="visible">Camada — respeitar filtros e categorias visíveis</option><option value="all">Camada inteira — todas as feições</option></select>
        <label class="field" for="appRipMode">Como obter a largura</label><select id="appRipMode"><option value="auto">Medir no polígono da calha (estimativa automática)</option><option value="manual">Usar largura informada ou campo de atributos</option></select>
        <div id="appRipSampling"><label class="field" for="appRipStep">Intervalo de medição nas margens (m)</label><input id="appRipStep" type="text" inputmode="decimal" value="5"><div class="hint">Intervalo menor detalha as variações e aumenta o tempo de cálculo. Duas camadas serão criadas: APP e seções de largura para revisar. A geometria sozinha não determina o regime do curso nem substitui levantamento de campo.</div></div>
        <div id="appRipManual">
        <label class="field" for="appRipField">Origem da largura da calha (metros)</label><select id="appRipField"></select>
        <label class="field" for="appRipWidth">Largura única (m)</label><input id="appRipWidth" type="text" inputmode="decimal" placeholder="Ex.: 8,5">
        <div class="hint">No modo informado, divida o curso em trechos quando a largura mudar de classe. No modo automático, as faixas são classificadas a partir das medidas locais.</div></div>
        <label class="field" for="appRipRegime">Tipo de curso — válido para todos os trechos escolhidos</label><select id="appRipRegime"><option value="">Selecione o enquadramento</option><option value="perene">Natural perene</option><option value="intermitente">Natural intermitente</option><option value="efemero">Efêmero (fora desta regra)</option><option value="artificial">Canal artificial (fora desta regra)</option></select>
        <label class="field" for="appRipContext">Enquadramento da análise</label><select id="appRipContext"><option value="general">Delimitação pela regra federal geral</option><option value="specific">Área urbana consolidada / norma local / licença específica</option></select>
        <details><summary>Faixas, método e limites de aplicação</summary>
          <div class="hint">Calha menor que 10 m → APP de 30 m; 10 a menos de 50 m → 50 m; 50 a menos de 200 m → 100 m; 200 a 600 m → 200 m; acima de 600 m → 500 m. Nos limites de 50 e 200 m, adota-se a faixa maior como convenção conservadora, pois a redação legal sobrepõe os intervalos.</div>
          <div class="hint">Não calcula faixas de recomposição do art. 61-A, nascentes, lagos, reservatórios ou outras modalidades de APP. Em área urbana consolidada, confira o art. 4º, §10 e a legislação aplicável. Verifique também normas estaduais/locais, decisões judiciais e exigências do órgão ambiental. O resultado é apoio técnico, não homologação legal.</div>
          <div class="hint">O buffer tem junções e extremidades arredondadas; revise términos artificiais dos trechos. Curvas são aproximadas por 128 lados circunscritos (excesso radial até 0,031% do raio). Margens muito detalhadas (p.ex. traçadas em MDT de 15 cm) são generalizadas até 10 cm só para traçar a faixa, com a distância acrescida do desvio real (campo GEN_FAIXA_M): a APP nunca fica menor que a faixa legal; a água é recortada com a geometria original. Faixas que se sobrepõem são fundidas numa área contínua (a área não é contada duas vezes); TRECHOS e APP_CLASSES indicam os trechos e as classes de cada área. A calha de todas as feições processadas é excluída da APP.</div>
          <a href="${LAW}" target="_blank" rel="noopener noreferrer">Consultar legislação federal consolidada</a>
        </details>
        <label style="display:flex;gap:9px;align-items:flex-start;margin:14px 0"><input type="checkbox" id="appRipConfirm" style="width:auto;flex:none"><span>Conferi a calha do leito regular e a aplicabilidade da regra geral. Revisarei as larguras estimadas/informadas, as seções e o resultado técnico antes de usar a delimitação.</span></label>
        <div class="hint" id="appRipSummary"></div>
        <progress id="appRipProgress" max="100" value="0" style="width:100%" hidden></progress>
        <div class="hint" id="appRipStatus" role="status" aria-live="polite"></div>
      </div><div style="padding:12px;display:flex;gap:10px;flex:none;border-top:1px solid var(--border)">
        <button class="tbtn" id="appRipGenerate" style="flex:1;justify-content:center;background:var(--amber);color:#1a1206">Gerar APP em nova camada</button><button class="tbtn" id="appRipCancel" hidden>Cancelar cálculo</button>
      </div></div>`;
    document.body.append(bg);
    $('Layer').onchange=refresh;['Scope','Mode','Field','Regime','Context'].forEach(k=>$(k).onchange=preview);$('Width').oninput=preview;$('Step').oninput=preview;
    $('Generate').onclick=generate;$('Cancel').onclick=cancel;$('Close').onclick=()=>{if(!job)$('Modal').classList.remove('on');};
  }
  $('Layer').replaceChildren();layers.forEach(L=>$('Layer').append(new Option(L.name,L.id)));
  if(layers.includes(activeLayer()))$('Layer').value=String(activeLayer().id);
  const chosen=layers.find(l=>String(l.id)===$('Layer').value);$('Mode').value=chosen?.gtype==='polygon'?'auto':'manual';$('Scope').value=chosen&&selected(chosen)?'feature':'visible';
  $('Confirm').checked=false;$('Status').textContent='';$('Progress').hidden=true;
  refresh();$('Modal').classList.add('on');
}
function cancel(){if(job){job.cancelled=true;job.worker?.terminate();job.reject?.(Error('Cálculo cancelado. Nenhuma camada foi criada.'));}}
// O fechamento universal por Escape não pode esconder um cálculo ativo e
// deixá-lo gravar camadas sem acesso ao botão Cancelar. Mantém o aviso visível.
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&job){e.preventDefault();e.stopImmediatePropagation();cancel();}
},true);
async function generate(){
  if(job)return;
  let current;
  const controls=['Layer','Scope','Mode','Step','Field','Width','Regime','Context','Confirm','Generate','Close'].map($);
  try{
    const L=context?.L,o=options(),rows=validate(L,o),project=S.projectId,crs=S.workCRS,rev=L._rev;
    if(project!==context.project)throw Error('O projeto mudou. Reabra a ferramenta.');
    const snapshot=JSON.stringify(rows.map(r=>r.f)),settings=JSON.stringify(o);
    current=job={cancelled:false};controls.forEach(e=>e.disabled=true);$('Cancel').hidden=false;$('Progress').hidden=false;$('Progress').value=0;
    const input=[];let vertices=0;
    for(const row of rows){
      const rings=[];
      const walk=g=>{
        if(!Array.isArray(g)||!g.length)throw Error('Geometria vazia.');
        if(Array.isArray(g[0])&&typeof g[0][0]==='number'){
          const ring=g.map(p=>{if(!Number.isFinite(p[0])||!Number.isFinite(p[1]))throw Error('Coordenada inválida.');const q=L.crs===crs?p.slice(0,2):reproj(L.crs,crs,p[0],p[1]);if(!q.every(Number.isFinite))throw Error('Falha na projeção.');return q;});
          if(new Set(ring.map(p=>p.join(','))).size<(L.gtype==='polygon'?3:2))throw Error('Geometria degenerada.');
          rings.push(ring);vertices+=ring.length;
        }else g.forEach(walk);
      };
      try{walk(row.f.geom);}catch(e){throw Error('Feição '+row.index+': '+e.message);}
      /* a faixa usa uma cópia generalizada (até 10 cm) e a água é recortada
         localmente: margens traçadas no MDT de 15 cm (centenas de milhares de
         vértices) cabem no cálculo */
      if(vertices>1500000)throw Error('Mais de 1,5 milhão de vértices: processe por trechos ou simplifique uma cópia antes de gerar a APP.');
      input.push({index:row.index,width:row.width,app:row.app,rings});
      if(input.length%16===0){await new Promise(r=>setTimeout(r,0));if(current.cancelled)throw Error('Cálculo cancelado. Nenhuma camada foi criada.');}
    }
    $('Status').textContent='Preparando calhas…';
    const resposta=await workerRun({rows:input,polygon:L.gtype==='polygon',automatic:o.mode==='auto',step:Number(String(o.step).replace(',','.'))},m=>{
      $('Status').textContent=m.stage+' · '+(m.i+1)+'/'+m.n;$('Progress').value=(m.stage==='Preparando calhas'?0:35)+((m.i+1)/m.n)*(m.stage==='Preparando calhas'?35:60);
    });
    if(current.cancelled)throw Error('Cálculo cancelado. Nenhuma camada foi criada.');
    const result=resposta.saidas||resposta,falhas=resposta.falhas||[];
    if(S.projectId!==project||S.workCRS!==crs||!S.layers.includes(L)||L._rev!==rev||rows.some(r=>L.features[r.index-1]!==r.f)||JSON.stringify(rows.map(r=>r.f))!==snapshot||JSON.stringify(options())!==settings||JSON.stringify(targets(L,o.scope).map(r=>r.index))!==JSON.stringify(rows.map(r=>r.index)))throw Error('Os dados mudaram durante o cálculo. Gere novamente.');
    const automatic=o.mode==='auto',date=new Date().toISOString(),method=automatic?'borda mapeada; largura local estimada por seções':L.gtype==='polygon'?'borda da calha mapeada':'estimativa por eixo e meia largura';
    const lista=a=>{const t=a.join(', ');return t.length>240?t.slice(0,237)+'…':t;};
    const features=result.map(q=>({geom:q.mp.flat(),multi:true,props:{TRECHOS:lista(q.indices||[q.index]),N_TRECHOS:(q.indices||[q.index]).length,ORIGEM:L.name,LARG_M:q.width,APP_M:q.app,APP_CLASSES:(q.apps||[q.app]).join('/')+' m',...(automatic?{LARG_MIN:q.minWidth,LARG_MAX:q.width,PASSO_M:Number(String(o.step).replace(',','.')),N_SECOES:(q.sections||[]).length,N_LARG_MEDIA:q.estimadas||0}:{}),REGIME:o.regime,METODO:method,GEN_FAIXA_M:q.gen||0,BASE_LEGAL:RULE,CONVENCAO:'50/200 m: faixa maior; 600 m: APP 200 m',AREA_M2:+q.area.toFixed(2),DATA_UTC:date,FONTE_LEI:LAW,STATUS:automatic?'Estimativa geométrica — conferir seções':'Delimitação técnica preliminar',ESCOPO:o.scope==='feature'?'feição selecionada':o.scope==='all'?'todas':'filtros e categorias',CAMPO_LARG:automatic?'medição geométrica local':o.field||'valor único'}}));
    const fieldsFor=features=>Object.keys(features[0].props).map(name=>{const numeric=typeof features[0].props[name]==='number';return {name,type:numeric?'N':'C',size:numeric?18:254,dec:numeric&&!/^(TRECHO|N_TRECHOS|N_SECOES|N_LARG_MEDIA)$/.test(name)?3:0};});
    const specs=[];
    if(automatic){
      const sections=result.flatMap(q=>q.sections.map(s=>({geom:s.line,props:{TRECHO:s.index,ORIGEM:L.name,LARG_M:s.width,APP_M:s.app,STATUS:'Estimativa — revisar',AVISO:s.warning,DATA_UTC:date}})));
      if(!sections.length)throw Error('Sem seções de conferência; nenhuma APP foi criada.');
      specs.push({name:'Seções de largura — '+L.name,gtype:'line',crs,features:sections,fields:fieldsFor(sections),color:'#ef9934'});
    }
    specs.push({name:'APP — '+L.name+((automatic||L.gtype==='line')?' (estimativa)':''),gtype:'polygon',crs,features,fields:fieldsFor(features),color:'#29945a'});
    const created=[],oldLayers=S.layers.slice(),oldStack=S.stack?.slice(),oldActive=S.activeId;
    try{
      for(const spec of specs){const out=addLayer(spec);created.push(out);if(spec.gtype==='polygon'){out.fill=.3;out.sym.fill=.3;}drawLayer(out);}
      refreshUI();zApply();
    }catch(e){
      // addLayer pode lançar depois de inserir a camada. Incluí-la no rollback
      // mesmo se a chamada não retornou; nunca deixar um resultado parcial.
      for(const out of S.layers.filter(l=>!oldLayers.includes(l))){try{if(out.llayer)map.removeLayer(out.llayer);}catch(_){}}
      S.layers=oldLayers;if(oldStack)S.stack=oldStack;S.activeId=oldActive;
      try{refreshUI();zApply();}catch(_){}throw e;
    }
    created.forEach(L=>undoPush({t:'layeradd',L}));
    const haTotal=result.reduce((t,q)=>t+q.area,0)/1e4,soltas=result[0]?.soltas||0;
    $('Progress').value=100;$('Status').textContent='APP criada: '+features.length+' área(s) contínua(s), '+haTotal.toLocaleString('pt-BR',{maximumFractionDigits:2})+' ha — faixas sobrepostas fundidas num polígono só (a área não conta duas vezes)'+(soltas?' · ATENÇÃO: '+soltas+' trecho(s) com geometria que a união não aceitou ficaram separados (podem sobrepor) — use Dissolver nesta camada':'')+'. Originais preservados. '+(automatic?'Seções de largura criadas para conferir as estimativas. Ctrl+Z desfaz cada camada. ':'Ctrl+Z desfaz. ')+'Revise as faixas e salve o projeto.';
    const medias=falhas.filter(f=>f.estimada),semAPP=falhas.filter(f=>!f.estimada);
    const fmt=v=>v.toLocaleString('pt-BR',{maximumFractionDigits:1});
    const puladas=(medias.length?' CONFERIR: '+medias.length+' calha(s) sem medição seção a seção receberam APP pela LARGURA MÉDIA — '+medias.slice(0,10).map(f=>'feição '+f.index+' ('+fmt(f.estimada.largura)+' m → '+f.estimada.app+' m)').join(' · ')+(medias.length>10?' · …':'')+'.':'')+
      (semAPP.length?' SEM APP: '+semAPP.length+' calha(s) — '+semAPP.slice(0,8).map(f=>'feição '+f.index+': '+f.motivo).join(' · ')+(semAPP.length>8?' · …':'')+'. Gere essas pelo modo "Usar largura informada".':'');
    if(puladas)$('Status').textContent+=puladas;
    toast(semAPP.length?'APP criada; '+semAPP.length+' calha(s) ficaram sem APP — veja a lista na janela.':medias.length?'APP criada; '+medias.length+' calha(s) pela largura média — conferir.':'APP criada em nova camada.');
    if(falhas.length)cmdLog('APP: '+falhas.map(f=>f.index+(f.estimada?' (largura média '+fmt(f.estimada.largura)+' m → APP '+f.estimada.app+' m)':' (sem APP: '+f.motivo+')')).join('; '),'avisa');cmdLog('APP: '+features.length+' área(s) contínua(s) de '+rows.length+' trecho(s) · '+method+' · '+RULE,'info');
  }catch(e){$('Status').textContent=e.message;toast(e.message);}
  finally{if(current){clearTimeout(current.timer);current.worker?.terminate();job=null;controls.forEach(e=>e.disabled=false);$('Width').disabled=$('Mode').value==='auto'||!!$('Field').value;$('Cancel').hidden=true;}
    // a mensagem fica abaixo da barra de progresso: rolar até ela (antes ficava fora da vista)
    try{$('Status').scrollIntoView({block:'nearest'});}catch(_){}}
}
function install(){
  const cat=CATS.find(c=>c.id==='ambiente');if(!cat)return;
  if(cat.grupos.some(g=>g.it?.some(i=>i.ic==='app_riparia')))return;
  // The channel module may already have created this shared group.
  let group=cat.grupos.find(g=>g.label==='Preservação permanente');
  if(!group){group={label:'Preservação permanente',it:[]};cat.grupos.unshift(group);}
  group.it.push({ic:'app_riparia',nome:'APP por calha',desc:'Faixas marginais pela largura da calha — regra federal geral',act:open});
}
if(typeof RIB_SVG!=='undefined')RIB_SVG.app_riparia='<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="M9 4C37 13 10 30 36 44" fill="none" stroke="#4b9661" stroke-width="20"/><path d="M9 4C37 13 10 30 36 44" fill="none" stroke="#a6d89b" stroke-width="15"/><path d="M9 4C37 13 10 30 36 44" fill="none" stroke="#329bc9" stroke-width="6"/><path d="M26 9l10-4m-2-2l2 2-1 3M30 36l-11 5m1-3l-1 3 3 1" fill="none" stroke="#1d4c38" stroke-width="2"/></svg>';
const base=window.ribbonBuild;if(base)window.ribbonBuild=function(){install();return base.apply(this,arguments);};
install();setTimeout(()=>{if(typeof ribbonBuild==='function')ribbonBuild();},0);
window.GeoMineRiparianAPP={open,generate,cancel,widthNumber,federalWidth,engine,validate};
})();

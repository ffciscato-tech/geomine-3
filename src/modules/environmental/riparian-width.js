/* Largura geométrica local estimada de uma calha mapeada.
   Não identifica fluxo, leito regular ou confluências. As seções devem ser revistas.
   Sem área/perímetro, caixa envolvente ou largura global substituindo a seção local. */
(function(){
'use strict';
function engine(){
  // Autocontido: serializado para o worker; não lê nem modifica o estado do mapa.
  const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
  function measure(rings,{step=5}={}){
    if(!Number.isFinite(step)||step<=0)throw Error('O intervalo de medição deve ser positivo, em metros.');
    if(!Array.isArray(rings)||rings.length!==1)throw Error('Estimativa automática: separe as partes da calha. Polígonos com ilhas ou furos exigem largura informada ou análise específica.');
    const raw=rings[0];
    if(!Array.isArray(raw)||raw.length<3)throw Error('Calha sem anel válido para estimar a largura.');
    if(raw.length>60000)throw Error('Calha muito detalhada: processe uma cópia dividida em trechos menores.');
    if(raw.some(p=>!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1])))throw Error('Coordenada inválida na calha.');
    const origin=raw[0],ring=[];
    for(const p of raw){const q=[p[0]-origin[0],p[1]-origin[1]],last=ring.at(-1);if(!last||q[0]!==last[0]||q[1]!==last[1])ring.push(q);}
    if(ring.length>1&&ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1])ring.pop();
    if(ring.length<3)throw Error('Calha degenerada: são necessários três vértices distintos.');
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,twiceArea=0;
    ring.forEach((p,i)=>{minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);twiceArea+=cross(p,ring[(i+1)%ring.length]);});
    const span=Math.max(maxX-minX,maxY-minY),eps=Math.max(1e-8,span*1e-12),offset=eps*16;
    if(!Number.isFinite(span)||!Number.isFinite(twiceArea)||Math.abs(twiceArea)<=eps*span)throw Error('Calha degenerada ou sem área mensurável.');
    // Only collapse consecutive floating-point duplicates in the measurement copy.
    // The source shoreline and clipping geometry remain unchanged.
    const compact=[];
    for(const p of ring){const q=compact.at(-1);if(!q||Math.hypot(p[0]-q[0],p[1]-q[1])>offset*4)compact.push(p);}
    while(compact.length>1&&Math.hypot(compact[0][0]-compact.at(-1)[0],compact[0][1]-compact.at(-1)[1])<=offset*4)compact.pop();
    if(compact.length<3)throw Error('Calha degenerada após remover duplicatas numéricas.');
    ring.splice(0,ring.length,...compact);
    const sign=Math.sign(twiceArea),edges=ring.map((a,i)=>{
      const b=ring[(i+1)%ring.length],v=[b[0]-a[0],b[1]-a[1]],length=Math.hypot(...v);
      if(length<=offset*4)throw Error('A calha contém arestas menores que a tolerância geométrica. Revise uma cópia dos dados.');
      return {a,b,v,length,i,n:[-v[1]*sign/length,v[0]*sign/length],box:[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])]};
    });
    /* Seções a cada `step` metros AO LONGO DO PERÍMETRO. Antes era uma seção
       por aresta (no mínimo), e a margem traçada no MDT de 15 cm (arestas de
       ~20 cm) dava dezenas de milhares de seções numa calha de 3 km. */
    const perimeter=edges.reduce((s,e)=>s+e.length,0),sampleCount=Math.max(1,Math.round(perimeter/step));
    if(sampleCount>4000)throw Error('Mais de 4.000 seções de margem nesta feição. Divida a calha em trechos menores ou aumente o intervalo de medição.');
    // Árvore de caixas para raios e controle topológico; o custo não é n² por seção.
    function tree(items){
      const box=[Infinity,Infinity,-Infinity,-Infinity];
      for(const e of items){box[0]=Math.min(box[0],e.box[0]);box[1]=Math.min(box[1],e.box[1]);box[2]=Math.max(box[2],e.box[2]);box[3]=Math.max(box[3],e.box[3]);}
      if(items.length<=8)return {box,items};
      const axis=box[2]-box[0]>=box[3]-box[1]?0:1;
      items.sort((a,b)=>(a.box[axis]+a.box[axis+2])-(b.box[axis]+b.box[axis+2]));
      const mid=items.length>>1;return {box,left:tree(items.slice(0,mid)),right:tree(items.slice(mid))};
    }
    const root=tree(edges.slice());let operations=0;
    // orçamento proporcional ao trabalho: controle topológico (arestas) + seções
    const limit=Math.max(8000000,edges.length*400+sampleCount*25000);
    function budget(){if(++operations>limit)throw Error('A geometria excedeu o limite de cálculo. Divida a calha em trechos menores.');}
    function overlaps(a,b){return a[0]<=b[2]+eps&&a[2]>=b[0]-eps&&a[1]<=b[3]+eps&&a[3]>=b[1]-eps;}
    function crosses(a,b){
      const ac=[b.a[0]-a.a[0],b.a[1]-a.a[1]],ad=[b.b[0]-a.a[0],b.b[1]-a.a[1]],ca=[a.a[0]-b.a[0],a.a[1]-b.a[1]],cb=[a.b[0]-b.a[0],a.b[1]-b.a[1]];
      const tol=eps*(a.length+b.length),s=x=>Math.abs(x)<=tol?0:Math.sign(x);
      return s(cross(a.v,ac))*s(cross(a.v,ad))<=0&&s(cross(b.v,ca))*s(cross(b.v,cb))<=0;
    }
    for(const e of edges){
      const stack=[root];while(stack.length){const node=stack.pop();budget();if(!overlaps(e.box,node.box))continue;
        if(node.items){for(const f of node.items){if(f.i<=e.i+1||(e.i===0&&f.i===edges.length-1))continue;if(overlaps(e.box,f.box)&&crosses(e,f))throw Error('A calha cruza ou toca a própria borda. Corrija a geometria antes de estimar a largura.');}}
        else stack.push(node.left,node.right);
      }
      const next=edges[(e.i+1)%edges.length];
      if(Math.abs(cross(e.v,next.v))<=eps*(e.length+next.length)&&dot(e.v,next.v)<0)throw Error('A calha contém uma borda sobreposta. Corrija a geometria antes de estimar a largura.');
    }
    function boxDistance(box,p,d,best){
      let lo=0,hi=best;
      for(let k=0;k<2;k++){
        if(Math.abs(d[k])<1e-14){if(p[k]<box[k]-eps||p[k]>box[k+2]+eps)return Infinity;}
        else {let a=(box[k]-eps-p[k])/d[k],b=(box[k+2]+eps-p[k])/d[k];if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return Infinity;}
      }
      return lo;
    }
    function ray(p,d,skip=-1){
      let best=Infinity,hits=[];const stack=[root];
      while(stack.length){const node=stack.pop();budget();const near=boxDistance(node.box,p,d,best+eps);if(!Number.isFinite(near)||near>best+eps)continue;
        if(node.items){for(const edge of node.items){
          if(edge.i===skip)continue;budget();const den=cross(d,edge.v);if(Math.abs(den)<=1e-12*edge.length)continue;
          const ap=[edge.a[0]-p[0],edge.a[1]-p[1]],t=cross(ap,edge.v)/den,u=cross(ap,d)/den;
          if(t<=eps||u<-eps/edge.length||u>1+eps/edge.length||t>best+eps)continue;
          if(t<best-eps){best=t;hits=[edge];}else hits.push(edge);
        }}else{
          const a=boxDistance(node.left.box,p,d,best+eps),b=boxDistance(node.right.box,p,d,best+eps);
          if(a<b){if(Number.isFinite(b)&&b<=best+eps)stack.push(node.right);if(Number.isFinite(a)&&a<=best+eps)stack.push(node.left);}else{if(Number.isFinite(a)&&a<=best+eps)stack.push(node.left);if(Number.isFinite(b)&&b<=best+eps)stack.push(node.right);}
        }
      }
      return Number.isFinite(best)?{distance:best,point:[p[0]+d[0]*best,p[1]+d[1]*best],hits}:null;
    }
    function section(center,normal){
      let best=null;
      // Ângulos relativos à margem: invariância à rotação, incluindo a normal exata.
      for(let k=0;k<12;k++){
        const angle=k*Math.PI/12,c=Math.cos(angle),s=Math.sin(angle),d=[normal[0]*c-normal[1]*s,normal[0]*s+normal[1]*c];
        const plus=ray(center,d),minus=ray(center,[-d[0],-d[1]]);if(!plus||!minus)continue;
        // Bordas adjacentes de uma quina não são margens opostas. Evita cordas
        // curtas diagonais entre uma margem e o fechamento artificial do trecho.
        let opposition=0;
        for(const a of plus.hits)for(const b of minus.hits){if(dot(a.n,d)<-.15&&dot(b.n,d)>.15)opposition=Math.max(opposition,-dot(a.n,b.n));}
        if(opposition<.5)continue;
        const width=plus.distance+minus.distance;
        if(width>offset*4&&(!best||width<best.width))best={width,section:[minus.point,plus.point],opposition};
      }
      return best;
    }
    const world=p=>[p[0]+origin[0],p[1]+origin[1]],segments=[],warnings=new Set();
    warnings.add('Largura geométrica estimada: revisar seções, curvas, confluências e extremidades. O polígono não identifica a direção do fluxo.');
    /* trechos de margem de comprimento h = perímetro/n: cada um leva os
       vértices originais que contém (a faixa de APP parte da borda real) */
    const h=perimeter/sampleCount,pieces=[];
    {
      const at=(e,d)=>[e.a[0]+e.v[0]*d/e.length,e.a[1]+e.v[1]*d/e.length];
      const add=(list,p)=>{const u=list.at(-1);if(!u||u[0]!==p[0]||u[1]!==p[1])list.push(p);};
      /* a seção de cada trecho sai do MEIO da sua porção de aresta mais longa:
         longe dos vértices (numa quina, a única corda válida corre sobre a borda) */
      let cur={pts:[edges[0].a],best:null},next=h,acc=0;
      const porcao=(e,a,b)=>{if(!cur.best||b-a>cur.best.b-cur.best.a)cur.best={e,a,b};};
      for(const e of edges){
        let from=0;
        while(pieces.length<sampleCount-1&&next<=acc+e.length){
          const d=next-acc,p=at(e,d);porcao(e,from,d);
          add(cur.pts,p);pieces.push(cur);cur={pts:[p],best:null};from=d;next+=h;
        }
        porcao(e,from,e.length);add(cur.pts,e.b);acc+=e.length;
      }
      pieces.push(cur);
      for(const q of pieces)q.mid=at(q.best.e,(q.best.a+q.best.b)/2);
    }
    for(let k=0;k<pieces.length;k++){
        const e=pieces[k].best.e,mid=pieces[k].mid;
        const inside=[mid[0]+e.n[0]*offset,mid[1]+e.n[1]*offset],hit=ray(inside,e.n,e.i);
        if(!hit)throw Error('Não foi possível encontrar a margem oposta junto à seção '+(segments.length+1)+'. Revise ou divida a calha.');
        const normalWidth=hit.distance+offset;
        let depth=normalWidth/2,found=null;
        // Recentrar perto da margem original impede medir o meio de todo o rio
        // quando a normal de uma extremidade segue longitudinalmente a calha.
        for(let pass=0;pass<3;pass++){
          const candidate=section([mid[0]+e.n[0]*depth,mid[1]+e.n[1]*depth],e.n);
          if(!candidate)throw Error('Seção '+(segments.length+1)+' ambígua: não há margens opostas suficientes para estimar a largura. Revise ou divida a calha.');
          found=candidate;const nextDepth=Math.min(normalWidth/2,candidate.width/2);
          if(Math.abs(depth-nextDepth)<=eps*8)break;depth=nextDepth;
        }
        if(!found||!Number.isFinite(found.width)||found.width<=0)throw Error('Largura local inválida. Nenhuma estimativa foi concluída.');
        const warning=normalWidth>found.width*1.5?'Extremidade ou mudança de direção: conferir a seção reposicionada.':found.opposition<.94?'Margens não paralelas: conferir a seção estimada.':undefined;
        if(warning)warnings.add(warning);
        // Remove apenas ruído de ponto flutuante (p.ex. 49,99999999994 m em
        // uma seção de 50 m). Isto não expressa a precisão do levantamento.
        const width=Math.round(found.width*1e6)/1e6;
        if(!(width>0))throw Error('Largura inferior à resolução numérica do cálculo. Revise a calha.');
        segments.push({line:pieces[k].pts.map(world),width,section:found.section.map(world),...(warning?{warning}:{})});
    }
    return {segments,warnings:[...warnings]};
  }
  return {measure};
}
window.GeoMineRiparianWidth={engine};
})();

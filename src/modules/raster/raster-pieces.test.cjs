/* Apagar pedaços de raster: região conexa, raster de um pedaço só, volume do corte e desfazer.
   Só grades sintéticas. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function carrega(extra={}){
  const avisos=[],ctx={console,avisos,toast:t=>avisos.push(t),cmdLog:()=>{},confirm:()=>ctx.resposta,resposta:true,refreshUI:()=>{},renderRaster:r=>{r.desenhos=(r.desenhos||0)+1;},
    S:{rasters:[],undo:[],workCRS:'EPSG:31983'},undoPush:a=>ctx.S.undo.push(a),...extra};
  ctx.window=ctx;vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'raster-pieces.js'),'utf8'),ctx,{filename:'raster-pieces.js'});
  return ctx;
}
/* grade a partir de linhas de texto: '.' = NoData, dígito = cota */
const grade=(linhas,cs=1)=>{const nr=linhas.length,nc=linhas[0].length,z=new Float32Array(nc*nr);
  linhas.forEach((l,r)=>[...l].forEach((ch,c)=>{z[r*nc+c]=ch==='.'?NaN:+ch;}));return {nc,nr,cs,xll:100,yll:200,z,native:true};};
const texto=d=>{const o=[];for(let r=0;r<d.nr;r++){let s='';for(let c=0;c<d.nc;c++){const v=d.z[r*d.nc+c];s+=Number.isFinite(v)?String(v):'.';}o.push(s);}return o;};

test('pedaço: região conexa por 8 vizinhos, com contagem e caixa; NoData e fora da grade não têm pedaço',()=>{
  const {GeoMineRasterPieces:P}=carrega();
  const d=grade(['11...22',
                 '1.1..2.',
                 '..1....',
                 '...3...',
                 '5.....4']);
  const a=P.pedaco(d,0,0);assert.equal(a.total,6,'o 3 da diagonal pertence ao mesmo pedaço');
  assert.deepEqual([a.r0,a.r1,a.c0,a.c1],[0,3,0,3]);
  assert.equal(P.pedaco(d,0,5).total,3);assert.equal(P.pedaco(d,4,0).total,1);assert.equal(P.pedaco(d,4,6).total,1);
  assert.equal(P.pedaco(d,0,3),null);assert.equal(P.pedaco(d,-1,0),null);assert.equal(P.pedaco(d,0,7),null);
  assert.equal(P.validas(d),11);
  assert.deepEqual([...P.maisProxima(d,3,4,1)],[3,3]);assert.equal(P.maisProxima(d,2,5,0),null);assert.equal(P.maisProxima(d,2,4,1),null,'a diagonal fica fora do raio 1');assert.equal(P.maisProxima(d,2,4,2).length,2,'empate: qualquer das duas vizinhas serve');
});

test('pedaço com forma difícil: espiral, anel com miolo e grade grande numa só passada',()=>{
  const {GeoMineRasterPieces:P}=carrega();
  const esp=grade(['1111111',
                   '......1',
                   '11111.1',
                   '1...1.1',
                   '1.111.1',
                   '1.....1',
                   '1111111']);
  assert.equal(P.pedaco(esp,4,2).total,P.validas(esp),'a espiral inteira é um pedaço');
  const anel=grade(['11111','1...1','1.2.1','1...1','11111']);
  assert.equal(P.pedaco(anel,0,0).total,16);assert.equal(P.pedaco(anel,2,2).total,1,'o miolo é outro pedaço');
  /* 1200 × 1000 células com uma faixa de NoData separando dois blocos */
  const nc=1200,nr=1000,z=new Float32Array(nc*nr).fill(5);for(let r=0;r<nr;r++)z[r*nc+700]=NaN;
  const g={nc,nr,cs:.2,xll:0,yll:0,z},t0=Date.now(),e=P.pedaco(g,10,10),d2=P.pedaco(g,10,900);
  assert.equal(e.total,700*nr);assert.equal(d2.total,499*nr);assert.ok(Date.now()-t0<3000,'rápido o bastante');
});

test('apagar o pedaço: vira NoData, o resto fica, e o Ctrl+Z repõe as mesmas cotas',()=>{
  const ctx=carrega(),P=ctx.GeoMineRasterPieces;
  const d=grade(['111..22','111..22','.......','3333333']),antes=texto(d);
  const r={id:7,name:'MDT de teste',d,_st:{},_url:'x'};ctx.S.rasters.push(r);
  const out=P.apagaPedaco(r,0,5);
  assert.equal(out.celulas,4);assert.equal(out.area,4);
  assert.deepEqual(texto(d),['111....','111....','.......','3333333']);
  assert.equal(r._st,null);assert.equal(r._url,null);assert.equal(r._dataRev,1);assert.equal(r.desenhos,1);
  assert.equal(ctx.S.undo.length,1);assert.equal(ctx.S.undo[0].t,'rasterpiece');
  assert.match(ctx.avisos.at(-1),/Pedaço apagado.*Ctrl\+Z/);
  assert.equal(P.undo(ctx.S.undo[0]),true);assert.deepEqual(texto(d),antes);assert.equal(ctx.S.undo.length,0);
  /* a grade foi trocada depois (novo corte): o pedaço antigo não é reposto por cima */
  P.apagaPedaco(r,3,0,{semPergunta:true});const a=ctx.S.undo[0];r.d=grade(['1']);
  assert.equal(P.undo(a),false);assert.match(ctx.avisos.at(-1),/raster mudou/);
});

test('cuidados: raster de um pedaço só não some; corpo principal pede confirmação',()=>{
  const ctx=carrega(),P=ctx.GeoMineRasterPieces;
  const um={id:1,name:'inteiro',d:grade(['111','111'])};ctx.S.rasters.push(um);
  assert.equal(P.apagaPedaco(um,0,0),false);assert.match(ctx.avisos.at(-1),/pedaço só/);assert.equal(P.validas(um.d),6);
  const r={id:2,name:'corte',d:grade(['11111.2','11111..'])};ctx.S.rasters.push(r);
  ctx.resposta=false;assert.equal(P.apagaPedaco(r,0,0),false);assert.equal(P.validas(r.d),11,'recusado: nada muda');
  ctx.resposta=true;assert.equal(P.apagaPedaco(r,0,0).celulas,10);assert.deepEqual(texto(r.d),['......2','.......']);
});

test('quais rasters aceitam: gerados em memória sim; TIN e os lidos do arquivo original não',()=>{
  const {GeoMineRasterPieces:P}=carrega({precisaFonte:d=>!!d.reduzida});
  const d=()=>grade(['12','34']);
  assert.equal(P.motivo({d:d(),src:{kind:'cava2-clipped'}}),'');
  assert.equal(P.motivo({d:d()}),'');
  assert.match(P.motivo({d:Object.assign(d(),{tin:{}})}),/TIN/);assert.match(P.motivo({d:d(),tinPuro:true}),/TIN/);
  for(const r of [{d:Object.assign(d(),{_img0:{}})},{d:Object.assign(d(),{_full:{}})},{d:d(),originalSource:{}},{d:d(),_projectNativeBinding:{}},{d:Object.assign(d(),{reduzida:1})}])
    assert.match(P.motivo(r),/arquivo original/);
  assert.equal(P.motivo({}),'sem grade');
});

test('MDT recortado: volume, células e área do corte acompanham o pedaço apagado e o desfazer',()=>{
  /* terreno plano na cota 1 (amostrador simples); pilha com cotas 3 e 5 */
  const ctx=carrega({sampleZbil:()=>1}),P=ctx.GeoMineRasterPieces;
  const terreno={id:1,name:'MDT',d:grade(['1'])},d=grade(['33..5','33..5'],2);
  const vol={volume:(4*2+2*4)*4,validCells:6,area:24,kind:'pilha'};
  const r={id:2,name:'DCE — MDT recortado',d,src:{kind:'cava2-clipped',sourceRasterId:1,volumes:vol}};
  ctx.S.rasters.push(terreno,r);
  ctx.CCMGISCava2={state:{desenhos:[{resultadoCorte:{surfaceId:2,volumes:{...vol}}}]},syncStyles(){this.sinc=(this.sinc||0)+1;}};
  const out=P.apagaPedaco(r,0,4);
  assert.equal(out.celulas,2);assert.equal(out.dv,2*4*4,'2 células × (5 − 1) m × 4 m²');
  assert.equal(vol.volume,32);assert.equal(vol.validCells,4);assert.equal(vol.area,16);
  assert.equal(ctx.CCMGISCava2.state.desenhos[0].resultadoCorte.volumes.volume,32);assert.equal(ctx.CCMGISCava2.sinc,1);
  P.undo(ctx.S.undo[0]);
  assert.equal(vol.volume,64);assert.equal(vol.validCells,6);assert.equal(vol.area,24);
  assert.equal(ctx.CCMGISCava2.state.desenhos[0].resultadoCorte.volumes.validCells,6);
});

test('toque no mapa: acha o raster de cima, usa a folga do dedo só no fundo livre e avisa junto de feição',()=>{
  /* mapa de mentira: 1 px = 1 m, latlng = coordenada de trabalho */
  const ponto=(x,y)=>({x,y,add(v){return ponto(x+v[0],y+v[1]);}});
  const ctx=carrega({fromWGS:(crs,lng,lat)=>[lng,lat],map:{latLngToContainerPoint:ll=>ponto(ll.lng,ll.lat),containerPointToLatLng:p=>({lng:p.x,lat:p.y})}});
  const P=ctx.GeoMineRasterPieces;
  const cima={id:'c',name:'recortado',d:grade(['111..2',
                                               '111...',
                                               '111...']),src:{kind:'outro'}};
  const baixo={id:'b',name:'importado',d:Object.assign(grade(['333333','333333','333333']),{_img0:{}})};
  ctx.S.rasters=[cima,baixo];ctx.stackSync=()=>[{t:'R',o:cima},{t:'R',o:baixo}];
  const em=(col,lin)=>({latlng:{lng:100+col+.5,lat:200+3-lin-.5}});
  /* célula com valor no raster de cima */
  assert.deepEqual([P.alvoDoToque(em(5,0)).r.id,P.alvoDoToque(em(5,0)).linha,P.alvoDoToque(em(5,0)).coluna],['c',0,5]);
  /* NoData no de cima: sem folga quem responde é o de baixo; com a folga do dedo, a célula vizinha do de cima */
  assert.equal(P.alvoDoToque(em(4,1),false).r.id,'b');
  ctx.S.touch=true;const a=P.alvoDoToque(em(4,1),true);assert.deepEqual([a.r.id,a.linha,a.coluna],['c',0,5]);
  /* junto de feição: avisa quando ali há um pedaço solto apagável; no corpo principal, no importado e no vazio, silêncio */
  assert.equal(P.avisoPerto(em(5,0),'Recortada'),true);assert.match(ctx.avisos.at(-1),/Nada apagado.*Recortada/);
  const n=ctx.avisos.length;
  assert.equal(P.avisoPerto(em(1,1),'Recortada'),false,'corpo principal');
  assert.equal(P.avisoPerto(em(4,1),'Recortada'),false,'o de baixo é lido do arquivo');
  assert.equal(P.avisoPerto({latlng:{lng:50,lat:50}},'Recortada'),false,'fora de tudo');
  assert.equal(ctx.avisos.length,n);assert.deepEqual(texto(cima.d),['111..2','111...','111...'],'o aviso não apaga nada');
  /* fundo livre: o toque apaga o pedaço solto; no importado só avisa */
  assert.equal(P.mapClick(em(5,0)),true);assert.deepEqual(texto(cima.d),['111...','111...','111...']);
  assert.equal(P.mapClick(em(5,2)),true);assert.match(ctx.avisos.at(-1),/lido do arquivo original/);assert.equal(P.validas(baixo.d),18);
  assert.equal(P.mapClick({latlng:{lng:50,lat:50}}),false);
  /* ao lado do corpo principal a folga do dedo não vale: nem pergunta, nem aviso */
  ctx.stackSync=()=>[{t:'R',o:cima}];const m=ctx.avisos.length;
  assert.equal(P.mapClick(em(4,1)),false);assert.equal(ctx.avisos.length,m);assert.equal(P.validas(cima.d),9);
});

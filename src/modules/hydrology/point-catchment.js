/* One point, one contributing area. Independent of the filled hydrology grid,
   rain, CN, barriers and stored D8/accumulation products. */
(function(root){
'use strict';
const panel=document.createElement('div'),$=id=>document.getElementById(id),gen=()=>root.GeoMineSessionAutosave?.state?.generation;
const fmt=(v,d=2)=>Number(v).toLocaleString('pt-BR',{maximumFractionDigits:d});
let job=null,armed=null,context=null,describing=0,anchor=null,pointMarker=null;
panel.id='secPointCatchment';panel.className='hsec';panel.style.display='none';
panel.innerHTML=`<h2>Área contribuinte no ponto</h2>
<div class="hint">Marque o exutório: um ponto da linha de fluxo ou qualquer ponto do MDT. O resultado é toda a área que drena até ele.</div>
<label class="field" for="pointCatchmentRaster">MDT</label><select id="pointCatchmentRaster"></select>
<div class="hint" id="pointCatchmentInfo" style="margin:7px 0"></div>
<div id="pointCatchmentLocate" style="display:none;align-items:center;gap:6px;margin:0 0 8px">
<span class="hint" style="margin:0 2px 0 0">Trazer o .tif:</span>
<button class="mini" id="pointCatchmentDrive" style="width:38px;min-width:38px;height:34px;min-height:34px;margin:0;padding:0;display:inline-flex;align-items:center;justify-content:center;background:var(--amber);color:#1a1206" title="Buscar no Google Drive: procura o arquivo pelo nome gravado no projeto, baixa e vincula" aria-label="Buscar no Google Drive"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 10.5 3.8 3.8 0 0 1 17.5 18"/><path d="M12 11.5v7"/><path d="m9 15.8 3 3 3-3"/></svg></button>
<button class="mini" id="pointCatchmentDrivePick" style="width:38px;min-width:38px;height:34px;min-height:34px;margin:0;padding:0;display:inline-flex;align-items:center;justify-content:center" title="Escolher no Google Drive: abre o Drive na pasta dos originais" aria-label="Escolher no Google Drive"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9.5a2 2 0 0 0-2-2h-7L10 5H5a2 2 0 0 0-2 2.5Z"/><path d="M8.5 16.5 12 11l3.5 5.5Z"/></svg></button>
<button class="mini" id="pointCatchmentLocal" style="width:38px;min-width:38px;height:34px;min-height:34px;margin:0;padding:0;display:inline-flex;align-items:center;justify-content:center" title="Do aparelho: escolher o arquivo no armazenamento deste aparelho" aria-label="Escolher no aparelho"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="2.5" width="14" height="19" rx="2.2"/><path d="M10.5 18.5h3"/></svg></button>
</div>
<label class="gmp-sw" id="pointCatchmentResampleRow" style="display:none;margin:0 0 6px" title="Desligado: calcula nas cotas do TIFF nativo. Ligado: calcula numa grade com a célula escolhida (média das cotas)"><span>Reamostrar o MDT para o cálculo</span><input type="checkbox" id="pointCatchmentResample"></label>
<div id="pointCatchmentResampleBox" style="display:none;margin:0 0 8px">
<select id="pointCatchmentCell" aria-label="Célula da grade reamostrada"></select>
<div class="hint" style="margin:5px 0 0">Direção e acumulação de fluxo D8 da grade inteira, calculadas uma vez: os pontos seguintes saem na hora. O resultado sai identificado como reamostrado.</div>
</div>
<button class="tbtn" id="pointCatchmentMark" style="width:100%;justify-content:center;background:var(--amber);color:#1a1206;font-weight:700">◎ Marcar ponto</button>
<div class="hout" id="pointCatchmentResult" role="status" aria-live="polite" style="white-space:pre-line;margin-top:8px">A área será informada em m² e hectares.</div>
<div class="hint" style="margin-top:8px">Com o ímã (snap) ligado, o toque gruda na linha de fluxo mais próxima, e o painel avisa na hora. Depois o ponto é ajustado ao talvegue do MDT (maior acumulação de fluxo ao lado), sem descer o rio; o marcador mostra o exutório usado. A área é toda a que drena até ele.</div>
<button class="mini" id="pointCatchmentRain" style="margin-top:12px">Chuva e inundação…</button>`;
($('secHidroBacia')?.parentElement||document.body).appendChild(panel);
// statusHead: primeira linha fixa durante um cálculo (o aviso do snap).
let statusHead='';
const status=t=>{$('pointCatchmentResult').textContent=statusHead?statusHead+'\n'+t:t;};
const rasterName=r=>String(r.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
// Legacy projects did not tag derived direction/accumulation grids. They are
// not terrain elevations and must not make the native MDT choice ambiguous.
const derivedName=r=>!r.quantity&&!r.d?.quantity&&/^(direcao (?:de )?fluxo|acumulacao (?:de )?fluxo|flow direction|flow accumulation|declividade|hillshade|sombreado)\b/.test(rasterName(r));
const rasters=()=>S.rasters.filter(r=>root.GeoMineChannelDEM.isElevation(r)&&!derivedName(r));
const selected=()=>rasters().find(r=>String(r.id)===$('pointCatchmentRaster').value);
const aborted=()=>Object.assign(Error('Consulta cancelada: o projeto ou o MDT mudou.'),{name:'AbortError'});
function scale(s){const p=proj4(s.sourceCRS).oProj,k=Number(p.to_meter??1);if(p.projName==='longlat'||!Number.isFinite(k)||k<=0)throw Error('Use um MDT com CRS projetado para calcular a área em metros quadrados.');return k;}
/* Memória para a análise: aparelhos móveis fecham a aba bem antes de um
   computador. Bacias que não cabem na resolução nativa são recalculadas numa
   grade agregada (média das cotas), e o resultado diz qual grade foi usada. */
/* O cálculo é SEMPRE feito nas cotas do TIFF nativo do MDT: nenhuma grade
   reduzida, média de cotas ou arredondamento entra no resultado. A grade
   guardada no projeto serve só para desenhar o mapa. Sem o .tif aberto na
   sessão, a ferramenta não calcula e pede o arquivo. */
/* Direção e acumulação D8 da última grade usada: os pontos seguintes no mesmo
   MDT não recalculam nada. Vale enquanto a grade e as cotas forem as mesmas. */
let routed=null;
const gridKey=(r,g)=>JSON.stringify([r.id,g.nc,g.nr,g.cs,g.csy,g.xll,g.yll]);
const memoryMB=()=>root.GeoMineImportHandoff?.mobile?.()||navigator.maxTouchPoints>1?256:navigator.deviceMemory>=8?768:384;
/* Quando a bacia não cabe na memória na resolução nativa, a célula cresce o
   mínimo possível: 2×, 3×, 4×… em vez de dobrar a cada tentativa. */
const FACTORS=[1,2,3,4,6,8,12,16,24,32,48,64];
function coarsen(base,factor){
  const nc=Math.ceil(base.nc/factor),nr=Math.ceil(base.nr/factor),cy=base.csy||base.cs;
  return {...base,nc,nr,cs:base.cs*factor,csy:cy*factor,yll:base.yll+base.nr*cy-nr*cy*factor,float32:true,noData:null,
    readWindow:async([x0,y0,x1,y1])=>{
      const W=x1-x0,H=y1-y0,sum=new Float64Array(W*H),n=new Uint16Array(W*H),out=new Float32Array(W*H),
        X0=x0*factor,X1=Math.min(base.nc,x1*factor),Y0=y0*factor,Y1=Math.min(base.nr,y1*factor);
      // Lê o TIFF em pedaços pequenos (até 2.048 colunas e 260 mil células):
      // janelas largas estouravam o limite de leitura do leitor no iPad.
      for(let xa=X0;xa<X1;xa+=2048){
        const xb=Math.min(X1,xa+2048),width=xb-xa,step=Math.max(1,Math.floor(260000/width));
        for(let y=Y0;y<Y1;y+=step){
          const yEnd=Math.min(Y1,y+step),values=await base.readWindow([xa,y,xb,yEnd]);
          if(values.length!==width*(yEnd-y))throw Error('Bloco incompleto do MDT original.');
          for(let r=y;r<yEnd;r++){const line=(Math.floor(r/factor)-y0)*W-x0,offset=(r-y)*width-xa;
            for(let c=xa;c<xb;c++){const v=values[offset+c];if(Number.isFinite(v)&&(base.noData==null||v!==base.noData)){const i=line+Math.floor(c/factor);sum[i]+=v;n[i]++;}}}
        }
      }
      for(let i=0;i<out.length;i++)out[i]=n[i]?Math.fround(sum[i]/n[i]):NaN;
      return out;
    }};
}
/* REAMOSTRAGEM POR ESCOLHA DA PESSOA. Desligada, vale a regra de sempre: cotas
   do TIFF nativo. Ligada, o cálculo usa uma grade com a célula escolhida
   (média das cotas do TIFF), e o resultado diz isso. A escolha fica guardada. */
const RESAMPLE_KEY='geomine.hidro.reamostragem.v1';
let resample={on:false,cell:1},resampleNative=null;
try{const saved=JSON.parse(localStorage.getItem(RESAMPLE_KEY)||'null');if(saved&&Number(saved.cell)>0)resample={on:saved.on===true,cell:Number(saved.cell)};}catch(_){}
const resampleSave=()=>{try{localStorage.setItem(RESAMPLE_KEY,JSON.stringify(resample));}catch(_){}};
// Fatores inteiros da célula nativa que ainda deixam uma grade útil.
const resampleFactors=g=>[2,3,4,5,6,8,10,12,16,20,24,32,48,64].filter(f=>Math.ceil(g.nc/f)>=64&&Math.ceil(g.nr/f)>=64);
function resampleOptions(g){
  // g: {nc,nr,res} do TIFF nativo, ou null quando o MDT não está aberto.
  resampleNative=g;$('pointCatchmentResampleRow').style.display=g?'flex':'none';
  const select=$('pointCatchmentCell'),factors=g?resampleFactors(g):[];
  if(!factors.length){$('pointCatchmentResampleRow').style.display='none';$('pointCatchmentResampleBox').style.display='none';return;}
  select.replaceChildren(...factors.map(f=>new Option(fmt(g.res*f,2)+' m · '+f+'× a célula nativa · '+fmt(Math.ceil(g.nc/f),0)+' × '+fmt(Math.ceil(g.nr/f),0)+' células',String(f))));
  let best=factors[0];for(const f of factors)if(Math.abs(g.res*f-resample.cell)<Math.abs(g.res*best-resample.cell))best=f;
  select.value=String(best);$('pointCatchmentResample').checked=resample.on;
  $('pointCatchmentResampleBox').style.display=resample.on?'block':'none';
}
/* Fator em uso: 1 = nativo. */
function resampleFactor(g){
  if(!resample.on)return 1;const factors=resampleFactors(g);if(!factors.length)return 1;
  const chosen=Number($('pointCatchmentCell').value);
  return factors.includes(chosen)?chosen:factors.reduce((a,f)=>Math.abs(g.res*f-resample.cell)<Math.abs(g.res*a-resample.cell)?f:a,factors[0]);
}
function controls(){
  const busy=!!job;
  $('pointCatchmentRaster').disabled=busy;$('pointCatchmentResample').disabled=busy;$('pointCatchmentCell').disabled=busy;
  $('pointCatchmentMark').textContent=busy?'Cancelar cálculo':armed&&S.tool==='basin'?'Cancelar marcação':'◎ Marcar ponto';
  $('pointCatchmentMark').disabled=false;
}
function cancel(){job?.controller.abort();armed=null;if(S.tool==='basin')setTool('select');controls();}
function resetContext(){const key=String(S.projectId)+'|'+String(gen());if(context!==key){cancel();pointMarker?.remove();pointMarker=null;context=key;routed=null;describing++;$('pointCatchmentRaster').value='';status('A área será informada em m² e hectares.');}}
async function describe(){
  const r=selected(),token=++describing,project=S.projectId,generation=gen();let s;
  const current=()=>token===describing&&selected()===r&&project===S.projectId&&generation===gen()&&!job;
  if(!r){resampleOptions(null);$('pointCatchmentInfo').textContent='Selecione o MDT.';$('pointCatchmentLocate').style.display=(true)?'none':'flex';return;}
  $('pointCatchmentInfo').textContent='Conferindo a resolução…';
  try{s=await root.GeoMineChannelDEM.prepare(r,{workCRS:S.workCRS,isCurrent:current});if(!current())return;
    const k=scale(s);
    $('pointCatchmentInfo').textContent='TIFF nativo: '+fmt(s.grid.cs*k,4)+' × '+fmt(s.grid.csy*k,4)+' m · '+fmt(s.grid.nc,0)+' × '+fmt(s.grid.nr,0)+' células · '+s.sourceCRS;
    $('pointCatchmentLocate').style.display=(true)?'none':'flex';
    resampleOptions({nc:s.grid.nc,nr:s.grid.nr,res:Math.min(s.grid.cs,s.grid.csy||s.grid.cs)*k});
  }catch(e){
    if(!current()||e.name==='AbortError')return;
    const semTiff=e.code==='CHANNEL_NATIVE_MISSING';resampleOptions(null);
    const recusa=semTiff&&r._recusaOriginal?.mensagem;
    $('pointCatchmentInfo').textContent=semTiff?(recusa?'O último arquivo escolhido não foi vinculado: '+recusa+'\n':'')+
      'O arquivo .tif deste MDT não está aberto nesta sessão. O cálculo só é feito no TIFF nativo: traga o arquivo pelos ícones abaixo (nuvem: buscar no Drive · pasta: escolher no Drive · tablet: do aparelho).':e.message;
    $('pointCatchmentLocate').style.display=(!semTiff)?'none':'flex';
    // Sem o Google Drive nesta sessão, só o arquivo do aparelho faz sentido.
    const temDrive=!!root.GeoMineDriveOriginals?.available();
    $('pointCatchmentDrive').style.display=$('pointCatchmentDrivePick').style.display=temDrive?'inline-flex':'none';
  }
  finally{s?.close();}
}
function refresh(){
  resetContext();const previous=$('pointCatchmentRaster').value,list=rasters();
  const named=list.filter(r=>/^(mdt|mde|dtm|dem)(?:\b|_)/.test(rasterName(r)));
  const r=list.find(r=>String(r.id)===previous)||list.find(r=>String(r.id)===String(S.hidro?.sourceRasterId))||list.find(r=>r===S.selRaster)||(list.length===1?list[0]:named.length===1?named[0]:null);
  $('pointCatchmentRaster').replaceChildren(new Option('— selecione o MDT —',''),...list.map(r=>new Option(r.name,String(r.id))));
  $('pointCatchmentRaster').value=r?String(r.id):'';controls();describe();
}
function open(button){anchor=button||anchor||$('pointCatchmentMark');RIB_CAT_ATUAL='hidrologia';refresh();ribbonOpen(panel,anchor,'Área contribuinte no ponto');}
function arm(){
  if(job||armed&&S.tool==='basin'){cancel();status('Consulta cancelada.');return;}
  const r=selected();if(!r){status(rasters().length?'Escolha o MDT no campo acima e toque em Marcar ponto.':'Carregue um MDT original para marcar o ponto.');$('pointCatchmentRaster').focus();return;}
  if(!mapaVista2D())switchView('map');
  armed={r,project:S.projectId,generation:gen()};setTool('basin');controls();
  status('Toque no exutório: na linha de fluxo ou em qualquer ponto do MDT. O marcador mostrará o ponto usado.');
}
/* O MESMO SNAP DO TOQUE, MOSTRADO ANTES DO TOQUE. Com a marcação armada, o
   cursor do ímã (a mira verde das outras ferramentas) aparece sobre a linha
   de fluxo em que o ponto vai grudar. Usa a mesma busca e a mesma tolerância
   de click(): o que a mira mostra é o que o toque usa. */
function snapPreview(latlng){
  if(!armed||S.tool!=='basin'||S.snapOn===false||job)return null;
  try{
    const crs=S.workCRS,tap=fromWGS(crs,latlng.lng,latlng.lat),screen=map.latLngToContainerPoint(latlng),
      side=map.containerPointToLatLng([screen.x+10,screen.y]),sideXY=fromWGS(crs,side.lng,side.lat),
      tolerance=Math.hypot(sideXY[0]-tap[0],sideXY[1]-tap[1])/10*(typeof SNAP_PX==='number'?SNAP_PX:15)*(S.touch?1.6:1),
      lines=S.layers.filter(l=>l.visible!==false&&l.llayer&&map.hasLayer(l.llayer)),
      snap=tolerance>0?root.GeoMineCatchmentSnap.nearest(lines,tap,{tolerance,selected:S.sel,
        visible:(l,f)=>featureVisible(l,f),project:(p,l)=>!l.crs||l.crs===crs?p:proj4(l.crs,crs,p)}):null;
    if(!snap)return null;
    const ll=toWGS(crs,...snap.point);
    return {latlng:L.latLng(ll[1],ll[0]),snapped:true,kind:'linha de fluxo',layer:snap.layer};
  }catch(_){return null;}
}
async function click(latlng){
  if(job)return;
  const a=armed;armed=null;setTool('select');controls();
  if(!a||a.r!==selected()||a.project!==S.projectId||a.generation!==gen()){status('A marcação foi encerrada. Toque em Marcar ponto para iniciar novamente.');return;}
  const r=a.r,q=job={controller:new AbortController(),project:S.projectId,generation:gen(),crs:S.workCRS,r},d=r.d;
  let sampler,timer;
  const current=()=>job===q&&!q.controller.signal.aborted&&q.project===S.projectId&&q.generation===gen()&&q.crs===S.workCRS&&S.rasters.includes(r)&&r.d===d&&selected()===r;
  const check=()=>{if(!current()||sampler&&!sampler.isCurrent())throw aborted();};
  controls();describing++;
  try{
    // Acknowledge the tap before opening a potentially slow original file.
    pointMarker?.remove();
    pointMarker=L.circleMarker(latlng,{pane:'markerPane',radius:6,color:'#b76514',weight:2,fillColor:'#fff',fillOpacity:1,interactive:false}).addTo(map);
    status('Ponto marcado. Lendo o MDT…');
    timer=setInterval(()=>{if(!current())q.controller.abort();},200);
    try{sampler=await root.GeoMineChannelDEM.prepare(r,{workCRS:q.crs,signal:q.controller.signal,isCurrent:current});}
    catch(e){
      if(e.code!=='CHANNEL_NATIVE_MISSING')throw e;
      throw Error('O arquivo .tif deste MDT não está aberto nesta sessão. O cálculo só é feito no TIFF nativo.\nTraga o arquivo pelos ícones acima (nuvem: buscar no Google Drive).');
    }
    check();
    const k=scale(sampler),tap=fromWGS(q.crs,latlng.lng,latlng.lat),screen=map.latLngToContainerPoint(latlng),
      side=map.containerPointToLatLng([screen.x+10,screen.y]),sideXY=fromWGS(q.crs,side.lng,side.lat),
      // Ímã ligado: gruda na linha que estiver a até a distância do snap das
      // outras ferramentas (15 px; 24 px no toque), em qualquer zoom. Antes o
      // limite era de 10 m no terreno, cerca de 2 px na vista geral: o dedo
      // nunca acertava. Ímã desligado: vale o ponto tocado.
      metersPerPixel=Math.hypot(sideXY[0]-tap[0],sideXY[1]-tap[1])/10,
      snapPixels=(typeof SNAP_PX==='number'?SNAP_PX:15)*(S.touch?1.6:1),
      tolerance=S.snapOn===false?0:Math.max(sampler.resolution,metersPerPixel*snapPixels),
      lines=S.layers.filter(l=>l.visible!==false&&l.llayer&&map.hasLayer(l.llayer)),
      snap=tolerance<=0?null:root.GeoMineCatchmentSnap.nearest(lines,tap,{tolerance,selected:S.sel,
        visible:(l,f)=>featureVisible(l,f),project:(p,l)=>!l.crs||l.crs===q.crs?p:proj4(l.crs,q.crs,p)}),
      p=snap?snap.point:tap,seed=sampler.locate(p);
    const ll=toWGS(q.crs,...p);pointMarker.setLatLng([ll[1],ll[0]]).setStyle({color:'#1b3560'});
    // Diz na hora se o toque grudou numa linha: o cálculo pode demorar.
    const grudou=snap?'Ponto grudado na linha “'+snap.layer.name+'” (ajuste de '+fmt(snap.distance,2)+' m).':S.snapOn===false?'Ímã (snap) desligado: usado o ponto tocado.':'Nenhuma linha a até '+fmt(tolerance,1)+' m do toque: usado o ponto tocado.';
    statusHead=grudou;status('Lendo o MDT…');
    // A mira do ímã fica um instante no ponto em que o toque grudou (no dedo não há cursor antes do toque).
    if(snap)try{mostraCursorSnap({latlng:L.latLng(ll[1],ll[0]),snapped:true,kind:'linha de fluxo'});setTimeout(()=>{try{if(S.tool!=='basin')limpaCursorSnap();}catch(_){}} ,2500);}catch(_){}
    if(!seed)throw Error('O ponto está fora do MDT.');
    const engine=root.GeoMineContinuousCatchment,memory=memoryMB(),
      native={...sampler.grid,float32:sampler.float32,unitScale:k,readWindow:sampler.readWindow,isCurrent:current},
      nativeRes=Math.min(native.cs,native.csy||native.cs)*k,
      // Raio de busca do talvegue: o dedo (14 px no terreno), ao menos 3 células
      // e, com linha vetorial, ao menos 3 m de folga entre a linha e o MDT.
      chosen=resampleFactor({nc:native.nc,nr:native.nr,res:nativeRes}),byChoice=chosen>1,workRes=nativeRes*chosen,
      // Raio de busca do talvegue, a regra da versão que funcionou (12/11): o
      // dedo (14 px no terreno), ao menos 3 células e, com linha vetorial, ao
      // menos 3 m de folga entre a linha e o MDT; no máximo 40 m.
      searchM=Math.min(40,Math.max(1.4*Math.hypot(sideXY[0]-tap[0],sideXY[1]-tap[1]),3*workRes,snap?3:0));
    let source=native,factor=1,start={col:seed.col,row:seed.row},adjust=0,result,reached=0,wholeGrid=false;
    if(byChoice){factor=chosen;source=coarsen(native,factor);
      start={col:Math.min(source.nc-1,Math.floor(seed.col/factor)),row:Math.min(source.nr-1,Math.floor(seed.row/factor))};}
    // GRADE INTEIRA, quando cabe na memória (MDT nativo ou grade do projeto):
    // direção e acumulação de fluxo D8 de todas as células, calculadas uma vez
    // e reaproveitadas nos pontos seguintes. MDT maior que isso segue pela
    // janela que cresce a montante, mais abaixo.
    if(source.nc*source.nr*18<=memory*1048576*.8)try{
      const key=gridKey(r,source),cabeca=byChoice?'Grade reamostrada de '+fmt(workRes,2)+' m · ':'',phase=v=>{check();status(cabeca+(v.phase==='read'?'Lendo as cotas da grade'+(Number.isFinite(v.readRows)?' — '+Math.floor(100*v.readRows/source.nr)+'%':''):v.phase==='outlets'?'Preparando as saídas da grade':v.phase==='accumulation'?'Calculando a acumulação de fluxo D8':v.phase==='contour'?'Traçando o contorno':v.phase==='upstream'?'Delimitando a montante':'Calculando a direção de fluxo D8')+'…'+
        (v.cells?'\n'+fmt(v.cells,0)+' células · '+fmt(v.cells*source.cs*(source.csy||source.cs)*k*k/10000,4)+' ha':''));};
      if(!routed||routed.key!==key||routed.d!==d||routed.z!==(d._full?.z||d.z)){
        routed=null;status(cabeca+'Calculando a direção de fluxo D8…');
        const routing=await engine.routeGrid(source,{seed:start,signal:q.controller.signal,maxMemoryMB:Math.max(memory,160),onProgress:phase});check();
        routed={key,d,z:d._full?.z||d.z,routing};
      }
      result=await engine.analyzeRouted(source,routed.routing,start,{searchCells:Math.ceil(searchM/workRes),signal:q.controller.signal,decodedCacheMB:12,tileSize:128,onProgress:phase});check();
      adjust=result.moved?result.snapDistance:0;wholeGrid=true;
      const at=toWGS(q.crs,...sampler.toWork(result.outlet));pointMarker.setLatLng([at[1],at[0]]);
    }catch(e){
      // Faltou memória para a grade inteira: segue pela janela a montante.
      if(e.code!=='memory'&&!(e instanceof RangeError))throw e;
      check();routed=null;result=null;
    }
    if(!wholeGrid)for(;;){
      const res=Math.min(source.cs,source.csy||source.cs)*k;
      status(factor>1?'Bacia grande: calculando em grade de '+fmt(res,2)+' m…':'Ajustando o exutório ao talvegue do MDT…');
      // O exutório é procurado em cada grade: a média das cotas pode deslocar o talvegue.
      const outlet=await engine.locateOutlet(source,start,{searchCells:Math.max(factor>1?2:1,Math.ceil(searchM/res)),signal:q.controller.signal,maxMemoryMB:memory});check();
      if(factor===1||byChoice&&factor===chosen){adjust=outlet.moved?outlet.distance:0;
        const at=toWGS(q.crs,...sampler.toWork([source.xll+(outlet.col+.5)*source.cs,source.yll+(source.nr-outlet.row-.5)*(source.csy||source.cs)]));
        pointMarker.setLatLng([at[1],at[0]]);}
      try{
        result=await engine.analyze(source,{
          seed:{col:outlet.col,row:outlet.row},signal:q.controller.signal,maxMemoryMB:memory,decodedCacheMB:12,tileSize:128,initialRadiusM:reached||undefined,
          onProgress:v=>{check();if(v.window)reached=Math.max(reached,(v.window[2]-v.window[0])*source.cs*k/2);
            status((factor>1?'Grade de '+fmt(res,2)+' m · ':'')+(v.phase==='contour'?'Traçando o contorno':v.phase==='read'?'Lendo cotas nativas':v.phase==='expand'?'Ampliando a busca a montante':v.phase==='routing'?'Conectando o escoamento sem alterar cotas':'Delimitando a montante')+'…'+(v.cells?'\n'+fmt(v.cells,0)+' células · '+fmt((v.areaM2||v.cells*source.cs*(source.csy||source.cs)*k*k)/10000,4)+' ha':''));}
        });check();break;
      }catch(e){
        // Não coube na memória nesta resolução: repete numa grade com o dobro da célula.
        const next=FACTORS[FACTORS.indexOf(factor)+1];
        if(e.code!=='memory'&&!(e instanceof RangeError)||!next||Math.ceil(native.nc/next)<64)throw e;
        check();
        if(byChoice)throw Error('Esta bacia não cabe na memória deste aparelho com a célula de '+fmt(workRes,2)+' m. Escolha uma célula maior na reamostragem e marque o ponto de novo.');
        // O resultado tem de sair do TIFF nativo. Uma grade com média de cotas
        // só é usada se a pessoa aceitar, sabendo que não é a resolução nativa.
        if(factor===1&&!confirm('Esta bacia não cabe na memória deste aparelho na resolução nativa do MDT ('+fmt(nativeRes,2)+' m).\n\n'+
          'OK: calcular numa grade com média das cotas (a partir de '+fmt(nativeRes*next,2)+' m). O resultado NÃO é o do TIFF nativo e sai identificado assim.\n'+
          'Cancelar: não calcular. Para a resolução nativa, use um computador.'))
          throw Error('Bacia grande demais para a memória deste aparelho na resolução nativa ('+fmt(nativeRes,2)+' m). Nada foi calculado. Use um computador para esta bacia.');
        check();factor=next;source=coarsen(native,factor);
        start={col:Math.min(source.nc-1,Math.floor(seed.col/factor)),row:Math.min(source.nr-1,Math.floor(seed.row/factor))};
      }
    }
    const geom=[];let vertices=0;
    for(const ring of result.rings){const out=[];for(const xy of ring){out.push(sampler.toWork(xy));if(++vertices%4096===0){await new Promise(r=>setTimeout(r,0));check();}}geom.push(out);}
    const outlet=sampler.toWork(result.outlet),partial=result.touchesEdge||result.touchesNoData,
      props={AREA_M2:result.areaM2,AREA_HA:result.areaM2/10000,CELULAS:result.cells,
        E_TOQUE:tap[0],N_TOQUE:tap[1],AJUSTE_M:snap?.distance||0,LINHA:snap?.layer.name||'',E_PONTO:p[0],N_PONTO:p[1],AJUSTE_MDT:adjust,E_CELULA:outlet[0],N_CELULA:outlet[1],COTA_M:result.seedZ,
        RES_X_M:result.resolution.x,RES_Y_M:result.resolution.y,RES_MDT_M:nativeRes,MDT:r.name,
        ACUM_CEL:result.cellsAtOutlet??result.cells,
        METODO:(wholeGrid?'D8 — direção e acumulação de fluxo da grade inteira':'D8 — fluxo contínuo em janela a montante')+' · '+(byChoice?'REAMOSTRADO por escolha: grade de '+fmt(workRes,2)+' m ('+factor+'× a célula nativa, média das cotas)':factor>1?'NÃO NATIVO: grade agregada '+factor+'× (média das cotas)':'cotas do TIFF nativo'),LIMITE_DADOS:partial?'Sim':'Não'},
      fields=Object.entries(props).map(([name,value])=>({name,type:typeof value==='number'?'N':'C',length:typeof value==='number'?20:100,decimal:['CELULAS','ACUM_CEL'].includes(name)?0:6}));
    check();
    const layer=addLayer({sourceLayer:'R:'+r.id,name:'Área contribuinte — '+fmt(props.AREA_HA,4)+' ha',gtype:'polygon',crs:q.crs,
      features:[{geom,multi:true,props}],fields,color:'#328ad6'});
    if(layer){layer.weight=2;if(layer.sym){layer.sym.weight=2;layer.sym.fillOpacity=.14;}drawLayer(layer);}
    refreshUI();
    const text='Área contribuinte: '+fmt(props.AREA_HA,4)+' ha\n'+fmt(props.AREA_M2,4)+' m² · '+fmt(props.CELULAS,0)+' células'+
      (partial?'\nA área toca a borda ou células sem dados do MDT; pode haver contribuição fora dos dados disponíveis.':'')+
      (snap?'\nPonto na linha: '+snap.layer.name+' · ajuste '+fmt(snap.distance,2)+' m':
        S.snapOn===false?'\nÍmã (snap) desligado: usado o ponto tocado.':'\nNenhuma linha a até '+fmt(tolerance,1)+' m do toque: usado o ponto tocado.')+
      (factor===1?'\nCalculado nas cotas do TIFF nativo: '+fmt(nativeRes,2)+' m.':'')+
      (wholeGrid?'\nDireção e acumulação de fluxo D8 de toda a grade. Acumulação no exutório: '+fmt(result.cellsAtOutlet,0)+' células.':'')+
      (adjust?'\nExutório ajustado ao talvegue do MDT: '+fmt(adjust,2)+' m do ponto.':'\nExutório na célula do ponto marcado.')+
      (byChoice?'\nReamostrado por escolha sua: grade de '+fmt(result.resolution.x,2)+' m (média das cotas do TIFF de '+fmt(nativeRes,2)+' m).':'')+
      (factor>1&&!byChoice?'\nATENÇÃO: NÃO é o resultado do TIFF nativo. Por escolha sua, foi calculado em grade de '+fmt(result.resolution.x,2)+' m com média das cotas (TIFF de '+fmt(nativeRes,2)+' m), porque a bacia não coube na memória deste aparelho.':'')+
'';
    statusHead='';status(text);cmdLog(text.replaceAll('\n',' · '),'ok');
  }catch(e){statusHead='';if(q.project===S.projectId&&q.generation===gen()){status(e.name==='AbortError'?'Consulta cancelada.':e.message);if(e.name!=='AbortError')cmdLog('Área contribuinte: '+e.message,'warn');}}
  finally{statusHead='';clearInterval(timer);sampler?.close();if(job===q)job=null;controls();describe();}
}
$('pointCatchmentRaster').onchange=()=>{cancel();describe();controls();};
$('pointCatchmentMark').onclick=arm;
$('pointCatchmentResample').onchange=()=>{resample.on=$('pointCatchmentResample').checked;
  if(resampleNative)resample.cell=resampleNative.res*Number($('pointCatchmentCell').value||1)||resample.cell;
  resampleSave();$('pointCatchmentResampleBox').style.display=resample.on?'block':'none';};
$('pointCatchmentCell').onchange=()=>{if(resampleNative){resample.cell=resampleNative.res*Number($('pointCatchmentCell').value);resampleSave();}};
// Abre a janela que localiza os TIFFs originais; ao voltar, o painel confere de novo.
/* Trazer o .tif original do MDT. Três caminhos, o mesmo fim: o arquivo passa
   pela conferência e fica vinculado, e o painel volta pronto para marcar. */
async function locate(how){
  cancel();const r=selected();if(!r)return;
  const antes=CMD.linhas.length,drive=root.GeoMineDriveOriginals;let ok=false;
  try{
    if(how==='local'){
      status('Escolha o arquivo .tif original de “'+r.name+'”.');
      ok=typeof rasEscolherNativoAgora==='function'&&await rasEscolherNativoAgora(r);
    }else{
      if(!drive?.available())throw Error('O Google Drive não está disponível nesta sessão. Use o ícone do aparelho (tablet).');
      status(how==='drive'?'Procurando “'+r.name+'” no Google Drive…':'Escolha o arquivo .tif no Google Drive.');
      const result=how==='drive'?await drive.restore({item:r,kind:'raster',interactive:true}):await drive.choose(r,'raster');
      ok=result.linked>0;
      const row=result.rows?.[0];
      if(!ok&&row?.status==='not-found')status('Não encontrei no Google Drive um arquivo com o nome e o tamanho gravados no projeto. Toque no ícone da pasta e indique o arquivo.');
      if(!ok&&row?.status==='ambiguous')status('Há '+row.count+' arquivos com esse nome no Google Drive. Toque no ícone da pasta e indique o certo.');
      if(!ok&&row?.status==='no-name')status('O projeto não gravou o nome do arquivo original deste MDT. Toque no ícone da pasta e indique o arquivo.');
    }
  }catch(e){if(e.name!=='AbortError')status(e.message);}
  finally{
    // O motivo de uma recusa aparece só num aviso rápido: repete aqui, onde fica.
    const motivo=CMD.linhas.slice(antes).reverse().find(l=>/não confere|difere|não foi vinculado|não é o arquivo|não é o original|não tem o tamanho|interrompida|alterada desde|não passou|não há espaço|incompleto/i.test(l.msg))?.msg;
    if(ok)status('MDT original vinculado. Toque em Marcar ponto.');
    else if(motivo)status('O arquivo não foi vinculado.\n'+motivo);
    // No iPad a leitura do arquivo fecha os painéis para mostrar o mapa:
    // reabre este, já com o MDT vinculado, para a pessoa marcar o ponto.
    if(!panel.getClientRects().length&&selected()===r){const text=$('pointCatchmentResult').textContent;open();status(text);}
    describe();controls();
  }
}
$('pointCatchmentDrive').onclick=()=>locate('drive');
$('pointCatchmentDrivePick').onclick=()=>locate('pick');
$('pointCatchmentLocal').onclick=()=>locate('local');
$('pointCatchmentRain').onclick=()=>{cancel();ribbonOpen($('secHidroMancha'),anchor||$('pointCatchmentRain'),'Chuva e inundação');};
const category=CATS.find(c=>c.id==='hidrologia');
for(const group of category?.grupos||[])for(const item of group.it||[]){
  if(item.ic==='bacia-hidrografica'){item.nome='Área Contribuinte';item.desc='Toque no exutório, na linha de fluxo ou no MDT · área que drena até o ponto';item.act=open;}
  if(item.ic==='mancha-inundacao')item.act=open;
}
$('btnBasin').onclick=()=>{refresh();arm();};
root.GeoMinePointCatchment={open,refresh,arm,click,cancel,snapPreview,projectChanged:()=>{cancel();pointMarker?.remove();pointMarker=null;context=null;routed=null;}};
})(window);

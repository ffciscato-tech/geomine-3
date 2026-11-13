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
<div id="pointCatchmentLocate" style="display:none;flex-wrap:wrap;gap:5px;margin:0 0 8px">
<button class="mini" id="pointCatchmentDrive" style="width:auto;margin:0;background:var(--amber);color:#1a1206;font-weight:700" title="Procura o arquivo no Google Drive pelo nome gravado no projeto, baixa e vincula">Buscar no Google Drive</button>
<button class="mini" id="pointCatchmentDrivePick" style="width:auto;margin:0" title="Abre o Google Drive já na pasta dos originais">Escolher no Drive…</button>
<button class="mini" id="pointCatchmentLocal" style="width:auto;margin:0" title="Escolher o arquivo no armazenamento deste aparelho">Do aparelho…</button>
</div>
<button class="tbtn" id="pointCatchmentMark" style="width:100%;justify-content:center;background:var(--amber);color:#1a1206;font-weight:700">◎ Marcar ponto</button>
<div class="hout" id="pointCatchmentResult" role="status" aria-live="polite" style="white-space:pre-line;margin-top:8px">A área será informada em m² e hectares.</div>
<div class="hint" style="margin-top:8px">O ponto é ajustado ao talvegue mais próximo (maior acumulação de fluxo ao lado do toque), sem descer o rio; o marcador mostra o exutório usado. As cotas não são alteradas.</div>
<button class="mini" id="pointCatchmentRain" style="margin-top:12px">Chuva e inundação…</button>`;
($('secHidroBacia')?.parentElement||document.body).appendChild(panel);
const status=t=>{$('pointCatchmentResult').textContent=t;};
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
        X0=x0*factor,X1=Math.min(base.nc,x1*factor),Y0=y0*factor,Y1=Math.min(base.nr,y1*factor),
        step=Math.max(1,Math.floor(900000/Math.max(1,X1-X0)));   // o leitor aceita até 1 milhão de células por janela
      for(let y=Y0;y<Y1;y+=step){
        const yEnd=Math.min(Y1,y+step),values=await base.readWindow([X0,y,X1,yEnd]),width=X1-X0;
        if(values.length!==width*(yEnd-y))throw Error('Bloco incompleto do MDT original.');
        for(let r=y;r<yEnd;r++){const line=(Math.floor(r/factor)-y0)*W-x0,offset=(r-y)*width-X0;
          for(let c=X0;c<X1;c++){const v=values[offset+c];if(Number.isFinite(v)&&(base.noData==null||v!==base.noData)){const i=line+Math.floor(c/factor);sum[i]+=v;n[i]++;}}}
      }
      for(let i=0;i<out.length;i++)out[i]=n[i]?Math.fround(sum[i]/n[i]):NaN;
      return out;
    }};
}
function controls(){
  const busy=!!job;
  $('pointCatchmentRaster').disabled=busy;
  $('pointCatchmentMark').textContent=busy?'Cancelar cálculo':armed&&S.tool==='basin'?'Cancelar marcação':'◎ Marcar ponto';
  $('pointCatchmentMark').disabled=false;
}
function cancel(){job?.controller.abort();armed=null;if(S.tool==='basin')setTool('select');controls();}
function resetContext(){const key=String(S.projectId)+'|'+String(gen());if(context!==key){cancel();pointMarker?.remove();pointMarker=null;context=key;routed=null;describing++;$('pointCatchmentRaster').value='';status('A área será informada em m² e hectares.');}}
async function describe(){
  const r=selected(),token=++describing,project=S.projectId,generation=gen();let s;
  const current=()=>token===describing&&selected()===r&&project===S.projectId&&generation===gen()&&!job;
  if(!r){$('pointCatchmentInfo').textContent='Selecione o MDT.';$('pointCatchmentLocate').style.display=(true)?'none':'flex';return;}
  $('pointCatchmentInfo').textContent='Conferindo a resolução…';
  try{s=await root.GeoMineChannelDEM.prepare(r,{workCRS:S.workCRS,isCurrent:current});if(!current())return;
    const k=scale(s);
    $('pointCatchmentInfo').textContent='TIFF nativo: '+fmt(s.grid.cs*k,4)+' × '+fmt(s.grid.csy*k,4)+' m · '+fmt(s.grid.nc,0)+' × '+fmt(s.grid.nr,0)+' células · '+s.sourceCRS;
    $('pointCatchmentLocate').style.display=(true)?'none':'flex';
  }catch(e){
    if(!current()||e.name==='AbortError')return;
    const semTiff=e.code==='CHANNEL_NATIVE_MISSING';
    $('pointCatchmentInfo').textContent=semTiff?'O arquivo .tif deste MDT não está aberto nesta sessão. O cálculo só é feito no TIFF nativo: traga o arquivo por um dos botões abaixo.':e.message;
    $('pointCatchmentLocate').style.display=(!semTiff)?'none':'flex';
    // Sem o Google Drive nesta sessão, só o arquivo do aparelho faz sentido.
    const temDrive=!!root.GeoMineDriveOriginals?.available();
    $('pointCatchmentDrive').style.display=$('pointCatchmentDrivePick').style.display=temDrive?'':'none';
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
      throw Error('O arquivo .tif deste MDT não está aberto nesta sessão. O cálculo só é feito no TIFF nativo.\nTraga o arquivo por um dos botões acima (Buscar no Google Drive).');
    }
    check();
    const k=scale(sampler),tap=fromWGS(q.crs,latlng.lng,latlng.lat),screen=map.latLngToContainerPoint(latlng),
      side=map.containerPointToLatLng([screen.x+10,screen.y]),sideXY=fromWGS(q.crs,side.lng,side.lat),
      tolerance=Math.min(10,Math.max(sampler.resolution,Math.hypot(sideXY[0]-tap[0],sideXY[1]-tap[1]))),
      lines=S.layers.filter(l=>l.visible!==false&&l.llayer&&map.hasLayer(l.llayer)),
      snap=root.GeoMineCatchmentSnap.nearest(lines,tap,{tolerance,selected:S.sel,
        visible:(l,f)=>featureVisible(l,f),project:(p,l)=>!l.crs||l.crs===q.crs?p:proj4(l.crs,q.crs,p)}),
      p=snap?snap.point:tap,seed=sampler.locate(p);
    const ll=toWGS(q.crs,...p);pointMarker.setLatLng([ll[1],ll[0]]).setStyle({color:'#1b3560'});
    if(!seed)throw Error('O ponto está fora do MDT.');
    const engine=root.GeoMineContinuousCatchment,memory=memoryMB(),
      native={...sampler.grid,float32:sampler.float32,unitScale:k,readWindow:sampler.readWindow,isCurrent:current},
      nativeRes=Math.min(native.cs,native.csy||native.cs)*k,
      // Raio de busca do talvegue: o dedo (14 px no terreno), ao menos 3 células
      // e, com linha vetorial, ao menos 3 m de folga entre a linha e o MDT.
      searchM=Math.min(40,Math.max(1.4*Math.hypot(sideXY[0]-tap[0],sideXY[1]-tap[1]),3*nativeRes,snap?3:0));
    let source=native,factor=1,start={col:seed.col,row:seed.row},adjust=0,result,reached=0,wholeGrid=false;
    // GRADE INTEIRA, quando cabe na memória (MDT nativo ou grade do projeto):
    // direção e acumulação de fluxo D8 de todas as células, calculadas uma vez
    // e reaproveitadas nos pontos seguintes. MDT maior que isso segue pela
    // janela que cresce a montante, mais abaixo.
    if(native.nc*native.nr*18<=memory*1048576*.8)try{
      const key=gridKey(r,native),phase=v=>{check();status((v.phase==='read'?'Lendo as cotas da grade':v.phase==='outlets'?'Preparando as saídas da grade':v.phase==='accumulation'?'Calculando a acumulação de fluxo D8':v.phase==='contour'?'Traçando o contorno':v.phase==='upstream'?'Delimitando a montante':'Calculando a direção de fluxo D8')+'…'+
        (v.cells?'\n'+fmt(v.cells,0)+' células · '+fmt(v.cells*native.cs*(native.csy||native.cs)*k*k/10000,4)+' ha':''));};
      if(!routed||routed.key!==key||routed.d!==d||routed.z!==(d._full?.z||d.z)){
        routed=null;status('Calculando a direção de fluxo D8…');
        const routing=await engine.routeGrid(native,{seed:start,signal:q.controller.signal,maxMemoryMB:Math.max(memory,160),onProgress:phase});check();
        routed={key,d,z:d._full?.z||d.z,routing};
      }
      result=await engine.analyzeRouted(native,routed.routing,start,{searchCells:Math.ceil(searchM/nativeRes),signal:q.controller.signal,decodedCacheMB:12,tileSize:128,onProgress:phase});check();
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
      if(factor===1){adjust=outlet.moved?outlet.distance:0;
        const at=toWGS(q.crs,...sampler.toWork([native.xll+(outlet.col+.5)*native.cs,native.yll+(native.nr-outlet.row-.5)*(native.csy||native.cs)]));
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
        METODO:(wholeGrid?'D8 — direção e acumulação de fluxo da grade inteira':'D8 — fluxo contínuo em janela a montante')+' · '+(factor>1?'NÃO NATIVO: grade agregada '+factor+'× (média das cotas)':'cotas do TIFF nativo'),LIMITE_DADOS:partial?'Sim':'Não'},
      fields=Object.entries(props).map(([name,value])=>({name,type:typeof value==='number'?'N':'C',length:typeof value==='number'?20:100,decimal:['CELULAS','ACUM_CEL'].includes(name)?0:6}));
    check();
    const layer=addLayer({sourceLayer:'R:'+r.id,name:'Área contribuinte — '+fmt(props.AREA_HA,4)+' ha',gtype:'polygon',crs:q.crs,
      features:[{geom,multi:true,props}],fields,color:'#328ad6'});
    if(layer){layer.weight=2;if(layer.sym){layer.sym.weight=2;layer.sym.fillOpacity=.14;}drawLayer(layer);}
    refreshUI();
    const text='Área contribuinte: '+fmt(props.AREA_HA,4)+' ha\n'+fmt(props.AREA_M2,4)+' m² · '+fmt(props.CELULAS,0)+' células'+
      (partial?'\nA área toca a borda ou células sem dados do MDT; pode haver contribuição fora dos dados disponíveis.':'')+
      (snap?'\nPonto na linha: '+snap.layer.name+' · ajuste '+fmt(snap.distance,2)+' m':'')+
      (factor===1?'\nCalculado nas cotas do TIFF nativo: '+fmt(nativeRes,2)+' m.':'')+
      (wholeGrid?'\nDireção e acumulação de fluxo D8 de toda a grade. Acumulação no exutório: '+fmt(result.cellsAtOutlet,0)+' células.':'')+
      (adjust?'\nExutório ajustado ao talvegue do MDT: '+fmt(adjust,2)+' m do ponto.':'\nExutório na célula do ponto marcado.')+
      (factor>1?'\nATENÇÃO: NÃO é o resultado do TIFF nativo. Por escolha sua, foi calculado em grade de '+fmt(result.resolution.x,2)+' m com média das cotas (TIFF de '+fmt(nativeRes,2)+' m), porque a bacia não coube na memória deste aparelho.':'')+
'';
    status(text);cmdLog(text.replaceAll('\n',' · '),'ok');
  }catch(e){if(q.project===S.projectId&&q.generation===gen()){status(e.name==='AbortError'?'Consulta cancelada.':e.message);if(e.name!=='AbortError')cmdLog('Área contribuinte: '+e.message,'warn');}}
  finally{clearInterval(timer);sampler?.close();if(job===q)job=null;controls();describe();}
}
$('pointCatchmentRaster').onchange=()=>{cancel();describe();controls();};
$('pointCatchmentMark').onclick=arm;
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
      if(!drive?.available())throw Error('O Google Drive não está disponível nesta sessão. Use “Do aparelho…”.');
      status(how==='drive'?'Procurando “'+r.name+'” no Google Drive…':'Escolha o arquivo .tif no Google Drive.');
      const result=how==='drive'?await drive.restore({item:r,kind:'raster',interactive:true}):await drive.choose(r,'raster');
      ok=result.linked>0;
      const row=result.rows?.[0];
      if(!ok&&row?.status==='not-found')status('Não encontrei no Google Drive um arquivo com o nome e o tamanho gravados no projeto. Toque em Escolher no Drive… e indique o arquivo.');
      if(!ok&&row?.status==='ambiguous')status('Há '+row.count+' arquivos com esse nome no Google Drive. Toque em Escolher no Drive… e indique o certo.');
      if(!ok&&row?.status==='no-name')status('O projeto não gravou o nome do arquivo original deste MDT. Toque em Escolher no Drive… e indique o arquivo.');
    }
  }catch(e){if(e.name!=='AbortError')status(e.message);}
  finally{
    // O motivo de uma recusa aparece só num aviso rápido: repete aqui, onde fica.
    const motivo=CMD.linhas.slice(antes).reverse().find(l=>/não confere|difere|não foi vinculado|não é o arquivo|não tem o tamanho|interrompida|alterada desde|não passou|não há espaço|incompleto/i.test(l.msg))?.msg;
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
root.GeoMinePointCatchment={open,refresh,arm,click,cancel,projectChanged:()=>{cancel();pointMarker?.remove();pointMarker=null;context=null;routed=null;}};
})(window);

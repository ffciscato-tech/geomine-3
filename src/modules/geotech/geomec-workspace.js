/* GeoMine — GEOMEC: a aba de vista (seção, cards numerados, resultados) e a ligação com a
   faixa GEOTECNIA e com o mapa 2D. O cálculo fica em slope-stability.js e geomec-core.js e
   roda em segundo plano: a tela não trava enquanto a superfície crítica é procurada. */
(function(root){
  'use strict';
  const GM=root.GeoMineGeomecInterno, $=id=>document.getElementById(id), fmt=GM.fmt, lerp=GM.lerp, num=GM.num;
  const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const claro=()=>document.body.classList.contains('light');
  const ver={mapa:true, fatias:true, empuxo:false, legenda:true};
  const abertos=new Set(), estudos=new Map();
  let vista=null, vistaManual=false, aba='resumo', sel=null, modo='', manualRes=null, manualCirc=null, timer=0, fitFrame=0, rodada=0,
    traco=null, pendente=null, montado=false, recolhido=false, envId='', emEstudo=false;
  const sec=()=>GM.ativa(), res=()=>GM.resultado(sec());
  const sujoProjeto=()=>{ try{ root.GeoMineSessionAutosave?.markDirty?.('seções geomecânicas'); }catch(e){} };
  const aviso=t=>{ try{ toast(t); }catch(e){} };
  const DICA_NA='Linha freática: toque para criar um ponto, arraste para mover, dois toques num ponto para apagar.';
  /* Vai para o mapa 2D sem tirar a faixa GEOTECNIA de cima (a vista de mapa dessa categoria). */
  function vaiAoMapa(){
    let v='map';
    try{ if(!(typeof RIB_COMMAND_CAT==='string'&&RIB_COMMAND_CAT)) RIB_CAT_ATUAL='geotecnia'; const c=CATS.find(x=>x.id===RIB_CAT_ATUAL); if(c&&c.view&&mapaVista2D(c.view)) v=c.view; }catch(e){}
    switchView(v);
  }

  /* ------------------------------ montagem ------------------------------ */
  function mount(){
    if(montado) return;
    montado=true;
    const w=document.createElement('section');
    w.id='gmGeomecWorkspace'; w.hidden=true; w.style.display='none'; w.setAttribute('aria-label','Geomecânica — estabilidade de taludes');
    w.innerHTML=`<header class="gmg-top">
        <button type="button" class="tbtn gmg-ic" data-a="painel" title="Mostrar ou recolher os cards" aria-label="Mostrar ou recolher os cards">☰</button>
        <strong>GEOMEC</strong>
        <select id="gmgSecao" title="Seção em estudo" aria-label="Seção em estudo"></select>
        <button type="button" class="tbtn" data-a="nova" title="Nova seção">＋ Seção</button>
        <span class="gmg-fs" id="gmgFS" role="status" hidden></span>
        <span class="gmg-estado" id="gmgEstado" aria-live="polite"></span>
        <button type="button" class="tbtn gmg-calc" data-a="calcular" title="Procurar a superfície crítica">▶ Calcular</button>
      </header>
      <div class="gmg-body">
        <aside class="gmg-side" id="gmgSide"></aside>
        <div class="gmg-main">
          <div class="gmg-wrap" id="gmgWrap">
            <canvas id="gmgCanvas" aria-label="Seção geomecânica"></canvas>
            <div class="gmg-chips" id="gmgChips"></div>
            <div class="gmg-dica" id="gmgDica" hidden></div>
            <div class="gmg-vazio" id="gmgVazio" hidden></div>
          </div>
          <div class="gmg-res" id="gmgRes">
            <nav class="gmg-tabs" id="gmgTabs" role="tablist"></nav>
            <div class="gmg-res-b"><div class="gmg-graf" id="gmgGrafBox"><canvas id="gmgGraf" aria-label="Gráfico do resultado"></canvas></div><div class="gmg-tab-html" id="gmgHtml"></div></div>
          </div>
        </div>
      </div>`;
    $('main').append(w);
    const tab=document.createElement('button');
    tab.type='button'; tab.className='a3-view-tab'; tab.dataset.view='geomec'; tab.textContent='GEOMEC'; tab.title='Geomecânica — estabilidade de taludes'; tab.onclick=()=>open();
    const ref=$('a3ViewTabs')?.querySelector('[data-view="layout"]'); if(ref) ref.after(tab);
    const ro=new ResizeObserver(()=>{ scheduleFit(); if(!w.hidden){ largura(); if(!vistaManual) vista=null; desenha(); pintaAba(); } });
    for(const el of [$('main'),$('cmdBox'),document.querySelector('.readout'),$('gmgWrap'),$('gmgRes')]) if(el) ro.observe(el);
    if($('cmdBox')) new MutationObserver(scheduleFit).observe($('cmdBox'),{attributes:true,attributeFilter:['style']});
    root.addEventListener('resize',scheduleFit);
    w.addEventListener('click',noClique);
    w.addEventListener('input',naEntrada);
    w.addEventListener('change',naMudanca);
    ligaCanvas($('gmgCanvas'));
    $('gmgSecao').addEventListener('change',e=>{ GM.ativar(e.target.value); trocaSecao(); });
    new MutationObserver(()=>{ if(!w.hidden){ desenha(); pintaAba(); } }).observe(document.body,{attributes:true,attributeFilter:['class']});
    document.addEventListener('keydown',e=>{
      if(e.key!=='Escape'||w.hidden||!modo) return;
      const tag=(document.activeElement&&document.activeElement.tagName)||'';
      if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return;
      saiDoModo(); renderCards(); pintaTopo(); desenha(); pintaAba();
    });
  }
  /* Em área estreita (iPad em pé, painéis abertos) os cards viram uma gaveta por cima do
     desenho, aberta e fechada pelo ☰; na primeira vez ela começa fechada para a seção aparecer. */
  let estreito=null;
  function largura(){
    const w=$('gmGeomecWorkspace'); if(!w||w.hidden) return;
    const e=w.clientWidth>0&&w.clientWidth<700;
    if(e===estreito) return;
    if(e&&estreito!==true&&sec()) recolhido=true;
    estreito=e;
    w.classList.toggle('gmg-estreito',e);
    w.classList.toggle('sem-cards',recolhido||!sec()||!!pendente);
  }
  function scheduleFit(){
    if(fitFrame) return;
    fitFrame=requestAnimationFrame(()=>{ fitFrame=0;
      const w=$('gmGeomecWorkspace'), host=$('main'); if(!w||w.hidden||!host) return;
      const box=host.getBoundingClientRect(); let sobra=0;
      for(const el of [$('cmdBox'),document.querySelector('.readout')]){
        const r=el?.getBoundingClientRect();
        if(r&&r.height>0&&r.right>box.left&&r.left<box.right&&r.bottom>box.top&&r.top<box.bottom) sobra=Math.max(sobra,Math.ceil(box.bottom-r.top+1));
      }
      const b=sobra+'px'; if(w.style.bottom!==b) w.style.bottom=b;
    });
  }
  /* Abre a aba. O desenho acontece em mostrou(), chamado pelo switchView. */
  function open(){
    mount();
    try{ RIB_CAT_ATUAL='geotecnia'; }catch(e){}
    try{ if(S.tool!=='select') setTool('select'); }catch(e){}
    switchView('geomec');
    return api;
  }
  function mostrou(){
    mount();
    largura(); renderTudo(); scheduleFit();
    const s=sec();
    if(s&&!res()&&!pendente&&s.auto!==false&&!GM.ocupado()) calcula();
  }

  /* ------------------------------ estado da tela ------------------------------ */
  function saiDoModo(){ modo=''; manualRes=null; manualCirc=null; const d=$('gmgDica'); if(d) d.hidden=true; }
  function trocaSecao(){
    vista=null; vistaManual=false; sel=null; saiDoModo(); if(aba==='env'||aba==='fatia') aba='resumo';
    renderTudo();
    const s=sec();
    if(s&&!res()&&s.auto!==false) calcula();
  }
  function estado(txt,tipo){
    const e=$('gmgEstado'), w=$('gmGeomecWorkspace');
    if(e) e.textContent=txt||'';
    if(w){ if(tipo) w.dataset.estado=tipo; else delete w.dataset.estado; }
  }
  /* Algo mudou na seção: redesenha já e recalcula logo em seguida (ou espera o Calcular). */
  function mudou(estrutura){
    const s=sec(); if(!s) return;
    estudos.delete(s.id); sujoProjeto();
    if(estrutura) renderCards();
    if(modo==='manual') atualizaManual(false);
    desenha();
    clearTimeout(timer);
    if(s.auto===false){
      rodada++; GM.cancela(); GM.esquece(s);
      estado('alterado — toque em Calcular','pend'); pintaTopo(); pintaAba();
      return;
    }
    estado('recalculando…','calc');
    timer=setTimeout(calcula,350);
  }
  function calcula(){
    const s=sec(); if(!s) return;
    clearTimeout(timer);
    GM.cancela();
    const minha=++rodada, tinha=!!res();
    estado('calculando…','calc');
    const fim=r=>{
      if(minha!==rodada||sec()!==s) return;
      estado(r&&r.ok?fmt(r.busca.validas,0)+' superfícies · '+fmt(r.ms/1000,1)+' s':'','');
      if(modo==='manual') atualizaManual(false);
      sel=null; if(!vistaManual&&!tinha) vista=null;
      pintaTopo(); desenha(); pintaAba(); sincronizaMapa();
    };
    GM.calculaAsync(s).then(fim,e=>{
      if(e&&e.cancelado) return;
      console.error('GEOMEC',e);
      fim(GM.aplica(s,{res:{ok:false, motivo:e&&e.message||'Falha no cálculo.'}, resumo:null}));
    });
  }
  async function calculaTodas(){
    const lista=GM.secoes().slice(), atual=sec(); if(!lista.length) return;
    clearTimeout(timer); GM.cancela();
    const minha=++rodada;
    try{
      for(let i=0;i<lista.length;i++){
        if(minha!==rodada) return;
        estado('calculando '+(i+1)+' de '+lista.length+'…','calc');
        await GM.calculaAsync(lista[i]);
        if(minha===rodada&&aba==='todas') pintaAba();
      }
    }catch(e){ if(!(e&&e.cancelado)) console.error('GEOMEC',e); }
    if(minha!==rodada) return;
    estado('','');
    if(sec()===atual){ pintaTopo(); desenha(); pintaAba(); }
    sincronizaMapa(); sujoProjeto();
  }

  /* ------------------------------ topo ------------------------------ */
  function renderSeletor(){
    const s=sec(), lista=GM.secoes(), sl=$('gmgSecao'); if(!sl) return;
    sl.innerHTML=lista.map(x=>`<option value="${h(x.id)}"${x===s?' selected':''}>${h(x.nome)}${x.resumo?' · FS '+fmt(x.resumo.FS,2):''}</option>`).join('')||'<option value="">nenhuma seção</option>';
    sl.disabled=!lista.length;
  }
  function pintaTopo(){
    renderSeletor();
    const s=sec(), b=$('gmgFS'), r=res(); if(!b) return;
    const adm=s?num(s.fsAdm,1.5):1.5;
    if(pendente) b.hidden=true;
    else if(s&&r&&r.ok){
      const c=r.critica;
      b.innerHTML=`<b>FS ${fmt(c.FS,3)}</b><small>${h(GM.METODOS[c.metodo]||'')} · ${c.sup.tipo==='circulo'?'circular':'não circular'} · ${c.FS>=adm?'atende a':'abaixo de'} ${fmt(adm,2)}</small>`;
      b.style.setProperty('--gmg-cor',GM.corFS(c.FS,adm)); b.hidden=false;
    } else if(s&&r&&!r.ok){
      b.innerHTML=`<b>sem resultado</b><small>${h(r.motivo||'')}</small>`; b.style.setProperty('--gmg-cor',GM.corClasse.nd); b.hidden=false;
    } else if(s&&s.resumo){
      b.innerHTML=`<b>FS ${fmt(s.resumo.FS,3)}</b><small>${h(GM.METODOS[s.resumo.metodo]||'')} · do último cálculo salvo</small>`;
      b.style.setProperty('--gmg-cor',GM.corFS(s.resumo.FS,adm)); b.hidden=false;
    } else b.hidden=true;
  }

  /* ------------------------------ cards ------------------------------ */
  const info=(rot,txt)=>`<details class="gm-card-info"><summary aria-label="${h(rot)}">ⓘ</summary><p>${txt}</p></details>`;
  const campo=(rot,attr,val,extra)=>`<div><label class="field">${rot}</label><input ${attr} value="${h(val??'')}" inputmode="decimal" autocomplete="off" ${extra||''}></div>`;
  function cardSecao(s){
    const p=s.parametros, t=p?GM.terrenoTalude(p):null;
    return `<section class="gm-work-card" data-card="secao"><div class="gm-card-heading"><span class="gm-card-step">1</span><b>Seção</b>${info('Sobre a seção','A seção é desenhada em escala 1:1. Vem de uma linha traçada no mapa (o terreno e os contatos são cortados das superfícies do projeto, na resolução nativa) ou de um talude paramétrico. O maciço desliza para o lado mais baixo; a base do modelo limita a profundidade das superfícies.')}</div>
      <label class="field">Nome</label><input data-c="nome" value="${h(s.nome)}" autocomplete="off">
      ${p?`<div class="gmg-g2">${campo('Bancadas','data-p="bancadas"',p.bancadas)}${campo('Altura da bancada (m)','data-p="altura"',p.altura)}${campo('Ângulo da face (°)','data-p="angulo"',p.angulo)}${campo('Berma (m)','data-p="berma"',p.berma)}</div>
        <div class="gmg-nota" id="gmgTaludeNota">altura total ${fmt(t.altura,1)} m · ângulo geral ${fmt(t.geral,1)}°</div>`
        :s.origem==='mapa'?`<div class="gmg-nota">Cortada no mapa · ${fmt(s.comprimento||0,1)} m · ${s.terreno.length} pontos no terreno${s.passo?' · passo '+fmt(s.passo,2)+' m':''}</div>`:''}
      <div class="gmg-g2"><div><label class="field">Desliza para</label><select data-c="sentido"><option value="auto"${s.sentido==='auto'?' selected':''}>o lado mais baixo</option><option value="dir"${s.sentido==='dir'?' selected':''}>a direita</option><option value="esq"${s.sentido==='esq'?' selected':''}>a esquerda</option></select></div>
        ${campo('FS admissível','data-c="fsAdm"',s.fsAdm)}${campo('Base do modelo (cota)','data-c="base"',s.base,`placeholder="${fmt(GM.base(Object.assign({},s,{base:''})),1)}"`)}
        <div class="gmg-meio"><label class="gmg-check"><input type="checkbox" data-c="auto"${s.auto!==false?' checked':''}> recalcular a cada alteração</label></div></div>
    </section>`;
  }
  function corpoMaterial(id,m,k){
    const md=m.modelo||'mc', bib=GM.biblioteca();
    const f=(rot,key,extra)=>campo(rot,`data-m="${h(id)}" data-k="${key}"`,m[key],extra);
    let campos='';
    if(md==='mc') campos=f('c′ (kPa)','c')+f('φ′ (°)','phi')+f('ru','ru');
    else if(md==='su') campos=f('Su (kPa)','su')+f('ganho (kPa/m)','suK')+f('cota de Su','zRef');
    else if(md==='hb') campos=f('σci (MPa)','sci')+f('GSI','GSI')+f('mi','mi')+f('D','D');
    else if(md==='leps') campos=f('φ0 a 100 kPa (°)','phi0')+f('queda por ciclo log (°)','dphi');
    else if(md==='tab') campos=`<div class="gmg-larga"><label class="field">Pontos σ′n τ (kPa), um par por linha</label><textarea data-m="${h(id)}" data-k="tab" rows="4">${h(m.tab||'')}</textarea></div>`;
    return `<div class="gmg-g2"><div class="gmg-larga"><label class="field">Nome</label><input data-m="${h(id)}" data-k="nome" value="${h(m.nome)}" autocomplete="off"></div>
        <div><label class="field">Cor</label><input type="color" data-m="${h(id)}" data-k="cor" value="${h(m.cor||'#c9a26b')}"></div>
        <div><label class="field">Biblioteca</label><select data-bib="${h(id)}"><option value="">valores típicos…</option>${bib.map(b=>`<option value="${h(b.id)}">${h(b.nome)}</option>`).join('')}</select></div>
        <div class="gmg-larga"><label class="field">Resistência</label><select data-m="${h(id)}" data-k="modelo">${Object.entries(GM.MODELOS).filter(([v])=>v!=='rocha'||k>0).map(([v,t])=>`<option value="${v}"${v===md?' selected':''}>${h(t)}</option>`).join('')}</select></div>
        ${f('γ (kN/m³)','gama')}${md==='rocha'?'':f('γ saturado','gamaSat','placeholder="igual a γ"')}${campos}</div>
      <div class="gmg-bts">${md==='hb'||md==='leps'||md==='tab'?`<button type="button" class="mini" data-a="envoltoria" data-id="${h(id)}">ver a envoltória τ × σ</button>`:''}
      ${k>0?`<button type="button" class="mini gmg-perigo" data-a="remove-camada" data-k="${k}">remover a camada</button>`:''}</div>`;
  }
  function cardMateriais(s){
    return `<section class="gm-work-card" data-card="materiais"><div class="gm-card-heading"><span class="gm-card-step">2</span><b>Camadas e materiais</b>${info('Sobre as camadas','De cima para baixo. A primeira camada começa no terreno; cada uma das outras começa na sua linha de topo (um contato cortado no mapa ou uma cota) e nunca sobe acima das de cima — onde as linhas se encontram, a camada acunha. Os valores da biblioteca são típicos: confira com ensaios.')}</div>
      <div id="gmgMats">${s.camadas.map((c,k)=>{ const m=s.materiais[c.mat]||{}, ab=abertos.has(c.mat);
        return `<div class="gmg-mat${ab?' aberta':''}" data-mat="${h(c.mat)}"><button type="button" class="gmg-mat-h" data-a="abre-mat" data-id="${h(c.mat)}" aria-expanded="${ab}"><i style="background:${h(m.cor||'#c9a26b')}"></i><span><b>${h(m.nome||c.mat)}</b><small>${h(GM.resumoMaterial(m))}</small></span><em>${ab?'▴':'▾'}</em></button>
          ${ab?`<div class="gmg-mat-b">${corpoMaterial(c.mat,m,k)}</div>`:''}</div>`; }).join('')}</div>
      <div class="gmg-linha"><input id="gmgCotaNova" inputmode="decimal" placeholder="cota do contato" aria-label="Cota do novo contato" autocomplete="off"><button type="button" class="mini" data-a="nova-camada">＋ camada por cota</button></div>
    </section>`;
  }
  function cardAgua(s){
    const a=s.agua||{modo:'nenhuma'};
    return `<section class="gm-work-card" data-card="agua"><div class="gm-card-heading"><span class="gm-card-step">3</span><b>Água</b>${info('Sobre a água','A linha freática dá a poropressão na base de cada fatia (coluna de água até a linha). Onde a linha passa acima do terreno há lâmina d’água: o peso e o empuxo dela entram no cálculo. O coeficiente ru, quando usado, é informado em cada material.')}</div>
      <select data-c="agua.modo" aria-label="Condição de água"><option value="nenhuma"${a.modo!=='linha'?' selected':''}>sem linha freática</option><option value="linha"${a.modo==='linha'?' selected':''}>linha freática</option></select>
      ${a.modo==='linha'?`<div class="gmg-linha"><input id="gmgCotaNA" inputmode="decimal" placeholder="cota" aria-label="Cota do nível d’água horizontal" autocomplete="off"><button type="button" class="mini" data-a="na-horizontal">NA horizontal</button></div>
      <button type="button" class="mini${modo==='na'?' on':''}" data-a="edita-na">${modo==='na'?'concluir a edição da linha':'editar a linha no desenho'}</button>`:''}
    </section>`;
  }
  function cardCargas(s){
    return `<section class="gm-work-card" data-card="cargas"><div class="gm-card-heading"><span class="gm-card-step">4</span><b>Cargas, sismo e trinca</b>${info('Sobre cargas e sismo','Sobrecarga vertical distribuída entre duas distâncias da seção. O sismo é pseudo-estático: kh empurra no sentido do deslizamento e kv positivo aumenta o peso. A trinca de tração corta a superfície junto à crista na profundidade dada e pode estar cheia de água.')}</div>
      <div id="gmgCargas">${(s.cargas||[]).map((q,i)=>`<div class="gmg-carga"><input data-q="${i}" data-k="x1" value="${h(q.x1)}" inputmode="decimal" aria-label="de (m)" placeholder="de" autocomplete="off"><input data-q="${i}" data-k="x2" value="${h(q.x2)}" inputmode="decimal" aria-label="até (m)" placeholder="até" autocomplete="off"><input data-q="${i}" data-k="q" value="${h(q.q)}" inputmode="decimal" aria-label="kPa" placeholder="kPa" autocomplete="off"><button type="button" class="mini" data-a="remove-carga" data-i="${i}" aria-label="Remover a sobrecarga">✕</button></div>`).join('')}</div>
      <button type="button" class="mini" data-a="nova-carga">＋ sobrecarga (de · até · kPa)</button>
      <div class="gmg-g2">${campo('kh (g)','data-c="sismo.kh"',s.sismo.kh)}${campo('kv (g)','data-c="sismo.kv"',s.sismo.kv)}${campo('Trinca (m)','data-c="trinca.prof"',s.trinca.prof)}${campo('Água na trinca (%)','data-c="trinca.agua"',s.trinca.agua)}</div>
    </section>`;
  }
  function cardBusca(s){
    const b=s.busca, semNC=b.metodo==='bishop'||b.metodo==='ordinario';
    return `<section class="gm-work-card" data-card="busca"><div class="gm-card-heading"><span class="gm-card-step">5</span><b>Superfície de ruptura</b>${info('Sobre a busca','A busca varre círculos que entram pela crista e saem pelo pé (entrada e saída), guarda todos no mapa de segurança e refina os melhores. Morgenstern–Price e Spencer fecham forças e momentos; Bishop só momentos; Janbu só forças. A otimização não circular parte dos círculos críticos e move os vértices enquanto o fator de segurança cai — é o que acha ruptura por camada fraca.')}</div>
      <label class="field">Método</label><select data-c="busca.metodo">${Object.entries(GM.METODOS).map(([v,t])=>`<option value="${v}"${v===b.metodo?' selected':''}>${h(t)}</option>`).join('')}</select>
      <div class="gmg-g2"><div><label class="field">Entrada e saída</label><select data-c="busca.faixas"><option value="auto"${b.faixas!=='manual'?' selected':''}>toda a seção</option><option value="manual"${b.faixas==='manual'?' selected':''}>faixas no desenho</option></select></div>
        <div><label class="field">Varredura</label><select data-c="busca.precisao"><option value="normal"${b.precisao!=='alta'?' selected':''}>normal</option><option value="alta"${b.precisao==='alta'?' selected':''}>fina (mais lenta)</option></select></div>
        ${campo('Profundidade mínima (m)','data-c="busca.profMin"',b.profMin,'placeholder="automática"')}
        <div class="gmg-meio"><label class="gmg-check"${semNC?' title="Bishop e Ordinário valem só para superfície circular"':''}><input type="checkbox" data-c="busca.naoCircular"${b.naoCircular&&!semNC?' checked':''}${semNC?' disabled':''}> otimizar não circular</label></div></div>
      <button type="button" class="mini${modo==='manual'?' on':''}" data-a="manual">${modo==='manual'?'voltar à superfície crítica':'testar uma superfície à mão'}</button>
    </section>`;
  }
  function cardEstudos(s){
    const mc=Object.keys(s.materiais).filter(id=>(s.materiais[id].modelo||'mc')==='mc');
    return `<section class="gm-work-card" data-card="estudos"><div class="gm-card-heading"><span class="gm-card-step">6</span><b>Estudos</b>${info('Sobre os estudos','Todos usam a superfície em análise (a crítica, ou a testada à mão). Sensibilidade: um parâmetro por vez, ±20%. Probabilidade: Monte Carlo com a dispersão típica de cada parâmetro (c′ 30%, φ′ 10%, γ 5%, Su 25%). Sismo: curva FS × kh e a aceleração de escoamento ky. Retroanálise: os pares (c′, φ′) que dão FS = 1.')}</div>
      <div class="gmg-bts"><button type="button" class="mini" data-a="estudo" data-e="sens">Sensibilidade</button><button type="button" class="mini" data-a="estudo" data-e="mc">Probabilidade</button><button type="button" class="mini" data-a="estudo" data-e="sismo">Sismo (ky)</button>${mc.length?`<button type="button" class="mini" data-a="estudo" data-e="retro">Retroanálise</button>`:''}</div>
      ${mc.length>1?`<label class="field">Material da retroanálise</label><select id="gmgRetroMat">${mc.map(id=>`<option value="${h(id)}">${h(s.materiais[id].nome)}</option>`).join('')}</select>`:''}
    </section>`;
  }
  function cardSaida(s){
    return `<section class="gm-work-card" data-card="saida"><div class="gm-card-heading"><span class="gm-card-step">7</span><b>Saída</b>${info('Sobre a saída','A figura sai em PNG, em escala 1:1. O relatório é um PDF A4 com a seção, os fatores de segurança por método, os materiais, as condições, os gráficos e a tabela das fatias. A tabela também sai em CSV. No iPad os arquivos vão para a pasta do projeto no Drive.')}</div>
      <div class="gmg-bts"><button type="button" class="mini" data-a="png">Figura (PNG)</button><button type="button" class="mini" data-a="relatorio">Relatório (PDF)</button><button type="button" class="mini" data-a="csv">Fatias (CSV)</button>${s.linha?`<button type="button" class="mini" data-a="no-mapa">Ver no mapa</button>`:''}<button type="button" class="mini" data-a="duplicar">Duplicar</button><button type="button" class="mini gmg-perigo" data-a="excluir">Excluir a seção</button></div>
    </section>`;
  }
  const CHAVES=['c','m','k','q','p'];
  function renderCards(){
    const s=sec(), el=$('gmgSide'); if(!el) return;
    const topo=el.scrollTop, ativo=document.activeElement, chave=ativo&&el.contains(ativo)?CHAVES.map(k=>ativo.dataset[k]??'').join('|'):'';
    el.innerHTML=s?cardSecao(s)+cardMateriais(s)+cardAgua(s)+cardCargas(s)+cardBusca(s)+cardEstudos(s)+cardSaida(s):'';
    el.scrollTop=topo;
    if(chave.replace(/\|/g,'')){ const novo=[...el.querySelectorAll('input,select,textarea')].find(x=>CHAVES.map(k=>x.dataset[k]??'').join('|')===chave); if(novo) try{ novo.focus({preventScroll:true}); }catch(e){} }
  }
  function renderTudo(){
    if(!montado) return;
    const s=sec(), vz=$('gmgVazio'), w=$('gmGeomecWorkspace');
    w.classList.toggle('sem-cards',recolhido||!s||!!pendente);
    pintaTopo(); renderCards(); pintaChips();
    if(pendente){ vz.hidden=false; vz.innerHTML=htmlPendente(); desenhaPrevia(); }
    else if(!s){ vz.hidden=false; vz.innerHTML=`<div class="gmg-boas"><div class="gmg-boas-ic" aria-hidden="true">◢</div><h2>Estabilidade de taludes</h2><p>Corte uma seção no mapa, sobre o MDT e as superfícies do projeto, ou comece por um talude paramétrico. O GeoMine procura a superfície crítica e mostra o fator de segurança por Morgenstern–Price, Spencer, Bishop e Janbu.</p>
        <div class="gmg-bts"><button type="button" class="tbtn gmg-calc" data-a="tracar">Traçar a seção no mapa</button><button type="button" class="tbtn" data-a="talude">Talude paramétrico</button><button type="button" class="tbtn" data-a="exemplo">Exemplo: pilha sobre camada fraca</button></div></div>`; }
    else { vz.hidden=true; vz.innerHTML=''; }
    $('gmgRes').hidden=!s||!!pendente;
    w.querySelector('.gmg-top [data-a="calcular"]').disabled=!s||!!pendente;
    desenha(); pintaAba();
  }
  function pintaChips(){
    const el=$('gmgChips'); if(!el) return;
    const s=sec(); if(!s||pendente){ el.innerHTML=''; return; }
    const chip=(k,t,on,dica)=>`<button type="button" class="gmg-chip${on?' on':''}" data-a="chip" data-k="${k}" aria-pressed="${!!on}" title="${h(dica)}">${t}</button>`;
    el.innerHTML=`<button type="button" class="gmg-chip" data-a="enquadrar" title="Enquadrar a seção" aria-label="Enquadrar a seção">⤢</button>`+chip('mapa','mapa',ver.mapa,'Mapa de segurança: as superfícies tentadas, coloridas pelo fator de segurança')+chip('fatias','fatias',ver.fatias,'Fatias da superfície em análise')+chip('empuxo','empuxo',ver.empuxo,'Linha de empuxo')+chip('legenda','legenda',ver.legenda,'Legenda dos materiais');
  }

  /* ------------------------------ desenho ------------------------------ */
  function ajusta(c){
    const r=c.getBoundingClientRect(), d=Math.min(2.5,root.devicePixelRatio||1), w=Math.round(r.width), hh=Math.round(r.height);
    if(w<10||hh<10) return null;
    if(c.width!==Math.round(w*d)||c.height!==Math.round(hh*d)){ c.width=Math.round(w*d); c.height=Math.round(hh*d); }
    const ctx=c.getContext('2d'); ctx.setTransform(d,0,0,d,0,0);
    return {ctx, w, h:hh};
  }
  function opDesenho(){
    const s=sec(), o={claro:claro(), mapa:ver.mapa&&modo!=='manual', fatias:ver.fatias, empuxo:ver.empuxo, legenda:ver.legenda, sel:aba==='fatia'?sel:null, editaNA:modo==='na'};
    if(s&&s.busca.faixas==='manual'&&s.busca.entrada&&s.busca.saida) o.faixas={entrada:s.busca.entrada, saida:s.busca.saida};
    if(modo==='manual'){ o.manual=true; o.manualRes=manualRes; o.manualCirc=manualCirc; }
    const ch=$('gmgChips'), cv=$('gmgCanvas');
    if(ch&&cv&&ch.firstChild){ const a=ch.getBoundingClientRect(), b=cv.getBoundingClientRect(); o.legendaLivre=Math.round(a.left-b.left); o.legendaTopo=Math.round(a.bottom-b.top)+8; }
    return o;
  }
  function desenha(){
    const c=$('gmgCanvas'), s=sec(); if(!c||!s||pendente||$('gmGeomecWorkspace').hidden) return;
    const a=ajusta(c); if(!a) return;
    if(!vista) vista=GM.enquadra(s,a.w,a.h,res());
    GM.desenhaSecao(a.ctx,a.w,a.h,s,res(),vista,opDesenho());
  }
  function ligaCanvas(c){
    const pts=new Map(); let arr=null, pinca=null, toque=0;
    const pos=e=>{ const r=c.getBoundingClientRect(); return [e.clientX-r.left,e.clientY-r.top]; };
    const opAlvo=e=>{ const o=opDesenho(); o.raio=e.pointerType==='mouse'?12:22; return o; };
    c.addEventListener('pointerdown',e=>{
      const s=sec(); if(!s||!vista) return;
      try{ c.setPointerCapture(e.pointerId); }catch(_){}
      const p=pos(e); pts.set(e.pointerId,p);
      if(pts.size===2){ const [a,b]=[...pts.values()]; pinca={d:Math.hypot(a[0]-b[0],a[1]-b[1]), v:Object.assign({},vista), m:[(a[0]+b[0])/2,(a[1]+b[1])/2]}; arr=null; return; }
      arr={p0:p, v0:Object.assign({},vista), alvo:GM.alvo(s,res(),vista,p[0],p[1],opAlvo(e)), moveu:false};
      e.preventDefault();
    });
    c.addEventListener('pointermove',e=>{
      const s=sec(); if(!s||!vista||!pts.has(e.pointerId)) return;
      const p=pos(e); pts.set(e.pointerId,p);
      if(pinca&&pts.size===2){
        const [a,b]=[...pts.values()], d=Math.hypot(a[0]-b[0],a[1]-b[1]), k=Math.max(.2,Math.min(8,d/Math.max(1,pinca.d))), m=[(a[0]+b[0])/2,(a[1]+b[1])/2];
        const mw=GM.mundo(pinca.v,pinca.m[0],pinca.m[1]), esc=pinca.v.esc*k;
        vista={esc, x0:mw[0]-m[0]/esc, z1:mw[1]+m[1]/esc}; vistaManual=true; desenha(); return;
      }
      if(!arr) return;
      if(Math.hypot(p[0]-arr.p0[0],p[1]-arr.p0[1])>5) arr.moveu=true;
      if(!arr.moveu) return;
      const al=arr.alvo, [x,z]=GM.mundo(vista,p[0],p[1]), L=GM.limites(s), xx=Math.max(L.x0,Math.min(L.x1,x));
      if(al&&al.tipo==='manual'){
        const m=s.manual;
        if(al.alca==='entrada') m.xe=xx; else if(al.alca==='saida') m.xs=xx;
        else { const ze=lerp(s.terreno,m.xe), zs=lerp(s.terreno,m.xs), dx=m.xs-m.xe, dz=zs-ze, Lc=Math.hypot(dx,dz)||1, sgn=dx>=0?1:-1;
          m.s=((x-m.xe)*dz-(z-ze)*dx)/Lc*sgn/Lc; }
        m.s=Math.max(.02,Math.min(GM.flechaMax(s,m.xe,m.xs),m.s));
        atualizaManual(true); desenha(); return;
      }
      if(al&&al.tipo==='na'){ s.agua.linha[al.i]=[+xx.toFixed(2),+z.toFixed(2)]; desenha(); return; }
      if(al&&al.tipo==='faixa'){ s.busca[al.nome][al.k]=+xx.toFixed(2); desenha(); return; }
      vista={esc:arr.v0.esc, x0:arr.v0.x0-(p[0]-arr.p0[0])/arr.v0.esc, z1:arr.v0.z1+(p[1]-arr.p0[1])/arr.v0.esc}; vistaManual=true; desenha();
    });
    const fim=e=>{
      const s=sec(), tinha=pts.has(e.pointerId); pts.delete(e.pointerId);
      if(pts.size<2) pinca=null;
      if(!s||!arr||!tinha){ arr=null; return; }
      const al=arr.alvo, p=arr.p0, moveu=arr.moveu; arr=null;
      if(moveu){
        if(al&&al.tipo==='na'){ s.agua.linha.sort((a,b)=>a[0]-b[0]); mudou(); }
        else if(al&&al.tipo==='faixa'){ for(const k of ['entrada','saida']) s.busca[k].sort((a,b)=>a-b); mudou(); }
        else if(al&&al.tipo==='manual'){ atualizaManual(false); estudos.delete(s.id); desenha(); pintaAba(); sujoProjeto(); }
        return;
      }
      /* toque sem arrasto */
      const agora=Date.now(), duplo=agora-toque<380; toque=agora;
      if(modo==='na'){
        if(al&&al.tipo==='na'){ if(duplo&&s.agua.linha.length>2){ s.agua.linha.splice(al.i,1); toque=0; mudou(); } return; }
        const [x,z]=GM.mundo(vista,p[0],p[1]), L=GM.limites(s);
        if(x>=L.x0&&x<=L.x1){ s.agua.linha.push([+x.toFixed(2),+z.toFixed(2)]); s.agua.linha.sort((a,b)=>a[0]-b[0]); mudou(); }
        return;
      }
      if(al&&al.tipo==='fatia'){ sel=al.i; aba='fatia'; desenha(); pintaAba(); }
    };
    c.addEventListener('pointerup',fim);
    c.addEventListener('pointercancel',e=>{ pts.delete(e.pointerId); arr=null; pinca=null; });
    c.addEventListener('wheel',e=>{
      if(!vista) return; e.preventDefault();
      const p=pos(e), k=Math.exp(-e.deltaY*0.0014), mw=GM.mundo(vista,p[0],p[1]), esc=Math.max(.02,Math.min(4000,vista.esc*k));
      vista={esc, x0:mw[0]-p[0]/esc, z1:mw[1]+p[1]/esc}; vistaManual=true; desenha();
    },{passive:false});
  }
  /* superfície à mão: círculo por entrada, saída e flecha */
  function atualizaManual(rapido){
    const s=sec(); if(!s) return;
    const L=GM.limites(s), dentro=v=>v>=L.x0-1e-6&&v<=L.x1+1e-6;
    if(!s.manual||!dentro(s.manual.xe)||!dentro(s.manual.xs)){
      const r=res(), c=r&&r.ok&&r.circular&&r.circular.sup;
      if(c&&c.tipo==='circulo'){ const ze=lerp(s.terreno,c.entrada), zs=lerp(s.terreno,c.saida), Lc=Math.hypot(c.saida-c.entrada,zs-ze), fl=c.r-Math.sqrt(Math.max(0,c.r*c.r-Lc*Lc/4)); s.manual={xe:c.entrada, xs:c.saida, s:Math.max(.02,Math.min(.5,fl/Lc))}; }
      else { const alto=lerp(s.terreno,L.x0)>=lerp(s.terreno,L.x1), W=L.x1-L.x0; s.manual=alto?{xe:L.x0+.2*W, xs:L.x0+.75*W, s:.2}:{xe:L.x0+.8*W, xs:L.x0+.25*W, s:.2}; }
    }
    s.manual.s=Math.max(.02,Math.min(GM.flechaMax(s,s.manual.xe,s.manual.xs),s.manual.s));
    manualCirc=GM.circuloES(s,s.manual.xe,s.manual.xs,s.manual.s);
    manualRes=manualCirc?GM.calculaManual(s,{tipo:'circulo', xc:manualCirc.xc, zc:manualCirc.zc, r:manualCirc.r},!!rapido):{ok:false, motivo:'Círculo inválido.'};
    const d=$('gmgDica');
    if(d){ d.hidden=false; d.innerHTML=manualRes&&manualRes.ok?`Superfície à mão: <b style="color:${GM.corFS(manualRes.FS,num(s.fsAdm,1.5))}">FS ${fmt(manualRes.FS,3)}</b> · ${h(GM.METODOS[manualRes.metodo])} — arraste a entrada, a saída e o ponto do fundo.`:`Superfície à mão: ${h(manualRes&&manualRes.motivo||'sem solução')} — arraste as alças.`; }
  }

  /* ------------------------------ resultados ------------------------------ */
  const ABAS=[['resumo','Resumo'],['gle','FS × λ'],['tensoes','Tensões'],['forcas','Forças'],['fatia','Fatia'],['porte','Porte'],['sens','Sensibilidade'],['mc','Probabilidade'],['sismo','Sismo'],['retro','Retroanálise'],['env','Envoltória'],['todas','Seções']];
  const analiseAtual=()=>modo==='manual'?manualRes:(res()&&res().critica);
  const supDe=an=>an.sup.tipo==='circulo'?{tipo:'circulo', xc:an.sup.xc, zc:an.sup.zc, r:an.sup.r}:{tipo:'poli', pts:an.sup.pts};
  function comCurvas(s,an){
    if(an.curvas) return an;
    try{ const SLm=root.GeoMineSlope; return SLm.analisa(SLm.modelo(GM.definicao(s)),supDe(an),{metodo:an.metodo}); }catch(e){ return null; }
  }
  function pintaAba(){
    const s=sec(), nav=$('gmgTabs'), cv=$('gmgGraf'), box=$('gmgGrafBox'), el=$('gmgHtml'); if(!nav||!s||pendente) return;
    const E=estudos.get(s.id)||{};
    if((aba==='retro'&&!E.retro)||(aba==='env'&&!s.materiais[envId])) aba='resumo';
    nav.innerHTML=ABAS.filter(a=>(a[0]!=='retro'||E.retro)&&(a[0]!=='env'||aba==='env')&&(a[0]!=='todas'||GM.secoes().length>1||aba==='todas'))
      .map(a=>`<button type="button" role="tab" data-a="aba" data-k="${a[0]}" class="${a[0]===aba?'on':''}" aria-selected="${a[0]===aba}">${a[1]}</button>`).join('');
    { const on=nav.querySelector('.on'); if(on){ const e0=on.offsetLeft-nav.offsetLeft, e1=e0+on.offsetWidth; nav.scrollLeft=e1>nav.clientWidth?e1-nav.clientWidth+10:0; } }
    const r=res(), an=analiseAtual(), adm=num(s.fsAdm,1.5);
    const mostra=(temGrafico,html)=>{ box.hidden=!temGrafico; el.innerHTML=html||''; el.hidden=!html; el.classList.toggle('sozinha',!temGrafico); el.classList.remove('gmg-embaixo'); };
    const grafico=(cfg,html)=>{ mostra(true,html); const a=ajusta(cv); if(a) GM.grafico(a.ctx,a.w,a.h,cfg,claro()); };
    const msg=t=>mostra(false,`<p class="gmg-msg">${t}</p>`);
    if(aba==='todas'){
      const L=GM.secoes().filter(x=>x.resumo);
      if(L.length>1) grafico({titulo:'Fator de segurança das seções calculadas, na ordem da tabela', x:{rotulo:'seção', dec:0, min:.4, max:L.length+.6}, y:{rotulo:'fator de segurança', zero:true, dec:2}, legenda:false,
        series:[{x:L.map((x,i)=>i+1), y:L.map(x=>x.resumo.FS), tipo:'barras', cores:L.map(x=>GM.corFS(x.resumo.FS,num(x.fsAdm,1.5)))}], hmarcas:[{y:1, rotulo:'FS = 1', cor:'#dc2626'}]},htmlTodas());
      else mostra(false,htmlTodas());
      return;
    }
    if(aba==='env'){ const cfg=GM.grafEnvoltoria(s.materiais[envId],root.GeoMineSlope); if(cfg) grafico(cfg,''); else msg('Complete os parâmetros do material para ver a envoltória.'); return; }
    if(modo!=='manual'&&(!r||!r.ok)){ msg(r&&!r.ok?h(r.motivo||'Sem solução.'):s.auto===false&&!GM.ocupado()?'Toque em Calcular para procurar a superfície crítica.':'Calculando…'); return; }
    if(aba==='resumo'){ mostra(false,htmlResumo(s,r,an)); return; }
    if(!an||!an.ok){ msg(h(an&&an.motivo||'Sem solução nesta superfície.')); return; }
    if(aba==='fatia'){
      const i=Math.max(0,Math.min(an.fatias.length-1,sel==null?an.fatias.reduce((m,f,k,A)=>f.W>A[m].W?k:m,0):sel)); sel=i;
      mostra(true,`<div class="gmg-fatia-nav"><button type="button" class="mini" data-a="fatia" data-d="-1" aria-label="Fatia anterior">◀</button><input type="range" id="gmgFatiaR" min="0" max="${an.fatias.length-1}" value="${i}" aria-label="Fatia"><button type="button" class="mini" data-a="fatia" data-d="1" aria-label="Próxima fatia">▶</button><small>ou toque numa fatia do desenho</small></div>`);
      el.classList.add('gmg-embaixo');
      const a=ajusta(cv); if(a) GM.desenhaFatia(a.ctx,a.w,a.h,an,i,claro());
      return;
    }
    if(aba==='gle'){ const a2=comCurvas(s,an), cfg=a2&&a2.ok&&GM.grafGLE(a2); if(cfg) grafico(cfg,''); else msg('As curvas Fm e Ff não puderam ser traçadas nesta superfície.'); return; }
    if(aba==='tensoes'){ grafico(GM.grafTensoes(an),''); return; }
    if(aba==='forcas'){ if(an.metodo==='ordinario') msg('O método Ordinário não considera forças entre as fatias.'); else grafico(GM.grafForcas(an),''); return; }
    if(aba==='porte'){ if(modo!=='manual'&&r&&r.ok) grafico(GM.grafPorte(r,adm),''); else msg('O gráfico de porte usa as superfícies da busca: volte à superfície crítica.'); return; }
    if(aba==='sens'){ if(E.sens) grafico(GM.grafSensibilidade(E.sens),htmlSens(E.sens)); else mostra(false,htmlPedir('sens','Varia cada parâmetro em ±20%, um por vez, e mostra quanto o fator de segurança muda.')); return; }
    if(aba==='mc'){ if(E.mc) grafico(GM.grafHistograma(E.mc,adm),htmlMC(E.mc)); else mostra(false,htmlPedir('mc','Sorteia os parâmetros 2.000 vezes e conta em quantas o fator de segurança fica abaixo de 1.')); return; }
    if(aba==='sismo'){ if(E.sismo&&E.sismo.curva) grafico(GM.grafSismo(E.sismo),htmlSismo(E.sismo)); else if(E.sismo) msg('Sem solução estática nesta superfície.'); else mostra(false,htmlPedir('sismo','Aumenta o coeficiente sísmico horizontal até o fator de segurança chegar a 1.')); return; }
    if(aba==='retro'&&E.retro){ grafico(GM.grafRetro(E.retro),''); return; }
    msg('Sem dados para este gráfico.');
  }
  const htmlPedir=(e,txt)=>`<div class="gmg-msg"><p>${txt}</p><button type="button" class="tbtn gmg-calc" data-a="estudo" data-e="${e}"${emEstudo?' disabled':''}>${emEstudo?'Calculando…':'Calcular'}</button></div>`;
  const NOME_PORTE={local:'local (bancada)', intermediaria:'intermediária', global:'global (talude geral)'};
  function htmlResumo(s,r,an){
    const adm=num(s.fsAdm,1.5);
    if(!an||!an.ok) return `<p class="gmg-msg">${h(an&&an.motivo||(r&&r.motivo)||'Sem solução.')}</p>`;
    const cor=GM.corFS(an.FS,adm), su=an.sup, ord=['mp','spencer','bishop','janbuC','janbu','ordinario'];
    const linhas=ord.filter(m=>an.F[m]>0).map(m=>`<tr${m===an.metodo?' class="on"':''}><td>${h(GM.METODOS[m])}</td><td>${fmt(an.F[m],3)}</td><td>${m==='mp'||m==='spencer'?'λ '+fmt(an.lam[m],3):m==='janbuC'?'f0 '+fmt(an.f0,3):''}</td></tr>`).join('');
    const falt=ord.filter(m=>!(an.F[m]>0)&&!(m==='ordinario'&&su.tipo!=='circulo')).map(m=>GM.METODOS[m]);
    const busca=modo!=='manual'&&r&&r.ok, porte=busca?r.busca.porte:[];
    return `<div class="gmg-resumo">
      <div class="gmg-fsbox" style="--gmg-cor:${cor}"><b>${fmt(an.FS,3)}</b><span>${h(GM.METODOS[an.metodo])}</span><small>${an.FS>=adm?'atende ao admissível '+fmt(adm,2):an.FS<1?'ruptura: abaixo de 1':'abaixo do admissível '+fmt(adm,2)}</small></div>
      <div><table class="gmg-tab"><thead><tr><th>Método</th><th>FS</th><th></th></tr></thead><tbody>${linhas}</tbody></table>${falt.length?`<p class="gmg-nota">Sem solução nesta superfície: ${h(falt.join(', '))}.</p>`:''}</div>
      <div><table class="gmg-tab"><tbody>
        <tr><td>Superfície</td><td>${su.tipo==='circulo'?'circular':'não circular ('+su.pts.length+' vértices)'}${busca&&r.naoCircular?`<br>círculo ${fmt(r.circular.FS,3)} → otimizada ${fmt(r.naoCircular.FS,3)}`:''}</td></tr>
        ${su.tipo==='circulo'?`<tr><td>Centro e raio</td><td>(${fmt(su.xc,2)} ; ${fmt(su.zc,2)}) · R ${fmt(su.r,2)} m</td></tr>`:''}
        <tr><td>Entrada → saída</td><td>${fmt(su.entrada,2)} m → ${fmt(su.saida,2)} m</td></tr>
        <tr><td>Profundidade máxima</td><td>${fmt(an.profundidade,2)} m</td></tr>
        <tr><td>Massa deslizante</td><td>${fmt(an.area,1)} m² · ${fmt(an.peso,0)} kN/m</td></tr>
        <tr><td>Fatias</td><td>${an.n}</td></tr></tbody></table></div>
      ${porte.length?`<div><table class="gmg-tab"><thead><tr><th>Porte da ruptura</th><th>FS</th><th>desnível</th></tr></thead><tbody>${porte.map(p=>`<tr><td>${NOME_PORTE[p.classe]}</td><td style="color:${GM.corFS(p.FS,adm)};font-weight:700">${fmt(p.FS,3)}</td><td>${fmt(p.altura,1)} m</td></tr>`).join('')}</tbody></table></div>`:''}
      ${an.avisos&&an.avisos.length?`<ul class="gmg-avisos">${an.avisos.map(a=>`<li>${h(a)}</li>`).join('')}${an.avisos.some(a=>/tração/.test(a))?'<li>considere uma trinca de tração (card 4)</li>':''}</ul>`:''}
    </div>`;
  }
  const htmlSens=x=>`<table class="gmg-tab"><thead><tr><th>Parâmetro</th><th>−${fmt(100*x.variacao,0)}%</th><th>+${fmt(100*x.variacao,0)}%</th><th>efeito</th></tr></thead><tbody>${x.itens.map((it,k)=>Object.assign({k},it)).sort((a,b)=>Math.abs(b.FS.at(-1)-b.FS[0])-Math.abs(a.FS.at(-1)-a.FS[0])).map(it=>`<tr><td><i class="gmg-cor" style="background:${GM.PALETA[it.k%GM.PALETA.length]}"></i>${h(it.rotulo)} · ${h(it.nome)}<br><small>${fmt(it.valor,1)} ${h(it.un)}</small></td><td>${fmt(it.FS[0],3)}</td><td>${fmt(it.FS.at(-1),3)}</td><td>${fmt(it.FS.at(-1)-it.FS[0],3)}</td></tr>`).join('')}</tbody></table>`;
  const htmlMC=m=>`<table class="gmg-tab"><tbody><tr><td>FS médio ± desvio</td><td>${fmt(m.media,3)} ± ${fmt(m.dp,3)}</td></tr><tr><td>Mínimo · máximo</td><td>${fmt(m.min,3)} · ${fmt(m.max,3)}</td></tr><tr><td>Probabilidade de ruptura (FS &lt; 1)</td><td><b>${m.pf>0?fmt(100*m.pf,2)+'%':'&lt; '+fmt(100/m.validos,2)+'%'}</b></td></tr><tr><td>Índice de confiabilidade β</td><td>${fmt(m.beta,2)} (normal)<br>${fmt(m.betaLog,2)} (lognormal)</td></tr><tr><td>Dispersão adotada</td><td>${m.vars.map(v=>h(v.rotulo)+' '+fmt(100*v.cv,0)+'%').filter((v,i,a)=>a.indexOf(v)===i).join(' · ')}</td></tr></tbody></table>`;
  const htmlSismo=k=>`<table class="gmg-tab"><tbody><tr><td>FS estático</td><td>${fmt(k.F0,3)}</td></tr><tr><td>Aceleração de escoamento ky</td><td><b>${k.ok?fmt(k.ky,3)+' g':'não atingida até 3 g'}</b></td></tr></tbody></table><p class="gmg-nota">A superfície em análise fica fixa neste estudo. Para projetar com sismo, informe kh no card 4: a busca é refeita com ele.</p>`;
  function htmlTodas(){
    const at=sec();
    return `<div class="gmg-todas"><table class="gmg-tab"><thead><tr><th>#</th><th>Seção</th><th>FS</th><th>Método</th><th>Superfície</th><th>Local</th><th>Interm.</th><th>Global</th><th>Adm.</th></tr></thead><tbody>${GM.secoes().map((s,i)=>{
      const r=s.resumo, adm=num(s.fsAdm,1.5), p=c=>{ const q=r&&(r.porte||[]).find(x=>x.classe===c); return q?`<span style="color:${GM.corFS(q.FS,adm)}">${fmt(q.FS,2)}</span>`:'—'; };
      return `<tr data-a="ativa" data-id="${h(s.id)}" class="${s===at?'on':''}"><td>${i+1}</td><td>${h(s.nome)}</td><td>${r?`<b style="color:${GM.corFS(r.FS,adm)}">${fmt(r.FS,3)}</b>`:'—'}</td><td>${r?h(GM.METODOS[r.metodo]||''):''}</td><td>${r?(r.tipo==='circulo'?'circular':'não circular'):''}</td><td>${p('local')}</td><td>${p('intermediaria')}</td><td>${p('global')}</td><td>${fmt(adm,2)} ${r?(r.FS>=adm?'✓':'✗'):''}</td></tr>`; }).join('')}</tbody></table>
      <button type="button" class="mini" data-a="calcular-todas">Calcular todas as seções</button></div>`;
  }
  function rodaEstudo(e){
    const s=sec(), an=analiseAtual(); if(!s) return;
    if(GM.ocupado()||emEstudo){ aviso('Aguarde o cálculo em andamento terminar.'); return; }
    if(!an||!an.ok){ aviso('Calcule a seção antes de rodar o estudo.'); return; }
    const sup=supDe(an), minha=rodada;
    let pedido;
    if(e==='sens') pedido=GM.pede('sensibilidade',s,[sup,.2]);
    else if(e==='mc') pedido=GM.pede('monteCarlo',s,[sup,2000]);
    else if(e==='sismo') pedido=GM.pede('escoamento',s,[sup]);
    else if(e==='retro'){ const id=($('gmgRetroMat')||{}).value||Object.keys(s.materiais).find(k=>(s.materiais[k].modelo||'mc')==='mc'); pedido=GM.pede('retroanalise',s,[sup,id]); }
    else return;
    aba=e; emEstudo=true; estado('estudo em andamento…','calc'); pintaAba();
    pedido.then(v=>{
      emEstudo=false;
      if(minha!==rodada||sec()!==s) return;
      const E=estudos.get(s.id)||{}; E[e]=v; estudos.set(s.id,E);
      if(e==='retro'){ if(!v||!v.pts||!v.pts.length){ delete E.retro; aviso('Sem pares (c′, φ′) com FS = 1 para este material nesta superfície.'); } else aba='retro'; }
      estado('',''); pintaAba();
    },err=>{
      emEstudo=false;
      if(err&&err.cancelado){ if(sec()===s) pintaAba(); return; }
      console.error('GEOMEC',err); aviso('Estudo interrompido: '+(err&&err.message||err)); estado('',''); pintaAba();
    });
  }

  /* ------------------------------ eventos dos cards ------------------------------ */
  function poe(obj,caminho,v){ const p=caminho.split('.'); let o=obj; for(let i=0;i<p.length-1;i++) o=o[p[i]]=o[p[i]]||{}; o[p[p.length-1]]=v; }
  function naEntrada(e){
    const t=e.target, s=sec(); if(!s||pendente) return;
    if(t.id==='gmgFatiaR'){ sel=+t.value; desenha(); const an=analiseAtual(), a=ajusta($('gmgGraf')); if(a&&an&&an.ok) GM.desenhaFatia(a.ctx,a.w,a.h,an,sel,claro()); return; }
    if(t.type==='checkbox'||t.type==='radio'||t.tagName==='SELECT') return;
    if(t.dataset.c){
      poe(s,t.dataset.c,t.value);
      if(t.dataset.c==='nome'){ renderSeletor(); sujoProjeto(); return; }
      if(t.dataset.c==='fsAdm'){ pintaTopo(); desenha(); pintaAba(); sujoProjeto(); return; }
      mudou(); return;
    }
    if(t.dataset.m){
      const m=s.materiais[t.dataset.m]; if(!m) return;
      m[t.dataset.k]=t.value;
      const linha=t.closest('.gmg-mat');
      if(linha){ linha.querySelector('.gmg-mat-h b').textContent=m.nome; linha.querySelector('.gmg-mat-h small').textContent=GM.resumoMaterial(m); linha.querySelector('.gmg-mat-h i').style.background=m.cor; }
      if(t.dataset.k==='nome'||t.dataset.k==='cor'){ desenha(); sujoProjeto(); return; }
      mudou(); return;
    }
    if(t.dataset.q!=null&&t.dataset.k){ const q=s.cargas[+t.dataset.q]; if(q){ q[t.dataset.k]=t.value; mudou(); } return; }
    if(t.dataset.p&&s.parametros){
      s.parametros[t.dataset.p]=t.value; GM.regeraTalude(s);
      const n=$('gmgTaludeNota'), tt=GM.terrenoTalude(s.parametros); if(n) n.textContent='altura total '+fmt(tt.altura,1)+' m · ângulo geral '+fmt(tt.geral,1)+'°';
      saiDoModo(); vista=null; vistaManual=false; mudou();
    }
  }
  function naMudanca(e){
    const t=e.target;
    if(pendente){
      if(t.name==='gmgTer'){ pendente.terreno=t.value; pendente.contatos.delete(t.value); renderTudo(); }
      else if(t.dataset.cont){ if(t.checked) pendente.contatos.add(t.dataset.cont); else pendente.contatos.delete(t.dataset.cont); }
      return;
    }
    const s=sec(); if(!s) return;
    if(t.dataset.bib!=null){ const b=GM.biblioteca().find(x=>x.id===t.value), m=s.materiais[t.dataset.bib]; if(b&&m){ Object.assign(m,{nome:b.nome, modelo:'mc', gama:b.gama, c:b.c, phi:b.phi, ru:b.ru||0}); mudou(true); } return; }
    if(t.dataset.c){
      if(t.type!=='checkbox'&&t.tagName!=='SELECT') return;
      const k=t.dataset.c, v=t.type==='checkbox'?t.checked:t.value;
      poe(s,k,v);
      if(k==='agua.modo'){ if(v==='linha'&&(!s.agua.linha||s.agua.linha.length<2)) linhaAguaPadrao(s); if(v!=='linha'&&modo==='na') saiDoModo(); mudou(true); return; }
      if(k==='busca.faixas'){ if(v==='manual'&&!(s.busca.entrada&&s.busca.saida)) faixasPadrao(s); mudou(true); return; }
      if(k==='busca.metodo'){ mudou(true); return; }
      if(k==='auto'){ sujoProjeto(); if(v&&!res()) calcula(); return; }
      mudou(); return;
    }
    if(t.dataset.m&&t.dataset.k==='modelo'){ s.materiais[t.dataset.m].modelo=t.value; mudou(true); }
  }
  function linhaAguaPadrao(s){ const L=GM.limites(s), z=L.zTerrenoMin+.35*(L.zTerrenoMax-L.zTerrenoMin), alto=lerp(s.terreno,L.x0)>=lerp(s.terreno,L.x1); s.agua.linha=alto?[[L.x0,z],[L.x1,L.zTerrenoMin]]:[[L.x0,L.zTerrenoMin],[L.x1,z]]; }
  function faixasPadrao(s){
    const r=res(), L=GM.limites(s), c=r&&r.ok&&r.circular&&r.circular.sup, W=L.x1-L.x0;
    if(c){ s.busca.entrada=[c.entrada-.12*W,c.entrada+.12*W]; s.busca.saida=[c.saida-.1*W,c.saida+.1*W]; }
    else { const alto=lerp(s.terreno,L.x0)>=lerp(s.terreno,L.x1); s.busca.entrada=alto?[L.x0,L.x0+.45*W]:[L.x1-.45*W,L.x1]; s.busca.saida=alto?[L.x0+.5*W,L.x1]:[L.x0,L.x0+.5*W]; }
    for(const k of ['entrada','saida']) s.busca[k]=s.busca[k].map(v=>+Math.max(L.x0,Math.min(L.x1,v)).toFixed(2)).sort((a,b)=>a-b);
  }
  function noClique(e){
    const b=e.target.closest('[data-a]'); if(!b||b.disabled) return;
    const a=b.dataset.a, s=sec();
    if(a==='nova'){ ribMiniMenu(b,'Nova seção',[{nome:'Traçar no mapa (MDT e superfícies)',run:iniciaTraco},{nome:'Talude paramétrico',run:novaTalude},{nome:'Exemplo: pilha sobre camada fraca',run:exemplo}].concat(s?[{sep:1},{nome:'Duplicar “'+s.nome+'”',run:()=>{ GM.duplica(s); sujoProjeto(); trocaSecao(); }}]:[])); return; }
    if(a==='tracar'){ iniciaTraco(); return; }
    if(a==='talude'){ novaTalude(); return; }
    if(a==='exemplo'){ exemplo(); return; }
    if(a==='cria-pendente'){ criaPendente(); return; }
    if(a==='cancela-pendente'){ pendente=null; renderTudo(); return; }
    if(a==='painel'){ recolhido=!recolhido; $('gmGeomecWorkspace').classList.toggle('sem-cards',recolhido||!s||!!pendente); return; }
    if(a==='ativa'){ if(GM.ativar(b.dataset.id)!==s) trocaSecao(); return; }
    if(a==='calcular-todas'){ calculaTodas(); return; }
    if(!s||pendente) return;
    if(a==='calcular'){ calcula(); return; }
    if(a==='aba'){ aba=b.dataset.k; desenha(); pintaAba(); return; }
    if(a==='chip'){ ver[b.dataset.k]=!ver[b.dataset.k]; pintaChips(); desenha(); return; }
    if(a==='enquadrar'){ vista=null; vistaManual=false; desenha(); return; }
    if(a==='abre-mat'){ const id=b.dataset.id; if(abertos.has(id)) abertos.delete(id); else abertos.add(id); renderCards(); return; }
    if(a==='nova-camada'){ try{ const c=GM.novaCamadaCota(s,($('gmgCotaNova')||{}).value); abertos.add(c.mat); mudou(true); }catch(err){ aviso(err.message); } return; }
    if(a==='remove-camada'){ GM.removeCamada(s,+b.dataset.k); mudou(true); return; }
    if(a==='envoltoria'){ envId=b.dataset.id; aba='env'; pintaAba(); return; }
    if(a==='edita-na'){ if(modo==='na') saiDoModo(); else { saiDoModo(); modo='na'; const d=$('gmgDica'); d.hidden=false; d.textContent=DICA_NA; } renderCards(); pintaTopo(); desenha(); pintaAba(); return; }
    if(a==='na-horizontal'){ const z=num(($('gmgCotaNA')||{}).value,NaN), L=GM.limites(s); if(!Number.isFinite(z)){ aviso('Informe a cota do nível d’água.'); return; } s.agua.modo='linha'; s.agua.linha=[[L.x0,z],[L.x1,z]]; mudou(true); return; }
    if(a==='nova-carga'){
      const L=GM.limites(s), alto=lerp(s.terreno,L.x0)>=lerp(s.terreno,L.x1), W=L.x1-L.x0, r=res(), c=r&&r.ok&&r.critica.sup;
      let x1, x2;
      if(c&&Number.isFinite(c.entrada)&&Number.isFinite(c.saida)){ const d=c.saida-c.entrada; x1=c.entrada-.12*d; x2=c.entrada+.22*d; }   /* da crista para dentro da massa */
      else if(alto){ x1=L.x0+.05*W; x2=L.x0+.2*W; } else { x1=L.x1-.2*W; x2=L.x1-.05*W; }
      const lim=v=>+Math.max(L.x0,Math.min(L.x1,v)).toFixed(1);
      s.cargas.push({x1:lim(Math.min(x1,x2)), x2:lim(Math.max(x1,x2)), q:20}); mudou(true); return;
    }
    if(a==='remove-carga'){ s.cargas.splice(+b.dataset.i,1); mudou(true); return; }
    if(a==='manual'){ if(modo==='manual') saiDoModo(); else { saiDoModo(); modo='manual'; atualizaManual(false); } estudos.delete(s.id); renderCards(); pintaTopo(); desenha(); pintaAba(); return; }
    if(a==='estudo'){ rodaEstudo(b.dataset.e); return; }
    if(a==='fatia'){ const an=analiseAtual(); if(an&&an.ok){ sel=Math.max(0,Math.min(an.fatias.length-1,(sel||0)+(+b.dataset.d))); desenha(); pintaAba(); } return; }
    if(a==='png'){ exportaPNG(); return; }
    if(a==='relatorio'){ exportaRelatorio(); return; }
    if(a==='csv'){ exportaCSV(); return; }
    if(a==='no-mapa'){ sincronizaMapa({criar:true, zoom:true}); return; }
    if(a==='duplicar'){ GM.duplica(s); sujoProjeto(); trocaSecao(); return; }
    if(a==='excluir'){ if(confirm('Excluir a seção “'+s.nome+'”?')){ rodada++; GM.cancela(); GM.exclui(s); sujoProjeto(); sincronizaMapa(); trocaSecao(); } return; }
  }

  /* ------------------------------ novas seções ------------------------------ */
  function novaTalude(){ GM.novaSecaoTalude({}); sujoProjeto(); pendente=null; open(); trocaSecao(); }
  function exemplo(){
    const s=GM.novaSecaoTalude({bancadas:4, altura:10, angulo:33.7, berma:0, pe:30, crista:50});
    s.nome='Exemplo — pilha sobre camada fraca'; s.parametros=null; s.origem='exemplo';
    s.materiais={m1:Object.assign(GM.materialPadrao(0,'Estéril'),{gama:20, c:0, phi:37}), m2:Object.assign(GM.materialPadrao(1,'Argila mole'),{gama:17, c:5, phi:14}), m3:Object.assign(GM.materialPadrao(2,'Fundação'),{gama:19, c:40, phi:32})};
    const x1=s.terreno.at(-1)[0];
    s.camadas=[{mat:'m1'},{mat:'m2', topo:[[0,0],[x1,0]], fonte:{tipo:'cota', z:0}},{mat:'m3', topo:[[0,-2],[x1,-2]], fonte:{tipo:'cota', z:-2}}];
    s.busca.naoCircular=true; s.base=-25;
    sujoProjeto(); pendente=null; open(); trocaSecao();
  }
  /* Superfícies de cota do projeto (MDT e superfícies TIN). */
  const superficies=()=>{ try{ return (S.rasters||[]).filter(r=>r&&r.d); }catch(e){ return []; } };
  const fonte=(r,g)=>({id:r.id, name:r.name, d:g||r.d, _exactClipRings:r._exactClipRings, noData:r.noData??r.d?.noData, nodata:r.nodata??r.d?.nodata, _nd:r._nd??r.d?._nd,
    crs:(g&&g.crs)||r.d?.crs||r.crs||S.workCRS});
  /* A mesma amostragem do Perfil: estações comuns, NoData e recortes respeitados, TIN pelo triângulo. */
  function amostra(linha,rs,grades,passo){
    const C=root.GeoMineLongitudinalComparison;
    if(!C) throw new Error('módulo de perfis indisponível; atualize o aplicativo');
    return C.sample({points:linha, rasters:rs.map((r,i)=>fonte(r,grades&&grades[i])), step:passo, method:'bilinear', workCRS:S.workCRS,
      reproject:typeof reproj==='function'?reproj:undefined, sampleTin:typeof tinSampleZ==='function'?tinSampleZ:undefined});
  }
  /* traçado no mapa: dois toques */
  function iniciaTraco(){
    if(!superficies().length){ aviso('Carregue um MDT ou uma superfície para cortar a seção — ou comece pelo talude paramétrico.'); return; }
    pendente=null;
    vaiAoMapa();
    setTool('geomecSecao');
    fimDesenho();
    traco={pts:[], grupo:L2.layerGroup([],{pane:'alagis_desenho'}).addTo(map), linha:null};
    map.on('mousemove',mapMove);
    aviso('Seção geotécnica: toque acima da crista e depois além do pé do talude');
  }
  function pontoMapa(e){ let ll=e.latlng; try{ if(S.snapOn){ const sn=snapLatLng(ll,null,{flash:true}); if(sn&&sn.latlng) ll=sn.latlng; } }catch(_){ } return ll; }
  function mapClick(e){
    if(!traco) return;
    const ll=pontoMapa(e); traco.pts.push([ll.lat,ll.lng]);
    L2.circleMarker(ll,{radius:6, color:'#7c3aed', weight:2, fillColor:'#fff', fillOpacity:1, interactive:false, pane:'alagis_desenho'}).addTo(traco.grupo);
    if(traco.pts.length<2){ aviso('Agora toque além do pé do talude'); return; }
    const pts=traco.pts.map(p=>{ const c=fromWGS(S.workCRS,p[1],p[0]); return [c[0],c[1]]; });
    try{ setTool('select'); }catch(_){ fimDesenho(); }
    if(Math.hypot(pts[1][0]-pts[0][0],pts[1][1]-pts[0][1])<2){ aviso('Os dois pontos estão praticamente no mesmo lugar.'); return; }
    preparaNova(pts);
  }
  function mapMove(e){
    if(!traco||traco.pts.length!==1) return;
    const p=[traco.pts[0],[e.latlng.lat,e.latlng.lng]];
    if(traco.linha) traco.linha.setLatLngs(p); else traco.linha=L2.polyline(p,{color:'#7c3aed', weight:3, dashArray:'6 6', interactive:false, pane:'alagis_desenho'}).addTo(traco.grupo);
  }
  function fimDesenho(){ if(!traco) return; try{ map.off('mousemove',mapMove); map.removeLayer(traco.grupo); }catch(e){} traco=null; }
  function preparaNova(linha){
    const R=superficies();
    let base=null; try{ base=R.find(r=>r===S.selRaster)||R.find(r=>String(r.id)===String(S.topoRasterId)); }catch(e){}
    base=base||R.find(r=>r.visible!==false)||R[0];
    pendente={linha, terreno:base?String(base.id):'', contatos:new Set(), ocupado:false, previa:null};
    try{
      const L=Math.hypot(linha[1][0]-linha[0][0],linha[1][1]-linha[0][1]), p=pendente.previa=amostra(linha,R,null,Math.max(L/240,.25));
      /* sugestão de terreno: a superfície que fica por cima na maior parte da linha */
      const vence=R.map(()=>0);
      for(let i=0;i<p.dist.length;i++){ let k=-1, z=-Infinity; p.series.forEach((sr,j)=>{ const v=sr.z[i]; if(Number.isFinite(v)&&v>z){ z=v; k=j; } }); if(k>=0) vence[k]++; }
      const k=vence.indexOf(Math.max(...vence));
      if(R.length>1&&vence[k]>0) pendente.terreno=String(R[k].id);
    }catch(e){ console.warn('GEOMEC: prévia das superfícies',e); }
    open();
    if(R.length===1) criaPendente();
  }
  function htmlPendente(){
    const R=superficies(), L=Math.hypot(pendente.linha[1][0]-pendente.linha[0][0],pendente.linha[1][1]-pendente.linha[0][1]);
    return `<div class="gmg-boas gmg-pend"><h2>Nova seção — ${fmt(L,1)} m</h2><p>Escolha a superfície do <b>terreno</b> (o talude como está ou como ficará) e marque os <b>contatos</b>: superfícies que separam materiais abaixo dele — o terreno original sob uma pilha, o topo da rocha. Onde o terreno não tem cota, vale o contato mais alto.</p>
      ${R.length>1?'<canvas id="gmgPrevia" aria-label="Superfícies ao longo da linha"></canvas>':''}
      <table class="gmg-tab"><thead><tr><th>Terreno</th><th>Contato</th><th>Superfície</th></tr></thead><tbody>${R.map((r,k)=>`<tr><td><input type="radio" name="gmgTer" value="${h(r.id)}"${String(r.id)===pendente.terreno?' checked':''} aria-label="Terreno: ${h(r.name)}"></td><td><input type="checkbox" data-cont="${h(r.id)}"${pendente.contatos.has(String(r.id))?' checked':''}${String(r.id)===pendente.terreno?' disabled':''} aria-label="Contato: ${h(r.name)}"></td><td><i class="gmg-cor" style="background:${GM.PALETA[k%GM.PALETA.length]}"></i>${h(r.name)}${r.d&&r.d.tin?' <small>(TIN)</small>':''}</td></tr>`).join('')}</tbody></table>
      <div class="gmg-bts"><button type="button" class="tbtn gmg-calc" data-a="cria-pendente"${pendente.ocupado?' disabled':''}>${pendente.ocupado?'Cortando na resolução nativa…':'Criar a seção'}</button><button type="button" class="tbtn" data-a="cancela-pendente">Cancelar</button></div></div>`;
  }
  function desenhaPrevia(){
    const c=$('gmgPrevia'), p=pendente&&pendente.previa; if(!c||!p) return;
    const a=ajusta(c); if(!a) return;
    const R=superficies();
    GM.grafico(a.ctx,a.w,a.h,{titulo:'Superfícies ao longo da linha (prévia)', x:{rotulo:'distância (m)'}, y:{rotulo:'cota (m)'},
      series:p.series.map((sr,k)=>({nome:sr.name, x:p.dist, y:sr.z, cor:GM.PALETA[k%GM.PALETA.length], largura:R[k]&&String(R[k].id)===pendente.terreno?3:1.6}))},claro());
  }
  async function criaPendente(){
    const p=pendente; if(!p||p.ocupado) return;
    const R=superficies(), ter=R.find(r=>String(r.id)===p.terreno);
    if(!ter){ aviso('Escolha a superfície do terreno.'); return; }
    const usados=[ter,...R.filter(r=>r!==ter&&p.contatos.has(String(r.id)))];
    p.ocupado=true; renderTudo();
    try{
      const grades=[];
      for(const r of usados){
        let g=null;
        try{ g=await gridBruto(r,'cortar a seção geotécnica',[p.linha]); }catch(e){ console.warn('GEOMEC: grade nativa indisponível para '+r.name,e); }
        if(pendente!==p) return;
        grades.push(g||r.d);
      }
      const L=Math.hypot(p.linha[1][0]-p.linha[0][0],p.linha[1][1]-p.linha[0][1]), cs=Math.min(...grades.map(g=>+g.cs>0?+g.cs:1));
      const passo=Math.max(.25,cs,L/6000), prof=amostra(p.linha,usados,grades,passo);
      if(!prof) throw new Error('a linha não pôde ser amostrada');
      const perfis=usados.map((r,k)=>({id:r.id, nome:r.name, papel:k===0?'terreno':'contato', z:prof.series[k].z}));
      const s=GM.novaSecaoMapa(p.linha,S.workCRS,prof.dist,perfis,{});
      s.passo=+(prof.effectiveStep||passo).toFixed(3);
      pendente=null; sujoProjeto();
      const reduzidas=usados.filter((r,i)=>grades[i]===r.d&&(r.d.resampled>1||r.d.native===false)).map(r=>r.name);
      if(reduzidas.length) aviso('Sem o arquivo original de '+reduzidas.join(', ')+': usada a grade de trabalho nessas superfícies.');
      else if(s.ignorados&&s.ignorados.length) aviso('Sem efeito nesta seção (não passam abaixo do terreno): '+s.ignorados.join(', '));
      try{ cmdLog('GEOMEC: seção '+s.nome+' cortada com passo de '+fmt(s.passo,2)+' m — terreno “'+ter.name+'”'+(s.camadas.length>1?' e '+(s.camadas.length-1)+' contato(s)':'')+'.','info'); }catch(e){}
      trocaSecao(); sincronizaMapa({criar:true});
    }catch(err){ if(pendente===p){ p.ocupado=false; renderTudo(); } aviso('Não foi possível cortar a seção: '+(err&&err.message||err)); console.error('GEOMEC',err); }
  }

  /* ------------------------------ mapa 2D: linhas das seções ------------------------------ */
  /* Camada com a linha de cada seção e, por cima, o trecho entre a entrada e a saída da
     ruptura crítica, na cor da classe do fator de segurança. Nasce quando uma seção é cortada
     no mapa (ou pelo botão “Ver no mapa”); depois só é atualizada — se for apagada, não volta. */
  const NOME_CAMADA='Seções geomecânicas';
  function pontoNaLinha(s,d){ const [a,b]=s.linha, L=Math.hypot(b[0]-a[0],b[1]-a[1])||1, t=(d+(s.recuo||0))/L; return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]; }
  function sincronizaMapa(op){
    op=op||{};
    try{
      const lista=GM.secoes().filter(s=>s.linha&&s.linha.length===2);
      let L=(S.layers||[]).find(l=>l.name===NOME_CAMADA&&l.gtype==='line'&&(l.fields||[]).some(f=>(f&&f.name||f)==='GEOMEC'));
      if(!L&&(!op.criar||!lista.length)) return;
      const feats=[];
      for(const s of lista){
        const r=s.resumo, adm=num(s.fsAdm,1.5), x1=s.terreno.at(-1)[0];
        feats.push({geom:[pontoNaLinha(s,s.terreno[0][0]),pontoNaLinha(s,x1)], multi:false, props:{GEOMEC:s.id, SECAO:s.nome, TIPO:'seção', FS:r?+r.FS.toFixed(3):null, CLASSE:'seção', ROTULO:s.nome+(r?' · FS '+fmt(r.FS,2):'')}});
        if(r&&r.sup&&Number.isFinite(r.sup.entrada)&&Number.isFinite(r.sup.saida)) feats.push({geom:[pontoNaLinha(s,r.sup.entrada),pontoNaLinha(s,r.sup.saida)], multi:false, props:{GEOMEC:s.id, SECAO:s.nome, TIPO:'ruptura crítica', FS:+r.FS.toFixed(3), CLASSE:GM.classe(r.FS,adm), ROTULO:''}});
      }
      const campos=[{name:'GEOMEC',type:'C',length:40},{name:'SECAO',type:'C',length:60},{name:'TIPO',type:'C',length:20},{name:'FS',type:'N',length:8,decimal:3},{name:'CLASSE',type:'C',length:12},{name:'ROTULO',type:'C',length:80}];
      if(!L){
        const ativa=S.activeId;
        L=addLayer({name:NOME_CAMADA, gtype:'line', crs:lista[0].crs||S.workCRS, features:feats, fields:campos, color:'#7c3aed', labelField:'ROTULO'});
        S.activeId=ativa;                                   /* a camada de apoio não rouba a camada ativa do desenho */
      } else { L.features=feats; L.fields=campos; }
      const cat=(value,color,weight)=>({value, color, stroke:color, weight, count:feats.filter(f=>f.props.CLASSE===value).length});
      L.sym=Object.assign({},L.sym,{mode:'cat', field:'CLASSE', weight:2, cats:[cat('seção','#7c3aed',2),cat('ruptura',GM.corClasse.ruptura,6),cat('baixo',GM.corClasse.baixo,6),cat('atencao',GM.corClasse.atencao,6),cat('ok',GM.corClasse.ok,6)]});
      drawLayer(L); try{ refreshUI(); }catch(e){}
      /* o mapa estava escondido: só enquadra depois de ele retomar o tamanho */
      if(op.zoom){ vaiAoMapa(); setTimeout(()=>{ try{ map.invalidateSize({pan:false}); fitLayer(L); }catch(e){} },180); }
    }catch(e){ console.warn('GEOMEC: camada das seções',e); }
  }

  /* ------------------------------ saída ------------------------------ */
  const nomeArq=s=>String(s.nome).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\w\-]+/g,'_').replace(/^_+|_+$/g,'')||'secao';
  function figura(w,hh,escala){
    const s=sec(), c=document.createElement('canvas'); c.width=Math.round(w*escala); c.height=Math.round(hh*escala);
    const ctx=c.getContext('2d'); ctx.setTransform(escala,0,0,escala,0,0);
    const r=res(), v=GM.enquadra(s,w,hh,r,{e:54,d:18,c:30,b:44});
    GM.desenhaSecao(ctx,w,hh,s,r,v,Object.assign(opDesenho(),{claro:true, limpo:true, legenda:true, legendaLivre:null, legendaTopo:null, sel:null, editaNA:false, titulo:s.nome+' — escala 1:1 (H = V)'}));
    return c;
  }
  function exportaPNG(){
    const s=sec(); if(!s) return;
    figura(1600,900,2).toBlob(b=>{ if(b) download(b,'GEOMEC_'+nomeArq(s)+'.png'); },'image/png');
  }
  const COLUNAS=[['nº',f=>f.i+1,0],['x (m)',f=>f.xm,2],['largura (m)',f=>f.b,2],['altura (m)',f=>(f.zgl+f.zgr-f.zbl-f.zbr)/2,2],['α (°)',f=>f.alfa,1],['W (kN/m)',f=>f.W,1],['u (kPa)',f=>f.u,1],
    ['N (kN/m)',f=>f.N,1],['S (kN/m)',f=>f.S,1],['σ′n (kPa)',f=>f.sn,1],['τ res. (kPa)',f=>f.tauR,1],['τ mob. (kPa)',f=>f.tauM,1],['c′ (kPa)',f=>f.c,1],['φ′ (°)',f=>f.phi,1],['E dir. (kN/m)',f=>f.Er,1],['X dir. (kN/m)',f=>f.Xr,1]];
  function exportaCSV(){
    const s=sec(), an=analiseAtual(); if(!s) return;
    if(!an||!an.ok){ aviso('Calcule a seção antes de exportar as fatias.'); return; }
    const n=(v,d)=>Number.isFinite(v)?v.toFixed(d).replace('.',','):'';
    const linhas=[['Seção',s.nome].join(';'),['Método',GM.METODOS[an.metodo]].join(';'),['FS',n(an.FS,4)].join(';'),'',COLUNAS.map(c=>c[0]).concat('material').join(';')];
    an.fatias.forEach((f,i)=>linhas.push(COLUNAS.map(c=>n(c[1](Object.assign({i},f)),c[2])).concat(f.nome||'').join(';')));
    download(new Blob(['﻿'+linhas.join('\r\n')],{type:'text/csv;charset=utf-8'}),'GEOMEC_'+nomeArq(s)+'_fatias.csv');
  }
  /* Relatório A4: página 1 com a seção, os fatores de segurança, os materiais e as condições;
     página 2 com os gráficos; depois a tabela das fatias. Tudo desenhado a 300 dpi. */
  function paginasRelatorio(){
    const s=sec(), r=res(), an0=analiseAtual();
    if(!s||!an0||!an0.ok) return null;
    const an=comCurvas(s,an0)||an0, E=estudos.get(s.id)||{};
    const W=1240, H=1754, K=2, F='Signika, system-ui, sans-serif', adm=num(s.fsAdm,1.5), cor=GM.corFS(an.FS,adm), paginas=[];
    let projeto=''; try{ projeto=typeof projectNameDisplay==='function'?projectNameDisplay(S.currentProjectName||''):String(S.currentProjectName||''); }catch(e){}
    const hoje=new Date().toLocaleDateString('pt-BR');
    const nova=titulo=>{
      const c=document.createElement('canvas'); c.width=W*K; c.height=H*K;
      const ctx=c.getContext('2d'); ctx.setTransform(K,0,0,K,0,0);
      ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#10263a'; ctx.fillRect(0,0,W,84); ctx.fillStyle='#fff'; ctx.font='700 28px '+F; ctx.fillText(titulo,40,40);
      ctx.font='15px '+F; ctx.fillText(['GeoMine · GEOMEC',projeto,hoje].filter(Boolean).join(' · '),40,66);
      paginas.push(c);
      ctx.fillStyle='#5d6f80'; ctx.font='12px '+F; ctx.fillText('Equilíbrio-limite pelo método das fatias, formulação geral (GLE). Parâmetros informados pelo usuário: conferir com ensaios e com o critério de projeto.',40,H-22);
      const pg='página '+paginas.length; ctx.fillText(pg,W-40-ctx.measureText(pg).width,H-22);
      return ctx;
    };
    const tabela=(ctx,x,y0,titulo,linhas,larg)=>{
      ctx.fillStyle='#10263a'; ctx.font='700 16px '+F; ctx.fillText(titulo,x,y0); ctx.font='14px '+F; let yy=y0+8;
      for(const l of linhas){
        yy+=21; ctx.fillStyle='#1c2733'; ctx.fillText(l[0],x,yy);
        let t=String(l[1]); const max=larg-ctx.measureText(l[0]).width-16; while(t.length>4&&ctx.measureText(t).width>max) t=t.slice(0,-2)+'…';
        ctx.fillStyle=l[2]||'#1c2733'; ctx.fillText(t,x+larg-ctx.measureText(t).width,yy);
        ctx.strokeStyle='#e1e8ee'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(x,yy+5.5); ctx.lineTo(x+larg,yy+5.5); ctx.stroke();
      }
      return yy;
    };
    const poeGrafico=(ctx,cfg,x,y,w,hh)=>{ const g=document.createElement('canvas'); g.width=w*K; g.height=hh*K; const gc=g.getContext('2d'); gc.setTransform(K,0,0,K,0,0); cfg.limpo=true; GM.grafico(gc,w,hh,cfg,true); ctx.drawImage(g,x,y,w,hh); ctx.strokeStyle='#c5d0da'; ctx.lineWidth=1; ctx.strokeRect(x+.5,y+.5,w,hh); };
    /* página 1 */
    let ctx=nova('Análise de estabilidade — '+s.nome);
    ctx.drawImage(figura(1160,560,K),40,104,1160,560); ctx.strokeStyle='#c5d0da'; ctx.strokeRect(40.5,104.5,1160,560);
    let y=696;
    ctx.fillStyle=cor; ctx.fillRect(40,y,300,124); ctx.fillStyle='#fff'; ctx.font='700 58px '+F; ctx.fillText(fmt(an.FS,3),60,y+66);
    ctx.font='16px '+F; ctx.fillText(GM.METODOS[an.metodo],60,y+92); ctx.fillText(an.FS>=adm?'atende ao admissível '+fmt(adm,2):'abaixo do admissível '+fmt(adm,2),60,y+113);
    const ord=['mp','spencer','bishop','janbuC','janbu','ordinario'].filter(m=>an.F[m]>0), su=an.sup;
    tabela(ctx,370,y+16,'Fator de segurança por método',ord.map(m=>[GM.METODOS[m]+(m==='mp'||m==='spencer'?'  (λ '+fmt(an.lam[m],3)+')':''),fmt(an.F[m],3),m===an.metodo?cor:null]),380);
    tabela(ctx,790,y+16,'Superfície '+(modo==='manual'?'definida à mão':'crítica'),[['Tipo',su.tipo==='circulo'?'circular':'não circular'],...(su.tipo==='circulo'?[['Centro (x ; z)',fmt(su.xc,2)+' ; '+fmt(su.zc,2)],['Raio',fmt(su.r,2)+' m']]:[['Vértices',String(su.pts.length)]]),['Entrada → saída',fmt(su.entrada,1)+' → '+fmt(su.saida,1)+' m'],['Profundidade máxima',fmt(an.profundidade,2)+' m'],['Massa deslizante',fmt(an.area,1)+' m² · '+fmt(an.peso,0)+' kN/m']],410);
    y=878;
    y=tabela(ctx,40,y,'Materiais, de cima para baixo',s.camadas.map(cm=>{ const m=s.materiais[cm.mat]; return [m.nome+'  ['+GM.MODELOS[m.modelo||'mc']+']',GM.resumoMaterial(m)]; }),1160)+36;
    const busca=modo!=='manual'&&r&&r.ok;
    const cond=[['Origem',s.origem==='mapa'?'cortada no mapa'+(s.passo?', passo de '+fmt(s.passo,2)+' m':'')+' — '+s.camadas.map(c=>c.fonte&&c.fonte.nome).filter(Boolean).join(' / '):s.parametros?'talude paramétrico':'definida na seção'],
      ['Água',s.agua.modo==='linha'?'linha freática de '+s.agua.linha.length+' pontos (γw 9,81 kN/m³)':'sem linha freática'],['Sismo pseudo-estático','kh '+fmt(num(s.sismo.kh,0),3)+' · kv '+fmt(num(s.sismo.kv,0),3)],
      ['Sobrecargas',(s.cargas||[]).length?s.cargas.map(q=>fmt(num(q.q,0),0)+' kPa de '+fmt(num(q.x1,0),1)+' a '+fmt(num(q.x2,0),1)+' m').join('; '):'nenhuma'],
      ['Trinca de tração',num(s.trinca.prof,0)>0?fmt(num(s.trinca.prof,0),2)+' m, '+fmt(num(s.trinca.agua,0),0)+'% de água':'não considerada'],
      ['Busca',busca?fmt(r.busca.validas,0)+' círculos válidos por entrada e saída'+(r.naoCircular?' + otimização não circular ('+fmt(r.circular.FS,3)+' → '+fmt(r.naoCircular.FS,3)+')':''):'superfície definida à mão']];
    if(busca&&r.busca.porte.length) cond.push(['FS por porte da ruptura',r.busca.porte.map(p=>({local:'local',intermediaria:'intermediária',global:'global'}[p.classe])+' '+fmt(p.FS,3)).join(' · ')]);
    if(an.residuo) cond.push(['Equilíbrio das fatias','resíduo máximo: vertical '+Number(an.residuo.v).toExponential(1)+' · horizontal '+Number(an.residuo.h).toExponential(1)+' kN/m']);
    if(an.avisos&&an.avisos.length) cond.push(['Avisos',an.avisos.join('; ')]);
    y=tabela(ctx,40,y,'Condições da análise',cond,1160)+34;
    /* gráficos, dois por linha: os dois primeiros aproveitam o que sobrar da página 1 */
    let G=[an.curvas?GM.grafGLE(an):null,GM.grafTensoes(an),an.metodo==='ordinario'?null:GM.grafForcas(an),busca?GM.grafPorte(r,adm):null,E.sens?GM.grafSensibilidade(E.sens,true):null,E.mc?GM.grafHistograma(E.mc,adm):null,E.sismo&&E.sismo.curva?GM.grafSismo(E.sismo):null,E.retro?GM.grafRetro(E.retro):null].filter(Boolean);
    if(G.length&&H-60-y>=300){ const gh=Math.min(430,H-60-y); G.slice(0,2).forEach((cfg,i)=>poeGrafico(ctx,cfg,40+i*590,y,570,gh)); G=G.slice(2); }
    if(G.length){
      ctx=nova('Gráficos — '+s.nome);
      const linhasG=Math.ceil(G.length/2), gh=Math.min(520,Math.floor((H-104-60-(linhasG-1)*16)/linhasG));
      G.forEach((cfg,i)=>poeGrafico(ctx,cfg,40+(i%2)*590,104+Math.floor(i/2)*(gh+16),570,gh));
    }
    /* tabela das fatias */
    const porPagina=84, larg=[40,62,70,70,56,78,66,78,78,74,78,78,62,56,84,84];
    for(let p=0;p*porPagina<an.fatias.length;p++){
      ctx=nova('Fatias — '+s.nome+(an.fatias.length>porPagina?' ('+(p+1)+')':''));
      let x=40; const y0=118;
      ctx.font='700 12px '+F; ctx.fillStyle='#10263a';
      COLUNAS.forEach((c,k)=>{ ctx.fillText(c[0],x+larg[k]-ctx.measureText(c[0]).width-6,y0); x+=larg[k]; }); ctx.fillText('material',x+4,y0);
      ctx.strokeStyle='#10263a'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(40,y0+7.5); ctx.lineTo(W-40,y0+7.5); ctx.stroke();
      ctx.font='12px '+F;
      an.fatias.slice(p*porPagina,(p+1)*porPagina).forEach((f,j)=>{
        const i=p*porPagina+j, yy=y0+24+j*18; x=40;
        if(j%2){ ctx.fillStyle='#f3f6f9'; ctx.fillRect(40,yy-13,W-80,18); }
        ctx.fillStyle='#1c2733';
        COLUNAS.forEach((c,k)=>{ const v=c[1](Object.assign({i},f)), t=Number.isFinite(v)?fmt(v,c[2]):'—'; ctx.fillText(t,x+larg[k]-ctx.measureText(t).width-6,yy); x+=larg[k]; });
        let t=String(f.nome||''); while(t.length>3&&ctx.measureText(t).width>W-44-x) t=t.slice(0,-2)+'…'; ctx.fillText(t,x+4,yy);
      });
    }
    return {paginas, W:W*K, H:H*K};
  }
  function exportaRelatorio(){
    const s=sec(); if(!s) return Promise.resolve(false);
    let R;
    try{ R=paginasRelatorio(); }catch(e){ console.error('GEOMEC',e); aviso('Não foi possível montar o relatório: '+(e&&e.message||e)); return Promise.resolve(false); }
    if(!R){ aviso('Calcule a seção antes de emitir o relatório.'); return Promise.resolve(false); }
    estado('montando o relatório…','calc');
    return Promise.all(R.paginas.map(c=>new Promise(ok=>c.toBlob(b=>{ if(!b){ ok(null); return; } b.arrayBuffer().then(a=>ok(new Uint8Array(a)),()=>ok(null)); },'image/jpeg',.9)))).then(jpgs=>{
      estado('','');
      if(jpgs.some(j=>!j)) throw new Error('o navegador não gerou as páginas');
      return download(buildPDFmulti(jpgs.map(jpeg=>({PW:210, PH:297, jpeg, pxW:R.W, pxH:R.H}))),'Relatorio_GEOMEC_'+nomeArq(s)+'.pdf');
    }).catch(e=>{ estado('',''); console.error('GEOMEC',e); aviso('Não foi possível montar o relatório: '+(e&&e.message||e)); return false; });
  }

  /* ------------------------------ faixa GEOTECNIA ------------------------------ */
  function comando(k){
    if(k==='secao'){ iniciaTraco(); return; }
    if(k==='talude'){ novaTalude(); return; }
    open();
    const s=sec();
    if(!s||pendente){ if(k!=='estabilidade') aviso('Crie uma seção primeiro: trace no mapa ou use o talude paramétrico.'); return; }
    if(k==='estabilidade'){ aba='resumo'; calcula(); }
    else if(k==='agua'){ if(s.agua.modo!=='linha'){ s.agua.modo='linha'; linhaAguaPadrao(s); mudou(true); } saiDoModo(); modo='na'; const d=$('gmgDica'); d.hidden=false; d.textContent=DICA_NA; renderCards(); desenha(); }
    else if(k==='sismo'){ aba='sismo'; if(res()&&res().ok&&!GM.ocupado()) rodaEstudo('sismo'); else pintaAba(); }
    else if(k==='relatorio'){ if(res()&&res().ok&&!GM.ocupado()) exportaRelatorio(); else aviso('Assim que o cálculo terminar, peça o relatório de novo.'); }
  }

  /* ------------------------------ projeto ------------------------------ */
  function restore(d){
    rodada++; GM.cancela(); clearTimeout(timer);
    GM.restaura(d); estudos.clear(); abertos.clear(); vista=null; vistaManual=false; sel=null; pendente=null; emEstudo=false; saiDoModo(); fimDesenho();
    if(montado){ estado('',''); if(!$('gmGeomecWorkspace').hidden) mostrou(); }
  }
  const api={open, mostrou, comando, mapClick, fimDesenho, snapshot:()=>GM.snapshot(), restore, reset:()=>restore(null), hasContent:()=>GM.temConteudo(),
    visivel:()=>montado&&!$('gmGeomecWorkspace').hidden,
    __teste:{GM, sec, res, calcula, exportaRelatorio, paginasRelatorio, exportaCSV, figura, sincronizaMapa, preparaNova, estudos,
      estado:()=>({aba, modo, sel, vista, vistaManual, pendente:pendente?{terreno:pendente.terreno, contatos:[...pendente.contatos], ocupado:pendente.ocupado}:null, ocupado:GM.ocupado(), emEstudo, rodada})}};
  root.GeoMineGeomec=api;
  const liga=()=>{ try{ mount(); }catch(e){ console.warn('GEOMEC',e); } };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(liga,0)); else setTimeout(liga,0);
})(window);

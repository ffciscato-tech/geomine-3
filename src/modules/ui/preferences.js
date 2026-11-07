/* ================== PREFERÊNCIAS (aba Configurações) ================== */
const PREFS_KEY='alagis_prefs';
/* rodaZoom: quantos PIXELS de rolagem valem UM nível de zoom no mapa.
   O padrão do Leaflet (60) faz a roda comum, que manda 100–120 px por clique,
   pular um nível inteiro (às vezes dois num giro rápido). Valores maiores =
   passo menor por clique. */
const PREFS_DEF={ ricsz:34, riclbl:10, rbtnw:60, showLabels:true, fontUI:16, rodaZoom:160 };
function prefsGet(){ try{ return Object.assign({},PREFS_DEF,JSON.parse(localStorage.getItem(PREFS_KEY)||'{}')); }catch(e){ return {...PREFS_DEF}; } }
function prefsApply(p){
  p=p||prefsGet();
  // No 3.0 as variáveis-base vivem no body.alagis3. Aplicá-las somente ao
  // :root não vence essa declaração; por isso o controle parecia não agir.
  const r=document.body.style;
  r.setProperty('--ricsz', p.ricsz+'px');
  r.setProperty('--png-step', p.ricsz+'px');
  r.setProperty('--ric-scale', String(p.ricsz/48));
  r.setProperty('--riclbl', p.riclbl+'px');
  r.setProperty('--rbtnw', p.rbtnw+'px');
  document.body.style.fontSize=(p.fontUI||16)+'px';
  document.body.classList.toggle('nolabels', !p.showLabels);
}
function prefsSet(patch){
  const p=Object.assign(prefsGet(),patch);
  try{ localStorage.setItem(PREFS_KEY, JSON.stringify(p)); }catch(e){}
  prefsApply(p); rodaZoomAplica(p.rodaZoom); return p;
}
/* Sensibilidade da roda no mapa 2D. Também reduz o passo de cada gesto
   (zoomDelta/zoomSnap 0,5) para o zoom não saltar de nível em nível. */
function rodaZoomAplica(px){
  if(typeof map==='undefined'||!map) return;
  const v=Math.max(40,Math.min(600,+px||160));
  map.options.wheelPxPerZoomLevel=v;
  map.options.wheelDebounceTime=40;
  const passo=v>=120?0.5:1;
  map.options.zoomSnap=passo; map.options.zoomDelta=passo;
  if(map.scrollWheelZoom&&map.scrollWheelZoom.enabled()){
    map.scrollWheelZoom.disable(); map.scrollWheelZoom.enable();
  }
}
function abrePrefs(){
  let p=prefsGet();
  const bg=document.createElement('div'); bg.className='modal-bg on';
  const row=(lbl,ctrl)=>'<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 0">'+
    '<span style="font-size:13px">'+lbl+'</span>'+ctrl+'</div>';
  bg.innerHTML='<div class="modal" style="width:min(440px,100%)">'+
    '<div class="modal-h"><b>⚙ Configurações — Aparência</b>'+
      '<div style="flex:1"></div><span class="gset" id="prefX" style="font-size:16px;cursor:pointer">✕</span></div>'+
    '<div class="modal-b">'+
      '<label class="field">Tamanho dos ícones da barra</label>'+
      row('Ícone <b id="pvIc">'+p.ricsz+'px</b>',
        '<input type="range" id="prIc" min="20" max="52" step="2" value="'+p.ricsz+'" style="width:200px">')+
      row('Largura do botão <b id="pvW">'+p.rbtnw+'px</b>',
        '<input type="range" id="prW" min="46" max="96" step="2" value="'+p.rbtnw+'" style="width:200px">')+
      row('Texto do rótulo <b id="pvL">'+p.riclbl+'px</b>',
        '<input type="range" id="prL" min="8" max="14" step="0.5" value="'+p.riclbl+'" style="width:200px">')+
      row('Mostrar nomes sob os ícones',
        '<input type="checkbox" id="prLbl"'+(p.showLabels?' checked':'')+'>')+
      '<div style="border-top:1px dashed var(--line);margin:12px 0 4px"></div>'+
      '<label class="field">Interface</label>'+
      row('Tamanho da fonte <b id="pvF">'+p.fontUI+'px</b>',
        '<input type="range" id="prF" min="13" max="20" step="1" value="'+p.fontUI+'" style="width:200px">')+
      row('Tema',
        '<select id="prTheme" style="background:var(--panel2);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:3px 6px">'+
        '<option value="dark">Escuro</option><option value="light">Claro</option></select>')+
      '<div style="border-top:1px dashed var(--line);margin:12px 0 4px"></div>'+
      '<label class="field">Roda do mouse (zoom do mapa)</label>'+
      row('Passo por clique da roda <b id="pvR">'+(160/(+p.rodaZoom||160)).toFixed(2)+'×</b>',
        '<input type="range" id="prR" min="60" max="400" step="10" value="'+(+p.rodaZoom||160)+'" style="width:200px">')+
      '<div class="hint" style="margin:-4px 0 0">Arraste para a direita para o zoom avançar menos a cada clique da roda.</div>'+
      '<div style="display:flex;gap:8px;margin-top:16px">'+
        '<button class="tbtn" id="prPreset1" style="flex:1;justify-content:center">Compacto</button>'+
        '<button class="tbtn" id="prPreset2" style="flex:1;justify-content:center">Padrão</button>'+
        '<button class="tbtn" id="prPreset3" style="flex:1;justify-content:center">Grande</button>'+
      '</div>'+
      '<button class="tbtn" id="prReset" style="width:100%;justify-content:center;margin-top:8px">↺ Restaurar padrão</button>'+
    '</div></div>';
  document.body.appendChild(bg);
  const $=id=>bg.querySelector('#'+id);
  const fechar=()=>bg.remove();
  bg.addEventListener('click',e=>{ if(e.target===bg) fechar(); });
  $('prefX').onclick=fechar;
  const upd=()=>{ $('pvIc').textContent=$('prIc').value+'px'; $('pvW').textContent=$('prW').value+'px';
    $('pvL').textContent=$('prL').value+'px'; $('pvF').textContent=$('prF').value+'px';
    if($('prR')) $('pvR').textContent=(160/(+$('prR').value||160)).toFixed(2)+'×';
    p=prefsSet({ ricsz:+$('prIc').value, rbtnw:+$('prW').value, riclbl:+$('prL').value,
      fontUI:+$('prF').value, showLabels:$('prLbl').checked,
      rodaZoom:$('prR')?+$('prR').value:undefined }); ribbonBuild(); };
  ['prIc','prW','prL','prF','prR'].forEach(id=>{ if($(id)) $(id).oninput=upd; });
  $('prLbl').onchange=upd;
  // tema: reaproveita o seletor existente #uiTheme, se houver
  const ut=document.getElementById('uiTheme');
  if(ut) $('prTheme').value=ut.value;
  $('prTheme').onchange=()=>{ if(ut){ ut.value=$('prTheme').value; ut.dispatchEvent(new Event('change')); } };
  const preset=(ic,w,l,f)=>{ $('prIc').value=ic; $('prW').value=w; $('prL').value=l; $('prF').value=f; upd(); };
  $('prPreset1').onclick=()=>preset(24,48,8.5,14);
  $('prPreset2').onclick=()=>preset(30,56,9.5,16);
  $('prPreset3').onclick=()=>preset(42,76,11,17);
  $('prReset').onclick=()=>{ preset(PREFS_DEF.ricsz,PREFS_DEF.rbtnw,PREFS_DEF.riclbl,PREFS_DEF.fontUI);
    $('prLbl').checked=true; if($('prR')) $('prR').value=PREFS_DEF.rodaZoom; upd(); };
}

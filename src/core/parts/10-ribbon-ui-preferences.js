/* ================== MODO AUTOCAD ==================
   Comandos como ÍCONES NO TOPO (um por seção da aba ativa) e a paleta de
   PROPRIEDADES DA CAMADA à esquerda. Nenhum painel foi reescrito: ao tocar
   um ícone, a seção original é MOVIDA (viva, com todos os campos e botões)
   para uma janela suspensa; ao fechar, volta ao lugar. Alternável pelo 🅰. */
const ACAD_KEY='alagis_modo_acad';
function acadOn(){ return document.body.classList.contains('acad'); }
function acadSet(on){
  document.body.classList.toggle('acad', !!on);
  try{ localStorage.setItem(ACAD_KEY, on?'1':'0'); }catch(e){}
  // a lista de camadas é a coluna esquerda fixa no modo AutoCAD:
  // esconde o ✕ que fecharia a gaveta no mobile
  const x=document.getElementById('btnCloseRight'); if(x) x.style.display=on?'none':'';
  const tb=document.getElementById('tabBar'); if(tb) tb.style.display=on?'none':'';
  ribbonClose(); ribbonBuild(); propRefresh();
  const b=document.getElementById('btnAcad'); if(b) b.classList.toggle('on', !!on);
  try{ map.invalidateSize(); }catch(e){}
  toast(on? 'Modo AutoCAD: comandos no topo · propriedades à esquerda'
          : 'Painéis clássicos restaurados');
}
const RIB_SRC={map:'sideMain', layout:'sideMain', hidro:'sideHidro', geo:'sideGeo',
               v3d:'sideV3d', cub:'sideCub', perfis:'sidePerfis'};
let RIB={sec:null, ph:null, btn:null};
/* glifos SVG desenhados — mapeados por palavra-chave do título da seção */
const RIB_ICONS={
  estrada:'<svg viewBox="0 0 24 24"><path d="M8 21 10 3h4l2 18z" class="softamb"/><path d="M8 21 10 3h4l2 18z"/><path d="M12 5v3m0 3v3m0 3v3" stroke-dasharray="2 2"/></svg>',
  alinhamento:'<svg viewBox="0 0 24 24"><circle cx="4.5" cy="18" r="2.2" class="fillamb"/><circle cx="19.5" cy="6" r="2.2" class="fillamb"/><path d="M6 17C10 17 9 9 13 8c3-.8 4.5-1 5-1.4"/><path d="M2 21h20" stroke-dasharray="3 3"/></svg>',
  greide:'<svg viewBox="0 0 24 24"><path d="M2 18h20"/><path d="M3 15 9 9l5 4 7-7"/><path d="M3 21h18" stroke-dasharray="2 3"/></svg>',
  crs:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/></svg>',
  wms:'<svg viewBox="0 0 24 24"><circle cx="10" cy="12" r="8" class="softamb"/><circle cx="10" cy="12" r="8"/><ellipse cx="10" cy="12" rx="3.5" ry="8"/><path d="M2 12h16M4 7h12M4 17h12"/><path d="M17 8h4v9h-4M18.5 11h2.5M18.5 14h2.5"/></svg>',
  anm:'<svg viewBox="0 0 24 24"><path d="M3 20 9 9l3 5 3-8 6 14z" class="softamb"/><path d="M3 20 9 9l3 5 3-8 6 14z"/><path d="M5 5c4-2 9-1 13 2M12 6l-6 8"/><circle cx="18" cy="7" r="1.5" class="fillamb"/></svg>',
  cad:'<svg viewBox="0 0 24 24"><path d="M4 20V4h9l7 7v9z" class="softamb"/><path d="M4 20V4h9l7 7v9z"/><path d="M8 20V9m0 0-3 3m3-3 3 3" /><path d="M13 4v7h7"/></svg>',
  inter:'<svg viewBox="0 0 24 24"><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/><path d="M12 7.2a6 6 0 0 0 0 9.6 6 6 0 0 0 0-9.6z" class="softamb"/></svg>',
  corte:'<svg viewBox="0 0 24 24"><circle cx="6" cy="7" r="2.4"/><circle cx="6" cy="17" r="2.4"/><path d="M8 8.5 20 17M8 15.5 20 7"/></svg>',
  curva:'<svg viewBox="0 0 24 24"><path d="M3 15c3-6 6 4 9-1s6-7 9-2"/><path d="M3 19c3-6 6 4 9-1s6-7 9-2" opacity=".5"/><path d="M3 11c3-6 6 4 9-1s6-7 9-2" opacity=".5"/></svg>',
  tin:'<svg viewBox="0 0 24 24"><path d="M12 3 3 20h18z" class="softamb"/><path d="M12 3 3 20h18zM12 3l-4 9m4-9 5 8m-9 0h9M8 12l-5 8m13-8 2 8"/></svg>',
  export:'<svg viewBox="0 0 24 24"><path d="M12 3v11m0 0-4-4m4 4 4-4"/><path d="M5 15v4h14v-4"/></svg>',
  imagem:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.8" class="fillamb"/><path d="m4 18 5-5 4 3 3-2 4 4"/></svg>',
  layout:'<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 8h16M9 8v13"/><path d="M12 12h5M12 15h5" opacity=".6"/></svg>',
  hidro:'<svg viewBox="0 0 24 24"><path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z" class="softamb"/><path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/><path d="M9 14a3 3 0 0 0 3 3"/></svg>',
  perfil:'<svg viewBox="0 0 24 24"><path d="M3 20h18M4 20l4-8 4 3 3-7 5 12" class="softamb"/><path d="M4 20l4-8 4 3 3-7 5 12"/><path d="M3 4v16"/></svg>',
  cubagem:'<svg viewBox="0 0 24 24"><path d="M12 3 3 7.5v9L12 21l9-4.5v-9z" class="softamb"/><path d="M12 3 3 7.5v9L12 21l9-4.5v-9zM3 7.5 12 12l9-4.5M12 12v9"/></svg>',
  cena:'<svg viewBox="0 0 24 24"><rect x="3" y="6" width="14" height="12" rx="2"/><path d="M17 10l4-2v8l-4-2z" class="softamb"/><path d="M17 10l4-2v8l-4-2z"/></svg>',
  estaca:'<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M5 6v4M9 6v6M13 6v4M17 6v6M21 6v4"/><path d="M3 18h18" opacity=".5"/></svg>',
  ponto:'<svg viewBox="0 0 24 24"><path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12z" class="softamb"/><path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="9" r="2.4" class="fillamb"/></svg>',
  mescla:'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="11" height="11" rx="2" class="softamb"/><rect x="4" y="4" width="11" height="11" rx="2"/><rect x="9" y="9" width="11" height="11" rx="2"/></svg>',
  limpeza:'<svg viewBox="0 0 24 24"><path d="M6 10h12l-1 10H7z" class="softamb"/><path d="M6 10h12l-1 10H7zM9 10V6a3 3 0 0 1 6 0v4"/><path d="M10 13v4M14 13v4"/></svg>',
  publica:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  acoes:'<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z" class="fillamb"/></svg>',
  restricao:'<svg viewBox="0 0 24 24"><path d="M12 3 3 7.5v9L12 21l9-4.5v-9z"/><path d="M7 9.8v4.4L12 17l5-2.8V9.8" class="softamb"/><path d="M4 8l8 4 8-4"/></svg>',
  bloco:'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1" class="softamb"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1" class="softamb"/></svg>',
  relatorio:'<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12l2 2 3-4" class="fillamb" stroke="none"/><path d="M9 12l2 2 3-4"/><path d="M9 17h6"/></svg>',
  sequencia:'<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="12" r="2.4"/><circle cx="6" cy="18" r="2.4"/><path d="M8 6h6a2 2 0 0 1 2 2M8 18h6a2 2 0 0 0 2-2"/></svg>',
  aparencia:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" class="softamb"/><circle cx="9" cy="9" r="1" class="fillamb"/><circle cx="14" cy="14" r="1" class="fillamb"/></svg>',
  chuva:'<svg viewBox="0 0 24 24"><path d="M6 11a4 4 0 0 1 1-7 5 5 0 0 1 9 1 3.5 3.5 0 0 1 1 6.9z" class="softamb"/><path d="M6 11a4 4 0 0 1 1-7 5 5 0 0 1 9 1 3.5 3.5 0 0 1 1 6.9"/><path d="M8 15l-1 3M12 15l-1 3M16 15l-1 3"/></svg>',
  idf:'<svg viewBox="0 0 24 24"><path d="M3 20V4M3 20h18"/><path d="M6 20c2-9 5-11 12-12" class="softamb" stroke="none"/><path d="M6 20c2-9 5-11 12-12"/><path d="M18 5v3h-3" opacity=".7"/></svg>',
  dimension:'<svg viewBox="0 0 24 24"><path d="M4 7h16M4 5v4M20 5v4"/><rect x="7" y="13" width="10" height="6" rx="1" class="softamb"/><path d="M7 13h10v6H7z"/></svg>',
  medicao:'<svg viewBox="0 0 24 24"><path d="M3 17 17 3l4 4L7 21z" class="softamb"/><path d="M3 17 17 3l4 4L7 21z"/><path d="M7 13l2 2M11 9l2 2M15 5l2 2"/></svg>',
  resultado:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M7 14l3-2 3 3 4-4" class="fillamb" stroke="none"/><path d="M7 14l3-2 3 3 4-4"/></svg>',
  painel:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9" opacity=".6"/></svg>'
};
function ribbonIcon(t){
  const T=t.toLowerCase();
  if(/\banm\b|sigmine|processo miner[aá]rio/.test(T))return RIB_ICONS.anm;
  if(/wms|ogc|geosserv|servidor/.test(T))return RIB_ICONS.wms;
  if(/crs|coorden/.test(T))return RIB_ICONS.crs;
  if(/cad|desenho|precis/.test(T))return RIB_ICONS.cad;
  if(/interse|interpola|triangula|delaunay/.test(T))return (/interpola|triangula|delaunay/.test(T)?RIB_ICONS.tin:RIB_ICONS.inter);
  if(/cortar|corte|linha-limite/.test(T))return RIB_ICONS.corte;
  if(/curva|n[ií]vel|marching/.test(T))return RIB_ICONS.curva;
  if(/superf[ií]cie|mdt|mde|mosaico|malha/.test(T))return RIB_ICONS.tin;
  if(/restri[çc]/.test(T))return RIB_ICONS.restricao;
  if(/bloco|sub-bloco/.test(T))return RIB_ICONS.bloco;
  if(/relat[óo]rio|bancada/.test(T))return RIB_ICONS.relatorio;
  if(/sequenc|vida [úu]til/.test(T))return RIB_ICONS.sequencia;
  if(/exibi[çc]|apar[êe]ncia/.test(T))return RIB_ICONS.aparencia;
  if(/precipita[çc]|s[ée]rie hist/.test(T))return RIB_ICONS.chuva;
  if(/idf|gev|itarar[ée]|l-mom/.test(T))return RIB_ICONS.idf;
  if(/dimensiona/.test(T))return RIB_ICONS.dimension;
  if(/medi[çc][ãa]o|r[ée]gua/.test(T))return RIB_ICONS.medicao;
  if(/resultado/.test(T))return RIB_ICONS.resultado;
  if(/sa[íi]da|export|dxf|kml|dwg/.test(T))return RIB_ICONS.export;
  if(/imagem|orto|foto|raster|recortar/.test(T))return RIB_ICONS.imagem;
  if(/layout|prancha|elemento/.test(T))return RIB_ICONS.layout;
  if(/bacia|fluxo|drena|hidro|talvegue|d8|ac[úu]mulo|topografia/.test(T))return RIB_ICONS.hidro;
  if(/perfil|se[cç][aã]o/.test(T))return RIB_ICONS.perfil;
  if(/cubagem|volume/.test(T))return RIB_ICONS.cubagem;
  if(/cena|3d/.test(T))return RIB_ICONS.cena;
  if(/estaquea/.test(T))return RIB_ICONS.estaca;
  if(/ponto|cota/.test(T))return RIB_ICONS.ponto;
  if(/mescla|sobreposi|geometria|vetorial/.test(T))return RIB_ICONS.mescla;
  if(/limpeza|duplic|limpar/.test(T))return RIB_ICONS.limpeza;
  if(/publica|visualizador/.test(T))return RIB_ICONS.publica;
  if(/a[çc][õo]es/.test(T))return RIB_ICONS.acoes;
  return RIB_ICONS.painel;
}
/* ============ CATÁLOGO DE COMANDOS (Biblioteca de Ícones CCMGIS 2.0) ============
   Cada aba tem uma faixa própria (a aba já filtra o grupo). Um comando aponta
   para: um PAINEL real existente (sec:'#idDaSecao'), uma AÇÃO real (act:fn),
   ou nada/soon → mostra "Em breve". O slot 'ic' é o nome do arquivo SVG que
   você vai enviar (ex.: ic:'mdt' → RIB_SVG['mdt']); enquanto não chega, cai no
   glifo interno por palavra-chave. Os SVGs entram depois sem mexer nisto.     */
const emBreve=(nome)=>toast('“'+nome+'” — em breve');
function actClick(id){
  // Every project-open shortcut must retain the native file handle on desktop.
  if(id==='projIn'&&typeof openProjectFile==='function'){void openProjectFile();return true;}
  const b=document.getElementById(id); if(b){ b.click(); return true; } return false;
}
/* mini-menu de um comando desagregado: abre uma lista de ações ancorada no botão.
   itens = [{nome, run:fn} | {nome, sec:'#id'|secKey:'x'} | {nome, soon:1} | {sep:1}] */
function ribMiniMenu(btnEl, titulo, itens){
  document.querySelectorAll('.ribmini').forEach(m=>m.remove());
  const r=btnEl.getBoundingClientRect();
  const menu=document.createElement('div'); menu.className='ribmini';
  menu.style.cssText=`position:fixed;top:${r.bottom+3}px;left:${Math.max(6,Math.min(r.left,innerWidth-250))}px;`+
    'z-index:3200;background:var(--panel,#151b26);border:1px solid var(--line,#2a3446);border-radius:10px;'+
    'box-shadow:0 10px 30px #000b;min-width:230px;max-height:70vh;overflow:auto;padding:5px 0;font-size:13px';
  if(titulo) menu.innerHTML='<div style="padding:4px 12px 6px;font-size:10.5px;color:var(--ink-dim);'+
    'text-transform:uppercase;letter-spacing:.4px">'+esc(titulo)+'</div>';
  itens.forEach(it=>{
    if(it.sep){ const hr=document.createElement('div');
      hr.style.cssText='border-top:1px solid var(--line);margin:4px 0'; menu.appendChild(hr); return; }
    const row=document.createElement('div');
    row.style.cssText='padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px'+
      (it.soon?';opacity:.5':'');
    const ico = (it.ic && typeof RIB_SVG==='object' && RIB_SVG[it.ic])
      ? '<span class="rmic">'+RIB_SVG[it.ic]+'</span>'
      : (it.soon?'<span style="font-size:9px;color:var(--amber)">◷</span>':'<span style="width:9px"></span>');
    row.innerHTML=ico+'<span>'+esc(it.nome)+'</span>';
    row.onmouseenter=()=>{ row.style.background='var(--hover2,#1c2434)';
      if(it.desc){ let tip=document.getElementById('ribTip');
        if(!tip){ tip=document.createElement('div'); tip.id='ribTip';
          tip.style.cssText='position:fixed;z-index:3250;max-width:250px;background:#0d1117;color:#c9d1d9;'+
            'border:1px solid var(--amber,#f5a524);border-radius:8px;padding:7px 10px;font-size:11.5px;'+
            'line-height:1.35;box-shadow:0 8px 24px #000c;pointer-events:none';
          document.body.appendChild(tip); }
        tip.textContent=it.desc; tip.style.display='block';
        const rr=row.getBoundingClientRect();
        let lx=rr.right+8; if(lx+256>innerWidth) lx=rr.left-256;
        tip.style.left=Math.max(6,lx)+'px'; tip.style.top=Math.min(rr.top, innerHeight-90)+'px';
      } };
    row.onmouseleave=()=>{ row.style.background=''; const tip=document.getElementById('ribTip'); if(tip) tip.style.display='none'; };
    row.onclick=()=>{ const tp=document.getElementById('ribTip'); if(tp) tp.style.display='none'; menu.remove();
      if(it.soon){ emBreve(it.nome); return; }
      if(it.run){ try{ it.run(); }catch(e){ toast('Falha: '+(e&&e.message||e)); } return; }
      // abre painel real
      const cont=document.getElementById(RIB_SRC[catAtual().view]||'sideMain');
      let sec=null;
      if(it.sec) sec=(cont&&cont.querySelector(it.sec))||document.querySelector(it.sec);
      else if(it.secKey && cont) sec=ribFindSec(cont, it.secKey);
      if(sec) ribbonOpen(sec, btnEl, it.nome); else emBreve(it.nome);
    };
    menu.appendChild(row);
  });
  document.body.appendChild(menu);
  popupFitViewport(menu,r.left,r.bottom+3,8);
  setTimeout(()=>document.addEventListener('click',()=>{ menu.remove(); const tp=document.getElementById('ribTip'); if(tp) tp.style.display='none'; },{once:true}),0);
}
function actTool(t){
  if(typeof setTool!=='function') return false;
  if(typeof ferramentaEncerraComando==='function') ferramentaEncerraComando(t);
  /* Medir funciona como liga/desliga também na faixa superior e na busca.
     Um segundo clique fecha painel, traçado e modo de medição. */
  if(t==='measure' && S.tool==='measure' && typeof fechaMeas==='function'){
    fechaMeas(); return true;
  }
  /* A ribbon e a busca de comandos devem seguir o mesmo fluxo dos botões do
     rodapé: antes de qualquer desenho CAD, escolher a camada de destino. */
  if(['point','line','poly'].includes(t) && typeof askDrawDest==='function'){
    if(S.tool===t && S.drawBuf && S.drawBuf.length>=(t==='poly'?3:2)){
      finishDraw(); return true;
    }
    askDrawDest(t,()=>setTool(t));
    return true;
  }
  setTool(t); return true;
}
function abrePerfilTopografia(btn,id,titulo){
  /* Perfil pertence à Topografia: abre o painel real sobre o mapa, sem trocar
     para a vista/categoria Geotecnia. */
  try{ refreshProfPanel(); }catch(e){}
  const sec=document.getElementById(id);
  if(sec) ribbonOpen(sec,btn,titulo);
  else toast('Painel de perfil não encontrado');
}

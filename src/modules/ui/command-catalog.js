/* Catálogo consolidado da faixa de comandos. A propriedade commandId identifica
   uma operação; ic identifica somente seu desenho. Funções com o mesmo ícone
   (pontos A/B, vértices, geoestatística) continuam independentes. */
(function(){
'use strict';
const sources=new Map(), layouts=new Map(), mapping=new Map();
const key=(cat,name)=>cat+':'+name;
const slug=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const editorKeep=new Set(['sel','vadd','vdel','vmove','vz','vzf','terreno','sdel','quebrar','trecho','simplif','densif','suaviz']);
const cavaKeep=new Set(['sel','vadd','vdel','vmove','simplif','densif','suaviz']);
let ready=false;
function remember(cat,cmd){
  if(cmd._catalogCanonical)return;
  const id=cmd.editorKey?'editor:'+cmd.editorKey:key(cat,cmd.nome);
  if(!sources.has(id))sources.set(id,{...cmd,sourceId:id,sourceCat:cat});
}
function source(cat,name){
  const item=sources.get(key(cat,name));
  if(!item)throw Error('Comando ausente no catálogo: '+key(cat,name));
  return item;
}
function attach(cmd,src,option){
  if(!cmd.sourceIds.includes(src.sourceId))cmd.sourceIds.push(src.sourceId);
  cmd.aliases=[...new Set([...cmd.aliases,src.nome,...(src.aliases||[])])];
  cmd.sourceOptions=cmd.sourceOptions||{};
  if(option)cmd.sourceOptions[src.sourceId]=option;
  mapping.set(src.sourceId,{commandId:cmd.commandId,option:option||null});
  return cmd;
}
function take(cat,name,opts={}){
  const src=source(cat,name);
  const cmd={...src,...opts,commandId:opts.commandId||cat+':'+slug(name),
    _catalogCanonical:true,aliases:[],sourceIds:[]};
  return attach(cmd,src);
}
function alias(cmd,cat,name){return attach(cmd,source(cat,name));}
function group(label,it){return {label,it:it.filter(Boolean)};}
function replace(cat,groups){layouts.set(cat,groups.filter(g=>g.it.length));}
function original(cat){
  return CATS.find(c=>c.id===cat).grupos.map(g=>({...g,it:g.it.map(c=>take(cat,c.nome))}));
}
function menu(cat,name,entries,opts={}){
  const cmd=take(cat,name,opts);
  const options=entries.map(([src,label,desc])=>{
    attach(cmd,src,label||src.nome);
    return {nome:label||src.nome,desc,run:btn=>src.act(btn)};
  });
  cmd.options=options.map(o=>o.nome);
  cmd.act=btn=>ribMiniMenu(btn,cmd.nome,options.map(o=>({...o,run:()=>o.run(btn)})));
  return cmd;
}
function ed(k,opts={}){
  const src=source('editor',k),def=ED_CMDS.flatMap(g=>g.it).find(c=>c.k===k);
  const cmd=take('editor',k,{...opts,commandId:'editor:'+k});
  // O editor possui desenhos próprios para vértice, segmento e feição.
  cmd.ic='ed_'+def.ic;
  cmd.aliases=[...new Set([...cmd.aliases,...(def.ali||[])])];
  if(!editorKeep.has(k))cmd.act=()=>{
    if(k==='girar'&&window.GeoMineMouseRotation?.isGroup?.())return def.run();
    return window.GeoMineFeatureCommand.run(def.run);
  };
  return cmd;
}
function editorGroups(cava){
  return (layouts.get('editor')||[]).map(g=>group(g.label,g.it.filter(c=>!cava||cavaKeep.has(c.editorKey)))).filter(g=>g.it.length);
}
function normalize(){
  if(!ready)return;
  // A extensão de um módulo não pode recolocar atalhos já consolidados.
  // Comandos futuros desconhecidos são preservados na categoria de origem.
  for(const cat of CATS){
    if(cat.id==='editor'||cat._ctx)continue;
    for(const g of cat.grupos||[])for(const cmd of g.it||[]){
      if(cmd._catalogCanonical)continue;
      const id=key(cat.id,cmd.nome);
      if(mapping.has(id))continue;
      remember(cat.id,cmd);
      const added=take(cat.id,cmd.nome);
      const dest=layouts.get(cat.id)||[];
      let target=dest.find(x=>x.label===g.label);
      if(!target){target=group(g.label,[]);dest.push(target);}
      target.it.push(added);layouts.set(cat.id,dest);
    }
    if(layouts.has(cat.id))cat.grupos=layouts.get(cat.id).map(g=>({...g,it:g.it.slice()}));
  }
}
function audit(){
  const commands=[];
  for(const cat of CATS)for(const g of cat.grupos||[])for(const c of g.it||[])
    commands.push({cat:cat.id,group:g.label,id:c.commandId,name:c.nome,aliases:c.aliases||[],
      sourceIds:c.sourceIds||[],options:c.options||[],available:!c.visual&&!c.soon&&!!(c.act||c.sec||c.secKey)});
  return {version:1,commands,mapping:Object.fromEntries(mapping),unmapped:[...sources.keys()].filter(id=>!mapping.has(id))};
}
function install(){
  if(ready)return;
  for(const cat of CATS)for(const g of cat.grupos||[])for(const cmd of g.it||[])remember(cat.id,cmd);
  // O primeiro desenho pode estar na Cava: a coleta não depende desse filtro.
  for(const g of ED_CMDS)for(const c of g.it){
    const id='editor:'+c.k;
    if(!sources.has(id))sources.set(id,{ic:ED_PNG_ICONS[c.ic]||'selecionar',nome:c.n,editorKey:c.k,
      sourceId:id,sourceCat:'editor',act:()=>{
        if(S._view==='cava2')return window.CCMGISCava2?.vectorCommand(c.k);
        if(!ED.on)edLigar(true,true);c.run();
      }});
  }
  for(const cat of CATS)if(cat.id!=='editor'&&!cat._ctx)replace(cat.id,original(cat.id));

  const buffer=alias(take('gis','Buffer'),'cad','Buffer');
  const intersection=alias(take('gis','Interseção'),'cad','Interseção');
  const union=alias(take('gis','União'),'cad','União');
  const dissolve=alias(take('gis','Dissolver'),'cad','Dissolver');
  const difference=take('cad','Diferença',{commandId:'gis:diferenca'});
  const clip=take('cad','Clip',{commandId:'gis:recortar-vetor',nome:'Recortar por polígono'});
  const converter=take('cad','Converter',{commandId:'gis:converter-geometria',nome:'Converter geometria'});
  const refer=['Georreferenciar','Converter CRS','Transformar','Unidades','Metadados'].map(n=>
    alias(take('janela',n,{commandId:'gis:'+slug(n),nome:n==='Transformar'?'Transformação de coordenadas':n}),'analises',n));
  const add=alias(take('inicio','Importar'),'gis','Adicionar');
  replace('inicio',original('inicio').map(g=>group(g.label,g.it.map(c=>c.nome==='Importar'?add:c))));
  replace('gis',[
    group('Camadas',['Propriedades','Renomear','Visibilidade','Filtro','Estilo QGIS'].map(n=>take('gis',n))),
    group('Operações vetoriais',['Mesclar Camadas','Poligonizar Linhas','Limite da Camada'].map(n=>take('gis',n)).concat([converter])),
    group('Sobreposição e proximidade',[buffer,intersection,union,difference,clip,dissolve]),
    group('Raster e TIN',['Poligonizar Raster','Mesclar Rasters','Cortar Raster/TIN','Interseção A × B'].map(n=>take('gis',n))),
    group('Serviços e bases',['WMS','OpenStreetMap','MDE global','América Latina'].map(n=>take('gis',n))),
    group('Referenciamento',refer)
  ]);
  const research=take('gis','Requerimento de Pesquisa',{commandId:'mineracao:requerimento-pesquisa'});

  const env=original('ambiente').map(g=>group(g.label,g.it.filter(c=>c.nome!=='Servidores WMS')));
  const providerPairs=[['ANM','ANM'],['Geologia SGB','SGB'],['CAR','SICAR · CAR'],['Ambiental ICMBio','ICMBio'],['Hidro ANA','ANA'],['Estaduais','Órgão estadual']];
  for(const [oldName,newName] of providerPairs){
    const cmd=env.flatMap(g=>g.it).find(c=>c.nome===newName);
    alias(cmd,'gis',oldName);
  }
  alias(layouts.get('gis').flatMap(g=>g.it).find(c=>c.nome==='WMS'),'ambiente','Servidores WMS');
  const favor=env.flatMap(g=>g.it).find(c=>c.nome==='Favorabilidade');
  favor.nome='Multicritério e favorabilidade';favor.aliases.push('Multicritério');
  if(sources.has(key('gis','Multicritério')))alias(favor,'gis','Multicritério');
  replace('ambiente',env);

  const slope=alias(alias(take('topografia','Declividade'),'gis','Declividade'),'analises','Declividade');
  const aspect=alias(alias(take('topografia','Aspecto'),'gis','Aspecto'),'analises','Aspecto');
  const shade=menu('topografia','Sombreado',[
    [source('topografia','Sombreado'),'Aplicar sombreado à superfície'],
    [source('gis','Relevo Sombreado'),'Gerar raster de relevo sombreado'],
    [source('hidrologia','Sombreado'),'Sombrear a grade hidrológica']
  ]);
  alias(shade,'analises','Sombreado');
  const contours=menu('gis','Curvas de Nível',[
    [source('gis','Curvas de Nível'),'Configurar curvas de nível'],
    [source('topografia','Curvas Principais')],
    [source('topografia','Curvas Secundárias')],
    [source('topografia','Curvas Depressão')]
  ],{commandId:'topografia:curvas-nivel',nome:'Gerar Curvas'});
  const solar=alias(take('topografia','Exposição Solar'),'analises','Exposição Solar');
  const grid=alias(take('topografia','Grade',{nome:'Grade do terreno'}),'analises','Grade');
  replace('topografia',[
    group('Superfícies',['Importar LiDAR','Superfície Raster','Superfície TIN','Pontos Cotados','Extração de Sólidos'].map(n=>take('topografia',n))),
    group('Perfis e projeto',['Perfil Longitudinal','Seções Transversais','Perfil Transversal','Progressiva','Talude'].map(n=>take('topografia',n))),
    group('Análise do terreno',[grid,slope,aspect,solar,shade,take('hidrologia','TPI',{commandId:'topografia:tpi'})]),
    group('Curvas de nível',[contours,take('topografia','Editar Curvas')])
  ]);

  const featureDelete=attach(take('cad','Excluir',{nome:'Excluir feição'}),source('editor','fdel'));
  const move=attach(take('cad','Mover',{nome:'Mover feição'}),source('editor','mover'));
  const copy=attach(take('cad','Copiar',{nome:'Copiar feição'}),source('editor','copiar'));
  const explode=attach(take('cad','Explodir'),source('editor','explode'));
  const join=attach(take('cad','Unir',{nome:'Unir feições'}),source('editor','unir'));
  const offset=alias(ed('parale',{nome:'Paralela / Offset'}),'cad','Offset');
  const line=alias(take('cad','Polilinha',{nome:'Linha / Polilinha'}),'cad','Linha');
  alias(alias(line,'cad','Arco'),'cad','Spline');
  line.desc='Desenha segmentos de linha. Para arredondar o traçado, use Suavizar no Editor.';
  const layout=layouts.get('inicio').flatMap(g=>g.it).find(c=>c.nome==='Layout');
  alias(layout,'cad','Texto');layout.aliases.push('Texto no Layout');
  replace('cad',[
    group('Desenho',[take('cad','Ponto'),line,...['Polígono','Retângulo','Círculo','Elipse','Hachura'].map(n=>take('cad',n))]),
    group('Cotas e dimensões',[take('cad','Cotas')]),
    group('Feições',[featureDelete,move,copy,explode,join,ed('continuar')]),
    group('Transformar',[ed('girar'),ed('escalar'),ed('espelho'),offset,ed('offset2')]),
    group('Linhas',['fechar','abrir','rev','estend'].map(k=>ed(k,{nome:{fechar:'Fechar linha',abrir:'Polígono → Linha',rev:'Inverter linha',estend:'Estender linha'}[k]}))),
    group('Dividir polígonos',[ed('pdivreta'),ed('pdivig')])
  ]);
  const simplify=alias(ed('simplif'),'cad','Simplificar'),smooth=alias(ed('suaviz'),'cad','Suavizar');
  replace('editor',[
    group('Editar',[ed('sel',{nome:'Selecionar para editar'})]),
    group('Vértices',[ed('vadd',{nome:'Inserir vértice'}),ed('vdel',{nome:'Apagar vértice'}),ed('vmove',{nome:'Mover vértice'}),ed('vz'),ed('vzf'),ed('terreno')]),
    group('Segmentos',['sdel','quebrar','trecho'].map(k=>ed(k))),
    group('Geometria',[simplify,ed('densif'),smooth])
  ]);

  const hydro=original('hidrologia');
  const rainfall=alias(alias(take('hidrologia','Chuva de Projeto',{nome:'Chuva de projeto / IDF / GEV'}),'hidrologia','Curva IDF'),'hidrologia','Extremos GEV');
  const series=menu('hidrologia','Série Histórica',[
    [source('hidrologia','Série Histórica')],[source('hidrologia','Evaporação')]
  ],{nome:'Séries históricas'});
  const hydraulics=menu('hidrologia','Tempo de Concentração',[
    [source('hidrologia','Tempo de Concentração'),'Vazão e tempo de concentração'],
    [source('hidrologia','Seção Hidráulica'),'Dimensionar seção hidráulica']
  ],{nome:'Vazão e dimensionamento'});
  alias(hydraulics,'hidrologia','Declividade Hidráulica');
  const drainage=menu('hidrologia','Drenagem',[
    [source('hidrologia','Drenagem'),'Dispositivos e dimensionamento'],
    [source('hidrologia','Obra de Arte Corrente'),'Obras de arte corrente']
  ]);
  const remove=new Set(['Série Histórica','Evaporação','Chuva de Projeto','Curva IDF','Extremos GEV','Sombreado','TPI','Declividade Hidráulica','Tempo de Concentração','Seção Hidráulica','Obra de Arte Corrente','Drenagem','Escada hidráulica']);
  const hydroGroups=hydro.map(g=>group(g.label,g.it.filter(c=>!remove.has(c.nome))));
  hydroGroups.unshift(group('Chuvas',[series,rainfall]));
  const stairs=sources.has(key('hidrologia','Escada hidráulica'))?take('hidrologia','Escada hidráulica'):null;
  hydroGroups.push(group('Hidráulica',[stairs,hydraulics,drainage]));
  const rainFlood=hydroGroups.flatMap(g=>g.it).find(c=>c.nome==='Mancha de Inundação');
  rainFlood.nome='Mancha por chuva';
  replace('hidrologia',hydroGroups);

  const mining=original('mineracao').filter(g=>g.label!=='Geoestatística');
  mining.push(group('Pesquisa mineral',[research]));replace('mineracao',mining);
  const stats=take('mineracao','Estatísticas',{commandId:'analises:estatisticas'});
  alias(stats,'analises','Estatísticas');
  const calculator=alias(take('analises','Calculadora'),'janela','Calculadora');
  const ruler=alias(take('analises','Régua'),'janela','Régua');
  replace('analises',[
    group('Interpolação',['IDW²','Multilevel B-Spline','Vizinho mais próximo','Krigagem ordinária'].map(n=>take('mineracao',n,{commandId:'analises:'+slug(n)}))),
    group('Estatística',[stats,take('mineracao','Variograma',{commandId:'analises:variograma'})]),
    group('Medição',['Medir Distância','Medir Área'].map(n=>take('analises',n)).concat([calculator,ruler]))
  ]);
  // Planejadas: uma ocorrência, no domínio próprio, mantendo o aviso "em breve".
  const geo=layouts.get('geotecnia').flatMap(g=>g.it);
  const dams=original('barragens').map(g=>group(g.label,g.it.filter(c=>{
    const same=geo.find(x=>x.ic===c.ic&&x.nome===c.nome);
    if(same){alias(same,'barragens',c.nome);return false;}return true;
  })));
  replace('barragens',dams);
  const prefs=alias(take('janela','Opções',{nome:'Preferências'}),'janela','Personalizar');
  replace('janela',[
    group('Auxílios de desenho',[take('janela','Snap'),take('janela','Grade',{nome:'Grade de desenho'}),take('janela','Alinhar')]),
    group('Preferências',[prefs,take('janela','Atalhos')]),
    group('Automação',['Script (Python)','Macro'].map(n=>take('janela',n))),
    ...original('janela').filter(g=>g.label==='Ajuda e suporte')
  ]);
  mapping.clear();
  for(const groups of layouts.values())for(const g of groups)for(const cmd of g.it)
    for(const id of cmd.sourceIds)mapping.set(id,{commandId:cmd.commandId,option:cmd.sourceOptions?.[id]||null});
  const icon=(id,paths)=>{
    const name='catalog_'+id;
    RIB_SVG[name]='<svg viewBox="0 0 32 32" fill="none" stroke="#244c60" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+paths+'</svg>';
    return name;
  };
  const icons={
    'topografia:tpi':icon('tpi','<path d="M3 26h26M3 20l6-10 8 12 6-16 6 14" fill="#d5e6d3"/><path d="M3 15h26" stroke-dasharray="3 2"/><path d="M23 6v9m-3-6 3-3 3 3" stroke="#c48a25"/>'),
    'analises:idw':icon('idw','<path d="M4 4h24v24H4z" fill="#d9ead9"/><circle cx="16" cy="16" r="8" fill="#b2dbe8"/><circle cx="16" cy="16" r="4" fill="#eda73c"/><path d="M8 8h1M23 7h1M7 24h1M24 24h1" stroke-width="3"/>'),
    'analises:multilevel-b-spline':icon('spline','<path d="M3 26h26M5 28V4"/><path d="M5 22C9 2 15 28 19 12S25 7 28 5" stroke="#267cb0" stroke-width="2.6"/>'),
    'analises:vizinho-mais-proximo':icon('nearest','<path d="m3 3 13 1 2 13-15 3zm13 1 13-1v14H18M3 20l15-3 11 12H3zm15-3h11v12" fill="#d9ead9"/><circle cx="9" cy="10" r="2" fill="#e39d31"/><circle cx="24" cy="9" r="2"/><circle cx="12" cy="24" r="2"/>'),
    'analises:krigagem-ordinaria':icon('kriging','<path d="M4 4h24v24H4zM4 12h24M4 20h24M12 4v24M20 4v24" stroke="#62a274"/><path d="M5 23c8-1 6-16 14-15s4 12 9 10" stroke="#267cb0" stroke-width="2.8"/>'),
    'analises:variograma':icon('variogram','<path d="M4 4v24h24M6 24c7-1 6-15 18-15h4"/><path d="m8 21 1-1m4-5 1-1m5-3 1 1m4-4 1 1" stroke="#d99022" stroke-width="3.5"/>')
  };
  for(const groups of layouts.values())for(const g of groups)for(const cmd of g.it){
    if(icons[cmd.commandId])cmd.ic=icons[cmd.commandId];
    if(cmd.commandId==='editor:vzf')cmd.ic=icon('feature_z','<path d="m5 25 4-17 15-3 3 20z" fill="#e5d3a5"/><path d="M15 9h8l-8 12h8"/>');
    if(cmd.commandId==='editor:vz')cmd.ic=icon('vertex_z','<path d="m3 25 10-15 15 14"/><circle cx="13" cy="10" r="3" fill="#e9a52d"/><path d="M21 3h7l-7 9h7"/>');
    if(cmd.commandId==='civil:ponto-a'||cmd.commandId==='civil:ponto-b'){
      const a=cmd.commandId.endsWith('-a');cmd.ic=icon(a?'point_a':'point_b',
        '<circle cx="12" cy="18" r="5" fill="#edb54c"/><path d="M2 18h5m10 0h5M12 8v5m0 10v6"/>'+
        (a?'<path d="m23 11 3-8 3 8m-5-3h4"/>':'<path d="M24 3v9h3a2.3 2.3 0 0 0 0-4.5h-3m0-4.5h3a2.3 2.3 0 0 1 0 4.5"/>'));
    }
  }
  ready=true;
  normalize();
  if(audit().unmapped.length)throw Error('Há comandos sem destino no catálogo consolidado.');
  ribbonBuild();
}
window.GeoMineCommandCatalog={normalize,editorGroups,audit};
// Publica a API do getter somente depois de registrar todas as ações originais.
delete window.GeoMineCommandCatalog.editorGroups;
const boot=()=>setTimeout(()=>{
  try{install();window.GeoMineCommandCatalog.editorGroups=editorGroups;ribbonBuild();}
  catch(error){console.error('Catálogo de comandos:',error);toast('Não foi possível consolidar os comandos: '+error.message);}
},120);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

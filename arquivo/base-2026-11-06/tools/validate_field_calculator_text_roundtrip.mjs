import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=process.env.GEOMINE_VALIDATE_ROOT
  ?path.resolve(process.env.GEOMINE_VALIDATE_ROOT):path.resolve(here,'..');
const attrSource=fs.readFileSync(path.join(root,'src/core/parts/13-attribute-table.js'),'utf8');
const calculatorSource=fs.readFileSync(path.join(root,'src/core/parts/14-field-calculator.js'),'utf8');
const persistenceSource=fs.readFileSync(path.join(root,'src/core/parts/26-project-persistence.js'),'utf8');
const clone=value=>structuredClone(value);
const plain=value=>JSON.parse(JSON.stringify(value));

/* Extrai as funções reais sem confundir chaves em comentários, strings ou
   templates com o fechamento da declaração. */
function blockEnd(text,open,label){
  let depth=0,state='code',escaped=false;
  for(let i=open;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(state==='line'){if(ch==='\n')state='code';continue;}
    if(state==='block'){if(ch==='*'&&next==='/'){state='code';i++;}continue;}
    if(state!=='code'){
      if(escaped){escaped=false;continue;}
      if(ch==='\\'){escaped=true;continue;}
      if(ch===state)state='code';
      continue;
    }
    if(ch==='/'&&next==='/'){state='line';i++;continue;}
    if(ch==='/'&&next==='*'){state='block';i++;continue;}
    if(ch==='\''||ch==='"'||ch==='`'){state=ch;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0)return i;
  }
  assert.fail(label+': bloco JavaScript não foi fechado');
}
function functionDeclaration(text,name){
  const safe=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=new RegExp(`\\bfunction\\s+${safe}\\s*\\(`).exec(text);
  assert.ok(match,`função ${name} ausente`);
  const open=text.indexOf('{',match.index+match[0].length);
  assert.ok(open>=0,`função ${name}: corpo ausente`);
  return text.slice(match.index,blockEnd(text,open,`função ${name}`)+1);
}

/* DOM mínimo: executa o fluxo real do modal e conserva o HTML que openAttr
   monta, sem depender de navegador, jsdom ou pacotes de teste. */
class FakeClassList{
  constructor(){this.values=new Set();}
  add(...names){names.forEach(name=>this.values.add(name));}
  remove(...names){names.forEach(name=>this.values.delete(name));}
  toggle(name,force){
    const on=force===undefined?!this.values.has(name):!!force;
    if(on)this.values.add(name);else this.values.delete(name);
    return on;
  }
}
class FakeElement{
  constructor(document,tag='div',id=''){
    this.ownerDocument=document;this.tagName=tag.toUpperCase();this.id=id;
    this.style={};this.dataset={};this.classList=new FakeClassList();
    this.value='';this.textContent='';this.checked=false;this.disabled=false;
    this.maxLength=-1;this.isContentEditable=false;this._html='';this._children=[];
  }
  set innerHTML(value){
    this._html=String(value);
    this.ownerDocument._parseIds(this,this._html);
  }
  get innerHTML(){return this._html;}
  querySelector(selector){
    if(selector.startsWith('#'))return this.ownerDocument.getElementById(selector.slice(1));
    return null;
  }
  querySelectorAll(){return [];}
  addEventListener(type,handler){this['on'+type]=handler;}
  appendChild(child){this._children.push(child);return child;}
  focus(){}
  closest(){return null;}
  dispatchEvent(){}
  remove(){this.ownerDocument._removeTree(this);}
}
class FakeDocument{
  constructor(){
    this._ids=new Map();this._roots=[];this.documentElement={dataset:{}};
    this.body=new FakeElement(this,'body','body');
    this.body.appendChild=element=>{this._roots.push(element);return element;};
    for(const id of ['attrPanel','attrTtl','btnAttrRecalc','attrMDT','attrBody'])
      this._ids.set(id,new FakeElement(this,'div',id));
  }
  createElement(tag){return new FakeElement(this,tag);}
  getElementById(id){return this._ids.get(id)||null;}
  querySelectorAll(){return [];}
  _parseIds(root,html){
    const tag=/<([a-z][\w-]*)\b([^>]*\bid=(?:"[^"]+"|'[^']+')[^>]*)>/gi;
    let match;
    while((match=tag.exec(html))){
      const attrs=match[2];
      const idMatch=/\bid=(?:"([^"]+)"|'([^']+)')/i.exec(attrs);
      if(!idMatch)continue;
      const id=idMatch[1]||idMatch[2],element=new FakeElement(this,match[1],id);
      const value=/\bvalue=(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
      if(value)element.value=value[1]??value[2]??'';
      const maximum=/\bmaxlength=(?:"([^"]*)"|'([^']*)'|(\d+))/i.exec(attrs);
      if(maximum)element.maxLength=Number(maximum[1]??maximum[2]??maximum[3]);
      element.checked=/\bchecked\b/i.test(attrs);
      element.disabled=/\bdisabled\b/i.test(attrs);
      root._children.push(element);this._ids.set(id,element);
    }
  }
  _removeTree(root){
    for(const element of root._children||[]){
      if(this._ids.get(element.id)===element)this._ids.delete(element.id);
    }
    this._roots=this._roots.filter(item=>item!==root);
  }
}

const fieldName='DESCRICAO_CARBONATICA_LONGA';
const fieldText='Metacalcário/Metacalcário Bandado';
const layer={
  id:7,name:'Domínios_hidrogeológicos',gtype:'point',crs:'EPSG:31983',visible:true,
  labelField:'',labelFields:null,lbl:{size:9,unique:false},groupId:null,clsOpen:false,
  color:'#137c8b',weight:2,fill:.35,
  sym:{mode:'single',color:'#137c8b',stroke:'#137c8b',weight:2,fill:.35},
  fields:[{name:'FID',type:'N',length:9,decimal:0}],
  features:[
    {geom:[700000,7800000],multi:false,props:{FID:1}},
    {geom:[700050,7800050],multi:false,props:{FID:2}}
  ],
  attrFilter:null,attrFilterRules:null,attrFilterLogic:'AND',tinSurface:null,visReal:false,llayer:null
};
const S={
  _view:'map',_preLayoutMapState:null,loFrozen:true,activeId:7,selFeat:null,
  auto:{name:'campo-texto.ccmgis'},currentProjectName:null,
  workCRS:'EPSG:31983',projectMeta:{name:'Regressão campo texto'},
  _v3SurfOn:{},_v3TexTipo:'hipso',_v3TexCor:'#8d5524',
  groups:[],layers:[layer],rasters:[],img:null,wms:[],stack:['L:7'],
  plates:[],plateId:null,geology:{schemaVersion:1,sections:[],settings:{}},
  hidro:{serie:null,idf:null}
};
const document=new FakeDocument();
let uid=100,gid=20,rid=200,plid=1;
const toasts=[];
const context={
  console,structuredClone,S,document,uid,gid,rid,plid,
  window:{CCMGISCava2:null,GeoMinePointSymbols:null,GeoMineGeology:{
    snapshot:()=>clone(S.geology),restore:data=>(S.geology=clone(data||{schemaVersion:1,sections:[],settings:{}}))
  }},
  CRS_DEFS:{'EPSG:31983':{}},map:{removeLayer:()=>{}},
  activeLayer:()=>S.layers.find(item=>item.id===S.activeId)||null,
  esc:value=>String(value??'').replace(/[<>&]/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[char])),
  GEOM_CAMPOS:{},geomCamposDe:()=>[],geomValor:()=>null,
  attrFilterCount:L=>L.features.length,attrFilterMatch:()=>true,
  autoAreaFieldReadOnly:()=>false,autoAreaSyncLayer:()=>{},autoAreaSyncAll:()=>{},
  attrDestacaSelecao:()=>{},highlightSel:()=>{},zoomToSel:()=>{},
  drawLayer:L=>{L.llayer={};},refreshUI:()=>{},toast:message=>toasts.push(String(message)),
  setTimeout:fn=>{fn();return 0;},clearTimeout:()=>{},
  plateCapture:()=>{},labelCfg:L=>L.lbl||{},layoutClone:clone,
  reparaGeom:data=>({nF:0,layers:data.layers}),
  cavaEhAnelProjeto:()=>false,cavaSoldaIntersecaoAneis:()=>({insercoes:0,cruzamentos:0}),
  baciaReparaLinhasExistentes:()=>({changed:false,added:0}),cavaReparaCamadaLegada:()=>null,
  setOpenProjectName:name=>{S.currentProjectName=name;},defaultLabelCfg:()=>({show:false,unique:false}),
  renderRaster:()=>{},zApply:()=>{},fitAll:()=>{},
  projectRestoreNativeRasters:async()=>({restored:0,unauthorized:false}),
  setSerie:serie=>{S.hidro.serie=serie;},wmsCreateLayer:()=>{},
  Event:class {constructor(type){this.type=type;}},toWGS:(_crs,x,y)=>[x,y],
  GeoMineProjectOpening:{begin:()=>({end(){}}),restore(o,type){if(o.visible===false){o._projectDrawDeferred=true;return;}if(type==='L')context.drawLayer(o);else context.renderRaster(o);}},
  L2:{imageOverlay:()=>({addTo(){return this;},bringToBack(){}})}
};
context.globalThis=context;
vm.createContext(context);

const calculatorCore=attrSource.slice(attrSource.indexOf('const FC_FUNCOES='));
assert.ok(calculatorCore.startsWith('const FC_FUNCOES='),'núcleo da calculadora ausente');
vm.runInContext(
  `${calculatorCore}\n`+
  `${functionDeclaration(attrSource,'attrFieldTypeLabel')}\n`+
  `${functionDeclaration(attrSource,'openAttr')}\n`+
  `${functionDeclaration(calculatorSource,'abreCalculadoraCampo')}\n`+
  `${functionDeclaration(persistenceSource,'projectData')}\n`+
  `${functionDeclaration(persistenceSource,'loadProject')}\n`+
  `globalThis.__fieldTest={abreCalculadoraCampo,openAttr,projectData,loadProject};`,
  context,{filename:'field-calculator-text-roundtrip.js'}
);

/* 1) Usuário abre +Campo, escolhe Texto, informa nome longo e expressão
   textual. O clique abaixo executa exatamente o handler de Aplicar. */
context.__fieldTest.abreCalculadoraCampo();
const nameInput=document.getElementById('fcNome');
const declaredMaxLength=nameInput.maxLength;
nameInput.value=fieldName;
document.getElementById('fcTipo').value='C';
document.getElementById('fcTam').value='80';
document.getElementById('fcExpr').value=`'${fieldText}'`;
document.getElementById('fcOk').onclick();

const created=layer.fields.find(field=>field.name!=='FID');
const createdValue=created?layer.features[0].props[created.name]:undefined;

/* 2) Persiste no formato real, passa por JSON e reabre com loadProject. */
const saved=plain(context.__fieldTest.projectData());
const savedLayer=saved.layers.find(item=>item.id===layer.id);
const savedField=savedLayer.fields.find(field=>field.name!=='FID');
S.layers=[];S.stack=[];S.activeId=null;
const reopened=context.__fieldTest.loadProject(clone(saved));
const reopenedLayer=S.layers.find(item=>item.id===layer.id);
const reopenedField=reopenedLayer&&reopenedLayer.fields.find(field=>field.name!=='FID');
const reopenedValue=reopenedField&&reopenedLayer.features[0].props[reopenedField.name];

/* 3) Reconstrói a tabela real e confere cabeçalho, schema e célula. */
S.activeId=layer.id;
context.__fieldTest.openAttr();
const tableHtml=document.getElementById('attrBody').innerHTML;

const checks=[
  ['Texto é o tipo padrão para campo novo',
    calculatorSource.includes('<option value="C">Texto</option><option value="N">Número</option>'),
    'a opção Texto não aparece primeiro no seletor'],
  ['o controle de nome aceita mais de 20 caracteres',declaredMaxLength<0||declaredMaxLength>=fieldName.length,
    `maxlength atual: ${declaredMaxLength}`],
  ['o campo é criado sem truncar o nome',created?.name===fieldName,
    `nome criado: ${created?.name??'(ausente)'}`],
  ['o schema criado é texto C(80)',created?.type==='C'&&created?.length===80&&created?.decimal===0,
    `schema criado: ${JSON.stringify(created)}`],
  ['a expressão grava texto, não número',typeof createdValue==='string'&&createdValue===fieldText,
    `valor criado: ${JSON.stringify(createdValue)} (${typeof createdValue})`],
  ['projectData preserva nome e schema',savedField?.name===fieldName&&savedField?.type==='C'&&savedField?.length===80,
    `schema salvo: ${JSON.stringify(savedField)}`],
  ['loadProject aceita o projeto salvo',reopened===true,`retorno: ${String(reopened)}`],
  ['a reabertura preserva nome e schema',reopenedField?.name===fieldName&&reopenedField?.type==='C'&&reopenedField?.length===80,
    `schema reaberto: ${JSON.stringify(reopenedField)}`],
  ['a reabertura preserva o texto',typeof reopenedValue==='string'&&reopenedValue===fieldText,
    `valor reaberto: ${JSON.stringify(reopenedValue)} (${typeof reopenedValue})`],
  ['a tabela reaberta mostra nome, tipo e descrição',
    tableHtml.includes(`<th>${fieldName}<br>`)&&tableHtml.includes('Texto · 80')&&tableHtml.includes(fieldText),
    `trecho da tabela: ${tableHtml.slice(0,500)}`]
];
const failures=checks.filter(([,ok])=>!ok);
if(failures.length){
  const detail=failures.map(([label,,actual],index)=>`${index+1}. ${label} (${actual})`).join('\n');
  assert.fail(`Regressão da calculadora de campo reproduzida:\n${detail}`);
}

console.log(`OK: campo ${fieldName} permaneceu C(80), textual e visível após projectData → JSON → loadProject.`);

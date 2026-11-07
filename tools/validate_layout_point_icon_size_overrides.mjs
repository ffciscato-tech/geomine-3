import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

const symbology=read('src/core/parts/05-layer-model-symbology.js');
const layout=read('src/core/parts/17-layout-printing.js');

/* Extrai funções reais, inclusive as funções locais de buildLayout, sem
   encerrar o bloco em chaves que estejam dentro de texto ou comentários. */
function blockEnd(source,open,label){
  let depth=0,state='code',escaped=false;
  for(let i=open;i<source.length;i++){
    const ch=source[i],next=source[i+1];
    if(state==='line'){
      if(ch==='\n')state='code';
      continue;
    }
    if(state==='block'){
      if(ch==='*'&&next==='/'){state='code';i++;}
      continue;
    }
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
  assert.fail(`${label}: bloco JavaScript não foi fechado`);
}

function functionDeclaration(source,name){
  const safe=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=new RegExp(`\\b(?:async\\s+)?function\\s+${safe}\\s*\\(`).exec(source);
  assert.ok(match,`função ${name} ausente`);
  const open=source.indexOf('{',match.index+match[0].length);
  assert.ok(open>=0,`função ${name}: corpo ausente`);
  return source.slice(match.index,blockEnd(source,open,`função ${name}`)+1);
}

const PT_SYMS={
  circle:{id:'circle',oriented:false,dip:false,
    d:()=>'<circle data-layout-symbol="circle" cx="0" cy="0" r="8"/>'},
  diamond:{id:'diamond',oriented:false,dip:false,
    d:()=>'<path data-layout-symbol="diamond" d="M0,-8 L8,0 L0,8 L-8,0 Z"/>'}
};

const geral={
  value:'Geral',shape:'circle',color:'#f5a524',stroke:'#111111',weight:1.5
};
const especial={
  value:'Especial',shape:'diamond',size:42,
  color:'#16a085',stroke:'#0e6251',weight:1.5
};
const layer={
  id:7,name:'Sinalização',gtype:'point',crs:'EPSG:31982',visible:true,
  color:'#f5a524',weight:1.5,fill:.9,
  sym:{
    mode:'cat',field:'TIPO',cats:[geral,especial],classes:[],
    pt:{shape:'circle',size:28,rot:0,rotField:'',dipField:''}
  },
  features:[
    {geom:[[10,10]],props:{TIPO:'Geral'},_class:geral},
    {geom:[[20,20]],props:{TIPO:'Especial'},_class:especial}
  ]
};

const mapSym=1;
const context=vm.createContext({
  console,PT_SYMS,mapSym,crs:'EPSG:31982',
  classOf:(_layer,feature)=>feature._class||null,
  featureVisible:()=>true,
  featureStyle:(L,feature)=>{
    const c=feature._class||{};
    return {
      color:c.color||L.color,stroke:c.stroke||L.color,
      weight:c.weight??L.weight,fill:L.fill
    };
  },
  reproj:(_from,_to,x,y)=>[x,y],sx:value=>value,sy:value=>value,
  esc:value=>String(value),layoutHatch:()=>null,escalaDash:()=>''
});

vm.runInContext([
  functionDeclaration(symbology,'ptSizePx'),
  functionDeclaration(symbology,'ptCfg'),
  functionDeclaration(symbology,'ptStyleOf'),
  functionDeclaration(symbology,'ptPlotSVG'),
  functionDeclaration(layout,'layoutPointCoords'),
  functionDeclaration(layout,'svgDaCamada')
].join('\n'),context,{filename:'layout-point-icon-size.contract.js'});

function scaleAt(svg,x,y){
  const anchor=`translate(${x.toFixed(2)},${y.toFixed(2)})`;
  const start=svg.indexOf(anchor);
  assert.ok(start>=0,`marcador do ponto ${x},${y} ausente no SVG do Layout`);
  const match=/scale\(([0-9.]+)\)/.exec(svg.slice(start,start+300));
  assert.ok(match,`escala do ponto ${x},${y} ausente no SVG do Layout`);
  return match[1];
}

const expectedScale=size=>(((size/14)*3.4*mapSym)/20).toFixed(3);

/* Primeira exportação: a categoria sem `size` herda 28 px; a categoria com
   override continua em 42 px. O teste lê a escala do SVG final, não o estilo
   usado pelo marcador Leaflet no mapa 2D. */
const first=context.svgDaCamada(layer,true);
assert.match(first,/data-layout-symbol="circle"/,
  'o símbolo geral deve ser materializado no SVG do Layout');
assert.match(first,/data-layout-symbol="diamond"/,
  'o símbolo da categoria especial deve ser materializado no SVG do Layout');
assert.equal(scaleAt(first,10,10),expectedScale(28),
  'o ponto sem override deve usar o tamanho geral de 28 px na prancha');
assert.equal(scaleAt(first,20,20),expectedScale(42),
  'o ponto especial deve usar seu override de 42 px na prancha');

/* Ao alterar apenas o tamanho geral, somente quem herda deve mudar. */
layer.sym.pt.size=35;
const second=context.svgDaCamada(layer,true);
assert.equal(scaleAt(second,10,10),expectedScale(35),
  'mudar o tamanho geral para 35 px deve alterar o item herdado no Layout');
assert.equal(scaleAt(second,20,20),expectedScale(42),
  'mudar o tamanho geral não pode apagar o override individual no Layout');

/* Garante que o fragmento exercitado permanece ligado à montagem e ao PDF. */
const build=functionDeclaration(layout,'buildLayout');
assert.match(build,/svg\s*\+=\s*svgDaCamada\(ob\s*,\s*true\)/,
  'buildLayout deve inserir o SVG pontual exercitado na prancha');
const exportPDF=functionDeclaration(layout,'exportLayoutPDF');
assert.match(exportPDF,/await\s+buildLayout\s*\(\s*\)/,
  'a exportação deve reconstruir a prancha antes de rasterizar');
assert.match(exportPDF,/rasterizeLayout\s*\(/,
  'o PDF deve rasterizar a mesma prancha que contém os símbolos testados');
assert.doesNotMatch(exportPDF,/\bplateApply\s*\(/,
  'exportLayoutPDF não pode reaplicar a convenção antiga da prancha antes do build');

/* Regressão específica do PDF: a prévia possui um tamanho geral pendente de
   35 px, enquanto pl.conv ainda guarda 18 px. A implementação antiga chamava
   plateApply(plAtual), apagava _loDraftConv e só então executava buildLayout;
   por isso o mapa e a prévia estavam certos, mas o PDF voltava ao tamanho
   antigo. O spy reproduz exatamente esse efeito caso a chamada retorne. */
{
  const liveLayer={id:7,sym:structuredClone(layer.sym)};
  liveLayer.sym.pt.size=35;
  const oldPlate={
    id:91,name:'Prancha tamanho antigo',
    conv:{'L:7':{sym:{pt:{size:18}}}}
  };
  const draft={'L:7':{sym:{pt:{size:35}}}};
  const exportState={
    loMode:'a4',layers:[liveLayer],plates:[oldPlate],plateId:91,
    _loDraftConv:structuredClone(draft),
    _loPaper:{mode:'a4',format:'a4p',PW:210,PH:297}
  };
  let plateApplyCalls=0,observed=null,downloaded=0;
  const order=[];
  const exportContext=vm.createContext({
    console,S:exportState,
    showLoad:()=>order.push('show'),hideLoad:()=>order.push('hide'),
    plateApply:pl=>{
      plateApplyCalls++;
      liveLayer.sym.pt.size=pl.conv['L:7'].sym.pt.size;
      exportState._loDraftConv=null;
      order.push('plateApply');
    },
    buildLayout:async()=>{
      observed={
        liveSize:liveLayer.sym.pt.size,
        draftSize:exportState._loDraftConv?.['L:7']?.sym?.pt?.size??null
      };
      order.push('build');
    },
    rasterizeLayout:async()=>{
      order.push('raster');
      return {
        width:2480,height:3508,
        toDataURL:()=> 'data:image/jpeg;base64,AA=='
      };
    },
    b64ToBytes:()=>new Uint8Array([0]),
    buildPDF:()=>{order.push('pdf');return {type:'application/pdf'};},
    download:()=>{downloaded++;order.push('download');},
    toast:()=>order.push('toast')
  });
  vm.runInContext(exportPDF,exportContext,{filename:'layout-export-draft.contract.js'});
  await exportContext.exportLayoutPDF();

  assert.equal(plateApplyCalls,0,
    'exportar a prancha atual não pode chamar plateApply');
  assert.deepEqual(observed,{liveSize:35,draftSize:35},
    'buildLayout deve receber o tamanho e o draft que estavam visíveis na prévia');
  assert.equal(exportState._loDraftConv?.['L:7']?.sym?.pt?.size,35,
    'exportar não pode descartar _loDraftConv');
  assert.ok(order.indexOf('build')>=0&&order.indexOf('build')<order.indexOf('raster'),
    'o build com o draft visível deve ocorrer antes da rasterização do PDF');
  assert.equal(downloaded,1,'a exportação simulada deve concluir o PDF');
}

/* O lote tem um risco adicional: precisa aplicar o snapshot de cada outra
   prancha, mas a página da prancha ativa deve usar o draft que está visível.
   Depois do PDF, a prévia ativa e seus três drafts devem voltar, enquanto os
   snapshots persistidos permanecem byte a byte iguais. */
{
  const liveLayer=structuredClone(layer);
  liveLayer.sym.pt.size=35;
  const otherPlate={
    id:10,name:'Prancha secundária',
    conv:{'L:7':{sym:{pt:{size:22}}}},vis:{'L:7':true},stack:['L:7']
  };
  const activePlate={
    id:91,name:'Prancha ativa',
    conv:{'L:7':{sym:{pt:{size:18}}}},vis:{'L:7':false},stack:['L:7']
  };
  const snapshotsBefore=JSON.stringify([otherPlate.conv,activePlate.conv]);
  const draftConv={'L:7':{sym:{pt:{size:35}}}};
  const draftVis={'L:7':true};
  const draftStack=['L:7'];
  const exportState={
    loMode:'a4',layers:[liveLayer],plates:[otherPlate,activePlate],plateId:91,
    _loDraftConv:structuredClone(draftConv),
    _loDraftVis:{...draftVis},_loDraftStack:draftStack.slice(),
    _loAppliedPlateId:91,_loPaper:{mode:'a4',format:'a4p',PW:210,PH:297}
  };
  let renderedSVG='',captured=0,downloaded=0,builtPages=0;
  const rasterized=[];
  const batchContext=vm.createContext({
    console,S:exportState,
    layoutClone:value=>structuredClone(value),
    platesInit:()=>{},plateCapture:()=>{captured++;},
    plateApply:pl=>{
      exportState.plateId=pl.id;
      liveLayer.sym.pt.size=pl.conv['L:7'].sym.pt.size;
      exportState._loDraftConv=null;
      exportState._loDraftVis=null;
      exportState._loDraftStack=null;
      exportState._loAppliedPlateId=pl.id;
    },
    layoutConventionApply:conv=>{
      liveLayer.sym.pt.size=conv['L:7'].sym.pt.size;
    },
    layoutStackApply:stack=>{exportState.stack=stack.slice();},
    layoutVisRestore:vis=>{exportState.visible={...vis};},
    buildLayout:()=>{
      renderedSVG=context.svgDaCamada(liveLayer,true);
      return Promise.resolve();
    },
    rasterizeLayout:async()=>{
      rasterized.push({
        plateId:exportState.plateId,
        liveSize:liveLayer.sym.pt.size,
        draftSize:exportState._loDraftConv?.['L:7']?.sym?.pt?.size??null,
        inheritedScale:scaleAt(renderedSVG,10,10),
        overrideScale:scaleAt(renderedSVG,20,20)
      });
      return {
        width:2480,height:3508,
        toDataURL:()=> 'data:image/jpeg;base64,AA=='
      };
    },
    b64ToBytes:()=>new Uint8Array([0]),
    buildPDFmulti:pages=>{builtPages=pages.length;return {type:'application/pdf'};},
    showLoad:()=>{},hideLoad:()=>{},renderPlateTabs:()=>{},
    download:()=>{downloaded++;},toast:()=>{}
  });
  const exportAll=functionDeclaration(layout,'exportAllPlatesPDF');
  vm.runInContext(exportAll,batchContext,{filename:'layout-export-all-draft.contract.js'});
  await batchContext.exportAllPlatesPDF();

  assert.equal(captured,1,
    'o lote deve capturar os campos rotineiros da prancha uma única vez');
  assert.deepEqual(rasterized,[
    {plateId:10,liveSize:22,draftSize:null,
      inheritedScale:expectedScale(22),overrideScale:expectedScale(42)},
    {plateId:91,liveSize:35,draftSize:35,
      inheritedScale:expectedScale(35),overrideScale:expectedScale(42)}
  ],'outras páginas devem usar snapshots; a página ativa deve rasterizar o draft visível');
  assert.equal(builtPages,2,'o PDF em lote deve conter as duas pranchas');
  assert.equal(downloaded,1,'o PDF em lote deve ser concluído uma única vez');
  assert.equal(exportState.plateId,91,'a prancha ativa deve ser restaurada ao final');
  assert.equal(liveLayer.sym.pt.size,35,
    'a prévia ativa deve voltar ao tamanho geral pendente depois do lote');
  assert.equal(exportState._loDraftConv?.['L:7']?.sym?.pt?.size,35,
    'o draft de convenção ativo deve ser restaurado depois do lote');
  assert.deepEqual(JSON.parse(JSON.stringify(exportState._loDraftVis)),draftVis,
    'o draft de visibilidade ativo deve ser restaurado depois do lote');
  assert.deepEqual(JSON.parse(JSON.stringify(exportState._loDraftStack)),draftStack,
    'o draft de ordem ativo deve ser restaurado depois do lote');
  assert.equal(exportState._loAppliedPlateId,91,
    'o marcador da prancha aplicada deve voltar para a prancha ativa');
  assert.equal(JSON.stringify([otherPlate.conv,activePlate.conv]),snapshotsBefore,
    'exportar em lote não pode atualizar silenciosamente nenhum pl.conv');
}

console.log('OK: tamanho geral, override e drafts chegam ao SVG, PDF atual e PDF em lote do Layout.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

process.on('uncaughtException',error=>{
  console.error('UNCAUGHT:',error&&error.message||error);
  process.exit(1);
});
process.on('unhandledRejection',error=>{
  console.error('UNHANDLED:',error&&error.message||error);
  process.exit(1);
});

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

function trecho(source,start,end,label){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,`${label}: trecho extraível entre ${start} e ${end}`);
  return source.slice(a,b);
}

const rasterSource=read('src/core/parts/20-raster-dem.js');
const v3Source=read('src/core/parts/19-hydrology-and-flooding.js');
const polygonSource=read('src/core/parts/25-geoprocessing-tin.js');
const layoutSource=read('src/core/parts/17-layout-printing.js');
const template=read('src/index.template.html');
const dist=read('dist/GeoMine.html');

const context={console,Uint8Array,Float32Array,Float64Array,Map,Set};
context.window=context;
vm.createContext(context);

/* Resolve as classes e pinta o raster pelo mesmo código usado no mapa, nos
   tiles e na imagem que segue para o Layout. */
const painterCode=trecho(rasterSource,'function rasterClassNumber(','function rasterCanvas(','classes/pintor 2D');
vm.runInContext(painterCode,context,{filename:'20-raster-dem.classes.js'});

/* Helpers do editor: validação, rótulo automático e clone numérico. */
const editorHelpers=trecho(rasterSource,'function rasEhDeclividade(','function rasClassShowValidation(','editor de faixas');
vm.runInContext(editorHelpers,context,{filename:'20-raster-dem.class-editor.js'});

context.hexToRGB01=hex=>{
  const h=String(hex||'#777777').replace('#','');
  return [parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255];
};
context.hypsoColor=()=>[0,0,0];
const v3ColorCode=trecho(v3Source,'function v3RasterStyleColor(','function v3RasterStyleHasLight(','pintor 3D');
vm.runInContext(v3ColorCode,context,{filename:'19-hydrology-and-flooding.v3-color.js'});

/* A poligonização é exercida com um contorno mínimo determinístico. O teste
   interessa à atribuição da classe, não ao traçado geométrico do contorno. */
context.pgRingsFromEdges=(_edges,d)=>[[
  [d.xll,d.yll],[d.xll+d.cs,d.yll],
  [d.xll+d.cs,d.yll+(d.csy||d.cs)],[d.xll,d.yll+(d.csy||d.cs)],[d.xll,d.yll]
]];
const polygonizeCode=trecho(polygonSource,'function polygonizeRasterGrid(','function runPolygonizeRaster(','poligonização por classe');
vm.runInContext(polygonizeCode,context,{filename:'25-geoprocessing-tin.polygonize.js'});

const classes=[
  {min:0,max:15,label:'0 – 15',color:'#ff0000',vis:true},
  {min:15,max:50,label:'15 – 50',color:'#00ff00',vis:true},
  {min:50,max:100,label:'50 – 100',color:'#0000ff',vis:true}
];
const cases=[
  [-1,null],[0,0],[14.999999,0],[15,0],[15.000001,1],
  [49.999999,1],[50,1],[50.000001,2],[100,2],[101,null]
];

/* Contrato histórico: classes fechadas nos dois extremos e primeira
   ocorrência vencedora quando os limites se encostam. */
for(const [value,index] of cases){
  const hit=context.rasterClassRangeFind(classes,value);
  assert.equal(hit?hit.index:null,index,`classe do valor ${value}`);
}
assert.equal(context.rasterClassRangeFind(classes,NaN),null,'NaN não pertence a nenhuma faixa');
assert.equal(context.rasterClassRangeFind(classes,''),null,'valor vazio não pertence a nenhuma faixa');

const colorBytes=['#ff0000','#00ff00','#0000ff'].map(hex=>[
  parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)
]);
const gray=[119,119,119];
const grid={z:Float64Array.from(cases.map(([value])=>value))};
const raster={style:{mode:'classes',classes}};
const paint=context.rasterPainter(raster,0,100);
for(let i=0;i<cases.length;i++){
  const out=[0,0,0],ok=paint(grid,i,grid.z,out),index=cases[i][1];
  assert.equal(ok,true,`o valor finito ${cases[i][0]} deve ser pintado`);
  assert.deepEqual(out,index==null?gray:colorBytes[index],`cor 2D do valor ${cases[i][0]}`);
}
assert.equal(context.rasterPainter(raster,0,100)({z:[NaN]},0,[NaN],[0,0,0]),false,
  'NoData continua transparente no raster');

const near=(a,b)=>Math.abs(a-b)<=1e-12;
for(const [value,index] of cases){
  const actual=context.v3RasterStyleColor(raster,value,0,100,null);
  const expected=(index==null?gray:colorBytes[index]).map(x=>x/255);
  assert.ok(actual.every((x,i)=>near(x,expected[i])),`cor 3D do valor ${value}`);
}

/* A poligonização deve compartilhar exatamente as mesmas fronteiras. 15 fica
   na primeira classe, 50 na segunda; o valor 101 permanece sem classe. */
const poly=context.polygonizeRasterGrid({
  name:'Faixas de teste',style:{mode:'classes',classes},
  d:{nc:5,nr:1,cs:1,xll:0,yll:0,z:Float64Array.from([15,15.1,50,50.1,101])}
},false,100,'class');
assert.deepEqual(Array.from(poly.features,p=>p.props.CLASSE),
  ['0 – 15','15 – 50','50 – 100','101'],'classes atribuídas na poligonização');
assert.deepEqual(Array.from(poly.features,p=>p.props.CELULAS),[1,2,1,1],
  '15,1 e 50 pertencem juntos à segunda faixa');
assert.equal(poly.features.at(-1).props._PG_COR,null,'valor externo é poligonizado sem cor de classe');

/* Validação: encostar é válido, sobrepor bloqueia e lacuna é permitida com
   aviso explícito de que os valores serão cinza. */
const valid=context.rasClassValidate(classes);
assert.equal(valid.ok,true,'0–15, 15–50 e 50–100 são faixas válidas');
assert.equal(valid.warn,'','faixas contíguas não geram aviso');

const overlap=context.rasClassValidate([
  {min:0,max:20},{min:15,max:50},{min:50,max:100}
]);
assert.equal(overlap.ok,false,'sobreposição deve bloquear a aplicação');
assert.match(overlap.msg,/sobreposição/i);
assert.equal(overlap.row,1,'a segunda faixa é marcada na sobreposição');

const gap=context.rasClassValidate([
  {min:0,max:15},{min:20,max:50},{min:50,max:100}
]);
assert.equal(gap.ok,true,'lacuna é uma configuração aplicável');
assert.match(gap.warn,/intervalo sem classe/i);
assert.match(gap.warn,/15[^\d]+20/,'o aviso identifica os dois lados da lacuna');
assert.match(gap.warn,/cinza/i,'o aviso explica a aparência dos valores sem classe');

const inverted=context.rasClassValidate([{min:15,max:15},{min:15,max:50}]);
assert.equal(inverted.ok,false,'faixa sem amplitude deve ser recusada');
assert.match(inverted.msg,/maior que o inicial/i);

/* Rótulos numéricos existentes são reconhecidos como automáticos. Nomes
   semânticos continuam customizados quando os limites mudam. */
assert.equal(context.rasClassLabelPareceAuto({min:0,max:15,label:'0 – 15'}),true);
assert.equal(context.rasClassLabelPareceAuto({min:0,max:15,label:'0,0 – 15,0 m'}),true);
assert.equal(context.rasClassLabelPareceAuto({min:0,max:15,label:'Baixa prioridade'}),false);
assert.equal(context.rasClassLabelPareceAuto({min:0,max:15,label:'0 – 14'}),false);

const labelRaster={quantity:'mcfIndex'};
const cloned=context.rasClassClone([
  {min:'0',max:'15',label:'0 – 15',color:'#ff0000'},
  {min:'15',max:'50',label:'Prioridade média',color:'#00ff00'}
]);
assert.equal(typeof cloned[0].min,'number','mínimo clonado é numérico');
assert.equal(typeof cloned[0].max,'number','máximo clonado é numérico');
assert.equal(cloned[0]._autoLabel,true,'primeiro rótulo é automático');
assert.equal(cloned[1]._autoLabel,false,'segundo rótulo é customizado');
cloned[0].max=12;
if(cloned[0]._autoLabel)cloned[0].label=context.rasClassRangeLabel(cloned[0],labelRaster);
cloned[1].min=12;
if(cloned[1]._autoLabel)cloned[1].label=context.rasClassRangeLabel(cloned[1],labelRaster);
assert.equal(cloned[0].label,'0 – 12','rótulo automático acompanha o novo limite');
assert.equal(cloned[1].label,'Prioridade média','rótulo customizado é preservado');

/* Legenda do Layout: testa o consumidor real, incluindo ordem, nomes e cores. */
const layoutRaster={name:'Favorabilidade (%)',visible:true,groupId:null,
  style:{mode:'classes',classes}};
context.S={loMode:'fig',wms:[]};
context.displayList=()=>[{kind:'raster',n:{t:'R',id:21,o:layoutRaster}}];
context.groupMembers=()=>[];
context.fmt=value=>String(value);
const legendCode=trecho(layoutSource,'function legendVisibilityState(','function layoutWmsUrl(','legenda do Layout');
vm.runInContext(legendCode,context,{filename:'17-layout-printing.legend.js'});
const legend=context.legendItems();
assert.deepEqual(Array.from(legend,x=>x.label),
  ['Favorabilidade (%)','0 – 15','15 – 50','50 – 100'],'rótulos da legenda do Layout');
assert.deepEqual(Array.from(legend.slice(1),x=>x.color),
  ['#ff0000','#00ff00','#0000ff'],'cores da legenda do Layout');

/* Guardas de integração: estes consumidores não devem voltar a implementar
   uma regra de fronteira diferente do helper central. */
assert.match(trecho(rasterSource,'function renderTinMalha2D(','function renderRaster(','TIN 2D'),
  /rasterClassRangeFind\(/,'TIN 2D usa o resolvedor central');
assert.match(v3ColorCode,/rasterClassRangeFind\(/,'3D usa o resolvedor central');
assert.match(polygonizeCode,/rasterClassRangeFind\(/,'poligonização usa o resolvedor central');
assert.match(painterCode,/rasterClassRangeFind\(/,'mapa/Layout usam o resolvedor central');

/* O template hospeda a mensagem; os seis controles mínimo/máximo são criados
   dinamicamente pelo módulo e precisam estar no HTML distribuído. */
assert.match(template,/id="rasClassMsg"/,'template contém a área de validação');
assert.match(dist,/function rasterClassRangeFind\(/,'dist contém o resolvedor de faixas');
assert.match(dist,/data-rmin="\$\{i\}"/,'dist contém o controle de limite inicial');
assert.match(dist,/data-rmax="\$\{i\}"/,'dist contém o controle de limite final');
assert.match(dist,/inputmode="decimal"/,'controles numéricos aceitam entrada decimal');
assert.match(dist,/id="rasClassMsg"/,'dist contém a mensagem de validação');
assert.match(dist,/\[data-rmin\],\[data-rmax\]/,'dist liga os novos controles à atualização ao vivo');

console.log('Faixas raster validadas: edição 0–15/15–50/50–100, fronteiras, cinza externo, avisos, rótulos, mapa, Layout, 3D, poligonização e dist.');

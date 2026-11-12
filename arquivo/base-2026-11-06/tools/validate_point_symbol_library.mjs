import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = rel => fs.readFileSync(new URL(rel, root), 'utf8');
const core = read('src/core/parts/05-layer-model-symbology.js');
const props = read('src/core/parts/09-measurement-properties-cad.js');
const tree = read('src/core/parts/15-layer-tree-crs-ui.js');
const persistence = read('src/core/parts/26-project-persistence.js');
const layout = read('src/core/parts/17-layout-printing.js');
const extra = read('src/modules/features/alagis-simbolos-extras.js');
const template = read('src/index.template.html');
const dist = read('dist/GeoMine.html');

assert.match(core, /const params=\(c&&c\.symbolParams\)\|\|cfg\.symbolParams\|\|null/);
assert.equal((core.match(/ps\.def\.d\(fill,stroke,w,ps\.params\|\|\{\}\)/g) || []).length, 2,
  'mapa e Layout devem enviar os parâmetros ao desenho do símbolo');
assert.match(core, /paramDefs:\{speed:\{label:'Velocidade \(km\/h\)'/);
assert.match(props, /class="ce-symbol-param"/);
assert.match(props, /GeoMinePointSymbols\.rememberLayer\(L\)/);
assert.match(tree, /oldCats=new Map/);
assert.match(tree, /GeoMinePointSymbols\.applyToLayer\(L\)/);
assert.match(persistence, /GeoMinePointSymbols\.autoApplyLayer\(L\)/);
assert.match(layout, /symbolParams:c\.symbolParams/);
assert.match(template, /id="btnLpPointSymbols"/);

const store = new Map();
const ctx = vm.createContext({
  console,
  PT_SYMS: {
    circle:{lb:'Círculo',g:'Geométricos',d:()=>''},
    tr_vel:{lb:'Velocidade',g:'Trânsito',paramDefs:{speed:{type:'number',min:1,max:999,default:40}},d:()=>''},
    tr_duplo:{lb:'Mão dupla',g:'Trânsito',d:()=>''},
    tr_rampa:{lb:'Declive',g:'Trânsito',d:()=>''},
    tr_balan:{lb:'Balança',g:'Trânsito',d:()=>''}
  },
  localStorage: {
    getItem:key => store.has(key) ? store.get(key) : null,
    setItem:(key,value) => store.set(key,String(value))
  },
  window:{},
  rampColors:(name,n)=>Array.from({length:n},(_,i)=>`#${String(i+1).padStart(6,'0')}`)
});
vm.runInContext(extra, ctx, {filename:'alagis-simbolos-extras.js'});
const api = ctx.window.GeoMinePointSymbols;
assert.ok(api, 'API pública da biblioteca ausente');

const expected = new Map([
  ['Caminho Seguro','seg_caminho_seguro'],
  ['Proibido Uso Celular','seg_sem_celular'],
  ['Limite 20 km/h','tr_vel_20'],
  ['Limite 40 km/h','tr_vel_40'],
  ['Rotatoria','tr_rotatoria'],
  ['Sentido Duplo','placa_sentido_duplo'],
  ['Acesso Restrito','seg_acesso_restrito'],
  ['Acesso Interrompido','seg_acesso_interrompido'],
  ['Declive','placa_declive'],
  ['Veiculos Pesados','seg_veiculos_pesados'],
  ['Pessoal Autorizado','seg_pessoal_autorizado'],
  ['Trânsito Veículos Pesados','seg_transito_pesados']
]);
for (const [value,shape] of expected) assert.equal(api.resolve(value)?.shape, shape, value);
const catalogTypes = new Map([
  ['limite_20','tr_vel_20'],['limite_30','tr_vel_30'],['limite_40','tr_vel_40'],
  ['declive','placa_declive'],['pessoal_autorizado','seg_pessoal_autorizado'],
  ['veiculos_pesados','seg_veiculos_pesados'],['acesso_interrompido','seg_acesso_interrompido'],
  ['sentido_duplo','placa_sentido_duplo'],['caminho_seguro','seg_caminho_seguro'],
  ['rotatoria','tr_rotatoria'],['transito_veiculos_pesados','seg_transito_pesados'],
  ['entrada_saida_caminhoes','placa_entrada_saida_caminhoes'],['balanca','placa_balanca'],
  ['estacione_re','seg_estacione_re'],['proibido_pedestre','placa_proibido_pedestre'],
  ['acesso_restrito','seg_acesso_restrito'],['proibido_celular','seg_sem_celular']
]);
for (const [value,shape] of catalogTypes) assert.equal(api.resolve(value)?.shape, shape, value);
assert.equal(api.resolve('VELOCIDADE 120 KM/H').symbolParams.speed, 120);
assert.match(ctx.PT_SYMS.tr_vel_20.d(), />20</);
assert.match(ctx.PT_SYMS.tr_vel_40.d(), />40</);
assert.match(ctx.PT_SYMS.seg_caminho_seguro.d(), /<image/);

const values = [...expected.keys()];
const layer = {
  name:'Sinalização', gtype:'point',
  fields:[{name:'Sinalizaca',type:'C'}],
  features:values.map(v=>({props:{Sinalizaca:v},geom:[[0,0]]})),
  sym:{mode:'single',field:'',cats:[],ramp:'amber'}
};
assert.equal(api.autoApplyLayer(layer), values.length);
assert.equal(layer.sym.mode, 'cat');
assert.equal(layer.sym.field, 'Sinalizaca');
assert.equal(layer.sym.cats.length, values.length);
assert.equal(layer.sym.cats.find(c=>c.value==='Limite 20 km/h').shape, 'tr_vel_20');
assert.equal(layer.sym.pointSymbolLibraryVersion, 2);

const migrated = {
  name:'Sinalização antiga',gtype:'point',fields:[{name:'Sinalizaca'}],
  features:[{props:{Sinalizaca:'Sentido Duplo'},geom:[[1,1]]}],
  sym:{mode:'cat',field:'Sinalizaca',pointSymbolLibraryVersion:1,
    cats:[{value:'Sentido Duplo',shape:'tr_duplo',size:34}],ramp:'amber'}
};
assert.equal(api.autoApplyLayer(migrated),1);
assert.equal(migrated.sym.cats[0].shape,'placa_sentido_duplo');

const duplo = layer.sym.cats.find(c=>c.value==='Sentido Duplo');
duplo.shape='seg_caminho_seguro'; duplo.size=41;
assert.equal(api.rememberLayer(layer), values.length);
const later = {
  name:'Placas futuras',gtype:'point',fields:[{name:'TIPO'}],
  features:[{props:{TIPO:'Sentido Duplo'},geom:[[1,1]]}],
  sym:{mode:'cat',field:'TIPO',cats:[],ramp:'amber'}
};
assert.equal(api.applyToLayer(later),1);
assert.equal(later.sym.cats[0].shape,'seg_caminho_seguro');
assert.equal(later.sym.cats[0].size,41);

for (const id of ['tr_vel_20','tr_vel_40','placa_sentido_duplo','placa_declive',
  'seg_caminho_seguro','seg_sem_celular','tr_rotatoria','seg_acesso_restrito',
  'seg_acesso_interrompido','seg_pessoal_autorizado','seg_veiculos_pesados',
  'seg_transito_pesados','seg_estacione_re']) assert.ok(ctx.PT_SYMS[id], id);

assert.ok(dist.includes('geomine_point_symbol_memory_v2'));
assert.ok(dist.includes('seg_estacione_re'));
assert.ok(dist.includes('data:image/png;base64,'));
assert.ok(!dist.includes('__GM_PLACA_'));
for (const id of ['limite_20','limite_30','declive','pessoal_autorizado','veiculos_pesados',
  'acesso_interrompido','sentido_duplo','caminho_seguro','rotatoria',
  'transito_veiculos_pesados','entrada_saida_caminhoes','balanca','estacione_re',
  'proibido_pedestre','acesso_restrito','proibido_celular']) {
  const hit=dist.match(new RegExp(`${id}:'data:image/png;base64,([^']+)'`));
  assert.ok(hit, `placa ${id} não foi incorporada`);
  assert.deepEqual(Buffer.from(hit[1],'base64'),fs.readFileSync(new URL(`src/assets/placas/${id}.png`,root)),
    `placa ${id} difere da fonte canônica`);
}
assert.ok(dist.includes('🛑 Aplicar biblioteca de símbolos'));
console.log('OK — biblioteca persistente e símbolos por categoria validados');

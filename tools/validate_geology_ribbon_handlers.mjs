import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

const manifest=JSON.parse(read('src/module-order.json'));
const core=manifest.assets.find(asset=>asset.parts?.includes('core/parts/10-ribbon-ui-preferences.js'));
const ribbon=core.parts.map(relative=>read('src/'+relative)).join('');

/* A aba mostra exatamente estas 30 ferramentas. O contrato deste teste é
   intencional: nenhum botão da Geologia pode voltar a ser apenas decorativo
   (visual-only/"em breve") quando o catálogo visual for reorganizado. */
const tools=[
  'mapeamento-campo','ficha-campo',
  'litologia','contato-geologico','falha','dobra','acamamento',
  'xistosidade','fratura','veio','dique','zona-cisalhamento',
  'sondagem','spt','trincheira','afloramento','ponto-amostra',
  'importar-furos-string','importar-furos-csv',
  'log-sondagem','testemunho','dominio-geologico','surpac-superficies','modelo-geologico-3d','secao-geologica',
  'mapa-estrutural','estereograma','lineacao','foliacao','plunging'
];

const geologyStart=ribbon.indexOf("set('geologia',[");
const geologyEnd=ribbon.indexOf("set('mineracao',[",geologyStart);
assert.ok(geologyStart>=0&&geologyEnd>geologyStart,
  'catálogo visual da aba Geologia não foi encontrado');
const geologyCatalog=ribbon.slice(geologyStart,geologyEnd);

for(const tool of tools){
  const escaped=tool.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const occurrences=[...geologyCatalog.matchAll(new RegExp(
    `\\[\\s*['\"]${escaped}['\"]\\s*,`,'g'))].length;
  assert.equal(occurrences,1,
    `a ferramenta geológica ${tool} deve aparecer exatamente uma vez na faixa`);
}

/* Os adapters ficam no orquestrador da ribbon porque `comando()` é quem
   remove visual/soon e instala o handler real. Exigir chamadas literais
   também mantém a busca/auditoria do bundle simples e impede um botão sem
   vínculo por erro de grafia. */
const adapters=new Map();
const adapterRe=/comando\(\s*['"]geologia['"]\s*,\s*['"]([^'"]+)['"]\s*,([\s\S]*?)\);/g;
let match;
while((match=adapterRe.exec(ribbon))){
  assert.equal(adapters.has(match[1]),false,
    `handler geológico duplicado para ${match[1]}`);
  adapters.set(match[1],match[2]);
}
assert.deepEqual([...adapters.keys()].sort(),tools.slice().sort(),
  'os 30 botões da Geologia devem possuir adapters reais, sem sobras ou ausências');

const geoRun=/const\s+geoRun\s*=([\s\S]*?\n\s*};)/.exec(ribbon)?.[1]||'';
assert.match(geoRun,/window\.GeoMineGeology\.run\s*\(\s*chave\s*,\s*btn\s*\)/,
  'o adapter compartilhado geoRun deve despachar ao workspace geológico');

for(const tool of tools){
  const body=adapters.get(tool)||'';
  assert.match(body,/(?:window\.GeoMineGeology\.run|geoRun)\s*\(/,
    `${tool} deve delegar ao workspace geológico, não a emBreve/toast`);
  assert.match(body,new RegExp(`['\"]${tool.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}['\"]`),
    `${tool} deve encaminhar sua própria chave ao dispatcher`);
  assert.doesNotMatch(body,/emBreve|visual-only|\bsoon\b/,
    `${tool} ainda está ligado a um placeholder`);
}

/* Os imports devem usar a mesma cartela de ícones do restante da faixa.
   Exercitar ribIcon também detecta aliases vazios e o marcador de ausência. */
assert.match(geologyCatalog,/G\('Importar sondagens',/,'grupo de importação de sondagens ausente');
const pngLiteral=/const RIB_PNG=(\{[^\n]+\});/.exec(ribbon)?.[1];
assert.ok(pngLiteral,'cartela nativa PNG não encontrada');
const iconFn=ribbon.slice(ribbon.indexOf('function ribIcon(cmd){'),ribbon.indexOf('function ribFindSec('));
assert.ok(iconFn.startsWith('function ribIcon(cmd){'),'renderer nativo de ícones ausente');
const iconContext={
  RIB_PNG:JSON.parse(pngLiteral),RIB_CAT_ATUAL:'geologia',RIB_PNG_SPRITE:'native-sprite',
  document:{documentElement:{style:{getPropertyValue:()=>'',setProperty:()=>{}}}}
};
vm.createContext(iconContext);
for(const [command,native,label] of [
  ['importar-furos-string','sondagem','Furos · String Surpac'],
  ['importar-furos-csv','log-sondagem','Furos · CSV']
]){
  assert.ok(geologyCatalog.includes(`['${command}','${label}']`),`${command}: rótulo incorreto`);
  const alias=`RIB_PNG['${command}']=RIB_PNG['${native}'];`;
  assert.ok(ribbon.includes(alias),`${command}: alias do pictograma nativo ausente`);
  vm.runInContext(alias,iconContext);
  const coords=iconContext.RIB_PNG[command];
  assert.ok(Array.isArray(coords)&&coords.length===2&&coords.every(Number.isFinite),`${command}: ícone PNG vazio/inválido`);
  const markup=vm.runInContext(`${iconFn}\nribIcon({ic:'${command}'})`,iconContext);
  assert.match(markup,/class="ric-png"/,`${command}: não usa o renderer nativo PNG`);
  assert.doesNotMatch(markup,/missing|undefined|NaN/,`${command}: ícone ausente`);
}

/* Os dois módulos precisam entrar no bundle oficial. Ter o arquivo no src,
   mas esquecê-lo fora do manifesto, reproduz exatamente o defeito em que a
   funcionalidade existe no repositório e não existe no dist publicado. */
const manifestText=JSON.stringify(manifest);
for(const relative of [
  'modules/geology/geology-workspace.js',
  'modules/geology/geological-sections.js',
  'modules/geology/field-mapping.js',
  'modules/geology/surpac-reader.js',
  'modules/geology/mesh-section-engine.js',
  'modules/geology/geological-meshes.js'
]){
  assert.ok(fs.existsSync(path.join(root,'src',relative)),
    `módulo ausente: src/${relative}`);
  assert.ok(manifestText.includes(relative),
    `src/${relative} existe, mas não foi incluído em module-order.json`);
}

console.log('OK: os 30 comandos da Geologia têm handlers reais; os dois imports têm ícones nativos válidos e os módulos entram no bundle.');

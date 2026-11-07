import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/modules/geology/geological-sections.js',import.meta.url),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
let count=0;
function test(name,fn){fn();console.log('OK · '+name);count++;}
function fixture(layers){
  const c={window:{},S:{layers,rasters:[],workCRS:'EPSG:31982'},console,setTimeout,clearTimeout,
    document:{readyState:'loading',addEventListener(){},getElementById(){return null;}},
    reproj:(_a,_b,x,y)=>[x,y]};
  vm.createContext(c);vm.runInContext(source,c);const t=c.window.GeoMineGeology.__sectionTest;
  return {c,t,profile:(L,line)=>t.projectProfiles(['L:'+L.id],line,t.lineMetrics(line),20,null)[0]};
}
const ring=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]],
  feature=(geom,z,props={})=>({geom,zg:geom.map(()=>z),props}),
  pit=(features,extra={})=>({id:1,name:'Cava final',gtype:'line',crs:'EPSG:31982',features,...extra}),
  axis=[[-10,50],[110,50]],
  benches=()=>[feature(ring(0,0,100,100),100,{ELEMENTO:'Crista'}),feature(ring(10,10,90,90),80,{ELEMENTO:'Pé'}),
    feature(ring(20,20,80,80),80,{ELEMENTO:'Crista'}),feature(ring(30,30,70,70),60,{ELEMENTO:'Pé'})],
  valueAt=(profile,s)=>{for(const g of profile.segments)for(let i=1;i<g.length;i++){
    const a=g[i-1],b=g[i];if(s>=a.station-1e-6&&s<=b.station+1e-6)return a.z+(b.z-a.z)*(s-a.station)/(b.station-a.station||1);
  }return NaN;};
test('bancos, bermas e fundo formam linhas contínuas por cotas exatas, sem alterar fonte',()=>{
  const L=pit(benches(),{_cava2DesignId:'design-1'}),f=fixture([L]),before=plain(L),p=f.profile(L,axis);
  assert.equal(p.connectedProfile,true);assert.equal(p.points.length,0);assert.equal(p.segments.length,1);
  for(const [s,z] of [[10,100],[20,80],[30,80],[40,60],[80,60],[90,80],[100,80],[110,100]])assert.ok(Math.abs(valueAt(p,s)-z)<1e-7);
  assert.deepEqual(plain(L),before);assert.match(p.method,/recortado ao domínio/);
  assert.doesNotMatch(f.t.projectSourceOptions()[0].description,/gere.*TIN/);
});
test('eixo invertido conserva perfil e estações crescentes',()=>{
  const L=pit(benches()),f=fixture([L]),p=f.profile(L,axis),r=f.profile(L,[...axis].reverse());
  for(let s=10;s<=110;s++)assert.ok(Math.abs(valueAt(p,s)-valueAt(r,120-s))<1e-6);
  assert.ok(r.segments[0].every((q,i,a)=>!i||q.station>=a[i-1].station));
});
test('eixo curto dentro do talude interpola entre linhas conhecidas, não só cruzamentos visíveis',()=>{
  const L=pit(benches()),f=fixture([L]),p=f.profile(L,[[2,50],[8,50]]);
  assert.equal(p.segments.length,1);assert.ok(Math.abs(valueAt(p,0)-96)<1e-7);assert.ok(Math.abs(valueAt(p,6)-84)<1e-7);
  const floor=f.profile(L,[[40,50],[60,50]]);assert.equal(valueAt(floor,0),60);assert.equal(valueAt(floor,20),60);
});
test('eixo dobrado soma distâncias reais e conserva vértice da seção',()=>{
  const L=pit(benches()),f=fixture([L]),p=f.profile(L,[[-10,50],[50,50],[50,110]]);
  assert.ok(p.segments[0].some(q=>Math.abs(q.station-60)<1e-6&&q.z===60));
  for(const [s,z] of [[10,100],[40,60],[80,60],[90,80],[110,100]])assert.ok(Math.abs(valueAt(p,s)-z)<1e-7,s);
});
test('dobra dentro de talude usa apenas cruzamentos reais do eixo e não cria degrau artificial',()=>{
  const L=pit([feature(ring(0,0,100,100),100),feature(ring(30,30,70,70),60)]),f=fixture([L]),
    bent=[[0,50],[20,50],[20,100]],p=f.profile(L,bent),r=f.profile(L,[...bent].reverse());
  assert.equal(p.segments.length,1);assert.equal(r.segments.length,1);
  // O eixo contorna o anel interno: a única informação interceptada é o
  // anel externo em ambas as pontas. Não inventar apoio no prolongamento
  // da direção da dobra para atribuir a ela uma segunda cota.
  assert.ok(p.segments.flat().every(q=>Math.abs(q.z-100)<1e-7));
  assert.equal(p.segments.flat().filter(q=>Math.abs(q.station-20)<1e-7).length,1);
  for(let s=0;s<=70;s++)assert.ok(Math.abs(valueAt(p,s)-valueAt(r,70-s))<1e-7);
});
test('componentes separados não ganham uma linha no vazio entre cavas',()=>{
  const L=pit([feature(ring(0,0,20,20),40),feature(ring(5,5,15,15),20),feature(ring(50,0,70,20),70),feature(ring(55,5,65,15),50)]),f=fixture([L]);
  const p=f.profile(L,[[-10,10],[80,10]]);assert.equal(p.segments.length,2);assert.ok(Number.isNaN(valueAt(p,45)));
  assert.ok(p.segments[0].at(-1).station<=30+1e-6);assert.ok(p.segments[1][0].station>=60-1e-6);
});
test('polígono companheiro preserva buracos e contorno de corte',()=>{
  const L=pit(benches(),{_cava2CutOf:'d'}),P={id:2,gtype:'polygon',_cava2CutFillOf:'d',features:[{
    geom:[ring(5,5,95,95),ring(45,40,55,60)],multi:true,props:{ELEMENTO:'Área projetada'}}]},f=fixture([L,P]),p=f.profile(L,axis);
  assert.equal(p.segments.length,2);assert.ok(Number.isNaN(valueAt(p,60)));
  assert.ok(Math.abs(p.segments[0][0].station-15)<1e-6);assert.ok(Math.abs(p.segments.at(-1).at(-1).station-105)<1e-6);
  assert.ok(Math.abs(p.segments[0].at(-1).station-55)<1e-6);assert.ok(Math.abs(p.segments[1][0].station-65)<1e-6);
});
test('snapshot não usa domínio do corte vivo nem da cava atual',()=>{
  const L=pit(benches(),{_cava2CutSnapshotOf:'d',_cava2CutSnapshotId:'old'}),old={id:2,gtype:'polygon',_cava2CutSnapshotId:'old',features:[{geom:ring(10,0,90,100),props:{ELEMENTO:'Área projetada'}}]},
    current={id:3,gtype:'polygon',_cava2DesignId:'d',features:[{geom:ring(0,0,5,100),props:{ELEMENTO:'Área projetada'}}]},f=fixture([L,old,current]),p=f.profile(L,axis);
  assert.equal(p.segments.length,1);assert.ok(p.segments[0][0].station>=20-1e-6);assert.ok(p.segments[0].at(-1).station<=100+1e-6);
});
test('corte situado inteiramente entre bancos interpola ambos os limites sem exigir cruzamento interior',()=>{
  const L=pit([{geom:[[0,0],[0,100]],zg:[100,100]},{geom:[[100,0],[100,100]],zg:[60,60]}],{_cava2CutOf:'d'}),
    P={id:2,gtype:'polygon',_cava2CutFillOf:'d',features:[{geom:ring(40,0,60,100),props:{ELEMENTO:'Área projetada'}}]},
    f=fixture([L,P]),p=f.profile(L,axis),r=f.profile(L,[...axis].reverse());
  assert.equal(p.segments.length,1);assert.ok(Math.abs(p.segments[0][0].station-50)<1e-7);
  assert.ok(Math.abs(p.segments[0].at(-1).station-70)<1e-7);
  assert.ok(Math.abs(valueAt(p,50)-84)<1e-7);assert.ok(Math.abs(valueAt(p,70)-76)<1e-7);
  assert.ok(Number.isNaN(valueAt(p,40)));assert.ok(Number.isNaN(valueAt(p,80)));
  for(let s=50;s<=70;s++)assert.ok(Math.abs(valueAt(p,s)-valueAt(r,120-s))<1e-7);
});
test('rampa usa bordas e eixo XYZ com interpolação das cotas em cada cruzamento',()=>{
  const L=pit([feature(ring(0,0,100,100),100),
    {geom:[[20,0],[20,100]],zg:[90,70],props:{ELEMENTO:'Rampa'}},
    {geom:[[50,0],[50,100]],zg:[70,50],props:{ELEMENTO:'Rampa'}},
    {geom:[[80,0],[80,100]],zg:[90,70],props:{ELEMENTO:'Rampa'}}]),f=fixture([L]),p=f.profile(L,axis);
  assert.ok(Math.abs(valueAt(p,30)-80)<1e-7);assert.ok(Math.abs(valueAt(p,60)-60)<1e-7);assert.ok(Math.abs(valueAt(p,90)-80)<1e-7);
});
test('importado aberto tem perfil linear limitado aos dados e explicação da interpolação',()=>{
  const L=pit([{geom:[[10,0],[10,100]],zg:[70,90]},{geom:[[90,0],[90,100]],zg:[60,80]}]),f=fixture([L]),p=f.profile(L,axis);
  assert.equal(p.segments.length,1);assert.ok(Math.abs(p.segments[0][0].station-20)<1e-6);assert.ok(Math.abs(p.segments[0].at(-1).station-100)<1e-6);
  assert.equal(valueAt(p,60),75);assert.match(p.method,/sem contorno fechado/);assert.ok(Number.isNaN(valueAt(p,0)));
});
test('linha sem cota interrompe a interpolação; não transforma ausência em zero',()=>{
  const L=pit([feature(ring(0,0,100,100),100),{geom:[[50,0],[50,100]],zg:[null,null]}]),f=fixture([L]),p=f.profile(L,axis);
  assert.equal(p.segments.length,0);assert.ok(p.points.every(q=>q.z===100));
});
test('uma só interseção permanece isolada com explicação, sem linha inventada',()=>{
  const L=pit([{geom:[[50,0],[50,100]],zg:[70,90]}]),f=fixture([L]),p=f.profile(L,axis);
  assert.equal(p.segments.length,0);assert.equal(p.points.length,1);assert.match(p.warning,/ao menos duas cotas/);
});
test('linhas geológicas genéricas não são conectadas como projetos de cava',()=>{
  const L=pit([{geom:[[10,0],[10,100]],zg:[70,90]},{geom:[[90,0],[90,100]],zg:[60,80]}],{name:'Falhas 3D',_geology:{kind:'falha'}}),f=fixture([L]),p=f.profile(L,axis);
  assert.equal(p.segments.length,0);assert.equal(p.points.length,2);assert.ok(!p.connectedProfile);
});
test('face vertical mantém duas cotas na mesma estação em vez de descartá-las',()=>{
  const L=pit([feature(ring(0,0,100,100),100),feature(ring(20,20,80,80),100),feature(ring(20,20,80,80),60)]),f=fixture([L]),p=f.profile(L,axis);
  assert.ok(p.segments.some(g=>g.some((q,i)=>i&&Math.abs(q.station-g[i-1].station)<1e-7&&Math.abs(q.z-g[i-1].z)===40)));
});
test('transformação horizontal não escala nem modifica cotas métricas',()=>{
  const L=pit([feature(ring(0,0,10,10),100),feature(ring(3,3,7,7),60)],{crs:'LOCAL'}),f=fixture([L]);
  f.c.reproj=(a,b,x,y)=>{assert.equal(a,'LOCAL');assert.equal(b,'EPSG:31982');return [x*10,y*10];};
  const p=f.profile(L,axis);assert.equal(valueAt(p,60),60);assert.equal(valueAt(p,10),100);
});
console.log(`${count} verificações de linhas de cava aprovadas.`);

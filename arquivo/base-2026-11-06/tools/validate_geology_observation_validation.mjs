import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const context={console,S:{layers:[],groups:[],rasters:[],geology:null},document:{getElementById(){return null;}},
  setTimeout(){},clearTimeout(){},structuredClone,drawLayer(){},refreshUI(){},propRefresh(){}};
context.window=context;vm.createContext(context);
vm.runInContext(read('src/modules/geology/geology-workspace.js'),context);
vm.runInContext(read('src/modules/geology/field-mapping.js').replace('api.fieldMapping=fieldMapping;',
  'api.fieldMapping=fieldMapping;fieldMapping.__testControl=fieldControl;'),context);
const fm=context.GeoMineGeology.fieldMapping,defs=context.GeoMineGeology.presets;
let assertions=0;
function test(label,fn){fn();assertions++;console.log('OK · '+label);}
const feature=props=>({geom:[[10,20]],props});
function layer(kind,props,fieldMap,orientationRef){
  return {id:1,name:kind,gtype:defs[kind].gtype,fields:Object.keys(props).map(name=>({name,type:typeof props[name]==='number'?'N':'C'})),
    _geology:{kind,fieldMap:fieldMap||{},orientationRef:orientationRef||''},features:[feature(props)],
    sym:{mode:'single',pt:{shape:defs[kind].shape||'sd_bed',size:18,rot:23,rotField:'DIRECAO',dipField:'MERGULHO'}}};
}
test('todo campo numérico de todo tipo rejeita não finitos e tipos não numéricos preenchidos',()=>{
  for(const [kind,def] of Object.entries(defs))for(const field of def.fields.filter(f=>f.type==='N'||f.type==='F')){
    for(const value of [NaN,Infinity,-Infinity,'NaN','Infinity','sem número',false,[],{}]){
      const result=fm.validateObservation(kind,{[field.name]:value},{});
      assert.ok(result.errors.some(e=>e.startsWith(field.name+' ')),kind+'/'+field.name+'/'+String(value));
    }
    for(const value of ['',null,undefined,'   '])assert.equal(fm.validateObservation(kind,{[field.name]:value},{}).props[field.name],null);
  }
});
test('controle preserva número importado inválido e convenção vazia até correção explícita',()=>{
  const field={name:'PROF_M',type:'N'};
  for(const value of ['abc',Infinity,NaN,false,[]]){
    const html=fm.__testControl(field,value);assert.match(html,/type="text"/);assert.match(html,/Valor importado inválido/);
  }
  assert.match(fm.__testControl(field,'2,5'),/type="number"[^>]*value="2.5"/);
  assert.match(fm.__testControl({name:'REF_ORIENT',type:'C'},''),/<option value="" selected>/);
  assert.match(fm.__testControl({name:'REF_ORIENT',type:'C'},'desconhecida'),/<option value="desconhecida" selected>/);
  assert.match(fm.__testControl({name:'DATA',type:'C'},'data antiga desconhecida'),/type="text"[^>]*value="data antiga desconhecida"/);
  assert.match(fm.__testControl({name:'DATA',type:'C'},'2026-02-30'),/type="text"/);
});
test('faixas e medidas físicas são validadas em todas as geometrias',()=>{
  for(const kind of ['acamamento','foliacao','xistosidade','fratura','veio','dique','zona-cisalhamento','falha']){
    assert.equal(fm.validateObservation(kind,{DIRECAO:25,MERGULHO:91,REF_ORIENT:'strike_rhr'},{}).status,'invalid');
    assert.equal(fm.validateObservation(kind,{DIRECAO:-1,MERGULHO:30,REF_ORIENT:'strike_rhr'},{}).status,'invalid');
    assert.equal(fm.validateObservation(kind,{DIRECAO:361,MERGULHO:30,REF_ORIENT:'strike_rhr'},{}).status,'invalid');
    assert.equal(fm.validateObservation(kind,{DIRECAO:360,MERGULHO:90,REF_ORIENT:'strike_rhr'},{}).props.DIRECAO,0);
  }
  for(const [kind,key] of [['fratura','ABERTURA'],['veio','ESP_M'],['dique','ESP_M'],['zona-cisalhamento','LARGURA_M'],
    ['sondagem','PROF_M'],['spt','NSPT'],['spt','NA_M'],['trincheira','COMPR_M'],['ponto-amostra','PROF_M'],['falha','REJEITO_M']])
    assert.ok(fm.validateObservation(kind,{[key]:-.1},{}).errors.some(e=>e.startsWith(key+' ')),kind+'/'+key);
  assert.ok(fm.validateObservation('spt',{NSPT:2.5},{}).errors.length);
  assert.equal(fm.validateObservation('sondagem',{ID_FURO:'F1',COTA_BOCA:-5,PROF_M:0,AZIMUTE:360,INCLINACAO:90},{}).status,'valid');
  for(const value of [-90,90.01,Infinity])assert.equal(fm.validateObservation('sondagem',{INCLINACAO:value},{}).status,'invalid');
  assert.equal(fm.validateObservation('dobra',{AZIMUTE:91,CAIMENTO:90.1},{}).status,'invalid');
});
test('campos mapeados são validados; status válido antigo não encobre erro atual',()=>{
  const L=layer('sondagem',{hole:'F1',deep:-12,angle:361,incl:-90},{ID_FURO:'hole',PROF_M:'deep',AZIMUTE:'angle',INCLINACAO:'incl'}),f=L.features[0];
  f._field={status:'valid'};
  const record=fm.fieldRecord(L,f,0);assert.equal(record.status,'invalid');
  assert.ok(record.meta.errors.some(e=>e.startsWith('PROF_M ')));
  assert.ok(record.meta.errors.some(e=>e.startsWith('AZIMUTE ')));
  assert.ok(record.meta.errors.some(e=>e.startsWith('INCLINACAO ')));
  assert.equal(f.props.deep,-12,'leitura não altera atributos importados');
  f._field={status:'valid',accuracyM:NaN};
  assert.ok(fm.fieldRecord(L,f,0).meta.errors.some(e=>e.startsWith('accuracyM ')),'metadado inválido não pode desaparecer na cópia');
  const mapped=layer('acamamento',{DIRECAO:0,MERGULHO:45,STRIKE:60,DIP:30},{DIRECAO:'ausente',MERGULHO:'DIP'},'strike_rhr');
  assert.equal(fm.fieldValue(mapped,mapped.features[0],'DIRECAO'),undefined,'mapeamento explícito ausente não usa DIRECAO de outro campo');
  assert.equal(fm.orientationOf(mapped,mapped.features[0]).valid,false);
});
test('orientação planar unificada usa mapeamento e convenção por feição antes da camada',()=>{
  const L=layer('acamamento',{bearing:90,inclination:40,convention:'dip_direction'},
    {DIRECAO:'bearing',MERGULHO:'inclination',REF_ORIENT:'convention'},'strike_rhr');
  const o=fm.orientationOf(L,L.features[0]);assert.equal(o.valid,true);assert.equal(o.type,'planar');
  assert.equal(o.strike,0);assert.equal(o.dipDirection,90);assert.equal(o.dip,40);assert.equal(o.plunge,null);
  L.features[0].props.convention='strike_rhr';assert.equal(fm.orientationOf(L,L.features[0]).strike,90);
  L.features[0].props.convention='errada';assert.equal(fm.orientationOf(L,L.features[0]).valid,false);
});
test('STRIKE/DIP e DIP_DIRECTION importados são inequívocos; DIRECAO sem convenção não é inventada',()=>{
  for(const [key,value,strike] of [['STRIKE',135,135],['DIPDIR',10,280],['DIP_DIRECTION',90,0]]){
    const L=layer('foliacao',{[key]:value,DIP:22});const o=fm.orientationOf(L,L.features[0]);
    assert.equal(o.valid,true,key);assert.equal(o.strike,strike);assert.equal(o.dip,22);
  }
  const ambiguous=layer('acamamento',{DIRECAO:25,MERGULHO:30});assert.equal(fm.orientationOf(ambiguous,ambiguous.features[0]).valid,false);
  assert.equal(fm.fieldRecord(ambiguous,ambiguous.features[0],0).status,'draft');
});
test('lineação e eixo usam trend/plunge sem conversão de 90 graus',()=>{
  for(const kind of ['lineacao','plunging','dobra']){
    const key=kind==='dobra'?'AZIMUTE':'DIRECAO',L=layer(kind,{trend:120,PLUNGE:35,REF_ORIENT:'dip_direction'},
      {[key]:'trend',CAIMENTO:'PLUNGE'}),o=fm.orientationOf(L,L.features[0]);
    assert.equal(o.valid,true);assert.equal(o.type,'linear');assert.equal(o.azimuth,120);assert.equal(o.plunge,35);
    assert.equal(o.strike,null);assert.equal(o.dip,null);
  }
});
test('campos vazios/inválidos não viram orientação zero; o norte e plano horizontal reais continuam válidos',()=>{
  for(const value of [null,'',undefined,NaN,Infinity,false,[],361,-1]){
    const L=layer('acamamento',{DIRECAO:value,MERGULHO:30,REF_ORIENT:'strike_rhr'}),o=fm.orientationOf(L,L.features[0]);
    assert.equal(o.valid,false,String(value));assert.equal(o.strike,null);assert.equal(o.direction,null);
  }
  const L=layer('acamamento',{DIRECAO:0,MERGULHO:0,REF_ORIENT:'strike_rhr'});
  assert.equal(fm.orientationOf(L,L.features[0]).valid,true);
  assert.equal(fm.orientationOf(L,L.features[0]).dip,0);
  const numeric=fm.validateObservation('veio',{DIRECAO:'25,5',MERGULHO:'12,5',ESP_M:'0,5',REF_ORIENT:'strike_rhr'},{});
  assert.equal(numeric.status,'valid');assert.equal(numeric.props.ESP_M,.5);
});
test('adoção não sobrescreve ID de origem usado como FID',()=>{
  const unsaved=layer('veio',{ID:'V-01',DIRECAO:25,MERGULHO:40,REF_ORIENT:'strike_rhr'});
  unsaved.fields=defs.veio.fields.map(f=>({...f}));
  assert.equal(fm.fieldValue(unsaved,unsaved.features[0],'FID'),undefined,'ficha sem FID não infere ID textual');
  assert.equal(fm.fieldRecord(unsaved,unsaved.features[0],0).status,'valid','validar ficha sem adoção não confunde identificação textual com FID');
  const L=layer('afloramento',{ID:842,CODIGO:'AFL-1'});delete L._geology;
  fm.adoptLayer(L,{kind:'afloramento'});
  assert.equal(L._geology.fieldMap.FID,'ID');assert.equal(L.features[0].props.ID,842);
  fm.adoptLayer(L,{kind:'afloramento'});assert.equal(L.features[0].props.ID,842);
  const text=layer('afloramento',{ID:'AFL-texto',CODIGO:'AFL-1'});delete text._geology;
  fm.adoptLayer(text,{kind:'afloramento'});
  assert.equal(text._geology.fieldMap.FID,'FID');assert.equal(text.features[0].props.FID,0);
  assert.equal(text.features[0].props.ID,'AFL-texto');assert.equal(text.features[0]._field.status,'valid');
  const explicit=layer('afloramento',{ID:'AFL-texto',CODIGO:'AFL-1'});delete explicit._geology;
  fm.adoptLayer(explicit,{kind:'afloramento',fieldMap:{FID:'ID',CODIGO:'CODIGO'}});
  assert.equal(explicit._geology.fieldMap.FID,'ID','mapeamento explícito é preservado, mesmo inválido');
  assert.equal(explicit.features[0].props.ID,'AFL-texto');assert.equal(explicit.features[0]._field.status,'invalid');
  const sameName=layer('afloramento',{FID:'ID-texto',CODIGO:'AFL-1'});delete sameName._geology;
  fm.adoptLayer(sameName,{kind:'afloramento'});
  assert.equal(sameName._geology.fieldMap.FID,'FID_GEO');assert.equal(sameName.features[0].props.FID,'ID-texto');
  assert.equal(sameName.features[0].props.FID_GEO,0);
});
test('datetime-local faz roundtrip em fusos distintos, preservando segundos e milissegundos',()=>{
  const before=process.env.TZ;
  try{
    for(const tz of ['UTC','America/Sao_Paulo','Australia/Adelaide','America/New_York']){
      process.env.TZ=tz;
      for(const iso of ['2026-09-21T12:34:56.789Z','2026-09-21T12:34:00.000Z','2026-11-01T06:30:00.000Z']){
        const local=fm.toLocalDateTime(iso);
        assert.equal(fm.fromLocalDateTime(local,iso),iso,tz+'/'+iso);
      }
    }
    process.env.TZ='America/Sao_Paulo';
    assert.equal(fm.toLocalDateTime('2026-09-21T12:34:56.789Z'),'2026-09-21T09:34:56.789');
    assert.equal(fm.fromLocalDateTime('2026-09-21T10:20'),'2026-09-21T13:20:00.000Z');
    assert.equal(fm.fromLocalDateTime('2026-02-30T10:20'),null);
    process.env.TZ='America/New_York';assert.equal(fm.fromLocalDateTime('2026-03-08T02:30'),null);
    assert.equal(fm.validateObservation('afloramento',{CODIGO:'F'},{observedAt:'inválido'}).status,'invalid');
  }finally{if(before===undefined)delete process.env.TZ;else process.env.TZ=before;}
});
test('ptStyleOf real usa atitude canônica e marcador neutro em observação incompleta',()=>{
  const source=read('src/core/parts/05-layer-model-symbology.js'),start=source.indexOf('function ptSizePx('),end=source.indexOf('/* SVG completo do símbolo',start);
  context.PT_SYMS={circle:{},sd_bed:{oriented:true,dip:true},lineation:{oriented:true,dip:true}};
  context.classOf=()=>null;vm.runInContext(source.slice(start,end),context);
  const L=layer('acamamento',{angle:90,incl:40,REF_ORIENT:'dip_direction'},{DIRECAO:'angle',MERGULHO:'incl'});
  let style=context.ptStyleOf(L,L.features[0]);assert.equal(style.rot,0);assert.equal(style.dip,'40');assert.equal(style.shape,'sd_bed');
  L.features[0].props.angle=null;style=context.ptStyleOf(L,L.features[0]);
  assert.equal(style.shape,'circle');assert.equal(style.rot,null);assert.equal(style.dip,null);
  const line=layer('lineacao',{DIRECAO:90,CAIMENTO:25});style=context.ptStyleOf(line,line.features[0]);
  assert.equal(style.rot,90);assert.equal(style.dip,'25');
  const ordinary=layer('acamamento',{DIRECAO:75,MERGULHO:15});delete ordinary._geology;
  style=context.ptStyleOf(ordinary,ordinary.features[0]);assert.equal(style.rot,75);assert.equal(style.dip,'15');
});
console.log(`Validação geológica: ${assertions} grupos de regressão aprovados.`);

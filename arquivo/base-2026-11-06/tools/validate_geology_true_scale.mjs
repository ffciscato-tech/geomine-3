import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const source=fs.readFileSync(new URL('../src/modules/geology/geological-sections.js',import.meta.url),'utf8'),
  require=createRequire(import.meta.url);
let nativeCanvas;
try{nativeCanvas=require('@napi-rs/canvas');}
catch{nativeCanvas=require(path.resolve(path.dirname(process.execPath),'../node_modules/@napi-rs/canvas'));}
const plain=value=>JSON.parse(JSON.stringify(value));
let checked=0;
async function check(name,run){await run();checked++;console.log('OK · '+name);}

function fixture(){
  const nodes=new Map(),downloads=[],strokes=[],texts=[];let html='',pen=[];
  function element(id,value=''){
    const e={id,value,checked:false,style:{},hidden:false,innerHTML:'',listeners:{},options:[],
      classList:{add(){},remove(){},toggle(){}},querySelector:()=>null,scrollIntoView(){},
      insertAdjacentHTML(_position,markup){
        this.innerHTML+=markup;
        for(const match of markup.matchAll(/<option\b[^>]*\bvalue="([^"]*)"[^>]*>([^<]*)<\/option>/g))
          this.options.push({value:match[1],textContent:match[2]});
      },
      addEventListener(type,fn){this.listeners[type]=fn;}};
    nodes.set(id,e);return e;
  }
  const cv=nativeCanvas.createCanvas(1100,420),native=cv.getContext('2d');cv.style={};
  const context=new Proxy(native,{
    get(target,key){const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;
      return(...args)=>{
        if(key==='beginPath')pen=[];
        if(key==='moveTo'||key==='lineTo')pen.push([key,...args]);
        if(key==='stroke')strokes.push({color:target.strokeStyle,width:target.lineWidth,pen:pen.map(p=>p.slice())});
        if(key==='fillText')texts.push(String(args[0]));
        return value.apply(target,args);
      };
    },set:(target,key,value)=>Reflect.set(target,key,value,target)
  });
  const canvas={style:cv.style,get width(){return cv.width;},set width(value){cv.width=value;},
    get height(){return cv.height;},set height(value){cv.height=value;},getContext:()=>context,
    toBlob(callback,type){assert.equal(type,'image/png');callback(new Blob([cv.toBuffer('image/png')],{type}));}};
  element('sideGeo').insertAdjacentHTML=(_position,value)=>{
    html=value;
    for(const match of value.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){
      const e=element(match[1],(match[0].match(/\bvalue="([^"]*)"/)||[])[1]||'');e.checked=/\bchecked\b/.test(match[0]);
    }
    nodes.set('gsecCanvas',canvas);
  };
  const c={window:{},S:{layers:[],rasters:[],workCRS:'EPSG:31982'},document:{readyState:'loading',
    addEventListener(){},querySelectorAll:()=>[],getElementById:id=>nodes.get(id)||null},
    console,setTimeout:()=>0,clearTimeout(){},URL,Blob,
    fromWGS:(_crs,x,y)=>[x,y],toWGS:(_crs,x,y)=>[x,y],reproj:(_from,_to,x,y)=>[x,y],
    toast(){},download:(blob,name)=>downloads.push({blob,name}),refreshUI(){},drawLayer(){},
    addLayer:layer=>{layer.id=100+c.S.layers.length;c.S.layers.push(layer);return layer;}};
  vm.createContext(c);vm.runInContext(source,c);
  const api=c.window.GeoMineGeology;
  return {c,api,nodes,downloads,strokes,texts,canvas,html:()=>html,open:()=>api.openSection()};
}
function resultFor(api,length,relief,ve=5){
  return {name:'Escala real',rasterName:'MDT',corridor:20,ve,met:api.__sectionTest.lineMetrics([[0,0],[length,0]]),
    profile:{dist:[0,length],pts:[[0,0],[length,0]],series:[{z:[100,100+relief]}]},
    runs:[],holes:[],contacts:[],faults:[],fractures:[],veins:[],shearzones:[],fieldMarks:[]};
}

await check('nova seção nasce em escala igual e não altera o exagero de outros perfis',()=>{
  const f=fixture();f.c.S.prof={ve:7,series:[{name:'Perfil topográfico'}]};const other=plain(f.c.S.prof);
  assert.equal(f.api.sectionSnapshot().section.ve,1);assert.equal(f.c.S.geology.section.ve,1);
  f.open();assert.equal(f.c.S.geology.section.ve,1);assert.deepEqual(plain(f.c.S.prof),other);
});
await check('restore de configuração legada 2×/5× normaliza só a escala da seção',()=>{
  for(const ve of [2,5]){
    const f=fixture(),input={version:2,activeId:'SEC-A',section:{name:'A–B geologia',rasterId:'mdt-1',corridor:75,ve,step:2.5,
      layerIds:['11','12'],roles:{11:'lithology',12:'fault'},snap:true,useField:false,fieldRadius:450,fieldDepth:230}},
      before=plain(input),layers=[{id:11,name:'Litologia',features:[{geom:[[1,2],[3,4]],props:{LITO:'Granito'}}]}];
    f.c.S.layers=layers;const layerCopy=plain(layers);
    assert.equal(f.api.sectionRestore(input),true);assert.deepEqual(plain(input),before,'não modificar o objeto do projeto importado');
    const out=plain(f.api.sectionSnapshot());assert.equal(out.section.ve,1);
    const expected=plain(input);expected.section.ve=1;expected.section.layerSelectionSet=true;assert.deepEqual(out,expected);
    assert.deepEqual(plain(f.c.S.layers),layerCopy,'não alterar camadas ou geometrias ao normalizar escala');
  }
});
await check('estado legado em memória não contorna normalização nem grava VE antigo',()=>{
  const f=fixture();f.c.S.geology={section:{id:'SEC-B',name:'Legada',line:[[0,0],[100,100]],lineWgs:[[0,0],[100,100]],
    rasterId:'r',corridor:30,ve:5,step:5,layerIds:['2'],roles:{2:'hole'},useField:true,fieldRadius:400,fieldDepth:100},sections:[]};
  const before=plain(f.c.S.geology.section);assert.equal(f.api.sectionSnapshot().section.ve,1);
  const after=plain(f.c.S.geology.section);delete before.ve;delete after.ve;delete after.snap;
  assert.deepEqual(after.projectSources,[]);assert.equal(after.geologyBase,null);
  assert.deepEqual(after.meshIds,[]);delete after.meshIds;
  assert.deepEqual(after.rasterProfiles,[]);assert.deepEqual(after.lineStyles,{});
  assert.equal(after.layerSelectionSet,true);delete after.layerSelectionSet;
  delete after.rasterProfiles;delete after.lineStyles;
  delete after.projectSources;delete after.geologyBase;assert.deepEqual(after,before);
  const saved=f.api.saveCurrent();assert.equal(saved.features[0].props.EXAG_V,1);assert.deepEqual(plain(saved.features[0].geom),[[0,0],[100,100]]);
  assert.equal(saved.features[0].props.NOME,'Legada');assert.equal(saved.features[0].props.CORREDOR,30);
});
await check('abrir seção vetorial legada ignora EXAG_V sem reescrever o arquivo carregado',()=>{
  for(const ve of [2,5]){
    const f=fixture(),L={id:9,name:'Seção antiga',gtype:'line',crs:'EPSG:31982',features:[{geom:[[0,0,100],[100,100,90]],multi:false,
      props:{GEOSEC_ID:'GSEC-OLD',NOME:'Corte histórico',CORREDOR:75,EXAG_V:ve,PASSO_M:2.5,MDT_ID:'r',CAMADAS:'11,12',
        PAPEIS:'{"11":"lithology","12":"fault"}',CAMPO_USO:0,RAIO_CAM:420,PROF_INT:250}}]};
    f.c.S.layers=[L];const before=plain(L);f.open();f.nodes.get('gsecSaved').listeners.change({target:{value:'GSEC-OLD'}});
    assert.equal(f.c.S.geology.section.ve,1);assert.deepEqual(plain(L),before);
    assert.deepEqual(plain(f.c.S.geology.section.line),before.features[0].geom);assert.equal(f.c.S.geology.section.fieldDepth,250);
    const saved=f.api.saveCurrent();assert.equal(saved,L);assert.equal(saved.features[0].props.EXAG_V,1);
    const props=plain(saved.features[0].props),expected=plain(before.features[0].props);expected.EXAG_V=1;expected.SEL_CAM=1;
    assert.deepEqual(props,expected);assert.deepEqual(plain(saved.features[0].geom),before.features[0].geom);
  }
});
await check('interface remove controle de exagero e mantém corredor/passo e aviso de escala',()=>{
  const f=fixture();f.open();assert.equal(f.nodes.has('gsecVE'),false);assert.doesNotMatch(f.html(),/id="gsecVE"/);
  assert.ok(f.nodes.has('gsecCorridor'));assert.ok(f.nodes.has('gsecStep'));
  assert.match(f.html(),/mesma escala horizontal e vertical|escala.*1:1/i);
  assert.doesNotMatch(source,/['"]gsecVE['"]/,'não manter leitura/listener oculto para o controle removido');
});
await check('renderização ignora VE antigo inclusive sob altura mínima/máxima sem alterar os dados',()=>{
  const f=fixture();f.open();
  for(const [length,relief] of [[10000,1],[100,300],[1000,150],[100,100]]){
    let reference;
    for(const ve of [.25,1,2,5,100]){
      const result=resultFor(f.api,length,relief,ve),before=plain(result);f.api.__sectionTest.drawSection(result);
      const geometry=plain(result.renderGeometry);assert.equal(geometry.xScale,geometry.yScale);assert.equal(geometry.ve,1);
      assert.ok(geometry.plotH>=250&&geometry.plotH<=760);assert.ok(geometry.plotW<=1004+1e-8);
      assert.ok(geometry.zMin<=100&&geometry.zMax>=100+relief);assert.equal(f.canvas.style.aspectRatio,'1100 / '+f.canvas.height);
      if(reference)assert.deepEqual(geometry,reference);else reference=geometry;
      const after=plain(result);delete after.renderGeometry;assert.deepEqual(after,before,'renderização não muda cotas, estações ou interpretação');
    }
  }
  assert.ok(f.texts.some(s=>s.includes('mesma escala horizontal e vertical')));
});
await check('PNG exportado conserva atitude 45° em pixels, mesmo com resultado legado VE=5',async()=>{
  const f=fixture();f.open();f.api.sectionSnapshot();const result=resultFor(f.api,100,0,5);
  result.faults=[{kind:'fault',station:20,z:100,interpretation:{endStation:70,endZ:50,apparentDip:45,confidence:'alta'}}];
  f.c.S.geology.section.result=result;f.c.S.geology.section.name='Plano 45';f.api.__sectionTest.drawSection(result);
  const path=f.strokes.find(s=>s.color.toLowerCase()==='#c62828'&&s.width===3&&s.pen.length===2);
  assert.ok(path,'traço principal interpretado presente no canvas');
  const [,x1,y1]=path.pen[0],[,x2,y2]=path.pen[1];assert.ok(Math.abs(Math.abs((y2-y1)/(x2-x1))-1)<1e-12);
  f.nodes.get('gsecPNG').listeners.click();assert.equal(f.downloads.length,1);
  const {blob,name}=f.downloads[0];assert.equal(blob.type,'image/png');assert.match(name,/\.png$/);
  const encoded=Buffer.from(await blob.arrayBuffer());assert.deepEqual([...encoded.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const decoded=await nativeCanvas.loadImage(encoded),cv=nativeCanvas.createCanvas(decoded.width,decoded.height),ctx=cv.getContext('2d');
  ctx.drawImage(decoded,0,0);const pixels=ctx.getImageData(0,0,cv.width,cv.height).data,points=[];
  for(let y=Math.ceil(y1+8);y<y2-8;y++)for(let x=Math.ceil(x1+8);x<x2-8;x++){
    const i=(y*cv.width+x)*4;if(pixels[i]>150&&pixels[i+1]<70&&pixels[i+2]<70&&pixels[i+3]>240)points.push([x,y]);
  }
  assert.ok(points.length>300,'PNG contém os pixels vermelhos da atitude, não somente metadados');
  const mx=points.reduce((s,p)=>s+p[0],0)/points.length,my=points.reduce((s,p)=>s+p[1],0)/points.length,
    xx=points.reduce((s,p)=>s+(p[0]-mx)**2,0),xy=points.reduce((s,p)=>s+(p[0]-mx)*(p[1]-my),0),
    angle=Math.atan(xy/xx)*180/Math.PI;
  assert.ok(Math.abs(angle-45)<.05,'ângulo no PNG = '+angle+'°');
  assert.equal(decoded.width,f.canvas.width);assert.equal(decoded.height,f.canvas.height);
});
console.log(`${checked} regressões de escala verdadeira de seções geológicas aprovadas.`);

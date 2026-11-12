const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../../core/parts/20-raster-dem.js'),'utf8');
function declaration(name,code=source){const start=code.indexOf('function '+name+'(');assert(start>=0,name);const end=code.indexOf('\n}',start);return code.slice(code.slice(start-6,start)==='async '?start-6:start,end+2);}
const names=['orthoColorReader','addRGBFromTIFF','ortoReligarTIFF','orthoWindow','buildOrthoTile','applyImgNoData','orthoCanvasFromURL','orthoMaskState','orthoMaskPreviewIdentity','orthoMaskOptions','orthoMaskKeep','orthoMaskForSave','orthoMaskRestore','orthoMaskRefreshUI','applyOrthoMask'];
// Values independently captured from the real Morro Verde YCbCr TIFF using
// vendored GeoTIFF.readRGB. The tests need no access to the user's file.
const soil={raw:[179,102,145],rgb:[203,176,133]},vegetation={raw:[175,89,126],rgb:[172,190,106]},white={raw:[255,128,128],rgb:[255,255,255]};
function fixture(sample=soil,{photometric=6,alpha,nd=null,overview}={}){
 const images=[],urls=new Map(),overlays=[],reads=[];let seq=0,imageGate=Promise.resolve();
 const pixels=(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)});
 class Canvas{constructor(){this.width=0;this.height=0;images.push(this);}getContext(){const cv=this;return {createImageData:pixels,getImageData(){return {width:cv.width,height:cv.height,data:cv.data.slice()};},drawImage(im){cv.data=im.image.data.slice();},putImageData(p,x=0,y=0){if(!cv.data)cv.data=new Uint8ClampedArray(cv.width*cv.height*4);for(let row=0;row<p.height;row++)cv.data.set(p.data.subarray(row*p.width*4,(row+1)*p.width*4),((row+y)*cv.width+x)*4);}};}toDataURL(){const url='data:image/png;synthetic,'+(++seq);urls.set(url,{width:this.width,height:this.height,data:this.data.slice()});return url;}}
 const controls={imgND:{checked:true},imgNDw:{value:250},imgNDb:{value:4},imgOp:{value:1}};
 function image(model,values){return {fileDirectory:{PhotometricInterpretation:model},getWidth:()=>4,getHeight:()=>4,getSamplesPerPixel:()=>alpha===undefined?3:4,getBoundingBox:()=>[0,0,4,4],getGDALNoData:()=>nd,getTileWidth:()=>4,getTileHeight:()=>4,async readRasters(options){reads.push(options);const n=(options.width||options.window[2]-options.window[0])*(options.height||options.window[3]-options.window[1]);return values.concat(alpha===undefined?[]:[alpha]).map(v=>new Uint8Array(n).fill(v));}};}
 const im=image(photometric,sample.raw),selected=overview?image(overview.photometric,overview.values):im,tiff={getImage:async()=>im,getImageCount:async()=>1};
 const S={projectId:'test',workCRS:'EPSG:31983',orthoDispFull:true},map={getPane:()=>({style:{}}),createPane:()=>({style:{}}),removeLayer(){},hasLayer:()=>true,unproject:({x,y})=>({lng:x*4/256,lat:4-y*4/256})};
 const L2={point:(x,y)=>({x,y}),imageOverlay(url,bounds){const o={url,bounds,addTo:()=>o,getBounds:()=>bounds,bringToBack(){},setUrl(v){o.url=v}};overlays.push(o);return o;}};
 class Image{set src(url){this.image=urls.get(url);this.naturalWidth=this.image?.width;this.naturalHeight=this.image?.height;imageGate.then(()=>this.image?this.onload?.():this.onerror?.());}}
 const c={console,S,map,L2,Image,document:{createElement:()=>new Canvas(),getElementById:id=>controls[id]||null},navigator:{userAgent:'iPad',platform:'MacIntel',maxTouchPoints:5},performance:{now:()=>1000},Uint8Array,Uint8ClampedArray,Uint16Array,Int16Array,Float64Array,Blob,AbortController,EH_MOVEL:true,
  setTimeout:(fn,delay)=>{if(!delay)queueMicrotask(fn);return 1},clearTimeout(){},ensureGeoTIFF:async()=>{},rasterImportOpen:async()=>tiff,rasterImportWait:async p=>p,rasterImportCheck(){},rasterImportRows:()=>4,
  showLoad(){},hideLoad(){},toast(){},cmdLog(){},registraOrtoParaDrape(){},syncOrthoTiles(){},orthoHDReset(){},orthoHDRefresh(){},refreshUI(){},safeFit(){},zApply(){},bufferFonte:async f=>f,
  toWGS:(crs,x,y)=>[x,y],fromWGS:(crs,x,y)=>[x,y],wgsBoundsOK:()=>true,warpCanvasWM:(cv,b)=>({cv,b,wm:false}),orthoCRS:()=>S.workCRS,orthoSemDadoLimiares:()=>({on:controls.imgND.checked,w:250,b:4}),
  GeoMineSessionAutosave:{state:{generation:1},markDirty(){}},
  GeoMineTileRuntime:{previewSize:(im,width,height)=>({width,height}),overview:async()=>({im:selected,fx:1,fy:1}),canReadResampled:()=>true,async read(image,options,control){const bands=await image.readRasters(options);if(control?.onPreviewBlock)control.onPreviewBlock({bands,xs:Array.from({length:options.width},(_,out)=>({out})),ys:Array.from({length:options.height},(_,out)=>({out}))});return bands;}}};
 c.window=c;vm.createContext(c);vm.runInContext(names.map(n=>declaration(n)).join('\n'),c);const workspace=fs.readFileSync(path.resolve(__dirname,'../../core/parts/11-geotiff-project-workspace.js'),'utf8');vm.runInContext(['projectNativeHash','projectNativePreview','projectNativeForSave','projectNativeContext'].map(n=>declaration(n,workspace)).join('\n'),c);vm.runInContext(fs.readFileSync(path.join(__dirname,'orthophoto-first-frame.js'),'utf8'),c);
 const file=new Blob([new Uint8Array(8)]);Object.defineProperty(file,'name',{value:'ortho.tif'});
 return {c,S,im,tiff,file,urls,overlays,images,controls,reads,Canvas,delayImages(p){imageGate=p;}};
}
function firstPixel(data){return Array.from(data.subarray(0,4));}
function assertRGBA(data,rgb,a=255){assert.deepEqual(firstPixel(data),rgb.concat(a));}

test('real YCbCr vectors match readRGB, clamp edges, and reuse one tiny output buffer',()=>{
 const q=fixture(),read=q.c.orthoColorReader(q.im),out=read(...soil.raw);assert.deepEqual(Array.from(out),soil.rgb);assert.equal(read(...vegetation.raw),out);assert.deepEqual(Array.from(out),vegetation.rgb);assert.deepEqual(Array.from(read(...white.raw)),white.rgb);assert.deepEqual(Array.from(read(0,128,128)),[0,0,0]);assert.deepEqual(Array.from(read(255,255,255)),[255,121,255]);
});
test('RGB, 16-bit RGB and images without photometric metadata retain their color values',()=>{
 const q=fixture();for(const im of [{fileDirectory:{PhotometricInterpretation:2}},{}]){const read=q.c.orthoColorReader(im);assert.deepEqual(Array.from(read(30,90,210)),[30,90,210]);assert.deepEqual(Array.from(read(7710,23130,53970,1/257)),[30,90,210]);}
});
test('import and progressive first frame render YCbCr in natural RGB and preserve raw channels',async()=>{
 const q=fixture();await q.c.addRGBFromTIFF(q.file);assertRGBA(q.S.img._id.data,soil.rgb);assertRGBA(q.S.img._prevID.data,soil.rgb);const progressive=q.urls.get(q.overlays[0].url);assertRGBA(progressive.data,soil.rgb);assert.equal(q.S.img._img0,q.im);const raw=await q.im.readRasters({window:[0,0,1,1]});assert.deepEqual(raw.map(b=>b[0]),soil.raw);
});
test('YCbCr white border becomes transparent; disabling border cut retains true white',async()=>{
 const q=fixture(white);await q.c.addRGBFromTIFF(q.file);assertRGBA(q.S.img._id.data,white.rgb);assertRGBA(q.S.img._prevID.data,white.rgb,0);assert.equal(q.S.img._ndPct,100);q.controls.imgND.checked=false;q.c.applyImgNoData();assertRGBA(q.S.img._prevID.data,white.rgb);
});
test('relink rebuilds the saved preview through the same YCbCr conversion',async()=>{
 const q=fixture(vegetation);q.S.img={name:'saved ortho',b:[0,0,4,4],url:'old-preview',visible:true};assert.equal(await q.c.ortoReligarTIFF(q.file),true);assertRGBA(q.S.img._id.data,vegetation.rgb);assertRGBA(q.S.img._prevID.data,vegetation.rgb);
});
test('native tiles and Layout use converted RGB and discard the white background',async()=>{
 for(const sample of [soil,vegetation,white]){const q=fixture(sample);await q.c.addRGBFromTIFF(q.file);const cv=new q.Canvas();cv.width=4;cv.height=4;assert.equal(await q.c.buildOrthoTile(cv,{x:0,y:0,z:0},4,false),'native');const output=await q.c.orthoWindow(q.S.img.b,4),layout=q.urls.get(output.dataURL);if(sample===white){assert.equal(firstPixel(cv.data)[3],0);assertRGBA(layout.data,white.rgb,0);}else{assertRGBA(cv.data,sample.rgb);assertRGBA(layout.data,sample.rgb);}}
});
test('RGB overviews of a YCbCr base are not converted a second time',async()=>{
 const q=fixture(soil,{overview:{photometric:2,values:soil.rgb}});await q.c.addRGBFromTIFF(q.file);assertRGBA(q.S.img._id.data,soil.rgb);const cv=new q.Canvas();cv.width=4;cv.height=4;await q.c.buildOrthoTile(cv,{x:0,y:0,z:0},4,false);assertRGBA(cv.data,soil.rgb);const out=await q.c.orthoWindow(q.S.img.b,4);assertRGBA(q.urls.get(out.dataURL).data,soil.rgb);
});
test('alpha and declared NoData remain evaluated on stored samples',async()=>{
 for(const options of [{alpha:0},{nd:179}]){const sample=options.nd===179?{raw:[179,179,179],rgb:[250,125,255]}:soil,q=fixture(sample,options);await q.c.addRGBFromTIFF(q.file);assert.equal(firstPixel(q.S.img._id.data)[3],0);}
});

function savedPreview(q){
 const cv=new q.Canvas();cv.width=4;cv.height=4;const p=cv.getContext('2d').createImageData(4,4);
 for(let i=0;i<16;i++)p.data.set([203,176,133,255],i*4);p.data.set([255,255,255,255],0);p.data.set([0,0,0,255],4);p.data[11]=0;
 cv.getContext('2d').putImageData(p,0,0);const url=cv.toDataURL(),ll=[[-20,-45],[-19,-44]];
 const I={url,b:[0,0,4,4],_llbounds:ll,_warpWM:true,_w:4,_h:4,visible:true,overlay:q.c.L2.imageOverlay(url,ll),_workPreviewURL:'old-layout-cache'};
 q.S.img=I;return {I,url,original:p.data.slice()};
}
test('saved WM preview masks white/black reversibly without promotion, warp or georeference change',async()=>{
 const q=fixture(),{I,url,original}=savedPreview(q),b=JSON.stringify([I.b,I._llbounds]),identity=q.c.projectNativePreview(I,'ortho');
 I.projectNativeSource={v:1,preview:identity,fingerprint:'original-bytes'};q.c.warpCanvasWM=()=>{throw Error('WM preview must not be warped again')};
 const cut=await q.c.applyOrthoMask();assert.equal(cut.cut,3);assert.equal(I._id,undefined);assert.equal(I._img0,undefined);assert.equal(I._prevGrid,'mercator');assert.equal(I._workPreviewURL,null);assert.equal(JSON.stringify([I.b,I._llbounds]),b);assert.equal(I._warpWM,true);assert.equal(I._prevID.data[3],0);assert.equal(I._prevID.data[7],0);assert.equal(I._prevID.data[11],0);assert.equal(q.c.projectNativePreview(I,'ortho'),identity);assert.equal(q.c.projectNativeForSave(I,'ortho').fingerprint,'original-bytes');
 q.controls.imgND.checked=false;await q.c.applyOrthoMask();assert.equal(I.url,url);assert.deepEqual(I._prevID.data,original);assert.equal(JSON.stringify([I.b,I._llbounds]),b);assert.equal(q.c.projectNativePreview(I,'ortho'),identity);
});
test('save/restore stores only base URL and options, retains binding and can undo after reopen',async()=>{
 const q=fixture(),{I,url,original}=savedPreview(q),identity=q.c.projectNativePreview(I,'ortho');await q.c.applyOrthoMask();const data=JSON.parse(JSON.stringify(q.c.orthoMaskForSave(I)));
 assert.deepEqual(Object.keys(data).sort(),['v','baseURL','grid','identity','enabled','w','b'].sort());assert.equal(data.baseURL,url);assert.equal(data.identity,identity);
 const reopened={url:I.url,b:I.b.slice(),_llbounds:JSON.parse(JSON.stringify(I._llbounds)),_warpWM:true,visible:true,projectNativeSource:{v:1,preview:identity}};q.S.img=reopened;
 assert(q.c.orthoMaskRestore(reopened,data));assert.equal(reopened._visualMask.pixels,null);assert.equal(q.c.projectNativePreview(reopened,'ortho'),identity);assert(q.c.projectNativeForSave(reopened,'ortho'));
 q.controls.imgND.checked=false;await q.c.applyOrthoMask();assert.equal(reopened.url,url);assert.deepEqual(reopened._prevID.data,original);
 q.controls.imgNDw.value=123;q.controls.imgNDb.value=77;q.c.orthoMaskRestore(reopened,null);assert.equal(q.controls.imgND.checked,true);assert.equal(q.controls.imgNDw.value,250);assert.equal(q.controls.imgNDb.value,4);assert.equal(reopened._visualMask,undefined);
});
test('external preview replacement cannot retain a masked source identity',async()=>{
 const q=fixture(),{I}=savedPreview(q),identity=q.c.projectNativePreview(I,'ortho');await q.c.applyOrthoMask();I.url='data:image/png;base64,different';assert.equal(q.c.orthoMaskForSave(I),null);assert.notEqual(q.c.projectNativePreview(I,'ortho'),identity);
});
test('project, image, URL, geometry and request changes discard asynchronous mask decoding',async()=>{
 for(const mode of ['project','generation','image','url','bounds','request','native-image']){
  const q=fixture(),{I,url}=savedPreview(q);let release;const gate=new Promise(r=>release=r);q.delayImages(gate);const pending=q.c.applyOrthoMask(),rejected=assert.rejects(pending,e=>e.name==='AbortError');
  if(mode==='project')q.S.projectId='other';if(mode==='generation')q.c.GeoMineSessionAutosave.state.generation++;if(mode==='image')q.S.img={};if(mode==='url')I.url='replacement';if(mode==='bounds')I.b=[1,1,5,5];if(mode==='request')I._visualMaskRequest++;if(mode==='native-image')I._img0={};
  release();await rejected;assert.equal(I._visualMask,undefined);if(mode!=='url')assert.equal(I.url,url);
 }
});
test('header-only restore keeps editable preview and does not decode TIFF to change its mask',async()=>{
 const q=fixture(),{I,url}=savedPreview(q);let refreshed=0,modalRefresh=0;q.c.refreshUI=()=>refreshed++;q.controls.imgModal={classList:{contains:()=>true}};q.c.openImgProps=()=>modalRefresh++;
 assert.equal(await q.c.ortoReligarTIFF(q.file,{restoreNative:true}),true);assert.equal(I._id,undefined);assert.equal(I._img0,q.im);assert.equal(q.reads.length,0);assert.equal(q.c.orthoMaskForSave(I).baseURL,url);assert.equal(I._prevID.data[3],0);assert.equal(I._prevID.data[7],0);assert(refreshed>0&&modalRefresh>0);
 q.controls.imgND.checked=false;await q.c.applyOrthoMask();assert.equal(I.url,url);assert.equal(q.reads.length,0);assert(I._tiff&&I._img0);
});
test('native mask persists uncut source pixels even if the initial preview was already cropped',async()=>{
 const q=fixture(white);await q.c.addRGBFromTIFF(q.file);const I=q.S.img,identity=q.c.projectNativePreview(I,'ortho');assert.equal(I._prevID.data[3],0);
 await q.c.applyOrthoMask();const mask=JSON.parse(JSON.stringify(q.c.orthoMaskForSave(I)));assert.equal(mask.grid,'source');assert.equal(mask.identity,identity);
 const reopened={url:I.url,b:I.b.slice(),_llbounds:I._llbounds,_warpWM:I._warpWM,visible:true};q.S.img=reopened;assert(q.c.orthoMaskRestore(reopened,mask));q.controls.imgND.checked=false;await q.c.applyOrthoMask();assertRGBA(reopened._prevID.data,white.rgb,255);assert.equal(q.c.projectNativePreview(reopened,'ortho'),identity);
});
test('full relink clears obsolete preview base, defers recursive adoption and returns true with native source',async()=>{
 const q=fixture(),{I}=savedPreview(q);await q.c.applyOrthoMask();let remembered=false;
 q.c.GeoMineOriginalSources={validated(){},async rememberFile(item,kind,file,options){assert.equal(item,I);assert.equal(kind,'ortho');assert.equal(file,q.file);assert.equal(options.deferLocalHandoff,true);remembered=true;}};
 assert.equal(await q.c.ortoReligarTIFF(q.file),true);assert(remembered);assert.equal(I._visualMask,undefined);assert.equal(I._img0,q.im);assert.equal(I._tiff,q.tiff);assertRGBA(I._id.data,soil.rgb);assert(q.S.orthoHD);
});
test('relink completion rejects changed project, generation, selected image or newer source request',async()=>{
 for(const mode of ['project','generation','image','source']){
  const q=fixture(),{I}=savedPreview(q);let enter,release;const arrived=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
  q.c.GeoMineOriginalSources={validated(){},async rememberFile(){enter();await gate;}};
  const pending=q.c.ortoReligarTIFF(q.file);await arrived;if(mode==='project')q.S.projectId='other';if(mode==='generation')q.c.GeoMineSessionAutosave.state.generation++;if(mode==='image')q.S.img={};if(mode==='source')I._nativeRelinkRequest++;
  release();assert.equal(await pending,false);
 }
});

test('native source context tolerates a derived mask but rejects replacement bytes or arbitrary preview',async()=>{
 const q=fixture(),{I}=savedPreview(q);I._sourceRaw={native:true};const guard=q.c.projectNativeContext(I,'ortho');await q.c.applyOrthoMask();assert(guard());I._sourceRaw={native:'different'};assert(!guard());I._sourceRaw=undefined;
 const second=q.c.projectNativeContext(I,'ortho');I.url='data:image/png;base64,foreign';assert(!second());
});
test('header-only UI refresh never reopens a closed modal',async()=>{
 const q=fixture();savedPreview(q);let opened=0;q.controls.imgModal={classList:{contains:()=>false}};q.c.openImgProps=()=>opened++;assert(await q.c.ortoReligarTIFF(q.file,{restoreNative:true}));assert.equal(opened,0);
});

test('header relink retains external cancellation through preview decoding and commits nothing after cancellation',async()=>{
 const q=fixture(),{I,url}=savedPreview(q);let release,allowed=true;const gate=new Promise(r=>release=r);q.delayImages(gate);
 const pending=q.c.ortoReligarTIFF(q.file,{restoreNative:true,isCurrent:()=>allowed});
 // Header I/O crosses several microtasks before the image decode waits.
 for(let i=0;i<20;i++)await Promise.resolve();allowed=false;release();assert.equal(await pending,false);assert.equal(I.url,url);assert.equal(I._img0,undefined);assert.equal(I._tiff,undefined);assert.equal(I._visualMask,undefined);
});
test('header relink honors projectNativeContext until its atomic source commit',async()=>{
 const q=fixture(),{I}=savedPreview(q),guard=q.c.projectNativeContext(I,'ortho');assert(guard());assert.equal(await q.c.ortoReligarTIFF(q.file,{restoreNative:true,isCurrent:guard}),true);assert.equal(I._img0,q.im);assert.equal(I._prevID.data[3],0);assert.equal(I._sourceRaw,q.file);
});

function sourceUI(q){
 q.c.document.readyState='loading';q.c.document.addEventListener=()=>{};
 vm.runInContext(fs.readFileSync(path.join(__dirname,'source-properties.js'),'utf8'),q.c);
 return q.c.GeoMineRasterSourceUI;
}
test('full relink adopts the verified device copy without cancelling its own request',async()=>{
 const q=fixture(),{I}=savedPreview(q),localFile=new Blob([new Uint8Array(8)]);let remembered=0,adopted=0;
 const local={file:localFile,descriptor:{id:'verified-device-copy'}};
 q.c.GeoMineOriginalSources={validated(){},async rememberFile(){remembered++;return true;},async resolve(){return local;},adopt(item,kind,value){assert.equal(item,I);assert.equal(value,local);adopted++;return true;}};
 sourceUI(q);assert.equal(await q.c.ortoReligarTIFF(q.file),true);
 assert.equal(remembered,1);assert.equal(adopted,1);assert.equal(I._nativeRelinkRequest,1);assert.equal(I._sourceRaw,localFile);assert.equal(I._deviceSourceId,local.descriptor.id);assert.equal(I._img0,q.im);
});
test('a local handoff cannot supersede a newer request or source during storage lookup',async()=>{
 for(const mode of ['request','source','project']){
  const q=fixture(),{I}=savedPreview(q);I._nativeRelinkRequest=3;I._sourceRaw=q.file;I._tiff=q.tiff;I._img0=q.im;
  let release;const gate=new Promise(r=>release=r);let adopted=0;
  q.c.GeoMineOriginalSources={async resolve(){await gate;return {file:new Blob(['local']),descriptor:{id:'device'}};},adopt(){adopted++;}};
  const pending=sourceUI(q).preferLocal(I);
  if(mode==='request')I._nativeRelinkRequest++;if(mode==='source')I._sourceRaw=new Blob(['new']);if(mode==='project')q.S.projectId='other';
  const expected=I._sourceRaw;release();assert.equal(await pending,false);assert.equal(adopted,0);assert.equal(I._sourceRaw,expected);
 }
});
test('a stale or non-header handoff token is rejected before reading the file',async()=>{
 const q=fixture(),{I}=savedPreview(q);I._nativeRelinkRequest=5;let opened=0;q.c.rasterImportOpen=async()=>{opened++;return q.tiff;};
 assert.equal(await q.c.ortoReligarTIFF(q.file,{restoreNative:true,handoffRequest:4}),false);
 assert.equal(await q.c.ortoReligarTIFF(q.file,{handoffRequest:5}),false);
 assert.equal(opened,0);assert.equal(I._nativeRelinkRequest,5);assert.equal(I._img0,undefined);
});
test('verified same-source recovery refreshes fallback tiles and restores both native flags',async()=>{
 const q=fixture(),{I}=savedPreview(q);I._sourceRaw=q.file;I._tiff=q.tiff;I._img0=q.im;
 q.S.orthoHD=false;q.S.orthoDispFull=false;q.c._orthoGrid={_fallbackHole:true,_nativeError:'provider interrupted'};
 let resets=0,syncs=0;q.c.orthoHDReset=()=>resets++;q.c.syncOrthoTiles=()=>syncs++;
 q.c.GeoMineOriginalSources={async resolve(){return {file:q.file,descriptor:{id:'same'}};}};
 assert.equal(await sourceUI(q).preferLocal(I),true);assert.equal(resets,1);assert.equal(syncs,1);assert(q.S.orthoHD&&q.S.orthoDispFull);
});

const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const input=path.resolve(process.argv[2]||'input/BLOCASA.ccmgis');
 const expected=JSON.parse(fs.readFileSync(input));
 try{
  for(const mode of ['desktop','android','transient','permanent']){
   const context=await browser.newContext({viewport:{width:1400,height:950},...(mode!=='desktop'?{hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; SM-X610) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'}:{})});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await page.route(/^https?:/,r=>r.abort());await page.goto('file://'+path.resolve('dist/GeoMine.html'));
   await page.waitForFunction(()=>typeof loadProject==='function'&&window.GeoMineProjectReader);
   await page.evaluate(mode=>{
    S.projectId='SENTINELA';S.auto.name='anterior.ccmgis';
    window.__readDone=false;window.__log=[];window.__calls=0;window.__loads=0;
    const originalLog=cmdLog;cmdLog=(m,...a)=>{__log.push(m);return originalLog(m,...a);};
    const originalToast=toast;toast=(m,...a)=>{__log.push(m);return originalToast(m,...a);};
    const load=loadProject;loadProject=(...a)=>{__loads++;return load(...a);};
    const read=readProjectFileCompat;readProjectFileCompat=async(...a)=>{try{return await read(...a);}finally{__readDone=true;}};
    if(mode==='transient'||mode==='permanent'){
     const Native=FileReader;
     window.FileReader=class extends Native{
      readAsArrayBuffer(b){__calls++;if(mode==='permanent'||__calls<=2)throw new DOMException('The requested file could not be read, typically due to permission problems','NotReadableError');return super.readAsArrayBuffer(b);}
      readAsText(b,...a){if(mode==='permanent')throw new DOMException('The requested file could not be read','NotReadableError');return super.readAsText(b,...a);}
     };
     if(mode==='permanent'){
      File.prototype.stream=function(){throw new DOMException('The requested file could not be read','NotReadableError');};
      File.prototype.text=async function(){throw new DOMException('The requested file could not be read','NotReadableError');};
     }
    }
   },mode);
   // Headless automation does not expose the native desktop FS Access picker.
   // Exercise that handle branch in validate_manual_project_saving; here use
   // the file input directly on desktop and the actual Abrir click on Android.
   if(mode==='desktop')await page.locator('#projIn').setInputFiles(input);
   else {const choose=page.waitForEvent('filechooser');await page.locator('.rbtn').filter({hasText:/^Abrir$/}).first().click();await (await choose).setFiles(input);}
   await page.waitForFunction(()=>__readDone&&document.getElementById('projIn').value==='',{},{timeout:20000});
   const result=await page.evaluate(()=>({projectId:S.projectId,name:S.auto.name,loads:__loads,calls:__calls,
    counts:S.layers.map(l=>l.features.length),log:__log}));
   if(mode==='permanent'){
    assert.equal(result.projectId,'SENTINELA');assert.equal(result.name,'anterior.ccmgis');assert.equal(result.loads,0);
    assert.ok(result.log.some(m=>String(m).includes('novamente no Drive')));
    assert.ok(!result.log.includes('■ concluído'));
   }else{
    assert.equal(result.projectId,expected.projectId);assert.deepEqual(result.counts,expected.layers.map(l=>l.features.length));assert.equal(result.loads,1);
    assert.equal(result.name,path.basename(input));
   }
   assert.deepEqual(errors,[]);console.log('PASS '+mode,JSON.stringify(result));await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

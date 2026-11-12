// Standalone renderer pixels in a fresh Chrome profile, no network/user data.
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage();await page.route(/^https?:/,route=>route.abort());await page.setContent('<!doctype html><title>Mesh depth test</title>');
    await page.evaluate(()=>{window.S={layers:[],geology:{meshes:[]}};window.GeoMineGeology={meshes:{getWorkMesh:id=>S.geology.meshes.find(m=>m.id===id)}};});
    await page.addScriptTag({content:fs.readFileSync(path.resolve(__dirname,'../src/modules/geology/mesh-rendering.js'),'utf8')});
    const pixels=await page.evaluate(async()=>{
      const api=GeoMineGeology.meshViews,upper=[[0,0,100],[10,0,100],[0,10,100]],lower=[[0,0,10],[10,0,10],[0,10,-80]];
      async function render(vertices,faces,options={}){
        const id='mesh-'+Math.random(),m={id,crs:'EPSG:31982',vertices,faces},L={name:id,visible:true,features:[],
          sym:{color:'#ff0000',fill:1,opacity:options.opacity??1,weight:1},_geology:{kind:'surpac-mesh',meshId:id,meshRole:'surface'}};
        S.geology.meshes.push(m);S.layers.push(L);
        const mm=options.wide?609.6:25.4,svg=api.renderLayout(L,{x:0,y:0,width:mm,height:25.4,x0:0,y0:0,x1:10,y1:10,dpi:100}),
          image=new Image();image.src=svg.match(/href="([^"]+)"/)[1];await image.decode();
        const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
        const sample=(x,y)=>Array.from(ctx.getImageData(Math.floor(x*c.width),Math.floor(y*c.height),1,1).data);
        return {inside:sample(.2,.8),outside:sample(.9,.1),center:sample(.5,.5),left:sample(.2,.5),right:sample(.9,.5),
          atTile:sample(2048/c.width,.8),width:c.width,height:c.height};
      }
      const upperOnly=await render(upper,[[0,1,2]]),lowerOnly=await render(lower,[[0,1,2]]),
        frontThenBack=await render([...upper,...lower],[[0,1,2],[3,4,5]]),backThenFront=await render([...upper,...lower],[[3,4,5],[0,1,2]]),
        transparentUpper=await render(upper,[[0,1,2]],{opacity:.35}),transparentCombined=await render([...upper,...lower],[[0,1,2],[3,4,5]],{opacity:.35});
      const ring=await render([[0,0,100],[10,0,100],[10,10,100],[0,10,100],[3,3,100],[7,3,100],[7,7,100],[3,7,100]],
        [[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]]);
      const tiled=await render([[0,0,100],[10,0,100],[10,10,100],[0,10,100]],[[0,1,2],[0,2,3]],{wide:true});
      return {upperOnly,lowerOnly,frontThenBack,backThenFront,transparentUpper,transparentCombined,ring,tiled};
    });
    assert.ok(pixels.upperOnly.inside[3]>250);assert.equal(pixels.upperOnly.outside[3],0);
    assert.notDeepEqual(pixels.lowerOnly.inside,pixels.upperOnly.inside,'fixture lighting must distinguish the lower face');
    assert.deepEqual(pixels.frontThenBack.inside,pixels.upperOnly.inside,'z-buffer must hide lower faces drawn later');
    assert.deepEqual(pixels.backThenFront.inside,pixels.upperOnly.inside,'face order must not change visible surface');
    assert.deepEqual(pixels.transparentCombined.inside,pixels.transparentUpper.inside,'layer opacity must not stack hidden back faces');
    assert.equal(pixels.ring.center[3],0,'hole must remain transparent');assert.ok(pixels.ring.left[3]>250);
    assert.ok(pixels.tiled.width>2048);assert.ok(pixels.tiled.atTile[3]>250);assert.deepEqual(pixels.tiled.right,pixels.tiled.left,'tiled rasterizer must preserve coordinates across GPU tiles');
    console.log('OK · Chrome real: faces superiores, ordem independente, opacidade sem acúmulo, cavidade vazia e tiles do Layout.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

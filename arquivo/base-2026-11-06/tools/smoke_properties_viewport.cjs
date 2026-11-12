// Browser regression: synthetic layer, isolated session, no user projects.
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ids=['lpApply','lpAttr','lpZoom','lpSave','lpDel'];
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    for(const touch of [false,true]){
      const page=await browser.newPage({viewport:{width:1280,height:720},hasTouch:touch,isMobile:touch});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route(/^https?:/,r=>r.abort());
      await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'));
      await page.waitForFunction(()=>window.GeoMineGeology?.createOrActivate);
      await page.evaluate(()=>{
        window.__propsLayer=GeoMineGeology.createOrActivate('sondagem');
        openLayerProps(__propsLayer);
      });
      const geometry=()=>page.evaluate(ids=>{
        const rect=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};};
        const modal=document.querySelector('#lpModal>.modal'),body=modal.querySelector('.modal-b'),footer=modal.querySelector('.lp-actions');
        return {viewport:{top:visualViewport.offsetTop,bottom:visualViewport.offsetTop+visualViewport.height},modal:rect(modal),body:rect(body),footer:rect(footer),
          scroll:body.scrollTop,scrollHeight:body.scrollHeight,clientHeight:body.clientHeight,
          footerOutsideBody:footer.parentElement===modal,
          buttons:ids.map(id=>({id,...rect(document.getElementById(id))}))};
      },ids);
      function check(g,label){
        assert.ok(g.footerOutsideBody,label+': actions must not scroll with fields');
        assert.ok(g.modal.top>=g.viewport.top,label+': modal above visible viewport');
        assert.ok(g.modal.bottom<=g.viewport.bottom-5,label+': modal clipped below viewport');
        assert.ok(g.body.height>0,label+': content must remain scrollable');
        assert.ok(g.body.bottom<=g.footer.top+1,label+': fields overlap footer');
        for(const button of g.buttons){
          assert.ok(button.top>=g.footer.top&&button.bottom<=g.modal.bottom,label+': clipped '+button.id);
          assert.ok(button.left>=g.modal.left&&button.right<=g.modal.right,label+': horizontal overflow '+button.id);
          if(touch)assert.ok(button.height>=44,label+': touch target too small '+button.id);
        }
      }
      for(const size of [{width:1280,height:720},{width:1024,height:600},{width:800,height:1100},{width:600,height:800},{width:1440,height:900},{width:1024,height:360}]){
        await page.setViewportSize(size);
        await page.waitForTimeout(60);
        let g=await geometry();check(g,JSON.stringify({touch,...size}));
        await page.locator('#lpModal .modal-b').evaluate(e=>e.scrollTop=e.scrollHeight);
        const after=await geometry();check(after,'scrolled');
        assert.equal(after.footer.top,g.footer.top,'footer must stay fixed when scrolling');
        assert.ok(after.scroll>0,'properties content must scroll');
        await page.locator('#lpModal .modal-b').evaluate(e=>e.scrollTop=0);
      }
      await page.setViewportSize({width:1280,height:720});
      // Real touch input, not just scrollTop, must scroll the field body.
      if(touch){
        const cdp=await page.context().newCDPSession(page),g=await geometry();
        const x=(g.body.left+g.body.right)/2,y=g.body.bottom-25;
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
        for(let n=1;n<=6;n++){
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-n*24}]});
          await page.waitForTimeout(20);
        }
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await page.waitForTimeout(150);
        assert.ok((await geometry()).scroll>30,'finger gesture must scroll properties');
        await cdp.detach();
      }
      // Mimic Android keyboard/browser bars reducing only the visual viewport.
      for(const viewport of [{height:540,offsetTop:0},{height:280,offsetTop:0},{height:320,offsetTop:90}]){
        await page.evaluate(v=>{
          for(const [key,value] of Object.entries(v))Object.defineProperty(visualViewport,key,{configurable:true,value});
          visualViewport.dispatchEvent(new Event(v.offsetTop?'scroll':'resize'));
        },viewport);
        check(await geometry(),'visual viewport '+JSON.stringify(viewport));
      }
      await page.evaluate(()=>{
        delete visualViewport.height;delete visualViewport.offsetTop;
        visualViewport.dispatchEvent(new Event('resize'));
        document.querySelector('#lpModal .modal-b').scrollTop=0;
      });
      // All tabs retain their footer. Applying/closing still use original handlers.
      for(const tab of ['lbl','flt','sym']){
        await page.locator('#lpModal [data-lpt="'+tab+'"]').click();
        check(await geometry(),'tab '+tab);
      }
      await page.locator('#lpApply').click();
      assert.equal(await page.evaluate(()=>lpLayer===__propsLayer),true);
      await page.evaluate(()=>{document.querySelector('#toast')?.classList.remove('on');});
      for(const id of ids){
        const hit=await page.locator('#'+id).evaluate(e=>{
          const r=e.getBoundingClientRect(),hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);
          return e===hit||e.contains(hit);
        });
        assert.ok(hit,id+': must be reachable, not covered');
      }
      if(process.env.GEOMINE_SCREENSHOT&&touch)await page.screenshot({path:process.env.GEOMINE_SCREENSHOT});
      await page.locator('#lpClose').click();
      assert.equal(await page.locator('#lpModal').isVisible(),false);
      assert.deepEqual(errors,[],'uncaught browser errors');
      console.log('PASS properties: '+(touch?'tablet/touch':'desktop')+'; sizes, rotation, keyboard, tabs and actions');
      await page.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

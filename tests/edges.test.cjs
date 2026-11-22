const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {test}=require('node:test');
const {chromium}=require('playwright');

test('select, trim and erase edge pixels from the surrounding workspace', {timeout:90000}, async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined});
  try{
    const page=await browser.newPage({viewport:{width:1480,height:940},deviceScaleFactor:1.5});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.PANEL_EXTRACT_URL||pathToFileURL(path.resolve(__dirname,'../docs/index.html')).href);
    const source=await page.evaluate(()=>{
      const c=document.createElement('canvas');c.width=240;c.height=160;
      const ctx=c.getContext('2d');ctx.fillStyle='#234f75';ctx.fillRect(0,0,c.width,c.height);
      return c.toDataURL().split(',')[1];
    });
    await page.locator('#importFile').setInputFiles({name:'edge.png',mimeType:'image/png',buffer:Buffer.from(source,'base64')});
    await page.waitForFunction(()=>!document.querySelector('#imageDesk').hidden&&!document.querySelector('#openBtn').disabled);
    const tool=(group,label)=>page.locator(group).getByRole('button',{name:label,exact:true}).click();
    const history=()=>page.evaluate(()=>PanelEditor.snapshot().history.length);
    const box=()=>page.evaluate(()=>{const s=PanelEditor.snapshot();return PanelOutput.bounds(s.model,s.selected,0);});
    const pixel=(label,x,y)=>page.evaluate(({label,x,y})=>{
      const {model}=PanelEditor.snapshot(),id=model.items.findIndex(i=>i.label===label);
      const [l,t]=PanelOutput.bounds(model,id,0),c=PanelOutput.paint(model,id,'clean',0,'paper');
      return [...c.getContext('2d').getImageData(x-l,y-t,1,1).data];
    },{label,x,y});
    async function coordinates(which,points){
      const [stage,surface]={overview:['#stage','#figureSurface'],panel:['#previewStage','#previewSurface'],modal:['#pixelScroll','#pixelSurface']}[which];
      await page.locator(stage).scrollIntoViewIfNeeded();
      return page.evaluate(({which,stage,surface,points})=>{
        const {model,selected}=PanelEditor.snapshot(),canvas=document.querySelector(surface).getBoundingClientRect();
        const frame=document.querySelector(stage).getBoundingClientRect();
        const [l,t,r,b]=which==='overview'?[0,0,model.source.width,model.source.height]:PanelOutput.bounds(model,selected,0);
        const result=points.map(([x,y])=>[canvas.left+(x-l)*canvas.width/(r-l),canvas.top+(y-t)*canvas.height/(b-t)]);
        const [x,y]=result[0];
        if(x<=frame.left||x>=frame.right||y<=frame.top||y>=frame.bottom)throw Error('Press must occur inside the editor workspace');
        return result;
      },{which,stage,surface,points});
    }
    async function stroke(which,points){
      const coords=await coordinates(which,points);
      await page.mouse.move(...coords[0]);await page.mouse.down();
      for(const p of coords.slice(1))await page.mouse.move(...p,{steps:3});
      await page.mouse.up();
    }
    const white=[255,255,255,255],ink=[35,79,117,255];
    const buttons=await page.locator('button[data-icon]').evaluateAll(nodes=>nodes.map(b=>{
      const use=b.querySelector('svg use'),ref=use?.getAttribute('href');
      return {name:b.getAttribute('aria-label'),tooltip:b.dataset.tooltip,
        symbol:!!ref&&!!document.getElementById(ref.slice(1)),border:parseFloat(getComputedStyle(b).borderTopWidth)};
    }));
    assert.ok(buttons.length>60&&buttons.every(b=>b.name&&b.tooltip&&b.symbol&&b.border===0));
    await page.locator('#edits [data-edit="new"]').hover();
    await page.waitForFunction(()=>document.querySelector('.icon-tip:popover-open')?.textContent==='矩形选取');
    await page.locator('#edits [data-edit="new"]').focus();await page.keyboard.press('Tab');
    await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='套索圈选'&&
      document.querySelector('.icon-tip:popover-open')?.textContent==='套索圈选');
    await tool('#edits','矩形选取');
    await stroke('overview',[[246,166],[-6,-6]]);
    assert.deepEqual(await box(),[0,0,240,160]);
    for(const [x,y] of [[0,0],[239,0],[0,159],[239,159]])assert.deepEqual(await pixel('A',x,y),ink);
    const before=await history();await stroke('overview',[[-6,12],[-2,40]]);assert.equal(await history(),before);

    await stroke('overview',[[246,166],[150.5,95.5]]);
    const [l,t,r,b]=await box();assert.deepEqual([l,t,r,b],[150,95,240,160]);
    await tool('#editor','剪除矩形');
    await stroke('panel',[[l-2,t-2],[l+12.5,t+10.5]]);
    assert.deepEqual(await pixel('B',l,t),white);assert.deepEqual(await pixel('A',l,t),ink);
    assert.deepEqual(await pixel('B',l+15,t+15),ink);
    await page.locator('#fullPreview').click();
    await page.locator('#pixelDialog [data-step="fit"]').click();
    await tool('#pixelDialog','剪除矩形');
    await stroke('modal',[[r+1,b+1],[r-8.5,b-8.5]]);
    assert.deepEqual(await pixel('B',239,159),white);assert.deepEqual(await pixel('A',239,159),ink);
    await tool('#pixelDialog','橡皮檫');
    await stroke('modal',[[r+1,125],[r-5,125]]);
    assert.deepEqual(await pixel('B',239,125),white);assert.deepEqual(await pixel('A',239,125),ink);
    await tool('#pixelDialog','撤销');assert.deepEqual(await pixel('B',239,125),ink);
    await tool('#pixelDialog','关闭');
    await page.locator('#one').click();await page.locator('#figureName').fill('Fig 1');
    const download=page.waitForEvent('download');await page.locator('#confirmSave').click();
    const png=await download,chunks=[];
    assert.equal(png.suggestedFilename(),'Fig 1B.png');
    for await(const chunk of await png.createReadStream())chunks.push(chunk);
    const exported=await page.evaluate(async b64=>{
      const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
      const img=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
      const ctx=c.getContext('2d');ctx.drawImage(img,0,0);img.close();
      const read=(x,y)=>[...ctx.getImageData(x,y,1,1).data];
      return [c.width,c.height,read(0,0),read(c.width-1,c.height-1),read(16,16)];
    },Buffer.concat(chunks).toString('base64'));
    assert.deepEqual(exported,[90,65,white,white,ink]);

    await tool('#edits','套索圈选');
    await stroke('overview',[[-7,12],[22,70],[22,118],[-7,118]]);
    const diagonal=await box();assert.equal(diagonal[0],0);assert.ok(Math.abs(diagonal[1]-26)<=1);
    assert.deepEqual(await pixel('C',1,35),ink);
    const outside=await history();
    await tool('#editor','剪除矩形');await stroke('overview',[[18.5,33.5],[243,40.5]]);
    assert.equal(await history(),outside);
    await tool('#edits','套索圈选');await stroke('overview',[[-7,4],[4,-7],[-7,-7]]);
    assert.equal(await history(),outside);
    await tool('#editor','补选矩形');await stroke('overview',[[-6,-6],[9.5,8.5]]);
    assert.deepEqual(await pixel('C',0,0),ink);
    await tool('#editor','用矩形重画');await stroke('overview',[[234.5,154.5],[246,166]]);
    assert.deepEqual(await box(),[234,154,240,160]);
    await tool('#editor','用套索重画');await stroke('overview',[[242,150],[225,159],[242,164]]);
    assert.equal((await box())[2],240);
    assert.deepEqual(await pixel('C',239,157),ink);
    await tool('#edits','套索圈选');
    await stroke('overview',[[-6,-6],[246,-6],[246,166],[-6,166]]);
    assert.deepEqual(await box(),[0,0,240,160]);
    for(const [x,y] of [[0,0],[239,0],[0,159],[239,159]])assert.deepEqual(await pixel('D',x,y),ink);
    await tool('#edits','矩形选取');
    const cancelled=await history(),[start,end]=await coordinates('overview',[[-7,-6],[-2,5]]);
    await page.mouse.move(...start);await page.mouse.down();await page.mouse.move(...end);
    await page.waitForFunction(()=>!document.querySelector('#stage .selection-guide').hidden);
    await page.keyboard.press('Escape');await page.mouse.up();
    assert.equal(await page.locator('#stage .selection-guide').isVisible(),false);
    assert.equal(await history(),cancelled);
    await page.locator('#blankSet').click();
    assert.equal(await page.locator('#blankSet').getAttribute('aria-label'),'恢复自动划分');
    assert.equal(await page.locator('#blankSet use').getAttribute('href'),'#icon-rotate-ccw');
    await page.locator('#blankSet').click();
    assert.equal(await page.locator('#blankSet').getAttribute('aria-label'),'从空白开始');
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});

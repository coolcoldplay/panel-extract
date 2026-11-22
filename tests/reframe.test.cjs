const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {test} = require('node:test');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

// Fig 2 is on page 2. Its numbered legend starts on page 3.
async function examplePDF(browser) {
  const page = await browser.newPage();
  try {
    const art = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 720; c.height = 340;
      const ctx = c.getContext('2d');
      ctx.fillStyle = 'white'; ctx.fillRect(0,0,720,340);
      for (const [x,label,color] of [[18,'A','#007c78'],[378,'B','#ef7320']]) {
        ctx.font = 'bold 34px Arial'; ctx.fillStyle = 'black'; ctx.fillText(label,x,43);
        ctx.fillStyle = color; ctx.fillRect(x+22,69,280,218);
        ctx.fillStyle = 'white'; ctx.fillRect(x+52,118,110,35);
      }
      return c.toDataURL();
    });
    const img = '<img src="'+art+'">';
    await page.setContent('<style>@page{size:600px 800px;margin:0}*{box-sizing:border-box}body{margin:0;font:16px Arial}'+
      'section{position:relative;width:600px;height:800px;break-after:page}section:last-child{break-after:auto}'+
      'img{position:absolute;left:60px;top:96px;width:480px}p{position:absolute;left:60px;top:352px;margin:0;width:480px}'+
      '.legend{color:#dc0091}.top{top:50px}</style>'+
      '<section>'+img+'<p>Fig. 1. Two geometric shapes.</p></section>'+
      '<section>'+img+'<p class="legend">Key to the illustration. This paragraph belongs to the caption and spans the full width of the artwork.</p></section>'+
      '<section><p class="top">Fig. 2. Additional geometric shapes on the preceding page.</p></section>');
    await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
    return await page.pdf({preferCSSPageSize:true,printBackground:true});
  } finally { await page.close(); }
}

// Use physical mouse gestures against the displayed page so the test also checks
// the conversion from the fitted preview to the coordinates of the original PDF.
async function dragCrop(page, start, end) {
  const board = await page.locator('#pageBoard').boundingBox();
  const point = ([x,y])=>[board.x+x*board.width/600,board.y+y*board.height/800];
  await page.mouse.move(...point(start)); await page.mouse.down();
  await page.mouse.move(...point(end),{steps:6}); await page.mouse.up();
}
async function pageReady(page, num) {
  await page.waitForFunction(n=>document.querySelector('#pageDialog').open &&
    document.querySelector('#pageNum').value===String(n) && document.querySelector('#pageBoard').width>100 &&
    document.querySelector('#regionInfo').textContent.includes('拖动绘制新范围'),num);
}
async function confirm(page) {
  await page.locator('#useRegion').click();
  await page.waitForFunction(()=>!document.querySelector('#pageDialog').open && !document.querySelector('#batchReview').disabled);
}
async function colors(page, selector, bytes) {
  return page.evaluate(async ({selector,base64})=>{
    let canvas;
    if (selector) canvas=document.querySelector(selector);
    else {
      const blob=new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type:'image/png'});
      const bitmap=await createImageBitmap(blob);
      canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
      canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
    }
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    const count={a:0,b:0,caption:0};
    for(let i=0;i<pixels.length;i+=4){
      const [r,g,b]=[pixels[i],pixels[i+1],pixels[i+2]];
      if(r<35 && g>95 && g<155 && b>90 && b<150)count.a++;
      if(r>210 && g>82 && g<148 && b<60)count.b++;
      if(r>165 && g<60 && b>85 && b<185)count.caption++;
    }
    return count;
  },{selector,base64:bytes?.toString('base64')});
}
async function downloadEntries(page, button) {
  const pending=page.waitForEvent('download');
  await page.locator(button).click();
  const bytes=await fs.readFile(await (await pending).path());
  const entries=new Map();
  for(let i=0;bytes.readUInt32LE(i)===0x04034b50;){
    assert.equal(bytes.readUInt16LE(i+8),0);
    const size=bytes.readUInt32LE(i+18),nameEnd=i+30+bytes.readUInt16LE(i+26);
    const data=nameEnd+bytes.readUInt16LE(i+28);
    entries.set(bytes.toString('utf8',i+30,nameEnd),bytes.subarray(data,data+size));
    i=data+size;
  }
  return entries;
}
async function slideObjects(page,bytes) {
  return page.evaluate(xml=>{
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    const first=(p,tag)=>p.getElementsByTagNameNS('*',tag)[0];
    const shapes=[...doc.getElementsByTagNameNS('*','cNvPr')];
    const heading=first(doc,'sp'),off=first(heading,'off'),extent=first(heading,'ext');
    return {
      title:first(heading,'t').textContent,editable:first(heading,'cNvSpPr').getAttribute('txBox')==='1',
      x:Number(off.getAttribute('x')),y:Number(off.getAttribute('y')),height:Number(extent.getAttribute('cy')),
      ids:shapes.map(el=>el.getAttribute('id')),
      pictures:[...doc.getElementsByTagNameNS('*','pic')].map(p=>({
        name:first(p,'cNvPr').getAttribute('name'),left:Number(first(p,'off').getAttribute('x')),top:Number(first(p,'off').getAttribute('y'))
      }))
    };
  },bytes.toString());
}

test('redraw the correct PDF artwork page, recover a panel, remove a caption and export', {timeout:120000}, async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined});
  try {
    const pdf=await examplePDF(browser);
    const page=await browser.newPage({viewport:{width:1240,height:840}});
    await page.route('https://static.cloudflareinsights.com/beacon.min.js',r=>r.abort());
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.PANEL_EXTRACT_URL||pathToFileURL(path.resolve(__dirname,'../docs/index.html')).href);
    await page.locator('#pdfFile').setInputFiles({name:'shapes.pdf',mimeType:'application/pdf',buffer:pdf});
    await page.waitForFunction(()=>document.querySelectorAll('#figureNav button').length===2 && !document.querySelector('#batchReview').disabled);
    assert.match(await page.locator('#fileMeta').innerText(),/^Fig 1/);
    const key=k=>page.keyboard.press(k);
    await page.locator('#labels').getByRole('button',{name:'Panel A',exact:true}).click();
    await key('ArrowRight');assert.match(await page.locator('#panelTitle').innerText(),/Panel B/);
    await page.locator('#fullPreview').click();await key('ArrowLeft');
    assert.match(await page.locator('#pixelTitle').innerText(),/Panel A/);
    await key('ArrowDown');
    await page.waitForFunction(()=>document.querySelector('#fileMeta').textContent.startsWith('Fig 2') && !document.querySelector('#batchReview').disabled);
    assert.equal(await page.locator('#pixelDialog').isVisible(),true);
    await key('ArrowRight');assert.match(await page.locator('#pixelTitle').innerText(),/Panel B/);
    await key('ArrowUp');
    await page.waitForFunction(()=>document.querySelector('#fileMeta').textContent.startsWith('Fig 1') && !document.querySelector('#batchReview').disabled);
    await key('Escape');
    await page.locator('#batchReview').click();
    const group1=page.locator('.figure-group').nth(0),group2=page.locator('.figure-group').nth(1);
    await group1.locator('.thumb button').first().focus();await key('ArrowDown');await key('ArrowRight');
    assert.equal(await group2.locator('.thumb button').nth(1).evaluate(b=>b===document.activeElement),true);
    await key('Enter');await page.locator('#pngDialog').waitFor({state:'visible'});
    assert.equal(await page.locator('#pngTitle').innerText(),'Fig 2B.png');
    await key('ArrowLeft');assert.equal(await page.locator('#pngTitle').innerText(),'Fig 2A.png');
    await key('ArrowUp');assert.equal(await page.locator('#pngTitle').innerText(),'Fig 1A.png');
    await page.locator('#pngClose').click();
    const figureName=group2.getByRole('textbox');
    await figureName.focus();await figureName.evaluate(el=>el.setSelectionRange(3,3));await key('ArrowLeft');await key('ArrowUp');
    assert.equal(await figureName.evaluate(el=>el===document.activeElement),true);
    assert.equal(await figureName.inputValue(),'Fig 2');
    const firstThumbs=await group1.locator('.thumb img').evaluateAll(imgs=>imgs.map(i=>i.src));
    await group1.locator('.thumb input').nth(1).uncheck();
    await group2.getByRole('button',{name:'预览幻灯片'}).click();
    await page.locator('#pngDialog').waitFor({state:'visible'});
    const visibleTitle=await page.locator('#pngImage').evaluate(async img=>{
      await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
      const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
      const pixels=ctx.getImageData(0,0,Math.round(c.width*.20),Math.round(c.height*.10)).data;
      let dark=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<90&&pixels[i+1]<90&&pixels[i+2]<90)dark++;
      return dark;
    });
    assert.ok(visibleTitle>30);
    const oldPreview=await page.locator('#pngImage').getAttribute('src');
    await page.locator('#previewReframe').click();
    await pageReady(page,2);
    assert.equal(await page.locator('#regionName').inputValue(),'Fig 2');
    assert.equal(await page.locator('#useRegion').isDisabled(),true);
    assert.equal(await page.locator('#regionKey').isVisible(),true);
    const original=await colors(page,'#pageBoard');
    assert.ok(original.a>1000 && original.b>1000 && original.caption>30);
    const stage=await page.locator('#pageStage').boundingBox(),board=await page.locator('#pageBoard').boundingBox();
    assert.ok(board.y>stage.y && board.y+board.height<stage.y+stage.height,'the full portrait page must fit');
    await dragCrop(page,[45,85],[296,325]);
    await page.locator('#pageNext').click();await pageReady(page,3);
    await page.locator('#resetRegion').click();await pageReady(page,2);
    assert.equal(await page.locator('#useRegion').isDisabled(),true);
    await page.locator('#pageClose').click();
    assert.equal(await page.locator('#pngImage').getAttribute('src'),oldPreview);
    await page.locator('#pngClose').click();
    assert.match(await page.locator('#fileMeta').innerText(),/^Fig 1/);

    // Make the current crop too small. Its missing panel must still be on the original.
    await group2.getByRole('button',{name:'从原页重新框选'}).click();await pageReady(page,2);
    await dragCrop(page,[45,85],[296,325]);await confirm(page);
    assert.equal(await page.locator('.figure-group').count(),2);
    assert.equal(await group2.locator('.thumb').count(),1);
    assert.equal((await colors(page,'#sourceView')).b,0);
    assert.match(await page.locator('#sourcePage').innerText(),/第 2 页.*图注在第 3 页/);
    await group2.locator('.thumb button').first().click();
    await page.locator('#previewReframe').click();await pageReady(page,2);
    assert.ok((await colors(page,'#pageBoard')).b>1000);

    // Expanding also includes the deliberately colored caption below the artwork.
    await dragCrop(page,[44,82],[560,430]);await confirm(page);
    assert.equal(await page.locator('#pngDialog').isVisible(),false);
    const loose=await colors(page,'#sourceView');
    assert.ok(loose.a>1000 && loose.b>1000 && loose.caption>30);
    await group2.locator('.thumb input').first().uncheck();
    await group2.locator('.thumb input').first().check();
    await page.locator('#backToPaper').click();
    await page.locator('#reframe').click();await pageReady(page,2);
    await dragCrop(page,[552,329],[48,83]);await page.keyboard.press('Escape');
    assert.deepEqual(await colors(page,'#sourceView'),loose);
    await page.locator('#reframe').click();await pageReady(page,2);
    await dragCrop(page,[552,329],[48,83]);await confirm(page);
    const corrected=await colors(page,'#sourceView');
    assert.ok(corrected.a>1000 && corrected.b>1000);
    assert.equal(corrected.caption,0);
    assert.equal(await page.locator('#labels button').count(),2);
    await page.locator('#batchReview').click();
    assert.deepEqual(await group1.locator('.thumb img').evaluateAll(imgs=>imgs.map(i=>i.src)),firstThumbs);
    assert.equal(await group1.locator('.thumb input').nth(1).isChecked(),false);
    const zip=await downloadEntries(page,'#downloadPaper');
    assert.deepEqual([...zip.keys()].sort(),['Fig 1/Fig 1A.png','Fig 2/Fig 2A.png','Fig 2/Fig 2B.png']);
    await page.locator('#backToPaper').click();
    // The direct top action must include the latest edit without having to visit the gallery.
    await page.locator('#labels').getByRole('button',{name:'Panel B',exact:true}).click();
    page.once('dialog',d=>d.accept('D'));
    await page.locator('#rename').click();
    const ppt=await downloadEntries(page,'#paperPpt');
    assert.equal(await page.locator('#batchDialog').isVisible(),false);
    assert.ok(ppt.has('ppt/slides/slide1.xml') && !ppt.has('ppt/slides/slide3.xml'));
    const slides=await Promise.all([1,2].map(n=>slideObjects(page,ppt.get('ppt/slides/slide'+n+'.xml'))));
    for(const [i,s] of slides.entries()){
      assert.equal(s.title,'Fig '+(i+1));assert.equal(s.editable,true);
      assert.equal(new Set(s.ids).size,s.ids.length);
      assert.ok(s.x>=0 && s.x<250000 && s.y>=0 && s.y<150000);
      assert.ok(s.pictures.every(p=>p.top>=s.y+s.height),'the title must stay above every picture');
    }
    const {pictures}=slides[1];
    assert.deepEqual(pictures.map(p=>p.name),['Fig 2A','Fig 2D']);
    assert.ok(pictures[0].left<pictures[1].left);
    for(const [buffer,label] of [[zip.get('Fig 2/Fig 2A.png'),'a'],[zip.get('Fig 2/Fig 2B.png'),'b'],
      [ppt.get('ppt/media/panel2.png'),'a'],[ppt.get('ppt/media/panel3.png'),'b']]){
      const p=await colors(page,null,buffer);
      assert.ok(p[label]>1000);assert.equal(p.caption,0);
    }
    await page.locator('#batchReview').click();await page.locator('#batchNone').click();
    await page.locator('#backToPaper').click();await page.locator('#paperPpt').click();
    await page.locator('#batchDialog').waitFor({state:'visible'});
    assert.match(await page.locator('#batchMessage').innerText(),/至少选择一个 Panel/);
    assert.equal(await page.locator('#downloadSlides').isDisabled(),true);
    await group2.getByRole('textbox').fill('Fig S7 & 图');
    await group2.locator('.thumb input').first().check();
    assert.equal(await page.locator('#downloadSlides').isEnabled(),true);
    const custom=await downloadEntries(page,'#downloadSlides');
    assert.equal(custom.has('ppt/slides/slide2.xml'),false);
    assert.equal((await slideObjects(page,custom.get('ppt/slides/slide1.xml'))).title,'Fig S7 & 图');
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});

const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {test} = require('node:test');
const {chromium} = require('playwright');

// Generate the inputs in memory. The test does not use the system clipboard.
async function fixtures(browser) {
  const page = await browser.newPage();
  try {
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 340;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 720, 340);
      for (const [x, letter, color] of [[18, 'A', '#307695'], [378, 'B', '#9c633f']]) {
        ctx.font = 'bold 30px Arial';
        ctx.fillStyle = 'black';
        ctx.fillText(letter, x, 43);
        ctx.fillStyle = color;
        ctx.fillRect(x + 22, 69, 280, 218);
        ctx.fillStyle = 'white';
        ctx.fillRect(x + 52, 118, 110, 35);
      }
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.setContent('<style>body{margin:40px;font:14px Arial}img{width:480px;display:block}</style>' +
      '<img alt="" src="data:image/png;base64,' + png + '"><p>Fig. 1. Synthetic geometric panels for a browser test.</p>');
    await page.locator('img').evaluate(image => image.decode());
    const pdf = await page.pdf({width:'600px',height:'440px',printBackground:true});
    return {png:Buffer.from(png,'base64'),pdf};
  } finally {
    await page.close();
  }
}

async function transfer(page, kind, buffer, name, type) {
  await page.evaluate(({kind, bytes, name, type}) => {
    const data = new DataTransfer();
    data.items.add(new File([Uint8Array.from(atob(bytes), c => c.charCodeAt(0))], name, {type}));
    const event = kind === 'paste'
      ? new ClipboardEvent('paste', {bubbles:true,cancelable:true,clipboardData:data})
      : new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:data});
    if (document.body.dispatchEvent(event)) throw Error('The application did not accept the file event');
  }, {kind, bytes:buffer.toString('base64'), name, type});
}

test('blank landing page, local imports, figure preview and exports', {timeout:120000}, async () => {
  const url = process.env.PANEL_EXTRACT_URL || pathToFileURL(path.resolve(__dirname,'../docs/index.html')).href;
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE || undefined});
  try {
    const input = await fixtures(browser);
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(url);
    assert.equal(await page.locator('#importStart').isVisible(), true);
    assert.equal(await page.locator('#imageDesk').isVisible(), false);
    assert.equal(await page.locator('#pdfDesk').isVisible(), false);
    assert.equal(await page.locator('header').innerText().then(s => s.includes('BREVESS')), false);
    assert.equal(await page.locator('#exampleNew,#exampleOld,#exampleBtn').count(), 0);
    await page.getByRole('button',{name:'开源项目与许可'}).click();
    const notices = await page.locator('#licenseDialog').innerText();
    for (const name of ['BREVESS','PDF.js','python-pptx','AGPL']) assert.ok(notices.includes(name));
    await page.locator('#licenseDialog').getByRole('button',{name:'关闭'}).click();
    const network = [];
    page.on('request', r => { if (/^https?:/.test(r.url())) network.push([r.method(),r.url()]); });

    async function imageReady(name) {
      await page.waitForFunction(expected => !document.querySelector('#imageDesk').hidden &&
        document.querySelector('#fileMeta').textContent.startsWith(expected) &&
        !document.querySelector('#one').disabled, name);
      assert.equal(await page.locator('#labels button').count(), 2);
    }
    async function pdfReady() {
      await page.waitForFunction(() => !document.querySelector('#pdfDesk').hidden &&
        !document.querySelector('#batchReview').disabled && document.querySelector('#pdfProgress').hidden);
      assert.match(await page.locator('#figureNav').innerText(), /Fig 1/i);
    }

    // Start with a pasted PDF, then close it to restore the empty workspace.
    await transfer(page,'paste',input.pdf,'clipboard-figure.pdf','application/pdf');
    await pdfReady();
    const topPpt=page.locator('#pdfDesk .card-head').getByRole('button',{name:'导出整篇 PPT',exact:true});
    const directDownload=page.waitForEvent('download');
    await topPpt.click();
    const deck=await directDownload;
    assert.equal(deck.suggestedFilename(),'clipboard-figure.pptx');
    assert.equal(await deck.failure(),null);
    assert.equal(await page.locator('#batchDialog').isVisible(),false);
    await page.locator('#reframe').click();
    await page.waitForFunction(()=>document.querySelector('#pageBoard').width>300);
    assert.equal(await page.locator('#useRegion').isDisabled(),true);
    const board=await page.locator('#pageBoard').boundingBox();
    const frame=await page.locator('#pageStage').boundingBox();
    assert.ok(board.x-frame.x>8&&board.y-frame.y>8);
    await page.mouse.move(board.x-7,board.y-7);await page.mouse.down();
    await page.mouse.move(board.x+board.width*.4,board.y+board.height*.25,{steps:4});await page.mouse.up();
    const newSize=await page.locator('#regionInfo').innerText();
    assert.match(newSize,/180 × 8[23] pt/);
    await page.mouse.move(board.x-9,board.y+10);await page.mouse.down();
    await page.mouse.move(board.x-4,board.y+60);await page.mouse.up();
    assert.equal(await page.locator('#regionInfo').innerText(),newSize);
    await page.locator('#pageClose').click();
    await page.locator('#batchReview').click();
    assert.equal(await page.locator('#batchDialog').isVisible(), true);
    assert.ok(await page.locator('#batchGallery img').count() > 0);
    for (const [button,ext] of [['#downloadPaper','.zip'],['#downloadSlides','.pptx']]) {
      const download = page.waitForEvent('download');
      await page.locator(button).click();
      const file = await download;
      assert.ok(file.suggestedFilename().endsWith(ext));
      assert.equal(await file.failure(), null);
    }
    await page.locator('#backToPaper').click();
    await page.locator('#closePdf').click();
    assert.equal(await page.locator('#importStart').isVisible(), true);
    assert.equal(await page.locator('#imageDesk').isVisible(), false);

    const chooser = page.waitForEvent('filechooser');
    await page.locator('#browseFile').click();
    await (await chooser).setFiles({name:'picked.png', mimeType:'image/png', buffer:input.png});
    await imageReady('picked.png');
    const automatic=page.getByRole('button',{name:'自动划分',exact:true});
    assert.equal(await topPpt.isVisible(),false);
    assert.equal(await page.locator('#reframe').isVisible(),false);
    await automatic.click();
    assert.equal(await automatic.getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('#labels button').count(),0);
    await automatic.click();
    assert.equal(await automatic.getAttribute('aria-pressed'),'true');
    assert.deepEqual(await page.locator('#labels button').allTextContents(),['A','B']);
    await transfer(page,'drop',input.png,'dropped.png','image/png');
    await imageReady('dropped.png');
    await transfer(page,'paste',input.png,'pasted.png','image/png');
    await imageReady('pasted.png');
    await page.locator('#one').click();
    await page.locator('#figureName').fill('Fig 9');
    const request = page.waitForEvent('download');
    await page.locator('#confirmSave').click();
    const image = await request;
    assert.match(image.suggestedFilename(), /^Fig 9A\.png$/i);
    assert.equal(await image.failure(), null);

    // A file manager may supply binary data without a PDF extension or MIME type.
    await transfer(page,'drop',input.pdf,'clipboard-file','application/octet-stream');
    await pdfReady();
    await page.locator('#closePdf').click();
    await imageReady('pasted.png');
    assert.deepEqual(network, [], 'Document processing made HTTP requests');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {test} = require('node:test');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

test('analytics loads once on the public site and stays off in offline copies and forks', async()=>{
  const file=path.resolve(__dirname,'../docs/index.html'),html=await fs.readFile(file);
  const site='https://coolcoldplay.github.io/panel-extract/';
  const beacon='https://static.cloudflareinsights.com/beacon.min.js';
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined});
  try{
    const page=await browser.newPage(),requests=[];
    // Serve the built HTML and a stub locally. These checks never generate real visits.
    await page.route(/^https?:/,async route=>{
      if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:html});
      requests.push(route.request().url());
      if(route.request().url()===beacon)return route.fulfill({contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:''});
      return route.abort();
    });
    for(const [url,enabled] of [[site,true],[site+'index.html?test=1#workspace',true],[pathToFileURL(file).href,false],
      ['http://localhost:8765/panel-extract/',false],['https://example.org/panel-extract/',false],['https://coolcoldplay.github.io/other/',false]]){
      requests.length=0;await page.goto(url,{waitUntil:'load'});
      const installed=page.locator('script[data-cf-beacon]');
      assert.equal(await installed.count(),Number(enabled),url);
      assert.deepEqual(requests,enabled?[beacon]:[],url);
      if(enabled){
        const config=JSON.parse(await installed.getAttribute('data-cf-beacon'));
        assert.match(config.token,/^[a-f0-9]{32}$/);assert.equal(config.spa,false);
        assert.equal(new URL(page.url()).pathname,'/panel-extract/');
        assert.equal(new URL(page.url()).search,new URL(url).search);
        assert.equal(new URL(page.url()).hash,new URL(url).hash);
      }
    }
  }finally{await browser.close();}
});

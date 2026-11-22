/* Whole-document workspace. All PDF and image data stay within this page. */
const PaperBatch=(()=>{
  const $=id=>document.getElementById(id);
  const tick=()=>new Promise(done=>setTimeout(done,0));
  const element=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!=null)e.textContent=txt;if(cls)e.className=cls;return e;};
  const action=(title,handler,icon)=>{const b=element('button',title);b.type='button';b.onclick=handler;return icon?PanelIcons.set(b,icon,title):b;};
  let job=null,region=null,objectUrl='',pageRequest=0;
  function locked(){return !!job&&job.phase!=='ready';}
  function changed(){if(job?.active&&job.phase==='ready')job.active.dirty=true;}
  function phase(j,value,message){
    if(j!==job)return;
    j.phase=value;const busy=locked();
    $('imageDesk').inert=busy||!j.active?.box;
    for(const id of ['batchReview','addFigure','reframe'])$(id).disabled=busy;
    $('figureNav').inert=busy;
    $('pdfProgress').hidden=!['read','detect','split'].includes(value);
    if(message)$('pdfSummary').textContent=message;
    PanelEditor.controls();
  }
  function destroy(task){if(task)Promise.resolve(task.destroy()).catch(()=>{});}
  function leave(restore=true){
    if(!job)return;
    const j=job;job=null;region=null;pageRequest++;
    for(const id of ['batchDialog','pageDialog','pngDialog'])if($(id).open)$(id).close();
    $('pdfDesk').hidden=true;$('imageDesk').hidden=false;$('imageDesk').inert=false;$('figureNav').replaceChildren();$('batchGallery').replaceChildren();
    if(j.prior?.model&&restore)PanelEditor.mount(j.prior.model,j.prior);
    else PanelEditor.clear();
    destroy(j.loading||j.doc);
    if(restore)PanelEditor.status(j.prior?.model?'已关闭 PDF。':'');PanelEditor.controls();
  }
  async function modelFor(j,rec){
    const source=await PaperPDF.render(j.doc,rec.page,rec.box,rec.resolution||3);
    try{
      if(j!==job)throw Error('已取消');
      const m=PaperPDF.hints(j.pages[rec.page-1],rec.box,source);
      // Detached legends can identify letters absent from the raster text layer.
      const expected=rec.resolution&&rec.captionPage!==rec.page?(rec.panelRun||''):'';
      const {w,h,owners,visible,paper,items}=PanelEngine.analyze(source,m.letters,m.words,expected);
      items.forEach((p,id)=>p.autoId=id);
      if(!items.length)items.push({label:'整图',whole:true,shape:{type:'rect',box:[0,0,source.width,source.height]},review:true,description:''});
      if(!rec.saved&&rec.outputs)for(const p of rec.outputs)if(items[p.id])items[p.id].pack=p.selected;
      return {w,h,owners,visible,paper,source,name:rec.name+' · PDF 第 '+rec.page+' 页',automaticItems:items,items:rec.saved?.items??structuredClone(items),
        physical:[rec.box[2]-rec.box[0],rec.box[3]-rec.box[1]]};
    }catch(e){source.width=source.height=1;throw e;}
  }
  async function generate(j,rec,keep=false){
    const m=await modelFor(j,rec);
    try{
      const outputs=await PanelFiles.outputs(m,rec.saved?.pad??0,rec.saved?.paper||'paper');
      if(j!==job)throw Error('已取消');
      Object.assign(rec,{outputs,size:[m.source.width,m.source.height],physical:m.physical});
      return keep?m:null;
    }finally{if(!keep||j!==job)m.source.width=m.source.height=1;}
  }
  async function flush(j){
    const rec=j.active;if(!rec?.box||!j.mounted)return;
    const s=PanelEditor.snapshot();
    rec.saved={items:s.model.items,selected:s.selected,history:s.history,blankMode:s.blankMode,restoreIndex:s.restoreIndex,pad:s.pad,paper:s.paper};
    if(!rec.dirty)return;
    const outputs=await PanelFiles.outputs(s.model,s.pad,s.paper);
    if(j===job){rec.outputs=outputs;rec.dirty=false;}
  }
  function mount(j,rec,m){
    j.active=rec;j.mounted=!!m;
    $('pdfSelection').hidden=false;
    $('sourcePage').textContent='第 '+rec.page+' 页'+(rec.captionPage&&rec.captionPage!==rec.page?' · 图注在第 '+rec.captionPage+' 页':'')+(rec.uncertain?' · 请核对整图范围':'');
    PanelIcons.set($('reframe'),rec.box?'crop':'crosshair',rec.box?'调整整图范围':'在 PDF 中定位');$('imageDesk').hidden=!m;
    if(m)PanelEditor.mount(m,{...rec.saved,figureName:rec.name});
  }
  function nav(j){
    $('figureNav').replaceChildren();
    for(const r of j.entries){
      const b=action(r.name,()=>switchTo(r));b.setAttribute('aria-pressed',String(j.active===r));
      const info=!r.outputs?.length?'待定位':r.outputs.length===1&&r.outputs[0].whole?'整图':r.outputs.length+' Panel';
      b.append(element('small','P'+r.page+' · '+info));$('figureNav').append(b);
    }
    const available=j.entries.filter(r=>r.outputs?.length),names=new Set(available.map(r=>r.group||r.name));
    const scan=j.pages.filter(p=>p.scan).length,failed=j.pages.filter(p=>p.failed).length;
    const unsure=j.entries.filter(r=>r.uncertain||!r.outputs?.length).length;
    $('pdfSummary').textContent=j.doc.numPages+' 页 · '+names.size+' 幅候选 Figure · '+available.reduce((n,r)=>n+r.outputs.length,0)+' 张图像'+(unsure?' · '+unsure+' 个位置待复核':'')+(scan?' · '+scan+' 张扫描页可手动补选':'')+(failed?' · '+failed+' 页自动读取失败，可从 PDF 页补选':'');
  }
  async function switchTo(rec){
    const j=job;if(!j||locked()||j.active===rec)return;
    phase(j,'switch','正在载入 '+rec.name+'…');
    try{await flush(j);const m=rec.box&&rec.outputs?await modelFor(j,rec):null;if(j!==job)return;mount(j,rec,m);}
    catch(e){if(j===job)PanelEditor.status('载入整图失败。'+e.message,'warn');}
    finally{if(j===job){phase(j,'ready');nav(j);}}
  }
  function safeFile(s){return s.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/[. ]+$/g,'').slice(0,85)||'Figures';}
  async function load(file){
    const prior=job?.prior||PanelEditor.snapshot();leave(false);
    const j={file,prior,pages:[],entries:[],phase:'read'};job=j;
    $('pdfDesk').hidden=false;$('pdfSelection').hidden=true;$('imageDesk').hidden=true;$('pdfName').textContent=file.name;
    $('archiveName').value=safeFile(file.name.replace(/\.pdf$/i,''));$('pdfProgress').removeAttribute('value');
    phase(j,'read','正在打开 PDF…');PanelEditor.status('正在本机读取论文…','busy');
    try{
      j.doc=await PaperPDF.open(file,(update,reason)=>{
        if(j!==job)return;const pw=prompt(reason===2?'密码有误，请重新输入 PDF 密码':'请输入 PDF 打开密码');
        if(pw===null){leave(true);return;}update(pw);
      },t=>{if(j===job)j.loading=t;else destroy(t);});
      if(j!==job)return;
      for(let p=1;p<=j.doc.numPages;p++){
        phase(j,'detect','正在定位图像与图注 · 第 '+p+' / '+j.doc.numPages+' 页');$('pdfProgress').max=j.doc.numPages;$('pdfProgress').value=p-1;
        try{j.pages.push(await PaperPDF.scanPage(j.doc,p));}
        catch(e){
          if(j!==job)return;
          const page=await j.doc.getPage(p),v=page.getViewport({scale:1});
          j.pages.push({page:p,w:v.width,h:v.height,caps:[],blocks:[],letters:[],tables:[],failed:true});
        }
        if(j!==job)return;await tick();
      }
      j.entries=PaperPDF.collect(j.pages);let first;
      for(const [i,rec] of j.entries.entries()){
        rec.enabled=rec.kind!=='unknown'&&!!rec.box;
        phase(j,'split','正在提取 '+rec.name+' · '+(i+1)+' / '+j.entries.length);$('pdfProgress').max=j.entries.length;$('pdfProgress').value=i;
        if(rec.box){
          try{const m=await generate(j,rec,!first);if(!first)first={rec,m};}
          catch(e){if(j!==job)return;rec.problem=e.message;rec.enabled=false;rec.uncertain=true;}
        }
        if(j!==job)return;await tick();
      }
      if(first)mount(j,first.rec,first.m);
      else if(j.entries.length)mount(j,j.entries[0],null);
      phase(j,'ready');nav(j);
      PanelEditor.status(first?'可逐图校正，或打开「预览与导出整篇」。':'未自动定位到可导出的整图，可从 PDF 页补选。',first?'ok':'warn');
    }catch(e){if(j===job){leave(true);PanelEditor.status('打开 PDF 失败。'+(e.message||'文件无法解析'),'warn');}}
  }
  function showImage(blob,title,info){
    if(objectUrl)URL.revokeObjectURL(objectUrl);
    objectUrl=URL.createObjectURL(blob);$('pngImage').src=objectUrl;$('pngTitle').textContent=title;$('pngInfo').textContent=info;
    if(!$('pngDialog').open)$('pngDialog').showModal();
  }
  function setPack(j,r,p,on){
    p.selected=on;if(r.saved?.items[p.id])r.saved.items[p.id].pack=on;
    if(j.active===r&&j.mounted){const item=PanelEditor.snapshot().model.items[p.id];if(item)item.pack=on;}
  }
  function sheets(j){
    const groups=new Map();
    for(const r of j.entries)if(r.enabled&&r.outputs?.some(p=>p.selected)){
      const key=r.groupId||r;if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(r);
    }
    return [...groups.values()].map(parts=>{
      const key=parts[0].group||parts[0].name;
      if(parts.length===1){const r=parts[0];return {name:key,size:r.size,physical:r.physical,outputs:r.outputs.filter(p=>p.selected),parts};}
      const width=Math.max(...parts.map(r=>r.physical[0]));let y=0;const outputs=[],labels=new Set();
      for(const r of parts){
        const [w,h]=r.physical,[sw,sh]=r.size;
        for(const p of r.outputs.filter(p=>p.selected)){
          const [x0,y0,pw,ph]=p.box,base=p.whole?'整图':p.label;
          let label=base;if(labels.has(label.toUpperCase())){label=base+'-P'+r.page;let k=2;while(labels.has(label.toUpperCase()))label=base+'-P'+r.page+'-'+k++;}
          labels.add(label.toUpperCase());outputs.push({...p,part:r,label,whole:false,layoutBox:[(width-w)/2+x0*w/sw,y+y0*h/sh,pw*w/sw,ph*h/sh]});
        }
        y+=h+10;
      }
      return {name:key,size:[width,y-10],physical:[width,y-10],outputs,parts};
    });
  }
  function reviewState(j){
    const list=sheets(j),n=list.reduce((s,f)=>s+f.outputs.length,0);
    const pending=j.entries.filter(r=>!r.outputs?.length).length;
    $('batchSummary').textContent='已选 '+list.length+' 幅 Figure · '+n+' 张 PNG · '+list.length+' 页 PPT'+(pending?' · '+pending+' 个位置尚待补选':'');
    const names=list.map(s=>s.name.toLowerCase()),files=list.flatMap(s=>s.outputs.map(p=>(s.name+'/'+PanelFiles.filename(s.name,p)).toLowerCase()));
    const problem=!list.length?'请至少选择一个 Panel。':!PanelFiles.validName($('archiveName').value.trim())?'请输入有效的导出文件名。':
      list.some(s=>!PanelFiles.validName(s.name))?'请检查 Figure 文件名。':new Set(files).size!==files.length||new Set(names).size!==names.length?'Figure 或 Panel 文件名有重复，请改名。':'';
    $('batchMessage').textContent=problem;$('downloadPaper').disabled=$('downloadSlides').disabled=!!problem||j.phase==='export';return list;
  }
  function gallery(j){
    const root=$('batchGallery');root.replaceChildren();
    for(const r of j.entries){
      const sect=element('section',null,'figure-group'),head=element('div',null,'group-head');
      const cb=element('input');cb.type='checkbox';cb.checked=!!r.enabled;cb.disabled=!r.outputs?.length;cb.setAttribute('aria-label','导出 '+r.name);
      cb.onchange=()=>{r.enabled=cb.checked;reviewState(j);};
      const name=element('input');name.type='text';name.value=r.name;name.maxLength=80;name.setAttribute('aria-label','Figure 名称 '+r.name);
      name.oninput=()=>{r.name=name.value.trim();if(r.groupId)for(const q of j.entries.filter(q=>q.groupId===r.groupId))q.group=r.name;reviewState(j);};
      const meta=element('small','PDF 第 '+r.page+' 页'+(r.uncertain?' · 请复核范围':'')+(r.outputs?.some(p=>p.whole)?' · 保留整图':''));
      const adjust=action(r.outputs?.length?'校正':'定位',async()=>{$('batchDialog').close();await switchTo(r);if(!r.outputs?.length)openRegion(r);},r.outputs?.length?'sliders-horizontal':'crosshair');
      head.append(cb,name,meta,adjust);
      if(r.outputs?.length)head.append(action('预览幻灯片',async()=>{
        try{const all=sheets(j),s=all.find(s=>s.parts.includes(r));if(!s){$('batchMessage').textContent='请先勾选本 Figure 及其 Panel。';return;}
          showImage(await PanelSlides.preview(s,all),s.name,'PPT 排版 · '+s.outputs.length+' 张独立图片');}
        catch(e){$('batchMessage').textContent=e.message;}
      },'eye'));
      sect.append(head);const grid=element('div',null,'thumb-grid');
      for(const p of r.outputs||[]){
        const cell=element('div',null,'thumb'),pic=action('',()=>showImage(p.blob,PanelFiles.filename(r.name,p),p.box[2]+' × '+p.box[3]+' px'));
        pic.setAttribute('aria-label','查看 '+r.name+' '+p.label+' PNG');const im=element('img');im.src=p.thumb;im.alt='';im.loading='lazy';pic.append(im);
        const l=element('label'),ch=element('input');ch.type='checkbox';ch.checked=p.selected;
        ch.onchange=()=>{setPack(j,r,p,ch.checked);if(ch.checked){r.enabled=true;cb.checked=true;}reviewState(j);};
        l.append(ch,document.createTextNode(p.whole?'整图':'Panel '+p.label));cell.append(pic,l);grid.append(cell);
      }
      if(!r.outputs?.length)grid.append(element('p',r.problem||'请在 PDF 页上定位整图范围。'));
      sect.append(grid);root.append(sect);
    }
    if(!j.entries.length)root.append(element('p','尚无可导出的 Figure。返回编辑后可从任意 PDF 页补选。'));
    reviewState(j);
  }
  async function review(){
    const j=job;if(!j||locked())return;
    phase(j,'switch','正在生成导出预览…');
    try{await flush(j);if(j!==job)return;gallery(j);$('batchDialog').showModal();}
    catch(e){if(j===job)PanelEditor.status('预览失败。'+e.message,'warn');}
    finally{if(j===job){phase(j,'ready');nav(j);}}
  }
  async function download(kind){
    const j=job;if(!j||locked())return;const list=reviewState(j);if($('downloadPaper').disabled)return;
    const name=$('archiveName').value.trim();phase(j,'export');$('batchGallery').inert=$('batchAll').disabled=$('batchNone').disabled=$('archiveName').disabled=$('backToPaper').disabled=true;
    $('downloadPaper').disabled=$('downloadSlides').disabled=true;$('batchMessage').textContent='正在生成文件…';await tick();
    try{
      const blob=kind==='pptx'?await PanelSlides.make(list,(n,t)=>$('batchMessage').textContent='正在写入幻灯片 '+n+' / '+t):
        await PanelOutput.zip(list.flatMap(s=>s.outputs.map(p=>({name:s.name+'/'+PanelFiles.filename(s.name,p),blob:p.blob}))));
      if(j===job){PanelOutput.save(blob,name+'.'+kind);$('batchMessage').textContent='已生成 '+name+'.'+kind;}
    }catch(e){if(j===job)$('batchMessage').textContent='导出失败。'+e.message;}
    finally{if(j===job){phase(j,'ready');$('batchGallery').inert=$('batchAll').disabled=$('batchNone').disabled=$('archiveName').disabled=$('backToPaper').disabled=false;
      $('downloadPaper').disabled=$('downloadSlides').disabled=false;}}
  }
  function drawRegion(){
    if(!region?.source)return;
    const c=$('pageBoard'),ctx=c.getContext('2d'),m=job.pages[region.num-1];
    ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(region.source,0,0);
    const b=region.box;
    if(b){
      const sx=c.width/m.w,sy=c.height/m.h,x=b[0]*sx,y=b[1]*sy,w=(b[2]-b[0])*sx,h=(b[3]-b[1])*sy;
      ctx.fillStyle='rgba(33,91,160,.12)';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#16589c';ctx.lineWidth=2;ctx.strokeRect(x,y,w,h);
    }
    $('useRegion').disabled=!b||b[2]-b[0]<4||b[3]-b[1]<4||region.saving;
    $('regionInfo').textContent=b?'第 '+region.num+' 页 · '+Math.round(b[2]-b[0])+' × '+Math.round(b[3]-b[1])+' pt':'在页面上拖动绘制一个矩形';
  }
  async function displayPage(n){
    const j=job,r=region;if(!j||!r||r.saving)return;
    const token=++pageRequest;n=Math.max(1,Math.min(j.pages.length,Math.round(Number(n)||1)));r.num=n;r.start=null;r.source=null;
    r.box=r.record?.page===n?r.record.box?.slice():null;$('useRegion').disabled=true;
    $('pageNum').value=n;$('pagePrev').disabled=n===1;$('pageNext').disabled=n===j.pages.length;
    $('regionInfo').textContent='正在渲染第 '+n+' 页…';
    const board=$('pageBoard');board.width=board.height=1;
    try{
      const source=await PaperPDF.render(j.doc,n,null,Math.min(1.8,1020/j.pages[n-1].w));
      if(region!==r||job!==j||token!==pageRequest){source.width=source.height=1;return;}
      r.source=source;board.width=source.width;board.height=source.height;drawRegion();
    }catch(e){if(region===r&&token===pageRequest)$('regionInfo').textContent=e.message;}
  }
  function openRegion(rec){
    if(!job||locked())return;
    const r=region={record:rec,num:rec?.page||job.active?.page||1,saving:false};
    let i=1;while(job.entries.some(q=>q.name.toLowerCase()==='fig '+i))i++;
    $('regionName').value=rec?.name||'Fig '+i;$('pageNum').max=job.pages.length;$('pageTotal').textContent='/ '+job.pages.length;
    $('pageDialog').showModal();displayPage(r.num);
  }
  async function applyRegion(){
    const j=job,r=region;if(!j||!r?.box||r.saving||locked())return;
    const name=$('regionName').value.trim();
    if(!PanelFiles.validName(name)||j.entries.some(q=>q!==r.record&&q.name.toLowerCase()===name.toLowerCase())){$('regionInfo').textContent='请输入唯一且有效的 Figure 名称。';return;}
    r.saving=true;phase(j,'switch');$('pageDialog').querySelectorAll('button,input').forEach(b=>b.disabled=true);
    $('regionInfo').textContent='正在按新范围提取 Panel…';
    try{
      await flush(j);
      const rec={...r.record,name,page:r.num,box:r.box.slice(),resolution:null,kind:r.record?.kind||'manual',enabled:true,outputs:null,saved:null,dirty:false,uncertain:false,problem:null};
      const m=await generate(j,rec,true);if(j!==job)return;
      if(rec.groupId&&name!==r.record.name){
        for(const q of j.entries.filter(q=>q.groupId===rec.groupId))q.group=name;
        rec.group=name;
      }
      if(r.record)j.entries.splice(j.entries.indexOf(r.record),1,rec);
      else{const at=j.entries.findIndex(q=>q.page>rec.page);j.entries.splice(at<0?j.entries.length:at,0,rec);}
      mount(j,rec,m);$('pageDialog').close();PanelEditor.status('已从第 '+r.num+' 页提取 '+name+'。');
    }catch(e){if(j===job)$('regionInfo').textContent='提取失败。'+e.message;}
    finally{if(j===job){r.saving=false;$('pageDialog').querySelectorAll('button,input').forEach(b=>b.disabled=false);phase(j,'ready');nav(j);}}
  }
  function init(){
    $('closePdf').onclick=()=>leave(true);$('batchReview').onclick=review;$('backToPaper').onclick=()=>$('batchDialog').close();
    $('downloadPaper').onclick=()=>download('zip');$('downloadSlides').onclick=()=>download('pptx');
    $('archiveName').oninput=()=>{if(job)reviewState(job);};
    for(const id of ['batchAll','batchNone'])$(id).onclick=()=>{
      if(!job)return;const yes=id==='batchAll';
      for(const r of job.entries){r.enabled=yes&&!!r.outputs?.length;for(const p of r.outputs||[])setPack(job,r,p,yes);}
      gallery(job);
    };
    $('batchDialog').oncancel=e=>{if(job?.phase==='export')e.preventDefault();};
    $('pngClose').onclick=()=>$('pngDialog').close();
    $('pngDialog').onclose=()=>{if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl='';$('pngImage').removeAttribute('src');};
    $('addFigure').onclick=()=>openRegion(null);$('reframe').onclick=()=>openRegion(job?.active);
    $('pageClose').onclick=()=>$('pageDialog').close();$('pageDialog').oncancel=e=>{if(region?.saving)e.preventDefault();};
    $('pageDialog').onclose=()=>{pageRequest++;region=null;const c=$('pageBoard');c.width=c.height=1;};
    $('pagePrev').onclick=()=>displayPage(region.num-1);$('pageNext').onclick=()=>displayPage(region.num+1);
    $('pageNum').onchange=()=>displayPage($('pageNum').value);$('useRegion').onclick=applyRegion;
    const c=$('pageBoard'),stage=$('pageStage');
    function at(e){const r=c.getBoundingClientRect(),p=job.pages[region.num-1];return [Math.max(0,Math.min(p.w,(e.clientX-r.left)*p.w/r.width)),Math.max(0,Math.min(p.h,(e.clientY-r.top)*p.h/r.height))];}
    function trace(e){if(!region?.start||region.pointer!==e.pointerId)return;
      const a=region.start,b=at(e);region.box=[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];drawRegion();}
    stage.onpointerdown=e=>{
      if(!region?.source||region.saving||region.start||e.button!==0)return;
      const bounds=stage.getBoundingClientRect();
      if(e.clientX>=bounds.left+stage.clientLeft+stage.clientWidth||e.clientY>=bounds.top+stage.clientTop+stage.clientHeight)return;
      e.preventDefault();region.previous=region.box;region.start=at(e);region.pointer=e.pointerId;
      stage.setPointerCapture(e.pointerId);trace(e);
    };
    stage.onpointermove=trace;
    function finish(e,commit){
      if(!region?.start||region.pointer!==e.pointerId)return;
      if(commit)trace(e);
      const b=region.box;
      if(!commit||!b||b[2]-b[0]<4||b[3]-b[1]<4)region.box=region.previous;
      region.start=null;region.pointer=null;
      if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);
      drawRegion();
    }
    stage.onpointerup=e=>finish(e,true);
    stage.onpointercancel=stage.onlostpointercapture=e=>finish(e,false);
  }
  return {init,locked,changed,leave,load,showImage};
})();

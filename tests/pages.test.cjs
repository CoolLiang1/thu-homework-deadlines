'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createRequire } = require('node:module');
const deps = createRequire(path.resolve(__dirname, 'package.json'));
const { JSDOM, VirtualConsole } = deps('jsdom');
const jquery = fs.readFileSync(deps.resolve('jquery'), 'utf8');
const datatables = fs.readFileSync(deps.resolve('datatables.net'), 'utf8');
const core = require('../thu-homework-deadlines.user.js');
const origin = 'https://learn.tsinghua.edu.cn';
const page = origin + '/f/wlxt/kczy/zy/student/beforePageList?wlkcid=synthetic';
const headers = ['序号','作业题目','发布对象','完成方式','生效日期','截止日期(GMT+8)','截止倒计时','操作'];
function table(id = 'wtj') { return `<table id="${id}"><thead><tr>${headers.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody></tbody></table>`; }
function values(count, prefix = '合成作业') { return Array.from({length:count}, (_,i) => [i+1, prefix+(i+1), '全体','个人','2026-10-01 08:00','2026-12-31 23:59','未来','']); }
function dom(html = table(), url = page) {
  const d = new JSDOM(html, { url, runScripts:'outside-only', pretendToBeVisual:true });
  d.window.eval(jquery); d.window.eval(datatables); d.window.alert = () => {};
  return d;
}
const options = { timeout:300, poll:5, stable:10, maxPages:50, maxRows:1500 };
function session(d, extra = {}) { return core.createSession(d.window.document, d.window, 'synthetic', origin, { ...options,...extra }); }

test('课程定位来自真实截图结构和原作业链接，保留原顺序且不硬编码ID', () => {
  const d=dom(`<div id="selfcourse" class="dd">${['B','A'].map(x=>`<div class="item"><div class="hdtitle">合成课程${x}</div><ul class="state stu clearfix"><li class="clearfix"><a class="uuuhhh" target="_blank" href="/f/wlxt/kczy/zy/student/beforePageList?wlkcid=course${x}"><span class="name zuoye">作业</span><span class="stud">1 未提交</span></a></li></ul></div>`).join('')}</div>`);
  const slots=core.findCourseSlots(d.window.document);
  assert.deepEqual(slots.map(x=>x.courseId),['courseB','courseA']); assert.equal(slots[0].slot.tagName,'LI'); assert.equal(slots[0].nativeCount,1);
  assert.ok(slots[0].card.contains(slots[0].slot)); d.window.close();
});

test('只允许同源正常beforePageList且仅wlkcid参数；拒绝额外校验参数和任意路径', () => {
  assert.equal(core.pageLink(page).courseId,'synthetic');
  for(const bad of [page+'&extra=synthetic',page+'&wlkcid=other','https://example.com'+new URL(page).pathname+'?wlkcid=synthetic',origin+'/other?wlkcid=synthetic',page+'#x']) assert.throws(()=>core.pageLink(bad));
});

test('根据实际列头解析第6列日期，安全读取标题且不混用列', () => {
  const d=dom(); const t=d.window.document.querySelector('table'); const tr=t.tBodies[0].insertRow();
  const row=values(1)[0]; row[1]='<script>合成文字</script>'; row.forEach(text=>tr.insertCell().textContent=text);
  const cols=core.columnsOf(t); assert.equal(cols.deadline,5);
  const [task]=core.parseRows([tr],cols,'synthetic','unsubmitted');
  assert.equal(task.title,'<script>合成文字</script>'); assert.equal(task.deadline.ms,Date.UTC(2026,11,31,15,59)); d.window.close();
});

test('初始静态空表不能被当成无作业；超时返回RENDER', async () => {
  const d=dom(); const s=session(d,{timeout:40});
  const result=await s.read('unsubmitted'); assert.equal(result.complete,false); assert.equal(result.code,'RENDER'); assert.match(result.warning,/初始空表/);
  s.close(); d.window.close();
});

test('真实DataTables：等待延迟初始化与网站脚本填充tbody后读取', async () => {
  const d=dom(); const s=session(d);
  d.window.setTimeout(()=>d.window.jQuery('#wtj').DataTable({data:values(2),pageLength:30,dom:'tip'}),30);
  const result=await s.read('unsubmitted'); assert.equal(result.complete,true); assert.equal(result.tasks.length,2); assert.equal(result.total,2);
  s.close(); d.window.close();
});

test('真实DataTables：客户端65条/3页直接读取所有原有行节点', async () => {
  const d=dom(); const api=d.window.jQuery('#wtj').DataTable({data:values(65),pageLength:30,dom:'tip'});
  assert.equal(api.page.info().pages,3); assert.equal(d.window.document.querySelector('tbody').rows.length,30);
  const s=session(d); const result=await s.read('unsubmitted');
  assert.equal(result.complete,true); assert.equal(result.tasks.length,65); assert.equal(api.page(),0);
  s.close(); d.window.close();
});

test('真实DataTables：服务端分页65条逐页正常draw并核对总数', async () => {
  const d=dom(); const all=values(65); const starts=[];
  d.window.jQuery('#wtj').DataTable({serverSide:true,pageLength:30,dom:'tip',ajax(request,callback){ starts.push(request.start); d.window.setTimeout(()=>callback({draw:request.draw,recordsTotal:all.length,recordsFiltered:all.length,data:all.slice(request.start,request.start+request.length)}),8); }});
  const s=session(d); const result=await s.read('unsubmitted');
  assert.equal(result.complete,true); assert.equal(result.tasks.length,65); assert.deepEqual(starts,[0,30,60]);
  assert.equal(new Set(result.tasks.map(x=>x.id)).size,65); s.close(); d.window.close();
});

test('真实DataTables：deferRender行节点不齐时遍历分页而非误报完整', async () => {
  const d=dom(); const api=d.window.jQuery('#wtj').DataTable({data:values(65),deferRender:true,pageLength:30,dom:'tip'});
  assert.equal(api.rows().nodes().length,30); const s=session(d); const result=await s.read('unsubmitted');
  assert.equal(result.complete,true); assert.equal(result.tasks.length,65); s.close(); d.window.close();
});

test('真实DataTables：无Ajax成功证据的零条必须提示未确认，不误报无作业', async () => {
  const d=dom(); d.window.jQuery('#wtj').DataTable({data:[],dom:'tip'});
  const s=session(d,{timeout:45}); const result=await s.read('unsubmitted');
  assert.equal(result.complete,false); assert.match(result.warning,/未确认加载完成/); s.close(); d.window.close();
});

test('真实DataTables：观察到初始化完成事件的空结果可明确确认0条', async () => {
  const d=dom(); const s=session(d);
  d.window.setTimeout(()=>d.window.jQuery('#wtj').DataTable({data:[],dom:'tip'}),15);
  const result=await s.read('unsubmitted'); assert.equal(result.complete,true); assert.equal(result.total,0); assert.deepEqual(result.tasks,[]);
  s.close(); d.window.close();
});

test('真实DataTables：页数上限必须返回部分结果，不能宣称完整', async () => {
  const d=dom(); const all=values(65);
  d.window.jQuery('#wtj').DataTable({serverSide:true,pageLength:30,dom:'tip',ajax(r,cb){d.window.setTimeout(()=>cb({draw:r.draw,recordsTotal:65,recordsFiltered:65,data:all.slice(r.start,r.start+r.length)}),5);}});
  const s=session(d,{maxPages:1}); const result=await s.read('unsubmitted'); assert.equal(result.complete,false); assert.equal(result.tasks.length,30); assert.match(result.warning,/上限|不一致/);
  s.close(); d.window.close();
});

test('真实DataTables：原站筛选少于总数时明确标记未完整读取', async () => {
  const d=dom();
  d.window.jQuery('#wtj').DataTable({serverSide:true,pageLength:30,dom:'tip',ajax(r,cb){d.window.setTimeout(()=>cb({draw:r.draw,recordsTotal:7,recordsFiltered:1,data:values(1)}),5);}});
  const s=session(d); const result=await s.read('unsubmitted'); assert.equal(result.complete,false); assert.match(result.warning,/筛选条件/); s.close(); d.window.close();
});

test('真实DataTables：第二页网络错误保留已读页并标记部分结果', async () => {
  const d=dom(); const $=d.window.jQuery;
  $('#wtj').DataTable({serverSide:true,pageLength:30,dom:'tip',ajax(r,cb){if(r.start===0)d.window.setTimeout(()=>cb({draw:r.draw,recordsTotal:40,recordsFiltered:40,data:values(30)}),5);else d.window.setTimeout(()=>$(d.window.document).trigger('ajaxError',[{status:500}]),5);}});
  const s=session(d); const result=await s.read('unsubmitted'); assert.equal(result.complete,false); assert.equal(result.tasks.length,30); assert.equal(result.code,'NETWORK'); s.close(); d.window.close();
});

test('正常页面403、课程不一致和登录跳转均停止，不尝试校验绕行', async () => {
  const cases=[['<title>403 Forbidden</title>'+table(),page,'ACCESS'],[table(),page.replace('synthetic','other'),'COURSE'],[table(),origin+'/login','LOGIN']];
  for(const [html,url,code] of cases){const d=dom(html,url); const s=session(d,{timeout:20}); const result=await s.read('unsubmitted'); assert.equal(result.code,code); assert.equal(result.complete,false); s.close();d.window.close();}
});

test('真实DataTables：状态标签通过原页面切换，记录归类与默认过滤正确', async () => {
  const d=dom('<a id="pending">未提交</a><a id="submitted">已提交未批改</a><a id="graded">已批改</a>'+table()+`<div id="completed" style="display:none">${table('done')}</div>`);
  const $=d.window.jQuery; $('#wtj').DataTable({data:values(1,'待交'),dom:'tip'}); $('#done').DataTable({data:values(2,'已交'),dom:'tip'});
  d.window.document.getElementById('submitted').addEventListener('click',()=>{$('#wtj_wrapper').hide();$('#completed').show();});
  const s=session(d); const pending=await s.read('unsubmitted'); const submitted=await s.read('submitted');
  assert.equal(pending.tasks[0].status,'unsubmitted'); assert.equal(submitted.complete,true); assert.equal(submitted.tasks.length,2); assert.equal(submitted.tasks[0].status,'submitted');
  assert.equal(core.visibleTasks([...pending.tasks,...submitted.tasks],false).length,1); s.close(); d.window.close();
});

test('缺失日期、错误列头和总数文字均保守处理', () => {
  const d=dom();const t=d.window.document.querySelector('table'); const r=t.tBodies[0].insertRow(); values(1)[0].forEach((v,i)=>r.insertCell().textContent=i===5?'':v);
  assert.equal(core.parseRows([r],core.columnsOf(t),'synthetic','unsubmitted')[0].deadline.ms,null);
  t.querySelectorAll('th')[5].textContent='未知列'; assert.equal(core.columnsOf(t),null);
  assert.equal(core.readTotal({textContent:'共1,200条数据'}),1200);assert.equal(core.readTotal({textContent:'尚未加载'}),null); d.window.close();
});

test('未交表wtj不能在标签切换未成功时被当作已交或已批记录', async () => {
  const d=dom('<a>已提交未批改</a>'+table()); d.window.jQuery('#wtj').DataTable({data:values(1),dom:'tip'});
  const s=session(d,{timeout:30}); const result=await s.read('submitted'); assert.equal(result.complete,false); assert.equal(result.tasks.length,0); s.close(); d.window.close();
});

test('浏览器返回about:blank属于嵌入失败，不能误判为用户未登录', () => {
  assert.throws(()=>core.safePageCheck({title:''},{location:{protocol:'about:',origin:'null',pathname:'blank'}},'synthetic',origin),error=>error.code==='FRAME');
});

test('受控正常页面加载器：真实同源iframe与延迟DataTables脚本渲染，可读取任务', async () => {
  const requests=[]; const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');requests.push(url.pathname);
    if(url.pathname==='/jquery.js'){res.setHeader('Content-Type','text/javascript');res.end(jquery);return;}
    if(url.pathname==='/dt.js'){res.setHeader('Content-Type','text/javascript');res.end(datatables);return;}
    if(url.pathname==='/f/wlxt/kczy/zy/student/beforePageList'){
      res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<!doctype html><title>合成正常列表</title><script src="/jquery.js"></script><script src="/dt.js"></script>${table()}<script>setTimeout(function(){jQuery('#wtj').DataTable({data:${JSON.stringify(values(2))},dom:'tip'});},35);</script>`);return;
    }
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><body>合成首页</body>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); const testOrigin='http://127.0.0.1:'+server.address().port;
  const vc=new VirtualConsole(); if(process.env.THU_DDL_TEST_DEBUG)vc.sendTo(console); const d=new JSDOM('<!doctype html><body></body>',{url:testOrigin+'/home',runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc});
  try { const reader=await core.openPageReader(d.window,{url:testOrigin+'/f/wlxt/kczy/zy/student/beforePageList?wlkcid=synthetic',courseId:'synthetic'},{...options,timeout:2500,origin:testOrigin});
    const result=await reader.read('unsubmitted'); assert.equal(result.complete,true); assert.equal(result.tasks.length,2);assert.equal(d.window.document.querySelectorAll('iframe').length,1);reader.close();assert.equal(d.window.document.querySelectorAll('iframe').length,0);
    assert.deepEqual(requests,['/f/wlxt/kczy/zy/student/beforePageList','/jquery.js','/dt.js']);
  }finally{d.window.close();await new Promise(resolve=>server.close(resolve));}
});

test('脚本权限、拒绝端点删除、无外部请求或凭据访问、无独立面板', () => {
  const code=fs.readFileSync(path.resolve(__dirname,'../thu-homework-deadlines.user.js'),'utf8');
  const executable=code.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
  for(const pattern of [/getCurrentAndNextSemester/, /document\s*\.\s*cookie/, /localStorage/, /sessionStorage/, /getResponseHeader/, /getRequestHeader/, /fetch\s*\(/, /XMLHttpRequest/, /innerHTML\s*=/, /outerHTML\s*=/, /\.submit\s*\(/, /tjzy/, /console\s*\./]) assert.doesNotMatch(executable,pattern);
  assert.equal((code.match(/^\/\/ @match/gm)||[]).length,1);assert.doesNotMatch(code,/^\/\/ @(require|connect|resource)/m);
  assert.doesNotMatch(code,/createElement\(['"](?:dialog|aside)['"]\)/); assert.match(code,/slot\.card\.insertBefore\(host/);
  assert.doesNotMatch(code,/slot\.slot\.append\(host\)/);
});

'use strict';
// Isolated localhost fixture only. Never uses a real browser profile or real site.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{createRequire}=require('node:module');
const deps=createRequire(path.resolve(__dirname,'package.json'));
async function startFixture({fallbackTitle=false}={}){
  const jquery=fs.readFileSync(deps.resolve('jquery'),'utf8'),dt=fs.readFileSync(deps.resolve('datatables.net'),'utf8');
  const source=fs.readFileSync(path.resolve(__dirname,'../thu-homework-deadlines.user.js'),'utf8');
  const now=Date.now(),HOUR=3600000;
  const specs=[
    {id:'courseB',dates:[now-100*HOUR,now-HOUR,now+6*HOUR,now+6*HOUR,now+48*HOUR],level:'red',overdue:1,same:2},
    {id:'courseA',dates:[now+48*HOUR,now+200*HOUR,Date.UTC(2035,11,31)],level:'orange'},
    {id:'courseYellow',dates:[now+100*HOUR],level:'yellow'},
    {id:'courseNormal',dates:[Date.UTC(2035,11,31)],level:'normal'},
    {id:'courseZero',dates:[],hidden:true},
    {id:'courseOld',dates:[now-73*HOUR],hidden:true},
    {id:'courseRecent',dates:[now-3*HOUR,now-74*HOUR],overdue:1},
    {id:'courseUnknown',dates:[null],unknown:true}
  ];
  for(const spec of specs)spec.next=spec.dates.filter(x=>x>now).sort((a,b)=>a-b)[0]||null;
  // These are compatibility fixtures, not a claim about unexpanded real-site DOM.
  const names=['工程系统分析与建模（合成课程）','经济学导论（合成课程）','热力学与传热学基础（合成课程）','跨年度课程截止时间（合成课程）','大学体育（合成课程）','机械设计基础（合成课程）','近期逾期课程（合成课程）','日期待核对课程（合成课程）'];
  const heading=(spec,index)=>{
    const title='<a class="fixture-course-title" href="#'+spec.id+'" data-native-link>'+names[index]+'('+spec.id+')</a>';
    const teacher='<span class="fixture-teacher">合成教师</span>';
    const schedule='<span class="fixture-schedule">第1-16周星期二第6节，合成教室A101</span>';
    const content=index===3?names[index]+'('+spec.id+')':index===1?'<div class="fixture-title-group">'+title+teacher+'</div>'+schedule:title+teacher+schedule;
    return '<div class="'+(fallbackTitle&&index===7?'fixture-missing-heading':'hdtitle')+'" data-heading-shape="'+(index===3?'text':index===1?'nested-floats':'direct-elements')+'">'+content+'</div>';
  };
  const requests=[];let browserReport=null;
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');requests.push(url.pathname);
    if(url.pathname==='/fixture-report'){let body='';req.on('data',chunk=>{body+=chunk;if(body.length>20000)req.destroy();});req.on('end',()=>{browserReport=JSON.parse(body);res.end('ok');});return;}
    if(url.pathname==='/jquery.js'){res.setHeader('Content-Type','text/javascript');res.end(jquery);return;}
    if(url.pathname==='/dt.js'){res.setHeader('Content-Type','text/javascript');res.end(dt);return;}
    if(url.pathname==='/userscript.js'){res.setHeader('Content-Type','text/javascript');res.end(source.replace("const ORIGIN = 'https://learn.tsinghua.edu.cn';",'const ORIGIN = '+JSON.stringify(base)+';'));return;}
    if(url.pathname==='/f/wlxt/kczy/zy/student/beforePageList'){
      const spec=specs.find(x=>x.id===url.searchParams.get('wlkcid'));
      const data=spec.dates.map((date,i)=>[i+1,spec.id+' 超长合成作业名称'.repeat(40)+(i+1),'全部','个人','2026-10-01 08:00',date===null?'':new Date(date).toISOString(),'未交','']);
      const headers=['序号','作业题目','发布对象','完成方式','生效日期','截止日期(GMT+8)','截止倒计时','操作'];
      res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<!doctype html><meta charset="utf-8"><title>合成测试列表</title><script src="/jquery.js"></script><script src="/dt.js"></script><table id="wtj"><thead><tr>${headers.map(x=>'<th>'+x+'</th>').join('')}</tr></thead><tbody></tbody></table><script>setTimeout(()=>jQuery('#wtj').DataTable({data:${JSON.stringify(data)},dom:'tip',pageLength:30}),30);</script>`);return;
    }
    if(url.pathname==='/favicon.ico'){res.statusCode=204;res.end();return;}
    res.setHeader('Content-Type','text/html;charset=utf-8');
    res.end(`<!doctype html><meta charset="utf-8"><title>LOCAL SYNTHETIC FIXTURE</title><style>
      html{overflow-y:scroll;scrollbar-gutter:stable}#fixture-report{display:none}body{font:14px "Microsoft YaHei",Arial,sans-serif;margin:20px;max-width:1320px;background:#eef0f3}nav{background:#168fe5;color:white;padding:20px}
      .item{height:78px;background:white;padding:12px 16px;margin:10px 0;border-radius:6px;box-sizing:border-box}
      .hdtitle,.fixture-missing-heading{display:flow-root;height:25px;line-height:24px;color:#168fe5;white-space:nowrap;border-bottom:1px solid #e0e3e6;box-sizing:border-box;overflow:hidden}
      .fixture-course-title{font-size:14px;color:#168fe5;text-decoration:none}.fixture-teacher{margin-left:20px;color:#888;font-size:12px}.fixture-schedule{float:right;color:#888;font-size:12px}.fixture-title-group{float:left}.fixture-title-group>.fixture-course-title,.fixture-title-group>.fixture-teacher{float:left}
      .state{margin:0;padding:0;list-style:none}.state:after{content:'';display:block;clear:both}
      .state li{float:left;width:16.666666%;height:24px;box-sizing:border-box;font-size:12px}.state a{color:#444;text-decoration:none}.stud{color:#b46b00}
    </style><nav>课程 DDL · 标题同行预览（合成数据）</nav><div id="selfcourse" class="dd">${specs.map((spec,index)=>`<div class="item" data-fixture-course="${spec.id}">${heading(spec,index)}<ul class="state stu clearfix"><li>公告 0</li><li>课件 0</li><li class="clearfix"><a class="uuuhhh" target="_blank" href="/f/wlxt/kczy/zy/student/beforePageList?wlkcid=${spec.id}"><span class="name zuoye">作业</span><span class="stud">${spec.dates.length}</span></a></li><li>讨论 0</li><li>答疑 0</li><li>问卷 0</li></ul></div>`).join('')}</div>
    <script>
      window.fixtureShadows=new Map();const original=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){const root=original.call(this,options);window.fixtureShadows.set(this,root);return root;};
      window.nativeClicks=0;window.nativeElements=[...document.querySelectorAll('[data-native-link]')].map(link=>({link,parent:link.parentElement,href:link.getAttribute('href')}));nativeElements.forEach(({link})=>link.addEventListener('click',event=>{event.preventDefault();nativeClicks++;}));
      window.nativeGeometry=[...document.querySelectorAll('.item')].map(card=>{const cr=card.getBoundingClientRect(),ul=card.querySelector('ul').getBoundingClientRect(),heading=card.querySelector('[data-heading-shape]').getBoundingClientRect();return {height:cr.height,titleHeight:heading.height,ulOffset:ul.top-cr.top,columns:[...card.querySelectorAll('li')].map(li=>{const r=li.getBoundingClientRect();return [(r.left-ul.left)/ul.width,r.top-ul.top,r.width/ul.width,r.height];})};});
    </script><script src="/userscript.js"></script><pre id="fixture-report">waiting</pre><script>
    (async()=>{
      const specs=${JSON.stringify(specs)},fallbackTitle=${JSON.stringify(fallbackTitle)},until=Date.now()+12000;
      // Headless virtual time can stop advancing animation frames before a
      // screenshot. A bounded timer still lets toggle/focus tasks complete.
      const settle=()=>new Promise(resolve=>{requestAnimationFrame(()=>requestAnimationFrame(resolve));setTimeout(resolve,60);});
      while(Date.now()<until){
        await new Promise(r=>setTimeout(r,100));
        const cards=[...document.querySelectorAll('#selfcourse>.item')],hosts=cards.map(card=>card.querySelector('[data-thu-ddl-inline]')),roots=hosts.map(host=>fixtureShadows.get(host));
        const ready=cards.every((card,i)=>{const root=roots[i],spec=specs[i];if(!root)return false;if(spec.next)return root.querySelector('.main-badge')?.dataset.deadline===String(spec.next);if(spec.overdue)return root.querySelector('.overdue-count')?.textContent==='逾期'+spec.overdue+'项';if(spec.unknown)return root.querySelector('.small-note')?.textContent==='1项日期待核对';return hosts[i].hidden;});
        if(!ready||document.querySelector('iframe'))continue;
        await settle();
        const rects=cards.map(card=>card.getBoundingClientRect());
        const isFallback=i=>fallbackTitle&&i===7;
        const inside=(r,outer)=>r.left>=outer.left-0.5&&r.right<=outer.right+0.5&&r.top>=outer.top-0.5&&r.bottom<=outer.bottom+0.5;
        const menuChecks=[];
        for(let i=0;i<cards.length;i++){
          if(hosts[i].hidden)continue;
          const root=roots[i],details=root.querySelector('.tools'),toggle=details?.querySelector('summary');
          const before=cards[i].getBoundingClientRect(),barBefore=cards[i].querySelector('ul').getBoundingClientRect();
          toggle?.click();await settle();
          const panel=root.querySelector('.menu'),button=root.querySelector('button'),pr=panel?.getBoundingClientRect(),br=button?.getBoundingClientRect();
          button?.focus();
          const hit=br&&root.elementFromPoint(br.left+br.width/2,br.top+br.height/2);
          const after=cards[i].getBoundingClientRect(),barAfter=cards[i].querySelector('ul').getBoundingClientRect();
          menuChecks.push({course:cards[i].dataset.fixtureCourse,opened:!!details?.open,panelInside:!!pr&&pr.width>0&&pr.left>=after.left&&pr.right<=after.right,refreshUsable:!!button&&!button.disabled&&br.width>0&&br.height>0&&root.activeElement===button&&(hit===button||button.contains(hit)),heightUnchanged:Math.abs(before.height-after.height)<0.1&&Math.abs(barBefore.top-barAfter.top)<0.1});
          toggle?.click();await settle();
        }
        const first=roots[0].querySelector('.tools'),second=roots[1].querySelector('.tools');
        first.querySelector('summary').click();await settle();second.querySelector('summary').click();await settle();
        const oneMenuAtATime=!first.open&&second.open;
        document.querySelector('nav').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true}));await settle();
        const outsideCloses=!first.open&&!second.open;
        first.querySelector('summary').click();await settle();
        first.querySelector('summary').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,composed:true}));await settle();
        const escapeCloses=!first.open&&roots[0].activeElement===first.querySelector('summary');
        roots[0].activeElement?.blur();
        nativeElements.forEach(({link})=>link.click());
        const report={kind:'isolated-local-fixture',viewport:innerWidth,fallbackTitle,headingShapes:[...new Set(cards.map(card=>card.querySelector('[data-heading-shape]').dataset.headingShape))],order:cards.map(card=>card.dataset.fixtureCourse),
          correctCourse:cards.every((card,i)=>!specs[i].next||roots[i].querySelector('.main-badge')?.dataset.deadline===String(specs[i].next)),
          oneSummary:roots.every((root,i)=>root.querySelectorAll('.main-badge').length===(specs[i].next?1:0)),
          noNames:roots.every(root=>!root.textContent.includes('超长合成作业名称')),
          noOverlap:rects.every((r,i)=>!i||r.top>=rects[i-1].bottom),
          allInside:cards.every((card,i)=>hosts[i].hidden||inside(hosts[i].getBoundingClientRect(),rects[i])),
          titleInline:cards.every((card,i)=>{if(isFallback(i)||hosts[i].hidden)return true;const title=card.querySelector('.hdtitle'),tr=title.getBoundingClientRect(),hr=hosts[i].getBoundingClientRect(),badge=roots[i].querySelector('.main-badge');return hosts[i].parentElement===title&&hr.top>=tr.top-0.5&&hr.bottom<=tr.bottom+0.5&&(!badge||inside(badge.getBoundingClientRect(),hr));}),
          noStatusOverlap:cards.every((card,i)=>{if(isFallback(i)||hosts[i].hidden)return true;return hosts[i].getBoundingClientRect().bottom<=card.querySelector('ul').getBoundingClientRect().top+0.5;}),
          cardHeightUnchanged:cards.every((card,i)=>isFallback(i)||Math.abs(rects[i].height-nativeGeometry[i].height)<0.1),
          headingHeightUnchanged:cards.every((card,i)=>Math.abs(card.querySelector('[data-heading-shape]').getBoundingClientRect().height-nativeGeometry[i].titleHeight)<0.1),
          nativeHeadingChildrenInside:cards.every((card,i)=>{if(isFallback(i)||hosts[i].hidden)return true;const title=card.querySelector('.hdtitle'),tr=title.getBoundingClientRect();return [...title.children].filter(child=>child!==hosts[i]).every(child=>inside(child.getBoundingClientRect(),tr));}),
          nativeStatusUnchanged:cards.every((card,i)=>{const ul=card.querySelector('ul').getBoundingClientRect();return Math.abs(ul.top-rects[i].top-nativeGeometry[i].ulOffset)<0.1&&[...card.querySelectorAll('li')].every((li,j)=>{const r=li.getBoundingClientRect();return [(r.left-ul.left)/ul.width,r.top-ul.top,r.width/ul.width,r.height].every((v,k)=>Math.abs(v-nativeGeometry[i].columns[j][k])<(k===0||k===2?0.001:0.1))&&li.style.minHeight==='';});}),
          nativeLinksPreserved:nativeClicks===nativeElements.length&&nativeElements.every(({link,parent,href})=>link.parentElement===parent&&link.getAttribute('href')===href),
          fallbackSafe:!fallbackTitle||(hosts[7].parentElement===cards[7]&&hosts[7].getBoundingClientRect().top>=cards[7].querySelector('ul').getBoundingClientRect().bottom&&inside(hosts[7].getBoundingClientRect(),rects[7])),
          menusUsable:menuChecks.every(check=>check.opened&&check.panelInside&&check.refreshUsable&&check.heightUnchanged),menuChecks,
          menuDismissal:oneMenuAtATime&&outsideCloses&&escapeCloses,menuDismissalChecks:{oneMenuAtATime,outsideCloses,escapeCloses},
          nativeCounts:cards.map(card=>card.querySelector('.stud').textContent),
          urgencyBadges:roots.flatMap(root=>[...root.querySelectorAll('.main-badge')].map(x=>x.className)),
          zeroAndOldHidden:[4,5].every(i=>hosts[i].hidden&&hosts[i].getBoundingClientRect().height===0&&rects[i].height===78),
          overdueCounts:roots.map(root=>root.querySelector('.overdue-count')?.textContent||''),
          sameDeadline:roots[0].querySelector('.small-note')?.textContent==='2项同截止',
          unknownVisible:roots[7].querySelector('.small-note')?.textContent==='1项日期待核对',
          iframesRemaining:document.querySelectorAll('iframe').length};
        document.getElementById('fixture-report').textContent=JSON.stringify(report);await fetch('/fixture-report',{method:'POST',body:JSON.stringify(report)});document.title='FIXTURE DONE';return;
      }
      const report={error:'fixture-timeout'};document.getElementById('fixture-report').textContent=JSON.stringify(report);await fetch('/fixture-report',{method:'POST',body:JSON.stringify(report)});
    })().catch(async error=>{const report={error:'fixture-error: '+error.message};document.getElementById('fixture-report').textContent=JSON.stringify(report);await fetch('/fixture-report',{method:'POST',body:JSON.stringify(report)});});</script>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  return {server,base,requests,get report(){return browserReport;},url:base+'/f/wlxt/index/course/student/',close:()=>new Promise(resolve=>server.close(resolve))};
}
module.exports={startFixture};

'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {startFixture}=require('./browser-fixture.cjs');
(async()=>{
  const root=path.resolve(__dirname,'..'),output=path.join(root,'artifacts','browser-fixture');fs.mkdirSync(output,{recursive:true});
  const reports=[];
  const scenarios=[1440,1280,800,640,512].map(width=>({width,fallbackTitle:false})).concat({width:512,fallbackTitle:true});
  for(const {width,fallbackTitle} of scenarios){
    const label=width+(fallbackTitle?'-fallback':'');
    const fixture=await startFixture({fallbackTitle});
    try{
      const executable=process.env.THU_DDL_TEST_CHROME||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      const args=['--headless=new','--no-first-run','--disable-background-networking','--disable-sync','--disable-extensions','--disable-gpu','--user-data-dir='+path.join(output,'isolated-profile-'+label),'--window-size='+width+',1600','--virtual-time-budget=20000','--screenshot='+path.join(output,'title-inline-'+label+'.png'),'--dump-dom',fixture.url];
      const result=await new Promise((resolve,reject)=>{const child=spawn(executable,args,{windowsHide:true});let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(Error('isolated-browser-timeout'));},25000);child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});});
      fs.writeFileSync(path.join(output,'rendered-'+label+'.html'),result.stdout);fs.writeFileSync(path.join(output,'browser-stderr-'+label+'.txt'),result.stderr);
      const report=fixture.report;assert.ok(report,'missing local fixture report');assert.ok(!report.error,JSON.stringify(report));
      fs.writeFileSync(path.join(output,'report-'+label+'.json'),JSON.stringify(report,null,2));
      for(const key of ['correctCourse','oneSummary','noNames','noOverlap','allInside','titleInline','noStatusOverlap','cardHeightUnchanged','headingHeightUnchanged','nativeHeadingChildrenInside','nativeStatusUnchanged','nativeLinksPreserved','fallbackSafe','menusUsable','menuDismissal','zeroAndOldHidden','sameDeadline','unknownVisible'])assert.equal(report[key],true,key+' @'+label);
      assert.deepEqual(report.headingShapes,['direct-elements','nested-floats','text']);
      assert.equal(report.fallbackTitle,fallbackTitle);assert.ok(Number.isFinite(report.viewport)&&report.viewport>0,'actual viewport recorded @'+label);
      assert.deepEqual(report.order,['courseB','courseA','courseYellow','courseNormal','courseZero','courseOld','courseRecent','courseUnknown']);
      assert.deepEqual(report.nativeCounts,['5','3','1','1','0','1','2','1']);assert.deepEqual(report.urgencyBadges,['main-badge red','main-badge orange','main-badge yellow','main-badge normal']);
      assert.deepEqual(report.overdueCounts,['逾期1项','','','','','','逾期1项','']);assert.equal(report.iframesRemaining,0);assert.equal(result.code,0);
      const saved={...report,requestedWidth:width,chromeExit:result.code,nativePageVisits:fixture.requests.filter(x=>x==='/f/wlxt/kczy/zy/student/beforePageList').length};assert.equal(saved.nativePageVisits,7);reports.push(saved);console.log(JSON.stringify(saved));
    }finally{await fixture.close();}
  }
  fs.writeFileSync(path.join(root,'artifacts','layout-test-results.json'),JSON.stringify({kind:'isolated-local-fixture',reports},null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});

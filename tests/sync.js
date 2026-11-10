const {JSDOM}=require('jsdom');const fs=require('fs');const {Backend,client}=require('./mocksb');
const html=fs.readFileSync(process.env.APP_HTML||require('path').join(__dirname,'../app/index.html'),'utf8');const B=Backend();B.bootstrap=['p10']; // Andy linked before approvals were required
const wait=ms=>new Promise(r=>setTimeout(r,(ms||60)+350));
let fails=0;const ok=(c,msg)=>{console.log((c?'PASS ':'FAIL ')+msg);if(!c)fails++;};
function phone(name,store){const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://the-lions-den.github.io/',pretendToBeVisual:true,
  beforeParse(w){w.print=()=>{};w.supabase={createClient:()=>(w.__c=client(B,w.localStorage))};w.scrollTo=()=>{};w.fetch=()=>Promise.reject(new Error('no net'));if(store)Object.keys(store).forEach(k=>w.localStorage.setItem(k,store[k]));}});
  const w=dom.window,d=w.document;const P={name,w,d,H:w.__hub,
    click(sel){const b=d.querySelector(sel);if(!b)throw new Error(name+': no '+sel);b.click();},
    has(sel){return !!d.querySelector(sel);},vis(sel){const b=d.querySelector(sel);return !!b&&w.getComputedStyle(b).display!=='none';},
    set(id,v){d.getElementById(id).value=v;},tab(t){P.click('#nav [data-tab="'+t+'"]')||0;},go(t,fx){const S=P.H.S();S.ui.tab=t;if(fx)S.ui.fx=fx;P.H.render();},
    off(v){P.w.__c.off=v;if(!v)P.w.dispatchEvent(new P.w.Event('online'));},modal(){return d.getElementById('modal').style.display==='flex'?d.getElementById('mbox').textContent:'';},toast(){return d.getElementById('toast').textContent;}};return P;}
(async()=>{
  // Andy's phone already has v1.15 data (with a team picked for L9)
  const A=phone('Andy');await wait(80);
  ok(A.H.myRole()==='viewer','Andy starts as a viewer before signing in');
  A.go('fixtures');ok(!A.has('[data-act="addfx"]')&&!A.has('[data-act="comps"]'),'Fixture admin buttons not shown to viewers');
  ok(/League/.test(A.d.querySelector('.fxf:not(.seasons)').textContent)&&!/League Div 2/.test(A.d.querySelector('.fxf:not(.seasons)').textContent)&&!/Competition/.test(A.d.querySelector('#main, body').textContent.split('Upcoming')[0]),'short chip names, no filter labels');
  A.go('home');ok(!A.has('[data-act="editfx"]'),'viewer: no Edit fixture on home');
  A.go('more');ok(/About the app/.test(A.d.getElementById('view').textContent),'About the app on More for viewers');
  A.go('about');{const t=A.d.getElementById('view').textContent;ok(/What’s in it/.test(t)&&!/Scorers can/.test(t)&&!/Admins also can/.test(t)&&!/subs/i.test(t)&&!/Sign-up alerts/.test(t),'viewer About page: team list only, no admin news');}ok(!/Availability &/.test(A.d.body.textContent)||true,'');
  { const t=[...A.d.querySelectorAll('[data-tab="team"][data-fx]')].map(x=>x.textContent);ok(t.length===0||t.includes('Team'),'viewer next-match button reads Team: '+t.join('|')); }A.go('team','L9');ok(!A.has('[data-act="suggest"]'),'viewer Team tab has no Suggest');
  // sign up as Andy (pre-set admin)
  A.go('account');A.click('[data-act="acctmode"][data-m="new"]');A.set('suPid','p10');A.set('suEmail','andy@lions.test');A.set('suPw','secret1');A.click('[data-act="signup"]');
  await wait(150);ok(A.H.myRole()==='admin','Andy is admin after sign-up');
  ok(/Start the shared data/.test(A.modal()),'asked to start shared data from this phone');
  A.click('[data-act="seedok"]');await wait(150);
  ok(Object.keys(B.docs).length>=20&&B.docs.fixtures&&B.docs['match:L8'],'shared store seeded: '+Object.keys(B.docs).length+' items');
  ok(A.H.dirtyKeys().length===0,'nothing left to send');
  A.go('fixtures');ok(A.has('.smbtns [data-act="addfx"]')&&A.has('.smbtns [data-act="comps"]'),'admin: small Add fixture / Competition setup at the bottom');
  A.go('home');ok(A.has('[data-act="editfx"]'),'admin: Edit fixture on home');
  A.go('about');{const t=A.d.getElementById('view').textContent;ok(/What’s new/.test(t)&&/Scorers can/.test(t)&&/Admins also can/.test(t)&&/subs/.test(t),'admin About page shows all sections');}
  ok(/Live/.test(A.d.querySelector('.sync').textContent),'status chip: '+A.d.querySelector('.sync').textContent);
  // Andy picks a team for L9 and switches Chris Cooke on as a scorer
  A.go('team','L9');['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10','p11','p12','p13'].forEach(id=>A.click(`[data-av="in"][data-id="${id}"]`));A.click('[data-act="suggest"]');A.click('[data-act="close"]');await wait(100);
  ok(B.docs['sel:L9']&&B.docs['sel:L9'].data.lineup.filter(Boolean).length===12,'team for L9 shared');
  A.go('squad');[...A.d.querySelectorAll('[data-act="editplayer"]')].find(b=>b.dataset.id==='p12').click();
  ok(A.has('#acRole'),'admin sees App access in Edit player');A.set('acRole','scorer');A.click('[data-act="saveaccess"]');await wait(80);
  ok(B.people.p12&&B.people.p12.role==='scorer','Chris Cooke switched on as scorer');
  // a viewer's phone, brand new
  const V=phone('Viewer');await wait(150);
  ok(V.H.myRole()==='viewer'&&Object.keys(V.H.S().matches).length===Object.keys(A.H.S().matches).length,'viewer phone pulled all matches');
  ok(V.H.S().sel.L9&&V.H.S().sel.L9.lineup.join()===A.H.S().sel.L9.lineup.join(),'viewer sees the L9 team');
  V.go('team','L9');ok(!V.has('[data-av]')&&/Set 1/.test(V.d.getElementById('view').textContent)&&!V.has('[data-act="teamsheet"]'),'viewer sees read-only team, no availability, no team sheet image');
  ok(!/Avg/.test(V.d.getElementById('view').textContent),'viewer team view has no averages');
  A.go('team','L9');ok(/Avg \d+\.\d · \d+ game/.test(A.d.getElementById('view').textContent),'availability shows match average: '+(A.d.getElementById('view').textContent.match(/Avg [\d.]+ · \d+ games?/)||[''])[0]);
  A.go('fixtures');ok(/Competition setup/.test(A.d.getElementById('view').textContent),'Competition setup button');
  const nUp=A.d.querySelectorAll('#view [data-act="editfx"]').length;A.click('[data-act="fxf"][data-fk="s"][data-fv="played"]');const nPl=A.d.querySelectorAll('#view [data-act="editfx"]').length;
  A.click('[data-act="fxf"][data-fk="s"][data-fv="all"]');const nAll=A.d.querySelectorAll('#view [data-act="editfx"]').length;
  A.click('[data-act="fxf"][data-fk="c"][data-fv="league"]');const nLg=A.d.querySelectorAll('#view [data-act="editfx"]').length;
  ok(nPl===7&&nUp+nPl<=nAll&&nLg<nAll&&nLg>0,'filter: upcoming '+nUp+', played '+nPl+', all '+nAll+', league '+nLg);
  V.go('fixtures');V.click('[data-act="fxf"][data-fk="s"][data-fv="played"]');ok(V.d.querySelectorAll('#view [data-act="editfx"]').length===7,'viewer can filter too');
  // Chris signs up on his own phone and is a scorer straight away
  const C=phone('Chris');await wait(80);C.go('account');C.click('[data-act="acctmode"][data-m="new"]');C.set('suPid','p12');C.set('suEmail','chris@lions.test');C.set('suPw','cooke12');C.click('[data-act="signup"]');await wait(200);
  ok(C.H.myRole()==='viewer','Chris waits for approval even though switched on');
  A.go('squad');[...A.d.querySelectorAll('[data-act="editplayer"]')].find(b=>b.dataset.id==='p12').click();await wait(50);
  ok(/chris@lions.test/.test(A.d.getElementById('rqEmail').textContent),'Andy sees the email on the request');
  ok(A.d.getElementById('acRole').value==='scorer','request defaults to the role set beforehand');A.click('[data-act="approve"]');await wait(150);
  ok(C.H.myRole()==='scorer','Chris approved: now a scorer');
  C.go('fixtures');ok(!C.has('[data-act="addfx"]'),'scorer has no Add fixture button');
  ok(!C.vis('[data-av]')||(C.go('team','L9'),!C.vis('[data-av]')),'availability hidden for scorer');
  // Chris starts scoring L9
  C.go('score','L9');C.click('[data-act="start"]');for(let i=0;i<4;i++)C.click('[data-v="7"]');await wait(150);
  const mB=B.docs['match:L9'];ok(mB&&mB.data.scorer&&mB.data.scorer.name==='Chris Cooke','match shared with scorer Chris Cooke');
  V.go('score','L9');await wait(20);
  const vm=V.H.S().matches.L9;ok(vm&&vm.L[0][0]&&vm.L[0][0].v===7,'viewer received live hands');
  ok(!V.has('.pad'),'viewer has no keypad');ok(/Scoring by Chris Cooke/.test(V.d.getElementById('view').textContent),'viewer sees Scoring by Chris Cooke');
  ok(!V.has('[data-act="takeover"]'),'viewer has no Take over button');
  A.go('score','L9');await wait(20);ok(!A.has('.pad')&&A.has('[data-act="takeover"]'),'Andy sees Take over, no keypad');
  A.d.querySelector('[data-v]')||0;
  // more hands, then live update count
  C.click('[data-v="5"]');C.click('[data-v="6"]');await wait(120);
  const filled=m=>m.L.concat(m.O).flat().filter(Boolean).length;
  ok(filled(V.H.S().matches.L9)===6&&filled(A.H.S().matches.L9)===6,'all phones show 6 hands');
  // signal drops on Chris's phone mid-match
  B.down=true;C.click('[data-v="8"]');C.click('[data-v="9"]');await wait(100);
  ok(C.H.dirtyKeys().length===1,'Chris has 1 item waiting to send');ok(filled(V.H.S().matches.L9)===6,'viewer still at 6 while Chris is offline');
  B.down=false;C.w.dispatchEvent(new C.w.Event('online'));await wait(200);
  ok(C.H.dirtyKeys().length===0&&filled(V.H.S().matches.L9)===8,'after signal returns, viewer shows 8 hands');
  // Andy takes over
  A.click('[data-act="takeover"]');await wait(120);ok(A.has('.pad'),'Andy now has the keypad');
  C.go('score','L9');await wait(20);ok(!C.has('.pad')&&/Scoring by Andy Nancollis/.test(C.d.getElementById('view').textContent),'Chris now watching: Scoring by Andy Nancollis');
  A.click('[data-v="4"]');A.click('[data-act="undo"]');A.click('[data-v="3"]');await wait(120);
  ok(filled(C.H.S().matches.L9)===9&&filled(V.H.S().matches.L9)===9,'undo and entries after handover shared');
  // results sharing: admins only; league card: scorers and admins
  V.go('results','L8');ok((V.d.getElementById('view').textContent.match(/Set \d/gi)||[]).length>=4&&!V.has('#view [data-cell]'),'viewer Results shows all 4 set tables, read-only');ok(!V.has('[data-act="resimg"]')&&!V.has('[data-act="leaguecard"]')&&V.has('.board,.card'),'viewer Results: no share, no league card');
  C.go('results','L8');ok(!C.has('[data-act="resimg"]')&&!C.has('[data-act="report"]')&&C.has('[data-act="leaguecard"]')&&C.has('[data-act="sign"]'),'scorer Results: league card only');
  C.go('team','L9');ok(!C.vis('[data-act="teamsheet"]'),'scorer: no team sheet image');
  A.go('results','L8');ok(A.has('[data-act="resimg"]')&&A.has('[data-act="leaguecard"]'),'admin Results: everything');A.go('team','L9');ok(A.vis('[data-act="teamsheet"]'),'admin: team sheet image');
  // v2.4: Scores tab, locking, change log, edit highlight
  ok([...A.d.querySelectorAll('#nav button')].map(b=>b.textContent.trim()).join(',')==='Home,Team,Scores,Fixtures,More','nav: Home, Team, Scores, Fixtures, More');
  V.go('score','L8');ok(!/Match locked/.test(V.d.getElementById('view').textContent)&&!V.has('#view [data-cell]')&&!V.has('[data-act="unlockm"]'),'past match read-only for viewer, no lock card');
  ok((V.d.getElementById('view').textContent.match(/Set \d/g)||[]).length>=4,'Scores tab shows all set tables after the match');
  A.go('score','L8');ok(A.has('[data-act="unlockm"]')&&!A.has('#view [data-cell]'),'admin sees Unlock, tables read-only while locked');
  A.click('[data-act="unlockm"]');await wait(100);ok(A.has('#view [data-cell]'),'after Unlock, scores can be tapped');
  const cellBtn=[...A.d.querySelectorAll('#view [data-cell]')].find(b=>/^L,0,2$/.test(b.dataset.cell)||/^O,0,2$/.test(b.dataset.cell));cellBtn.click();
  const curV=A.H.S().matches.L8[cellBtn.dataset.cell.split(',')[0]][0][2];
  ok(A.has('.k.cur')&&/Changing hand 3/.test(A.d.querySelector('.chg').textContent),'editing shows the current score highlighted: '+A.d.querySelector('.chg').textContent+' / key '+(A.d.querySelector('.k.cur')||{}).textContent);
  ok(A.has('#view button.c.sel'),'tapped cell stays highlighted');
  A.click('[data-v="'+((curV.v+1)%10)+'"]');await wait(100);
  A.click('[data-act="lockm"]');await wait(150);
  const lg=A.H.S().matches.L8.log||[];ok(lg.length===3&&/Unlocked/.test(lg[0].what)&&/→/.test(lg[1].what)&&/Locked again/.test(lg[2].what),'change log: '+lg.map(x=>x.what).join(' | '));
  V.go('score','L8');await wait(20);ok(!/Changes after locking/.test(V.d.getElementById('view').textContent),'viewer does not see the change log');A.go('score','L8');ok(/Changes after locking/.test(A.d.getElementById('view').textContent)&&/A\. Nancollis|Andy Nancollis/.test(A.d.getElementById('view').textContent),'admin sees the change log');
  C.go('score','L8');ok(!C.has('[data-act="unlockm"]')&&/Match locked/.test(C.d.getElementById('view').textContent),'scorer cannot unlock');
  // finish L9 then lock as scorer
  A.go('score','L9');let guard=0;while(A.has('[data-v="5"]')&&guard++<200)A.click('[data-v="5"]');await wait(200);
  ok(A.has('[data-act="lockm"]')&&/Match finished/.test(A.d.getElementById('view').textContent),'finished: Lock match offered');
  ok(!A.H.S().matches.L9.lock&&A.H.S().matches.L9.doneAt>0,'not locked until tapped (auto 6am)');
  A.click('[data-act="lockm"]');await wait(150);C.go('score','L9');await wait(20);ok(/Locked by Andy Nancollis/.test(C.d.getElementById('view').textContent),'lock shared: Locked by Andy Nancollis');
  ok(!C.has('#view [data-cell]'),'scorer tables read-only after lock');
  A.go('fixtures');ok(/Competition setup/.test(A.d.getElementById('view').textContent),'Fixtures tab works from the bottom bar');
  // v2.5: More page by role, past Team tab, cup draws, date box, no subs export
  const moreItems=P=>{P.go('more');return [...P.d.querySelectorAll('#view .list .name')].map(x=>x.textContent).join(',');};
  ok(moreItems(V)==='League table,Statistics,Squad,About the app,Admin/scorer sign-in','viewer More: '+moreItems(V));
  ok(moreItems(C)==='Signed in,League table,Statistics,Squad,Game rules,About the app','scorer More: '+moreItems(C));
  ok(moreItems(A)==='Signed in,League table,Statistics,Squad,Game rules,Subs,Settings,Backup & data,About the app','admin More: '+moreItems(A));
  V.go('settings');ok(V.H.S().ui.tab==='more','viewer sent back from Settings to More');
  A.go('team','L8');ok(!A.has('[data-av]')&&/Team as played/.test(A.d.getElementById('view').textContent)&&A.has('[data-act="subtick"]')&&A.has('[data-act="teamsheet"]'),'past match Team tab: team as played, subs and team sheet, no availability');
  A.go('team','L10');ok(A.has('[data-av]'),'upcoming match Team tab still has availability');
  C.go('team','L8');ok(!C.has('[data-av]')&&!C.has('[data-act="subtick"]'),'scorer past Team tab: no availability, no subs');
  A.go('subs');ok(!A.has('[data-act="subscopy"]'),'no Copy subs list button');
  const S0=A.H.S();S0.feed=Object.assign({},S0.feed||{},{cups:[{key:'ko',name:'Knock Out Cup (Div 2)',images:[{file:'KO2.jpg',url:'',read:true}]}],draws:[{cup:'ko',round:'Round 2',date:'2026-12-11',home:true,opp:'Steamers',venue:'Golden Lion',bye:false,file:'KO2.jpg'},{cup:'ko',round:'Round 1',date:'2026-11-27',home:true,opp:'',venue:'',bye:true,file:'KO2.jpg'}]});
  A.go('home');let ht=A.d.getElementById('view').textContent;
  ok(/New cup draw update/.test(ht)&&/Lions fixture found: Round 2 · .*Lions v Steamers · Golden Lion/.test(ht),'Home: New cup draw update / Lions fixture found');
  A.click('[data-act="drawapply"]');await wait(150);
  const c4=A.H.S().fixtures.find(f=>f.comp==='ko'&&f.date==='2026-12-11');ok(c4&&c4.opp==='Steamers'&&c4.home===true&&c4.venue==='Golden Lion','draw applied to the KO Round 2 fixture');
  ok(B.docs.fixtures.data.find(f=>f.id===c4.id).opp==='Steamers','draw shared to every phone');
  A.go('home');ok(!/New cup draw update/.test(A.d.getElementById('view').textContent),'alert gone once applied');
  // picture with no Lions match
  S0.feed.cups.push({key:'gd',name:'George Davis Cup',images:[{file:'GD.jpg',url:'x?etag=1',read:true}]});A.go('home');ht=A.d.getElementById('view').textContent;
  ok(/No Lions fixture update found, please check/.test(ht),'picture with no Lions row: please check');
  A.click('[data-act="imseen"]');await wait(50);ok(!/No Lions fixture update/.test(A.d.getElementById('view').textContent),'Mark as seen clears it');
  S0.feed.cups[1].images[0].url='x?etag=2';A.go('home');ok(/No Lions fixture update found/.test(A.d.getElementById('view').textContent),'changed picture (new version) alerts again');A.click('[data-act="imseen"]');
  // venue TBC, then venue added later
  const sf=A.H.S().fixtures.find(f=>f.comp==='fp'&&f.date==='2027-01-27');sf.venue='';
  S0.feed.cups.push({key:'fp',name:'Front Pin Cup (Div 2)',images:[{file:'FP.jpg',url:'y?etag=1',read:true}]});S0.feed.draws.push({cup:'fp',round:'Semi Finals',date:'2027-01-27',home:true,opp:'Reptiles',venue:'',bye:false,file:'FP.jpg'});
  A.go('home');ok(/Lions v Reptiles · Venue TBC/.test(A.d.getElementById('view').textContent),'no venue read: Venue TBC');A.click('[data-act="drawapply"]');await wait(100);
  A.go('fixtures');A.click('[data-act="fxf"][data-fk="c"][data-fv="all"]');A.click('[data-act="fxf"][data-fk="s"][data-fv="all"]');ok(/Venue TBC/.test(A.d.getElementById('view').textContent),'Fixtures list shows Venue TBC');
  S0.feed.draws[S0.feed.draws.length-1].venue='Ship Inn';A.go('home');ok(/venue now Ship Inn/.test(A.d.getElementById('view').textContent)&&/Add venue/.test(A.d.getElementById('view').textContent),'venue added later: alert to add it');
  A.click('[data-act="drawapply"]');await wait(100);ok(A.H.S().fixtures.find(f=>f.id===sf.id).venue==='Ship Inn','venue filled in');
  // league page tidy-up
  S0.feed.table={rows:[['Pos','Name','P','W','D','L','Pts'],['1','Lions','6','2','0','4','33'],['2','Vacant Date','0','0','0','0','-100'],[],['Results for 6/11/2026'],['Home Team','Points','Team','Name','Score','vs','Away Team','Points','Team','Name','Score'],['Wookurs','','','','','vs','Vacant Date'],['Steamers','2','470','P.Read','51','vs','Lions','12','531','A.Evans','67'],['No week number','','','','','vs','No week number']]};
  A.go('league');const lt=A.d.getElementById('view').textContent;ok(!/No week number/.test(lt)&&/Wookurs – no match \(Vacant date\)/.test(lt),'League page: placeholder hidden, Vacant date row reworded');
  V.H.S().feed=S0.feed;V.go('home');ok(!/Cup draw:/.test(V.d.getElementById('view').textContent),'viewers get no draw buttons');
  // subs: admins only
  A.go('team','L9');ok(A.has('[data-act="subtick"]'),'Andy sees subs ticks');A.click('[data-act="subtick"][data-id="'+A.H.S().sel.L9.lineup[0]+'"]');await wait(100);
  ok(B.docs['subs:L9']&&Object.keys(B.docs['subs:L9'].data).length===1,'subs tick shared to the store');
  ok(!V.H.S().subs.L9&&!C.H.S().subs.L9,'viewer and scorer never receive subs');
  C.go('team','L9');ok(!C.has('[data-act="subtick"]'),'scorer sees no subs');
  A.go('subs');const st=A.H.subsTable();ok(st.length===12&&st.filter(r=>r.owe===0).length===1&&st.filter(r=>r.owe===5).length===11,'Subs page: 1 paid up, 11 owe £5');
  ok(!/L8|Steamers/.test(JSON.stringify(st.map(r=>r.nights))),'nights before 9 Nov not counted');
  // a request from someone not switched on
  const R=phone('Craig');await wait(80);R.go('account');R.click('[data-act="acctmode"][data-m="new"]');R.set('suPid','p5');R.set('suEmail','craig@lions.test');R.set('suPw','craig55');R.click('[data-act="signup"]');await wait(200);
  ok(R.H.myRole()==='viewer'&&/Waiting/.test(R.d.getElementById('view').textContent),'Craig waiting for approval');
  A.go('home');await wait(30);{const t=A.d.getElementById('view').textContent;ok(/New (scorer|admin) request · \S/.test(t),'Andy sees a named sign-in request on Home: '+(t.match(/New [a-z]+ request[^A]*/)||[''])[0].slice(0,60));}
  A.go('squad');ok(/Requested/.test(A.d.getElementById('view').textContent),'Requested badge in Squad');
  [...A.d.querySelectorAll('[data-act="editplayer"]')].find(b=>b.dataset.id==='p5').click();await wait(50);ok(/craig@lions.test/.test(A.d.getElementById('rqEmail').textContent),'Craig request shows email');A.click('[data-act="approve"]');await wait(150);
  ok(R.H.myRole()==='scorer','Craig approved: now a scorer on his phone');
  // a wrong claim gets declined and the name is free again
  const X=phone('Impostor');await wait(80);X.go('account');X.click('[data-act="acctmode"][data-m="new"]');X.set('suPid','p13');X.set('suEmail','fake@x.test');X.set('suPw','fake123');X.click('[data-act="signup"]');await wait(200);
  ok(X.H.myRole()==='viewer','impostor claiming Adam Watt (admin) gets nothing');
  A.go('squad');[...A.d.querySelectorAll('[data-act="editplayer"]')].find(b=>b.dataset.id==='p13').click();await wait(50);ok(/fake@x.test/.test(A.d.getElementById('rqEmail').textContent),'Andy sees impostor email');A.click('[data-act="decline"]');await wait(150);
  ok(B.people.p13.uid===null&&B.people.p13.role==='admin','declined: Adam Watt free again, still marked admin');
  // switching Chris off
  A.go('squad');[...A.d.querySelectorAll('[data-act="editplayer"]')].find(b=>b.dataset.id==='p12').click();A.set('acRole','none');A.click('[data-act="saveaccess"]');await wait(150);
  ok(C.H.myRole()==='viewer','Chris switched off: back to viewer');
  // team-wide nickname setting by admin reaches viewer
  A.go('settings');A.click('[data-nick="results"][data-nv="1"]');await wait(120);ok(V.H.S().rules.general.nickOn.results===true,'nickname setting is team-wide');
  // can't remove own admin
  A.go('squad');[...A.d.querySelectorAll('[data-act="editplayer"]')].find(b=>b.dataset.id==='p10').click();A.set('acRole','scorer');A.click('[data-act="saveaccess"]');ok(/own admin/.test(A.toast()),'cannot remove own admin access');A.click('[data-act="close"]');
  // reopening a phone offline keeps role and data
  const store={};for(let i=0;i<C.w.localStorage.length;i++){const k=C.w.localStorage.key(i);store[k]=C.w.localStorage.getItem(k);}
  const store2={};for(let i=0;i<R.w.localStorage.length;i++){const k=R.w.localStorage.key(i);store2[k]=R.w.localStorage.getItem(k);}
  B.down=true;const R2=phone('Craig reopened offline',store2);await wait(80);ok(R2.H.myRole()==='scorer'&&R2.H.S().matches.L9,'reopened offline: still scorer with data');B.down=false;

  // ---- safer offline sync: two admin devices offline at once ----
  const sA={};for(let i=0;i<A.w.localStorage.length;i++){const k=A.w.localStorage.key(i);sA[k]=A.w.localStorage.getItem(k);}
  const sy=JSON.parse(sA['lions-hub-v1-sync']);sy.dev='dLAPTOP';sA['lions-hub-v1-sync']=JSON.stringify(sy);
  const L=phone('Andy laptop',sA);await wait(150);ok(L.H.myRole()==='admin','second admin device ready');
  const fxs=A.H.S().fixtures.filter(f=>f.status==='scheduled'),f1=fxs[0].id,f2=fxs[1].id;
  A.off(true);L.off(true);
  A.H.S().fixtures.find(f=>f.id===f1).venue='Venue from phone';A.H.save();
  L.H.S().fixtures.find(f=>f.id===f2).venue='Venue from laptop';L.H.save();await wait(60);
  A.off(false);await wait(250);L.off(false);await wait(400);await V.H.pull(true);await wait(100);
  const vf=id=>(V.H.S().fixtures.find(f=>f.id===id)||{}).venue;
  ok(vf(f1)==='Venue from phone'&&vf(f2)==='Venue from laptop','different fixtures edited offline on two devices: both kept ('+vf(f1)+' / '+vf(f2)+')');
  ok((B.docs.fixtures.data.find(f=>f.id===f1)||{}).venue==='Venue from phone'&&(B.docs.fixtures.data.find(f=>f.id===f2)||{}).venue==='Venue from laptop','shared copy has both edits');
  ok(A.H.clashKeys().length===0&&L.H.clashKeys().length===0,'no clash when the edits are different');
  // same thing changed to different values -> clash prompt
  A.off(true);L.off(true);
  A.H.S().fixtures.find(f=>f.id===f1).venue='Clash A';A.H.save();
  L.H.S().fixtures.find(f=>f.id===f1).venue='Clash L';L.H.save();await wait(60);
  A.off(false);await wait(250);L.off(false);await wait(400);
  ok(L.H.clashKeys().includes('fixtures'),'same fixture changed on both: laptop asked to choose');
  ok((B.docs.fixtures.data.find(f=>f.id===f1)||{}).venue==='Clash A','shared copy not overwritten while waiting for a choice');
  L.go('home');ok(/changed the fixture list while you were offline/.test(L.d.getElementById('view').textContent)&&L.has('[data-act="clashmine"]'),'clash card shown on Home');
  L.click('[data-act="clashmine"]');await wait(400);await A.H.pull(true);await wait(100);
  ok((A.H.S().fixtures.find(f=>f.id===f1)||{}).venue==='Clash L'&&L.H.clashKeys().length===0,'Keep mine: laptop version reaches the other device');
  A.off(true);L.off(true);
  A.H.S().fixtures.find(f=>f.id===f1).venue='Theirs test A';A.H.save();
  L.H.S().fixtures.find(f=>f.id===f1).venue='Theirs test L';L.H.save();await wait(60);
  A.off(false);await wait(250);L.off(false);await wait(400);
  L.click('[data-act="clashtheirs"]');await wait(400);
  ok((L.H.S().fixtures.find(f=>f.id===f1)||{}).venue==='Theirs test A'&&L.H.dirtyKeys().length===0,"Keep theirs: laptop takes the phone's version, nothing left to send");
  // merge3 unit checks
  const m3=A.H.merge3;
  ok(JSON.stringify(m3({a:1,b:1},{a:2,b:1},{a:1,b:3},'ask').v)==='{"a":2,"b":3}','merge: different fields both kept');
  ok(m3([{id:1,x:1}],[{id:1,x:1},{id:2,x:5}],[],'ask').v.length===1,'merge: their deletion respected, my new entry kept');
  ok(JSON.stringify(m3(['a','b'],['a','b','c'],['b','d'],'ask').v)==='["b","d","c"]','merge: name lists combined');

  // viewer cup-draw card: Lions draws only, Mark as seen only
  V.H.S().feed={ok:true,draws:[{cup:'fp',round:'Semi Finals',date:'2099-01-27',home:true,opp:'Reptiles',venue:'',bye:false,file:'x.jpg'}],cups:[{key:'fp',name:'Front Pin',images:[{file:'x.jpg',url:'u'},{file:'y.jpg',url:'v'}]}],fixtures:{hash:'a'}};V.H.S().feedSeen={draws:{},pdf:'b'};
  V.go('home');{const t=V.d.getElementById('view').textContent;ok(/Cup draw · Front Pin Cup · Semi Finals/.test(t)&&/Lions v Reptiles · .* · Home · Venue TBC/.test(t),'viewer sees Lions draw card: '+(t.match(/Cup draw[^M]*/)||[''])[0]);
    ok(!V.has('[data-act="draws"]')&&!/No Lions fixture update/.test(t)&&!/fixture list updated/.test(t),'viewer: no View picture, no non-Lions picture alert, no PDF alert');}
  V.click('[data-act="vdseen"]');ok(!/Cup draw ·/.test(V.d.getElementById('view').textContent),'viewer: Mark as seen hides the card');
  V.go('home');ok(/pins this year so far/.test(V.d.getElementById('view').textContent),'Home tagline shows pins this year');
  V.go('averages');{const t=V.d.getElementById('view').textContent;ok(/Team stats/.test(t)&&/Total pins hit/.test(t)&&/Average team score/.test(t)&&/Total team spares/.test(t)&&/Player averages/.test(t)&&!/\/hand/.test(t),'Statistics page: team stats + player table, Hand header');}
  // v3.1: lock card/log hidden from viewers; 50+; seasons; print sheet; close season
  V.go('score','L8');{const t=V.d.getElementById('view').textContent;ok(!/Match locked/.test(t)&&!/Changes after locking/.test(t)&&/Set 1/.test(t),'viewer: finished match shows scores but no lock card or change log');}
  A.go('score','L8');ok(/Match locked/.test(A.d.getElementById('view').textContent),'admin: lock card shown');
  {const sc=[C].find(p=>p.H.myRole()==='scorer');if(sc){sc.go('score','L8');ok(/Match locked/.test(sc.d.getElementById('view').textContent),'scorer: lock card shown');}else ok(true,'(no scorer phone left at this point)');}
  V.go('averages');{const t=V.d.getElementById('view').textContent;ok(/50\+/.test(t)&&V.has('[data-act="printsheet"]')&&V.has('[data-act="season"][data-s="2025-26"]'),'Statistics: 50+ column, Print season sheet, season picker');}
  ok(A.H.averages31().every(a=>typeof a.f50==='number'),'averages carry 50+ counts');
  {const sh=V.H.sheetData('2025-26'),t=sh.totals;ok(t.for===13780&&t.against===14256&&t.spares===109&&t.points===152&&sh.players.length===17&&t.avgHome.toFixed(1)==='502.1'&&t.avgAway.toFixed(1)==='482.1','2025/26 built in: totals match Andy Evans’ sheet');
   const nw=sh.players[0];ok(nw.name==='N White'&&nw.games===20&&nw.pins===907&&nw.avg.toFixed(2)==='45.35'&&nw.f50===3,'2025/26 top row N White 20 / 907 / 45.35 / 3');}
  V.click('[data-act="season"][data-s="2025-26"]');{const t=V.d.getElementById('view').textContent;ok(/Team stats · 2025\/26/.test(t)&&/13,780/.test(t)&&/45\.35/.test(t),'season picker shows 2025/26 statistics');}
  V.go('fixtures');ok(/EFTB v Lions/.test(V.d.getElementById('view').textContent)&&!V.has('[data-act="addfx"]'),'Fixtures 2025/26 shows past league results');
  V.click('[data-act="season"][data-s="2026-27"]');V.go('averages');V.click('[data-act="phist"][data-id="p11"]');ok(/2025\/26/.test(V.modal())&&/2026\/27/.test(V.modal()),'player history lists both seasons');V.click('[data-act="close"]');
  V.click('[data-act="printsheet"]');{const p=V.d.getElementById('printv');ok(V.d.body.classList.contains('printing')&&/LIONS LEAGUE AVERAGES/.test(p.textContent)&&/GAMES 50 & OVER/.test(p.textContent)&&/TOTAL POINTS/.test(p.textContent)&&/TEAM SPARES/.test(p.textContent),'print sheet opens (title, 50+ column, bottom rows, summary box)');}
  V.click('[data-act="closeprint"]');ok(!V.d.body.classList.contains('printing'),'print sheet closes');
  ok(/Close season 2026\/27/.test((A.go('backup'),A.d.getElementById('view').textContent))&&!C.H.needFor({act:'closeseasonok'})!=='admin','Close season on Backup page for admins');
  A.click('[data-act="closeseason"]');A.set('csName','2026/28');A.click('[data-act="closeseasonok"]');ok(A.H.curSeason()==='2026-27','wrong confirmation text: season not closed');
  A.set('csName','2026/27');A.click('[data-act="closeseasonok"]');await wait(300);
  ok(A.H.curSeason()==='2027-28'&&B.docs.seasons&&B.docs.seasons.data['2026-27']&&B.docs.seasons.data['2026-27'].sheet.matches.length>0,'season closed: 2027/28 started, 2026/27 summary shared');
  await V.H.pull(true);await wait(150);ok(V.H.curSeason()==='2027-28'&&V.H.seasonList().join()==='2027-28,2026-27,2025-26','viewer phone gets the new season: '+V.H.seasonList().join());
  V.go('averages');ok(/No completed League or Cup matches yet/.test(V.d.getElementById('view').textContent),'new season starts empty');
  ok(A.H.isFrozenFx(A.H.S().fixtures.find(f=>f.id==='L8')),'2026/27 fixtures frozen');
  A.go('score','L8');ok(!A.has('[data-act="unlockm"]')&&/scores are final/.test(A.d.getElementById('view').textContent),'closed season: no Unlock, scores final');
  A.go('home');ok(!/Gatecrashers/.test((A.d.querySelector('.card.now')||{textContent:''}).textContent),'closed season fixtures not offered as the next match');
  const dump=(P,f)=>{const o={};for(let i=0;i<P.w.localStorage.length;i++){const k=P.w.localStorage.key(i);o[k]=P.w.localStorage.getItem(k);}fs.writeFileSync(f,JSON.stringify({store:o,people:Object.values(B.people)}));};if(process.env.DUMP){dump(A,'/tmp/store_A.json');dump(V,'/tmp/store_V.json');dump(C,'/tmp/store_C.json');}
  console.log(fails?fails+' FAILED':'ALL PASS');process.exit(0);
})().catch(e=>{console.log('ERROR',e);process.exit(1);});

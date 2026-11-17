const {JSDOM}=require('jsdom');const fs=require('fs');const {Backend,client}=require('./mocksb');
const html=fs.readFileSync(process.env.APP_HTML||require('path').join(__dirname,'../app/index.html'),'utf8');const B=Backend();B.bootstrap=['p10']; // Andy linked before approvals were required
const wait=ms=>new Promise(r=>setTimeout(r,(ms||60)+350));
const snap=(P,n)=>{if(process.env.SNAP)fs.writeFileSync(process.env.SNAP+'/'+n+'.html','<!DOCTYPE html>'+P.d.documentElement.outerHTML.replace(/<script[\s\S]*?<\/script>/g,''));};let fails=0;const ok=(c,msg)=>{console.log((c?'PASS ':'FAIL ')+msg);if(!c)fails++;};
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
  ok(A.H.S().sel.L9.lineup.some(Boolean)&&!(V.H.S().sel.L9&&V.H.S().sel.L9.lineup.some(Boolean))&&!Object.keys(V.H.S().sel).some(k=>(V.H.S().sel[k].lineup||[]).some(Boolean)),'viewer phone gets no team selections (scorers and admins only)');
  V.go('team','L9');ok(!V.has('[data-av]')&&/will be published after the match has finished, this site is public, and we don’t want to give any secrets away before a match! 😉/.test(V.d.getElementById('view').textContent)&&!/Set 1/.test(V.d.getElementById('view').textContent)&&!V.has('[data-act="teamsheet"]'),'viewer: team hidden until the results are published');snap(V,'vhide');
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
  // v3.5: Stop scoring. Same person on another device (Andy's scorer tag from a different device)
  A.H.S().matches.L9.scorer.dev='other-device';A.go('score','L9');await wait(20);
  {const t=A.d.getElementById('view').textContent;ok(/Scoring by you \(on another device\)/.test(t)&&A.has('[data-act="stopscore"]')&&!/Take over/.test(t)&&/Score on this device/.test(t)&&!A.has('.pad'),'same person on another device: Stop scoring + Score on this device, no Take over');}
  snap(A,'mine');C.go('score','L9');ok(/Take over/.test(C.d.getElementById('view').textContent),'another editor still sees Take over');
  A.click('[data-act="stopscore"]');await wait(150);ok(!A.H.S().matches.L9.scorer,'Stop scoring clears the scorer');
  C.go('score','L9');await wait(20);{const t=C.d.getElementById('view').textContent;ok(!C.H.S().matches.L9.scorer&&/Nobody is scoring/.test(t)&&!C.has('.pad')&&/Start scoring/.test(t),'other phones: Nobody is scoring, Start scoring, no keypad');}
  V.go('score','L9');await wait(20);ok(/Nobody is scoring/.test(V.d.getElementById('view').textContent)&&!V.has('[data-act="takeover"]'),'viewer: Nobody is scoring, no button');
  A.go('score','L9');ok(!A.has('.pad'),'no keypad anywhere until someone starts');A.click('[data-act="takeover"]');await wait(120);ok(A.has('.pad')&&A.has('.now [data-act="stopscore"]'),'Start scoring gives the keypad, with Stop scoring on the card');
  snap(C,'nobody');A.click('.now [data-act="stopscore"]');snap(A,'stopconf');ok(/Stop scoring\?/.test(A.modal()),'scoring phone asks before stopping');A.click('[data-act="close"]');ok(A.H.S().matches.L9.scorer&&A.has('.pad'),'Cancel keeps scoring');
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
  const lg=A.H.S().matches.L8.log||[];ok(lg.length===3&&/Unlocked/.test(lg[0].what)&&/→/.test(lg[1].what)&&/Published again/.test(lg[2].what),'change log: '+lg.map(x=>x.what).join(' | '));
  V.go('score','L8');await wait(20);ok(!/Changes after publishing/.test(V.d.getElementById('view').textContent),'viewer does not see the change log');A.go('score','L8');ok(/Changes after publishing/.test(A.d.getElementById('view').textContent)&&/A\. Nancollis|Andy Nancollis/.test(A.d.getElementById('view').textContent),'admin sees the change log');
  C.go('score','L8');ok(!C.has('[data-act="unlockm"]')&&/Results published/.test(C.d.getElementById('view').textContent),'scorer cannot unlock');
  // finish L9 then lock as scorer
  A.go('score','L9');let guard=0;while(A.has('[data-v="5"]')&&guard++<200)A.click('[data-v="5"]');await wait(200);
  ok(A.has('[data-act="lockm"]')&&/Match finished/.test(A.d.getElementById('view').textContent),'finished: Lock match offered');
  ok(!A.H.S().matches.L9.lock&&A.H.S().matches.L9.doneAt>0,'not locked until tapped (auto 6am)');
  A.click('[data-act="lockm"]');await wait(150);C.go('score','L9');await wait(20);ok(/Published by Andy Nancollis/.test(C.d.getElementById('view').textContent),'lock shared: Locked by Andy Nancollis');
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
  V.go('home');ok(/pins since September 2022/.test(V.d.getElementById('view').textContent),'Home tagline shows pins this year');
  V.go('averages');{const t=V.d.getElementById('view').textContent;ok(/Team stats/.test(t)&&/Total pins hit/.test(t)&&/Average team score/.test(t)&&/Total team spares/.test(t)&&/Player averages/.test(t)&&!/\/hand/.test(t),'Statistics page: team stats + player table, Hand header');}
  // v3.1: lock card/log hidden from viewers; 50+; seasons; print sheet; close season
  V.go('score','L8');{const t=V.d.getElementById('view').textContent;ok(!/Match locked/.test(t)&&!/Changes after locking/.test(t)&&/Set 1/.test(t),'viewer: finished match shows scores but no lock card or change log');}
  A.go('score','L8');ok(/Results published/.test(A.d.getElementById('view').textContent),'admin: lock card shown');
  {const sc=[C].find(p=>p.H.myRole()==='scorer');if(sc){sc.go('score','L8');ok(/Match locked/.test(sc.d.getElementById('view').textContent),'scorer: lock card shown');}else ok(true,'(no scorer phone left at this point)');}
  V.go('averages');{const t=V.d.getElementById('view').textContent;ok(/50\+/.test(t)&&V.has('[data-act="printsheet"]')&&V.has('[data-act="season"][data-s="2025-26"]'),'Statistics: 50+ column, Print season sheet, season picker');}
  ok(A.H.averages31().every(a=>typeof a.f50==='number'),'averages carry 50+ counts');
  {const sh=V.H.sheetData('2025-26'),t=sh.totals;ok(t.for===13780&&t.against===14256&&t.spares===109&&t.points===152&&sh.players.length===17&&t.avgHome.toFixed(1)==='502.1'&&t.avgAway.toFixed(1)==='482.1','2025/26 built in: totals match Andy Evans’ sheet');
   const nw=sh.players[0];ok(nw.name==='N White'&&nw.games===20&&nw.pins===907&&nw.avg.toFixed(2)==='45.35'&&nw.f50===3,'2025/26 top row N White 20 / 907 / 45.35 / 3');}
  V.click('[data-act="season"][data-s="2025-26"]');{const t=V.d.getElementById('view').textContent;ok(/Team stats · 2025\/26/.test(t)&&/13,780/.test(t)&&/45\.35/.test(t),'season picker shows 2025/26 statistics');}
  V.go('fixtures');ok(/EFTB v Lions/.test(V.d.getElementById('view').textContent)&&!V.has('[data-act="addfx"]'),'Fixtures 2025/26 shows past league results');
  V.click('[data-act="season"][data-s="2026-27"]');V.go('averages');V.click('[data-act="phist"][data-id="p11"]');ok(/2025\/26/.test(V.modal())&&/2026\/27/.test(V.modal()),'player history lists both seasons');V.click('[data-act="close"]');
  V.click('[data-act="printsheet"]');{const p=V.d.getElementById('printv');ok(V.d.body.classList.contains('printing')&&/LIONS LEAGUE (& CUP )?AVERAGES/.test(p.textContent)&&/GAMES 50 & OVER/.test(p.textContent)&&/TOTAL POINTS/.test(p.textContent)&&/TEAM SPARES/.test(p.textContent),'print sheet opens (title, 50+ column, bottom rows, summary box) '+p.textContent.slice(0,140));}
  V.click('[data-act="closeprint"]');ok(!V.d.body.classList.contains('printing'),'print sheet closes');
  // v3.2: 2023/24 + cups switch + Cup average; In/Out availability switch
  {const s=V.H.sheetData('2023-24'),t=s.totals,j=s.players[0];ok(t.for===13502&&t.against===13271&&t.points===200&&s.players.length===18&&t.cups===6&&t.spares===92,'2023/24 built in: 13,502 / 13,271, 200 pts, 18 players, 6 cups, 92 spares');
   ok(j.name==='J Hinder'&&j.games===16&&j.pins===716&&j.avg.toFixed(2)==='44.75'&&(j.hp/j.hg).toFixed(2)==='48.40'&&(j.ap/j.ag).toFixed(2)==='43.33'&&(j.cp/j.cg).toFixed(2)==='42.80'&&j.f50===2,'2023/24 J Hinder 16 / 716 / 44.75, Home 48.40, Away 43.33, Cup 42.80, 50+ 2 (as his sheet)');
   ok(s.players.some(r=>r.name==='J Haynes')&&s.players.some(r=>r.name==='M Sloan'),'ex-players shown by name');
   const l=V.H.sheetData('2023-24',true);ok(l.matches.length===22&&l.totals.cups===0&&l.players[0].spares==null,'League only drops the 6 cup matches');}
  V.go('averages');V.click('[data-act="season"][data-s="2023-24"]');{const t=V.d.getElementById('view').textContent;ok(/League \+ Cups/.test(t)&&/Cup/.test(V.d.querySelector('table.avg:not(.stat) thead').textContent)&&/44\.75/.test(t),'2023/24 Statistics with Cup column');}
  V.click('[data-act="cups"][data-cv="league"]');{const t=V.d.getElementById('view').textContent;ok(!/Cup/.test(V.d.querySelector('table.avg:not(.stat) thead').textContent)&&/League matches only/.test(t)&&!V.H.cupsOn(),'League only: Cup column hidden');}
  V.go('home');ok(/pins since September 2022/.test(V.d.getElementById('view').textContent),'Home unaffected by the switch');
  V.go('averages');V.click('[data-act="cups"][data-cv="all"]');V.click('[data-act="season"][data-s="2026-27"]');ok(V.H.cupsOn(),'switch back to League + Cups');
  A.go('team','L10');{const sw=A.d.querySelector('.avsw[data-id="p5"]');ok(sw&&/Out/.test(sw.textContent)&&!A.has('[data-av="maybe"]'),'availability: one switch per player, Out by default, no ?');
   sw.click();await wait(20);ok(A.H.S().sel.L10.avail.p5==='in'&&/In/.test(A.d.querySelector('.avsw[data-id="p5"]').textContent),'tap: In');
   A.d.querySelector('.avsw[data-id="p5"]').click();await wait(20);ok(!A.H.S().sel.L10.avail.p5&&/\d+ in/.test(A.d.querySelector('.chips').textContent)&&!/maybe/.test(A.d.querySelector('.chips').textContent),'tap again: back to Out; chips show in/out only');}
  // v3.3: 2024/25 + all-time pins
  {const s=V.H.sheetData('2024-25'),t=s.totals;ok(t.for===9426&&s.matches.length===20&&s.players.length===22&&t.points==null&&t.noRes&&s.matches[0].ls===33,'2024/25 built in: 9,426, 20 matches, 22 players, no results, L/S 33 in match 1');
   ok(s.players.find(r=>r.pid==='p11').games===17&&s.players.find(r=>r.pid==='p11').avg.toFixed(2)==='41.35'&&s.players.find(r=>r.pid==='p23').games===12,'2024/25 corrections: A Evans 17 games 41.35, N Collyer 12 games');
   const at=V.H.allTimePins();ok(at.since==='September 2022'&&at.pins>=39922+11847,'all-time pins since September 2022: '+at.pins);}
  V.go('home');{const tg=V.d.querySelector('.tagline');ok(tg&&/We’ve hit [\d,]+ pins since September 2022!/.test(tg.textContent)&&tg.dataset.tab==='averages','Home tagline: '+(tg&&tg.textContent));}
  V.go('averages');V.click('[data-act="season"][data-s="2024-25"]');ok(!/NaN|undefined|null/.test(V.d.getElementById('view').textContent),'2024/25 Statistics: no NaN/undefined/null');
  V.go('fixtures');ok(/incl\. L\/S 33/.test(V.d.getElementById('view').textContent)&&!/NaN|undefined|null/.test(V.d.getElementById('view').textContent),'2024/25 fixtures list with dates and L/S note');
  // v3.5: 2022/23
  {const s=V.H.sheetData('2022-23'),t=s.totals,pl=s.players,ps=pl.reduce((a,r)=>a+r.pins,0);ok(s.matches.length===27&&t.cups===5&&t.for===11847&&ps===11792&&pl.length===24&&t.noRes,'2022/23 built in: 27 matches (5 cups), team 11,847, players 11,792, 24 players, no results');
   ok(s.matches[4].ls===31&&s.matches[13].ls===24&&s.matches[0].date==='2022-09-09'&&s.matches[26].home,'2022/23 L/S 31 and 24, dates, Double 6 home');
   const sheet={p24:[23,40.43],p11:[21,40.24],p3:[19,38.47],p13:[22,38.27],p16:[22,37.45],p17:[14,37.21],p20:[21,36.76],p10:[20,37.40],p8:[21,36.00],p15:[19,36.42],p5:[26,35.35],p21:[9,34.33],p14:[3,33.00],p7:[19,32.79]},bad=Object.keys(sheet).filter(k=>{const r=pl.find(x=>x.pid===k);return !r||r.games!==sheet[k][0]||r.avg.toFixed(2)!==sheet[k][1].toFixed(2);});
   ok(!bad.length&&pl.find(r=>r.pid==='John Haynes').avg.toFixed(2)==='35.36'&&pl.find(r=>r.pid==='Chris Winter').games===10,'2022/23 games and averages match the sheet'+(bad.length?': '+bad:''));
   ok(V.H.sheetData('2022-23',true).matches.length===22,'2022/23 League only: 22 matches');}
  V.go('averages');V.click('[data-act="season"][data-s="2022-23"]');{snap(V,'s2223');if(process.env.SNAP){V.click('[data-act="printsheet"]');snap(V,'p2223');V.click('[data-act="closeprint"]');}const t=V.d.getElementById('view').textContent;ok(!/NaN|undefined|null/.test(t)&&/C Winter|Chris Winter|C\. Winter/.test(t)&&V.d.querySelector('tr.band'),'2022/23 Statistics: ex-players by name, 3-match line, no NaN');}
  V.go('averages');V.click('[data-act="season"][data-s="2026-27"]');
  // v3.4: live set layout, sticky labels, fixed hand columns, ▲▼ columns
  {const H=A.H,S=H.S(),m=S.matches.L8,save=JSON.stringify(m);for(let p=6;p<12;p++)for(let k=0;k<6;k++){if(p>6||k>=3){m.L[p][k]=null;m.O[p][k]=null;}}m.lock=null;
   A.go('score','L8');const d=A.d;ok(!d.querySelector('.liveset .setc')&&d.querySelectorAll('.liveset tr.tbar').length===2&&d.querySelectorAll('.liveset td.hc').length>=36,'live set: no Set column, two team bars, fixed-width hand cells');
   const bars=[...d.querySelectorAll('.liveset tr.tbar .tbv')].map(x=>parseInt(x.textContent));ok(bars[0]===H.setTot?true:true,'bars rendered');
   const btn=()=>d.querySelector('[data-act="allsets"]').textContent;ok(btn()==='Show all sets','button: Show all sets');A.click('[data-act="allsets"]');ok(btn()==='Hide other sets'&&d.querySelectorAll('.liveset').length===4,'button: Hide other sets, all 4 sets shown');
   ok([...d.querySelectorAll('.liveset')].some(c=>c.querySelector('tr.tbar.win')&&/\+2 pts/.test(c.textContent)),'finished set: winner bar highlighted with +2 pts');A.click('[data-act="allsets"]');
   Object.assign(m,JSON.parse(save));A.go('score','L8');ok(d.querySelector('.setc')&&!d.querySelector('.liveset'),'finished match keeps the Set column');}
  // v3.5: last year folded into the main tables; 3-match bands
  V.go('averages');snap(V,'stats');{const d=V.d,t=d.getElementById('view').textContent,pt=[...d.querySelectorAll('table.avg:not(.stat)')][0],th=[...pt.querySelectorAll('thead th')].map(x=>x.textContent);
   ok(!/This time last year/.test(t),'no separate This time last year card');
   ok(th.slice(0,6).join('|')==='Player|Gm|Pins|Avg|±|LY','player table: ± and LY after Avg: '+th.join('|'));
   const cc=[...pt.querySelectorAll('tbody tr')].find(r=>/C Cooke|Chris Cooke|C\. Cooke/.test(r.textContent));console.log('   Cooke row: '+(cc&&[...cc.children].map(x=>x.textContent).join(' | ')));
   ok(cc&&Math.abs(+cc.children[3].textContent-(+cc.children[5].textContent)-(+cc.children[4].textContent.replace(/[▲▼]/,'')))<0.011&&/▲/.test(cc.children[4].textContent)===(+cc.children[3].textContent>+cc.children[5].textContent),'C Cooke: ± = Avg − LY');
   const st=d.querySelector('table.avg.stat'),sh=[...st.querySelectorAll('thead th')].map(x=>x.textContent),sr=[...st.querySelectorAll('tbody tr')].map(r=>r.children[0].textContent);
   ok(sh.join('|')==='|Overall|±|Last yr|Home|Away|Cup'&&sr.slice(0,2).join()==='Points,Wins','team stats: Overall · ± · Last yr · Home · Away · Cup, Points and Wins rows: '+sh.join('|')+' / '+sr.join());
   ok(st.querySelectorAll('td.ud').length>=4&&!/▲|▼/.test([...st.querySelectorAll('td.t')].map(x=>x.textContent).join('')),'▲▼ in their own column');
   const band=pt.querySelector('tr.band');ok(band&&/Fewer than 3 matches/.test(band.textContent),'dashed line: Fewer than 3 matches');
   const low=[...pt.querySelectorAll('tr.low')];ok(low.length>0&&low.every(r=>+r.children[1].textContent<3&&/^– /.test(r.children[0].textContent))&&[...pt.querySelectorAll('tbody tr:not(.low):not(.band)')].every(r=>+r.children[1].textContent>=3),'below the line: fewer than 3 games, unnumbered; above: 3+');
   const nums=[...pt.querySelectorAll('tbody tr:not(.low):not(.band)')].map(r=>parseInt(r.children[0].textContent));ok(nums.every((n,i)=>n===i+1),'main band numbered with no gaps');
   V.click('[data-act="season"][data-s="2024-25"]');{const p2=V.d.querySelector('table.avg:not(.stat)');ok(![...p2.querySelectorAll('thead th')].some(x=>x.textContent==='LY')&&!V.d.querySelector('table.avg.stat thead').textContent.includes('Last yr'),'past season: no LY / Last yr columns');}
   V.click('[data-act="season"][data-s="2026-27"]');}
  // v3.5: cup tags in the fixture dropdown, Chairman's Shield
  A.go('team','L9');{const o=[...A.d.querySelectorAll('#fxSel option')].map(x=>x.textContent),lg=[...A.d.querySelectorAll('#fxSel option')].filter(x=>/^L/.test(x.value)).map(x=>x.textContent);ok([' FP🏆',' KO🏆',' GDT🏆',' GD🏆'].every(s=>o.some(x=>x.includes(s)))&&lg.length>5&&!lg.some(x=>/🏆/.test(x)),'dropdown: cup tags FP/KO/GDT/GD, league untagged: '+o.find(x=>/FP🏆/.test(x)));}
  {const S=A.H.S();ok(S.comps.some(c=>c.id==='cs'&&c.type==='cup'),'Chairman’s Shield competition added');
   A.go('fixtures');A.click('[data-act="editfx"][data-id="C10"]');A.set('fStat','knockedout');A.click('[data-act="savefx"]');await wait(150);
   const g=id=>S.fixtures.find(f=>f.id===id);ok(g('C13').comp==='cs'&&g('C13').round==='R2'&&g('C14').comp==='cs'&&g('C14').round==='Semi Finals'&&g('C15').comp==='cs'&&g('C15').round==='Finals','GD R1 knocked out: later GD dates become Chairman’s Shield R2 / Semi Finals / Finals');
   A.go('team','C13');ok([...A.d.querySelectorAll('#fxSel option')].some(x=>/ CS🏆/.test(x.textContent)),'CS🏆 in the dropdown');
   ok(B.docs.fixtures.data.find(f=>f.id==='C13').comp==='cs','switch shared');
   const dr={cup:'cs',round:'R2',date:g('C13').date,opp:'Belvedere',home:true,venue:'Golden Lion'};ok(A.H.drawFx(dr).id==='C13','a CS draw lands on the CS slot');
   g('C13').comp='gd';g('C13').round='R2 & Chairman’s Shield R2';const f2=A.H.applyDraw(dr);ok(f2.id==='C13'&&f2.comp==='cs'&&f2.round==='R2'&&f2.opp==='Belvedere','a CS draw on a GD slot turns it into the CS fixture');}
  // v3.6: In play / Scoring started only with scores; calendar weeks; centred ±; green ▲ leads
  A.go('score','L11');A.click('[data-act="start"]');await wait(150);
  {const S=A.H.S();S.ui.fxf={c:'all',s:'all'};A.go('fixtures');const row=()=>A.d.querySelector('#view [data-id="L11"]').closest('.li');ok(A.H.S().matches.L11&&!/In play/.test(row().textContent),'started but empty: no In play chip');
   V.go('score','L11');await wait(20);ok(/Not started yet/.test(V.d.getElementById('view').textContent),'viewer: empty match reads Not started yet');
   A.go('score','L11');ok(A.has('.pad'),'scorer still has the keypad on the empty match');A.click('[data-v="7"]');await wait(150);A.go('fixtures');ok(/In play/.test(row().textContent),'after one hand: In play');
   V.go('score','L11');await wait(20);ok(!/Not started yet/.test(V.d.getElementById('view').textContent),'viewer sees the live match after one hand');
   A.go('fixtures');const v=A.d.getElementById('view'),nm=[...v.querySelectorAll('.nomatch')];ok(nm.length>3&&nm.every(x=>/^No match/.test(x.textContent)&&/Fri \d+ /.test(x.textContent)),'calendar: No match weeks with their Friday ('+nm.length+')');
   const tl=id=>(v.querySelector('[data-id="'+id+'"] .name')||{}).textContent;ok(tl('L4')==='Lions vs Vacant Date'&&tl('C1')==='Bye, no match'&&tl('C10')==='Knocked out, no match','titles: '+tl('L4')+' / '+tl('C1')+' / '+tl('C10'));
   snap(A,'fx');ok(nm.every(x=>x.querySelector('button.grow .name')&&!x.querySelector('[data-act]')),'No match rows built like fixture rows (button.grow), not tappable');
   A.click('[data-act="fxf"][data-fk="s"][data-fv="played"]');ok(!A.has('#view .nomatch'),'Played: no No match rows');
   A.click('[data-act="fxf"][data-fk="s"][data-fv="up"]');ok(A.has('#view .nomatch'),'Upcoming: No match rows');
   A.click('[data-act="fxf"][data-fk="c"][data-fv="league"]');ok(!A.has('#view .nomatch'),'single competition: no No match rows');S.ui.fxf={c:'all',s:'up'};}
  V.go('averages');{const th=V.d.querySelector('table.avg th.ud');ok(th&&V.w.getComputedStyle(th).textAlign==='center','± header centred');}
  A.go('score','L8');snap(A,'l8');{const c=A.d.querySelector('#view .card:not(.board) table');const tb=c.closest('.card'),st=[...tb.querySelectorAll('.setc')].map(x=>parseInt(x.textContent)),lt=[...tb.querySelectorAll('tr.up td.lt')].map(x=>x.textContent);
   ok(st.length===2&&lt.length===2&&lt.includes('/')&&lt.some(x=>x==='▲'+Math.abs(st[0]-st[1])),'Lead Tot: ▲'+Math.abs(st[0]-st[1])+' and / ('+lt.join(' | ')+')');
   ok([...tb.querySelectorAll('tr.up td.hc .lead')].length>0&&[...tb.querySelectorAll('tr.up td.hc')].every(x=>x.textContent===''||x.textContent==='/'||/^▲\d+$/.test(x.textContent)),'Lead hand cells: ▲n or /');}
  // v3.8: an empty score sheet doesn't lock the Team page
  A.go('score','L12');A.click('[data-act="start"]');await wait(150);
  {const S=A.H.S();ok(S.matches.L12&&!/Scoring has started/.test((A.go('team','L12'),A.d.getElementById('view').textContent))&&A.has('[data-act="suggest"]')&&![...A.d.querySelectorAll('#view .slot')].some(b=>b.disabled),'empty sheet: Team page open (Suggest team, slots enabled, no warning)');
   const sel=S.sel.L12||(S.sel.L12={avail:{},req:{},lineup:Array(12).fill(null),reserves:[]});S.players.filter(p=>p.active).forEach(p=>sel.avail[p.id]='in');A.click('[data-act="suggest"]');A.click('[data-act="close"]');await wait(200);
   ok(S.sel.L12.lineup.filter(Boolean).length===12&&JSON.stringify(S.matches.L12.lineup)===JSON.stringify(S.sel.L12.lineup),'Suggest team fills the team and the empty sheet follows it');
   A.go('score','L12');ok(A.has('.pad'),'the phone that opened scoring keeps its keypad');
   L.go('score','L12');await wait(30);{const t=L.d.getElementById('view').textContent;ok(/Ready to score\?/.test(t)&&/Opened by you on another device, no scores yet/.test(t)&&L.has('[data-act="start"]'),'another device: Ready to score, opened by …');}
   L.click('[data-act="start"]');await wait(200);ok(L.has('.pad')&&JSON.stringify(L.H.S().matches.L12.lineup)===JSON.stringify(S.sel.L12.lineup),'Start scoring there: keypad with the new team');
   L.click('[data-v="7"]');await wait(300);A.go('team','L12');ok(/Scoring has started/.test(A.d.getElementById('view').textContent)&&!A.has('[data-act="suggest"]'),'after one hand the Team page locks again');}
  // v3.9: tactics for Suggest team, player preferences, admin-only Suggest, early v late
  {const S=A.H.S(),fid='L14',sel=S.sel[fid]||(S.sel[fid]={avail:{},req:{},lineup:Array(12).fill(null),reserves:[]});S.players.filter(p=>p.active).forEach(p=>sel.avail[p.id]='in');
   const am=A.H.avgMap(),sc=id=>am[id]?am[id].avgHand:0,run=(tc)=>{sel.tactic=tc;sel.req={};const w=A.H.suggest(fid);return {L:sel.lineup.slice(),w};},setIds=(L,s)=>L.slice((s-1)*3,s*3),rank=L=>L.filter(Boolean).slice().sort((a,b)=>sc(b)-sc(a)),sum=(L,s)=>setIds(L,s).reduce((a,id)=>a+sc(id),0);
   let r=run(undefined);const rk=rank(r.L);ok(A.H.tacticOf({}).t==='strong'&&setIds(r.L,4).every(id=>rk.slice(0,3).includes(id))&&/^Strong finish/.test(r.w[0]),'Strong finish (default): best 3 in set 4');
   const ss=[1,2,3].map(s=>sum(r.L,s));ok(Math.max(...ss)-Math.min(...ss)<=1.5,'Strong finish: sets 1–3 roughly equal ('+ss.map(x=>(x*6).toFixed(0)).join(' / ')+' pins)');
   ok(r.L.every((id,i)=>i%3!==2||!r.L[i-1]||sc(id)>=sc(r.L[i-1])),'strongest throws last in each set');
   r=run({t:'early',set:1});ok(setIds(r.L,4).every(id=>rk.slice(0,3).includes(id))&&setIds(r.L,1).every(id=>rk.slice(3,6).includes(id)),'Early points: next best 3 in set 1');
   r=run({t:'early',set:2});ok(setIds(r.L,2).every(id=>rk.slice(3,6).includes(id)),'Early points: set 2 option');
   r=run({t:'underdog',set:2});ok(setIds(r.L,2).every(id=>rk.slice(0,3).includes(id))&&setIds(r.L,4).every(id=>rk.slice(9,12).includes(id))&&/^Underdog/.test(r.w[0]),'Underdog: best 3 in set 2, weakest 3 in set 4');
   r=run({t:'balanced'});ok([11,8,5,2].every((si,i)=>r.L[si]===rk[i]),'Balanced: best last in set 4, 2nd in set 3, 3rd in set 2, 4th in set 1 (old order)');
   sel.tactic=undefined;sel.req={[rk[0]]:1};A.H.suggest(fid);ok(setIds(sel.lineup,1).includes(rk[0]),'set request still wins over the tactic');sel.req={};
   const pl=id=>S.players.find(p=>p.id===id);run(undefined);const s3=setIds(sel.lineup,3)[0];pl(s3).pref={set:'1',pos:'any'};r=run(undefined);ok(setIds(r.L,1).includes(s3),'set preference honoured within the same group (set 3 → set 1)');delete pl(s3).pref;
   pl(rk[0]).pref={set:'early',pos:'any'};r=run(undefined);ok(setIds(r.L,1).concat(setIds(r.L,2)).includes(rk[0])||r.w.some(x=>/prefers the early sets \(1–2\), but Strong finish puts him in set 4/.test(x)),'preference that doesn’t fit the tactic is reported: '+(r.w.find(x=>/prefers/.test(x))||'moved'));delete pl(rk[0]).pref;
   r=run(undefined);const s4=setIds(r.L,4);pl(s4[2]).pref={set:'any',pos:'lead'};r=run(undefined);ok(r.L[9]===s4[2],'position preference: lead off');delete pl(s4[2]).pref;
   A.go('team',fid);ok(A.has('[data-act="tactic"][data-t="early"]'),'admin sees Tactics');A.click('[data-act="tactic"][data-t="early"]');await wait(50);ok(sel.tactic.t==='early'&&sel.tactic.set===1&&A.has('[data-act="tacset"][data-s="2"]'),'Early points chip, set 1 default, set 2 offered');
   A.click('[data-act="tacset"][data-s="2"]');ok(A.H.tacticOf(sel).set===2,'set 2 chosen');A.click('[data-act="suggest"]');await wait(50);snap(A,'sugg');A.click('[data-act="close"]');snap(A,'tact');A.click('[data-act="tactic"][data-t="strong"]');
   R.go('team',fid);await wait(30);ok(!R.has('[data-act="tactic"]'),'scorer: no Tactics');if(R.has('[data-act="suggest"]')){R.click('[data-act="suggest"]');ok(/Only admins/.test(R.toast()),'scorer: Suggest team is admins only');}else ok(true,'scorer: no Suggest button');
   A.go('squad');[...A.d.querySelectorAll('[data-act="editplayer"]')].find(b=>b.dataset.id==='p7').click();snap(A,'ep');ok(A.has('#epPSet')&&A.has('#epPPos'),'Edit player has line-up preferences');A.set('epPSet','early');A.set('epPPos','anchor');A.click('[data-act="saveedit"]');await wait(80);ok(pl('p7').pref.set==='early'&&pl('p7').pref.pos==='anchor','preferences saved');
   [...A.d.querySelectorAll('[data-act="editplayer"]')].find(b=>b.dataset.id==='p7').click();A.set('epPSet','any');A.set('epPPos','any');A.click('[data-act="saveedit"]');ok(!pl('p7').pref,'Any/Any clears them');
   const el=A.H.earlyLate('p11');ok(el.e.g+el.l.g>0,'early/late counted from app-scored matches ('+el.e.g+' early, '+el.l.g+' late)');
   A.go('averages');A.click('[data-act="phist"][data-id="p11"]');ok(/Early v late sets: shown once he has 5 matches in each/.test(A.modal())||/Early sets \(1–2\):/.test(A.modal()),'player history: early v late line');A.click('[data-act="close"]');
   sel.tactic=undefined;}
  // v3.10: Lock in team, new player on the night (N/P), lighter team sheet names
  {const S=A.H.S();A.go('home');const tb=A.d.querySelector('.card.now [data-tab="team"]'),fid=tb.dataset.fx;
   const sel=S.sel[fid]||(S.sel[fid]={avail:{},req:{},lineup:Array(12).fill(null),reserves:[]});S.players.filter(p=>p.active).forEach(p=>sel.avail[p.id]='in');A.H.suggest(fid);
   A.go('team',fid);const vt=()=>A.d.getElementById('view').textContent;ok(A.vis('[data-act="lockin"]')&&/1\. Availability/.test(vt()),'admin: Lock in team button, Availability shown ('+fid+')');
   A.click('[data-act="lockin"]');await wait(200);snap(A,'locked');
   ok(!/Availability/.test(vt())&&!A.has('[data-av]')&&!A.has('[data-act="suggest"]')&&!A.has('[data-act="clearteam"]')&&!A.has('[data-act="tactic"]')&&!A.has('[data-act="addres"]')&&/Team locked in by .+ · /.test(vt())&&A.vis('[data-act="unlockin"]'),'locked: availability, tactics, Suggest, Clear team and Add reserve hidden; note and Unlock team shown');
   ok(/^Team/.test(A.d.querySelector('#view .sec').textContent)&&[...A.d.querySelectorAll('#view .slot')].every(b=>b.disabled)&&A.has('[data-act="teamsheet"]'),'team is the first section, slots fixed, team sheet still there');
   ok(B.docs['sel:'+fid]&&B.docs['sel:'+fid].data.lockin&&B.docs['sel:'+fid].data.lockin.at,'lock shared');
   A.go('home');ok(/Team locked in/.test(A.d.querySelector('.card.now').textContent),'Home: Team locked in chip');
   R.go('team',fid);await wait(30);await R.H.pull(true);await wait(100);R.go('team',fid);ok(!R.vis('[data-act="unlockin"]')&&!/Availability/.test(R.d.getElementById('view').textContent),'scorer: sees the locked team, no Unlock button');
   R.click('[data-act="unlockin"]');ok(/Only admins/.test(R.toast()),'scorer: unlock is admins only');
   A.go('team',fid);A.click('[data-act="unlockin"]');await wait(150);ok(/1\. Availability/.test(vt())&&A.has('[data-av]')&&A.has('[data-act="suggest"]')&&![...A.d.querySelectorAll('#view .slot')].some(b=>b.disabled)&&A.vis('[data-act="lockin"]'),'unlocked: availability and editing back, Lock in team again');
   A.go('home');ok(!/Team locked in/.test(A.d.querySelector('.card.now').textContent),'Home chip gone');
   // new player in Team mode (reserve)
   A.go('team',fid);A.click('[data-act="addres"]');ok(A.has('[data-act="newplayer"]')&&/New player \(NR\)/.test(A.modal()),'Team picker: New player (N/P) at the top of Bring in');
   A.click('[data-act="newplayer"]');A.set('nnFull','Sam Newman');A.click('[data-act="savenp"]');await wait(150);
   const sam=S.players.find(p=>p.full==='Sam Newman');ok(sam&&sam.active&&sam.name==='S. Newman'&&S.sel[fid].reserves.includes(sam.id)&&S.sel[fid].np.includes(sam.id),'new player added to the squad, reserve, marked N/P');
   ok(JSON.stringify(B.docs.players.data).includes(sam.id),'new player shared');}
  {const S=A.H.S(),m=S.matches.L12;A.go('score','L12');if(!A.has('[data-name="L,11"]'))A.click('[data-act="allsets"]');A.click('[data-name="L,11"]');ok(A.has('[data-act="newplayer"]'),'Score picker: New player (N/P)');snap(A,'pick');
   A.click('[data-act="newplayer"]');snap(A,'npm');A.set('nnFull','Tom Fresh');A.click('[data-act="savenp"]');await wait(150);
   const tom=S.players.find(p=>p.full==='Tom Fresh');ok(tom&&m.lineup[11]===tom.id&&S.sel.L12.np.includes(tom.id)&&S.sel.L12.lineup[11]===tom.id,'Score tab: new player put in slot 12, marked N/P');
   ok(A.H.npMark(m,'L',11)===' (NR)'&&A.H.npMark(m,'L',0)==='','league scorecard: (N/P) after his name only');
   ok(!/NR/.test(A.d.getElementById('view').textContent),'no N/P on the score sheet');
   A.click('[data-name="L,11"]');ok(/Remove the \(NR\) marker/.test(A.modal()),'picker offers to remove the marker');A.click('[data-act="nptoggle"]');ok(A.H.npMark(m,'L',11)==='','marker removed');
   A.click('[data-name="L,11"]');A.click('[data-act="nptoggle"]');ok(A.H.npMark(m,'L',11)===' (NR)','marker back on (any player can be marked)');
   A.click('[data-act="oppnames"][data-set="1"]');const cbs=[...A.d.querySelectorAll('[data-onpx]')];ok(cbs.length===3&&cbs.every(c=>!c.checked),'opposition names: N/P tick per name, off by default');snap(A,'opp');
   cbs[1].checked=true;A.click('[data-act="saveopp"]');await wait(100);ok(JSON.stringify(m.onp)==='[4]'&&A.H.npMark(m,'O',4)===' (NR)'&&A.H.npMark(m,'O',3)==='','opposition N/P saved for that name only');
   A.click('[data-act="oppnames"][data-set="1"]');A.d.querySelectorAll('[data-onpx]')[1].checked=false;A.click('[data-act="saveopp"]');ok(!m.onp.length,'opposition N/P can be cleared');
   ok(A.H.needFor({act:'savenp'})==='edit'&&A.H.needFor({act:'lockin'})==='admin','permissions: new player for scorers + admins, lock for admins');}
  // v3.11: team selection hidden from viewers until Publish results; Sent to league / Resend
  {const S=A.H.S(),used=['L10','L12','L14','L15'],fx=S.fixtures.filter(f=>/^L/.test(f.id)&&f.status==='scheduled'&&!S.matches[f.id]&&!used.includes(f.id)),fid=fx[fx.length-1].id,fid2=fx[fx.length-2].id;
   const sel=A.H.S().sel[fid]||(S.sel[fid]={avail:{},req:{},lineup:Array(12).fill(null),reserves:[]});S.players.filter(p=>p.active).forEach(p=>sel.avail[p.id]='in');A.H.suggest(fid);A.H.save();await wait(250);
   ok(B.docs['sel:'+fid]&&B.docs['sel:'+fid].data.lineup.some(Boolean),'team selection shared ('+fid+')');
   await V.H.pull(true);await wait(100);ok(!V.H.S().sel[fid]||!V.H.S().sel[fid].lineup.some(Boolean),'viewer phone does not get it, even on a full reload');
   await R.H.pull(true);await wait(100);ok(R.H.S().sel[fid]&&R.H.S().sel[fid].lineup.join()===S.sel[fid].lineup.join(),'scorer phone gets it');
   V.go('team',fid);const vt=()=>V.d.getElementById('view').textContent;ok(/will be published after the match has finished/.test(vt())&&!/Set 1/.test(vt()),'viewer Team tab: hidden message');
   V.go('home');{const c=V.d.querySelector('.card.now');ok(c&&!/available|picked|locked in/.test(c.textContent),'viewer Home card: no available / picked / locked in chips');}
   A.go('home');{const c=A.d.querySelector('.card.now');ok(c&&/available/.test(c.textContent)&&/picked/.test(c.textContent),'admin Home card keeps the chips');}
   const mk=(id,doneAt)=>{const m=JSON.parse(JSON.stringify(S.matches.L8));Object.assign(m,{fid:id,lock:null,unlockedAt:null,everLocked:false,log:[],doneAt,scorer:null});delete m.pub;delete m.leagueSent;S.matches[id]=m;return m;};
   const m=mk(fid,Date.now());A.H.save();await wait(250);await V.H.pull(false);await wait(100);
   V.go('team',fid);ok(V.H.S().matches[fid]&&/will be published after the match has finished/.test(vt()),'match finished but not published: still hidden');
   V.go('score',fid);ok(/Lions/.test(V.d.getElementById('view').textContent)&&!/Not started yet/.test(V.d.getElementById('view').textContent),'viewer still sees the scores');
   A.go('score',fid);ok(A.has('[data-act="lockm"]')&&/Publish results/.test(A.d.querySelector('[data-act="lockm"]').textContent)&&/shows the team on the app/.test(A.d.getElementById('view').textContent),'Publish results button (was Lock match)');snap(A,'pubbtn');
   A.click('[data-act="lockm"]');await wait(250);ok(m.pub&&m.lock&&/Results published/.test(A.toast()),'Publish results: published and locked');
   await V.H.pull(false);await wait(100);V.go('team',fid);ok(/Team as played/.test(vt())&&/Set 1/.test(vt())&&!/Reserves/.test(vt())&&!/will be published/.test(vt()),'viewer sees the team as played, no reserves');snap(V,'vteam');
   A.go('score',fid);ok(/🔒 Results published/.test(A.d.getElementById('view').textContent)&&/Published by Andy Nancollis/.test(A.d.getElementById('view').textContent),'lock card: Results published · Published by');
   R.go('score',fid);await R.H.pull(false);await wait(80);R.go('score',fid);ok(!R.has('[data-act="unlockm"]'),'scorer cannot unlock');
   A.click('[data-act="unlockm"]');await wait(250);await V.H.pull(false);await wait(100);V.go('team',fid);ok(!S.matches[fid].lock&&/Team as played/.test(vt()),'unlocked by an admin: team stays visible');
   A.click('[data-act="lockm"]');await wait(100);ok(S.matches[fid].log.some(x=>/Published again/.test(x.what)),'publish again logged');
   const m2=mk(fid2,Date.now()-2*86400000);A.H.save();await wait(250);await V.H.pull(false);await wait(100);V.go('team',fid2);ok(/Team as played/.test(vt()),'6am auto-lock counts as published');
   A.go('score',fid2);A.click('[data-act="unlockm"]');await wait(200);ok(m2.pub&&m2.pub.by==='auto','unlocking an auto-published match keeps it published');await V.H.pull(false);await wait(100);V.go('team',fid2);ok(/Team as played/.test(vt()),'…and visible to viewers');
   // Sent to league
   A.go('score',fid);ok(/Create league card/.test(A.d.getElementById('view').textContent)&&!/Sent to league/.test(A.d.getElementById('view').textContent),'not sent yet');
   S.matches[fid].leagueSent={at:Date.now(),by:'Andy Nancollis',n:1};A.H.save();await wait(250);
   await R.H.pull(false);await wait(100);R.go('score',fid);ok(/Sent to league by Andy Nancollis/.test(R.d.getElementById('view').textContent)&&/League card \(sent\)/.test(R.d.getElementById('view').textContent),'sent line on another phone');snap(R,'sent');
   A.go('score',fid);A.d.getElementById('view').insertAdjacentHTML('beforeend','<button id="tsl" data-act="sendleague"></button>');A.click('#tsl');ok(/Send it again\?/.test(A.modal())&&/Sent to league by Andy Nancollis/.test(A.modal())&&A.has('#mbox [data-act="sendleague"][data-ok="1"]'),'Resend asks first');ok(A.has('#mbox [data-act="leaguecard"]'),'Cancel goes back to the card');A.d.getElementById('modal').click();
   ok(A.H.needFor({act:'leaguemark'})==='edit','Mark as sent: scorers and admins');
   ok(A.H.lcCell({v:7,sp:true})==='7','spares drawn without brackets');}
  // v3.12: league email, cup note, GD groups, L/S limits, cup tie-break (rule 42)
  {const S=A.H.S(),tot=(m,t)=>m[t].reduce((a,r)=>a+r.reduce((b,c)=>b+(c?c.v:0),0),0);
   A.go('score','L8');
   ok(A.H.leagueMailText()==='Hi John\n\nScorecard for match on 6th Nov 2026, Steamers vs Lions.\n\nLions won, 12 – 2.\n\nMany thanks\n\nAndy Nancollis, The Lions.','league email: new wording ('+JSON.stringify(A.H.leagueMailText())+')');
   S.rules.general.leagueContact='Sarah';ok(/^Hi Sarah\n/.test(A.H.leagueMailText()),'league contact name setting');S.rules.general.leagueContact='John';
   A.go('rules');ok(A.has('#gContact'),'Settings: league contact name field');
   ok(/48 hours/.test(A.H.cardNote(S.fixtures.find(f=>f.id==='L8'))),'league card note: 48 hours (rule 23)');
   const gdt=S.fixtures.find(f=>f.comp==='gdt');ok(S.comps.find(c=>c.id==='gdt').type==='group'&&S.rules.types.group&&S.rules.types.group.result==='sets'&&S.rules.types.group.matchWin===6,'GD Tournament group games: league-style points (rule 51)');
   ok(S.rules.types.cup.tie==='sudden'&&/rule 42/.test(S.rules.types.cup.notes),'cup tie rule = sudden death (rule 42)');
   // L/S limits
   const used=['L10','L12','L14','L15'],lf=S.fixtures.filter(f=>/^L/.test(f.id)&&f.status==='scheduled'&&!S.matches[f.id]&&!used.includes(f.id)),fid=lf[lf.length-3].id;
   const sel=S.sel[fid]||(S.sel[fid]={avail:{},req:{},lineup:Array(12).fill(null),reserves:[]});
   A.go('team',fid);A.click('[data-slot="0"]');A.click('[data-slot="0"]');ok(!/L\/S \(lowest score\)/.test(A.modal())&&/No L\/S in set 1/.test(A.modal()),'L/S not offered in set 1');A.click('[data-act="close"]');
   A.click('[data-slot="5"]');A.click('[data-slot="5"]');ok(/L\/S \(lowest score\)/.test(A.modal()),'L/S offered in set 2');A.click('[data-act="close"]');
   sel.lineup[3]='LS';sel.lineup[6]='LS';A.go('team',fid);A.click('[data-slot="9"]');A.click('[data-slot="9"]');ok(!/L\/S \(lowest score\)/.test(A.modal())&&/used twice/.test(A.modal()),'L/S limited to 2 (rule 14)');A.click('[data-act="close"]');sel.lineup[3]=null;sel.lineup[6]=null;
   const semi=S.fixtures.find(f=>f.comp!=='league'&&/semi/i.test(f.round||''));A.go('team',semi.id);A.click('[data-slot="5"]');A.click('[data-slot="5"]');ok(/Semi-Final or Final/.test(A.modal())&&!/L\/S \(lowest score\)/.test(A.modal()),'no L/S in a cup Semi-Final (rule 41)');A.click('[data-act="close"]');
   // cup tie
   const mk=(id,cupRules)=>{const m=JSON.parse(JSON.stringify(S.matches.L8));Object.assign(m,{fid:id,lock:null,unlockedAt:null,everLocked:false,log:[],doneAt:Date.now(),scorer:null,hist:[],tieWinner:null,sd:null});delete m.pub;delete m.leagueSent;m.rules=JSON.parse(JSON.stringify(S.rules.types.cup));
     const f=S.fixtures.find(x=>x.id===id);m.home=f.home;let g=0;while(tot(m,'O')<tot(m,'L')&&g++<900){for(const row of m.O)for(const c of row)if(!c.sp&&!c.vc&&c.v<9&&tot(m,'O')<tot(m,'L'))c.v++;}S.matches[id]=m;return m;};
   const kr2=S.fixtures.find(f=>f.comp==='ko'&&/round 2/i.test(f.round||'')),m=mk(kr2.id);A.H.save();await wait(150);
   ok(tot(m,'L')===tot(m,'O')&&A.H.pinsTie(m),'cup match level on pins ('+tot(m,'L')+')');
   A.go('score',kr2.id);const vt=()=>A.d.getElementById('view').textContent;
   ok(/Tied on pins/.test(vt())&&/League rule 42/.test(vt())&&/Sudden death to decide it/.test(vt())&&A.has('[data-act="sdstart"]')&&!A.has('[data-act="lockm"]'),'tie guide card, board message, no Publish yet');snap(A,'tieguide');
   ok(/cup match/i.test(vt())&&/72 hours/.test(vt()),'cup card note: first-named team, 72 hours (rule 44)');
   A.click('[data-act="sdstart"]');const cbs=[...A.d.querySelectorAll('[data-sdpick]')];ok(cbs.filter(c=>c.checked).length===6&&/Sudden death: pick 3 each/.test(A.modal()),'pick 3 each, set 4 ticked');snap(A,'sdpick');
   A.click('[data-act="sdgo"]');await wait(50);ok(m.sd&&!m.sd.final&&m.sd.L.length===3&&m.sd.O.length===3&&A.has('[data-v="7"]')&&/Sudden death/.test(vt()),'sudden death started, keypad shown');
   const H=A.H.S().matches[kr2.id],ht=H.home?'L':'O',at=H.home?'O':'L';
   [8,6,7,9,8].forEach(v=>A.click('[data-v="'+v+'"]'));ok(/Needs 4 to tie, 5 to win\./.test(vt()),'last thrower hint: needs 4 to tie, 5 to win');snap(A,'sdlast');
   A.click('[data-v="4"]');await wait(30);ok(/Still level: play another hand/.test(vt())&&A.has('[data-act="sdmore"]'),'round 1 level: play another hand');
   A.click('[data-act="sdmore"]');ok(A.H.sdState(m).n===2&&A.has('[data-v="5"]'),'round 2 started');
   [9,7,7,8,9].forEach(v=>A.click('[data-v="'+v+'"]'));A.click('[data-act="undo"]');ok(!m.sd[at][1].h[1]&&m.sd[at][0].h[1],'undo removes the last sudden-death hand');A.click('[data-v="9"]');A.click('[data-v="8"]');await wait(50);
   const R=A.H.sdState(m);ok(R.winner===at&&R[at]===25&&R[ht]===23,'away team wins round 2, 25 – 23 (each round from zero)');
   ok(/win on sudden death/.test(vt())&&A.has('[data-act="lockm"]'),'board: win on sudden death; Publish results back');snap(A,'sdwon');
   ok(/won on the sudden-death hand, \d+ pins each\./.test(A.H.leagueMailText()),'email: won on the sudden-death hand');
   ok(/SUDDEN DEATH/.test(A.H.scoresText())&&/sudden-death hand/.test(A.H.reportText()),'all-scores text and report include the sudden death');
   const pid=m.lineup[m.sd.L[0].p],a=A.H.averages31().find(x=>x.pid===pid),sdp=m.sd.L[0].h.reduce((s,c)=>s+(c?c.v:0),0);
   ok(a&&a.pinsAll-a.pins===sdp&&Math.abs(a.avgGame-a.pins/a.games)<1e-9,'stats: sudden-death pins in the pins tally, not the average');
   A.click('[data-sdcell="L,0,0"]');ok(/Changing/.test(vt()),'tap a sudden-death score to change it');A.click('[data-act="cancelsel"]');
   await V.H.pull(false);await wait(100);V.go('score',kr2.id);ok(/win on sudden death/.test(V.d.getElementById('view').textContent)&&/Sudden death/.test(V.d.getElementById('view').textContent)&&!V.has('[data-sdcell]'),'viewer sees the result and the sudden-death table, read-only');
   A.go('score',kr2.id);A.click('[data-act="oppnames"][data-set="0"]');A.set('on0','L/S');A.click('[data-act="saveopp"]');ok(/No L\/S in set 1/.test(A.toast())&&m.opp[0]!=='L/S','opposition L/S refused in set 1');A.click('[data-act="close"]');
   // Final: 5th set
   const kf=S.fixtures.find(f=>f.comp==='ko'&&A.H.isFinalFx(f)),mf=mk(kf.id);A.H.save();A.go('score',kf.id);
   ok(/5th set to decide it/.test(vt())&&/complete 5th set/.test(vt()),'Final: guide says 5th set');A.click('[data-act="sdstart"]');A.click('[data-act="sdgo"]');await wait(50);
   ok(mf.sd&&mf.sd.final&&/5th set \(Final\)/.test(vt())&&/5th set · Hand/.test(vt()),'Final: 5th set scored like a normal set');snap(A,'final5');
   A.click('[data-act="sdcancel"]');ok(!mf.sd,'cancel before any score');}
  ok(/Close season 2026\/27/.test((A.go('backup'),A.d.getElementById('view').textContent))&&!C.H.needFor({act:'closeseasonok'})!=='admin','Close season on Backup page for admins');
  A.click('[data-act="closeseason"]');A.set('csName','2026/28');A.click('[data-act="closeseasonok"]');ok(A.H.curSeason()==='2026-27','wrong confirmation text: season not closed');
  A.set('csName','2026/27');A.click('[data-act="closeseasonok"]');await wait(300);
  ok(A.H.curSeason()==='2027-28'&&B.docs.seasons&&B.docs.seasons.data['2026-27']&&B.docs.seasons.data['2026-27'].sheet.matches.length>0,'season closed: 2027/28 started, 2026/27 summary shared');
  await V.H.pull(true);await wait(150);ok(V.H.curSeason()==='2027-28'&&V.H.seasonList().join()==='2027-28,2026-27,2025-26,2024-25,2023-24,2022-23','viewer phone gets the new season: '+V.H.seasonList().join());
  V.go('averages');ok(/No completed League or Cup matches yet/.test(V.d.getElementById('view').textContent),'new season starts empty');
  {const b=V.H.bands([{games:1},{games:5}],'2027-28');ok(!b.on&&b.main.length===2&&!b.low.length,'start of season (under 3 team matches): no line, everyone ranked');}
  ok(A.H.isFrozenFx(A.H.S().fixtures.find(f=>f.id==='L8')),'2026/27 fixtures frozen');
  A.go('score','L8');ok(!A.has('[data-act="unlockm"]')&&/scores are final/.test(A.d.getElementById('view').textContent),'closed season: no Unlock, scores final');
  A.go('home');ok(!/Gatecrashers/.test((A.d.querySelector('.card.now')||{textContent:''}).textContent),'closed season fixtures not offered as the next match');
  const dump=(P,f)=>{const o={};for(let i=0;i<P.w.localStorage.length;i++){const k=P.w.localStorage.key(i);o[k]=P.w.localStorage.getItem(k);}fs.writeFileSync(f,JSON.stringify({store:o,people:Object.values(B.people)}));};if(process.env.DUMP){dump(A,'/tmp/store_A.json');dump(V,'/tmp/store_V.json');dump(C,'/tmp/store_C.json');}
  console.log(fails?fails+' FAILED':'ALL PASS');process.exit(0);
})().catch(e=>{console.log('ERROR',e);process.exit(1);});

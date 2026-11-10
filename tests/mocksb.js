// In-memory stand-in for Supabase, mirroring the SQL security rules, shared by several "phones"
function Backend(){const B={docs:{},people:{p10:{pid:'p10',role:'admin',uid:null,requested:false,name:'A. Nancollis'},p9:{pid:'p9',role:'admin',uid:null,requested:false,name:'D. Dibble'},p13:{pid:'p13',role:'admin',uid:null,requested:false,name:'A. Watt'}},users:{},chans:[],clock:0,down:false,log:[]};
  B.now=()=>new Date(Date.UTC(2026,10,20,19,0,0)+(++B.clock)*1000).toISOString();
  B.roleOf=uid=>{if(!uid)return null;const p=Object.values(B.people).find(x=>x.uid===uid&&!x.requested);return p?p.role:null;};
  B.isAdmin=uid=>B.roleOf(uid)==='admin';B.isEditor=uid=>['admin','scorer'].includes(B.roleOf(uid));
  B.scorerKey=k=>k==='players'||k==='oppNames'||k.startsWith('sel:')||k.startsWith('match:');
  B.canRead=(uid,k)=>!k.startsWith('subs:')||B.isAdmin(uid);
  B.canWrite=(uid,k)=>B.isAdmin(uid)||(B.isEditor(uid)&&B.scorerKey(k));
  B.emit=(table,row)=>{setTimeout(()=>B.chans.forEach(c=>{if(c.dead)return;if(table==='docs'&&!B.canRead(c.client.uid(),row.key))return;(c.h[table]||[]).forEach(f=>f({new:JSON.parse(JSON.stringify(row))}));}),5);};
  return B;}
function client(B,store){let ses=store?JSON.parse(store.getItem('mock-ses')||'null'):null;const keep=()=>store&&store.setItem('mock-ses',JSON.stringify(ses));const cbs=[];const uid=()=>ses&&ses.user.id;const P=v=>new Promise((res,rej)=>setTimeout(()=>B.down?rej(new Error('Failed to fetch')):res(v),2));
  const fire=(ev)=>{keep();cbs.forEach(f=>f(ev,ses));};
  const C={uid,auth:{onAuthStateChange(f){cbs.push(f);return {data:{subscription:{unsubscribe(){}}}};},getSession(){return Promise.resolve({data:{session:ses}});},
    signUp({email,password}){if(B.users[email])return P({data:{},error:{message:'User already registered'}});const id='u-'+Object.keys(B.users).length+'-'+email;B.users[email]={id,email,password};ses={user:{id,email}};setTimeout(()=>fire('SIGNED_IN'),1);return P({data:{user:ses.user,session:ses},error:null});},
    signInWithPassword({email,password}){const u=B.users[email];if(!u||u.password!==password)return P({data:{},error:{message:'Invalid login credentials'}});ses={user:{id:u.id,email}};setTimeout(()=>fire('SIGNED_IN'),1);return P({data:{user:ses.user,session:ses},error:null});},
    signOut(){ses=null;setTimeout(()=>fire('SIGNED_OUT'),1);return Promise.resolve({error:null});},
    resetPasswordForEmail(){return P({data:{},error:null});},updateUser(){return P({data:{},error:null});}},
    rpc(fn,a){const me=uid();if(fn==='admin_requests')return P({data:B.isAdmin(me)?Object.values(B.people).filter(p=>p.requested&&p.uid).map(p=>({pid:p.pid,email:(Object.values(B.users).find(u=>u.id===p.uid)||{}).email})):[],error:null});if(fn!=='claim_player')return P({error:{message:'no fn'}});if(!me)return P({error:{message:'Not signed in'}});
      if(Object.values(B.people).some(p=>p.uid===me&&p.pid!==a.p_pid))return P({error:{message:'This sign-in is already linked to another player'}});
      const r=B.people[a.p_pid];if(r&&r.uid&&r.uid!==me)return P({error:{message:'That player already has a sign-in. Ask an admin to unlink it.'}});
      if(!r){B.people[a.p_pid]={pid:a.p_pid,role:'none',uid:me,requested:true,name:a.p_name};B.emit('people',B.people[a.p_pid]);return P({data:'requested',error:null});}
      if(r.uid===me)return P({data:r.requested||r.role==='none'?'requested':r.role,error:null});
      r.uid=me;r.requested=!(B.bootstrap||[]).includes(a.p_pid);B.emit('people',r);return P({data:r.requested?'requested':r.role,error:null});},
    from(table){return {
      select(){let gt=null;const q={gt(c,v){gt=v;return q;},then(res,rej){return P(null).then(()=>{let rows=table==='docs'?Object.values(B.docs).filter(r=>B.canRead(uid(),r.key)&&(!gt||r.updated_at>gt)):Object.values(B.people);return {data:JSON.parse(JSON.stringify(rows)),error:null};}).then(res,rej);}};return q;},
      upsert(rows){rows=[].concat(rows);const run=()=>{if(table==='docs'){for(const r of rows)if(!B.canWrite(uid(),r.key))return {data:null,error:{message:'new row violates row-level security policy for table "docs"'}};
          const out=rows.map(r=>{const row={key:r.key,data:JSON.parse(JSON.stringify(r.data)),updated_at:B.now(),updated_by:r.updated_by};B.docs[r.key]=row;B.log.push(r.key);B.emit('docs',row);return {key:r.key,updated_at:row.updated_at};});return {data:out,error:null};}
        if(!B.isAdmin(uid()))return {data:[],error:null};rows.forEach(r=>{B.people[r.pid]=Object.assign(B.people[r.pid]||{uid:null},r);B.emit('people',B.people[r.pid]);});return {data:rows,error:null};};
        const t={select(){return P(null).then(run);},then(a,b){return P(null).then(run).then(a,b);}};return t;},
      update(obj){return {eq(c,v){return P(null).then(()=>{if(!B.isAdmin(uid()))return {data:[],error:null};Object.assign(B.people[v],obj);B.emit('people',B.people[v]);return {data:[B.people[v]],error:null};});}};}};},
    channel(){const ch={client:C,h:{},on(ev,f,cb){ch.h[f.table]=(ch.h[f.table]||[]).concat(cb);return ch;},subscribe(cb){B.chans.push(ch);setTimeout(()=>cb('SUBSCRIBED'),3);return ch;}};return ch;}};
  return C;}
module.exports={Backend,client};

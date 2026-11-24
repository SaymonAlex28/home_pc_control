import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {getDatabase,ref,onValue,update,set,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import {firebaseConfig} from './firebase-config.js';
const $=id=>document.getElementById(id), ids=['PC_1','PC_2','PC_3'];
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);
let devices={},unsubscribers=[],pending={};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format=s=>{s=Math.max(0,Math.floor(Number(s)||0));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(x=>String(x).padStart(2,'0')).join(':')};
let connected=false, clockReady=false, anchor=0, tick=0;
const now=()=>anchor+performance.now()-tick;
const icons={monitor:'<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M12 16v5M7 21h10"/>',power:'<path d="M12 2v10M6 5a9 9 0 1 0 12 0"/>',rename:'<path d="m4 16 12-12 4 4L8 20H4zM13 7l4 4"/>'};
const svg=k=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[k]}</svg>`;
function isOnline(d){const age=now()-Number(d?.heartbeat);return connected&&clockReady&&d?.status==='online'&&Number.isFinite(age)&&age<20000&&age>-60000}
function render(){let n=0;const focused=document.activeElement;const focusKey=focused?.dataset?.rename||focused?.dataset?.off;const focusType=focused?.dataset?.rename?'rename':'off';const html=ids.map(id=>{const d=devices[id]||{},online=isOnline(d);if(online)n++;let p=pending[id];if(p&&performance.now()-p.at>45000){delete pending[id];p=null}const status=p?(online?p.state:'Связь потеряна после команды'):(online?'В сети':connected?'Не в сети':'Нет связи');return `<article class="card ${online?'online':''} ${p?'pending':''}"><div class="monitor">${svg('monitor')}</div><div class="details"><div class="small">${id}</div><h3>${esc(d.name||id.replace('_','-'))}</h3><div class="status"><span class="dot"></span>${esc(status)}</div><div class="uptime">${online?format(d.uptime):'—'}</div></div><button class="iconbtn rename" data-rename="${id}" aria-label="Изменить имя ${id}">${svg('rename')}</button><button class="iconbtn danger" data-off="${id}" aria-label="Выключить ${id}" ${online&&!p?'':'disabled'}>${svg('power')}</button></article>`}).join('');if($('cards').innerHTML!==html){$('cards').innerHTML=html;if(focusKey)$('cards').querySelector(`[data-${focusType}="${focusKey}"]`)?.focus()}$('onlineCount').textContent=`${n}/3`;$('connection').textContent=connected&&clockReady?'Firebase подключён':'Нет связи / синхронизация';$('nodes').innerHTML=ids.map((id,i)=>`<span class="${isOnline(devices[id])?'on':''}">0${i+1}</span>`).join('');$('allOff').disabled=!ids.some(id=>isOnline(devices[id])&&!pending[id])}
let confirming=false;
async function confirmShutdown(list){if(confirming)return false;confirming=true;try{const dialog=$('confirmDialog');$('confirmNames').textContent=list.map(id=>devices[id]?.name||id).join(', ');dialog.returnValue='cancel';return await new Promise(resolve=>{dialog.addEventListener('close',()=>resolve(dialog.returnValue==='ok'),{once:true});dialog.showModal()})}finally{confirming=false}}
$('cards').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const id=b.dataset.rename||b.dataset.off;if(!id)return;if(b.dataset.rename){const name=prompt('Новое имя компьютера:',devices[id]?.name||id);if(name===null)return;const value=name.trim();if(!value||value.length>60){$('message').textContent='Имя должно содержать от 1 до 60 символов';return}try{await update(ref(db,'devices/'+id),{name:value});$('message').textContent='Имя сохранено'}catch(err){$('message').textContent='Ошибка записи: '+err.message}return}await sendShutdown([id])});
async function sendShutdown(list){
 list=list.filter(id=>isOnline(devices[id])&&!pending[id]);
 if(!list.length)return;
 if(!await confirmShutdown(list))return;
 list=list.filter(id=>isOnline(devices[id])&&!pending[id]);
 if(!auth.currentUser)return;
 await Promise.all(list.map(async id=>{
 const cid=crypto.randomUUID(); pending[id]={cid,at:performance.now(),state:'Отправка команды…'}; render();
 try{await set(ref(db,'commands/'+id),{action:'shutdown',id:cid,createdAt:serverTimestamp(),mode:'live'});if(pending[id]?.cid===cid&&pending[id].state==='Отправка команды…')pending[id].state='Команда отправлена';}
 catch(err){delete pending[id]; $('message').textContent='Ошибка '+id+': '+err.message;} render();
 }));
}
$('allOff').onclick=()=>sendShutdown(ids.filter(id=>isOnline(devices[id])));
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginError').textContent='';try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value)}catch(err){$('loginError').textContent='Не удалось войти: '+err.code}};
$('logout').onclick=()=>signOut(auth);
onValue(ref(db,'.info/serverTimeOffset'),snap=>{anchor=Date.now()+Number(snap.val()||0);tick=performance.now();clockReady=true;render()});
onValue(ref(db,'.info/connected'),snap=>{connected=snap.val()===true;render()});
onAuthStateChanged(auth,user=>{
  unsubscribers.forEach(stop=>stop());
  unsubscribers=[];
  devices={}; pending={};
  $('loginPanel').hidden=!!user;
  $('dashboard').hidden=!user;
  $('logout').hidden=!user;
  $('account').textContent=user?.email||'';
  $('message').textContent='';
  if(user){
    $('password').value='';
    // Firebase rules grant read permission to each device, not to /devices.
    ids.forEach(id=>{
      const stop=onValue(ref(db,'devices/'+id),snap=>{
        devices[id]=snap.val()||{};
        render();
      },err=>{
        devices[id]={};
        $('message').textContent='Ошибка чтения '+id+': '+err.message;
        render();
      });
      unsubscribers.push(stop);
      unsubscribers.push(onValue(ref(db,'command_results/'+id),snap=>{
        const r=snap.val(), p=pending[id]; if(!p||r?.id!==p.cid)return;
        p.state=r.result==='shutdown_requested'?'Выключается…':r.result==='test_ok'?'Агент не разрешил выключение':'Ответ: '+String(r.result);render();
      },()=>{}));
    });
  }
  render();
});
setInterval(()=>{if(!$('dashboard').hidden)render()},1000);
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});

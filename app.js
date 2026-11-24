import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {getDatabase,ref,onValue,update,set,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import {firebaseConfig} from './firebase-config.js';
const $=id=>document.getElementById(id), ids=['PC_1','PC_2','PC_3'];
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);
let devices={},unsubscribers=[],pending={};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format=s=>{s=Math.max(0,Math.floor(Number(s)||0));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(x=>String(x).padStart(2,'0')).join(':')};
function isOnline(d){return d && Number.isFinite(Number(d.heartbeat)) && Date.now()-Number(d.heartbeat)<20000 && Date.now()-Number(d.heartbeat)>-60000 && d.status==='online'}
function render(){let n=0; $('cards').innerHTML=ids.map(id=>{const d=devices[id]||{},online=isOnline(d);if(online)n++;let p=pending[id]; if(p && Date.now()-p.at>45000){delete pending[id];p=null;} const status=p?(online?p.state:'Связь потеряна после команды'):(online?'В сети':'Не в сети');const name=esc(d.name||id.replace('_','-'));return `<article class="card ${online?'online':''}"><div class="card-head"><div><div class="muted small">${id}</div><h3>${name}</h3></div><span class="icon">▣</span></div><div class="status"><span class="dot"></span>${esc(status)}</div><div class="muted small">Время работы</div><div class="uptime">${online?format(d.uptime):'—'}</div><div class="card-bottom"><button class="rename" data-rename="${id}">✎ Имя</button><button class="danger" data-off="${id}" ${online&&!p?'':'disabled'}>⏻ Выключить</button></div></article>`}).join('');$('onlineCount').textContent=`${n} / 3 в сети`;$('allOff').disabled=!ids.some(id=>isOnline(devices[id])&&!pending[id])}
$('cards').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const id=b.dataset.rename||b.dataset.off;if(!id)return;if(b.dataset.rename){const name=prompt('Новое имя компьютера:',devices[id]?.name||id);if(name===null)return;const value=name.trim();if(!value||value.length>60){$('message').textContent='Имя должно содержать от 1 до 60 символов';return}try{await update(ref(db,'devices/'+id),{name:value});$('message').textContent='Имя сохранено'}catch(err){$('message').textContent='Ошибка записи: '+err.message}return}await sendShutdown([id])});
async function sendShutdown(list){
 list=list.filter(id=>isOnline(devices[id])&&!pending[id]);
 if(!list.length)return;
 if(!confirm(`Выключить ${list.map(id=>devices[id]?.name||id).join(', ')}? Несохранённые данные могут быть потеряны.`))return;
 await Promise.all(list.map(async id=>{
 const cid=crypto.randomUUID(); pending[id]={cid,at:Date.now(),state:'Отправка команды…'}; render();
 try{await set(ref(db,'commands/'+id),{action:'shutdown',id:cid,createdAt:serverTimestamp(),mode:'live'});if(pending[id]?.cid===cid&&pending[id].state==='Отправка команды…')pending[id].state='Команда отправлена';}
 catch(err){delete pending[id]; $('message').textContent='Ошибка '+id+': '+err.message;} render();
 }));
}
$('allOff').onclick=()=>sendShutdown(ids.filter(id=>isOnline(devices[id])));
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginError').textContent='';try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value)}catch(err){$('loginError').textContent='Не удалось войти: '+err.code}};
$('logout').onclick=()=>signOut(auth);
onAuthStateChanged(auth,user=>{
  unsubscribers.forEach(stop=>stop());
  unsubscribers=[];
  devices={}; pending={};
  $('loginPanel').hidden=!!user;
  $('dashboard').hidden=!user;
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
setInterval(()=>{if(!$('dashboard').hidden)render()},5000);
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});

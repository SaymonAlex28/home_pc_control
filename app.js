import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {getDatabase,ref,onValue,update,set,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import {firebaseConfig} from './firebase-config.js';
const $=id=>document.getElementById(id), ids=['PC_1','PC_2','PC_3'];
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);
let devices={},unsubscribers=[];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format=s=>{s=Math.max(0,Math.floor(Number(s)||0));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(x=>String(x).padStart(2,'0')).join(':')};
function isOnline(d){return d && Number.isFinite(Number(d.heartbeat)) && Date.now()-Number(d.heartbeat)<20000 && Date.now()-Number(d.heartbeat)>-60000 && d.status==='online'}
function render(){let n=0; $('cards').innerHTML=ids.map(id=>{const d=devices[id]||{},online=isOnline(d);if(online)n++;const name=esc(d.name||id.replace('_','-'));return `<article class="card ${online?'online':''}"><div class="card-head"><div><div class="muted small">${id}</div><h3>${name}</h3></div><span class="icon">▣</span></div><div class="status"><span class="dot"></span>${online?'В сети':'Не в сети'}</div><div class="muted small">Время работы</div><div class="uptime">${online?format(d.uptime):'—'}</div><div class="card-bottom"><button class="rename" data-rename="${id}">✎ Имя</button><button class="danger" data-off="${id}" ${online?'':'disabled'}>⏻ Выключить</button></div></article>`}).join('');$('onlineCount').textContent=`${n} / 3 Online`;$('allOff').disabled=n===0}
$('cards').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const id=b.dataset.rename||b.dataset.off;if(!id)return;if(b.dataset.rename){const name=prompt('Новое имя компьютера:',devices[id]?.name||id);if(name===null)return;const value=name.trim();if(!value||value.length>60){$('message').textContent='Имя должно содержать от 1 до 60 символов';return}try{await update(ref(db,'devices/'+id),{name:value});$('message').textContent='Имя сохранено'}catch(err){$('message').textContent='Ошибка записи: '+err.message}return}await sendShutdown([id])});
// Режим выбирается в панели. По умолчанию безопасный тест.
let shutdownMode = 'test';
function ensureModeControl(){
  if(document.getElementById('shutdownModeControl'))return;
  const allOff=$('allOff');
  if(!allOff)return;
  const wrap=document.createElement('div');
  wrap.id='shutdownModeControl';
  wrap.style.cssText='display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:14px 0;color:#e8f6fb;font-size:14px';
  const label=document.createElement('label');
  label.htmlFor='shutdownMode';
  label.textContent='Режим команд:';
  const select=document.createElement('select');
  select.id='shutdownMode';
  select.style.cssText='padding:9px 12px;border-radius:9px;background:#162b3b;color:#fff;border:1px solid #4a8498';
  select.innerHTML='<option value="test">Тест (без выключения)</option><option value="live">LIVE (реальное выключение)</option>';
  const hint=document.createElement('span');
  hint.id='shutdownModeHint';
  hint.textContent='Тестовый режим: ПК не выключится';
  select.addEventListener('change',()=>{
    shutdownMode=select.value;
    hint.textContent=shutdownMode==='live'?'ВНИМАНИЕ: компьютер действительно выключится':'Тестовый режим: ПК не выключится';
    hint.style.color=shutdownMode==='live'?'#ff8888':'#9ed8e8';
  });
  wrap.append(label,select,hint);
  allOff.parentNode.insertBefore(wrap,allOff);
}
ensureModeControl();
async function sendShutdown(list){
  if(!list.length)return;
  const names=list.map(id=>devices[id]?.name||id).join(', ');
  const mode=shutdownMode;
  const question=mode==='live'
    ? `РЕАЛЬНО ВЫКЛЮЧИТЬ: ${names}?\n\nНесохранённые данные могут быть потеряны. Продолжить?`
    : `Отправить ТЕСТОВУЮ команду выключения для: ${names}?`;
  if(!confirm(question))return;
  if(mode==='live' && !confirm('Последнее подтверждение: выключить выбранные ПК прямо сейчас?'))return;
  try{
    await Promise.all(list.map(id=>set(ref(db,'commands/'+id),{
      action:'shutdown',id:crypto.randomUUID(),createdAt:serverTimestamp(),mode
    })));
    $('message').textContent=mode==='live'
      ? 'LIVE-команда отправлена. Проверь результат агента в Firebase (command_results).'
      : 'Тестовая команда отправлена. Компьютер не выключится.';
  }catch(err){$('message').textContent='Ошибка отправки: '+err.message}
}
$('allOff').onclick=()=>sendShutdown(ids.filter(id=>isOnline(devices[id])));
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginError').textContent='';try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value)}catch(err){$('loginError').textContent='Не удалось войти: '+err.code}};
$('logout').onclick=()=>signOut(auth);
onAuthStateChanged(auth,user=>{
  unsubscribers.forEach(stop=>stop());
  unsubscribers=[];
  devices={};
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
    });
  }
  render();
});
setInterval(()=>{if(!$('dashboard').hidden)render()},5000);
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});

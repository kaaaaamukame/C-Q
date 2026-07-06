const APP_VERSION = '5.0.0-subject-practice';
const STORAGE_KEY = 'cq_study_v5';
let questions = [];
let view = { route:'home', list:[], index:0, selected:null, submitted:false, showAnswer:false, filter:{} };
let state = loadState();

function loadState(){
  const base = { flags:{}, wrong:{}, stats:{}, notes:{}, sessions:[], theme:'light', plan:null }; 
  try { return { ...base, ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}) }; }
  catch { return base; }
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function $(id){ return document.getElementById(id); }
function screen(){ return $('screen'); }
function normalizeSubject(s=''){
  if(s.includes('行銷管理') || s.includes('管理課本')) return '科目一';
  if(s.includes('加油站經營')) return '科目二';
  if(s.includes('安全衛生')) return '科目三';
  if(s.includes('行銷業務')) return '科目四';
  if(s.includes('加盟站')) return '科目五';
  return s || '未分類';
}
function qid(q){ return q.id; }
function recordOf(q){ return state.stats[qid(q)] || {attempts:0, correct:0, wrong:0, last:null, lastAnswer:null}; }
function isWrong(q){ return !!state.wrong[qid(q)]; }
function isFlag(q){ return !!state.flags[qid(q)]; }
function pct(n,d){ return d ? Math.round(n/d*100) : 0; }
function shuffle(arr){ return [...arr].sort(()=>Math.random()-0.5); }
function todayKey(){ return new Date().toISOString().slice(0,10); }
function setRoute(route){ view.route=route; document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('nav-active',b.dataset.route===route)); render(); }
function startQuiz(list, title='刷題'){
  view = { route:'quiz', list:list.length?list:questions, index:0, selected:null, submitted:false, showAnswer:false, title };
  document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('nav-active',b.dataset.route==='quiz'));
  render();
}
function currentQ(){ return view.list[view.index]; }
function resetQState(){ view.selected=null; view.submitted=false; view.showAnswer=false; }

async function init(){
  document.documentElement.classList.toggle('dark', state.theme==='dark');
  screen().innerHTML = $('loadingTpl').innerHTML;
  try{
    const res = await fetch('questions.json?v=' + APP_VERSION);
    questions = await res.json();
  }catch(e){
    screen().innerHTML = `<section class="card"><h2>題庫載入失敗</h2><p class="muted">請確認 questions.json 已上傳到同一個資料夾。</p></section>`;
    return;
  }
  bindEvents();
  render();
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('service-worker.js').catch(()=>{}); }
}
function bindEvents(){
  $('homeBtn').onclick=()=>setRoute('home');
  $('themeBtn').onclick=()=>{ state.theme = state.theme==='dark'?'light':'dark'; saveState(); document.documentElement.classList.toggle('dark', state.theme==='dark'); };
  document.querySelectorAll('.bottom-nav button').forEach(b=> b.onclick=()=>setRoute(b.dataset.route));
}

function overall(){
  const recs = Object.values(state.stats);
  const attempts = recs.reduce((s,r)=>s+r.attempts,0);
  const correct = recs.reduce((s,r)=>s+r.correct,0);
  const wrong = recs.reduce((s,r)=>s+r.wrong,0);
  return {attempts,correct,wrong,rate:pct(correct,attempts), flags:Object.keys(state.flags).length, wrongCount:Object.keys(state.wrong).length, done:recs.length};
}
function render(){
  if(view.route==='home') return renderHome();
  if(view.route==='quiz') return renderQuiz();
  if(view.route==='wrong') return renderList('錯題', questions.filter(isWrong));
  if(view.route==='stats') return renderStats();
  if(view.route==='settings') return renderSettings();
}
function uniqueYears(){ return [...new Set(questions.map(q=>String(q.examTitle||q.year)))].sort(); }
function uniqueSubjects(){ return [...new Set(questions.map(q=>normalizeSubject(q.subject)))].sort((a,b)=>a.localeCompare(b,'zh-Hant')); }
function countBySubject(subject){ return questions.filter(q=>normalizeSubject(q.subject)===subject).length; }
function countByYear(year){ return questions.filter(q=>String(q.examTitle||q.year)===String(year)).length; }
function getPlanFromUI(){
  const subjects=[...document.querySelectorAll('[name="subjectPick"]:checked')].map(x=>x.value);
  const years=[...document.querySelectorAll('[name="yearPick"]:checked')].map(x=>x.value);
  const mode=$('modePick')?.value || 'random';
  const countRaw=$('countPick')?.value || '20';
  const count=countRaw==='all' ? 'all' : Math.max(1, parseInt(countRaw,10)||20);
  return {subjects, years, mode, count};
}
function poolFromPlan(plan){
  let list=questions.filter(q=>{
    const sub=normalizeSubject(q.subject);
    const yr=String(q.examTitle||q.year);
    return (!plan.subjects?.length || plan.subjects.includes(sub)) && (!plan.years?.length || plan.years.includes(yr));
  });
  if(plan.mode==='wrong') list=list.filter(isWrong);
  if(plan.mode==='flag') list=list.filter(isFlag);
  if(plan.mode==='weak') list=list.filter(q=>recordOf(q).wrong>=2);
  if(plan.mode==='unseen') list=list.filter(q=>!state.stats[qid(q)]);
  if(plan.mode==='random' || plan.mode==='wrong' || plan.mode==='flag' || plan.mode==='weak' || plan.mode==='unseen') list=shuffle(list);
  const count=plan.count==='all' ? list.length : Number(plan.count||20);
  return list.slice(0, count);
}
function planTitle(plan){
  const s = plan.subjects?.length ? plan.subjects.join('＋') : '全部科目';
  const y = plan.years?.length ? plan.years.join('、') : '全部年份';
  const modeMap={random:'隨機', sequential:'順序', wrong:'錯題', flag:'旗標', weak:'錯兩次以上', unseen:'未作答'};
  return `${s}｜${y}｜${modeMap[plan.mode]||'練習'}`;
}
function applyPlanToUI(plan){
  if(!plan) return;
  document.querySelectorAll('[name="subjectPick"]').forEach(x=>x.checked=plan.subjects?.includes(x.value));
  document.querySelectorAll('[name="yearPick"]').forEach(x=>x.checked=plan.years?.includes(x.value));
  if($('modePick')) $('modePick').value=plan.mode||'random';
  if($('countPick')) $('countPick').value=String(plan.count||20);
  updatePracticePreview();
}
function updatePracticePreview(){
  const el=$('practicePreview'); if(!el) return;
  const plan=getPlanFromUI();
  const total=poolFromPlan({...plan,count:'all'}).length;
  const count=plan.count==='all'?total:Math.min(Number(plan.count||20), total);
  el.innerHTML = `符合條件 <b>${total}</b> 題，本次將練習 <b>${count}</b> 題。`;
}
function renderHome(){
  const o=overall();
  const years=uniqueYears();
  const subjects=uniqueSubjects();
  screen().innerHTML = `
  <section class="card">
    <p class="headline">指定科目練習</p>
    <p class="muted">可複選科目、年份，並指定順序、隨機、錯題、旗標或未作答。</p>
    <div class="filter-block">
      <h3>科目</h3>
      <div class="check-grid">${subjects.map(s=>`<label class="check-card"><input type="checkbox" name="subjectPick" value="${escapeHtml(s)}"><span>${escapeHtml(s)}</span><em>${countBySubject(s)}題</em></label>`).join('')}</div>
      <div class="mini-actions"><button class="pill" id="subAll">全選科目</button><button class="pill" id="subNone">清除科目</button></div>
    </div>
    <div class="filter-block">
      <h3>年份</h3>
      <div class="check-grid years">${years.map(y=>`<label class="check-card"><input type="checkbox" name="yearPick" value="${escapeHtml(y)}"><span>${escapeHtml(y)}</span><em>${countByYear(y)}題</em></label>`).join('')}</div>
      <div class="mini-actions"><button class="pill" id="yearAll">全選年份</button><button class="pill" id="yearNone">清除年份</button></div>
    </div>
    <div class="grid two">
      <label class="field"><span>模式</span><select id="modePick"><option value="random">隨機</option><option value="sequential">順序</option><option value="wrong">只刷錯題</option><option value="flag">只刷旗標</option><option value="weak">錯兩次以上</option><option value="unseen">未作答</option></select></label>
      <label class="field"><span>題數</span><select id="countPick"><option value="20">20 題</option><option value="50">50 題</option><option value="100">100 題</option><option value="all">全部</option></select></label>
    </div>
    <p class="muted" id="practicePreview"></p>
    <div class="grid two">
      <button class="btn" id="customStartBtn">開始指定練習</button>
      <button class="btn secondary" id="savePlanBtn">儲存為常用方案</button>
    </div>
    ${state.plan?`<button class="btn secondary full-gap" id="loadPlanBtn">載入常用方案</button>`:''}
  </section>
  <section class="card">
    <p class="headline">今天先刷一組</p>
    <p class="muted">題庫共 ${questions.length} 題；旗標、錯題與筆記會永久保存在此瀏覽器。</p>
    <div class="grid two">
      <button class="btn" id="dailyBtn">今日 20 題</button>
      <button class="btn secondary" id="allBtn">全部題庫</button>
    </div>
  </section>
  <section class="grid three">
    <div class="stat"><b>${o.done}</b><span>已作答題</span></div>
    <div class="stat"><b>${o.rate}%</b><span>正確率</span></div>
    <div class="stat"><b>${o.wrongCount}</b><span>錯題</span></div>
  </section>
  <section class="card">
    <h2>模擬考</h2><div class="pill-row">${years.map(y=>`<button class="pill year" data-year="${escapeHtml(y)}">${escapeHtml(y)}</button>`).join('')}</div>
  </section>
  <section class="card">
    <h2>依科目刷題</h2><div class="grid two">${subjects.map(s=>`<button class="btn secondary subject" data-subject="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('')}</div>
  </section>
  <section class="card">
    <h2>快速入口</h2>
    <div class="grid two">
      <button class="btn secondary" id="wrongBtn">錯題</button>
      <button class="btn secondary" id="flagBtn">旗標</button>
      <button class="btn secondary" id="searchBtn">搜尋</button>
      <button class="btn secondary" id="weakBtn">錯兩次以上</button>
    </div>
  </section>`;
  document.querySelectorAll('[name="subjectPick"],[name="yearPick"]').forEach(x=>x.onchange=updatePracticePreview);
  $('modePick').onchange=updatePracticePreview; $('countPick').onchange=updatePracticePreview;
  $('subAll').onclick=()=>{ document.querySelectorAll('[name="subjectPick"]').forEach(x=>x.checked=true); updatePracticePreview(); };
  $('subNone').onclick=()=>{ document.querySelectorAll('[name="subjectPick"]').forEach(x=>x.checked=false); updatePracticePreview(); };
  $('yearAll').onclick=()=>{ document.querySelectorAll('[name="yearPick"]').forEach(x=>x.checked=true); updatePracticePreview(); };
  $('yearNone').onclick=()=>{ document.querySelectorAll('[name="yearPick"]').forEach(x=>x.checked=false); updatePracticePreview(); };
  $('customStartBtn').onclick=()=>{ const plan=getPlanFromUI(); const list=poolFromPlan(plan); if(!list.length){ alert('這個條件沒有題目，請換一個科目、年份或模式。'); return; } startQuiz(list, planTitle(plan)); };
  $('savePlanBtn').onclick=()=>{ state.plan=getPlanFromUI(); saveState(); alert('已儲存常用方案'); renderHome(); };
  if($('loadPlanBtn')) $('loadPlanBtn').onclick=()=>applyPlanToUI(state.plan);
  updatePracticePreview();
  $('dailyBtn').onclick=()=>startQuiz(shuffle(priorityList()).slice(0,20),'今日20題');
  $('allBtn').onclick=()=>startQuiz(questions,'全部題庫');
  $('wrongBtn').onclick=()=>renderList('錯題',questions.filter(isWrong));
  $('flagBtn').onclick=()=>renderList('旗標',questions.filter(isFlag));
  $('searchBtn').onclick=()=>renderSearch();
  $('weakBtn').onclick=()=>startQuiz(questions.filter(q=>recordOf(q).wrong>=2),'錯兩次以上');
  document.querySelectorAll('.year').forEach(b=>b.onclick=()=>startQuiz(questions.filter(q=>String(q.examTitle||q.year)===String(b.dataset.year)), `${b.dataset.year} 模擬考`));
  document.querySelectorAll('.subject').forEach(b=>b.onclick=()=>startQuiz(questions.filter(q=>normalizeSubject(q.subject)===b.dataset.subject), b.dataset.subject));
}
function priorityList(){
  const wrong = questions.filter(isWrong);
  const weak = questions.filter(q=>recordOf(q).wrong>=2);
  const unseen = questions.filter(q=>!state.stats[qid(q)]);
  return shuffle([...weak, ...wrong, ...unseen, ...questions]);
}
function renderQuiz(){
  const q=currentQ();
  if(!q){ screen().innerHTML=`<section class="card center"><h2>沒有題目</h2><button class="btn" onclick="setRoute('home')">回首頁</button></section>`; return; }
  const r=recordOf(q); const progress=(view.index+1)/view.list.length*100;
  screen().innerHTML=`
  <section class="card">
    <div class="question-head">
      <div><div class="meta">${view.title||'刷題'} ・ ${view.index+1}/${view.list.length}</div><div><span class="qno">${q.examTitle||q.year} 第 ${q.number} 題</span> <span class="tag">${normalizeSubject(q.subject)}</span></div></div>
      <button class="flag ${isFlag(q)?'on':''}" id="flagBtnQ">🚩</button>
    </div>
    <div class="progress"><i style="width:${progress}%"></i></div>
    <div class="question">${escapeHtml(q.question)}</div>
    <div class="options">${Object.entries(q.options||{}).map(([k,v])=>optionHtml(q,k,v)).join('')}</div>
    <div class="toolbar">
      <button class="btn" id="submitBtn" ${view.submitted?'disabled':''}>送出答案</button>
      <button class="btn secondary" id="answerBtn">${view.showAnswer?'隱藏答案':'看答案'}</button>
      <button class="btn secondary" id="gptBtn">問 GPT 詳解</button>
    </div>
    ${view.submitted?resultHtml(q):''}
    ${view.showAnswer?`<div class="answer-box"><b>答案：${q.answer}</b><p class="muted">解析：可使用「問 GPT 詳解」按鈕複製題目並開啟 ChatGPT。</p></div>`:''}
  </section>
  <section class="card">
    <h3>我的筆記</h3>
    <textarea id="noteArea" placeholder="例如：容易混淆的規定、數字、章節…">${escapeHtml(state.notes[qid(q)]||'')}</textarea>
    <p class="muted small">作答 ${r.attempts} 次；錯 ${r.wrong} 次；最後作答：${r.last||'尚未作答'}</p>
  </section>
  <div class="toolbar">
    <button class="btn secondary" id="prevBtn">上一題</button>
    <button class="btn" id="nextBtn">下一題</button>
  </div>`;
  document.querySelectorAll('.option').forEach(btn=>btn.onclick=()=>{ if(view.submitted)return; view.selected=btn.dataset.key; renderQuiz(); });
  $('submitBtn').onclick=submitAnswer;
  $('answerBtn').onclick=()=>{ view.showAnswer=!view.showAnswer; renderQuiz(); };
  $('gptBtn').onclick=()=>askGPT(q);
  $('flagBtnQ').onclick=()=>{ state.flags[qid(q)] ? delete state.flags[qid(q)] : state.flags[qid(q)] = Date.now(); saveState(); renderQuiz(); };
  $('noteArea').oninput=e=>{ state.notes[qid(q)]=e.target.value; saveState(); };
  $('prevBtn').onclick=()=>{ if(view.index>0){ view.index--; resetQState(); renderQuiz(); } };
  $('nextBtn').onclick=()=>{ if(view.index<view.list.length-1){ view.index++; resetQState(); renderQuiz(); } else setRoute('home'); };
}
function optionHtml(q,k,v){
  let cls='option';
  if(view.selected===k) cls+=' selected';
  if(view.submitted && k===q.answer) cls+=' correct';
  if(view.submitted && view.selected===k && k!==q.answer) cls+=' wrong';
  return `<button class="${cls}" data-key="${k}"><span class="letter">${k}</span><span>${escapeHtml(v)}</span></button>`;
}
function submitAnswer(){
  const q=currentQ(); if(!view.selected){ alert('請先選一個答案'); return; }
  const id=qid(q); const ok=view.selected===q.answer;
  const r=recordOf(q); r.attempts++; r.last=todayKey(); r.lastAnswer=view.selected; ok?r.correct++:r.wrong++;
  state.stats[id]=r; if(!ok) state.wrong[id]=Date.now(); else if(r.wrong===0) delete state.wrong[id];
  state.sessions.push({id, date:new Date().toISOString(), ok, answer:view.selected});
  if(state.sessions.length>2000) state.sessions=state.sessions.slice(-2000);
  view.submitted=true; view.showAnswer=true; saveState(); renderQuiz();
}
function resultHtml(q){ const ok=view.selected===q.answer; return `<div class="answer-box"><b>${ok?'答對':'答錯'}</b><p>你的答案：${view.selected}；正確答案：${q.answer}</p></div>`; }
function renderList(title,list){
  view.route='list';
  screen().innerHTML=`<section class="card"><h2>${title}</h2><p class="muted">共 ${list.length} 題</p><button class="btn" id="startList">開始刷這些題目</button></section><section class="card">${list.slice(0,80).map(q=>`<div class="list-item"><div><b>${q.examTitle||q.year} 第${q.number}題</b><br><span class="muted small">${escapeHtml(q.question).slice(0,52)}…</span></div><button class="pill jump" data-id="${qid(q)}">刷</button></div>`).join('')||'<p class="muted">目前沒有資料。</p>'}</section>`;
  $('startList').onclick=()=>startQuiz(list,title);
  document.querySelectorAll('.jump').forEach(b=>b.onclick=()=>startQuiz([questions.find(q=>qid(q)===b.dataset.id)], title));
}
function renderSearch(){
  view.route='search';
  screen().innerHTML=`<section class="card"><h2>搜尋題目</h2><input class="search" id="kw" placeholder="輸入關鍵字，例如：成語、關雎、recognition、油槽" autofocus></section><section class="card" id="results"><p class="muted">請輸入關鍵字。</p></section>`;
  $('kw').oninput=e=>{
    const k=e.target.value.trim(); const res=$('results');
    if(!k){res.innerHTML='<p class="muted">請輸入關鍵字。</p>';return;}
    const list=questions.filter(q=>(q.question+JSON.stringify(q.options)+q.subject).includes(k)).slice(0,100);
    res.innerHTML=`<p class="muted">找到 ${list.length} 題</p>${list.map(q=>`<div class="list-item"><div><b>${q.examTitle||q.year} 第${q.number}題</b><br><span class="muted small">${escapeHtml(q.question).slice(0,70)}…</span></div><button class="pill jump" data-id="${qid(q)}">刷</button></div>`).join('')}`;
    document.querySelectorAll('.jump').forEach(b=>b.onclick=()=>startQuiz([questions.find(q=>qid(q)===b.dataset.id)], '搜尋結果'));
  };
}
function renderStats(){
  const o=overall();
  const subjects=[...new Set(questions.map(q=>normalizeSubject(q.subject)))];
  const rows=subjects.map(s=>{ const qs=questions.filter(q=>normalizeSubject(q.subject)===s); const recs=qs.map(recordOf); const att=recs.reduce((a,r)=>a+r.attempts,0); const cor=recs.reduce((a,r)=>a+r.correct,0); return {s, att, rate:pct(cor,att)}; });
  screen().innerHTML=`<section class="grid three"><div class="stat"><b>${o.attempts}</b><span>總作答</span></div><div class="stat"><b>${o.rate}%</b><span>總正確率</span></div><div class="stat"><b>${o.flags}</b><span>旗標</span></div></section><section class="card"><h2>科目統計</h2>${rows.map(r=>`<div class="list-item"><div><b>${r.s}</b><br><span class="muted small">作答 ${r.att} 次</span></div><b>${r.rate}%</b></div>`).join('')}</section>`;
}
function renderSettings(){
  screen().innerHTML=`<section class="card"><h2>設定與備份</h2><div class="grid"><button class="btn secondary" id="exportBtn">匯出學習紀錄</button><label class="btn secondary">匯入學習紀錄<input id="importFile" type="file" accept="application/json" hidden></label><button class="btn bad" id="clearBtn">清除所有學習紀錄</button></div><p class="muted small">匯出檔只包含你的旗標、錯題、筆記與統計，不包含題庫。</p></section><section class="card"><h2>版本</h2><p>V${APP_VERSION}</p></section>`;
  $('exportBtn').onclick=exportData;
  $('importFile').onchange=importData;
  $('clearBtn').onclick=()=>{ if(confirm('確定清除所有旗標、錯題、筆記與統計？')){ localStorage.removeItem(STORAGE_KEY); state=loadState(); renderSettings(); } };
}
function exportData(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='study-record-backup.json'; a.click(); URL.revokeObjectURL(a.href);
}
function importData(e){
  const file=e.target.files[0]; if(!file) return; const reader=new FileReader();
  reader.onload=()=>{ try{ state=JSON.parse(reader.result); saveState(); alert('匯入完成'); renderSettings(); }catch{ alert('檔案格式不正確'); } };
  reader.readAsText(file);
}

function buildGPTPrompt(q){
  const opts = Object.entries(q.options||{}).map(([k,v])=>`${k}. ${v}`).join('\n');
  return `請用考試詳解方式解釋這題。\n\n科目：${normalizeSubject(q.subject)}\n年份：${q.year}\n題號：${q.number}\n題型：${q.type||''}\n\n題目：\n${q.question}\n\n選項：\n${opts}\n\n正確答案：${q.answer}\n\n請回答：\n1. 為什麼正解對？\n2. 其他選項為什麼錯？\n3. 這題考點是什麼？\n4. 給我一句好記法。`;
}
async function askGPT(q){
  const prompt = buildGPTPrompt(q);
  try{
    await navigator.clipboard.writeText(prompt);
    alert('已複製題目詳解提示詞。接著會開啟 ChatGPT，請貼上送出。');
  }catch(e){
    promptFallback(prompt);
    return;
  }
  window.open('https://chat.openai.com/', '_blank');
}
function promptFallback(prompt){
  const w = window.open('', '_blank');
  if(w){
    w.document.write('<pre style="white-space:pre-wrap;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:16px">'+escapeHtml(prompt)+'</pre>');
  }else{
    alert(prompt);
  }
}

function escapeHtml(s=''){ return String(s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
init();

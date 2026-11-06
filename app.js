(() => {
 'use strict';
 const $=id=>document.getElementById(id),E=GuideEngine;
 const KEY='guide-study-v1';
 const TYPE={judge:'判断题',single:'单选题',multiple:'多选题'};
 const MODE={all:'顺序练习',random:'随机练习',wrong:'我的错题',starred:'收藏题目'};
 const banks=(window.GUIDE_BANKS||[window.GUIDE_BANK]).map(E.validateBank);
 let all=[],lookup=new Map(),queue=[],current='',selection=[],gridPage=0,toastTimer;
 let state={records:{},drafts:{},wrong:[],starred:[],current:'',mode:'all',exam:'all',type:'all',bank:'all',practice:null,rounds:{}};
 let storageProblem=false;
 try{const raw=JSON.parse(localStorage.getItem(KEY));if(raw&&raw.records&&typeof raw.records==='object'&&!Array.isArray(raw.records)&&Array.isArray(raw.wrong)&&Array.isArray(raw.starred))state={...state,...raw};}catch{storageProblem=true;}
 if(!MODE[state.mode])state.mode='all';if(!['all','科目三','科目四'].includes(state.exam))state.exam='all';if(!['all','judge','single','multiple'].includes(state.type))state.type='all';
 if(!state.drafts||typeof state.drafts!=='object'||Array.isArray(state.drafts))state.drafts={};
 if(!state.rounds||typeof state.rounds!=='object'||Array.isArray(state.rounds))state.rounds={};
 function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3200);}
 function save(){try{localStorage.setItem(KEY,JSON.stringify(state));$('save-indicator').textContent=storageProblem?'部分历史数据未能读取':'进度已保存到当前浏览器';}catch{$('save-indicator').textContent='保存失败，请勿清除或关闭页面';toast('浏览器存储空间不足，当前进度暂时无法保存。');}}
 function validRecord(q,r){return r&&Array.isArray(r.selected)&&r.selected.length&&r.selected.every(k=>q.options.some(o=>o.key===k))&&typeof r.correct==='boolean'?r:null;}
 function getRecord(q){return validRecord(q,state.practice?.records?.[q.id]);}
 function readDraft(id){const q=lookup.get(id),draft=state.practice?.drafts?.[id];return q&&q.type==='multiple'&&!getRecord(q)&&Array.isArray(draft)?[...new Set(draft.filter(k=>q.options.some(o=>o.key===k)))]:[];}
 function practiceKey(){return JSON.stringify([state.mode,state.bank,state.exam,state.type]);}
 function roundInfo(){const key=practiceKey(),r=state.rounds[key];if(!r||!Number.isSafeInteger(r.started)||r.started<0||!Number.isSafeInteger(r.completed)||r.completed<0||r.completed>r.started)state.rounds[key]={started:0,completed:0};return state.rounds[key];}
 function matches(q){return(state.exam==='all'||q.exam===state.exam)&&(state.type==='all'||q.type===state.type)&&(state.bank==='all'||q.bankId===state.bank);}
 function rebuild(){all=E.mergeBanks(banks);lookup=new Map(all.map(q=>[q.id,q]));state.wrong=state.wrong.filter(id=>lookup.has(id));state.starred=state.starred.filter(id=>lookup.has(id));if(state.bank!=='all'&&!banks.some(b=>b.id===state.bank))state.bank='all';}
 function buildQueue(keepCurrent=false){
  const key=practiceKey(),previous=state.practice,round=roundInfo();
  const resume=keepCurrent&&previous?.key===key&&Array.isArray(previous.queue)&&previous.records&&typeof previous.records==='object'&&previous.drafts&&typeof previous.drafts==='object';
  if(resume){
   queue=[...new Set(previous.queue)].filter(id=>lookup.has(id)&&matches(lookup.get(id)));
   // Ordinary banks can grow after publication; keep saved order and append new IDs.
   if(state.mode==='all'||state.mode==='random')for(const q of all)if(matches(q)&&!queue.includes(q.id))queue.push(q.id);
  }else{
   queue=all.filter(q=>matches(q)&&(state.mode!=='wrong'||state.wrong.includes(q.id))&&(state.mode!=='starred'||state.starred.includes(q.id))).map(q=>q.id);
   if(state.mode==='random')for(let i=queue.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[queue[i],queue[j]]=[queue[j],queue[i]];}
   // Upgrade an existing sequential session without losing its location or answers.
   const migrate=keepCurrent&&!previous&&state.mode==='all';
   if(queue.length)round.started++;
   state.practice={key,queue:queue.slice(),records:migrate?{...state.records}:{},drafts:migrate?{...state.drafts}:{},current:migrate?state.current:'',round:round.started,completed:false};
  }
  state.practice.queue=queue.slice();
  current=keepCurrent&&queue.includes(state.practice.current)?state.practice.current:queue[0]||'';state.current=current;state.practice.current=current;selection=readDraft(current);gridPage=Math.floor(Math.max(0,queue.indexOf(current))/40);completeRound();render();save();
 }
 function completeRound(){if(queue.length&&!state.practice.completed&&queue.every(id=>getRecord(lookup.get(id)))){state.practice.completed=true;roundInfo().completed++;return true;}return false;}
 function stats(){const records=all.map(q=>validRecord(q,state.records[q.id])).filter(Boolean),right=records.filter(r=>r.correct).length;$('stat-total').textContent=all.length;$('stat-done').textContent=records.length;$('stat-rate').textContent=records.length?Math.round(right/records.length*100)+'%':'—';$('stat-wrong').textContent=state.wrong.length;$('wrong-badge').textContent=state.wrong.length;$('star-badge').textContent=state.starred.length;const round=roundInfo();$('round-status').textContent=queue.length?`正在刷第 ${state.practice.round} 遍 · 已完整刷完 ${round.completed} 遍`:`已完整刷完 ${round.completed} 遍`;$('round-detail').textContent=queue.length?`${MODE[state.mode]} · 当前筛选 ${queue.length} 题${state.practice.completed?' · 本轮已完成':''}。完整作答才计为刷完一遍。`:'调整筛选或开始其他练习。';$('restart-set').disabled=!queue.length;}
 function updateControls(){document.querySelectorAll('[data-mode]').forEach(button=>{button.classList.toggle('active',button.dataset.mode===state.mode);button.setAttribute('aria-current',button.dataset.mode===state.mode?'page':'false');});document.querySelectorAll('[data-exam]').forEach(button=>{const active=button.dataset.exam===state.exam;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});$('page-name').textContent=MODE[state.mode];$('type-filter').value=state.type;$('bank-filter').value=state.bank;}
 function create(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
 function fillResult(container,q,record){
  container.replaceChildren();
  const heading=create('div','result-heading'+(record.correct?'':' wrong'));
  heading.append(create('span','result-icon',record.correct?'✓':'×'));
  const title=create('div'),resultTitle=create('h2','',record.correct?'回答正确，继续保持':'这道题，再记牢一点');resultTitle.tabIndex=-1;title.append(resultTitle,create('p','',record.correct?'又掌握了一个知识点。':'读一遍解析，下次就会更有把握。'));heading.append(title);container.append(heading);
  const answers=create('div','result-answer');
  const show=keys=>q.type==='judge'?keys.map(k=>q.options.find(o=>o.key===k)?.text||k).join('、'):keys.slice().sort().join('、');
  for(const [label,value] of [['你的答案',show(record.selected)],['正确答案',show(q.answer)]]){const line=create('span','',label);line.append(create('strong','',value));answers.append(line);}container.append(answers);
  const section=create('section','result-section');section.append(create('h3','','原文解析'),create('p','',q.explanation));container.append(section);
  if(q.answerNote)container.append(create('p','answer-note',q.answerNote));
  if(q.notes){const details=create('details','original-notes');details.append(create('summary','','展开原文补充笔记'),create('p','',q.notes));container.append(details);}
  if(q.topic)container.append(create('p','result-topic','考查点 · '+q.topic));
 }
 function renderGrid(){
  const done=queue.filter(id=>getRecord(lookup.get(id))).length;
  $('nav-count').textContent=queue.length+' 题';$('session-count').textContent=done+' / '+queue.length;$('session-fill').style.width=(queue.length?done/queue.length*100:0)+'%';
  const pages=Math.max(1,Math.ceil(queue.length/40));gridPage=Math.min(Math.max(0,gridPage),pages-1);$('grid-page').textContent=(gridPage+1)+' / '+pages;$('grid-prev').disabled=gridPage===0;$('grid-next').disabled=gridPage>=pages-1;
  $('question-grid').replaceChildren();queue.slice(gridPage*40,gridPage*40+40).forEach((id,i)=>{const q=lookup.get(id),r=getRecord(q),button=create('button',(r?(r.correct?'right':'wrong'):'')+(id===current?' current':''),gridPage*40+i+1);button.type='button';button.setAttribute('aria-label',`第 ${gridPage*40+i+1} 题，原题 ${q.number}，${r?(r.correct?'已答对':'已答错'):'未作答'}`);if(id===current)button.setAttribute('aria-current','true');button.addEventListener('click',()=>go(id));$('question-grid').append(button);});
 }
 function render(){
  stats();updateControls();renderGrid();const q=lookup.get(current);$('question-area').hidden=!q;$('empty').hidden=!!q;$('star-button').hidden=!q;
  if(!q){$('question-type').textContent='练习清单';$('question-exam').hidden=true;$('source-number').textContent='';$('empty-title').textContent=state.mode==='wrong'?'暂时没有待巩固的错题':state.mode==='starred'?'还没有收藏的题目':'没有匹配的题目';$('empty-text').textContent=state.mode==='wrong'?'答错的题目会收录到这里，答对后自动移出。':state.mode==='starred'?'练习时点击题目右上角的星标，就能在这里找到它。':'试试调整科目、题型或题库筛选。';return;}
  const r=getRecord(q),position=queue.indexOf(current);$('question-type').textContent=TYPE[q.type];$('question-exam').hidden=false;$('question-exam').textContent=q.exam;$('source-number').textContent='原题 '+q.number;$('question-index').textContent='QUESTION '+String(position+1).padStart(2,'0')+' / '+queue.length;$('stem').textContent=q.stem;$('question-tip').textContent=r?'已提交 · 可查看本题答案和解析':q.type==='multiple'?'多选题 · 可选择多个选项，选好后点击「提交答案」。':'请选择一个答案，选择后立即显示正确答案与解析。';
  $('star-button').textContent=state.starred.includes(q.id)?'★':'☆';$('star-button').setAttribute('aria-label',state.starred.includes(q.id)?'取消收藏本题':'收藏本题');$('star-button').setAttribute('aria-pressed',String(state.starred.includes(q.id)));
  $('options').replaceChildren();for(const option of q.options){const button=create('button','option');button.type='button';button.setAttribute('aria-label',option.key+'，'+option.text);button.setAttribute('aria-pressed',String((r?r.selected:selection).includes(option.key)));button.append(create('span','option-letter',option.key),create('span','option-text',option.text));if((r?r.selected:selection).includes(option.key))button.classList.add('selected');if(r){button.disabled=true;if(q.answer.includes(option.key))button.classList.add('correct');else if(r.selected.includes(option.key))button.classList.add('incorrect');}button.addEventListener('click',()=>choose(option.key));$('options').append(button);}
  $('submit-multiple').hidden=q.type!=='multiple'||!!r;$('submit-multiple').disabled=!selection.length;$('retry-button').hidden=!r;$('inline-result').hidden=!r;if(r)fillResult($('inline-result'),q,r);else $('inline-result').replaceChildren();$('prev-button').disabled=$('quick-prev').disabled=position<=0;$('next-button').disabled=$('quick-next').disabled=position>=queue.length-1;$('source-line').textContent='题目来源 · '+q.source;
 }
 function choose(key){const q=lookup.get(current);if(!q||getRecord(q))return;if(q.type==='multiple'){selection=selection.includes(key)?selection.filter(k=>k!==key):[...selection,key];state.practice.drafts[q.id]=selection.slice();render();save();$('options').children[q.options.findIndex(o=>o.key===key)]?.focus({preventScroll:true});}else{selection=[key];submit();}}
 function submit(){const q=lookup.get(current);if(!q||!selection.length||getRecord(q))return;const record={selected:selection.slice(),correct:E.exactMatch(selection,q.answer),at:Date.now()};state.records[q.id]=record;state.practice.records[q.id]=record;delete state.practice.drafts[q.id];delete state.drafts[q.id];if(record.correct)state.wrong=state.wrong.filter(id=>id!==q.id);else if(!state.wrong.includes(q.id))state.wrong.push(q.id);const completed=completeRound();save();render();if(completed)toast(`本套题目已完整刷完 ${roundInfo().completed} 遍，可点击「重新刷本套题目」继续。`);const heading=$('inline-result').querySelector('h2');heading?.focus({preventScroll:true});heading?.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
 function go(id){if(!queue.includes(id))return;current=id;state.current=id;state.practice.current=id;selection=readDraft(id);gridPage=Math.floor(queue.indexOf(id)/40);render();save();}
 function restart(){if(!queue.length)return;const round=roundInfo();round.started++;state.practice={key:practiceKey(),queue:queue.slice(),records:{},drafts:{},current:queue[0],round:round.started,completed:false};go(queue[0]);toast('已开始新一遍，答案将在重新作答后显示。');}
 function next(){const index=queue.indexOf(current);if(index<queue.length-1)go(queue[index+1]);else toast('本组已到最后一题，可以查看答题卡或切换题型继续练习。');}
 function refreshBankOptions(){$('bank-filter').replaceChildren(new Option('全部题库','all'));for(const bank of banks)$('bank-filter').append(new Option(bank.title,bank.id));}
 function renderBanks(){$('bank-list').replaceChildren();for(const bank of banks){const row=create('div','bank-row'),text=create('div');text.append(create('strong','',bank.title),create('p','',`${bank.questions.length} 道题 · 判断 ${bank.questions.filter(q=>q.type==='judge').length} / 单选 ${bank.questions.filter(q=>q.type==='single').length} / 多选 ${bank.questions.filter(q=>q.type==='multiple').length}`));row.append(text,create('span','','共享题库'));$('bank-list').append(row);}}
 function manage(){renderBanks();$('manage-dialog').showModal();}
 document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{if(state.mode===button.dataset.mode)return;state.mode=button.dataset.mode;buildQueue();}));
 document.querySelectorAll('[data-exam]').forEach(button=>button.addEventListener('click',()=>{if(state.exam===button.dataset.exam)return;state.exam=button.dataset.exam;buildQueue();}));
 $('type-filter').addEventListener('change',()=>{state.type=$('type-filter').value;buildQueue();});$('bank-filter').addEventListener('change',()=>{state.bank=$('bank-filter').value;buildQueue();});
 $('prev-button').addEventListener('click',()=>{const i=queue.indexOf(current);if(i>0)go(queue[i-1]);});$('next-button').addEventListener('click',next);$('submit-multiple').addEventListener('click',submit);
 $('retry-button').addEventListener('click',()=>{delete state.practice.records[current];delete state.practice.drafts[current];selection=[];render();save();});
 $('restart-set').addEventListener('click',restart);
 $('quick-prev').addEventListener('click',()=>{const i=queue.indexOf(current);if(i>0)go(queue[i-1]);});$('quick-next').addEventListener('click',next);
 $('star-button').addEventListener('click',()=>{if(!current)return;state.starred=state.starred.includes(current)?state.starred.filter(id=>id!==current):[...state.starred,current];render();save();});
 $('grid-prev').addEventListener('click',()=>{gridPage--;renderGrid();});$('grid-next').addEventListener('click',()=>{gridPage++;renderGrid();});
 $('back-all').addEventListener('click',()=>{state.mode='all';state.exam='all';state.type='all';state.bank='all';buildQueue();});
 $('manage-button').addEventListener('click',manage);$('bank-info-top').addEventListener('click',manage);$('close-manage').addEventListener('click',()=>$('manage-dialog').close());
 rebuild();refreshBankOptions();buildQueue(true);if(storageProblem)toast('部分本机历史数据未能读取，现有文件未被删除。');
})();

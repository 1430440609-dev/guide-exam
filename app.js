(() => {
 'use strict';
 const $=id=>document.getElementById(id),E=GuideEngine;
 const KEY='guide-study-v1';
 const TYPE={judge:'判断题',single:'单选题',multiple:'多选题'};
 const MODE={all:'顺序练习',random:'随机练习',wrong:'我的错题',starred:'收藏题目',uncertain:'待巩固',review:'到期复习',exam:'模拟考试'};
 const bankRank=b=>[Number(b.title.match(/\d+/)?.[0]||999),b.questions.some(q=>q.exam==='科目一'||q.exam==='科目二')?0:1];
 const banks=(window.GUIDE_BANKS||[window.GUIDE_BANK]).map(E.validateBank).sort((a,b)=>{const av=bankRank(a),bv=bankRank(b);return av[0]-bv[0]||av[1]-bv[1];});
 let all=[],lookup=new Map(),queue=[],current='',selection=[],gridPage=0,toastTimer;
 let state={records:{},drafts:{},wrong:[],starred:[],current:'',mode:'all',exam:'all',type:'all',bank:'all',practice:null,practices:{},modeFilters:{},rounds:{},wrongEvents:{},wrongSerial:0,uncertain:[],reviews:{},lastExams:{}};
 let storageProblem=false;
 try{const raw=JSON.parse(localStorage.getItem(KEY));if(raw&&raw.records&&typeof raw.records==='object'&&!Array.isArray(raw.records)&&Array.isArray(raw.wrong)&&Array.isArray(raw.starred))state={...state,...raw};}catch{storageProblem=true;}
 if(!MODE[state.mode])state.mode='all';if(!['all','科目一','科目二','科目三','科目四'].includes(state.exam))state.exam='all';if(!['all','judge','single','multiple'].includes(state.type))state.type='all';
 if(!state.drafts||typeof state.drafts!=='object'||Array.isArray(state.drafts))state.drafts={};
 if(!state.rounds||typeof state.rounds!=='object'||Array.isArray(state.rounds))state.rounds={};
 if(!state.practices||typeof state.practices!=='object'||Array.isArray(state.practices))state.practices={};
 if(!state.modeFilters||typeof state.modeFilters!=='object'||Array.isArray(state.modeFilters))state.modeFilters={};
 if(!state.wrongEvents||typeof state.wrongEvents!=='object'||Array.isArray(state.wrongEvents))state.wrongEvents={};
 if(!Number.isSafeInteger(state.wrongSerial)||state.wrongSerial<0)state.wrongSerial=0;
 for(const k of ['reviews','lastExams'])if(!state[k]||typeof state[k]!=='object'||Array.isArray(state[k]))state[k]={};if(!Array.isArray(state.uncertain))state.uncertain=[];
 function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3200);}
 function save(){if(state.practice?.key)state.practices[state.practice.key]=state.practice;state.modeFilters[state.mode]={exam:state.exam,type:state.type,bank:state.bank};try{localStorage.setItem(KEY,JSON.stringify(state));$('save-indicator').textContent=storageProblem?'部分历史数据未能读取':'进度已保存到当前浏览器';}catch{$('save-indicator').textContent='保存失败，请勿清除或关闭页面';toast('浏览器存储空间不足，当前进度暂时无法保存。');}}
 function validRecord(q,r){return r&&Array.isArray(r.selected)&&r.selected.length&&r.selected.every(k=>q.options.some(o=>o.key===k))&&typeof r.correct==='boolean'?{...r,correct:E.gradeAttempt(q,r.selected).correct}:null;}
 function getRecord(q){if(state.mode==='exam')return state.practice?.submitted?E.gradeAttempt(q,state.practice.examAnswers?.[q.id]):null;return validRecord(q,state.practice?.records?.[q.id]);}
 function readDraft(id){const q=lookup.get(id),draft=state.mode==='exam'?state.practice?.examAnswers?.[id]:state.practice?.drafts?.[id];if(state.mode==='exam')return Array.isArray(draft)?draft.slice():[];return q&&q.type==='multiple'&&!getRecord(q)&&Array.isArray(draft)?[...new Set(draft.filter(k=>q.options.some(o=>o.key===k)))]:[];}
 function practiceKey(){return JSON.stringify([state.mode,state.bank,state.exam,state.type]);}
 function roundInfo(){const key=practiceKey(),r=state.rounds[key];if(!r||!Number.isSafeInteger(r.started)||r.started<0||!Number.isSafeInteger(r.completed)||r.completed<0||r.completed>r.started)state.rounds[key]={started:0,completed:0};return state.rounds[key];}
 function matches(q){return q.bankId===state.bank;}

 function rebuild(){
  all=E.mergeBanks(banks);lookup=new Map(all.map(q=>[q.id,q]));state.wrong=state.wrong.filter(id=>lookup.has(id));state.starred=state.starred.filter(id=>lookup.has(id));
  if(!banks.some(b=>b.id===state.bank))state.bank=lookup.get(state.practice?.current||state.current)?.bankId||banks[0].id;
  state.exam='all';state.type='all';
 }
 function priorPractice(){
  const candidates=[state.practice,...Object.values(state.practices)].filter(Boolean);
  return candidates.find(p=>{let key;try{key=JSON.parse(p.key);}catch{return false;}return key[0]===state.mode&&(key[1]===state.bank||key[1]==='all')&&Array.isArray(p.queue)&&p.queue.some(id=>lookup.get(id)?.bankId===state.bank)&&p.records&&p.drafts;});
 }
 function randomOrder(ids,shuffle=false){return ['judge','single','multiple'].flatMap(type=>{const part=ids.filter(id=>lookup.get(id)?.type===type);return shuffle?E.shuffled(part):part;});}
 function settleWrongRound(practice){
  if(practice.wrongSettled)return;
  const cleared=new Set(practice.queue.filter(id=>lookup.has(id)&&validRecord(lookup.get(id),practice.records[id])?.correct&&(practice.records[id].wrongVersion||0)===(state.wrongEvents[id]||0)&&state.records[id]?.correct!==false));
  const before=state.wrong.length;state.wrong=state.wrong.filter(id=>!cleared.has(id));
  for(const id of cleared)scheduleReview(id,true);practice.wrongRemoved=before-state.wrong.length;practice.wrongSettled=true;
 }
 function wrongFinished(){return state.mode==='wrong'&&state.practice?.completed&&state.practice.wrongSettled;}
 function remainingWrongIds(){return all.filter(q=>matches(q)&&state.wrong.includes(q.id)).sort((a,b)=>a.number-b.number).map(q=>q.id);}
 function buildQueue(restoreLegacy=false){
  if(state.practice?.key)state.practices[state.practice.key]=state.practice;
  const key=practiceKey(),saved=state.practices[key],previous=saved||priorPractice(),round=roundInfo();
  if(state.mode==='wrong'&&previous?.completed&&Array.isArray(previous.queue)&&previous.records)settleWrongRound(previous);
  const usable=!(state.mode==='wrong'&&previous?.completed)&&!(state.mode==='uncertain'&&previous?.completed)&&!(state.mode==='review'&&(previous?.completed||previous?.reviewDay!==E.localDay()))&&previous&&Array.isArray(previous.queue)&&previous.records&&typeof previous.records==='object'&&previous.drafts&&typeof previous.drafts==='object';
  const eligible=all.filter(q=>matches(q)&&(state.mode!=='wrong'||state.wrong.includes(q.id))&&(state.mode!=='starred'||state.starred.includes(q.id))&&(state.mode!=='uncertain'||state.uncertain.includes(q.id))&&(state.mode!=='review'||isDue(q.id))).sort((a,b)=>a.number-b.number).map(q=>q.id);
  if(usable){
   const kept=[...new Set(previous.queue)].filter(id=>lookup.has(id)&&matches(lookup.get(id))&&(state.mode!=='review'||isDue(id))&&(state.mode!=='uncertain'||state.uncertain.includes(id)));
   queue=state.mode==='random'?kept:kept.sort((a,b)=>lookup.get(a).number-lookup.get(b).number);
   const added=eligible.filter(id=>!queue.includes(id));queue.push(...(state.mode==='random'?randomOrder(added,true):added));
   if(state.mode!=='random')queue.sort((a,b)=>lookup.get(a).number-lookup.get(b).number);
   if(saved){state.practice=previous;}
   else{
    const retain=items=>Object.fromEntries(Object.entries(items).filter(([id])=>queue.includes(id)));
    const oldKey=JSON.parse(previous.key),whole=oldKey[2]==='all'&&oldKey[3]==='all';
    const oldRounds=state.rounds[previous.key];
    round.started=Math.max(round.started,whole?previous.round||1:1);
    const completed=queue.length>0&&queue.every(id=>validRecord(lookup.get(id),previous.records[id]));
    const completedBefore=oldRounds?.completed||0;
    round.completed=whole?Math.min(round.started,completedBefore+(completed&&!previous.completed?1:0)||(completed?1:0)):(completed?1:0);
    state.practice={key,queue:queue.slice(),records:retain(previous.records),drafts:retain(previous.drafts),current:previous.current,round:round.started,completed,optionOrders:previous.optionOrders?retain(previous.optionOrders):{}};
   }
   if(queue.length&&!state.practice.round){round.started++;state.practice.round=round.started;}
  }else{
   queue=state.mode==='random'?randomOrder(eligible,true):eligible;
   const migrate=restoreLegacy&&!state.practice&&state.mode==='all';
   if(queue.length)round.started++;
   state.practice={key,queue:queue.slice(),records:migrate?Object.fromEntries(Object.entries(state.records).filter(([id])=>queue.includes(id))):{},drafts:migrate?Object.fromEntries(Object.entries(state.drafts).filter(([id])=>queue.includes(id))):{},current:migrate?state.current:'',round:round.started,completed:false,optionOrders:{}};
  }
  state.practice.reviewDay=E.localDay();if(!state.practice.examAnswers)state.practice.examAnswers={};
  if(!state.practice.optionOrders||typeof state.practice.optionOrders!=='object'||Array.isArray(state.practice.optionOrders))state.practice.optionOrders={};
  if(state.mode==='random'){queue=randomOrder(queue);for(const id of Object.keys(state.practice.optionOrders))if(lookup.get(id)?.type==='judge')delete state.practice.optionOrders[id];}
  state.practice.queue=queue.slice();
  current=queue.includes(state.practice.current)?state.practice.current:queue[0]||'';state.current=current;state.practice.current=current;selection=readDraft(current);gridPage=Math.floor(Math.max(0,queue.indexOf(current))/40);completeRound();render();save();
 }
 function layout(q){
  if(state.mode!=='random'||q.type==='judge')return E.optionLayout(q);
  let order=state.practice.optionOrders[q.id];
  if(!Array.isArray(order)||order.length!==q.options.length||new Set(order).size!==q.options.length||order.some(k=>!q.options.some(o=>o.key===k)))state.practice.optionOrders[q.id]=order=E.shuffled(q.options.map(o=>o.key));
  return E.optionLayout(q,order);
 }
 function completeRound(){if(state.mode==='exam')return false;const finished=queue.length>0&&queue.every(id=>getRecord(lookup.get(id)));let completed=false;if(finished&&!state.practice.completed){state.practice.completed=true;roundInfo().completed++;completed=true;}if(finished&&state.mode==='wrong')settleWrongRound(state.practice);return completed;}
 function stats(){const records=all.map(q=>validRecord(q,state.records[q.id])).filter(Boolean),right=records.filter(r=>r.correct).length;$('stat-total').textContent=all.length;$('stat-done').textContent=records.length;$('stat-rate').textContent=records.length?Math.round(right/records.length*100)+'%':'—';$('stat-wrong').textContent=state.wrong.length;$('wrong-badge').textContent=state.wrong.filter(id=>lookup.get(id)?.bankId===state.bank).length;$('star-badge').textContent=state.starred.filter(id=>lookup.get(id)?.bankId===state.bank).length;const round=roundInfo();$('round-status').textContent=queue.length?`正在刷第 ${state.practice.round} 遍 · 已完整刷完 ${round.completed} 遍`:`已完整刷完 ${round.completed} 遍`;$('round-detail').textContent=queue.length?`${banks.find(b=>b.id===state.bank)?.title} · ${queue.length} 题${state.practice.completed&&queue.every(id=>getRecord(lookup.get(id)))?' · 本轮已完成':''}。完整作答才计为刷完一遍。`:'本套试卷暂无符合条件的题目。';$('restart-set').disabled=!queue.length||(wrongFinished()&&!remainingWrongIds().length);}
 function updateControls(){document.querySelectorAll('[data-mode]').forEach(button=>{button.classList.toggle('active',button.dataset.mode===state.mode);button.setAttribute('aria-current',button.dataset.mode===state.mode?'page':'false');});$('page-name').textContent=MODE[state.mode];$('bank-filter').value=state.bank;$('mode-picker').value=state.mode;$('paper-tip').textContent=state.mode==='exam'?'独立模拟考试：40 道判断 × 0.5 分 + 90 道单选 × 0.5 分 + 35 道多选 × 1 分 = 100 分。交卷前不显示答案。':state.mode==='uncertain'?'把答对但不确定的题标记为待巩固；可在这里重新练习。':state.mode==='review'?'只练当前试卷今日及以前到期的题。按 1、3、7 天逐步巩固，答错则次日再练。':state.mode==='random'?'分题型乱序：判断 1–40、单选 41–130、多选 131–165。判断题对／错选项不变，仅单选和多选打乱选项。':state.mode==='wrong'||state.mode==='starred'?(state.mode==='wrong'?'本轮错题全部作答后，统一移除答对的题；顺序和随机练习新答错的题会自动加入。':'仅练习当前试卷中的收藏；切换试卷会保留各自进度。'):'按本套文档原题号练习，每套 165 题，不按科目或题型拆分。';}
 function create(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
 function fillResult(container,q,record){
  container.replaceChildren();
  const heading=create('div','result-heading'+(record.correct?'':' wrong'));
  heading.append(create('span','result-icon',record.correct?'✓':'×'));
  const title=create('div'),resultTitle=create('h2','',record.correct?'回答正确，继续保持':'这道题，再记牢一点');resultTitle.tabIndex=-1;title.append(resultTitle,create('p','',record.correct?'又掌握了一个知识点。':'读一遍解析，下次就会更有把握。'));heading.append(title);container.append(heading);
  const answers=create('div','result-answer');
  const shown=layout(q);
  const show=keys=>shown.filter(o=>keys.includes(o.key)).map(o=>o.label+(q.type==='judge'?'（'+o.text+'）':'')).join('、');
  for(const [label,value] of [['你的答案',show(record.selected)||'未作答'],['正确答案',show(q.answer)]]){const line=create('span','',label);line.append(create('strong','',value));answers.append(line);}container.append(answers);
  if(state.mode==='random'&&q.type!=='judge'){const mapping=create('div','random-answer-map');mapping.append(create('p','',`原文参考答案：${q.type==='judge'?q.answer.map(k=>q.options.find(o=>o.key===k).text).join('、'):q.answer.slice().sort().join('、')}。原文解析中的字母按下方对照阅读。`),create('p','',shown.map(o=>`本页 ${o.label} = 原文 ${o.key}`).join('；')));container.append(mapping);}
  if(state.mode==='exam')container.append(create('p','exam-points',`本题得分 ${record.points} / ${record.maxPoints} 分`));
  const section=create('section','result-section');section.append(create('h3','','原文解析'),create('p','',q.explanation));container.append(section);
  if(q.answerNote)container.append(create('p','answer-note',q.answerNote));
  if(q.notes){const details=create('details','original-notes');details.append(create('summary','','展开原文补充笔记'),create('p','',q.notes));container.append(details);}
  if(q.topic)container.append(create('p','result-topic','考查点 · '+q.topic));
 }
 function renderGrid(){
  const done=queue.filter(id=>state.mode==='exam'?state.practice.examAnswers?.[id]?.length:getRecord(lookup.get(id))).length,nav=wrongFinished()?remainingWrongIds():queue;
  $('nav-count').textContent=wrongFinished()?'待重练 '+nav.length+' 题':nav.length+' 题';$('session-count').textContent=done+' / '+queue.length;$('session-fill').style.width=(queue.length?done/queue.length*100:0)+'%';
  const pages=Math.max(1,Math.ceil(nav.length/40));gridPage=Math.min(Math.max(0,gridPage),pages-1);$('grid-page').textContent=(gridPage+1)+' / '+pages;$('grid-prev').disabled=gridPage===0;$('grid-next').disabled=gridPage>=pages-1;
  $('question-grid').replaceChildren();nav.slice(gridPage*40,gridPage*40+40).forEach((id,i)=>{const q=lookup.get(id),r=getRecord(q),answered=state.mode==='exam'&&!state.practice.submitted&&state.practice.examAnswers?.[id]?.length,button=create('button',(answered?'answered':'')+(r?(r.correct?'right':'wrong'):'')+(id===current?' current':''),gridPage*40+i+1);button.type='button';button.setAttribute('aria-label',`第 ${gridPage*40+i+1} 题，原题 ${q.number}，${answered?'已作答':r?(r.selected.length?(r.correct?'已答对':'已答错'):'未作答，0 分'):'未作答'}`);if(id===current)button.setAttribute('aria-current','true');button.addEventListener('click',()=>{if(wrongFinished())buildQueue();go(id);});$('question-grid').append(button);});
 }
 function render(){
  stats();updateControls();renderGrid();renderLearning();renderExam();renderMobile();$('wrong-summary').hidden=!wrongFinished();$('continue-wrong').hidden=!wrongFinished()||!remainingWrongIds().length;if(wrongFinished())$('wrong-summary').textContent=`本轮已完成，已移除 ${state.practice.wrongRemoved||0} 道答对题，剩余 ${remainingWrongIds().length} 道错题。`;const q=lookup.get(current);$('question-area').hidden=!q;$('empty').hidden=!!q;$('star-button').hidden=!q;
  if(!q){$('question-type').textContent='练习清单';$('question-exam').hidden=true;$('source-number').textContent='';$('empty-title').textContent=state.mode==='wrong'?'本套暂时没有待巩固的错题':state.mode==='starred'?'本套还没有收藏的题目':'没有匹配的题目';$('empty-text').textContent=state.mode==='wrong'?'顺序和随机练习答错的题会收录到这里；本轮错题全部作答后，答对的题会统一移出。':state.mode==='starred'?'练习时点击题目右上角的星标，就能在这里找到它。':'试试选择其他试卷或练习方式。';return;}
  const r=getRecord(q),position=queue.indexOf(current);$('question-type').textContent=TYPE[q.type];$('question-exam').hidden=false;$('question-exam').textContent=q.exam;$('source-number').textContent='原题 '+q.number;$('question-index').textContent=wrongFinished()?'本轮最后一题 · 结果回顾':'QUESTION '+String(position+1).padStart(2,'0')+' / '+queue.length;$('stem').textContent=q.stem;$('question-tip').textContent=state.mode==='exam'&&!state.practice.submitted?'模拟考试 · 选择自动保存，可修改；交卷后统一显示答案与解析。':r?'已提交 · 可查看本题答案和解析':q.type==='multiple'?'多选题 · 可选择多个选项，选好后点击「提交答案」。':'请选择一个答案，选择后立即显示正确答案与解析。';
  $('star-button').textContent=state.starred.includes(q.id)?'★':'☆';$('star-button').setAttribute('aria-label',state.starred.includes(q.id)?'取消收藏本题':'收藏本题');$('star-button').setAttribute('aria-pressed',String(state.starred.includes(q.id)));
  $('options').replaceChildren();for(const option of layout(q)){const button=create('button','option');button.type='button';button.setAttribute('aria-label',option.label+'，'+option.text);button.setAttribute('aria-pressed',String((r?r.selected:selection).includes(option.key)));button.append(create('span','option-letter',option.label),create('span','option-text',option.text));if((r?r.selected:selection).includes(option.key))button.classList.add('selected');if(r){button.disabled=true;if(q.answer.includes(option.key))button.classList.add('correct');else if(r.selected.includes(option.key))button.classList.add('incorrect');}button.addEventListener('click',()=>choose(option.key));$('options').append(button);}
  $('submit-multiple').hidden=state.mode==='exam'||q.type!=='multiple'||!!r;$('submit-multiple').disabled=!selection.length;$('retry-button').hidden=state.mode==='exam'||!r||wrongFinished();$('inline-result').hidden=!r;if(r)fillResult($('inline-result'),q,r);else $('inline-result').replaceChildren();$('source-line').textContent='题目来源 · '+q.source;
 }
 function choose(key){const q=lookup.get(current);if(!q||getRecord(q))return;if(state.mode==='exam'){selection=q.type==='multiple'?(selection.includes(key)?selection.filter(k=>k!==key):[...selection,key]):[key];state.practice.examAnswers[q.id]=selection.slice();render();save();return;}if(q.type==='multiple'){selection=selection.includes(key)?selection.filter(k=>k!==key):[...selection,key];state.practice.drafts[q.id]=selection.slice();render();save();$('options').children[layout(q).findIndex(o=>o.key===key)]?.focus({preventScroll:true});}else{selection=[key];submit();}}
 function submit(){if(state.mode==='exam')return;const q=lookup.get(current);if(!q||!selection.length||getRecord(q))return;const record={selected:selection.slice(),correct:E.exactMatch(selection,q.answer),at:Date.now()};if(!record.correct)state.wrongEvents[q.id]=++state.wrongSerial;record.wrongVersion=state.wrongEvents[q.id]||0;state.records[q.id]=record;state.practice.records[q.id]=record;delete state.practice.drafts[q.id];delete state.drafts[q.id];if(!record.correct&&!state.wrong.includes(q.id))state.wrong.push(q.id);if(!record.correct)scheduleReview(q.id,false);else if(state.mode!=='wrong'&&(isDue(q.id)||state.mode==='review'))scheduleReview(q.id,true);const completed=completeRound();save();render();if(completed)toast(wrongFinished()?`本轮错题已完成，已移除 ${state.practice.wrongRemoved||0} 道答对题，剩余 ${remainingWrongIds().length} 道。`:`本套题目已完整刷完 ${roundInfo().completed} 遍，可点击「重新刷本套题目」继续。`);const heading=$('inline-result').querySelector('h2');heading?.focus({preventScroll:true});heading?.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
 function go(id){if(!queue.includes(id)||wrongFinished())return;current=id;state.current=id;state.practice.current=id;selection=readDraft(id);gridPage=Math.floor(queue.indexOf(id)/40);render();save();$('question-index').scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
 function restart(){if(state.mode==='exam'&&!state.practice.submitted&&Object.values(state.practice.examAnswers||{}).some(a=>a.length)){toast('本场考试尚未交卷，请先交卷；交卷后可重新考试。');return;}if(state.mode==='review'&&state.practice.completed){buildQueue();return;}if(wrongFinished()){buildQueue();return;}if(!queue.length)return;if(state.mode==='random')queue=randomOrder(queue,true);const round=roundInfo();round.started++;state.practice={key:practiceKey(),queue:queue.slice(),records:{},drafts:{},current:queue[0],round:round.started,completed:false,optionOrders:{},examAnswers:{},reviewDay:E.localDay()};go(queue[0]);toast('已开始新一遍，答案将在重新作答后显示。');}
 function next(){if(wrongFinished())return;const index=queue.indexOf(current);if(index<queue.length-1)go(queue[index+1]);else if(state.mode==='exam'&&!state.practice.submitted)confirmExam();else toast('已到最后一题，可查看答题卡或重新刷本套题目。');}
 function refreshBankOptions(){$('bank-filter').replaceChildren();for(const bank of banks)$('bank-filter').append(new Option(bank.title,bank.id));}
 function renderBanks(){$('bank-list').replaceChildren();for(const bank of banks){const row=create('div','bank-row'),text=create('div');text.append(create('strong','',bank.title),create('p','',`${bank.questions.length} 道题 · 判断 ${bank.questions.filter(q=>q.type==='judge').length} / 单选 ${bank.questions.filter(q=>q.type==='single').length} / 多选 ${bank.questions.filter(q=>q.type==='multiple').length}`));row.append(text,create('span','','共享题库'));$('bank-list').append(row);}}
 function manage(){renderBanks();$('manage-dialog').showModal();}
 function isDue(id){return !!state.reviews[id]&&state.reviews[id].due<=E.localDay();}
 function scheduleReview(id,correct){const r=E.nextReview(state.reviews[id],correct);if(r)state.reviews[id]=r;else delete state.reviews[id];}
 function toggleStar(){if(!current)return;state.starred=state.starred.includes(current)?state.starred.filter(id=>id!==current):[...state.starred,current];render();save();}
 function toggleUncertain(){if(!current)return;const had=state.uncertain.includes(current);state.uncertain=had?state.uncertain.filter(id=>id!==current):[...state.uncertain,current];if(!had&&!state.reviews[current])state.reviews[current]={stage:0,due:E.localDay()};render();save();toast(had?'已取消待巩固标记，已有复习安排保留。':'已加入待巩固，也会出现在到期复习中。');}
 function selectMode(name){if(!MODE[name]||name===state.mode)return;state.mode=name;buildQueue();}
 function selectPaper(bank,mode='all'){state.bank=bank;state.mode=mode;buildQueue();$('paper-tip').scrollIntoView({block:'start',behavior:'smooth'});}
 function renderLearning(){
  const due=all.filter(q=>isDue(q.id));$('overview-summary').textContent=`${banks.length} 套试卷学习进度 · 今日到期 ${due.length} 题`;$('review-badge').textContent=due.filter(q=>matches(q)).length;$('paper-cards').replaceChildren();
  for(const bank of banks){const paper=all.filter(q=>q.bankId===bank.id),key=JSON.stringify(['all',bank.id,'all','all']),p=state.practice?.key===key?state.practice:state.practices[key],round=state.rounds[key]||{started:0,completed:0},done=paper.filter(q=>validRecord(q,p?.records?.[q.id])).length,wrong=paper.filter(q=>state.wrong.includes(q.id)).length,uncertain=paper.filter(q=>state.uncertain.includes(q.id)).length,dueCount=paper.filter(q=>isDue(q.id)).length;
   const card=create('article','paper-card'+(bank.id===state.bank?' active':''));card.append(create('h3','',bank.title),create('p','',`已完整刷完 ${round.completed} 遍 · 本轮 ${done} / ${paper.length}`),create('p','muted',`错题 ${wrong} · 待巩固 ${uncertain} · 今日到期 ${dueCount}`));
   const track=create('div','progress-track'),fill=create('div');fill.style.width=done/paper.length*100+'%';track.append(fill);card.append(track);
   const last=state.lastExams[bank.id];if(last){const report=E.scoreExam(paper,last.answers);card.append(create('p','last-score',`最近模拟考试 ${report.score} / ${report.maxScore} 分`));}
   const actions=create('div','paper-card-actions'),resume=create('button','secondary-button',p?.current?'继续第 '+(paper.find(q=>q.id===p.current)?.number||1)+' 题':'开始本套');resume.type='button';resume.addEventListener('click',()=>selectPaper(bank.id));actions.append(resume);
   if(dueCount){const review=create('button','text-button',`复习 ${dueCount} 题`);review.type='button';review.addEventListener('click',()=>selectPaper(bank.id,'review'));actions.append(review);}card.append(actions);$('paper-cards').append(card);
  }
 }
 function renderMobile(){
  const q=lookup.get(current),p=queue.indexOf(current),uncertain=state.uncertain.includes(current),star=state.starred.includes(current),r=q&&getRecord(q),exam=state.mode==='exam',finished=wrongFinished();
  $('uncertain-button').hidden=!q;$('uncertain-button').textContent=uncertain?'◆ 已标记':'◇ 待巩固';$('uncertain-button').setAttribute('aria-pressed',String(uncertain));
  $('mobile-prev').disabled=!q||p<=0||finished;$('mobile-star').disabled=$('mobile-uncertain').disabled=!q;$('mobile-star').textContent=star?'★ 已收藏':'☆ 收藏';$('mobile-star').setAttribute('aria-pressed',String(star));$('mobile-uncertain').textContent=uncertain?'◆ 待巩固':'◇ 待巩固';$('mobile-uncertain').setAttribute('aria-pressed',String(uncertain));
  let label='下一题 →',disabled=!q;if(finished){label=remainingWrongIds().length?'继续错题':'已完成';disabled=!remainingWrongIds().length;}else if(exam&&!state.practice.submitted&&p===queue.length-1){label='交卷';}else if(!exam&&q?.type==='multiple'&&!r){label='提交答案';disabled=!selection.length;}else disabled=!q||p>=queue.length-1;
  $('mobile-next').textContent=label;$('mobile-next').disabled=disabled;
 }
 function examQuestions(){return queue.map(id=>lookup.get(id));}
 function renderExam(){
  const exam=state.mode==='exam',p=state.practice;$('restart-set').textContent=exam?'↻ 重新模拟考试':'↻ 重新刷本套题目';if(exam){$('round-status').textContent=`第 ${p.round} 场模拟考试 · 已交卷 ${roundInfo().completed} 场`;$('round-detail').textContent=p.submitted?'本场已评分，可查看逐题解析或重新开始下一场。':'作答自动保存；只有确认交卷才评分，切换练习方式后仍可继续本场考试。';}$('study-note-title').textContent=exam?'交卷后，再揭晓':'先作答，再揭晓';$('study-note-text').textContent=exam?'判断、单选、多选均可修改作答，交卷后统一评分。多选全选对得分，漏选、错选均为 0 分。':'判断、单选选择后立即揭晓；多选选好后点击提交答案。';$('exam-submit').hidden=!exam||!!p.submitted||!queue.length;$('exam-grid-tip').hidden=!exam||!!p.submitted;$('grid-legend').hidden=exam&&!p.submitted;$('exam-report').hidden=!exam||!p.submitted;$('exam-report').replaceChildren();if(!exam||!p.submitted)return;
  const report=E.scoreExam(examQuestions(),p.examAnswers);$('exam-report').append(create('div','eyebrow','本轮模拟考试 · 已交卷'),create('h2','',`${report.score} / ${report.maxScore} 分`),create('p','',`答对 ${report.correct} / ${queue.length} 题 · 未作答 ${report.unanswered} 题`));
  const rows=create('div','exam-score-types');for(const type of ['judge','single','multiple']){const t=report.byType[type];if(t)rows.append(create('p','',`${TYPE[type]}：${t.score} / ${t.maxScore} 分（答对 ${t.correct} / ${t.count} 题）`));}$('exam-report').append(rows);
  const weak=Object.entries(report.byType).sort((a,b)=>a[1].score/a[1].maxScore-b[1].score/b[1].maxScore)[0];$('exam-report').append(create('p','muted',report.correct===queue.length?'本轮全部答对！可重新考试，也可以标记不确定的题继续巩固。':`建议优先复习${TYPE[weak[0]]}。错题和未答题已加入「我的错题」，下方答题卡可逐题查看原文解析。`));
 }
 function confirmExam(){if(state.mode!=='exam'||state.practice.submitted)return;const answered=queue.filter(id=>state.practice.examAnswers[id]?.length).length;$('exam-confirm-text').textContent=`本场共 ${queue.length} 题，已作答 ${answered} 题，未作答 ${queue.length-answered} 题。确定现在交卷吗？`;$('exam-dialog').showModal();}
 function finishExam(){
  if(state.mode!=='exam'||state.practice.submitted)return;const p=state.practice,report=E.scoreExam(examQuestions(),p.examAnswers),at=Date.now();
  for(const q of examQuestions()){const r={...report.results[q.id],at};if(!r.correct){state.wrongEvents[q.id]=++state.wrongSerial;if(!state.wrong.includes(q.id))state.wrong.push(q.id);scheduleReview(q.id,false);}else if(isDue(q.id))scheduleReview(q.id,true);r.wrongVersion=state.wrongEvents[q.id]||0;if(r.selected.length)state.records[q.id]=r;}
  p.submitted=true;p.completed=true;p.submittedAt=at;roundInfo().completed++;state.lastExams[state.bank]={answers:JSON.parse(JSON.stringify(p.examAnswers)),submittedAt:at,round:p.round};$('exam-dialog').close();save();render();$('exam-report').scrollIntoView({block:'start',behavior:'smooth'});toast(`已交卷，本轮 ${report.score} 分。`);
 }
 let pendingRestore=null;
 function initLearning(){
  $('mode-picker').addEventListener('change',()=>selectMode($('mode-picker').value));$('overview-button').addEventListener('click',()=>{$('paper-overview').open=true;$('paper-overview').scrollIntoView({block:'start',behavior:'smooth'});});
  $('uncertain-button').addEventListener('click',toggleUncertain);$('mobile-uncertain').addEventListener('click',toggleUncertain);$('mobile-star').addEventListener('click',toggleStar);$('mobile-prev').addEventListener('click',()=>{const i=queue.indexOf(current);if(i>0)go(queue[i-1]);});$('mobile-next').addEventListener('click',()=>{if(wrongFinished()){if(remainingWrongIds().length)buildQueue();return;}const q=lookup.get(current);if(state.mode!=='exam'&&q?.type==='multiple'&&!getRecord(q))submit();else next();});
  $('exam-submit').addEventListener('click',confirmExam);$('close-exam').addEventListener('click',()=>$('exam-dialog').close());$('confirm-exam').addEventListener('click',finishExam);
  $('backup-button').addEventListener('click',()=>{$('backup-dialog').showModal();});$('close-backup').addEventListener('click',()=>$('backup-dialog').close());
  $('export-backup').addEventListener('click',()=>{save();const blob=new Blob([JSON.stringify(E.createBackup(state),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`导游刷题-进度备份-${E.localDay()}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已生成备份文件，请保存在手机「文件」或电脑中。');});
  $('import-backup').addEventListener('change',async()=>{pendingRestore=null;$('restore-backup').disabled=true;const file=$('import-backup').files?.[0];if(!file)return;try{if(file.size>10*1024*1024)throw new Error('文件超过 10 MB，请选择本站导出的进度备份。');const raw=JSON.parse(await file.text());pendingRestore=E.validateBackup(raw,all);$('backup-preview').textContent=`已校验：${Object.keys(pendingRestore.records).length} 道历史记录、${pendingRestore.wrong.length} 道错题、${pendingRestore.starred.length} 道收藏。点击恢复会替换本机进度。`;$('restore-backup').disabled=false;}catch(error){$('backup-preview').textContent=error instanceof SyntaxError?'文件不是有效的 JSON 备份。':error.message;}});
  $('restore-backup').addEventListener('click',()=>{if(!pendingRestore)return;state=pendingRestore;pendingRestore=null;rebuild();buildQueue(true);$('restore-backup').disabled=true;$('backup-dialog').close();toast('备份已恢复，题库和标准答案保持原文不变。');});
 }

 document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{if(state.mode===button.dataset.mode)return;state.mode=button.dataset.mode;buildQueue();}));
 $('bank-filter').addEventListener('change',()=>{if(!banks.some(b=>b.id===$('bank-filter').value))return;state.bank=$('bank-filter').value;buildQueue();});
 $('submit-multiple').addEventListener('click',submit);
 $('retry-button').addEventListener('click',()=>{if(wrongFinished())return;delete state.practice.records[current];delete state.practice.drafts[current];selection=[];render();save();});
 $('restart-set').addEventListener('click',restart);$('continue-wrong').addEventListener('click',()=>{if(wrongFinished())buildQueue();});

 $('star-button').addEventListener('click',toggleStar);
 $('grid-prev').addEventListener('click',()=>{gridPage--;renderGrid();});$('grid-next').addEventListener('click',()=>{gridPage++;renderGrid();});
 $('back-all').addEventListener('click',()=>{state.mode='all';buildQueue();});
 $('manage-button').addEventListener('click',manage);$('bank-info-top').addEventListener('click',manage);$('close-manage').addEventListener('click',()=>$('manage-dialog').close());
 initLearning();rebuild();refreshBankOptions();buildQueue(true);if(storageProblem)toast('部分本机历史数据未能读取，现有文件未被删除。');
})();

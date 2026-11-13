(() => {
 'use strict';
 const $=id=>document.getElementById(id),E=GuideEngine;
 const KEY='guide-study-v1';
 const TYPE={judge:'判断题',single:'单选题',multiple:'多选题'};
 const MODE={all:'顺序练习',random:'随机练习',wrong:'我的错题',starred:'收藏题目',uncertain:'待巩固',review:'到期复习',exam:'模拟考试',examReview:'本次考试错题'};
 const bankRank=b=>[Number(b.title.match(/\d+/)?.[0]||999),b.questions.some(q=>q.exam==='科目一'||q.exam==='科目二')?0:1];
 const banks=(window.GUIDE_BANKS||[window.GUIDE_BANK]).map(E.validateBank).sort((a,b)=>{const av=bankRank(a),bv=bankRank(b);return av[0]-bv[0]||av[1]-bv[1];});
 let all=[],lookup=new Map(),queue=[],current='',selection=[],gridPage=0,toastTimer;
 let state={records:{},drafts:{},wrong:[],starred:[],current:'',mode:'all',exam:'all',type:'all',bank:'all',practice:null,practices:{},modeFilters:{},rounds:{},wrongEvents:{},wrongSerial:0,uncertain:[],reviews:{},lastExams:{}};
 let examReady=false,examHistoryLimit=10;
 let timerAnchor=null,timerPractice=null,timerSuspended=false,timerSaves=0;
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
 function save(){syncTimer();if(state.practice?.key)state.practices[state.practice.key]=state.practice;state.modeFilters[state.mode]={exam:state.exam,type:state.type,bank:state.bank};try{localStorage.setItem(KEY,JSON.stringify(state));$('save-indicator').textContent=storageProblem?'部分历史数据未能读取':'进度已保存到当前浏览器';}catch{$('save-indicator').textContent='保存失败，请勿清除或关闭页面';toast('浏览器存储空间不足，当前进度暂时无法保存。');}}
 function validRecord(q,r){return r&&Array.isArray(r.selected)&&r.selected.length&&r.selected.every(k=>q.options.some(o=>o.key===k))&&typeof r.correct==='boolean'?{...r,correct:E.gradeAttempt(q,r.selected).correct}:null;}
 function browsingExamMistakes(){return state.mode==='examReview'&&state.practice?.examReviewPhase==='browse';}
 function getRecord(q){if(browsingExamMistakes())return E.gradeAttempt(q,state.practice.examAnswers?.[q.id]);if(state.mode==='exam')return state.practice?.submitted?E.gradeAttempt(q,state.practice.examAnswers?.[q.id]):null;return validRecord(q,state.practice?.records?.[q.id]);}
 function readDraft(id){const q=lookup.get(id),draft=state.mode==='exam'?state.practice?.examAnswers?.[id]:state.practice?.drafts?.[id];if(state.mode==='exam')return Array.isArray(draft)?draft.slice():[];return q&&q.type==='multiple'&&!getRecord(q)&&Array.isArray(draft)?[...new Set(draft.filter(k=>q.options.some(o=>o.key===k)))]:[];}
 function globalExam(){return state.mode==='exam'&&state.examKind==='global';}
 function wrongMode(){return state.mode==='wrong'||state.mode==='examReview';}
 function practiceKey(){return JSON.stringify([state.mode,globalExam()?'@global'+state.examGroup:state.mode==='examReview'?'@global':state.bank,state.exam,state.type]);}
 function roundInfo(){const key=practiceKey(),r=state.rounds[key];if(!r||!Number.isSafeInteger(r.started)||r.started<0||!Number.isSafeInteger(r.completed)||r.completed<0||r.completed>r.started)state.rounds[key]={started:0,completed:0};return state.rounds[key];}
 function matches(q){return state.mode==='examReview'?state.examReviewIds.includes(q.id):q.bankId===state.bank;}

 function rebuild(){
  if(!Array.isArray(state.examHistory))state.examHistory=[];state.examKind=state.examKind==='paper'?'paper':'global';state.examGroup=state.examGroup==='34'?'34':'12';if(!state.globalExams||typeof state.globalExams!=='object')state.globalExams={cycle:1,results:{},cycleResults:{},history:[]};if(!Array.isArray(state.examReviewIds))state.examReviewIds=[];
  all=E.mergeBanks(banks);lookup=new Map(all.map(q=>[q.id,q]));state.wrong=state.wrong.filter(id=>lookup.has(id));state.starred=state.starred.filter(id=>lookup.has(id));
  if(!banks.some(b=>b.id===state.bank))state.bank=lookup.get(state.practice?.current||state.current)?.bankId||banks[0].id;
  state.exam='all';state.type='all';if(!state.examBanks||typeof state.examBanks!=='object')state.examBanks={};if(!state.examKinds||typeof state.examKinds!=='object')state.examKinds={'12':state.examKind,'34':state.examKind};
  if(!state.globalExamGroups||typeof state.globalExamGroups!=='object')state.globalExamGroups={};for(const group of ['12','34'])if(!state.globalExamGroups[group]){const keep=items=>Object.fromEntries(Object.entries(items||{}).filter(([id])=>E.questionGroup(lookup.get(id)||{})===group));state.globalExamGroups[group]={cycle:state.globalExams.cycle||1,results:keep(state.globalExams.results),cycleResults:keep(state.globalExams.cycleResults),history:[]};}
  // Consolidate saved submissions before a newer paper score can replace lastExams.
  state.examHistory=savedExams().filter(h=>h.queue.length===165&&h.report.maxScore===100&&h.report.byType.judge?.count===40&&h.report.byType.single?.count===90&&h.report.byType.multiple?.count===35).map(h=>({queue:h.queue.slice(),answers:JSON.parse(JSON.stringify(h.answers||{})),submittedAt:h.submittedAt||0,round:h.round||1,elapsedMs:h.elapsedMs||0}));
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
 function wrongFinished(){return wrongMode()&&state.practice?.completed&&state.practice.wrongSettled;}
 function remainingWrongIds(){return all.filter(q=>matches(q)&&state.wrong.includes(q.id)).sort((a,b)=>a.number-b.number).map(q=>q.id);}
 function buildQueue(restoreLegacy=false){
  syncTimer();if(state.mode==='exam'&&!examReady){if(state.practice?.key)state.practices[state.practice.key]=state.practice;state.practice=null;queue=[];current='';selection=[];render();save();return;}if(globalExam()){buildGlobalExam();return;}
  if(state.practice?.key)state.practices[state.practice.key]=state.practice;
  const key=practiceKey(),saved=state.practices[key],previous=saved||priorPractice(),round=roundInfo();
  if(state.mode==='examReview'&&saved?.examReviewPhase==='browse'){state.practice=saved;state.practice.queue=saved.queue.filter(id=>lookup.has(id)&&state.examReviewIds.includes(id));activateGlobalExam();render();save();return;}
  if(wrongMode()&&previous?.completed&&Array.isArray(previous.queue)&&previous.records)settleWrongRound(previous);
  if(state.mode==='examReview'&&previous?.completed)state.examReviewIds=remainingWrongIds();
  const usable=!(wrongMode()&&previous?.completed)&&!(state.mode==='uncertain'&&previous?.completed)&&!(state.mode==='review'&&(previous?.completed||previous?.reviewDay!==E.localDay()))&&previous&&Array.isArray(previous.queue)&&previous.records&&typeof previous.records==='object'&&previous.drafts&&typeof previous.drafts==='object';
  const eligible=all.filter(q=>matches(q)&&(!wrongMode()||state.mode==='examReview'||state.wrong.includes(q.id))&&(state.mode!=='starred'||state.starred.includes(q.id))&&(state.mode!=='uncertain'||state.uncertain.includes(q.id))&&(state.mode!=='review'||isDue(q.id))).sort((a,b)=>a.number-b.number).map(q=>q.id);
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
 function completeRound(){if(state.mode==='exam'||browsingExamMistakes())return false;const finished=queue.length>0&&queue.every(id=>getRecord(lookup.get(id)));let completed=false;if(finished&&!state.practice.completed){state.practice.completed=true;roundInfo().completed++;completed=true;}if(finished&&wrongMode())settleWrongRound(state.practice);return completed;}
 function stats(){const records=all.map(q=>validRecord(q,state.records[q.id])).filter(Boolean),right=records.filter(r=>r.correct).length;$('stat-total').textContent=all.length;$('stat-done').textContent=records.length;$('stat-rate').textContent=records.length?Math.round(right/records.length*100)+'%':'—';$('stat-wrong').textContent=state.wrong.length;$('wrong-badge').textContent=state.wrong.filter(id=>lookup.get(id)?.bankId===state.bank).length;$('star-badge').textContent=state.starred.filter(id=>lookup.get(id)?.bankId===state.bank).length;const round=roundInfo();$('round-status').textContent=queue.length?`正在刷第 ${state.practice.round} 遍 · 已完整刷完 ${round.completed} 遍`:`已完整刷完 ${round.completed} 遍`;$('round-detail').textContent=queue.length?`${banks.find(b=>b.id===state.bank)?.title} · ${queue.length} 题${state.practice.completed&&queue.every(id=>getRecord(lookup.get(id)))?' · 本轮已完成':''}。完整作答才计为刷完一遍。`:'本套试卷暂无符合条件的题目。';$('restart-set').disabled=!queue.length||(wrongFinished()&&!remainingWrongIds().length);}
 function updateControls(){document.querySelectorAll('[data-mode]').forEach(button=>{button.classList.toggle('active',button.dataset.mode===state.mode);button.setAttribute('aria-current',button.dataset.mode===state.mode?'page':'false');});$('page-name').textContent=MODE[state.mode];$('bank-filter').value=state.bank;$('bank-filter').disabled=globalExam()||state.mode==='examReview';$('mode-picker').value=state.mode;$('paper-tip').textContent=state.mode==='examReview'?(browsingExamMistakes()?'先回顾原考试答案与解析，点击「重做错题」后隐藏答案重新作答。':'本次交卷中的错题与未答题，作答后显示解析；全组完成后统一移除答对的错题。'):state.mode==='exam'?'独立模拟考试：40 道判断 × 0.5 分 + 90 道单选 × 0.5 分 + 35 道多选 × 1 分 = 100 分。交卷前不显示答案。':state.mode==='uncertain'?'把答对但不确定的题标记为待巩固；可在这里重新练习。':state.mode==='review'?'只练当前试卷今日及以前到期的题。按 1、3、7 天逐步巩固，答错则次日再练。':state.mode==='random'?'分题型乱序：判断 1–40、单选 41–130、多选 131–165。判断题对／错选项不变，仅单选和多选打乱选项。':wrongMode()||state.mode==='starred'?(wrongMode()?'本轮错题全部作答后，统一移除答对的题；顺序和随机练习新答错的题会自动加入。':'仅练习当前试卷中的收藏；切换试卷会保留各自进度。'):'按本套文档原题号练习，每套 165 题，不按科目或题型拆分。';}
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
  const done=browsingExamMistakes()?Math.max(0,queue.indexOf(current)+1):queue.filter(id=>state.mode==='exam'?state.practice.examAnswers?.[id]?.length:getRecord(lookup.get(id))).length,nav=wrongFinished()?remainingWrongIds():queue;
  $('nav-count').textContent=wrongFinished()?'待重练 '+nav.length+' 题':nav.length+' 题';$('session-count').textContent=done+' / '+queue.length;$('session-fill').style.width=(queue.length?done/queue.length*100:0)+'%';
  const pages=Math.max(1,Math.ceil(nav.length/40));gridPage=Math.min(Math.max(0,gridPage),pages-1);$('grid-page').textContent=(gridPage+1)+' / '+pages;$('grid-prev').disabled=gridPage===0;$('grid-next').disabled=gridPage>=pages-1;
  $('question-grid').replaceChildren();nav.slice(gridPage*40,gridPage*40+40).forEach((id,i)=>{const q=lookup.get(id),r=getRecord(q),answered=state.mode==='exam'&&!state.practice.submitted&&state.practice.examAnswers?.[id]?.length,button=create('button',(answered?'answered':'')+(r?(r.correct?'right':'wrong'):'')+(id===current?' current':''),gridPage*40+i+1);button.type='button';button.setAttribute('aria-label',`第 ${gridPage*40+i+1} 题，原题 ${q.number}，${answered?'已作答':r?(r.selected.length?(r.correct?'已答对':'已答错'):'未作答，0 分'):'未作答'}`);if(id===current)button.setAttribute('aria-current','true');button.addEventListener('click',()=>{if(wrongFinished())buildQueue();go(id);});$('question-grid').append(button);});
 }
 function render(){
  syncTimer();stats();updateControls();renderLearning();renderExamReviewTools();if(renderExamEntry())return;renderGrid();renderExam();renderMobile();$('wrong-summary').hidden=!wrongFinished();$('continue-wrong').hidden=!wrongFinished()||!remainingWrongIds().length;if(wrongFinished())$('wrong-summary').textContent=`本轮已完成，已移除 ${state.practice.wrongRemoved||0} 道答对题，剩余 ${remainingWrongIds().length} 道错题。`;const q=lookup.get(current);$('question-area').hidden=!q;$('empty').hidden=!!q;$('star-button').hidden=!q;
  if(!q){$('question-type').textContent='练习清单';$('question-exam').hidden=true;$('source-number').textContent='';$('empty-title').textContent=wrongMode()?'本套暂时没有待巩固的错题':state.mode==='starred'?'本套还没有收藏的题目':'没有匹配的题目';$('empty-text').textContent=wrongMode()?'顺序和随机练习答错的题会收录到这里；本轮错题全部作答后，答对的题会统一移出。':state.mode==='starred'?'练习时点击题目右上角的星标，就能在这里找到它。':'试试选择其他试卷或练习方式。';return;}
  const r=getRecord(q),position=queue.indexOf(current);$('question-type').textContent=TYPE[q.type];$('question-exam').hidden=false;$('question-exam').textContent=q.exam;$('source-number').textContent='原题 '+q.number;$('question-index').textContent=wrongFinished()?'本轮最后一题 · 结果回顾':'QUESTION '+String(position+1).padStart(2,'0')+' / '+queue.length;$('stem').textContent=q.stem;$('question-tip').textContent=browsingExamMistakes()?'考试错题回顾：下方显示当时作答、正确答案与解析；点击「重做错题」后重新答题。':state.mode==='exam'&&!state.practice.submitted?'模拟考试 · 选择自动保存，可修改；交卷后统一显示答案与解析。':r?'已提交 · 可查看本题答案和解析':q.type==='multiple'?'多选题 · 可选择多个选项，选好后点击「提交答案」。':'请选择一个答案，选择后立即显示正确答案与解析。';
  $('star-button').textContent=state.starred.includes(q.id)?'★':'☆';$('star-button').setAttribute('aria-label',state.starred.includes(q.id)?'取消收藏本题':'收藏本题');$('star-button').setAttribute('aria-pressed',String(state.starred.includes(q.id)));
  $('options').replaceChildren();for(const option of layout(q)){const button=create('button','option');button.type='button';button.setAttribute('aria-label',option.label+'，'+option.text);button.setAttribute('aria-pressed',String((r?r.selected:selection).includes(option.key)));button.append(create('span','option-letter',option.label),create('span','option-text',option.text));if((r?r.selected:selection).includes(option.key))button.classList.add('selected');if(r){button.disabled=true;if(q.answer.includes(option.key))button.classList.add('correct');else if(r.selected.includes(option.key))button.classList.add('incorrect');}button.addEventListener('click',()=>choose(option.key));$('options').append(button);}
  $('submit-multiple').hidden=state.mode==='exam'||q.type!=='multiple'||!!r;$('submit-multiple').disabled=!selection.length;$('retry-button').hidden=state.mode==='exam'||browsingExamMistakes()||!r||wrongFinished();$('inline-result').hidden=!r;if(r)fillResult($('inline-result'),q,r);else $('inline-result').replaceChildren();$('source-line').textContent='题目来源 · '+q.source;
 }
 function choose(key){const q=lookup.get(current);if(!q||getRecord(q))return;if(state.mode==='exam'){selection=q.type==='multiple'?(selection.includes(key)?selection.filter(k=>k!==key):[...selection,key]):[key];state.practice.examAnswers[q.id]=selection.slice();render();save();return;}if(q.type==='multiple'){selection=selection.includes(key)?selection.filter(k=>k!==key):[...selection,key];state.practice.drafts[q.id]=selection.slice();render();save();$('options').children[layout(q).findIndex(o=>o.key===key)]?.focus({preventScroll:true});}else{selection=[key];submit();}}
 function submit(){if(state.mode==='exam')return;const q=lookup.get(current);if(!q||!selection.length||getRecord(q))return;const record={selected:selection.slice(),correct:E.exactMatch(selection,q.answer),at:Date.now()};if(!record.correct)state.wrongEvents[q.id]=++state.wrongSerial;record.wrongVersion=state.wrongEvents[q.id]||0;state.records[q.id]=record;state.practice.records[q.id]=record;delete state.practice.drafts[q.id];delete state.drafts[q.id];if(!record.correct&&!state.wrong.includes(q.id))state.wrong.push(q.id);if(!record.correct)scheduleReview(q.id,false);else if(!wrongMode()&&(isDue(q.id)||state.mode==='review'))scheduleReview(q.id,true);const completed=completeRound();save();render();if(completed)toast(wrongFinished()?`本轮错题已完成，已移除 ${state.practice.wrongRemoved||0} 道答对题，剩余 ${remainingWrongIds().length} 道。`:`本套题目已完整刷完 ${roundInfo().completed} 遍，可点击「重新刷本套题目」继续。`);const heading=$('inline-result').querySelector('h2');heading?.focus({preventScroll:true});heading?.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
 function go(id){if(!queue.includes(id)||wrongFinished())return;current=id;state.current=id;state.practice.current=id;selection=readDraft(id);gridPage=Math.floor(queue.indexOf(id)/40);render();save();$('question-index').scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
 function restart(){if(state.mode==='exam'&&!examReady)return;if(globalExam()){if(!state.practice.submitted&&Object.values(state.practice.examAnswers||{}).some(a=>a.length)){toast('本场尚未交卷，请先交卷后再组新卷。');return;}syncTimer();createGlobalExam();render();save();return;}if(state.mode==='exam'&&!state.practice.submitted&&Object.values(state.practice.examAnswers||{}).some(a=>a.length)){toast('本场考试尚未交卷，请先交卷；交卷后可重新考试。');return;}if(state.mode==='review'&&state.practice.completed){buildQueue();return;}if(wrongFinished()){buildQueue();return;}if(!queue.length)return;if(state.mode==='random')queue=randomOrder(queue,true);const round=roundInfo();round.started++;state.practice={key:practiceKey(),queue:queue.slice(),records:{},drafts:{},current:queue[0],round:round.started,completed:false,optionOrders:{},examAnswers:{},reviewDay:E.localDay()};go(queue[0]);toast('已开始新一遍，答案将在重新作答后显示。');}
 function next(){if(state.mode==='exam'&&!examReady)return;if(wrongFinished())return;const index=queue.indexOf(current);if(index<queue.length-1)go(queue[index+1]);else if(state.mode==='exam'&&!state.practice.submitted)confirmExam();else toast('已到最后一题，可查看答题卡或重新刷本套题目。');}
 function refreshBankOptions(){$('bank-filter').replaceChildren();for(const bank of banks.filter(b=>state.mode!=='exam'||E.questionGroup(b.questions[0])===state.examGroup))$('bank-filter').append(new Option(bank.title,bank.id));}
 function renderBanks(){$('bank-list').replaceChildren();for(const bank of banks){const row=create('div','bank-row'),text=create('div');text.append(create('strong','',bank.title),create('p','',`${bank.questions.length} 道题 · 判断 ${bank.questions.filter(q=>q.type==='judge').length} / 单选 ${bank.questions.filter(q=>q.type==='single').length} / 多选 ${bank.questions.filter(q=>q.type==='multiple').length}`));row.append(text,create('span','','共享题库'));$('bank-list').append(row);}}
 function manage(){renderBanks();$('manage-dialog').showModal();}
 function isDue(id){return !!state.reviews[id]&&state.reviews[id].due<=E.localDay();}
 function scheduleReview(id,correct){const r=E.nextReview(state.reviews[id],correct);if(r)state.reviews[id]=r;else delete state.reviews[id];}
 function toggleStar(){if(!current)return;state.starred=state.starred.includes(current)?state.starred.filter(id=>id!==current):[...state.starred,current];render();save();}
 function toggleUncertain(){if(!current)return;const had=state.uncertain.includes(current);state.uncertain=had?state.uncertain.filter(id=>id!==current):[...state.uncertain,current];if(!had&&!state.reviews[current])state.reviews[current]={stage:0,due:E.localDay()};render();save();toast(had?'已取消待巩固标记，已有复习安排保留。':'已加入待巩固，也会出现在到期复习中。');}
 function selectMode(name){if(!MODE[name])return;if(name===state.mode){if(name==='exam'){examReady=false;buildQueue();}return;}syncTimer();if(name==='exam')state.practiceBank=state.bank;if(state.mode==='exam'&&banks.some(b=>b.id===state.practiceBank))state.bank=state.practiceBank;examReady=false;state.mode=name;refreshBankOptions();buildQueue();if(name==='exam')$('exam-entry').scrollIntoView({block:'start',behavior:'smooth'});}
 function selectPaper(bank,mode='all'){syncTimer();examReady=false;state.bank=bank;state.mode=mode;refreshBankOptions();buildQueue();$('paper-tip').scrollIntoView({block:'start',behavior:'smooth'});}
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
  let label='下一题 →',disabled=!q;if(finished){label=remainingWrongIds().length?'继续错题':'已完成';disabled=!remainingWrongIds().length;}else if(browsingExamMistakes()&&p===queue.length-1){label='重做错题';disabled=false;}else if(exam&&!state.practice.submitted&&p===queue.length-1){label='交卷并评分';}else if(!exam&&q?.type==='multiple'&&!r){label='提交答案';disabled=!selection.length;}else disabled=!q||p>=queue.length-1;
  $('mobile-next').textContent=label;$('mobile-next').disabled=disabled;
 }
 function examQuestions(){return queue.map(id=>lookup.get(id));}
 function renderExam(){
  renderExamSettings();  const exam=state.mode==='exam',p=state.practice;$('restart-set').textContent=globalExam()?'↻ 生成下一张随机卷':exam?'↻ 重新模拟考试':'↻ 重新刷本套题目';if(exam){$('round-status').textContent=`第 ${p.round} 场模拟考试 · 已交卷 ${roundInfo().completed} 场`;$('round-detail').textContent=p.submitted?'本场已评分，可查看逐题解析或重新开始下一场。':'作答自动保存；只有确认交卷才评分，切换练习方式后仍可继续本场考试。';}$('study-note-title').textContent=exam?'交卷后，再揭晓':'先作答，再揭晓';$('study-note-text').textContent=exam?'判断、单选、多选均可修改作答，交卷后统一评分。多选全选对得分，漏选、错选均为 0 分。':'判断、单选选择后立即揭晓；多选选好后点击提交答案。';$('exam-submit').hidden=!exam||!!p.submitted||!queue.length||queue.indexOf(current)!==queue.length-1;$('exam-grid-tip').hidden=!exam||!!p.submitted;$('grid-legend').hidden=exam&&!p.submitted;$('exam-report').hidden=!exam||!p.submitted;$('exam-report').replaceChildren();if(globalExam())$('restart-set').disabled=!!globalPlan().shortages.length;if(!exam||!p.submitted)return;
  const report=E.scoreExam(examQuestions(),p.examAnswers);$('exam-report').append(create('div','eyebrow','本轮模拟考试 · 已交卷'),create('h2','',`${report.score} / ${report.maxScore} 分`),create('p','',`答对 ${report.correct} / ${queue.length} 题 · 未作答 ${report.unanswered} 题 · 考试用时 ${E.duration(p.elapsedMs)}`));
  const rows=create('div','exam-score-types');for(const type of ['judge','single','multiple']){const t=report.byType[type];if(t)rows.append(create('p','',`${TYPE[type]}：${t.score} / ${t.maxScore} 分（答对 ${t.correct} / ${t.count} 题，正确率 ${Math.round(t.correct/t.count*100)}%）`));}$('exam-report').append(rows);
  if(globalExam())$('exam-report').append(create('p','',`本场新增刷题 ${p.newCoverage||0} 道 · 累计已刷 ${coverage().done} 道 · 剩余未刷 ${coverage().remaining} 道`));
  const mistakes=queue.filter(id=>!report.results[id].correct);if(mistakes.length){const button=create('button','secondary-button',`查看本次错题（${mistakes.length} 题）`);button.type='button';button.addEventListener('click',()=>startExamReview(mistakes));$('exam-report').append(button);}
  const weak=Object.entries(report.byType).sort((a,b)=>a[1].score/a[1].maxScore-b[1].score/b[1].maxScore)[0];$('exam-report').append(create('p','muted',report.correct===queue.length?'本轮全部答对！可重新考试，也可以标记不确定的题继续巩固。':`建议优先复习${TYPE[weak[0]]}。错题和未答题已加入「我的错题」，下方答题卡可逐题查看原文解析。`));
 }
 function confirmExam(){if(state.mode!=='exam'||!examReady||state.practice?.submitted||!queue.length||queue.indexOf(current)!==queue.length-1)return;const answered=queue.filter(id=>state.practice.examAnswers[id]?.length).length;$('exam-confirm-text').textContent=`本场共 ${queue.length} 题，已作答 ${answered} 题，未作答 ${queue.length-answered} 题。确定现在交卷吗？`;$('exam-dialog').showModal();}
 function finishExam(){
  if(state.mode!=='exam'||!examReady||state.practice?.submitted||!queue.length||queue.indexOf(current)!==queue.length-1)return;syncTimer();const p=state.practice,report=E.scoreExam(examQuestions(),p.examAnswers),at=Date.now();
  for(const q of examQuestions()){const r={...report.results[q.id],at};if(!r.correct){state.wrongEvents[q.id]=++state.wrongSerial;if(!state.wrong.includes(q.id))state.wrong.push(q.id);scheduleReview(q.id,false);}else if(isDue(q.id))scheduleReview(q.id,true);r.wrongVersion=state.wrongEvents[q.id]||0;if(r.selected.length)state.records[q.id]=r;}
  p.submitted=true;p.completed=true;p.submittedAt=at;roundInfo().completed++;if(globalExam())settleGlobalExam(p,report,at);else{const snapshot={queue:queue.slice(),answers:JSON.parse(JSON.stringify(p.examAnswers)),submittedAt:at,round:p.round,elapsedMs:p.elapsedMs||0};state.examHistory.push(snapshot);state.lastExams[state.bank]={answers:snapshot.answers,submittedAt:at,round:p.round,elapsedMs:p.elapsedMs||0};}$('exam-dialog').close();save();render();$('exam-report').scrollIntoView({block:'start',behavior:'smooth'});toast(`已交卷，本轮 ${report.score} 分。`);
 }
 function groupTitle(group){return group==='34'?'科三科四':'科一科二';}
 function startExamGroup(group){
  if(state.mode!=='exam'||!['12','34'].includes(group))return;syncTimer();state.examGroup=group;state.examKind=state.examKinds[group]||'global';
  const groupBanks=banks.filter(b=>b.questions.every(q=>E.questionGroup(q)===group));if(!groupBanks.length){toast('本组暂无可用试卷。');return;}
  if(groupBanks.some(b=>b.id===state.examBanks[group]))state.bank=state.examBanks[group];else if(!groupBanks.some(b=>b.id===state.bank))state.bank=groupBanks[0].id;state.examBanks[group]=state.bank;
  examReady=true;refreshBankOptions();buildQueue();$('exam-settings').scrollIntoView({block:'start',behavior:'smooth'});
 }
 function renderExamEntry(){
  const waiting=state.mode==='exam'&&!examReady;$('exam-entry').hidden=!waiting;
  $('study-layout').hidden=waiting;$('round-toolbar').hidden=waiting;$('mobile-controls').hidden=waiting;$('paper-overview').hidden=waiting;
  $('paper-toolbar').hidden=state.mode==='exam'&&(waiting||globalExam());
  if(!waiting)return false;
  renderSavedExams();
  for(const group of ['12','34']){
   const pool=examPool(group),g=state.globalExamGroups[group],done=pool.filter(q=>validRecord(q,g.results[q.id])).length;
   const pending=Object.values(state.practices).find(p=>{let k;try{k=JSON.parse(p.key);}catch{return false;}return k[0]==='exam'&&!p.submitted&&p.queue?.length&&p.queue.every(id=>E.questionGroup(lookup.get(id)||{})===group);});
   $('exam-entry-'+group+'-info').textContent=`${banks.filter(b=>b.questions.every(q=>E.questionGroup(q)===group)).length} 套文档 · ${pool.length} 题 · 随机模拟已刷 ${done} 题${pending?' · 有未完成考试，可继续':''}`;
  }
  for(const id of ['exam-settings','exam-report','exam-timer','question-area','inline-result','exam-submit','submit-multiple','retry-button'])$(id).hidden=true;
  $('options').replaceChildren();$('question-grid').replaceChildren();$('inline-result').replaceChildren();$('exam-report').replaceChildren();$('stem').textContent='';return true;
 }
 function examPool(group=state.examGroup){return all.filter(q=>E.questionGroup(q)===group);}
 function examLedger(){return state.globalExamGroups[state.examGroup];}
 function globalPlan(){return E.randomExam(examPool(),examLedger().cycleResults);}
 function coverage(){const records=examPool().map(q=>validRecord(q,examLedger().results[q.id])).filter(Boolean);return{done:records.length,remaining:examPool().length-records.length,wrong:records.filter(r=>!r.correct).length};}
 function activateGlobalExam(){const p=state.practice;queue=p.queue.slice();current=queue.includes(p.current)?p.current:queue[0]||'';p.current=state.current=current;selection=readDraft(current);gridPage=Math.floor(Math.max(0,queue.indexOf(current))/40);}
 function createGlobalExam(){
  const plan=globalPlan(),round=roundInfo();if(plan.queue.length)round.started++;
  state.practice={key:practiceKey(),queue:plan.queue,records:{},drafts:{},examAnswers:{},optionOrders:{},current:plan.queue[0]||'',round:round.started,cycle:examLedger().cycle,newCount:plan.newCount,wrongCount:plan.wrongCount,elapsedMs:0,completed:false};activateGlobalExam();
 }
 function buildGlobalExam(){
  if(state.practice?.key)state.practices[state.practice.key]=state.practice;
  const p=state.practices[practiceKey()];
  if(p&&Array.isArray(p.queue)&&p.queue.every(id=>lookup.has(id)&&E.questionGroup(lookup.get(id))===state.examGroup)){state.practice=p;activateGlobalExam();}else createGlobalExam();render();save();
 }
 function settleGlobalExam(p,report,at){
  const g=examLedger(),before=coverage().done;
  for(const id of queue){const r=report.results[id];if(r.selected.length){const record={selected:r.selected.slice(),correct:r.correct,at};g.results[id]=record;g.cycleResults[id]=record;}}
  p.newCoverage=coverage().done-before;g.history.push({queue:queue.slice(),answers:JSON.parse(JSON.stringify(p.examAnswers)),submittedAt:at,round:p.round,cycle:p.cycle,elapsedMs:p.elapsedMs||0,newCount:p.newCoverage});
 }
 function renderExamSettings(){
  const exam=state.mode==='exam',p=state.practice;$('exam-settings').hidden=!exam;$('exam-timer').hidden=!exam;$('exam-group-label').textContent=groupTitle(state.examGroup)+'模拟考试';$('exam-kind').value=state.examKind;$('global-exam-info').hidden=!globalExam();$('exam-timer').textContent=`${p?.submitted?'考试用时':'用时'} ${E.duration(p?.elapsedMs)}`;if(!globalExam())return;
  const g=examLedger(),c=coverage(),counts=$('global-exam-counts');counts.replaceChildren();for(const [label,value]of [['累计已刷',c.done],['剩余未刷',c.remaining],['待巩固错题',c.wrong]]){const item=create('div');item.append(create('span','',label),create('strong','',String(value)),create('small','',' 道'));counts.append(item);}
  $('exam-balance-summary').replaceChildren();
  for(const type of ['judge','single','multiple']){const part=queue.map(id=>lookup.get(id)).filter(q=>q.type===type),subjects=[...new Set(part.map(q=>q.exam))];$('exam-balance-summary').append(create('p','',TYPE[type]+'：'+subjects.map(subject=>subject+' '+part.filter(q=>q.exam===subject).length+' 题').join('；')));}
  const chapters=new Map();for(const id of queue){const q=lookup.get(id),key=q.exam+' · '+E.chapter(q);chapters.set(key,(chapters.get(key)||0)+1);}for(const [name,count]of chapters)$('exam-balance-summary').append(create('p','muted',name+'：'+count+' 题'));
  const plan=globalPlan(),cycleDone=Object.keys(g.cycleResults).length;$('global-exam-composition').textContent=`第 ${g.cycle} 轮 · 本轮已刷 ${cycleDone} / ${examPool().length} 题 · 本卷${p.submitted?'交卷时含':'含'}未刷题 ${p.newCount||0} 道、复考错题 ${p.wrongCount||0} 道。`;
  const blocked=plan.shortages.length>0&&(!queue.length||p.submitted);$('global-exam-shortage').hidden=!blocked;$('global-shortage-text').textContent=blocked?`当前轮次无法按科目比例组成完整 165 题：${plan.shortages.map(x=>`${TYPE[x.type]}${x.subject?"（"+x.subject+"）":""}可抽 ${x.available} 题，需要 ${x.required} 题`).join('；')}。可查看本场解析，或开始新一轮。`:'';
  const history=$('global-history-list');history.replaceChildren();for(const h of g.history.slice(-10).reverse()){const report=E.scoreExam(h.queue.map(id=>lookup.get(id)),h.answers);history.append(create('p','',`第 ${h.round} 场 · 第 ${h.cycle} 轮 · ${report.score} / 100 分 · 用时 ${E.duration(h.elapsedMs)} · 新增刷题 ${h.newCount} 道`));}if(!g.history.length)history.append(create('p','muted','交卷后在这里保留成绩与用时；最近 10 场显示在此，全部记录随进度备份保存。'));
 }
 function savedExams(){
  const candidates=[...state.examHistory,...Object.values(state.globalExamGroups||{}).flatMap(g=>g.history||[]),...(state.globalExams?.history||[])];
  for(const [bankId,h]of Object.entries(state.lastExams)){const paper=all.filter(q=>q.bankId===bankId).sort((a,b)=>a.number-b.number);if(paper.length)candidates.push({...h,queue:paper.map(q=>q.id)});}
  for(const p of [state.practice,...Object.values(state.practices)])if(p?.submitted&&p.queue?.length&&p.examAnswers&&typeof p.examAnswers==='object')candidates.push({...p,answers:p.examAnswers||{}});
  const seen=new Set(),result=[];
  for(const h of candidates){if(!Array.isArray(h.queue)||!h.queue.length||!h.answers||typeof h.answers!=='object'||Array.isArray(h.answers))continue;const ids=h.queue.filter(id=>lookup.has(id));if(ids.length!==h.queue.length)continue;const key=JSON.stringify([h.submittedAt||0,h.round||1,ids]);if(seen.has(key))continue;seen.add(key);const report=E.scoreExam(ids.map(id=>lookup.get(id)),h.answers||{});result.push({...h,queue:ids,report,mistakes:ids.filter(id=>!report.results[id].correct)});}
  return result.sort((a,b)=>(b.submittedAt||0)-(a.submittedAt||0));
 }
 function savedExamMistakes(group){
  const candidates=new Set(savedExams().flatMap(h=>h.mistakes));
  for(const [id,r]of Object.entries(state.globalExamGroups[group]?.results||{}))if(lookup.has(id)&&!E.gradeAttempt(lookup.get(id),r.selected).correct)candidates.add(id);
  return [...candidates].filter(id=>E.questionGroup(lookup.get(id))===group&&state.wrong.includes(id));
 }
 function renderSavedExams(){
  for(const group of ['12','34']){const ids=savedExamMistakes(group),button=$('exam-wrong-'+group);button.textContent=`考试错题（${ids.length} 题待巩固）`;button.disabled=!ids.length;}
  const history=savedExams(),list=$('saved-exam-list');list.replaceChildren();
  const scores=history.map(h=>h.report.score);$('score-history-summary').textContent=history.length?`已保存 ${history.length} 场考试 · 最近 ${scores[0]} 分 · 最高 ${Math.max(...scores)} 分`:'每次交卷后自动保留成绩；已有的考试记录会自动汇总到这里。';
  if(!history.length)list.append(create('p','muted','还没有已交卷的考试。交卷后会在这里保留成绩、用时和错题入口。'));
  for(const h of history.slice(0,examHistoryLimit)){
   const groups=[...new Set(h.queue.map(id=>E.questionGroup(lookup.get(id))))],bankIds=[...new Set(h.queue.map(id=>lookup.get(id).bankId))];
   const name=groups.length===1?groupTitle(groups[0]):'早期综合';const title=bankIds.length===1?banks.find(b=>b.id===bankIds[0])?.title:'随机组卷';
   const row=create('article','saved-exam-row');const stamp=h.submittedAt?new Date(h.submittedAt).toLocaleString('zh-CN',{hour12:false}):'早期保存记录';
   row.append(create('h4','',name+' · '+title),create('p','',`${stamp} · ${h.report.score} / ${h.report.maxScore} 分 · 用时 ${E.duration(h.elapsedMs)}`),create('p','',`本场答错 ${h.mistakes.length-h.report.unanswered} 题 · 未答 ${h.report.unanswered} 题`));
   const details=create('details','saved-score-detail'),summary=create('summary','','查看成绩总结'),report=create('section','saved-score-report');
   report.append(create('div','eyebrow','历史模拟考试 · 已交卷'),create('h2','',`${h.report.score} / ${h.report.maxScore} 分`),create('p','',`答对 ${h.report.correct} / ${h.queue.length} 题 · 已作答 ${h.report.answered} 题 · 未作答 ${h.report.unanswered} 题`),create('p','',`考试用时 ${E.duration(h.elapsedMs)}`));
   for(const type of ['judge','single','multiple']){const t=h.report.byType[type];if(t)report.append(create('p','',`${TYPE[type]}：${t.score} / ${t.maxScore} 分（答对 ${t.correct} / ${t.count} 题，正确率 ${Math.round(t.correct/t.count*100)}%）`));}
   const weak=Object.entries(h.report.byType).sort((a,b)=>a[1].score/a[1].maxScore-b[1].score/b[1].maxScore)[0];report.append(create('p','muted',!h.mistakes.length?'本场全部答对！':`本场建议重点巩固${TYPE[weak[0]]}；可通过下方按钮重新练习本场错题与未答题。`));
   details.append(summary,report);row.append(details);
   if(h.mistakes.length){const button=create('button','secondary-button',`查看本场错题（${h.mistakes.length} 题，含未答）`);button.type='button';button.addEventListener('click',()=>startExamReview(h.mistakes,h.answers));row.append(button);}else row.append(create('p','muted','本场全部答对。'));
   list.append(row);
  }
  $('exam-history-more').hidden=history.length<=examHistoryLimit;
 }
 function renderExamReviewTools(){
  const review=state.mode==='examReview',browse=browsingExamMistakes();$('exam-review-tools').hidden=!review;$('redo-exam-mistakes').hidden=!browse||!queue.length;
  $('exam-review-phase').textContent=browse?'考试错题回顾':'正在重做错题';$('exam-review-help').textContent=browse?'先查看原考试作答、正确答案和解析；准备好后点击「重做错题」，本组题目会隐藏答案，从第一题重新开始。':'已隐藏原考试答案。作答后显示解析；本轮全部作答后统一移除答对的错题。';
  $('restart-set').hidden=browse;if(browse){$('round-status').textContent='考试错题回顾';$('round-detail').textContent=`共 ${queue.length} 题 · 查看答案不会改变成绩、刷题遍数或错题状态。`;}
 }
 function redoExamMistakes(){
  if(!browsingExamMistakes()||!queue.length)return;const p=state.practice;p.examReviewPhase='retry';p.records={};p.drafts={};p.completed=false;delete p.wrongSettled;delete p.wrongRemoved;p.round=++roundInfo().started;go(queue[0]);toast('已开始重做，作答后才显示答案和解析。');
 }
 function startExamReview(ids,originalAnswers){
  ids=[...new Set(ids)].filter(id=>lookup.has(id));if(!ids.length){toast('这里暂时没有考试错题。');return;}const answers={};if(originalAnswers)for(const id of ids)answers[id]=(originalAnswers[id]||[]).slice();else if(state.mode==='exam'&&state.practice?.submitted)for(const id of ids)answers[id]=(state.practice.examAnswers[id]||[]).slice();else for(const h of savedExams())for(const id of ids)if(!Object.prototype.hasOwnProperty.call(answers,id)&&h.report.results[id]&&!h.report.results[id].correct)answers[id]=h.report.results[id].selected.slice();
  for(const id of ids)if(!Object.prototype.hasOwnProperty.call(answers,id)){const g=state.globalExamGroups[E.questionGroup(lookup.get(id))];answers[id]=(g?.results?.[id]?.selected||[]).slice();}
  syncTimer();if(state.practice?.key)state.practices[state.practice.key]=state.practice;state.examReviewIds=ids.slice();state.mode='examReview';if(banks.some(b=>b.id===state.practiceBank))state.bank=state.practiceBank;refreshBankOptions();const key=practiceKey();state.practice={key,queue:ids.slice(),current:ids[0],records:{},drafts:{},optionOrders:{},examAnswers:answers,examReviewPhase:'browse',round:0,completed:false};state.practices[key]=state.practice;buildQueue();$('question-index').scrollIntoView({block:'start',behavior:'smooth'});
 }
 function syncTimer(){
  const now=Date.now();if(timerAnchor!==null&&timerPractice)timerPractice.elapsedMs=Math.min(31536000000,(Number(timerPractice.elapsedMs)||0)+Math.max(0,now-timerAnchor));
  const p=state.practice,active=!timerSuspended&&!document.hidden&&state.mode==='exam'&&examReady&&p?.key===practiceKey()&&!p.submitted&&p.queue?.length;
  timerPractice=active?p:null;timerAnchor=active?now:null;
 }
 function initTimer(){
  window.setInterval?.(()=>{syncTimer();if(state.mode==='exam'&&examReady)$('exam-timer').textContent=`${state.practice?.submitted?'考试用时':'用时'} ${E.duration(state.practice?.elapsedMs)}`;if(timerPractice&&++timerSaves%5===0)save();},1000);
  document.addEventListener?.('visibilitychange',()=>{syncTimer();save();});
  window.addEventListener?.('pagehide',()=>{timerSuspended=true;save();});window.addEventListener?.('pageshow',()=>{timerSuspended=false;syncTimer();});
 }
 let pendingRestore=null;
 function initLearning(){
  $('redo-exam-mistakes').addEventListener('click',redoExamMistakes);
  $('exam-wrong-12').addEventListener('click',()=>startExamReview(savedExamMistakes('12')));$('exam-wrong-34').addEventListener('click',()=>startExamReview(savedExamMistakes('34')));$('exam-history-more').addEventListener('click',()=>{examHistoryLimit+=10;renderSavedExams();});
  $('exam-start-12').addEventListener('click',()=>startExamGroup('12'));$('exam-start-34').addEventListener('click',()=>startExamGroup('34'));$('change-exam-group').addEventListener('click',()=>{syncTimer();examReady=false;buildQueue();$('exam-entry').scrollIntoView({block:'start',behavior:'smooth'});});
  $('exam-kind').addEventListener('change',()=>{if(!examReady||!['paper','global'].includes($('exam-kind').value))return;syncTimer();state.examKind=$('exam-kind').value;state.examKinds[state.examGroup]=state.examKind;buildQueue();});$('new-exam-cycle').addEventListener('click',()=>{if(!examReady||!globalExam()||!globalPlan().shortages.length||(!state.practice.submitted&&queue.length))return;examLedger().cycle++;examLedger().cycleResults={};syncTimer();createGlobalExam();render();save();toast('已开始新一轮，累计覆盖和历史成绩已保留。');});
  $('mode-picker').addEventListener('change',()=>selectMode($('mode-picker').value));$('overview-button').addEventListener('click',()=>{$('paper-overview').open=true;$('paper-overview').scrollIntoView({block:'start',behavior:'smooth'});});
  $('uncertain-button').addEventListener('click',toggleUncertain);$('mobile-uncertain').addEventListener('click',toggleUncertain);$('mobile-star').addEventListener('click',toggleStar);$('mobile-prev').addEventListener('click',()=>{const i=queue.indexOf(current);if(i>0)go(queue[i-1]);});$('mobile-next').addEventListener('click',()=>{if(browsingExamMistakes()&&queue.indexOf(current)===queue.length-1){redoExamMistakes();return;}if(wrongFinished()){if(remainingWrongIds().length)buildQueue();return;}const q=lookup.get(current);if(state.mode!=='exam'&&q?.type==='multiple'&&!getRecord(q))submit();else next();});
  $('exam-submit').addEventListener('click',confirmExam);$('close-exam').addEventListener('click',()=>$('exam-dialog').close());$('confirm-exam').addEventListener('click',finishExam);
  $('backup-button').addEventListener('click',()=>{$('backup-dialog').showModal();});$('close-backup').addEventListener('click',()=>$('backup-dialog').close());
  $('export-backup').addEventListener('click',()=>{save();const blob=new Blob([JSON.stringify(E.createBackup(state),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`导游刷题-进度备份-${E.localDay()}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已生成备份文件，请保存在手机「文件」或电脑中。');});
  $('import-backup').addEventListener('change',async()=>{pendingRestore=null;$('restore-backup').disabled=true;const file=$('import-backup').files?.[0];if(!file)return;try{if(file.size>10*1024*1024)throw new Error('文件超过 10 MB，请选择本站导出的进度备份。');const raw=JSON.parse(await file.text());pendingRestore=E.validateBackup(raw,all);$('backup-preview').textContent=`已校验：${Object.keys(pendingRestore.records).length} 道历史记录、${pendingRestore.wrong.length} 道错题、${pendingRestore.starred.length} 道收藏。点击恢复会替换本机进度。`;$('restore-backup').disabled=false;}catch(error){$('backup-preview').textContent=error instanceof SyntaxError?'文件不是有效的 JSON 备份。':error.message;}});
  $('restore-backup').addEventListener('click',()=>{if(!pendingRestore)return;state=pendingRestore;pendingRestore=null;examReady=false;rebuild();refreshBankOptions();buildQueue(true);$('restore-backup').disabled=true;$('backup-dialog').close();toast('备份已恢复，题库和标准答案保持原文不变。');});
 }

 document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>selectMode(button.dataset.mode)));
 $('bank-filter').addEventListener('change',()=>{if(!banks.some(b=>b.id===$('bank-filter').value&&(state.mode!=='exam'||examReady&&E.questionGroup(b.questions[0])===state.examGroup)))return;state.bank=$('bank-filter').value;if(state.mode==='exam')state.examBanks[state.examGroup]=state.bank;buildQueue();});
 $('submit-multiple').addEventListener('click',submit);
 $('retry-button').addEventListener('click',()=>{if(!state.practice||wrongFinished())return;delete state.practice.records[current];delete state.practice.drafts[current];selection=[];render();save();});
 $('restart-set').addEventListener('click',restart);$('continue-wrong').addEventListener('click',()=>{if(wrongFinished())buildQueue();});

 $('star-button').addEventListener('click',toggleStar);
 $('grid-prev').addEventListener('click',()=>{gridPage--;renderGrid();});$('grid-next').addEventListener('click',()=>{gridPage++;renderGrid();});
 $('back-all').addEventListener('click',()=>selectMode('all'));
 $('manage-button').addEventListener('click',manage);$('bank-info-top').addEventListener('click',manage);$('close-manage').addEventListener('click',()=>$('manage-dialog').close());
 initLearning();initTimer();rebuild();refreshBankOptions();buildQueue(true);if(storageProblem)toast('部分本机历史数据未能读取，现有文件未被删除。');
})();

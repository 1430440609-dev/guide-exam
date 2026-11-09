(() => {
 'use strict';
 const $=id=>document.getElementById(id),E=GuideEngine;
 const KEY='guide-study-v1';
 const TYPE={judge:'判断题',single:'单选题',multiple:'多选题'};
 const MODE={all:'顺序练习',random:'随机练习',wrong:'我的错题',starred:'收藏题目'};
 const bankRank=b=>[Number(b.title.match(/\d+/)?.[0]||999),b.questions.some(q=>q.exam==='科目一'||q.exam==='科目二')?0:1];
 const banks=(window.GUIDE_BANKS||[window.GUIDE_BANK]).map(E.validateBank).sort((a,b)=>{const av=bankRank(a),bv=bankRank(b);return av[0]-bv[0]||av[1]-bv[1];});
 let all=[],lookup=new Map(),queue=[],current='',selection=[],gridPage=0,toastTimer;
 let state={records:{},drafts:{},wrong:[],starred:[],current:'',mode:'all',exam:'all',type:'all',bank:'all',practice:null,practices:{},modeFilters:{},rounds:{},wrongEvents:{},wrongSerial:0};
 let storageProblem=false;
 try{const raw=JSON.parse(localStorage.getItem(KEY));if(raw&&raw.records&&typeof raw.records==='object'&&!Array.isArray(raw.records)&&Array.isArray(raw.wrong)&&Array.isArray(raw.starred))state={...state,...raw};}catch{storageProblem=true;}
 if(!MODE[state.mode])state.mode='all';if(!['all','科目一','科目二','科目三','科目四'].includes(state.exam))state.exam='all';if(!['all','judge','single','multiple'].includes(state.type))state.type='all';
 if(!state.drafts||typeof state.drafts!=='object'||Array.isArray(state.drafts))state.drafts={};
 if(!state.rounds||typeof state.rounds!=='object'||Array.isArray(state.rounds))state.rounds={};
 if(!state.practices||typeof state.practices!=='object'||Array.isArray(state.practices))state.practices={};
 if(!state.modeFilters||typeof state.modeFilters!=='object'||Array.isArray(state.modeFilters))state.modeFilters={};
 if(!state.wrongEvents||typeof state.wrongEvents!=='object'||Array.isArray(state.wrongEvents))state.wrongEvents={};
 if(!Number.isSafeInteger(state.wrongSerial)||state.wrongSerial<0)state.wrongSerial=0;
 function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3200);}
 function save(){if(state.practice?.key)state.practices[state.practice.key]=state.practice;state.modeFilters[state.mode]={exam:state.exam,type:state.type,bank:state.bank};try{localStorage.setItem(KEY,JSON.stringify(state));$('save-indicator').textContent=storageProblem?'部分历史数据未能读取':'进度已保存到当前浏览器';}catch{$('save-indicator').textContent='保存失败，请勿清除或关闭页面';toast('浏览器存储空间不足，当前进度暂时无法保存。');}}
 function validRecord(q,r){return r&&Array.isArray(r.selected)&&r.selected.length&&r.selected.every(k=>q.options.some(o=>o.key===k))&&typeof r.correct==='boolean'?r:null;}
 function getRecord(q){return validRecord(q,state.practice?.records?.[q.id]);}
 function readDraft(id){const q=lookup.get(id),draft=state.practice?.drafts?.[id];return q&&q.type==='multiple'&&!getRecord(q)&&Array.isArray(draft)?[...new Set(draft.filter(k=>q.options.some(o=>o.key===k)))]:[];}
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
  practice.wrongRemoved=before-state.wrong.length;practice.wrongSettled=true;
 }
 function wrongFinished(){return state.mode==='wrong'&&state.practice?.completed&&state.practice.wrongSettled;}
 function remainingWrongIds(){return all.filter(q=>matches(q)&&state.wrong.includes(q.id)).sort((a,b)=>a.number-b.number).map(q=>q.id);}
 function buildQueue(restoreLegacy=false){
  if(state.practice?.key)state.practices[state.practice.key]=state.practice;
  const key=practiceKey(),saved=state.practices[key],previous=saved||priorPractice(),round=roundInfo();
  if(state.mode==='wrong'&&previous?.completed&&Array.isArray(previous.queue)&&previous.records)settleWrongRound(previous);
  const usable=!(state.mode==='wrong'&&previous?.completed)&&previous&&Array.isArray(previous.queue)&&previous.records&&typeof previous.records==='object'&&previous.drafts&&typeof previous.drafts==='object';
  const eligible=all.filter(q=>matches(q)&&(state.mode!=='wrong'||state.wrong.includes(q.id))&&(state.mode!=='starred'||state.starred.includes(q.id))).sort((a,b)=>a.number-b.number).map(q=>q.id);
  if(usable){
   const kept=[...new Set(previous.queue)].filter(id=>lookup.has(id)&&matches(lookup.get(id)));
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
 function completeRound(){const finished=queue.length>0&&queue.every(id=>getRecord(lookup.get(id)));let completed=false;if(finished&&!state.practice.completed){state.practice.completed=true;roundInfo().completed++;completed=true;}if(finished&&state.mode==='wrong')settleWrongRound(state.practice);return completed;}
 function stats(){const records=all.map(q=>validRecord(q,state.records[q.id])).filter(Boolean),right=records.filter(r=>r.correct).length;$('stat-total').textContent=all.length;$('stat-done').textContent=records.length;$('stat-rate').textContent=records.length?Math.round(right/records.length*100)+'%':'—';$('stat-wrong').textContent=state.wrong.length;$('wrong-badge').textContent=state.wrong.filter(id=>lookup.get(id)?.bankId===state.bank).length;$('star-badge').textContent=state.starred.filter(id=>lookup.get(id)?.bankId===state.bank).length;const round=roundInfo();$('round-status').textContent=queue.length?`正在刷第 ${state.practice.round} 遍 · 已完整刷完 ${round.completed} 遍`:`已完整刷完 ${round.completed} 遍`;$('round-detail').textContent=queue.length?`${banks.find(b=>b.id===state.bank)?.title} · ${queue.length} 题${state.practice.completed&&queue.every(id=>getRecord(lookup.get(id)))?' · 本轮已完成':''}。完整作答才计为刷完一遍。`:'本套试卷暂无符合条件的题目。';$('restart-set').disabled=!queue.length||(wrongFinished()&&!remainingWrongIds().length);}
 function updateControls(){document.querySelectorAll('[data-mode]').forEach(button=>{button.classList.toggle('active',button.dataset.mode===state.mode);button.setAttribute('aria-current',button.dataset.mode===state.mode?'page':'false');});$('page-name').textContent=MODE[state.mode];$('bank-filter').value=state.bank;$('paper-tip').textContent=state.mode==='random'?'分题型乱序：判断 1–40、单选 41–130、多选 131–165。判断题对／错选项不变，仅单选和多选打乱选项。':state.mode==='wrong'||state.mode==='starred'?(state.mode==='wrong'?'本轮错题全部作答后，统一移除答对的题；顺序和随机练习新答错的题会自动加入。':'仅练习当前试卷中的收藏；切换试卷会保留各自进度。'):'按本套文档原题号练习，每套 165 题，不按科目或题型拆分。';}
 function create(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
 function fillResult(container,q,record){
  container.replaceChildren();
  const heading=create('div','result-heading'+(record.correct?'':' wrong'));
  heading.append(create('span','result-icon',record.correct?'✓':'×'));
  const title=create('div'),resultTitle=create('h2','',record.correct?'回答正确，继续保持':'这道题，再记牢一点');resultTitle.tabIndex=-1;title.append(resultTitle,create('p','',record.correct?'又掌握了一个知识点。':'读一遍解析，下次就会更有把握。'));heading.append(title);container.append(heading);
  const answers=create('div','result-answer');
  const shown=layout(q);
  const show=keys=>shown.filter(o=>keys.includes(o.key)).map(o=>o.label+(q.type==='judge'?'（'+o.text+'）':'')).join('、');
  for(const [label,value] of [['你的答案',show(record.selected)],['正确答案',show(q.answer)]]){const line=create('span','',label);line.append(create('strong','',value));answers.append(line);}container.append(answers);
  if(state.mode==='random'&&q.type!=='judge'){const mapping=create('div','random-answer-map');mapping.append(create('p','',`原文参考答案：${q.type==='judge'?q.answer.map(k=>q.options.find(o=>o.key===k).text).join('、'):q.answer.slice().sort().join('、')}。原文解析中的字母按下方对照阅读。`),create('p','',shown.map(o=>`本页 ${o.label} = 原文 ${o.key}`).join('；')));container.append(mapping);}
  const section=create('section','result-section');section.append(create('h3','','原文解析'),create('p','',q.explanation));container.append(section);
  if(q.answerNote)container.append(create('p','answer-note',q.answerNote));
  if(q.notes){const details=create('details','original-notes');details.append(create('summary','','展开原文补充笔记'),create('p','',q.notes));container.append(details);}
  if(q.topic)container.append(create('p','result-topic','考查点 · '+q.topic));
 }
 function renderGrid(){
  const done=queue.filter(id=>getRecord(lookup.get(id))).length,nav=wrongFinished()?remainingWrongIds():queue;
  $('nav-count').textContent=wrongFinished()?'待重练 '+nav.length+' 题':nav.length+' 题';$('session-count').textContent=done+' / '+queue.length;$('session-fill').style.width=(queue.length?done/queue.length*100:0)+'%';
  const pages=Math.max(1,Math.ceil(nav.length/40));gridPage=Math.min(Math.max(0,gridPage),pages-1);$('grid-page').textContent=(gridPage+1)+' / '+pages;$('grid-prev').disabled=gridPage===0;$('grid-next').disabled=gridPage>=pages-1;
  $('question-grid').replaceChildren();nav.slice(gridPage*40,gridPage*40+40).forEach((id,i)=>{const q=lookup.get(id),r=getRecord(q),button=create('button',(r?(r.correct?'right':'wrong'):'')+(id===current?' current':''),gridPage*40+i+1);button.type='button';button.setAttribute('aria-label',`第 ${gridPage*40+i+1} 题，原题 ${q.number}，${r?(r.correct?'已答对':'已答错'):'未作答'}`);if(id===current)button.setAttribute('aria-current','true');button.addEventListener('click',()=>{if(wrongFinished())buildQueue();go(id);});$('question-grid').append(button);});
 }
 function render(){
  stats();updateControls();renderGrid();$('wrong-summary').hidden=!wrongFinished();$('continue-wrong').hidden=!wrongFinished()||!remainingWrongIds().length;if(wrongFinished())$('wrong-summary').textContent=`本轮已完成，已移除 ${state.practice.wrongRemoved||0} 道答对题，剩余 ${remainingWrongIds().length} 道错题。`;const q=lookup.get(current);$('question-area').hidden=!q;$('empty').hidden=!!q;$('star-button').hidden=!q;
  if(!q){$('question-type').textContent='练习清单';$('question-exam').hidden=true;$('source-number').textContent='';$('empty-title').textContent=state.mode==='wrong'?'本套暂时没有待巩固的错题':state.mode==='starred'?'本套还没有收藏的题目':'没有匹配的题目';$('empty-text').textContent=state.mode==='wrong'?'顺序和随机练习答错的题会收录到这里；本轮错题全部作答后，答对的题会统一移出。':state.mode==='starred'?'练习时点击题目右上角的星标，就能在这里找到它。':'试试选择其他试卷或练习方式。';return;}
  const r=getRecord(q),position=queue.indexOf(current);$('question-type').textContent=TYPE[q.type];$('question-exam').hidden=false;$('question-exam').textContent=q.exam;$('source-number').textContent='原题 '+q.number;$('question-index').textContent=wrongFinished()?'本轮最后一题 · 结果回顾':'QUESTION '+String(position+1).padStart(2,'0')+' / '+queue.length;$('stem').textContent=q.stem;$('question-tip').textContent=r?'已提交 · 可查看本题答案和解析':q.type==='multiple'?'多选题 · 可选择多个选项，选好后点击「提交答案」。':'请选择一个答案，选择后立即显示正确答案与解析。';
  $('star-button').textContent=state.starred.includes(q.id)?'★':'☆';$('star-button').setAttribute('aria-label',state.starred.includes(q.id)?'取消收藏本题':'收藏本题');$('star-button').setAttribute('aria-pressed',String(state.starred.includes(q.id)));
  $('options').replaceChildren();for(const option of layout(q)){const button=create('button','option');button.type='button';button.setAttribute('aria-label',option.label+'，'+option.text);button.setAttribute('aria-pressed',String((r?r.selected:selection).includes(option.key)));button.append(create('span','option-letter',option.label),create('span','option-text',option.text));if((r?r.selected:selection).includes(option.key))button.classList.add('selected');if(r){button.disabled=true;if(q.answer.includes(option.key))button.classList.add('correct');else if(r.selected.includes(option.key))button.classList.add('incorrect');}button.addEventListener('click',()=>choose(option.key));$('options').append(button);}
  $('submit-multiple').hidden=q.type!=='multiple'||!!r;$('submit-multiple').disabled=!selection.length;$('retry-button').hidden=!r||wrongFinished();$('inline-result').hidden=!r;if(r)fillResult($('inline-result'),q,r);else $('inline-result').replaceChildren();$('prev-button').disabled=$('quick-prev').disabled=position<=0||wrongFinished();$('next-button').disabled=$('quick-next').disabled=position>=queue.length-1||wrongFinished();$('source-line').textContent='题目来源 · '+q.source;
 }
 function choose(key){const q=lookup.get(current);if(!q||getRecord(q))return;if(q.type==='multiple'){selection=selection.includes(key)?selection.filter(k=>k!==key):[...selection,key];state.practice.drafts[q.id]=selection.slice();render();save();$('options').children[layout(q).findIndex(o=>o.key===key)]?.focus({preventScroll:true});}else{selection=[key];submit();}}
 function submit(){const q=lookup.get(current);if(!q||!selection.length||getRecord(q))return;const record={selected:selection.slice(),correct:E.exactMatch(selection,q.answer),at:Date.now()};if(!record.correct)state.wrongEvents[q.id]=++state.wrongSerial;record.wrongVersion=state.wrongEvents[q.id]||0;state.records[q.id]=record;state.practice.records[q.id]=record;delete state.practice.drafts[q.id];delete state.drafts[q.id];if(!record.correct&&!state.wrong.includes(q.id))state.wrong.push(q.id);const completed=completeRound();save();render();if(completed)toast(wrongFinished()?`本轮错题已完成，已移除 ${state.practice.wrongRemoved||0} 道答对题，剩余 ${remainingWrongIds().length} 道。`:`本套题目已完整刷完 ${roundInfo().completed} 遍，可点击「重新刷本套题目」继续。`);const heading=$('inline-result').querySelector('h2');heading?.focus({preventScroll:true});heading?.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
 function go(id){if(!queue.includes(id)||wrongFinished())return;current=id;state.current=id;state.practice.current=id;selection=readDraft(id);gridPage=Math.floor(queue.indexOf(id)/40);render();save();}
 function restart(){if(wrongFinished()){buildQueue();return;}if(!queue.length)return;if(state.mode==='random')queue=randomOrder(queue,true);const round=roundInfo();round.started++;state.practice={key:practiceKey(),queue:queue.slice(),records:{},drafts:{},current:queue[0],round:round.started,completed:false,optionOrders:{}};go(queue[0]);toast('已开始新一遍，答案将在重新作答后显示。');}
 function next(){if(wrongFinished())return;const index=queue.indexOf(current);if(index<queue.length-1)go(queue[index+1]);else toast('本组已到最后一题，可以查看答题卡或切换题型继续练习。');}
 function refreshBankOptions(){$('bank-filter').replaceChildren();for(const bank of banks)$('bank-filter').append(new Option(bank.title,bank.id));}
 function renderBanks(){$('bank-list').replaceChildren();for(const bank of banks){const row=create('div','bank-row'),text=create('div');text.append(create('strong','',bank.title),create('p','',`${bank.questions.length} 道题 · 判断 ${bank.questions.filter(q=>q.type==='judge').length} / 单选 ${bank.questions.filter(q=>q.type==='single').length} / 多选 ${bank.questions.filter(q=>q.type==='multiple').length}`));row.append(text,create('span','','共享题库'));$('bank-list').append(row);}}
 function manage(){renderBanks();$('manage-dialog').showModal();}
 document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{if(state.mode===button.dataset.mode)return;state.mode=button.dataset.mode;buildQueue();}));
 $('bank-filter').addEventListener('change',()=>{if(!banks.some(b=>b.id===$('bank-filter').value))return;state.bank=$('bank-filter').value;buildQueue();});
 $('prev-button').addEventListener('click',()=>{const i=queue.indexOf(current);if(i>0)go(queue[i-1]);});$('next-button').addEventListener('click',next);$('submit-multiple').addEventListener('click',submit);
 $('retry-button').addEventListener('click',()=>{if(wrongFinished())return;delete state.practice.records[current];delete state.practice.drafts[current];selection=[];render();save();});
 $('restart-set').addEventListener('click',restart);$('continue-wrong').addEventListener('click',()=>{if(wrongFinished())buildQueue();});
 $('quick-prev').addEventListener('click',()=>{const i=queue.indexOf(current);if(i>0)go(queue[i-1]);});$('quick-next').addEventListener('click',next);
 $('star-button').addEventListener('click',()=>{if(!current)return;state.starred=state.starred.includes(current)?state.starred.filter(id=>id!==current):[...state.starred,current];render();save();});
 $('grid-prev').addEventListener('click',()=>{gridPage--;renderGrid();});$('grid-next').addEventListener('click',()=>{gridPage++;renderGrid();});
 $('back-all').addEventListener('click',()=>{state.mode='all';buildQueue();});
 $('manage-button').addEventListener('click',manage);$('bank-info-top').addEventListener('click',manage);$('close-manage').addEventListener('click',()=>$('manage-dialog').close());
 rebuild();refreshBankOptions();buildQueue(true);if(storageProblem)toast('部分本机历史数据未能读取，现有文件未被删除。');
})();

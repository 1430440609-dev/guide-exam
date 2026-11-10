(function (root) {
  'use strict';
  const clean = value => String(value).replace(/([\u3400-\u9fff]) +(?=[\u3400-\u9fff])/g, '$1').replace(/[ \t]+/g, ' ').trim();
  const fingerprint = q => [q.type, q.stem.replace(/\s/g,''), ...q.options.map(o=>o.key+o.text.replace(/\s/g,''))].join('|');
  const exactMatch = (selected, correct) => selected.length === correct.length && [...new Set(selected)].length === selected.length && selected.every(key=>correct.includes(key));
  function hash(value) {let h=2166136261;for (let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
  function validateBank(input) {
    if (!input || !Array.isArray(input.questions) || !input.questions.length || input.questions.length>5000) throw new Error('题库需要包含 1–5000 道题目。');
    const ids=new Set();
    const questions=input.questions.map((raw,i)=>{
      const name=`第 ${i+1} 道题`;
      if (!raw || !['judge','single','multiple'].includes(raw.type) || typeof raw.stem!=='string' || !raw.stem.trim()) throw new Error(`${name}的题型或题干不完整。`);
      if (!Array.isArray(raw.options) || raw.options.length<2 || raw.options.length>8 || raw.options.some(o=>!o || typeof o.key!=='string' || !/^[A-H]$/.test(o.key) || typeof o.text!=='string' || !o.text.trim()) || new Set(raw.options.map(o=>o.key)).size!==raw.options.length) throw new Error(`${name}的选项不完整或存在重复。`);
      if (!Array.isArray(raw.answer) || !raw.answer.length || new Set(raw.answer).size!==raw.answer.length || raw.answer.some(key=>!raw.options.some(o=>o.key===key)) || (raw.type!=='multiple' && raw.answer.length!==1)) throw new Error(`${name}的答案与选项不匹配。`);
      if(raw.type==='judge' && raw.options.length!==2)throw new Error(`${name}的判断题必须有两个选项。`);
      const id=typeof raw.id==='string'&&raw.id?raw.id:'q-'+hash(fingerprint(raw));
      if(ids.has(id))throw new Error(`${name}的编号重复。`);ids.add(id);
      return {id,number:Number(raw.number)||i+1,type:raw.type,exam:['科目一','科目二','科目三','科目四','科一科二','科三科四'].includes(raw.exam)?raw.exam:'科目三',stem:raw.stem.trim(),options:raw.options.map(o=>({key:o.key,text:o.text.trim()})),answer:raw.answer.slice(),explanation:typeof raw.explanation==='string'?raw.explanation:'原题库未提供解析。',notes:typeof raw.notes==='string'?raw.notes:'',topic:typeof raw.topic==='string'?raw.topic:'',source:typeof raw.source==='string'?raw.source:String(input.title||'导入题库'),answerNote:typeof raw.answerNote==='string'?raw.answerNote:''};
    });
    return {schemaVersion:1,id:String(input.id||'bank-'+hash(questions.map(fingerprint).join('\n'))),title:typeof input.title==='string'&&input.title.trim()?input.title.trim():'新导入题库',source:String(input.source||''),questions};
  }
  function parseText(text,title='新导入题库') {
    const pattern=/(\d+)\s*[.．、]\s*[（(]\s*(判断|单\s*选|多\s*选)\s*题\s*[)）]/g;
    const matches=[...text.matchAll(pattern)];
    if(!matches.length)throw new Error('没有识别到题目。请使用含“1. (单选题)”“【参考答案】”“【解析】”标记的文档，或导入 JSON 题库。');
    const questions=matches.map((m,i)=>{
      const type=m[2].replace(/\s/g,'')==='判断'?'judge':m[2].replace(/\s/g,'')==='单选'?'single':'multiple';
      const body=text.slice(m.index+m[0].length,matches[i+1]?.index??text.length).replace(/\n[一二三]、(?:判断|单\s*选|多\s*选)\s*题\s*$/,'').trim();
      const boundary=body.search(/【(?:参考答案|解析)】/);
      const firstPart=body.slice(0,boundary<0?undefined:boundary);
      const marks=[...firstPart.matchAll(/(?:^|\n|\s)([A-H])\s*[.．、]\s*/g)];
      const rawAnswer=body.match(/【参考答案】\s*([A-H对错正确错误\s]+)/)?.[1]?.trim()??'';
      const answer=type==='judge'?(/^(对|正确)/.test(rawAnswer)?['A']:/^(错|错误)/.test(rawAnswer)?['B']:[]):[...new Set(rawAnswer.match(/[A-H]/g)??[])];
      const chunks=(body.split('【解析】')[1]?.split('【考查点】')[0]?.trim()??'').split(/\n\s*\n/).map(clean).filter(Boolean);
      const topic=clean(body.match(/【考查点】([\s\S]*?)$/)?.[1]??'');
      return {id:'q-'+hash(title+'|'+m[1]+'|'+firstPart),number:Number(m[1]),type,exam:topic.replace(/\s/g,'').match(/科目[一二三四]/)?.[0]||'科目三',stem:clean(firstPart.slice(0,marks[0]?.index??firstPart.length)),options:type==='judge'?[{key:'A',text:'对'},{key:'B',text:'错'}]:marks.map((o,j)=>({key:o[1],text:clean(firstPart.slice(o.index+o[0].length,marks[j+1]?.index??firstPart.length))})),answer,explanation:chunks[0]||'原题库未提供解析。',notes:chunks.slice(1).join('\n\n'),topic,source:title};
    });
    return validateBank({title,questions});
  }
  function mergeBanks(banks){const seen=new Set(),ids=new Set(),questions=[];for(const bank of banks)for(const q of bank.questions){const key=bank.id+'|'+q.id;if(seen.has(key))continue;seen.add(key);let id=q.id;if(ids.has(id))id=bank.id+'-'+id;if(ids.has(id))id+='-'+hash(key);ids.add(id);questions.push({...q,id,bankId:bank.id});}return questions;}
  function shuffled(items,random=Math.random){const result=items.slice();for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
  function optionLayout(q,order){
    const keys=q.options.map(o=>o.key);
    const valid=Array.isArray(order)&&order.length===keys.length&&new Set(order).size===keys.length&&order.every(k=>keys.includes(k));
    return (valid?order:keys).map((key,i)=>({...q.options.find(o=>o.key===key),label:String.fromCharCode(65+i)}));
  }
  const weights={judge:0.5,single:0.5,multiple:1};
  function gradeAttempt(q,selected){const keys=Array.isArray(selected)?selected:[];const valid=keys.every(k=>q.options.some(o=>o.key===k))&&new Set(keys).size===keys.length&&(q.type==='multiple'||keys.length<=1);const correct=valid&&exactMatch(keys,q.answer);return{selected:keys.slice(),correct,points:correct?weights[q.type]:0,maxPoints:weights[q.type]};}
  function scoreExam(questions,answers={}){const report={score:0,maxScore:0,answered:0,correct:0,unanswered:0,byType:{},results:{}};for(const q of questions){const r=gradeAttempt(q,answers[q.id]);report.results[q.id]=r;report.score+=r.points;report.maxScore+=r.maxPoints;report.answered+=r.selected.length?1:0;report.correct+=r.correct?1:0;const t=report.byType[q.type]||(report.byType[q.type]={count:0,correct:0,score:0,maxScore:0});t.count++;t.correct+=r.correct?1:0;t.score+=r.points;t.maxScore+=r.maxPoints;}report.unanswered=questions.length-report.answered;return report;}
  function localDay(date=new Date()){return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');}
  function nextReview(previous,correct,day=localDay()){const stage=previous?.stage||0;if(correct&&stage>=3)return null;const [y,m,d]=day.split('-').map(Number),gap=correct?[1,3,7][stage]:1;return{stage:correct?stage+1:0,due:localDay(new Date(y,m-1,d+gap))};}
  function createBackup(state){return{format:'guide-study-backup',version:1,createdAt:new Date().toISOString(),state:JSON.parse(JSON.stringify(state))};}
  function validateBackup(input,questions){
    const obj=x=>x&&typeof x==='object'&&!Array.isArray(x),fail=()=>{throw new Error('备份格式不完整或包含无效作答，请选择本站导出的 JSON 备份。');};
    if(!obj(input)||input.format!=='guide-study-backup'||input.version!==1||!obj(input.state))fail();const s=input.state,map=new Map(questions.map(q=>[q.id,q])),modes=['all','random','wrong','starred','uncertain','review','exam'];
    if(!obj(s.records)||!Array.isArray(s.wrong)||!Array.isArray(s.starred))fail();
    const ids=items=>{if(!Array.isArray(items))fail();if(items.some(id=>!map.has(id)))throw new Error('备份含当前题库未找到的题目，请先刷新网站后重试。');return [...new Set(items)];};
    const selected=(id,keys)=>{const q=map.get(id);if(!q||!Array.isArray(keys)||keys.some(k=>!q.options.some(o=>o.key===k))||new Set(keys).size!==keys.length||(q.type!=='multiple'&&keys.length>1))fail();return keys.slice();};
    const records=items=>{if(!obj(items))fail();return Object.fromEntries(Object.entries(items).map(([id,r])=>{if(!obj(r))fail();const keys=selected(id,r.selected);return[id,{selected:keys,correct:gradeAttempt(map.get(id),keys).correct,at:Number(r.at)||0,wrongVersion:Number.isSafeInteger(r.wrongVersion)&&r.wrongVersion>=0?r.wrongVersion:0}];}));};
    const choices=items=>{if(!obj(items))fail();return Object.fromEntries(Object.entries(items).map(([id,keys])=>[id,selected(id,keys)]));};
    const keyValid=key=>{let k;try{k=JSON.parse(key);}catch{fail();}if(!Array.isArray(k)||k.length!==4||!modes.includes(k[0])||(k[1]!=='all'&&!questions.some(q=>q.bankId===k[1])))fail();return k;};
    const practice=p=>{if(!obj(p))fail();const k=keyValid(p.key),queue=ids(p.queue);if(k[1]!=='all'&&queue.some(id=>map.get(id).bankId!==k[1]))fail();const orders={};for(const[id,order]of Object.entries(p.optionOrders||{})){const q=map.get(id);if(!q||!Array.isArray(order)||order.length!==q.options.length||new Set(order).size!==order.length||order.some(a=>!q.options.some(o=>o.key===a)))fail();orders[id]=order.slice();}const result={...p,queue,records:records(p.records||{}),drafts:choices(p.drafts||{}),optionOrders:orders,examAnswers:choices(p.examAnswers||{})};if(k[0]==='exam')result.records={};return result;};
    const out={...s,records:records(s.records),drafts:choices(s.drafts||{}),wrong:ids(s.wrong),starred:ids(s.starred),uncertain:ids(s.uncertain||[]),practices:{},rounds:{},reviews:{},wrongEvents:{},lastExams:{},modeFilters:{}};
    if(!modes.includes(out.mode))fail();if(out.bank!=='all'&&!questions.some(q=>q.bankId===out.bank))fail();
    for(const[k,p]of Object.entries(s.practices||{})){keyValid(k);if(p.key!==k)fail();out.practices[k]=practice(p);}out.practice=s.practice?practice(s.practice):null;
    for(const[k,r]of Object.entries(s.rounds||{})){keyValid(k);if(!obj(r)||!Number.isSafeInteger(r.started)||!Number.isSafeInteger(r.completed)||r.started<0||r.completed<0||r.completed>r.started)fail();out.rounds[k]={started:r.started,completed:r.completed};}
    for(const[id,r]of Object.entries(s.reviews||{})){if(!map.has(id)||!obj(r)||!Number.isInteger(r.stage)||r.stage<0||r.stage>3||!/^\d{4}-\d{2}-\d{2}$/.test(r.due)||localDay(new Date(r.due+'T12:00:00'))!==r.due)fail();out.reviews[id]={stage:r.stage,due:r.due};}
    for(const[id,n]of Object.entries(s.wrongEvents||{})){if(!map.has(id)||!Number.isSafeInteger(n)||n<0)fail();out.wrongEvents[id]=n;}
    out.wrongSerial=Math.max(Number.isSafeInteger(s.wrongSerial)?s.wrongSerial:0,0,...Object.values(out.wrongEvents));
    for(const[bank,x]of Object.entries(s.lastExams||{})){if(!questions.some(q=>q.bankId===bank)||!obj(x))fail();const answers=choices(x.answers||{});if(Object.keys(answers).some(id=>map.get(id).bankId!==bank))fail();out.lastExams[bank]={answers,submittedAt:Number(x.submittedAt)||0,round:Number(x.round)||1};}
    if(out.practice){const active=JSON.parse(out.practice.key);if(active[0]!==out.mode||(active[1]!=='all'&&active[1]!==out.bank))fail();}
    return out;
  }
  const api={clean,fingerprint,exactMatch,hash,validateBank,parseText,mergeBanks,shuffled,optionLayout,gradeAttempt,scoreExam,localDay,nextReview,createBackup,validateBackup};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GuideEngine=api;
})(globalThis);

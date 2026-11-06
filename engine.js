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
      return {id,number:Number(raw.number)||i+1,type:raw.type,exam:raw.exam==='科目四'?'科目四':'科目三',stem:raw.stem.trim(),options:raw.options.map(o=>({key:o.key,text:o.text.trim()})),answer:raw.answer.slice(),explanation:typeof raw.explanation==='string'?raw.explanation:'原题库未提供解析。',notes:typeof raw.notes==='string'?raw.notes:'',topic:typeof raw.topic==='string'?raw.topic:'',source:typeof raw.source==='string'?raw.source:String(input.title||'导入题库'),answerNote:typeof raw.answerNote==='string'?raw.answerNote:''};
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
      return {id:'q-'+hash(title+'|'+m[1]+'|'+firstPart),number:Number(m[1]),type,exam:topic.replace(/\s/g,'').includes('科目四')?'科目四':'科目三',stem:clean(firstPart.slice(0,marks[0]?.index??firstPart.length)),options:type==='judge'?[{key:'A',text:'对'},{key:'B',text:'错'}]:marks.map((o,j)=>({key:o[1],text:clean(firstPart.slice(o.index+o[0].length,marks[j+1]?.index??firstPart.length))})),answer,explanation:chunks[0]||'原题库未提供解析。',notes:chunks.slice(1).join('\n\n'),topic,source:title};
    });
    return validateBank({title,questions});
  }
  function mergeBanks(banks){const seen=new Set(),ids=new Set(),questions=[];for(const bank of banks)for(const q of bank.questions){const key=fingerprint(q);if(seen.has(key))continue;seen.add(key);let id=q.id;if(ids.has(id))id=bank.id+'-'+id;if(ids.has(id))id+='-'+hash(key);ids.add(id);questions.push({...q,id,bankId:bank.id});}return questions;}
  const api={clean,fingerprint,exactMatch,hash,validateBank,parseText,mergeBanks};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GuideEngine=api;
})(globalThis);

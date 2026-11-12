/* Gestão de licenças: dados, leitura conservadora e datas sem dependência de DOM.
   A leitura só propõe informações presentes no documento. Toda proposta exige
   conferência; dias úteis e periodicidades não são convertidos em dias corridos. */
(function(root){
'use strict';
const DAY=86400000,STATUSES=['pending','in_progress','completed','not_applicable'];
const MODES=['date','relative','continuous','undefined'],UNITS=['days','months','years'];
const ANCHORS=['issuedOn','receivedOn','manual'];
const str=value=>value==null?'':String(value);
const fold=value=>str(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const choice=(value,list,fallback)=>list.includes(value)?value:fallback;
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);
function validDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const y=Number(value.slice(0,4)),m=Number(value.slice(5,7)),d=Number(value.slice(8,10));
  if(y<1||y>9999||m<1||m>12||d<1)return false;
  return d<=daysInMonth(y,m);
}
function daysInMonth(y,m){return [31,(y%4===0&&(y%100!==0||y%400===0))?29:28,31,30,31,30,31,31,30,31,30,31][m-1]||0;}
function serial(iso){const d=new Date(0);d.setUTCHours(0,0,0,0);d.setUTCFullYear(Number(iso.slice(0,4)),Number(iso.slice(5,7))-1,Number(iso.slice(8,10)));return d.getTime();}
function fromSerial(ms){const d=new Date(ms),y=d.getUTCFullYear();if(!Number.isFinite(ms)||y<1||y>9999)return '';return `${String(y).padStart(4,'0')}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;}
function localToday(){const d=new Date();return `${String(d.getFullYear()).padStart(4,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function daysBetween(from,to){return validDate(from)&&validDate(to)?Math.round((serial(to)-serial(from))/DAY):null;}
function addCalendar(iso,offset,unit){
  if(!validDate(iso)||!Number.isInteger(offset)||Math.abs(offset)>3650000||!UNITS.includes(unit))return '';
  if(unit==='days')return fromSerial(serial(iso)+offset*DAY);
  const y=Number(iso.slice(0,4)),m=Number(iso.slice(5,7)),d=Number(iso.slice(8,10));
  const total=y*12+m-1+offset*(unit==='years'?12:1),ny=Math.floor(total/12),nm=((total%12)+12)%12+1;
  if(ny<1||ny>9999)return '';
  return `${String(ny).padStart(4,'0')}-${String(nm).padStart(2,'0')}-${String(Math.min(d,daysInMonth(ny,nm))).padStart(2,'0')}`;
}
function normalizeCondition(value={}){
  const c=value&&typeof value==='object'?value:{},offset=c.offset===''||c.offset==null?null:Number(c.offset);
  return {
    id:str(c.id),code:str(c.code),text:str(c.text),responsible:str(c.responsible),
    status:choice(c.status,STATUSES,'pending'),dueMode:choice(c.dueMode,MODES,'undefined'),
    dueOn:validDate(c.dueOn)?c.dueOn:'',offset:Number.isInteger(offset)&&offset>=0?offset:null,
    unit:choice(c.unit,UNITS,'days'),anchor:choice(c.anchor,ANCHORS,'manual'),anchorDate:validDate(c.anchorDate)?c.anchorDate:'',
    completedOn:validDate(c.completedOn)?c.completedOn:'',protocol:str(c.protocol),notes:str(c.notes),
    sourcePage:Number.isInteger(Number(c.sourcePage))&&Number(c.sourcePage)>0?Number(c.sourcePage):null,
    sourceExcerpt:str(c.sourceExcerpt),sourcePages:Array.isArray(c.sourcePages)?c.sourcePages.filter(p=>p&&Number.isInteger(Number(p.page))&&Number(p.page)>0).map(p=>({page:Number(p.page),excerpt:str(p.excerpt)})):[],
    needsReview:c.needsReview===true,businessDays:c.businessDays===true,recurrence:str(c.recurrence)
  };
}
function safeJSON(value){
  if(value==null)return null;
  try{return JSON.parse(JSON.stringify(value),(key,item)=>['__proto__','prototype','constructor'].includes(key)?undefined:item);}catch(_){return null;}
}
function normalizeLicense(value={}){
  const l=value&&typeof value==='object'?value:{};
  const result={id:str(l.id),title:str(l.title),number:str(l.number),type:str(l.type),agency:str(l.agency),holder:str(l.holder),issuedOn:validDate(l.issuedOn)?l.issuedOn:'',receivedOn:validDate(l.receivedOn)?l.receivedOn:'',expiresOn:validDate(l.expiresOn)?l.expiresOn:'',attachment:safeJSON(l.attachment),conditions:Array.isArray(l.conditions)?l.conditions.map(normalizeCondition):[]};
  return result;
}
function sanitizeSnapshot(value){return {version:1,licenses:Array.isArray(value?.licenses)?value.licenses.map(normalizeLicense):[]};}
function calculateDue(license={},condition={}){
  const c=normalizeCondition(condition),review=c.needsReview;
  if(c.dueMode==='date')return {date:c.dueOn,reason:c.dueOn?'':'Informe a data do prazo.',needsReview:review||!c.dueOn};
  if(c.dueMode==='continuous')return {date:'',reason:'Obrigação contínua; sem vencimento único.',needsReview:review};
  if(c.dueMode!=='relative')return {date:'',reason:c.recurrence?'Periodicidade exige definição dos vencimentos.':'Prazo não definido.',needsReview:true};
  if(condition.unit!=null&&!UNITS.includes(condition.unit))return {date:'',reason:'Confira a unidade do prazo.',needsReview:true};
  if(c.businessDays)return {date:'',reason:'Dias úteis: informe a data após conferir o calendário aplicável.',needsReview:true};
  if(c.offset===null)return {date:'',reason:'Informe um intervalo inteiro maior ou igual a zero.',needsReview:true};
  const base=c.anchor==='manual'?c.anchorDate:license[c.anchor];
  if(!validDate(base))return {date:'',reason:c.anchor==='issuedOn'?'Informe a data de emissão.':c.anchor==='receivedOn'?'Informe a data de recebimento.':'Informe a data de referência.',needsReview:true};
  const date=addCalendar(base,c.offset,c.unit);
  return {date,reason:date?'':'O prazo está fora do intervalo de datas permitido.',needsReview:review||!date};
}
function conditionState(license,condition,today=localToday()){
  const c=normalizeCondition(condition),due=calculateDue(license,c),remaining=daysBetween(today,due.date);
  const result={status:c.status,label:'Pendente',daysRemaining:remaining,dueOn:due.date,needsReview:due.needsReview,reason:due.reason};
  if(c.status==='completed'){result.label='Cumprida';return result;}
  if(c.status==='not_applicable'){result.label='Não se aplica';return result;}
  if(remaining!==null){
    if(remaining<0){result.status='overdue';result.label='Vencida';}
    else if(remaining===0){result.status='due_today';result.label='Vence hoje';}
    else if(remaining<=30){result.status='due_soon';result.label='Vence em até 30 dias';}
    else if(c.status==='in_progress')result.label='Em andamento';
  }else if(c.dueMode==='continuous'){result.status='continuous';result.label='Contínua';}
  else if(c.recurrence){result.status='periodic';result.label='Periódica';}
  else if(c.status==='in_progress')result.label='Em andamento';
  else {result.status='undefined';result.label='Sem prazo definido';}
  return result;
}
function brazilianDate(value){
  const match=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if(!match)return '';
  const iso=`${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;
  return validDate(iso)?iso:'';
}
function deadlineAnchor(text,interval){
  // Bind the reference to this interval's temporal clause. A report, notice or
  // another document's issue/receipt date is never the license's issue/receipt.
  const event=/\b(emissao|emitida|recebimento|recebida|ciencia)\b/;
  function classify(clause,before=false){
    const reference=event.exec(clause);if(!reference)return null;
    if(before&&[...clause.matchAll(/\b(?:emissao|emitida|recebimento|recebida|ciencia)\b/g)].length>1)return 'manual';
    const object=clause.slice(reference.index+reference[0].length);
    const license=/^\s+(?:(?:da|desta|dessa|de|a|na|nesta|nessa)\s+)?(?:presente\s+)?(?:licenca|lao|lai|lap|lo|li|lp)\b/.test(object);
    return license?(/^(?:emissao|emitida)$/.test(reference[1])?'issuedOn':'receivedOn'):'manual';
  }
  const after=text.slice(interval.index+interval[0].length,interval.index+interval[0].length+180).split(/[.;]/)[0];
  const linkedAfter=classify(after);if(linkedAfter)return linkedAfter;
  const before=text.slice(Math.max(0,interval.index-180),interval.index).split(/[.;]/).pop();
  if(/\b(?:apos|desde|contad[oa]s?|a partir|a contar)\b/.test(before))return classify(before,true)||'manual';
  return 'manual';
}
function proposeDue(text){
  const f=fold(text),proposal={dueMode:'undefined',dueOn:'',offset:null,unit:'days',anchor:'manual',anchorDate:'',businessDays:false,recurrence:''};
  const recurrence=/\b(?:mensalmente|bimestralmente|trimestralmente|semestralmente|anualmente|periodicamente|periodicidade\s*[:–—-]?\s*(?:mensal|bimestral|trimestral|semestral|anual)|(?:(?:a|de)\s+)?cada\s+\d+(?:\s*\([^)]*\))?\s+(?:dias?|mes(?:es)?|anos?))\b/.exec(f);
  if(recurrence)proposal.recurrence=str(text).slice(recurrence.index,recurrence.index+recurrence[0].length);
  const dateMatches=[...str(text).matchAll(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g)].filter(m=>/\b(?:ate|prazo|vencimento|data limite)\b[^.;\n]{0,80}$/.test(f.slice(Math.max(0,m.index-100),m.index)));
  const dates=[...new Set(dateMatches.map(m=>brazilianDate(m[0])).filter(Boolean))];
  if(dates.length===1){proposal.dueMode='date';proposal.dueOn=dates[0];return proposal;}
  const intervals=[...f.matchAll(/\b(\d{1,5})(?:\s*\([^)]{1,40}\))?\s+(dias?|mes(?:es)?|anos?)(?:\s+(uteis|corridos))?\b/g)].filter(m=>(!recurrence||m.index<recurrence.index||m.index>=recurrence.index+recurrence[0].length)&&/\b(?:prazo|em ate|no maximo|ate|apos|dentro de)\b[^.;\n]{0,90}$/.test(f.slice(Math.max(0,m.index-100),m.index)));
  if(intervals.length===1){
    const match=intervals[0];proposal.dueMode='relative';proposal.offset=Number(match[1]);proposal.unit=match[2].startsWith('dia')?'days':match[2].startsWith('mes')?'months':'years';proposal.businessDays=match[3]==='uteis';
    proposal.anchor=deadlineAnchor(f,match);
    return proposal;
  }
  if(recurrence)return proposal;
  if(/\b(?:continu[ao]|permanente|durante (?:toda )?a (?:vigencia|operacao)|durante todo o periodo)\b/.test(f))proposal.dueMode='continuous';
  return proposal;
}
function parsePages(input){
  const pages=Array.isArray(input)?input.filter(p=>p&&typeof p.text==='string').map((p,i)=>({page:Number.isInteger(Number(p.page))&&Number(p.page)>0?Number(p.page):i+1,text:p.text})):[];
  const result={fields:{},fieldSources:{},conditions:[],warnings:[]};
  const repeated=new Map();
  for(const p of pages){const lines=p.text.split(/\r?\n/),seen=new Set();for(const line of [...lines.slice(0,3),...lines.slice(-3)]){const key=line.trim();if(key.length>3)seen.add(key);}for(const key of seen)repeated.set(key,(repeated.get(key)||0)+1);}
  let active=false,current=null,sectionFound=false,activeSection='';
  const section=/^(?:\d+[.)\s-]+)?(?:(?:relacao|quadro|lista) (?:de|das) )?(?:condicionantes(?: (?:ambientais|gerais|especificas))?|condicoes (?:gerais|especificas|ambientais)(?: e condicionantes)?|exigencias(?: ambientais)?)(?: (?:da|de) (?:lao|lai|lap|licenca))?(?:\s*[:–—-].*)?$/;
  const stop=/^(?:observac(?:ao|oes)(?: gerais)?|assinaturas?|responsavel pela emissao|documentos anexos|anexos|advertencias|fundamentacao legal|informacoes complementares|validade da licenca)\s*(?:[:–—-].*)?$/;
  const descriptive=/^(?:\d+(?:\.\d+)*\s*[.):–—-]?\s+)?(?:da operacao|descricao do empreendimento|controles ambientais|programas ambientais|aspectos florestais|medidas compensatorias|documentos em anexo|prazo de validade)\s*(?:[:–—-].*)?$/;
  function flush(){
    if(!current)return;
    while(current.lines.length&&!current.lines[current.lines.length-1].raw.trim())current.lines.pop();
    const body=current.lines.map(l=>l.body).join('\n').trim();
    if(body.length>=8){
      const sourcePages=[];
      for(const line of current.lines){let segment=sourcePages[sourcePages.length-1];if(!segment||segment.page!==line.page){segment={page:line.page,excerpt:''};sourcePages.push(segment);}segment.excerpt+=(segment.excerpt?'\n':'')+line.raw;}
      const proposal=proposeDue(body);
      result.conditions.push(normalizeCondition({id:`condition-${result.conditions.length+1}`,code:current.code,text:body,...proposal,sourcePage:sourcePages[0]?.page||null,sourceExcerpt:sourcePages[0]?.excerpt||'',sourcePages,needsReview:true}));
    }
    current=null;
  }
  for(const page of pages){
    const lines=page.text.split(/\r?\n/),carriedCondition=current;
    for(let index=0;index<lines.length;index++){
      const raw=lines[index],trim=raw.trim(),f=fold(trim);
      if(!trim){if(current)current.lines.push({page:page.page,raw,body:''});continue;}
      // Running headers, standalone page numbers and signatures are not obligations.
      const atEdge=index<3||index>=lines.length-3;
      const standaloneCode=active&&/^\d{1,3}(?:\.\d{1,3})*$/.test(trim)&&index<lines.length-2&&/^(?:apresentar|entregar|realizar|manter|executar|implementar|encaminhar|elaborar|providenciar|adotar|cumprir|monitorar|instalar|comprovar|garantir|respeitar|efetuar|informar|obter|submeter|operar)\b/.test(fold((lines[index+1]||'').trim()));
      if((/^(?:pagina\s*)?\d+(?:\s*(?:de|\/)\s*\d+)?$/.test(f)&&!standaloneCode)||/^pagina\s+\d+/.test(f)||/^(?:documento assinado|assinado (?:digital|eletronicamente)|codigo (?:de verificacao|verificador)|verifique (?:a )?autenticidade)/.test(f))continue;
      if(section.test(f)){
        const key=f.replace(/^\d+[.)\s-]+/,'').replace(/\s*[:–—-].*$/,'').trim();
        const repeatedHeading=active&&current&&current===carriedCondition&&activeSection===key&&index<8;
        if(!repeatedHeading)flush();
        active=true;activeSection=key;sectionFound=true;continue;
      }
      if(stop.test(f)||descriptive.test(f)){flush();active=false;activeSection='';continue;}
      if(atEdge&&repeated.get(trim)>1&&/^(?:licenca\b|nome do empreendimento\b|processo\b|orgao\b|instituto\b|fundacao\b|secretaria\b|prefeitura\b|centro.*\b(?:fone|cep)\b|cnpj\b|cpf\b|protocolo\b|https?:\/\/|www\.)/.test(f))continue;
      const explicit=/^condicionante\s*(?:n[º°o.]?\s*)?(\d+(?:\.\d+)*)(?:\s*[.):–—-]\s*|\s+)(\S.*)$/i.exec(trim);
      const numbered=/^(\d{1,3}(?:\.\d{1,3})*)(?:[.):–—-]\s+|\s+)([A-Za-zÀ-ÿ][\s\S]*)$/.exec(trim);
      const bullet=/^(?:([a-z])\)\s+|[•●▪‣–—-]\s+)(\S.*)$/i.exec(trim);
      const romanMatch=/^([IVXLCDM]{1,8})\s*[.):–—-]\s+(\S.*)$/.exec(trim);
      const roman=romanMatch&&/^(?:M{0,3})(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/.test(romanMatch[1])?romanMatch:null;
      const match=explicit||(active?(numbered||roman||bullet||(standaloneCode?['',trim,'']:null)):null);
      if(match){flush();current={code:match[1],lines:[{page:page.page,raw,body:match[2]}]};continue;}
      if(current)current.lines.push({page:page.page,raw,body:trim});
    }
    const labeled=[
      ['number',/(?:n[uú]mero\s+da\s+licen[çc]a|licen[çc]a(?:\s+ambiental)?(?:\s+(?:de\s+)?(?:opera[çc][ãa]o|instala[çc][ãa]o|pr[ée]via))?\s+n[º°o.]?)\s*[:–—-]?\s*([A-Z0-9][A-Z0-9./-]*)/i],
      ['type',/(?:^|\n)\s*tipo\s*(?:da licen[çc]a)?\s*[:–—-]\s*([^\r\n]+)/i],
      ['agency',/(?:^|\n)\s*[óo]rg[ãa]o\s*(?:ambiental|licenciador|emissor)?\s*[:–—-]\s*([^\r\n]+)/i],
      ['holder',/(?:^|\n)\s*(?:titular|empreendedor|raz[ãa]o social)\s*[:–—-]\s*([^\r\n]+)/i],
      ['issuedOn',/(?:data\s+de\s+emiss[ãa]o|emitida\s+em)\s*[:–—-]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i],
      ['receivedOn',/(?:data\s+de\s+recebimento|recebida\s+em)\s*[:–—-]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i],
      ['expiresOn',/(?:v[áa]lida\s+at[ée]|data\s+de\s+vencimento|vencimento|validade)\s*[:–—-]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i]
    ];
    for(const [key,re]of labeled){if(own(result.fields,key))continue;const match=re.exec(page.text);if(!match)continue;const value=/On$/.test(key)?brazilianDate(match[1]):match[1].trim();if(value){result.fields[key]=value;result.fieldSources[key]={page:page.page,excerpt:match[0]};}}
    if(!result.fields.type){const match=/\blicen[çc]a\s+ambiental\s+(?:de\s+)?(?:opera[çc][ãa]o|instala[çc][ãa]o|pr[ée]via)\b/i.exec(page.text);if(match){result.fields.type=match[0];result.fieldSources.type={page:page.page,excerpt:match[0]};}}
  }
  flush();
  if(!result.conditions.length)result.warnings.push('Nenhuma condicionante numerada foi reconhecida. Inclua ou confira as condicionantes manualmente.');
  if(!sectionFound&&result.conditions.length)result.warnings.push('Confira se todos os itens do documento foram identificados.');
  if(result.conditions.some(c=>c.businessDays))result.warnings.push('Há prazos em dias úteis: a data deve ser conferida e informada manualmente.');
  result.warnings.push('A leitura produz sugestões. Confira o texto, a referência e o prazo de cada condicionante no documento.');
  return result;
}
root.GeoMineLicenseModel=Object.freeze({parsePages,calculateDue,conditionState,daysBetween,addCalendar,validDate,localToday,normalizeLicense,normalizeCondition,sanitizeSnapshot,proposeDue});
})(typeof window!=='undefined'?window:globalThis);

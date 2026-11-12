/* ================= IMPORTAÇÃO DE MODELO DE BLOCOS SURPAC ====================
   O MDL 4.0 é binário e pode conter uma árvore de sub-blocos proprietária.
   O CCMGIS lê diretamente o cabeçalho e mantém o arquivo como referência
   externa; a geometria integral entra pelo relatório de centroides/dimensões
   CSV do próprio Surpac, em fluxo, sem materializar o texto de centenas de MB. */
function bmAscii(buf,a,b){
  return new TextDecoder('latin1').decode(new Uint8Array(buf,a,Math.max(0,b-a)));
}
function bmCString(u8,at,max=160){
  let e=at;while(e<u8.length&&e<at+max&&u8[e])e++;
  return new TextDecoder('latin1').decode(u8.subarray(at,e)).trim();
}
async function bmMdlHeader(file){
  const ab=await file.slice(0,65536).arrayBuffer(),u8=new Uint8Array(ab),dv=new DataView(ab),
    txt=bmAscii(ab,0,Math.min(512,ab.byteLength));
  if(!txt.startsWith('### Block Model ###'))throw new Error('O arquivo não possui a assinatura de modelo de blocos Surpac.');
  const ver=(txt.match(/Version\s+([^\r\n]+)/i)||[])[1]||'desconhecida',rot=/\bRotated\b/i.test(txt);
  let p0=0,nl=0;while(p0<u8.length&&nl<3){if(u8[p0++]===10)nl++;}while(p0<u8.length&&u8[p0]===0)p0++;
  const internal=bmCString(u8,p0,96)||file.name.replace(/\.mdl$/i,'');
  const f64=o=>o+8<=dv.byteLength?dv.getFloat64(o,false):NaN;
  const origin=[f64(0x77),f64(0x7f),f64(0x87)],extent=[f64(0xa7),f64(0xaf),f64(0xb7)];
  const ca=f64(0xbf),sa=f64(0xc7),angle=(isFinite(ca)&&isFinite(sa))?Math.atan2(-sa,ca)*180/Math.PI:0;
  const attrs=[],seen=new Set();
  for(let i=0x140;i<Math.min(u8.length,0x1000);i++){
    const ch=u8[i];if(!((ch>=65&&ch<=90)||(ch>=97&&ch<=122)||ch===95))continue;
    let e=i;while(e<u8.length&&e<i+40&&u8[e]>=32&&u8[e]<127)e++;
    if(e<u8.length&&u8[e]===0){const s=bmCString(u8,i,40);
      if(/^[A-Za-z_][A-Za-z0-9_]{1,30}$/.test(s)&&!seen.has(s.toLowerCase())){
        seen.add(s.toLowerCase());attrs.push(s);
      }i=e;
    }
  }
  return {kind:'surpac-mdl',version:ver,rotated:rot,internalName:internal,
    origin,extent,rotation:+angle.toFixed(6),attributes:attrs,fileName:file.name,size:file.size,lastModified:file.lastModified,
    oreConvention:attrs.some(a=>a.toLowerCase()==='ore')?{attribute:'ore',waste:0,ore:1}:null};
}
function bmFmtBytes(n){const u=['B','KB','MB','GB'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++;}return n.toLocaleString('pt-BR',{maximumFractionDigits:1})+' '+u[i];}
function bmMdlResumo(m){
  const f=v=>Number.isFinite(v)?v.toLocaleString('pt-BR',{maximumFractionDigits:3}):'—';
  return `<b>${esc(m.fileName)}</b> · ${bmFmtBytes(m.size)}<br>`+
    `Surpac MDL ${esc(m.version)} · ${m.rotated?'rotacionado '+f(m.rotation)+'°':'sem rotação'}<br>`+
    `Origem: E ${f(m.origin[0])} · N ${f(m.origin[1])} · Z ${f(m.origin[2])}<br>`+
    `Atributos (${m.attributes.length}): ${m.attributes.map(esc).join(', ')||'não identificados'}`+
    (m.oreConvention?'<br><b>Classificação:</b> ore = 1 (minério) · ore = 0 (estéril)':'');
}
function bmNorm(s){return String(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');}
function bmNum(s){s=String(s??'').trim();if(!s)return NaN;if(s.includes(',')&&!s.includes('.'))s=s.replace(',','.');return Number(s);}
function bmCsvDelimiter(line){const q=[[';',line.split(';').length],['\t',line.split('\t').length],[',',line.split(',').length]];q.sort((a,b)=>b[1]-a[1]);return q[0][0];}
function bmFindCol(cols,names){for(const n of names){const i=cols.indexOf(bmNorm(n));if(i>=0)return i;}return -1;}
let BM_PENDING_FILE=null,BM_PENDING_MAP=null,BM_LAST_MAPPING=null,BM_MDL_FILE=null, // transitório: nunca entra no projeto salvo
  BM_MDL_CONFIG={active:false,use:new Set(),filters:{},classField:'',lithField:'',benchField:''};
function bmMdlOptions(attrs,guess,optional=true){
  const gn=bmNorm(guess),ix=attrs.findIndex(a=>bmNorm(a)===gn);
  return (optional?'<option value="">— não usar —</option>':'')+attrs.map((a,i)=>
    `<option value="${esc(a)}" ${i===ix?'selected':''}>${esc(a)}</option>`).join('');
}
function bmMdlSaveFilterValues(){
  document.querySelectorAll('#bmMdlFilters [data-bmmdlval]').forEach(e=>{BM_MDL_CONFIG.filters[e.dataset.bmmdlval]=e.value;});
}
function bmMdlRenderFilters(){
  bmMdlSaveFilterValues();const box=document.getElementById('bmMdlFilters');if(!box)return;
  const names=[...document.querySelectorAll('#bmMdlFields [data-bmmdlfilter]:checked')].map(e=>e.dataset.bmmdlfilter);
  const next={};names.forEach(n=>next[n]=BM_MDL_CONFIG.filters[n]||'');BM_MDL_CONFIG.filters=next;
  box.innerHTML=names.length?'<b style="font-size:12px">Valores aceitos em cada filtro</b>'+names.map(n=>
    `<div class="row2" style="grid-template-columns:minmax(90px,.7fr) 1.3fr;margin-top:4px"><label class="field" style="margin:0">${esc(n)}</label>`+
    `<input data-bmmdlval="${esc(n)}" value="${esc(next[n])}" placeholder="vazio = todos; separe por vírgula"></div>`).join(''):
    '<div class="hint">Nenhum atributo escolhido como filtro.</div>';
  box.querySelectorAll('[data-bmmdlval]').forEach(e=>e.oninput=()=>BM_MDL_CONFIG.filters[e.dataset.bmmdlval]=e.value);
}
function bmMdlSyncRoles(){
  const get=id=>(document.getElementById(id)||{}).value||'';
  BM_MDL_CONFIG.classField=get('bmMdlClass');BM_MDL_CONFIG.lithField=get('bmMdlLith');BM_MDL_CONFIG.benchField=get('bmMdlBench');
  if(BM_MDL_CONFIG.classField)document.getElementById('bmAttr').value=BM_MDL_CONFIG.classField;
  if(BM_MDL_CONFIG.lithField)document.getElementById('bmLithAttr').value=BM_MDL_CONFIG.lithField;
  if(BM_MDL_CONFIG.benchField)document.getElementById('bmBenchAttr').value=BM_MDL_CONFIG.benchField;
}
function bmShowMdlFields(meta){
  const attrs=meta.attributes||[],box=document.getElementById('bmMdlFieldsBox'),list=document.getElementById('bmMdlFields');if(!box||!list)return;
  const guess=names=>attrs.find(a=>names.map(bmNorm).includes(bmNorm(a)))||'';
  const cls=guess(['ore','minerio','classe']),lith=guess(['lito','litologia','lith','lithology','rock','geology','sor']),bench=guess(['bancada','bench','level','nivel']);
  document.getElementById('bmMdlClass').innerHTML=bmMdlOptions(attrs,cls);
  document.getElementById('bmMdlLith').innerHTML=bmMdlOptions(attrs,lith);
  document.getElementById('bmMdlBench').innerHTML=bmMdlOptions(attrs,bench);
  bmDensityOptions(attrs);
  BM_MDL_CONFIG={active:true,use:new Set(attrs),filters:{},classField:cls,lithField:lith,benchField:bench};
  list.innerHTML=attrs.map(a=>`<label style="display:grid;grid-template-columns:minmax(0,1fr) 54px;gap:4px 7px;align-items:center;border-top:1px solid var(--line);padding:4px 0">`+
    `<span style="overflow:hidden;text-overflow:ellipsis" title="${esc(a)}">${esc(a)}</span>`+
    `<input type="checkbox" data-bmmdluse="${esc(a)}" checked style="width:auto;justify-self:center;accent-color:var(--amber)" title="Manter ${esc(a)} no relatório"></label>`).join('');
  list.querySelectorAll('[data-bmmdluse]').forEach(e=>e.onchange=()=>{if(e.checked)BM_MDL_CONFIG.use.add(e.dataset.bmmdluse);else BM_MDL_CONFIG.use.delete(e.dataset.bmmdluse);});
  ['bmMdlClass','bmMdlLith','bmMdlBench'].forEach(id=>document.getElementById(id).onchange=bmMdlSyncRoles);
  document.getElementById('bmMdlFieldsInfo').innerHTML=`<b>${attrs.length} atributos</b> encontrados em ${esc(meta.fileName)}. Marque “Filtrar” para informar os valores aceitos.`;
  box.style.display='block';bmMdlSyncRoles();
}
function bmDensityOptions(fields){
  const el=document.getElementById('bmDensityAttr');if(!el)return;
  const old=el.value,guess=(fields||[]).find(a=>['dens','density','densidade','rho','sg','specificgravity'].includes(bmNorm(a)))||'';
  el.innerHTML='<option value="">— não calcular massa —</option>'+(fields||[]).map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join('');
  el.value=(fields||[]).includes(old)?old:guess;
}
function bmMdlPrintableSample(u8,limit=10){
  const dec=new TextDecoder('latin1'),rows=[];let start=-1;
  const push=end=>{if(start<0)return;const raw=dec.decode(u8.subarray(start,end)).trim();
    if(raw.length>=3&&!rows.some(r=>r.text===raw))rows.push({offset:start,text:raw});start=-1;};
  for(let i=0;i<u8.length&&rows.length<limit;i++){
    const c=u8[i],print=c>=32&&c<=126;
    if(print){if(start<0)start=i;}else push(i);
  }
  if(rows.length<limit)push(u8.length);
  return rows.slice(0,limit);
}
async function bmToggleMdlPreview(){
  const box=document.getElementById('bmMdlPreview'),btn=document.getElementById('btnBmMdlPreview');if(!box)return;
  if(box.style.display!=='none'){box.style.display='none';if(btn)btn.innerHTML='▤ Ver cabeçalho';return;}
  const meta=S._bmExternal;if(!meta||!BM_MDL_FILE){toast('Abra primeiro o arquivo MDL');return;}
  box.style.display='block';box.innerHTML='<div class="hout">Lendo somente a prévia do cabeçalho…</div>';
  if(btn)btn.innerHTML='▴ Ocultar';
  try{
    const ab=await BM_MDL_FILE.slice(0,65536).arrayBuffer(),u8=new Uint8Array(ab),sample=bmMdlPrintableSample(u8,10),
      f=v=>Number.isFinite(+v)?(+v).toLocaleString('pt-BR',{maximumFractionDigits:3}):'—',
      lines=[['Arquivo',meta.fileName],['Versão',meta.version],['Modelo interno',meta.internalName||'—'],
        ['Rotação',meta.rotated?f(meta.rotation)+'°':'não rotacionado'],
        ['Origem E / N / Z',(meta.origin||[]).map(f).join(' / ')],
        ['Extensão X / Y / Z',(meta.extent||[]).map(f).join(' / ')],
        ['Atributos',String((meta.attributes||[]).length)]];
    box.innerHTML=`<div style="border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--panel2)">`+
      `<div style="padding:7px 8px;font-weight:800">Valores do cabeçalho</div>`+
      `<table style="width:100%;border-collapse:collapse;font-size:11px"><tbody>${lines.map(r=>
        `<tr style="border-top:1px solid var(--line)"><td style="padding:4px 7px;color:var(--ink-dim);width:38%">${esc(r[0])}</td><td style="padding:4px 7px;word-break:break-word">${esc(r[1])}</td></tr>`).join('')}</tbody></table>`+
      `<div style="padding:8px 8px 4px;font-weight:800;border-top:1px solid var(--line)">Primeiros 10 trechos legíveis</div>`+
      `<div style="max-height:190px;overflow:auto;padding:0 8px 7px">${sample.map((r,i)=>
        `<div style="display:grid;grid-template-columns:24px 58px minmax(0,1fr);gap:5px;padding:3px 0;border-top:1px solid var(--line)"><b>${i+1}</b><span style="color:var(--ink-dim)">0x${r.offset.toString(16).toUpperCase()}</span><span style="word-break:break-word">${esc(r.text)}</span></div>`).join('')}</div>`+
      `<div class="hint" style="padding:0 8px 8px">O MDL é binário: esta prévia mostra valores declarados no cabeçalho e textos realmente legíveis. Valores dos blocos não são inventados; para visualizar 10 registros completos por coluna, abra também o CSV de centroides/atributos exportado pelo Surpac.</div></div>`;
  }catch(e){box.innerHTML='<div class="hout"><b style="color:#e0a">Não foi possível ler a prévia:</b><br>'+esc(e&&e.message||e)+'</div>';}
}
function bmMapOptions(header,selected,optional=false){
  return (optional?'<option value="-1">— não usar —</option>':'')+header.map((h,i)=>
    `<option value="${i}" ${i===selected?'selected':''}>${esc(h)}</option>`).join('');
}
function bmMapGuess(header,names){return bmFindCol(header.map(bmNorm),names);}
async function bmInspectCsv(file){
  const text=await file.slice(0,262144).text(),line=(text.replace(/^\uFEFF/,'').split(/\r?\n/).find(s=>s.trim())||'');
  if(!line)throw new Error('O arquivo CSV está vazio.');
  const sep=bmCsvDelimiter(line),header=line.split(sep).map(s=>s.trim().replace(/^"|"$/g,''));
  if(header.length<6)throw new Error('O cabeçalho precisa conter ao menos X, Y, Z, DX, DY e DZ.');
  const guesses={x:bmMapGuess(header,['x','e','east','easting','xcentre','xcenter','centroidx']),
    y:bmMapGuess(header,['y','n','north','northing','ycentre','ycenter','centroidy']),
    z:bmMapGuess(header,['z','rl','elevation','zcentre','zcenter','centroidz']),
    dx:bmMapGuess(header,['dx','xsize','sizex','dimx','lengthx']),dy:bmMapGuess(header,['dy','ysize','sizey','dimy','lengthy']),
    dz:bmMapGuess(header,['dz','zsize','sizez','dimz','lengthz']),
    class:BM_MDL_CONFIG.classField?header.findIndex(h=>bmNorm(h)===bmNorm(BM_MDL_CONFIG.classField)):bmMapGuess(header,['ore','mineral','minerio','class','classe']),
    lith:BM_MDL_CONFIG.lithField?header.findIndex(h=>bmNorm(h)===bmNorm(BM_MDL_CONFIG.lithField)):bmMapGuess(header,['lito','litologia','lith','lithology','rock','geology','sor']),
    bench:BM_MDL_CONFIG.benchField?header.findIndex(h=>bmNorm(h)===bmNorm(BM_MDL_CONFIG.benchField)):bmMapGuess(header,['bancada','bench','level','nivel'])};
  for(const k of ['x','y','z','dx','dy','dz'])if(guesses[k]<0)guesses[k]=0;
  const ids={x:'bmMapX',y:'bmMapY',z:'bmMapZ',dx:'bmMapDX',dy:'bmMapDY',dz:'bmMapDZ',class:'bmMapClass',lith:'bmMapLith',bench:'bmMapBench'};
  Object.entries(ids).forEach(([k,id])=>{const e=document.getElementById(id);if(e)e.innerHTML=bmMapOptions(header,guesses[k],['class','lith','bench'].includes(k));});
  const cols=document.getElementById('bmMapCols');
  cols.innerHTML=header.map((h,i)=>{const checked=!BM_MDL_CONFIG.active||[...BM_MDL_CONFIG.use].some(a=>bmNorm(a)===bmNorm(h));return `<label class="field" style="display:flex;align-items:center;gap:5px;margin:0;min-width:0" title="${esc(h)}">`+
    `<input type="checkbox" data-bmcol="${i}" ${checked?'checked':''} style="width:auto;accent-color:var(--amber)"><span style="overflow:hidden;text-overflow:ellipsis">${esc(h)}</span></label>`;}).join('');
  BM_PENDING_FILE=file;BM_PENDING_MAP={header,sep};
  document.getElementById('bmMapInfo').innerHTML=`<b>${esc(file.name)}</b> · ${header.length} coluna(s) encontradas. Confirme o significado e escolha quais atributos manter.`;
  document.getElementById('bmMapBox').style.display='block';
  bmDensityOptions(header);
  document.getElementById('bmOut').innerHTML=`Cabeçalho lido: <b>${header.length} colunas</b>. Confirme o mapeamento acima para iniciar a importação.`;
}
function bmMappingFromUi(){
  const P=BM_PENDING_MAP;if(!P)throw new Error('Nenhum cabeçalho aguardando mapeamento.');
  const val=id=>+(document.getElementById(id)||{}).value;
  return {header:P.header,sep:P.sep,x:val('bmMapX'),y:val('bmMapY'),z:val('bmMapZ'),dx:val('bmMapDX'),dy:val('bmMapDY'),dz:val('bmMapDZ'),
    attr:val('bmMapClass'),lith:val('bmMapLith'),bench:val('bmMapBench'),
    keep:[...document.querySelectorAll('#bmMapCols [data-bmcol]:checked')].map(e=>+e.dataset.bmcol),filters:{...BM_MDL_CONFIG.filters}};
}
async function bmConfirmMapping(){
  try{
    const M=bmMappingFromUi(),required=[M.x,M.y,M.z,M.dx,M.dy,M.dz];
    if(new Set(required).size<6)throw new Error('X, Y, Z, DX, DY e DZ devem apontar para seis colunas diferentes.');
    if(M.attr>=0)document.getElementById('bmAttr').value=M.header[M.attr];
    if(M.lith>=0)document.getElementById('bmLithAttr').value=M.header[M.lith];
    if(M.bench>=0)document.getElementById('bmBenchAttr').value=M.header[M.bench];
    BM_LAST_MAPPING=M;document.getElementById('bmMapBox').style.display='none';await bmImportCsv(BM_PENDING_FILE,M);
  }catch(e){document.getElementById('bmOut').innerHTML='<b style="color:#e0a">Mapeamento inválido:</b><br>'+esc(e&&e.message||e);}
}
function bmValueSet(s){return new Set(String(s||'').split(/[;,|]/).map(v=>bmNorm(v)).filter(Boolean));}
function bmAggAdd(map,key,vol,z,extra={},mass=null){
  key=String(key||'Sem valor').trim()||'Sem valor';let a=map.get(key);
  if(!a){a={key,n:0,vol:0,mass:0,massN:0,zmin:Infinity,zmax:-Infinity,...extra};map.set(key,a);}
  a.n++;a.vol+=vol;if(Number.isFinite(mass)){a.mass+=mass;a.massN++;}a.zmin=Math.min(a.zmin,z);a.zmax=Math.max(a.zmax,z);return a;
}
function bmReportTable(titulo,rows,combined=false){
  const shown=rows.slice(0,250),head=combined?'<th>Litologia</th><th>Bancada</th>':'<th>Grupo</th>',hasMass=rows.some(r=>r.massN>0);
  return `<div style="font-weight:700;margin:8px 0 3px">${esc(titulo)} (${rows.length})</div>`+
    `<div style="max-height:230px;overflow:auto;border:1px solid var(--line);border-radius:7px"><table style="width:100%;border-collapse:collapse;font-size:11px">`+
    `<thead><tr style="position:sticky;top:0;background:var(--panel)">${head}<th>Blocos</th><th>Volume (m³)</th>${hasMass?'<th>Massa (t)</th>':''}<th>Z mín–máx</th></tr></thead><tbody>`+
    shown.map(r=>`<tr style="border-top:1px solid var(--line)">${combined?`<td>${esc(r.lito)}</td><td>${esc(r.bancada)}</td>`:`<td>${esc(r.key)}</td>`}`+
      `<td style="text-align:right">${r.n.toLocaleString('pt-BR')}</td><td style="text-align:right">${fmt(r.vol)}</td>`+
      (hasMass?`<td style="text-align:right">${r.massN?fmt(r.mass):'—'}</td>`:'')+
      `<td style="text-align:right">${Number.isFinite(r.zmin)?r.zmin.toLocaleString('pt-BR',{maximumFractionDigits:2}):'—'}–${Number.isFinite(r.zmax)?r.zmax.toLocaleString('pt-BR',{maximumFractionDigits:2}):'—'}</td></tr>`).join('')+
    `</tbody></table></div>`+(rows.length>shown.length?`<div class="hint">Exibindo ${shown.length}; o CSV contém todos os grupos.</div>`:'');
}
function bmReportSelected(){return [...document.querySelectorAll('#bmReportFields [data-bmreportfield]:checked')].map(e=>e.dataset.bmreportfield);}
function bmReportRenderFields(){
  const box=document.getElementById('bmReportFields'),R=S._bmReport;if(!box)return;
  const fields=R&&R.availableFields?R.availableFields:(R&&R.byAttribute?Object.keys(R.byAttribute):(S._bmExternal&&S._bmExternal.attributes)||[]);
  box.innerHTML=fields.length?fields.map((n,i)=>`<label class="field" style="display:flex;align-items:center;gap:5px;margin:0;min-width:0" title="Incluir ${esc(n)} no relatório">`+
    `<input type="checkbox" data-bmreportfield="${esc(n)}" ${((R&&R.byAttribute&&R.byAttribute[n])||(!R&&i<3)||['ore','lito','litologia','bancada'].includes(bmNorm(n)))?'checked':''} style="width:auto;accent-color:var(--amber)">`+
    `<span style="overflow:hidden;text-overflow:ellipsis">${esc(n)}</span></label>`).join(''):'<span class="hint">Os campos aparecerão depois da leitura da geometria CSV.</span>';
}
function bmOpenReport(){
  const box=document.getElementById('bmReportConfig');if(!box)return;box.style.display=box.style.display==='none'?'block':'none';
  if(box.style.display!=='none'){bmReportRenderFields();bmRefreshSolidSelect();}
}
function bmRefreshSolidSelect(){
  const el=document.getElementById('bmRestrictSolid');if(!el)return;
  const old=el.value,sols=(S.solidos||[]).filter(s=>s.origem==='cubagem');
  el.innerHTML='<option value="">— modelo completo, sem restrição —</option>'+sols.map(s=>
    `<option value="${esc(s.id)}">${esc(s.nome||s.id)}${s.volume!=null?' · '+fmt(s.volume)+' m³':''}</option>`).join('');
  if(sols.some(s=>String(s.id)===String(old)))el.value=old;
  bmSolidRestrictionInfo();
}
function bmSolidRestrictionInfo(){
  const el=document.getElementById('bmRestrictSolid'),out=document.getElementById('bmRestrictSolidInfo');if(!el||!out)return;
  const sol=(S.solidos||[]).find(s=>String(s.id)===String(el.value));
  if(!sol){out.innerHTML='Sem restrição espacial: o relatório considera o modelo completo.';return;}
  const n=(sol.regras||[]).length;
  out.innerHTML=n?`<b>${esc(sol.nome)}</b> · ${n} regra(s) espaciais gravadas · inclusão pelo centro do bloco.`:
    `<b>${esc(sol.nome)}</b> não possui regras gravadas. Gere novamente este sólido na Cubagem para utilizá-lo como restrição.`;
}
function bmReportRows(field,rows){
  const R=S._bmReport;if(!R)return rows;let allowed=null;
  if(field===R.lithSource)allowed=bmValueSet((document.getElementById('bmLithValues')||{}).value);
  const generic=(BM_MDL_CONFIG.filters||{})[field];if(generic)allowed=bmValueSet(generic);
  return allowed&&allowed.size?rows.filter(r=>allowed.has(bmNorm(r.key))):rows;
}
function bmReportBuild(){
  const R=S._bmReport,out=document.getElementById('bmReportOut');
  if(!out)return;if(!R){
    out.innerHTML=S._bmExternal&&BM_MDL_FILE
      ?'<b>MDL reconhecido.</b> Para calcular volumes, massas e agrupamentos, abra também o CSV de registros do Surpac com X, Y, Z, DX, DY, DZ e os atributos. O sólido escolhido será aplicado como restrição.'
      :'Abra o modelo de blocos para configurar o relatório.';
    return;
  }
  let fields=bmReportSelected();if(!fields.length)fields=Object.keys(R.byAttribute||{});
  const gl=!!(document.getElementById('bmGroupLith')||{}).checked,
    gb=!!(document.getElementById('bmGroupBench')||{}).checked,
    gx=!!(document.getElementById('bmGroupBoth')||{}).checked;
  out.innerHTML=`<b>${R.n.toLocaleString('pt-BR')} blocos</b> · volume <b>${fmt(R.vol)} m³</b>`+
    (R.massN?` · massa <b>${fmt(R.mass)} t</b> <span style="color:var(--ink-dim)">(${R.massN.toLocaleString('pt-BR')} com densidade)</span>`:'')+'<br>'+
    (R.solidRestriction?`<span style="color:var(--amber)">Restrição espacial: <b>${esc(R.solidRestriction)}</b></span><br>`:'')+
    `<span style="color:var(--ink-dim)">${fields.length} campo(s) selecionado(s) · totais calculados com todos os registros</span>`+
    (gl?bmReportTable('Por litologia',R.byLith||[]):'')+
    (gb?bmReportTable('Por bancada',R.byBench||[]):'')+
    (gx?bmReportTable('Litologia × bancada',R.byBoth||[],true):'')+
    fields.map(f=>bmReportTable('Por '+f,bmReportRows(f,R.byAttribute[f]||[]))).join('')+
    ((!gl&&!gb&&!gx&&!fields.length)?'<div class="hint">Escolha ao menos um agrupamento ou campo.</div>':'');
}
async function bmGenerateDynamicReport(){
  if(!BM_PENDING_FILE||!BM_LAST_MAPPING){
    const out=document.getElementById('bmReportOut');
    if(S._bmExternal&&BM_MDL_FILE){
      out.innerHTML='<b style="color:var(--amber)">O MDL está carregado, mas somente seu cabeçalho foi decodificado.</b><br>Os totais por litologia, bancada, densidade e sólido exigem os registros geométricos dos blocos. Abra o CSV de centroides/atributos exportado pelo Surpac; o MDL continuará vinculado e não precisa ser escolhido novamente.';
      toast('MDL reconhecido; faltam os registros geométricos para calcular o relatório');
    }else{out.innerHTML='Abra o modelo de blocos antes de gerar o relatório.';toast('Abra primeiro o modelo de blocos');}
    return;
  }
  const chosen=bmReportSelected(),oldCub=S._cub,oldOut=(document.getElementById('bmOut')||{}).innerHTML,
    auto=document.getElementById('bmAuto3D'),autoWas=auto&&auto.checked;
  if(auto)auto.checked=false;
  try{
    await bmImportCsv(BM_PENDING_FILE,BM_LAST_MAPPING);
    if(chosen.length)document.querySelectorAll('#bmReportFields [data-bmreportfield]').forEach(e=>e.checked=chosen.includes(e.dataset.bmreportfield));
    bmReportBuild();toast('✅ Relatório dinâmico atualizado');
  }catch(e){toast('Falha no relatório: '+(e&&e.message||e));}
  finally{
    S._cub=oldCub;if(auto)auto.checked=autoWas;const out=document.getElementById('bmOut');if(out)out.innerHTML=oldOut;
  }
}
function bmReportCsv(){
  const R=S._bmReport;if(!R){toast(S._bmExternal&&BM_MDL_FILE?'MDL reconhecido; falta o CSV com os registros dos blocos':'Abra primeiro o modelo de blocos');return;}
  const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"',num=v=>String(+v||0).replace('.',',');
  let fields=bmReportSelected();if(!fields.length)fields=Object.keys(R.byAttribute||{});
  const L=['atributo;valor;blocos;volume_m3;massa_t;blocos_com_densidade;z_min;z_max'],add=(attr,val,r)=>L.push([q(attr),q(val),r.n,num(r.vol),r.massN?num(r.mass):'',r.massN||0,num(r.zmin),num(r.zmax)].join(';'));
  if((document.getElementById('bmGroupLith')||{}).checked)(R.byLith||[]).forEach(r=>add('Litologia',r.key,r));
  if((document.getElementById('bmGroupBench')||{}).checked)(R.byBench||[]).forEach(r=>add('Bancada',r.key,r));
  if((document.getElementById('bmGroupBoth')||{}).checked)(R.byBoth||[]).forEach(r=>add('Litologia × bancada',r.lito+' | '+r.bancada,r));
  fields.forEach(f=>bmReportRows(f,R.byAttribute[f]||[]).forEach(r=>add(f,r.key,r)));
  download(new Blob(['\uFEFF'+L.join('\n')],{type:'text/csv;charset=utf-8'}),'relatorio_dinamico_modelo_blocos.csv');
}
async function bmImportCsv(file,mapping=null){
  const out=document.getElementById('bmOut'),classe=document.getElementById('bmClasse').value,
    attrName=(document.getElementById('bmAttr').value||'ore').trim(),oreVal=+document.getElementById('bmOreVal').value,
    wasteVal=+document.getElementById('bmWasteVal').value,max3=Math.max(1000,Math.min(500000,+document.getElementById('bmMax3D').value||200000)),
    selectedSolidId=(document.getElementById('bmRestrictSolid')||{}).value||'',selectedSolid=(S.solidos||[]).find(s=>String(s.id)===String(selectedSolidId)),useRest=!!selectedSolidId,
    lithAttr=(document.getElementById('bmLithAttr').value||'lito').trim(),lithAllowed=bmValueSet(document.getElementById('bmLithValues').value),
    benchMode=(document.getElementById('bmBenchMode').value||'auto'),benchAttr=(document.getElementById('bmBenchAttr').value||'').trim(),
    benchH=Math.max(.1,+document.getElementById('bmBenchH').value||10),benchBaseRaw=(document.getElementById('bmBenchBase').value||'').trim(),
    benchBase=benchBaseRaw===''?0:bmNum(benchBaseRaw),
    densityAttr=(document.getElementById('bmDensityAttr').value||'').trim(),densityUnit=(document.getElementById('bmDensityUnit').value||'t_m3');
  let spatialRules=[];
  if(!Number.isFinite(benchBase))throw new Error('A cota de referência da bancada é inválida.');
  if(useRest){
    if(!selectedSolid)throw new Error('O sólido escolhido não existe mais. Atualize a seleção.');
    if(!selectedSolid.regras||!selectedSolid.regras.length)throw new Error('O sólido escolhido não possui regras gravadas. Gere-o novamente na aba Cubagem.');
    const oldRules=S._cubRest;S._cubRest=selectedSolid.regras.map(r=>({...r}));let prep;
    try{prep=cubPrepRest();}finally{S._cubRest=oldRules;}
    if(prep.err)throw new Error('Filtro espacial: '+prep.err);
    if(!prep.rules.length)throw new Error('Filtro espacial ativado, mas nenhuma regra foi configurada. Use “Configurar filtro espacial” ou desmarque o filtro.');
    spatialRules=prep.rules;
  }
  const rd=file.stream().getReader(),dec=new TextDecoder(),sample=[],byLith=new Map(),byBench=new Map(),byBoth=new Map(),byAttrs=new Map();let carry='',header=null,sep=',',idx=null,
    rows=0,classMatched=0,matched=0,spatialRejected=0,vol=0,mass=0,massN=0,amin=Infinity,amax=-Infinity,x0=Infinity,y0=Infinity,z0=Infinity,x1=-Infinity,y1=-Infinity,z1=-Infinity,
    firstDim=null,lastUi=0,genericIdx=[],reportKeep=[],densityIdx=-1;
  const processLine=line=>{
    if(!line.trim())return;
    if(!header){sep=mapping?mapping.sep:bmCsvDelimiter(line);header=line.replace(/^\uFEFF/,'').split(sep).map(s=>s.trim().replace(/^"|"$/g,''));const c=header.map(bmNorm);
      idx=mapping?{x:mapping.x,y:mapping.y,z:mapping.z,dx:mapping.dx,dy:mapping.dy,dz:mapping.dz,attr:mapping.attr,lith:mapping.lith,bench:mapping.bench,keep:mapping.keep}:{x:bmFindCol(c,['x','e','east','easting','xcentre','xcenter','centroidx']),
        y:bmFindCol(c,['y','n','north','northing','ycentre','ycenter','centroidy']),
        z:bmFindCol(c,['z','rl','elevation','zcentre','zcenter','centroidz']),
        dx:bmFindCol(c,['dx','xsize','sizex','dimx','lengthx']),dy:bmFindCol(c,['dy','ysize','sizey','dimy','lengthy']),
        dz:bmFindCol(c,['dz','zsize','sizez','dimz','lengthz']),attr:c.indexOf(bmNorm(attrName)),
        lith:c.indexOf(bmNorm(lithAttr)),bench:c.indexOf(bmNorm(benchAttr)),keep:[]};
      if([idx.x,idx.y,idx.z,idx.dx,idx.dy,idx.dz].some(i=>i<0))throw new Error('O CSV precisa das colunas X, Y, Z, DX, DY e DZ (ou equivalentes do Surpac).');
      if(benchMode==='z'||!benchAttr)idx.bench=-1;
      if(classe!=='all'&&idx.attr<0)throw new Error('O atributo "'+attrName+'" não foi encontrado no CSV.');
      if(lithAllowed.size&&idx.lith<0)throw new Error('O atributo de litologia "'+lithAttr+'" não foi encontrado no CSV.');
      genericIdx=Object.entries((mapping&&mapping.filters)||{}).map(([name,values])=>({name,i:c.indexOf(bmNorm(name)),allowed:bmValueSet(values)})).filter(f=>f.allowed.size);
      const missing=genericIdx.find(f=>f.i<0);if(missing)throw new Error('O atributo de filtro "'+missing.name+'" não foi encontrado no CSV.');
      const requested=new Set(bmReportSelected().map(bmNorm));
      densityIdx=densityAttr?c.indexOf(bmNorm(densityAttr)):-1;
      if(densityAttr&&densityIdx<0)throw new Error('O campo de densidade "'+densityAttr+'" não foi encontrado no CSV.');
      reportKeep=requested.size?(idx.keep||[]).filter(i=>requested.has(bmNorm(header[i]))):[idx.attr,idx.lith,idx.bench].filter(i=>i>=0);
      [...new Set(reportKeep)].forEach(i=>{if(i>=0&&i<header.length)byAttrs.set(header[i],new Map());});return;}
    const a=line.split(sep),x=bmNum(a[idx.x]),y=bmNum(a[idx.y]),z=bmNum(a[idx.z]),dx=bmNum(a[idx.dx]),dy=bmNum(a[idx.dy]),dz=bmNum(a[idx.dz]);
    if(![x,y,z,dx,dy,dz].every(Number.isFinite)||dx<=0||dy<=0||dz<=0)return;rows++;
    const av=idx.attr>=0?bmNum(a[idx.attr]):NaN,ok=classe==='all'||(classe==='ore'&&av===oreVal)||(classe==='waste'&&av===wasteVal);if(!ok)return;
    classMatched++;
    const lithRaw=idx.lith>=0?String(a[idx.lith]??'').trim():'',lith=lithRaw||'Sem litologia';
    if(lithAllowed.size&&!lithAllowed.has(bmNorm(lith)))return;
    if(genericIdx.some(f=>!f.allowed.has(bmNorm(a[f.i]))))return;
    if(useRest&&!cubIn(x,y,z,spatialRules)){spatialRejected++;return;}
    const benchRaw=idx.bench>=0?String(a[idx.bench]??'').trim():'',b0=benchBase+Math.floor((z-benchBase)/benchH)*benchH,
      bench=benchRaw||`${b0.toLocaleString('pt-BR',{maximumFractionDigits:2})}–${(b0+benchH).toLocaleString('pt-BR',{maximumFractionDigits:2})} m`;
    matched++;const vv=dx*dy*dz;vol+=vv;if(Number.isFinite(av)){amin=Math.min(amin,av);amax=Math.max(amax,av);}
    let dens=densityIdx>=0?bmNum(a[densityIdx]):NaN;if(Number.isFinite(dens)&&dens>=0){if(densityUnit==='kg_m3')dens/=1000;else if(densityUnit==='g_cm3')dens*=1;}
    const mm=Number.isFinite(dens)&&dens>=0?vv*dens:null;if(mm!=null){mass+=mm;massN++;}
    bmAggAdd(byLith,lith,vv,z,{},mm);bmAggAdd(byBench,bench,vv,z,{},mm);bmAggAdd(byBoth,lith+'\u0001'+bench,vv,z,{lito:lith,bancada:bench},mm);
    reportKeep.forEach(i=>{const m=byAttrs.get(header[i]);if(m)bmAggAdd(m,String(a[i]??'').trim()||'Sem valor',vv,z,{},mm);});
    x0=Math.min(x0,x-dx/2);x1=Math.max(x1,x+dx/2);y0=Math.min(y0,y-dy/2);y1=Math.max(y1,y+dy/2);z0=Math.min(z0,z-dz/2);z1=Math.max(z1,z+dz/2);firstDim=firstDim||[dx,dy,dz];
    const attrs={};(idx.keep||[]).forEach(i=>{if(i>=0&&i<header.length)attrs[header[i]]=a[i]??'';});
    const b={x,y,z,dx,dy,dz,sub:false,attr:av,lithology:lith,bench,attrs};if(sample.length<max3)sample.push(b);else{const j=(Math.random()*matched)|0;if(j<max3)sample[j]=b;}
  };
  showLoad('Lendo modelo de blocos…');
  try{
    for(;;){const {value,done}=await rd.read();if(done)break;carry+=dec.decode(value,{stream:true});const ls=carry.split(/\r?\n/);carry=ls.pop();for(const l of ls)processLine(l);
      if(rows-lastUi>50000){lastUi=rows;out.innerHTML=`Lendo… <b>${rows.toLocaleString('pt-BR')}</b> registros`;await new Promise(requestAnimationFrame);}}
    carry+=dec.decode();if(carry.trim())processLine(carry);if(!matched)throw new Error('Nenhum bloco atende ao filtro escolhido.');
    const sortVol=(a,b)=>b.vol-a.vol;
    S._bmReport={sourceName:file.name,n:matched,vol,mass,massN,solidRestriction:selectedSolid?(selectedSolid.nome||selectedSolid.id):null,
      densitySource:densityAttr||'',densityUnit:'t/m³',lithSource:idx.lith>=0?lithAttr:'não encontrada (Sem litologia)',
      benchSource:idx.bench>=0?benchAttr:`derivada por Z a cada ${benchH} m${benchBaseRaw!==''?' desde a cota '+benchBase:''}`,
      byLith:[...byLith.values()].sort(sortVol),byBench:[...byBench.values()].sort((a,b)=>a.zmin-b.zmin||sortVol(a,b)),
      byBoth:[...byBoth.values()].sort((a,b)=>a.lito.localeCompare(b.lito,'pt-BR')||a.zmin-b.zmin),
      availableFields:(idx.keep||[]).map(i=>header[i]).filter(Boolean),
      byAttribute:Object.fromEntries([...byAttrs].map(([name,map])=>[name,[...map.values()].sort(sortVol)]))};
    const d=firstDim||[1,1,1];S._cub={blocos:sample,vol,nPai:matched,nSub:0,bx:d[0],by:d[1],bz:d[2],sx:1,sy:1,sz:1,modo:'importado',
      dom:{x0,x1,y0,y1},zmn:z0,zmx:z1,dens:null,nx:0,ny:0,nz:0,rules:S._cubRest.map(r=>({...r})),
      rulesSig:useRest?'solido:'+selectedSolidId:'importado-sem-filtro-espacial',_stale:false,
      imported:true,sourceName:file.name,totalBlocks:matched,sampled:sample.length,attrName,attrMin:amin,attrMax:amax,
      classFilter:classe,spatialFilter:useRest,spatialSolidId:selectedSolidId||null,spatialSolidName:selectedSolid?selectedSolid.nome:null,spatialRejected,selectedAttributes:(idx.keep||[]).map(i=>header[i]),
      attributeFilters:genericIdx.map(f=>({name:f.name,values:[...f.allowed]}))};
    out.innerHTML=`<b>${esc(file.name)}</b><br>${rows.toLocaleString('pt-BR')} registros lidos · <b>${matched.toLocaleString('pt-BR')}</b> no filtro`+
      (useRest?`<br>Restrição: <b>${esc(selectedSolid.nome||selectedSolid.id)}</b> · ${spatialRules.length} regra(s) · ${spatialRejected.toLocaleString('pt-BR')} bloco(s) excluído(s)`:'<br>Modelo completo, sem restrição espacial')+
      `<br>${sample.length.toLocaleString('pt-BR')} blocos preparados para o 3D · volume filtrado: <b>${fmt(vol)} m³</b>`+
      (sample.length<matched?'<br><span style="color:var(--ink-dim)">Amostra espacial uniforme para proteger a memória; totais calculados com todos os registros.</span>':'');
    const cm=document.getElementById('cubColorMode');if(cm&&idx.attr>=0)cm.value='attr';cubClipLbl();
    bmReportRenderFields();bmReportBuild();
    if(document.getElementById('bmAuto3D').checked){switchView('v3d');setTimeout(()=>cubRenderBlocos(),80);}else refreshUI();
    toast('✅ Modelo de blocos CSV importado');
  }finally{hideLoad();try{rd.releaseLock();}catch(_){}}
}
async function bmOpenFile(file){
  const out=document.getElementById('bmOut');if(!file)return;
  try{
    if(/\.mdl$/i.test(file.name)){
      showLoad('Lendo cabeçalho Surpac…');const meta=await bmMdlHeader(file);hideLoad();S._bmExternal={...meta};delete S._bmExternal.file;
      BM_MDL_FILE=file;const preview=document.getElementById('bmMdlPreview');if(preview){preview.style.display='none';preview.innerHTML='';}
      out.innerHTML=`<b>${esc(meta.fileName)}</b> · ${bmFmtBytes(meta.size)} · ${meta.attributes.length} atributos reconhecidos`;
      if(meta.oreConvention){document.getElementById('bmAttr').value='ore';document.getElementById('bmOreVal').value=1;document.getElementById('bmWasteVal').value=0;}
      const normAttrs=meta.attributes.map(a=>bmNorm(a)),pick=(ids)=>ids.map(bmNorm).find(a=>normAttrs.includes(a));
      const la=pick(['lito','litologia','lithology','rock','geology']),ba=pick(['bancada','bench','level','nivel']);
      if(la)document.getElementById('bmLithAttr').value=meta.attributes[normAttrs.indexOf(la)];
      if(ba)document.getElementById('bmBenchAttr').value=meta.attributes[normAttrs.indexOf(ba)];
      bmShowMdlFields(meta);
      toast('✅ Modelo Surpac reconhecido');
    }else await bmInspectCsv(file);
  }catch(e){hideLoad();out.innerHTML='<b style="color:#e0a">Falha na importação:</b><br>'+esc(e&&e.message||e);toast('Falha ao importar modelo: '+(e&&e.message||e));}
}
function bindBmImport(){
  const b=document.getElementById('btnBmFile'),f=document.getElementById('bmFile'),
    rr=document.getElementById('btnBmReport'),rc=document.getElementById('btnBmReportCsv'),mi=document.getElementById('btnBmMapImport'),
    rg=document.getElementById('btnBmReportGenerate'),ra=document.getElementById('btnBmReportAll'),rn=document.getElementById('btnBmReportNone'),
    ca=document.getElementById('btnBmColsAll'),cn=document.getElementById('btnBmColsNone'),ma=document.getElementById('btnBmMdlAll'),mn=document.getElementById('btnBmMdlNone'),mp=document.getElementById('btnBmMdlPreview'),sr=document.getElementById('bmRestrictSolid');
  if(!b||!f||b.dataset.bound)return;b.dataset.bound='1';
  b.onclick=()=>{f.value='';f.click();};f.onchange=()=>bmOpenFile(f.files&&f.files[0]);
  if(rr)rr.onclick=bmOpenReport;if(rc)rc.onclick=bmReportCsv;if(rg)rg.onclick=bmGenerateDynamicReport;
  if(ra)ra.onclick=()=>document.querySelectorAll('#bmReportFields [data-bmreportfield]').forEach(e=>e.checked=true);
  if(rn)rn.onclick=()=>document.querySelectorAll('#bmReportFields [data-bmreportfield]').forEach(e=>e.checked=false);
  if(mi)mi.onclick=bmConfirmMapping;
  if(ca)ca.onclick=()=>document.querySelectorAll('#bmMapCols [data-bmcol]').forEach(e=>e.checked=true);
  if(cn)cn.onclick=()=>document.querySelectorAll('#bmMapCols [data-bmcol]').forEach(e=>e.checked=false);
  if(ma)ma.onclick=()=>document.querySelectorAll('#bmMdlFields [data-bmmdluse]').forEach(e=>{e.checked=true;BM_MDL_CONFIG.use.add(e.dataset.bmmdluse);});
  if(mn)mn.onclick=()=>document.querySelectorAll('#bmMdlFields [data-bmmdluse]').forEach(e=>{e.checked=false;BM_MDL_CONFIG.use.delete(e.dataset.bmmdluse);});
  if(mp)mp.onclick=bmToggleMdlPreview;
  if(sr)sr.onchange=bmSolidRestrictionInfo;
  bmRefreshSolidSelect();
  refreshCubRest();
}
setTimeout(bindBmImport,0);

/* ==================== CUBAGEM — modelo de blocos 3D ==========================
   Constrói um modelo de blocos regular com SUB-BLOCAGEM, restrito por regras
   combináveis (entre/acima/abaixo de superfícies, dentro/fora de polígonos).
   O bloco pai só é subdividido quando corta a fronteira do sólido — mesma
   estratégia do Surpac. Validado contra o método prismático: erro < 0,1 %.  */

S._cubRest = S._cubRest || [];        // regras de restrição
S._cubSurfOn = S._cubSurfOn || {};    // quais MDT estão habilitados

function cubSurfsAtivas(){
  /* Todas as superfícies ficam disponíveis somente quando a regra precisa
     delas. A antiga lista de marcação antecipada foi removida para não
     duplicar centenas de camadas na interface. */
  return S.rasters.slice();
}

function refreshCubPanel(){
  const box=document.getElementById('cubSurfList');
  if(!box){refreshCubRest();cubSubHint();relCapFillSurfs();if(typeof hTopoRefresh==='function')hTopoRefresh();return;}
  // 1) lista de MDT com checkbox
  /* prioridade pedida: as superfícies TIN (mais leves) vêm primeiro */
  const ordenados=[...S.rasters].sort((a,b)=>{
    const ta=(a.tinPuro||(a.d&&a.d.tin))?0:1, tb=(b.tinPuro||(b.d&&b.d.tin))?0:1;
    return ta-tb;
  });
  box.innerHTML = S.rasters.length
    ? ordenados.map(r=>{
        const on = S._cubSurfOn[r.id]===true;
        const d=r.d, _cy=d.csy||d.cs;
        const ext=`${(d.nc*d.cs).toFixed(0)}×${(d.nr*_cy).toFixed(0)} m · célula ${(+d.cs).toFixed(2)}${Math.abs(_cy-d.cs)>1e-4?' × '+(+_cy).toFixed(2):''} m`;
        return `<label class="field" style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;margin:4px 0">
          <input type="checkbox" data-cubsurf="${r.id}" ${on?'checked':''} style="width:auto;margin-top:2px;accent-color:var(--amber)">
          <span><b style="font-size:12.5px">${(r.tinPuro||(r.d&&r.d.tin))?'▲ ':''}${esc(r.name)}</b><br>
          <span style="font-size:11px;color:var(--ink-dim)">${ext}</span></span></label>`;
      }).join('')
    : '<div class="hint">Nenhuma superfície carregada. Abra um GeoTIFF ou gere um MDT na aba Geoproc.</div>';
  box.querySelectorAll('[data-cubsurf]').forEach(c=>c.onchange=()=>{
    S._cubSurfOn[c.dataset.cubsurf]=c.checked; cubMarcaModeloDesatualizado(); refreshCubRest(); });
  refreshCubRest();
  cubSubHint();
  relCapFillSurfs();
  if(typeof hTopoRefresh==='function') hTopoRefresh();
}

/* ---- restrições ---- */
const CUB_TIPOS=[
  ['abaixo','Abaixo da superfície'],
  ['acima','Acima da superfície'],
  ['entre','Entre duas superfícies'],
  ['dentro','Dentro do polígono'],
  ['fora','Fora do polígono'],
  ['cota','Entre cotas (Z)'],
];
function cubRestResumo(){
  const el=document.getElementById('cubRestResumo'); if(!el) return;
  const nomes={abaixo:'abaixo',acima:'acima',entre:'entre superfícies',
    dentro:'dentro do limite',fora:'fora do limite',cota:'entre cotas'};
  if(!S._cubRest.length){
    el.innerHTML='<span style="color:var(--amber)">⚠ Configure ao menos uma restrição antes de gerar.</span>';
    return;
  }
  el.innerHTML=`<b>${S._cubRest.length} restrição(ões) ativa(s)</b> · `+
    S._cubRest.map(r=>nomes[r.tipo]||r.tipo).join(' + ')+
    `<br><span style="font-size:11px;color:var(--ink-dim)">${cubSurfsAtivas().length} superfície(s) habilitada(s) · combinação AND</span>`;
}
function refreshCubRest(){
  const surfs=cubSurfsAtivas();
  const sOpts=v=>surfs.map(r=>`<option value="${r.id}" ${String(v)===String(r.id)?'selected':''}>${esc(r.name)}</option>`).join('');
  // limites podem ser polígonos OU linhas (a interseção entre superfícies é linha)
  const polys=S.layers.filter(l=>l.gtype==='polygon'||l.gtype==='line');
  const pOpts=v=>polys.map(l=>`<option value="${l.id}" ${String(v)===String(l.id)?'selected':''}>`+
    `${l.gtype==='line'?'〰 ':'▢ '}${esc(l.name)}</option>`).join('');
  const html=!S._cubRest.length?'<div class="hint">Nenhuma restrição. Adicione uma para escolher o tipo.</div>':S._cubRest.map((R,i)=>{
    let campos='';
    if(R.tipo==='entre')
      campos=`<label class="field" style="font-size:11px;margin:3px 0 1px">Topo</label><select data-cr="${i}" data-k="a">${sOpts(R.a)}</select>
              <label class="field" style="font-size:11px;margin:3px 0 1px">Base</label><select data-cr="${i}" data-k="b">${sOpts(R.b)}</select>`;
    else if(R.tipo==='abaixo'||R.tipo==='acima')
      campos=`<select data-cr="${i}" data-k="a" style="margin-top:3px">${sOpts(R.a)}</select>`;
    else if(R.tipo==='dentro'||R.tipo==='fora')
      campos=`<select data-cr="${i}" data-k="lim" style="margin-top:3px">${pOpts(R.lim)}</select>`+
        `<div class="hint" style="font-size:11px;margin-top:2px">Linhas (ex.: interseção entre superfícies) são costuradas e fechadas em anel.</div>`;
    else if(R.tipo==='cota')
      campos=`<div class="row2" style="margin-top:3px">
        <input type="number" data-cr="${i}" data-k="zmin" value="${R.zmin??''}" placeholder="Z mín">
        <input type="number" data-cr="${i}" data-k="zmax" value="${R.zmax??''}" placeholder="Z máx"></div>`;
    return `<div style="border:1px solid var(--line);border-radius:8px;padding:6px 8px;margin:5px 0">
      <div style="display:flex;gap:6px;align-items:center">
        <select data-cr="${i}" data-k="tipo" style="flex:1;font-size:12px">
          ${CUB_TIPOS.map(([v,t])=>`<option value="${v}" ${R.tipo===v?'selected':''}>${t}</option>`).join('')}
        </select>
        <button class="xbtn" data-crdel="${i}" title="Remover" style="color:var(--danger,#e66)">✕</button>
      </div>${campos}</div>`;
  }).join('');
  ['cubRestList'].forEach(id=>{
    const box=document.getElementById(id);if(!box)return;box.innerHTML=html;
    box.querySelectorAll('[data-cr]').forEach(el=>el.onchange=()=>{
      const R=S._cubRest[+el.dataset.cr]; if(!R) return;
      const k=el.dataset.k;
      R[k] = (k==='zmin'||k==='zmax') ? (el.value===''?null:parseFloat(String(el.value).replace(',','.'))) : el.value;
      cubMarcaModeloDesatualizado();
      if(k==='tipo') refreshCubRest(); else cubRestResumo();
    });
    box.querySelectorAll('[data-crdel]').forEach(b=>b.onclick=()=>{
      S._cubRest.splice(+b.dataset.crdel,1); cubMarcaModeloDesatualizado(); refreshCubRest(); });
  });
  cubRestResumo();
}
function cubAddRest(){
  const surfs=cubSurfsAtivas();
  S._cubRest.push({tipo:'abaixo', a:surfs[0]?surfs[0].id:'', b:surfs[1]?surfs[1].id:'', lim:'', zmin:null, zmax:null});
  cubMarcaModeloDesatualizado();
  refreshCubRest();
}
function cubPresetAplicar(){
  const tipo=(document.getElementById('cubPreset')||{}).value||'auto';
  let bx=10,by=10,bz=10,sub=4;
  if(tipo==='det'){ bx=by=bz=5; sub=4; }
  else if(tipo==='proj'){ bx=by=bz=10; sub=4; }
  else if(tipo==='prev'){ bx=by=bz=20; sub=2; }
  else{
    const prep=cubPrepRest(), surfs=cubSurfsAtivas();
    const cs=surfs.length?Math.min(...surfs.map(r=>+r.d.cs||1)):1;
    const nice=v=>{ if(!(v>0))return 1; const p=10**Math.floor(Math.log10(v)),q=v/p;
      return (q<=1?1:q<=2?2:q<=5?5:10)*p; };
    let horiz=cs*5, vert=cs*3;
    if(!prep.err&&prep.rules.length){
      const d=cubDominio(prep.rules);
      if(d){ horiz=Math.max(horiz,Math.max(d.x1-d.x0,d.y1-d.y0)/100);
        vert=Math.max(vert,(d.z1-d.z0)/50); }
    }
    bx=by=Math.max(.5,nice(horiz)); bz=Math.max(.5,nice(vert)); sub=4;
  }
  [['cubBX',bx],['cubBY',by],['cubBZ',bz],['cubSX',sub],['cubSY',sub],['cubSZ',sub]]
    .forEach(([id,v])=>{ const e=document.getElementById(id); if(e)e.value=v; });
  const sm=document.getElementById('cubSubMode'); if(sm) sm.value='borda';
  cubSubHint();
  toast(`Modelo ajustado: bloco ${bx} × ${by} × ${bz} m · subdivisão ${sub}×${sub}×${sub}`);
}
function cubAbrirRestricoes(btn){
  try{ refreshCubPanel(); }catch(e){}
  const p=document.getElementById('sideCub');
  const sec=p&&ribFindSec(p,'superfícies e restrições');
  if(sec&&btn) ribbonOpen(sec,btn,'Superfícies e restrições do modelo');
}

/* Assinatura das restrições: usada para impedir que um modelo de blocos
   calculado com regras antigas seja confundido com o sólido atual. */
function cubRestSig(){
  const norm=(S._cubRest||[]).map(r=>({
    tipo:r.tipo||'',a:String(r.a||''),b:String(r.b||''),lim:String(r.lim||''),
    zmin:r.zmin==null?null:+r.zmin,zmax:r.zmax==null?null:+r.zmax
  }));
  return JSON.stringify(norm);
}
function cubMarcaModeloDesatualizado(){
  if(S._cub) S._cub._stale = S._cub.rulesSig!==cubRestSig();
  const out=document.getElementById('cubOut');
  if(S._cub&&S._cub._stale&&out) out.innerHTML='<span style="color:var(--amber)">⚠ Restrições alteradas — gere novamente o modelo de blocos antes de usar o modo escalonado.</span>';
}
function cubTemFechamentoVertical(rules){
  let teto=false,piso=false;
  for(const R of rules){
    if(R.t==='entre'){teto=true;piso=true;}
    else if(R.t==='abaixo') teto=true;
    else if(R.t==='acima') piso=true;
    else if(R.t==='cota'){ if(isFinite(R.zmax))teto=true; if(isFinite(R.zmin))piso=true; }
  }
  return {teto,piso};
}

/* Prepara as regras (resolve ids -> objetos, pré-calcula anéis) */
function cubPrepRest(){
  const out=[];
  for(const R of S._cubRest){
    const A=S.rasters.find(r=>String(r.id)===String(R.a));
    const B=S.rasters.find(r=>String(r.id)===String(R.b));
    if(R.tipo==='entre'){ if(!A||!B) return {err:'Restrição “entre”: escolha topo e base'}; out.push({t:'entre',A,B}); }
    else if(R.tipo==='abaixo'||R.tipo==='acima'){ if(!A) return {err:'Escolha a superfície da restrição'}; out.push({t:R.tipo,A}); }
    else if(R.tipo==='dentro'||R.tipo==='fora'){
      const L=S.layers.find(l=>String(l.id)===String(R.lim));
      if(!L) return {err:'Escolha o polígono da restrição'};
      const rings=cubRings(L); if(!rings) return {err:'Polígono sem anéis válidos'};
      out.push({t:R.tipo, rings});
    }
    else if(R.tipo==='cota'){
      if(R.zmin==null && R.zmax==null) return {err:'Informe ao menos uma cota'};
      out.push({t:'cota', zmin:R.zmin??-Infinity, zmax:R.zmax??Infinity});
    }
  }
  /* de que tipo de superfície o sólido vai nascer (TIN priorizado por ser
     mais leve) — vira a linha "Superfícies" nas propriedades do sólido */
  const surfs=[];
  out.forEach(R=>{ if(R.A)surfs.push(R.A); if(R.B)surfs.push(R.B); });
  const nT=surfs.filter(r=>r.tinPuro||(r.d&&r.d.tin)).length;
  S._cubFontes=!surfs.length?null:(nT===surfs.length?'TIN':(nT?'mista (TIN + raster)':'raster'));
  return {rules:out};
}
/* Anéis de limite a partir de POLÍGONO ou LINHA.
   A linha de interseção entre superfícies costuma vir fragmentada e aberta:
   os trechos são costurados em cadeias e fechados, virando um anel de recorte.
   É isso que faz o sólido parar exatamente na crista, e não na envoltória
   retangular do TIN.                                                        */
function cubRings(L){
  if(!L) return null;
  const partes=[];
  L.features.forEach(f=>{ if(!f.geom) return;
    const rs=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
    rs.forEach(r=>{ if(r.length>=2) partes.push(r.map(pt=>reproj(L.crs,S.workCRS,pt[0],pt[1]))); }); });
  if(!partes.length) return null;
  if(L.gtype==='polygon') return partes.filter(r=>r.length>=3);

  // LINHA: costura progressiva até obter poucas cadeias, depois fecha cada uma
  let chains=partes;
  if(typeof sewChains==='function'){
    for(const tol of [2,5,10,20,40]){
      chains=sewChains(partes, tol);
      if(chains.length<=Math.max(1, Math.ceil(partes.length/6))) break;
    }
  }
  const aneis=chains.filter(c=>c.length>=3).map(c=>{
    const a=c[0], b=c[c.length-1];
    return (Math.hypot(a[0]-b[0],a[1]-b[1])>1e-6) ? c.concat([a.slice()]) : c;
  });
  // descarta anéis minúsculos (fragmentos soltos que não delimitam nada)
  const area=r=>{ let s=0; for(let i=0,j=r.length-1;i<r.length;j=i++) s+=r[j][0]*r[i][1]-r[i][0]*r[j][1];
    return Math.abs(s/2); };
  const areas=aneis.map(area); const maxA=Math.max(...areas,0);
  return aneis.filter((r,i)=>areas[i]>=maxA*0.02).length? aneis.filter((r,i)=>areas[i]>=maxA*0.02) : (aneis.length?aneis:null);
}
/* Regra par-ímpar para conjuntos de anéis. Funciona tanto com polígonos
   multipartes quanto com furos: cada anel atravessado alterna dentro/fora. */
function cubPointInRings(x,y,rings){
  let dentro=false;
  for(const rg of (rings||[])) if(pointInRing(x,y,rg)) dentro=!dentro;
  return dentro;
}
/* Intervalo vertical entre duas superfícies.
   A cubagem é uma diferença entre superfícies, portanto a ordem escolhida nos
   campos Topo/Base não pode transformar a maior parte do corpo em espessura
   zero. Isso também cobre superfícies que se cruzam localmente: em cada XY o
   teto geométrico é a maior cota e a base é a menor. */
function cubFaixaEntre(a,b){
  if(!isFinite(a)||!isFinite(b)) return null;
  return a>=b ? {piso:b,teto:a,invertida:false} : {piso:a,teto:b,invertida:true};
}
/* ponto satisfaz TODAS as regras? */
function cubIn(x,y,z,rules){
  for(const R of rules){
    if(R.t==='entre'){ const a=sampleZbil(R.A.d,x,y), b=sampleZbil(R.B.d,x,y);
      const f=cubFaixaEntre(a,b);
      // Na linha de interseção a espessura é zero e o corpo termina ali.
      if(!f||f.teto-f.piso<=1e-6||z<f.piso||z>f.teto) return false; }
    else if(R.t==='abaixo'){ const a=sampleZbil(R.A.d,x,y); if(isNaN(a)||z>a) return false; }
    else if(R.t==='acima'){ const a=sampleZbil(R.A.d,x,y); if(isNaN(a)||z<a) return false; }
    else if(R.t==='dentro'){ if(!cubPointInRings(x,y,R.rings)) return false; }
    else if(R.t==='fora'){ if(cubPointInRings(x,y,R.rings)) return false; }
    else if(R.t==='cota'){ if(z<R.zmin||z>R.zmax) return false; }
  }
  return true;
}
/* domínio XY+Z coberto pelas regras */
function cubDominio(rules){
  let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity,z0=Infinity,z1=-Infinity, temSurf=false;
  const usaB=(r)=>{ const b=rasterBounds(r);
    x0=Math.max(x0===Infinity?b[0]:x0,b[0]); x1=Math.min(x1===-Infinity?b[2]:x1,b[2]);
    y0=Math.max(y0===Infinity?b[1]:y0,b[1]); y1=Math.min(y1===-Infinity?b[3]:y1,b[3]);
    for(let k=0;k<r.d.z.length;k++){const v=r.d.z[k]; if(!isNaN(v)){ if(v<z0)z0=v; if(v>z1)z1=v; }} temSurf=true; };
  rules.forEach(R=>{ if(R.A) usaB(R.A); if(R.B) usaB(R.B);
    if(R.t==='cota'){ if(isFinite(R.zmin))z0=Math.min(z0,R.zmin); if(isFinite(R.zmax))z1=Math.max(z1,R.zmax); } });
  // Somente DENTRO restringe o domínio pela caixa do anel. A regra FORA é
  // uma máscara de exclusão e não pode encolher o domínio para a própria caixa.
  rules.forEach(R=>{ if(R.t!=='dentro'||!R.rings) return;
    let a=Infinity,b=-Infinity,c=Infinity,d=-Infinity;
    R.rings.forEach(rg=>rg.forEach(p=>{ if(p[0]<a)a=p[0]; if(p[0]>b)b=p[0]; if(p[1]<c)c=p[1]; if(p[1]>d)d=p[1]; }));
    x0=Math.max(x0===Infinity?a:x0,a); x1=Math.min(x1===-Infinity?b:x1,b);
    y0=Math.max(y0===Infinity?c:y0,c); y1=Math.min(y1===-Infinity?d:y1,d); });
  if(!temSurf && !(isFinite(z0)&&isFinite(z1))) return null;
  return (x1>x0 && y1>y0 && z1>z0) ? {x0,x1,y0,y1,z0,z1} : null;
}

function cubSubHint(){
  const g=id=>+document.getElementById(id).value||1;
  const b=id=>parseFloat(String(document.getElementById(id).value).replace(',','.'))||1;
  const el=document.getElementById('cubSubHint'); if(!el) return;
  const sx=g('cubSX'), sy=g('cubSY'), sz=g('cubSZ');
  el.innerHTML=`Sub-bloco: <b>${(b('cubBX')/sx).toFixed(2)} × ${(b('cubBY')/sy).toFixed(2)} × ${(b('cubBZ')/sz).toFixed(2)} m</b>`+
    ` (${sx*sy*sz} por bloco pai)`;
}

/* ---------------- construção do modelo ---------------- */
async function runCubagem(){
  const out=document.getElementById('cubOut');
  const prep=cubPrepRest();
  if(prep.err){ out.innerHTML=`<span style="color:#e0a">${esc(prep.err)}</span>`; return; }
  if(!prep.rules.length){ out.innerHTML='<span style="color:#e0a">Adicione ao menos uma restrição.</span>'; return; }
  const dom=cubDominio(prep.rules);
  if(!dom){ out.innerHTML='<span style="color:#e0a">As restrições não definem um volume (verifique sobreposição das superfícies).</span>'; return; }

  const nb=id=>{ const v=parseFloat(String(document.getElementById(id).value).replace(',','.')); return isFinite(v)&&v>0?v:10; };
  const bx=nb('cubBX'), by=nb('cubBY'), bz=nb('cubBZ');
  const sx=+document.getElementById('cubSX').value||1,
        sy=+document.getElementById('cubSY').value||1,
        sz=+document.getElementById('cubSZ').value||1;
  const modo=document.getElementById('cubSubMode').value;
  const dens=parseFloat(String(document.getElementById('cubDens').value).replace(',','.'));

  const nx=Math.ceil((dom.x1-dom.x0)/bx), ny=Math.ceil((dom.y1-dom.y0)/by), nz=Math.ceil((dom.z1-dom.z0)/bz);
  const totPais=nx*ny*nz;
  if(totPais>3e6){ out.innerHTML=`<span style="color:#e0a">Modelo ${nx}×${ny}×${nz} = ${(totPais/1e6).toFixed(1)}M blocos pai — aumente o bloco.</span>`; return; }

  showLoad(`Montando modelo ${nx}×${ny}×${nz}…`);
  await new Promise(r=>setTimeout(r,20));

  const blocos=[];               // {x,y,z,dx,dy,dz,sub}
  let vol=0, nPai=0, nSub=0, t0=Date.now();
  const R=prep.rules;
  const dsx=bx/sx, dsy=by/sy, dsz=bz/sz;

  for(let k=0;k<nz;k++){
    const zc0=dom.z0+k*bz;
    for(let j=0;j<ny;j++){
      const yc0=dom.y0+j*by;
      for(let i=0;i<nx;i++){
        const xc0=dom.x0+i*bx;
        const cx=xc0+bx/2, cy=yc0+by/2, cz=zc0+bz/2;
        // amostra 8 cantos + centro
        let nIn=0;
        for(let a=0;a<8;a++){
          const px=xc0+(a&1?bx:0), py=yc0+(a&2?by:0), pz=zc0+(a&4?bz:0);
          if(cubIn(px,py,pz,R)) nIn++;
        }
        const centro=cubIn(cx,cy,cz,R); if(centro) nIn++;
        if(nIn===0) continue;                       // fora do sólido
        const cheio=(nIn===9);
        if(modo==='nao'){                            // sem sub-blocagem: centro decide
          if(centro){ blocos.push({x:cx,y:cy,z:cz,dx:bx,dy:by,dz:bz,sub:0}); vol+=bx*by*bz; nPai++; }
          continue;
        }
        if(cheio && modo==='borda'){                 // interior: mantém bloco pai
          blocos.push({x:cx,y:cy,z:cz,dx:bx,dy:by,dz:bz,sub:0}); vol+=bx*by*bz; nPai++; continue;
        }
        // subdivide
        for(let kk=0;kk<sz;kk++) for(let jj=0;jj<sy;jj++) for(let ii=0;ii<sx;ii++){
          const sxc=xc0+(ii+0.5)*dsx, syc=yc0+(jj+0.5)*dsy, szc=zc0+(kk+0.5)*dsz;
          if(cubIn(sxc,syc,szc,R)){
            blocos.push({x:sxc,y:syc,z:szc,dx:dsx,dy:dsy,dz:dsz,sub:1});
            vol+=dsx*dsy*dsz; nSub++;
          }
        }
      }
    }
    if(k%3===0){ showLoad(`Montando modelo… ${Math.round(100*(k+1)/nz)}%`); await new Promise(r=>setTimeout(r,0)); }
  }
  hideLoad();
  if(!blocos.length){ out.innerHTML='<span style="color:#e0a">Nenhum bloco satisfez as restrições.</span>'; return; }

  // área em planta (colunas distintas)
  const cols=new Set(); blocos.forEach(b=>cols.add(Math.round(b.x/dsx)+'|'+Math.round(b.y/dsy)));
  let zmn=Infinity,zmx=-Infinity; blocos.forEach(b=>{ if(b.z-b.dz/2<zmn)zmn=b.z-b.dz/2; if(b.z+b.dz/2>zmx)zmx=b.z+b.dz/2; });

  S._cub={blocos,vol,nPai,nSub,bx,by,bz,sx,sy,sz,modo,dom,zmn,zmx,dens:isFinite(dens)&&dens>0?dens:null,
          nx,ny,nz, rules:S._cubRest.map(r=>({...r})),rulesSig:cubRestSig(),_stale:false};
  const fmt=v=>v.toLocaleString('pt-BR',{maximumFractionDigits:0});
  out.innerHTML=
    `<b>Volume: ${fmt(vol)} m³</b>`+
    (S._cub.dens? `<br><b>Massa: ${fmt(vol*S._cub.dens)} t</b> (${S._cub.dens} t/m³)` : '')+
    `<br>Blocos: <b>${fmt(blocos.length)}</b> — ${fmt(nPai)} pai + ${fmt(nSub)} sub`+
    `<br>Pai ${bx}×${by}×${bz} m · sub ${dsx.toFixed(2)}×${dsy.toFixed(2)}×${dsz.toFixed(2)} m`+
    `<br>Grade ${nx}×${ny}×${nz} · cotas ${zmn.toFixed(1)}–${zmx.toFixed(1)} m`+
    `<br><span style="color:var(--ink-dim);font-size:11px">${((Date.now()-t0)/1000).toFixed(1)} s</span>`;
  toast(`✅ ${fmt(blocos.length)} blocos · ${fmt(vol)} m³`);
  const c3=document.getElementById('cub3dOut');
  if(c3) c3.innerHTML='Modelo pronto — toque em <b>Ver blocos em 3D</b>.';
  cubClipLbl();
  if((document.getElementById('cubAuto3D')||{}).checked)
    setTimeout(()=>{ try{ cubRenderBlocos(); }catch(e){ console.warn('visualização automática',e); } },40);
}

/* ============ SÓLIDO DAS RESTRIÇÕES (casca do modelo) =======================
   Em vez de desenhar cada bloco (12 triângulos por caixa), extrai apenas as
   FACES EXPOSTAS do volume — a casca. Medido no projeto real: 90 a 95 % menos
   triângulos, com o mesmo contorno. O modelo de blocos segue sendo o motor
   numérico (volume/tonelagem); o sólido é a representação visual.          */
function cubSolidoGeo(C){
  const dsx=C.bx/C.sx, dsy=C.by/C.sy, dsz=C.bz/C.sz;
  const NI=Math.max(1,Math.round((C.dom.x1-C.dom.x0)/dsx))+2;
  const NJ=Math.max(1,Math.round((C.dom.y1-C.dom.y0)/dsy))+2;
  const NK=Math.max(1,Math.round((C.zmx-C.zmn)/dsz))+2;
  if(NI*NJ*NK > 6e7) return {err:`Grade de casca ${NI}×${NJ}×${NK} grande demais — use sub-bloco maior.`};
  const occ=new Uint8Array(NI*NJ*NK);
  const IDX=(i,j,k)=>(k*NJ+j)*NI+i;
  const ok=(i,j,k)=> (i<0||j<0||k<0||i>=NI||j>=NJ||k>=NK) ? 0 : occ[IDX(i,j,k)];
  // marca ocupação (bloco pai ocupa várias células da grade fina)
  for(const b of C.blocos){
    const ni=Math.max(1,Math.round(b.dx/dsx)), nj=Math.max(1,Math.round(b.dy/dsy)), nk=Math.max(1,Math.round(b.dz/dsz));
    const i0=Math.round((b.x-b.dx/2-C.dom.x0)/dsx), j0=Math.round((b.y-b.dy/2-C.dom.y0)/dsy),
          k0=Math.round((b.z-b.dz/2-C.zmn)/dsz);
    for(let k=0;k<nk;k++){ const kk=k0+k; if(kk<0||kk>=NK) continue;
      for(let j=0;j<nj;j++){ const jj=j0+j; if(jj<0||jj>=NJ) continue;
        for(let i=0;i<ni;i++){ const ii=i0+i; if(ii<0||ii>=NI) continue; occ[IDX(ii,jj,kk)]=1; } } }
  }
  // faces expostas
  const pos=[], nor=[], zval=[];
  const V=(i,j,k)=>[C.dom.x0+i*dsx, C.dom.y0+j*dsy, C.zmn+k*dsz];
  const quad=(a,b,c,d,n)=>{
    pos.push(...a,...b,...c, ...a,...c,...d);
    for(let t=0;t<6;t++) nor.push(...n);
    const zm=(a[2]+c[2])/2; for(let t=0;t<6;t++) zval.push(zm);
  };
  for(let k=0;k<NK;k++) for(let j=0;j<NJ;j++) for(let i=0;i<NI;i++){
    if(!occ[IDX(i,j,k)]) continue;
    const p000=V(i,j,k), p100=V(i+1,j,k), p010=V(i,j+1,k), p001=V(i,j,k+1),
          p110=V(i+1,j+1,k), p101=V(i+1,j,k+1), p011=V(i,j+1,k+1), p111=V(i+1,j+1,k+1);
    if(!ok(i,j,k+1)) quad(p001,p101,p111,p011,[0,0,1]);      // topo
    if(!ok(i,j,k-1)) quad(p000,p010,p110,p100,[0,0,-1]);     // base
    if(!ok(i-1,j,k)) quad(p000,p001,p011,p010,[-1,0,0]);     // oeste
    if(!ok(i+1,j,k)) quad(p100,p110,p111,p101,[1,0,0]);      // leste
    if(!ok(i,j-1,k)) quad(p000,p100,p101,p001,[0,-1,0]);     // sul
    if(!ok(i,j+1,k)) quad(p010,p011,p111,p110,[0,1,0]);      // norte
  }
  if(!pos.length) return {err:'Modelo sem faces (verifique as restrições).'};
  return {pos:Float64Array.from(pos), nor:Float32Array.from(nor), zval:Float32Array.from(zval),
          nTri:pos.length/9, celulas:occ.reduce((s,v)=>s+v,0)};
}

/* ============ SÓLIDO LISO — segue as superfícies ============================
   A casca do modelo de blocos é escalonada por natureza (degraus de voxel).
   Para um sólido com aparência de projeto, as restrições são resolvidas
   ANALITICAMENTE em cada nó de uma grade fina:
     zTopo = menor teto imposto pelas regras   (abaixo de / entre / cota máx)
     zBase = maior piso imposto pelas regras   (acima de / entre / cota mín)
   e a malha sai com telhado, piso e paredes — sem degraus.                 */
async function cubSolidoLiso(rules, res, zCorteMax, zCorteMin){
  const dom=cubDominio(rules);
  if(!dom) return {err:'As restrições não definem um volume.'};
  const nx=Math.ceil((dom.x1-dom.x0)/res)+1, ny=Math.ceil((dom.y1-dom.y0)/res)+1;
  if(nx*ny>4e6) return {err:`Grade ${nx}×${ny} muito fina — aumente a resolução.`};

  const zt=new Float64Array(nx*ny), zb=new Float64Array(nx*ny),
        ok=new Uint8Array(nx*ny), esp=new Uint8Array(nx*ny);
  let entreDireto=0, entreInvertido=0;
  for(let j=0;j<ny;j++){ const Y=dom.y0+j*res;
    if((j & 31)===0){                             // respira: página nunca "trava"
      await respira();
      if(typeof showLoad==='function' && ny>800)
        showLoad(`Gerando sólido — ${(100*j/ny).toFixed(0)}%`);
    }
    for(let i=0;i<nx;i++){ const X=dom.x0+i*res, k=j*nx+i;
      let teto=Infinity, piso=-Infinity, val=true;
      for(const R of rules){
        if(R.t==='entre'){ const a=sampleZbil(R.A.d,X,Y), b=sampleZbil(R.B.d,X,Y);
          const f=cubFaixaEntre(a,b);
          if(!f){ val=false; break; }
          if(f.invertida) entreInvertido++; else entreDireto++;
          teto=Math.min(teto,f.teto); piso=Math.max(piso,f.piso); }
        else if(R.t==='abaixo'){ const a=sampleZbil(R.A.d,X,Y);
          if(isNaN(a)){ val=false; break; } teto=Math.min(teto,a); }
        else if(R.t==='acima'){ const a=sampleZbil(R.A.d,X,Y);
          if(isNaN(a)){ val=false; break; } piso=Math.max(piso,a); }
        else if(R.t==='cota'){ if(isFinite(R.zmax)) teto=Math.min(teto,R.zmax);
          if(isFinite(R.zmin)) piso=Math.max(piso,R.zmin); }
        else if(R.t==='dentro'){ if(!cubPointInRings(X,Y,R.rings)){ val=false; break; } }
        else if(R.t==='fora'){ if(cubPointInRings(X,Y,R.rings)){ val=false; break; } }
      }
      // corte por cota do sequenciamento: teto rebaixado até a praça do ano
      if(val){
        if(isFinite(zCorteMax)) teto=Math.min(teto,zCorteMax);
        if(isFinite(zCorteMin)) piso=Math.max(piso,zCorteMin);
      }
      if(!val||!isFinite(teto)||!isFinite(piso)||teto-piso<=1e-6){ ok[k]=0; continue; }
      zt[k]=teto; zb[k]=piso;
      ok[k]=1; esp[k]=1;
    } }

  const pos=[], zval=[];
  const P=(i,j,z)=>[dom.x0+i*res, dom.y0+j*res, z];
  const tri=(a,b,c)=>{ pos.push(...a,...b,...c);
    const zm=(a[2]+b[2]+c[2])/3; zval.push(zm,zm,zm); };
  const val4=(i,j)=>{ if(i<0||j<0||i>=nx-1||j>=ny-1) return false;
    const a=j*nx+i;
    /* A célula só entra na casca lisa se os quatro cantos tiverem espessura.
       Antes bastava UM canto: os outros podiam ter topo=piso e cada parede
       afunilava até zero, produzindo os dentes triangulares da lateral. */
    return !!(ok[a]&&ok[a+1]&&ok[a+nx]&&ok[a+nx+1]) &&
           !!(esp[a]&&esp[a+1]&&esp[a+nx]&&esp[a+nx+1]); };
  let nQuad=0, vol=0;
  for(let j=0;j<ny-1;j++) for(let i=0;i<nx-1;i++){
    if(!val4(i,j)) continue; nQuad++;
    const k00=j*nx+i, k10=k00+1, k01=k00+nx, k11=k01+1;
    // volume aproximado (trapézio) só para conferência
    vol += ((zt[k00]-zb[k00])+(zt[k10]-zb[k10])+(zt[k01]-zb[k01])+(zt[k11]-zb[k11]))/4*res*res;
    // TETO (normal p/ cima)
    tri(P(i,j,zt[k00]), P(i+1,j,zt[k10]), P(i+1,j+1,zt[k11]));
    tri(P(i,j,zt[k00]), P(i+1,j+1,zt[k11]), P(i,j+1,zt[k01]));
    // PISO (ordem invertida = normal p/ baixo)
    tri(P(i,j,zb[k00]), P(i+1,j+1,zb[k11]), P(i+1,j,zb[k10]));
    tri(P(i,j,zb[k00]), P(i,j+1,zb[k01]), P(i+1,j+1,zb[k11]));
    // PAREDES nas bordas do domínio válido
    const parede=(ia,ja,ib,jb)=>{
      const ka=ja*nx+ia, kb=jb*nx+ib;
      const A1=P(ia,ja,zt[ka]), A2=P(ib,jb,zt[kb]);
      const B1=P(ia,ja,zb[ka]), B2=P(ib,jb,zb[kb]);
      tri(A1,A2,B2); tri(A1,B2,B1);
    };
    if(!val4(i,j-1)) parede(i,j, i+1,j);
    if(!val4(i,j+1)) parede(i+1,j+1, i,j+1);
    if(!val4(i-1,j)) parede(i,j+1, i,j);
    if(!val4(i+1,j)) parede(i+1,j, i+1,j+1);
  }
  if(!nQuad) return {err:'Nenhuma célula com espessura (confira as restrições).'};
  return {pos:Float64Array.from(pos), zval:Float32Array.from(zval),
          nTri:pos.length/9, res, volAprox:vol, dom,
          entreDireto,entreInvertido};
}

/* Qual superfície é o "topo"? Regra: o campo topo de um "Entre", ou o alvo de
   um "Abaixo da superfície". É essa que recebe a textura da ortofoto.       */
function cubProductSource(C){
  for(const rule of C?.rules||[]){
    const r=(S.rasters||[]).find(r=>String(r.id)===String(rule.a));
    if(r)return r;
  }
  return null;
}
function cubIdTopo(){
  for(const R of (S._cubRest||[])){
    if(R.tipo==='entre' && R.a) return R.a;
    if(R.tipo==='abaixo' && R.a) return R.a;
  }
  const a=cubSurfsAtivas(); return a.length? a[0].id : null;
}

/* Enquadra a câmera no corpo, com folga e ângulo padrão de mina. */
function cubEnquadra(C, OX, OY, z0, ve){
  if(!C||!C.dom||!V3.cam) return;
  const cxm=(C.dom.x0+C.dom.x1)/2-OX, czm=-((C.dom.y0+C.dom.y1)/2-OY);
  const cym=((C.zmn+C.zmx)/2-z0)*ve;
  const dx=C.dom.x1-C.dom.x0, dy=C.dom.y1-C.dom.y0, dz=(C.zmx-C.zmn)*ve;
  const raio=Math.max(dx,dy,dz,10);
  V3.tgt=[cxm,cym,czm];
  V3.radius=raio*1.5;
  V3.size=raio;
  V3.theta=Math.PI*0.75; V3.phi=Math.PI*0.28;      // vista de mina, um pouco de cima
  if(V3.cam){ V3.cam.far=Math.max(V3.cam.far, raio*40); V3.cam.near=Math.max(0.1, raio*0.001);
    V3.cam.updateProjectionMatrix(); }
  if(typeof v3ApplyCam==='function') v3ApplyCam();
}
function cubReenquadra(){
  const C=S._cub||S._relDom;
  if(!C||!C.dom){ toast('Renderize o sólido primeiro'); return; }
  cubEnquadra(C, V3.OX, V3.OY, V3.z0, V3.VE||1); v3Resize();
}

/* Projeção cartográfica leve do modelo de blocos. O sólido 3D continua sendo
   a geometria completa; no mapa 2D fica uma única envoltória vetorial, para
   não criar centenas de milhares de polígonos e travar o projeto. */
function cubProjecao2D(C){
  if(!C||!C.blocos||!C.blocos.length)return null;
  const B=C.blocos,step=Math.max(1,Math.ceil(B.length/50000)),pts=[];
  for(let i=0;i<B.length;i+=step){const b=B[i],hx=b.dx/2,hy=b.dy/2;
    pts.push([b.x-hx,b.y-hy],[b.x+hx,b.y-hy],[b.x+hx,b.y+hy],[b.x-hx,b.y+hy]);}
  pts.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const lo=[];for(const p of pts){while(lo.length>=2&&cross(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p);}
  const up=[];for(let i=pts.length-1;i>=0;i--){const p=pts[i];while(up.length>=2&&cross(up[up.length-2],up[up.length-1],p)<=0)up.pop();up.push(p);}
  const ring=lo.slice(0,-1).concat(up.slice(0,-1));if(ring.length<3)return null;ring.push(ring[0].slice());
  const total=C.totalBlocks!=null?C.totalBlocks:(C.nPai!=null?C.nPai:B.length),props={
    BLOCOS:total,VOLUME_M3:+(C.vol||0),Z_MIN:C.zmn,Z_MAX:C.zmx,FONTE:C.sourceName||'CCMGIS'};
  let L=(S.layers||[]).find(l=>l._cubProjection===true);
  if(!L){L=addLayer({sourceLayer:cubProductSource(C),name:(C.sourceName?C.sourceName.replace(/\.[^.]+$/,''):'Modelo de blocos')+' — projeção 2D',gtype:'polygon',crs:S.workCRS,
    features:[{geom:[ring],multi:true,props}],fields:[{name:'BLOCOS',type:'N',length:14,decimal:0},{name:'VOLUME_M3',type:'N',length:18,decimal:2},
      {name:'Z_MIN',type:'N',length:12,decimal:2},{name:'Z_MAX',type:'N',length:12,decimal:2},{name:'FONTE',type:'C',length:80}],color:'#c07a3e'});L._cubProjection=true;}
  else{
    try{if(L.llayer)map.removeLayer(L.llayer);}catch(e){}L.features=[{geom:[ring],multi:true,props}];L.visible=true;L.llayer=null;drawLayer(L);zApply();
  }
  C.projectionLayerId=L.id;try{refreshUI();}catch(e){}return L;
}

/* ---- BOTÃO: renderizar o SÓLIDO das restrições ---- */
async function cubRenderSolido(){
  const out=document.getElementById('cubSolOut');
  let modo=(document.getElementById('cubSolModo')||{}).value||'liso';
  let G,C=S._cub;
  if(S._bmExternal&&(!C||!C.imported)){
    const msg='O arquivo MDL carregado forneceu o cabeçalho e os atributos, mas ainda não há geometria de blocos. Importe o CSV Surpac com X, Y, Z, DX, DY e DZ para gerar o sólido, a projeção 2D e a cubagem.';
    if(out)out.innerHTML='<span style="color:#e0a">'+esc(msg)+'</span>';const bmOut=document.getElementById('bmOut');if(bmOut)bmOut.innerHTML=bmMdlResumo(S._bmExternal)+'<br><b style="color:#e0a">Geometria pendente:</b> '+esc(msg);toast('Falta a geometria dos blocos');return;
  }
  if(C&&C.imported){
    if(!C.blocos||!C.blocos.length){out.innerHTML='<span style="color:#e0a">O MDL forneceu apenas o cabeçalho. Para gerar o sólido, importe a geometria pelo CSV de centroides e dimensões.</span>';toast('Falta a geometria dos blocos');return;}
    cubProjecao2D(C);await cubRenderBlocos();
    out.innerHTML='<b>Sólido do modelo importado gerado.</b><br>Projeção vetorial criada no mapa 2D e blocos renderizados no modo 3D.';
    return;
  }
  try{switchView('v3d');await new Promise(r=>setTimeout(r,30));}catch(e){}
  const erro=await cubPrepara3D();
  if(erro){ out.innerHTML='<b style="color:#e0a">'+String(erro).replace(/\n/g,'<br>')+'</b>'; return; }

  if(modo==='liso'){
    // não depende do modelo de blocos: resolve as restrições direto nas superfícies
    const prep=cubPrepRest();
    if(prep.err){ out.innerHTML='<span style="color:#e0a">'+esc(prep.err)+'</span>'; return; }
    if(!prep.rules.length){ out.innerHTML='<span style="color:#e0a">Adicione ao menos uma restrição.</span>'; return; }
    const fecha=cubTemFechamentoVertical(prep.rules);
    if(!fecha.teto||!fecha.piso){
      const falta=[!fecha.teto?'teto':null,!fecha.piso?'base':null].filter(Boolean).join(' e ');
      out.innerHTML='<span style="color:#e0a">O sólido não está fechado verticalmente: falta definir '+falta+'. Use “Entre duas superfícies”, combine “Abaixo” + “Acima” ou informe cotas mín./máx.</span>';
      return;
    }
    let res=parseFloat(String((document.getElementById('cubSolRes')||{}).value||'1').replace(',','.'));
    if(!isFinite(res)||res<=0) res=1;
    // Guarda de tamanho: domínios grandes com resolução fina geram milhões de
    // triângulos, o que trava a cena e produz um bloco chapado sem leitura.
    const dm=cubDominio(prep.rules);
    if(dm){
      const larg=dm.x1-dm.x0, alt=dm.y1-dm.y0;
      const cel=(larg/res)*(alt/res);
      if(cel>1.2e6){
        const sug=Math.ceil(Math.sqrt(larg*alt/1.2e6)*10)/10;
        if(!confirm(`O domínio das restrições tem ${larg.toFixed(0)} × ${alt.toFixed(0)} m.\n`+
          `Com resolução de ${res} m seriam ~${(cel/1e6).toFixed(1)} milhões de células — a cena fica pesada `+
          `e o sólido perde definição.\n\nOK = usar ${sug} m (recomendado)\nCancelar = manter ${res} m`)){
        } else { res=sug; const el=document.getElementById('cubSolRes'); if(el) el.value=res; }
      }
    }
    showLoad('Gerando sólido…'); await new Promise(r=>setTimeout(r,20));
    try{ G=await cubSolidoLiso(prep.rules, res); }
    catch(e){ hideLoad(); out.innerHTML='<b style="color:#e0a">Falha: '+esc(String(e.message||e))+'</b>'; return; }
    if(G.err){ hideLoad(); out.innerHTML='<span style="color:#e0a">'+esc(G.err)+'</span>'; return; }
    // domínio/cotas para cor e enquadramento
    let zmn=Infinity,zmx=-Infinity;
    for(let i=0;i<G.zval.length;i++){ const v=G.zval[i]; if(v<zmn)zmn=v; if(v>zmx)zmx=v; }
    const atual = C && C.rulesSig===cubRestSig() && !C._stale;
    C = {...(atual?C:{}), dom:G.dom, zmn, zmx, vol:atual&&C.vol!=null?C.vol:G.volAprox,
         dens:atual?C.dens:null, blocos:atual&&C.blocos?C.blocos:[], rulesSig:cubRestSig(), _stale:false};
    S._relDom=C;                       // permite reenquadrar sem refazer o sólido
  } else {
    if(!C||!C.blocos.length){
      out.innerHTML='<span style="color:#e0a">O modo escalonado usa o modelo de blocos — gere o modelo na seção 3.</span>';
      toast('Gere o modelo de blocos primeiro'); return; }
    if(C._stale || C.rulesSig!==cubRestSig()){
      out.innerHTML='<span style="color:#e0a">As restrições mudaram desde o último modelo de blocos. Gere o modelo novamente antes de renderizar o sólido escalonado.</span>';
      toast('Modelo de blocos desatualizado'); return; }
    showLoad('Extraindo a casca do modelo…'); await new Promise(r=>setTimeout(r,20));
    try{ G=cubSolidoGeo(C); }
    catch(e){ hideLoad(); out.innerHTML='<b style="color:#e0a">Falha: '+esc(String(e.message||e))+'</b>'; return; }
    if(G.err){ hideLoad(); out.innerHTML='<span style="color:#e0a">'+esc(G.err)+'</span>'; return; }
  }

  const VE=parseFloat(document.getElementById('cubVE').value)||1;
  const chk=(id,d)=>{ const e=document.getElementById(id); return e? e.checked : d; };
  try{
    if(!V3.scene || !V3.ren){ if(!cubCenaMinima(C,VE)){ hideLoad(); out.innerHTML='<b style="color:#e0a">Painel 3D não encontrado.</b>'; return; } }
  }catch(e){ hideLoad(); out.innerHTML='<b style="color:#e0a">Cena: '+esc(String(e.message||e))+'</b>'; return; }

  let OX=V3.OX, OY=V3.OY, z0=V3.z0, ve=V3.VE||VE;
  if(!isFinite(OX)){ OX=(C.dom.x0+C.dom.x1)/2; OY=(C.dom.y0+C.dom.y1)/2; z0=C.zmn; ve=VE;
    V3.OX=OX; V3.OY=OY; V3.z0=z0; V3.VE=ve; }

  // limpa render anterior (sólido ou blocos)
  if(V3.cubGroup){ V3.scene.remove(V3.cubGroup);
    V3.cubGroup.traverse(o=>{ if(o.geometry)o.geometry.dispose(); if(o.material)o.material.dispose(); });
    V3.cubGroup=null; }

  // vértices para a cena (origem local + exagero)
  const n=G.pos.length/3;
  const P=new Float32Array(n*3), CL=new Float32Array(n*3);
  const modoCor=document.getElementById('cubColorMode').value;
  const corFixa=hexToRGB01(document.getElementById('cubColor').value);
  for(let i=0;i<n;i++){
    P[i*3]   = G.pos[i*3]-OX;
    P[i*3+1] = (G.pos[i*3+2]-z0)*ve;
    P[i*3+2] = -(G.pos[i*3+1]-OY);
    let rgb;
    if(modoCor==='cota') rgb=solColor((G.zval[i]-C.zmn)/Math.max(1e-6,C.zmx-C.zmn));
    else rgb=corFixa;
    CL[i*3]=rgb[0]; CL[i*3+1]=rgb[1]; CL[i*3+2]=rgb[2];
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P,3));
  geo.setAttribute('color', new THREE.BufferAttribute(CL,3));
  geo.computeVertexNormals();
  const mat=v3LambertMaterial({vertexColors:true, side:THREE.DoubleSide},
    modo!=='liso'); // sólido liso sem facetas triangulares; blocos continuam facetados
  const mesh=new THREE.Mesh(geo,mat);
  const grupo=new THREE.Group(); grupo.add(mesh);

  if(chk('cubWire',false)){
    const wf=new THREE.MeshBasicMaterial({color:0x1a1a1a, wireframe:true, transparent:true, opacity:0.25});
    grupo.add(new THREE.Mesh(geo,wf));
  }
  V3.cubGroup=grupo; V3.scene.add(grupo);
  /* o sólido agora é um item de camada, não só um objeto solto na cena */
  try{ solRegistra(grupo,{modo:modo,origem:'cubagem',res:(G&&G.res)!=null?G.res:null,
    volume:C&&C.vol!=null?C.vol:(G&&G.volAprox!=null?G.volAprox:null),
    densidade:C&&C.dens!=null?C.dens:null,zmin:C&&C.zmn!=null?C.zmn:null,zmax:C&&C.zmx!=null?C.zmx:null,
    dom:C&&C.dom?{...C.dom}:null,nBlocos:C&&C.totalBlocks!=null?C.totalBlocks:(C&&C.blocos?C.blocos.length:null),
    nExibidos:C&&C.blocos?C.blocos.length:null,fontes:S._cubFontes||null,
    cor:(document.getElementById('cubColor')||{}).value||null}); }catch(e){ console.warn('solRegistra',e); }
  (V3.meshes||[]).forEach(m=>{ m.visible=chk('cubSurfShow',false); });

  if(!chk('cubSurfShow',false) || !(V3.meshes||[]).length){
    const cxm=(C.dom.x0+C.dom.x1)/2-OX, czm=-((C.dom.y0+C.dom.y1)/2-OY);
    const cym=((C.zmn+C.zmx)/2-z0)*ve;
    const raio=Math.max(C.dom.x1-C.dom.x0, C.dom.y1-C.dom.y0, (C.zmx-C.zmn)*ve, 10);
    V3.tgt=[cxm,cym,czm]; V3.radius=raio*1.6; V3.size=raio;
    if(typeof v3ApplyCam==='function') v3ApplyCam();
  }
  v3Resize(); hideLoad();

  const fmt=v=>v.toLocaleString('pt-BR',{maximumFractionDigits:0});
  const nB=(S._cub&&S._cub.blocos)? S._cub.blocos.length : 0;
  const triBloco=nB*12;
  const dz=(C.zmx-C.zmn);
  const chato = dz < Math.max(C.dom.x1-C.dom.x0, C.dom.y1-C.dom.y0)*0.02;
  out.innerHTML=`<b>Sólido renderizado</b> <span style="color:var(--ink-dim)">(${modo==='liso'?'liso · '+G.res+' m':'escalonado'})</span>`+
    `<br><span style="font-size:11px;color:var(--ink-dim)">domínio ${(C.dom.x1-C.dom.x0).toFixed(0)} × ${(C.dom.y1-C.dom.y0).toFixed(0)} m · cotas ${C.zmn.toFixed(1)}–${C.zmx.toFixed(1)} m (${dz.toFixed(1)} m)</span>`+
    (chato? `<br><span style="color:#e0a">⚠ Corpo muito raso para a extensão — confira as restrições (talvez falte limitar por polígono ou por cota).</span>`:'')+
    (S._cub&&S._cub.vol? `<br>Volume do modelo: <b>${fmt(S._cub.vol)} m³</b>`+
       (S._cub.dens? ` · <b>${fmt(S._cub.vol*S._cub.dens)} t</b>`:'') : '')+
    (modo==='liso'&&G.volAprox? `<br>Volume do sólido: <b>${fmt(G.volAprox)} m³</b>`:'')+
    (modo==='liso'&&G.entreInvertido? `<br><span style="font-size:11px;color:var(--ink-dim)">Ordem vertical normalizada automaticamente onde as superfícies se cruzam.</span>`:'')+
    `<br>${fmt(G.nTri)} triângulos`+
    (triBloco? ` <span style="color:var(--ink-dim)">(${(100*(1-G.nTri/triBloco)).toFixed(0)}% mais leve que os ${fmt(triBloco)} dos blocos)</span>`:'')+
    `<br><span style="font-size:11px;color:var(--ink-dim)">arrastar = orbitar · roda/pinça = zoom</span>`;
  toast(`🧊 Sólido: ${fmt(G.nTri)} triângulos`);
}

/* ---------------- render 3D: superfícies e blocos separados ----------------
   Dois caminhos independentes:
     • cubRenderSurf() — monta a cena com as superfícies marcadas (usa build3D,
       o mesmo da aba 3D: luzes, câmera, órbita, drape da ortofoto);
     • cubRenderBlocos() — desenha SÓ os blocos. Se ainda não houver cena,
       cria uma mínima (cena+luz+câmera+renderizador), então funciona sozinho. */

async function cubPrepara3D(){
  try{ if(!webglSuportado()) return 'Sem WebGL neste dispositivo/navegador.'; }
  catch(e){ return 'WebGL indisponível.'; }
  try{ await ensureThree(); }
  catch(e){ return String(e.message||e); }
  return null;
}

/* cena mínima quando só queremos blocos */
function cubCenaMinima(C, VE){
  const wrap=document.getElementById('v3dCanvasWrap');
  if(!wrap) return false;
  if(typeof solProtege==='function')solProtege();
  V3.scene=new THREE.Scene();
  const bg=document.getElementById('v3dBgC');
  V3.scene.background=new THREE.Color((bg&&bg.value)||'#0a0e14');
  V3.scene.add(new THREE.AmbientLight(0xffffff,0.42));
  if(typeof solRestaura==='function')solRestaura();
  const sun=new THREE.DirectionalLight(0xffffff,0.62);
  sun.position.set(-0.5,1,-0.35); V3.scene.add(sun);
  V3.meshes=[];
  V3.OX=(C.dom.x0+C.dom.x1)/2; V3.OY=(C.dom.y0+C.dom.y1)/2;
  V3.z0=C.zmn; V3.VE=VE;
  if(typeof solPosicionaTodos==='function')solPosicionaTodos();   // sólidos anteriores na nova origem
  const span=Math.max(C.dom.x1-C.dom.x0, C.dom.y1-C.dom.y0, 10);
  V3.size=span;
  if(V3.ren && !v3ContextoVivo()) v3DescartaRenderer();   // contexto morreu: refaz
  if(!V3.ren){
    V3.ren=v3CriaRendererSeguro();
    V3.ren.setPixelRatio(Math.min(alagisPerf3D().pixelRatio,window.devicePixelRatio||1));
    wrap.innerHTML=''; wrap.appendChild(V3.ren.domElement);
    V3.ren.domElement.addEventListener('webglcontextlost',ev=>{
      ev.preventDefault();                    // permite a restauração pelo navegador
      if(ev.currentTarget&&ev.currentTarget._alagisDiscarding)return;
      if(V3.raf){ cancelAnimationFrame(V3.raf); V3.raf=null; }
      toast('⚠ Contexto 3D perdido — renderize novamente');
    },false);
  } else if(V3.ren.domElement.parentNode!==wrap){ wrap.innerHTML=''; wrap.appendChild(V3.ren.domElement); }
  // liga os controles UMA vez por canvas (o build3D usa a mesma guarda)
  if(V3.ren.domElement && !V3.ren.domElement._alagisBound){
    v3Bind(V3.ren.domElement); V3.ren.domElement._alagisBound=true;
  }
  v3ObservaTamanho();
  if(!V3.cam) V3.cam=new THREE.PerspectiveCamera(55,1,1,span*40);
  V3.cam.far=span*40; V3.cam.updateProjectionMatrix();
  V3.tgt=[0,((C.zmn+C.zmx)/2-C.zmn)*VE,0];
  V3.radius=Math.max(span, (C.zmx-C.zmn)*VE)*1.6;
  V3.theta=Math.PI*0.75; V3.phi=Math.PI*0.22;
  v3Resize(); if(typeof v3ApplyCam==='function') v3ApplyCam();
  if(!V3.raf){ const loop=t=>{ V3.raf=requestAnimationFrame(loop);
    const cfg=alagisPerf3D(),dt=1000/cfg.fps;
    if((!V3._frameLast||t-V3._frameLast>=dt)&&V3.ren&&V3.scene&&V3.cam){
      V3._frameLast=t;try{v3AtualizaFitas();V3.ren.render(V3.scene,V3.cam);}catch(e){}
    }
  }; loop(); }
  return true;
}

/* ---- BOTÃO 1: superfícies ---- */
async function cubRenderSurf(){
  const out=document.getElementById('cub3dOut');
  const ativas=cubSurfsAtivas();
  if(!ativas.length){ out.innerHTML='<span style="color:#e0a">Marque ao menos uma superfície na seção 1.</span>'; return; }
  out.innerHTML='Carregando motor 3D…';
  const err=await cubPrepara3D();
  if(err){ out.innerHTML='<b style="color:#e0a">'+String(err).replace(/\n/g,'<br>')+'</b>'; return; }

  const VE=parseFloat(document.getElementById('cubVE').value)||1;
  showLoad('Renderizando superfícies…');
  await new Promise(r=>setTimeout(r,20));
  // guarda os blocos: build3D recria a cena
  const blocosNaCena=!!V3.cubGroup;
  refresh3DPanel();
  const ids=new Set(ativas.map(r=>String(r.id)));   /* por String: id não-numérico virava NaN */
  document.querySelectorAll('#v3dRas input[type=checkbox]').forEach(c=>{
    c.checked=ids.has(String(c.dataset.rid)); });
  const veEl=document.getElementById('v3dVE'); if(veEl) veEl.value=VE;
  const vecEl=document.getElementById('v3dVec'); if(vecEl) vecEl.checked=false;
  // SÓ O TOPO recebe textura (ortofoto); as demais superfícies vão em cor sólida.
  // O topo é inferido das restrições: o "topo" de um Entre, ou o alvo de um Abaixo.
  const idTopo=cubIdTopo();
  ativas.forEach(r=>{ r._v3=r._v3||{papel:'terreno',cor:'#8d5524',limId:''};
    if(idTopo!=null){ r._v3.papel = (String(r.id)===String(idTopo))? 'terreno' : 'cava'; }
  });
  const drEl=document.getElementById('v3dDrape');
  if(drEl) drEl.checked = !!(S.img && S.img.url && idTopo!=null);
  V3.cubGroup=null;                       // será recriado se havia blocos
  try{ await build3D(); }
  catch(e){ hideLoad();
    const det=(e&&e.stack? String(e.stack).split('\n').slice(0,3).join('<br>') : String(e&&e.message||e));
    out.innerHTML='<b style="color:#e0a">Falha ao montar a cena:</b><br>'+
      '<span style="font-size:11px">'+esc(det)+'</span>'+
      '<br><br>Tente <b>Renderizar blocos</b> sem superfícies (funciona sozinho).';
    return; }
  hideLoad();
  if(!V3.scene){ out.innerHTML='<b style="color:#e0a">Cena não montada.</b>'; return; }
  out.innerHTML=`<b>${ativas.length}</b> superfície(s) em cena.`+
    (S._cub&&S._cub.blocos&&S._cub.blocos.length
      ? '<br>Agora toque em <b>Renderizar blocos</b> para sobrepor o modelo.'
      : '<br>Gere o modelo de blocos para sobrepô-lo aqui.');
  toast('🗻 Superfícies renderizadas');
  if(blocosNaCena) cubRenderBlocos();     // reaplica os blocos que estavam em cena
}

/* ---- BOTÃO 2: blocos ---- */
async function cubRenderBlocos(){
  const C=S._cub, out=document.getElementById('cub3dOut');
  if(!C||!C.blocos.length){ toast('Gere o modelo de blocos primeiro (seção 3)'); return; }
  cubProjecao2D(C);
  try{switchView('v3d');await new Promise(r=>setTimeout(r,30));}catch(e){}
  const err=await cubPrepara3D();
  if(err){ out.innerHTML='<b style="color:#e0a">'+String(err).replace(/\n/g,'<br>')+'</b>'; return; }
  const chk=(id,d)=>{ const e=document.getElementById(id); return e? e.checked : d; };
  const VE=parseFloat(document.getElementById('cubVE').value)||1;

  showLoad('Renderizando blocos…');
  await new Promise(r=>setTimeout(r,20));

  // cena: reaproveita a das superfícies; se não houver, cria uma mínima
  try{
    if(!V3.scene || !V3.ren){
      if(!cubCenaMinima(C, VE)){ hideLoad(); out.innerHTML='<b style="color:#e0a">Painel 3D não encontrado.</b>'; return; }
    }
  }catch(e){ hideLoad();
    out.innerHTML='<b style="color:#e0a">Falha ao criar a cena:</b><br><span style="font-size:11px">'+
      esc(String(e&&e.stack||e).split('\n').slice(0,3).join(' | '))+'</span>'; return; }
  // superfícies visíveis conforme a opção
  (V3.meshes||[]).forEach(m=>{ m.visible=chk('cubSurfShow',false); });

  let OX=V3.OX, OY=V3.OY, z0=V3.z0, ve=V3.VE||VE;
  if(!isFinite(OX)||!isFinite(OY)||!isFinite(z0)){
    OX=(C.dom.x0+C.dom.x1)/2; OY=(C.dom.y0+C.dom.y1)/2; z0=C.zmn; ve=VE;
    V3.OX=OX; V3.OY=OY; V3.z0=z0; V3.VE=ve;
  }
  // limpa blocos anteriores
  if(V3.cubGroup){ V3.scene.remove(V3.cubGroup);
    V3.cubGroup.traverse(o=>{ if(o.geometry)o.geometry.dispose(); if(o.material)o.material.dispose(); });
    V3.cubGroup=null; }

  const clipPct=+document.getElementById('cubClip').value/100;
  const zCorte=C.zmn+(C.zmx-C.zmn)*clipPct;
  const vis=C.blocos.filter(b=>b.z<=zCorte);
  if(!vis.length){ hideLoad(); out.innerHTML='<span style="color:#e0a">O corte escondeu todos os blocos.</span>'; return; }
  const MAXB=200000, passo=Math.max(1,Math.ceil(vis.length/MAXB));
  const usados=passo>1? vis.filter((_,i)=>i%passo===0) : vis;

  const grupo=new THREE.Group();
  const modoCor=document.getElementById('cubColorMode').value;
  const corFixa=hexToRGB01(document.getElementById('cubColor').value);
  const geo=new THREE.BoxGeometry(1,1,1);
  const mat=new THREE.MeshLambertMaterial({vertexColors:true});
  const mesh=new THREE.InstancedMesh(geo,mat,usados.length);
  const m4=new THREE.Matrix4(), q=new THREE.Quaternion(),
        pos=new THREE.Vector3(), scl=new THREE.Vector3(), cor=new THREE.Color();
  usados.forEach((b,i)=>{
    pos.set(b.x-OX,(b.z-z0)*ve,-(b.y-OY));
    scl.set(b.dx,b.dz*ve,b.dy);
    m4.compose(pos,q,scl); mesh.setMatrixAt(i,m4);
    let rgb;
    if(modoCor==='cota') rgb=hypsoColor((b.z-C.zmn)/Math.max(1e-6,C.zmx-C.zmn));
    else if(modoCor==='attr'&&Number.isFinite(b.attr))
      rgb=hypsoColor((b.attr-(Number.isFinite(C.attrMin)?C.attrMin:b.attr))/Math.max(1e-6,(Number.isFinite(C.attrMax)?C.attrMax:b.attr)-(Number.isFinite(C.attrMin)?C.attrMin:b.attr)));
    else if(modoCor==='frac') rgb = b.sub? [0.85,0.55,0.20] : [0.30,0.55,0.80];
    else rgb=corFixa;
    cor.setRGB(rgb[0],rgb[1],rgb[2]); mesh.setColorAt(i,cor);
  });
  mesh.instanceMatrix.needsUpdate=true;
  if(mesh.instanceColor) mesh.instanceColor.needsUpdate=true;
  grupo.add(mesh);

  if(chk('cubWire',false)){
    const wf=new THREE.MeshBasicMaterial({color:0x1a1a1a,wireframe:true,transparent:true,opacity:0.30});
    const wm=new THREE.InstancedMesh(geo,wf,usados.length);
    usados.forEach((b,i)=>{ pos.set(b.x-OX,(b.z-z0)*ve,-(b.y-OY)); scl.set(b.dx,b.dz*ve,b.dy);
      m4.compose(pos,q,scl); wm.setMatrixAt(i,m4); });
    wm.instanceMatrix.needsUpdate=true; grupo.add(wm);
  }
  V3.cubGroup=grupo; V3.scene.add(grupo);
  try{ const sol=solRegistra(grupo,{modo:'blocos',origem:'cubagem',nBlocos:C.totalBlocks!=null?C.totalBlocks:usados.length,nExibidos:usados.length,
    cor:(document.getElementById('cubColor')||{}).value||null});
    if(sol)sol._blocos=C.blocos;      /* todos os blocos (não só os exibidos): volume por cota exato */
  }catch(e){ console.warn('solRegistra',e); }

  // Enquadra sempre o sólido recém-renderizado: antes a câmera só era
  // ajustada quando as superfícies estavam ocultas, e nos demais casos ficava
  // na posição anterior — resultado: o corpo aparecia colado na lente.
  cubEnquadra(C, OX, OY, z0, ve);
  v3Resize();
  requestAnimationFrame(()=>{ v3Resize(); cubEnquadra(C, OX, OY, z0, ve); });
  hideLoad();

  const fmt=v=>v.toLocaleString('pt-BR',{maximumFractionDigits:0});
  out.innerHTML=`<b>${fmt(usados.length)}</b> blocos em cena`+
    (passo>1? ` <span style="color:var(--ink-dim)">(1 a cada ${passo} — limite de desempenho)</span>`:'')+
    (C.imported&&C.totalBlocks>C.blocos.length?`<br>Amostra de ${fmt(C.totalBlocks)} blocos filtrados no arquivo`:'')+
    (clipPct<1? `<br>Corte em <b>${zCorte.toFixed(1)} m</b>`:'')+
    ((V3.meshes||[]).length? `<br>Superfícies: ${chk('cubSurfShow',false)?'visíveis':'ocultas'}`:'')+
    `<br>Volume do modelo: <b>${fmt(C.vol)} m³</b>`+
    (C.dens? `<br>Massa: <b>${fmt(C.vol*C.dens)} t</b>`:'')+
    `<br><span style="font-size:11px;color:var(--ink-dim)">arrastar = orbitar · roda/pinça = zoom · botão direito = pan</span>`;
  toast('🧊 Blocos renderizados');
}

/* ---- limpar apenas os blocos da cena ---- */
function cubLimpa3D(){
  if(V3.cubGroup && V3.scene){
    V3.scene.remove(V3.cubGroup);
    V3.cubGroup.traverse(o=>{ if(o.geometry)o.geometry.dispose(); if(o.material)o.material.dispose(); });
    V3.cubGroup=null;
  }
  (V3.meshes||[]).forEach(m=>{ m.visible=true; });
  const out=document.getElementById('cub3dOut');
  if(out) out.innerHTML='Blocos removidos da cena.';
  toast('🧹 Blocos removidos');
}
function cubClipLbl(){
  const C=S._cub, el=document.getElementById('cubClipLbl'); if(!el) return;
  const pct=+document.getElementById('cubClip').value/100;
  if(!C || pct>=1){ el.textContent='todas as cotas'; return; }
  el.textContent=`mostrando abaixo de ${(C.zmn+(C.zmx-C.zmn)*pct).toFixed(1)} m`;
}

/* ---------------- saídas ---------------- */
function cubToCSV(){
  const C=S._cub; if(!C||!C.blocos.length){ toast('Gere o modelo primeiro'); return; }
  const h=['X','Y','Z','DX','DY','DZ','TIPO','VOL_M3'].concat(C.dens?['TON']:[]);
  const L=[h.join(',')];
  C.blocos.forEach(b=>{ const v=b.dx*b.dy*b.dz;
    const linha=[b.x.toFixed(3),b.y.toFixed(3),b.z.toFixed(3),
      b.dx.toFixed(3),b.dy.toFixed(3),b.dz.toFixed(3), b.sub?'sub':'pai', v.toFixed(3)];
    if(C.dens) linha.push((v*C.dens).toFixed(3));
    L.push(linha.join(',')); });
  download(new Blob([L.join('\n')],{type:'text/csv'}), `modelo_blocos_${C.bx}x${C.by}x${C.bz}m.csv`);
  toast(`⤓ CSV com ${C.blocos.length.toLocaleString('pt-BR')} blocos`);
}
function cubToPoints(){
  const C=S._cub; if(!C||!C.blocos.length){ toast('Gere o modelo primeiro'); return; }
  if(C.blocos.length>200000 && !confirm(`${C.blocos.length.toLocaleString('pt-BR')} blocos — a camada pode ficar pesada. Continuar?`)) return;
  const feats=C.blocos.map(b=>{ const v=b.dx*b.dy*b.dz;
    const props={X:+b.x.toFixed(3),Y:+b.y.toFixed(3),Z:+b.z.toFixed(3),
      DX:+b.dx.toFixed(3),DY:+b.dy.toFixed(3),DZ:+b.dz.toFixed(3),
      TIPO:b.sub?'sub':'pai', VOL_M3:+v.toFixed(3)};
    if(C.dens) props.TON=+(v*C.dens).toFixed(3);
    return {geom:[[b.x,b.y]], multi:false, zg:[+b.z.toFixed(3)], props}; });
  const fields=[{name:'X',type:'F'},{name:'Y',type:'F'},{name:'Z',type:'F'},
    {name:'DX',type:'F'},{name:'DY',type:'F'},{name:'DZ',type:'F'},
    {name:'TIPO',type:'C'},{name:'VOL_M3',type:'F'}];
  if(C.dens) fields.push({name:'TON',type:'F'});
  addLayer({sourceLayer:cubProductSource(C),name:`Blocos ${C.bx}×${C.by}×${C.bz} m`.slice(0,60), gtype:'point',
    crs:S.workCRS, features:feats, fields});
  refreshUI(); toast(`✅ ${feats.length.toLocaleString('pt-BR')} centroides`);
}
function cubToIso(){
  const C=S._cub; if(!C||!C.blocos.length){ toast('Gere o modelo primeiro'); return; }
  // espessura = soma de dz dos blocos por coluna (célula = menor sub-bloco em XY)
  const cs=Math.min(C.bx/C.sx, C.by/C.sy);
  const nx=Math.max(1,Math.ceil((C.dom.x1-C.dom.x0)/cs)), ny=Math.max(1,Math.ceil((C.dom.y1-C.dom.y0)/cs));
  if(nx*ny>4e6){ toast('Grade muito fina para o raster — aumente o sub-bloco'); return; }
  const acc=new Float32Array(nx*ny);
  C.blocos.forEach(b=>{
    const i0=Math.floor((b.x-b.dx/2-C.dom.x0)/cs), i1=Math.ceil((b.x+b.dx/2-C.dom.x0)/cs);
    const j0=Math.floor((b.y-b.dy/2-C.dom.y0)/cs), j1=Math.ceil((b.y+b.dy/2-C.dom.y0)/cs);
    for(let j=Math.max(0,j0);j<Math.min(ny,j1);j++) for(let i=Math.max(0,i0);i<Math.min(nx,i1);i++)
      acc[j*nx+i]+=b.dz;
  });
  const z=new Float32Array(nx*ny);
  for(let j=0;j<ny;j++) for(let i=0;i<nx;i++){ const v=acc[j*nx+i]; z[(ny-1-j)*nx+i]= v>0? v : NaN; }
  const r={id:rid++, name:`Espessura do modelo (${cs.toFixed(1)} m)`,
    d:{nc:nx,nr:ny,cs,xll:C.dom.x0,yll:C.dom.y0,z},
    style:{mode:'hipso',opacity:0.85}, visible:true, overlay:null, groupId:null};
  S.rasters.push(r);placeProductAbove(r,cubProductSource(C)); renderRaster(r); refreshUI();
  projectAutoSaveRaster(r);
  try{ if(r.overlay&&r.overlay.getBounds) safeFit(r.overlay.getBounds()); }catch(e){}
  toast('✅ Raster de espessura gerado');
}

/* ============ RELATÓRIO DE VOLUME POR BANCADA ==============================
   Fatia o sólido das restrições por patamares e reporta, para cada bancada,
   o volume in situ, o acumulado, a massa e o volume empolado.
   Os patamares são detectados pelo histograma das cotas da superfície de base:
   as praças concentram muitas células na mesma cota e aparecem como picos.  */
/* Preenche NaN da grade pelo VIZINHO MAIS PRÓXIMO (transformada de distância
   aproximada em duas varreduras — direta e reversa — propagando o índice da
   célula-fonte). Usada quando a superfície de contato do capeamento não cobre
   todo o domínio de cálculo: sem isso as células sem dado sumiriam do
   relatório e o total não fecharia com a cubagem.                            */
function relFillNN(d){
  const nc=d.nc, nr=d.nr, n=nc*nr;
  const z=Float64Array.from(d.z);
  const src=new Int32Array(n).fill(-1);
  const dist=new Float64Array(n).fill(Infinity);
  let faltam=0;
  for(let i=0;i<n;i++){ if(isNaN(z[i])) faltam++; else { src[i]=i; dist[i]=0; } }
  if(faltam===n) return {grid:null, faltam};
  if(faltam===0) return {grid:Object.assign({},d,{z}), faltam:0};
  const test=(i,j)=>{
    const p=src[j]; if(p<0) return;
    const dx=(i%nc)-(p%nc), dy=((i/nc)|0)-((p/nc)|0);
    const dd=dx*dx+dy*dy;
    if(dd<dist[i]){ dist[i]=dd; src[i]=p; }
  };
  for(let r=0;r<nr;r++) for(let c=0;c<nc;c++){ const i=r*nc+c;
    if(c>0) test(i,i-1);
    if(r>0){ test(i,i-nc); if(c>0) test(i,i-nc-1); if(c<nc-1) test(i,i-nc+1); } }
  for(let r=nr-1;r>=0;r--) for(let c=nc-1;c>=0;c--){ const i=r*nc+c;
    if(c<nc-1) test(i,i+1);
    if(r<nr-1){ test(i,i+nc); if(c<nc-1) test(i,i+nc+1); if(c>0) test(i,i+nc-1); } }
  for(let i=0;i<n;i++) if(isNaN(z[i]) && src[i]>=0) z[i]=d.z[src[i]];
  return {grid:Object.assign({},d,{z}), faltam};
}
/* Amostra a grade já preenchida; fora da extensão do raster, projeta o ponto
   na borda e pega a célula mais próxima (mesma lógica de vizinho próximo).  */
function relSampleCap(dF,x,y){
  let v=sampleZbil(dF,x,y);
  if(!isNaN(v)) return v;
  const cx=Math.min(Math.max(x, dF.xll+dF.cs*0.5), dF.xll+(dF.nc-0.5)*dF.cs);
  const cy=Math.min(Math.max(y, dF.yll+dF.cs*0.5), dF.yll+(dF.nr-0.5)*dF.cs);
  return sampleZnear(dF,cx,cy);
}
function relCapFillSurfs(){
  const sel=document.getElementById('relCapSurf'); if(!sel) return;
  const cur=sel.value;
  sel.innerHTML = S.rasters.length
    ? S.rasters.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')
    : '<option value="">— nenhuma superfície carregada —</option>';
  if(cur && S.rasters.some(r=>String(r.id)===String(cur))) sel.value=cur;
}
function relCapToggle(){
  const m=(document.getElementById('relCapModo')||{}).value||'nao';
  const sh=(id,on)=>{ const e=document.getElementById(id); if(e) e.style.display=on?'block':'none'; };
  sh('relCapEspBox', m==='esp'); sh('relCapSurfBox', m==='surf'); sh('relCapDensBox', m!=='nao');
  if(m==='surf') relCapFillSurfs();
}

function relDetectaPracas(zb, tolFrac){
  const bin=0.5, h=new Map();
  zb.forEach(v=>{ const k=Math.round(v/bin)*bin; h.set(k,(h.get(k)||0)+1); });
  const tot=zb.length||1;
  const picos=[...h.entries()].filter(([k,c])=>c/tot>=(tolFrac||0.02)).map(p=>p[0]);
  // agrupa picos vizinhos (a mesma praça pode cair em dois bins)
  picos.sort((a,b)=>a-b);
  const out=[];
  picos.forEach(v=>{ if(!out.length || v-out[out.length-1]>1.5) out.push(v);
    else out[out.length-1]=(out[out.length-1]+v)/2; });
  return out;
}

async function relBancadas(){
  const out=document.getElementById('relOut');
  const prep=cubPrepRest();
  if(prep.err){ out.innerHTML='<span style="color:#e0a">'+esc(prep.err)+'</span>'; return; }
  if(!prep.rules.length){ out.innerHTML='<span style="color:#e0a">Adicione ao menos uma restrição (seção 2).</span>'; return; }
  const dom=cubDominio(prep.rules);
  if(!dom){ out.innerHTML='<span style="color:#e0a">As restrições não definem um volume.</span>'; return; }
  const num=(id,d)=>{ const v=parseFloat(String((document.getElementById(id)||{}).value).replace(',','.'));
    return isFinite(v)? v : d; };
  let res=num('relRes',1); if(res<=0) res=1;
  const dens=num('relDens',0), emp=num('relEmp',0);
  /* --- capeamento (estéril): espessura média OU superfície de contato --- */
  const capModo=(document.getElementById('relCapModo')||{}).value||'nao';
  const capOn=(capModo!=='nao');
  const capEsp=num('relCapEsp',0);
  const capDens=capOn? num('relCapDens',0):0, capEmp=capOn? num('relCapEmp',0):0;
  let capGrid=null, capRaw=null, capNome='\u2014', capExtrap=0;
  if(capModo==='surf'){
    const rr=S.rasters.find(r=>String(r.id)===String((document.getElementById('relCapSurf')||{}).value));
    if(!rr){ out.innerHTML='<span style="color:#e0a">Escolha a superf\u00edcie de contato do capeamento.</span>'; return; }
    const F=relFillNN(rr.d);
    if(!F.grid){ out.innerHTML='<span style="color:#e0a">A superf\u00edcie de contato n\u00e3o tem nenhuma c\u00e9lula v\u00e1lida.</span>'; return; }
    capGrid=F.grid; capRaw=rr.d; capNome=rr.name;
  }
  if(capModo==='esp' && !(capEsp>0)){
    out.innerHTML='<span style="color:#e0a">Informe a espessura do capeamento (m).</span>'; return; }
  const nx=Math.ceil((dom.x1-dom.x0)/res), ny=Math.ceil((dom.y1-dom.y0)/res);
  if(nx*ny>4e6){ out.innerHTML=`<span style="color:#e0a">Grade ${nx}×${ny} muito fina — aumente a resolução.</span>`; return; }

  showLoad('Calculando volumes por bancada…');
  await new Promise(r=>setTimeout(r,20));

  // teto e piso em cada célula (mesma resolução analítica do sólido liso)
  const zt=[], zb=[], zk=[];   // teto, piso e base do capeamento
  for(let j=0;j<ny;j++){ const Y=dom.y0+(j+0.5)*res;
    for(let i=0;i<nx;i++){ const X=dom.x0+(i+0.5)*res;
      let teto=Infinity, piso=-Infinity, val=true;
      for(const R of prep.rules){
        if(R.t==='entre'){ const a=sampleZbil(R.A.d,X,Y), b=sampleZbil(R.B.d,X,Y);
          if(isNaN(a)||isNaN(b)){ val=false; break; } teto=Math.min(teto,a); piso=Math.max(piso,b); }
        else if(R.t==='abaixo'){ const a=sampleZbil(R.A.d,X,Y); if(isNaN(a)){val=false;break;} teto=Math.min(teto,a); }
        else if(R.t==='acima'){ const a=sampleZbil(R.A.d,X,Y); if(isNaN(a)){val=false;break;} piso=Math.max(piso,a); }
        else if(R.t==='cota'){ if(isFinite(R.zmax)) teto=Math.min(teto,R.zmax);
          if(isFinite(R.zmin)) piso=Math.max(piso,R.zmin); }
        else if(R.t==='dentro'){ if(!R.rings.some(rg=>pointInRing(X,Y,rg))){val=false;break;} }
        else if(R.t==='fora'){ if(R.rings.some(rg=>pointInRing(X,Y,rg))){val=false;break;} }
      }
      if(!val||!isFinite(teto)||!isFinite(piso)||piso>=teto) continue;
      // base do capeamento: por padrão coincide com o teto (capeamento nulo)
      let zc=teto;
      if(capModo==='esp'){ zc=teto-capEsp; }
      else if(capModo==='surf'){
        if(isNaN(sampleZbil(capRaw,X,Y))) capExtrap++;
        const vc=relSampleCap(capGrid,X,Y);
        zc=isNaN(vc)? teto : vc;
      }
      if(zc>teto) zc=teto; if(zc<piso) zc=piso;   // nunca fora do corpo
      zt.push(teto); zb.push(piso); zk.push(zc);
    } }
  if(!zt.length){ hideLoad(); out.innerHTML='<span style="color:#e0a">Nenhuma célula com espessura.</span>'; return; }

  // patamares
  const modo=(document.getElementById('relModo')||{}).value||'auto';
  let niveis;
  if(modo==='manual'){
    const H=num('relH',15), z0=num('relZ0',Math.min(...zb));
    const zmax=Math.max(...zt);
    niveis=[]; for(let z=z0; z<zmax+H; z+=H) niveis.push(+z.toFixed(2));
  } else {
    niveis=relDetectaPracas(zb,0.02);
    if(niveis.length<2){ // sem patamares claros: fatia regular de 10 m
      const a=Math.min(...zb), b=Math.max(...zt);
      niveis=[]; for(let z=Math.floor(a); z<b; z+=10) niveis.push(z);
    }
  }
  const zmax=Math.max(...zt);
  if(niveis[niveis.length-1] < zmax) niveis.push(+zmax.toFixed(2));
  niveis=[...new Set(niveis)].sort((a,b)=>a-b);

  // volume por fatia (de cima para baixo, como a lavra avança)
  const A=res*res;
  const linhas=[];
  let acum=0, acumCap=0, acumRoc=0;
  for(let k=niveis.length-1;k>0;k--){
    const b0=niveis[k-1], b1=niveis[k];
    let v=0, vCap=0, area=0;
    for(let i=0;i<zt.length;i++){
      const lo=Math.max(zb[i],b0), hi=Math.min(zt[i],b1);
      if(hi>lo){
        v+=(hi-lo)*A; area+=A;
        // capeamento = parte da fatia acima da base do capeamento (zk)
        const cl=Math.max(zk[i],lo);
        if(hi>cl) vCap+=(hi-cl)*A;
      }
    }
    if(v<=0) continue;
    acum+=v; acumCap+=vCap; acumRoc+=(v-vCap);
    linhas.push({nome:(k===niveis.length-1)?'Topo':`Bancada ${niveis.length-k-1}`,
      de:b0, ate:b1, h:b1-b0, area, vol:v, cap:vCap, roc:v-vCap,
      acum, acumCap, acumRoc});
  }
  const total=acum, totalCap=acumCap, totalRoc=acumRoc;
  // REM — relação estéril/minério. Em volume sempre; em massa só quando as
  // duas densidades foram informadas (é a forma usual em relatório de lavra).
  const remV = totalRoc>0 ? totalCap/totalRoc : null;
  const remM = (totalRoc>0 && dens>0 && capDens>0) ? (totalCap*capDens)/(totalRoc*dens) : null;
  const pctCap = total>0 ? 100*totalCap/total : 0, pctRoc = total>0 ? 100*totalRoc/total : 0;
  S._rel={linhas,total,totalCap,totalRoc,remV,remM,pctCap,pctRoc,dens,emp,dom,res,niveis,
          cel:{zt:Float32Array.from(zt), zb:Float32Array.from(zb), zk:Float32Array.from(zk), A:res*res},
          cap:{modo:capModo, esp:capEsp, nome:capNome, dens:capDens, emp:capEmp, extrap:capExtrap},
          topo:(prep.rules.find(r=>r.A)||{}).A?.name||'—',
          base:(prep.rules.find(r=>r.B)||{}).B?.name||'—'};
  hideLoad();

  const f0=v=>v.toLocaleString('pt-BR',{maximumFractionDigits:0});
  const f2=v=>v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const thR='style="text-align:right"';
  let html='<table style="width:100%;border-collapse:collapse;font-size:11px">'+
    '<tr style="background:var(--line);font-weight:600">'+
    '<td style="padding:3px 4px">Bancada</td><td '+thR+'>Cotas</td>'+
    '<td '+thR+'>h (m)</td>'+
    (capOn? '<td '+thR+'>Estéril (m³)</td><td '+thR+'>Minério (m³)</td>' : '')+
    '<td '+thR+'>Total (m³)</td>'+
    '<td '+thR+'>Acum. (m³)</td></tr>';
  linhas.forEach(l=>{ html+=`<tr style="border-bottom:1px solid var(--line)">`+
    `<td style="padding:3px 4px">${l.nome}</td>`+
    `<td ${thR}>${l.de.toFixed(0)}–${l.ate.toFixed(0)}</td>`+
    `<td ${thR}>${l.h.toFixed(1)}</td>`+
    (capOn? `<td ${thR}>${f0(l.cap)}</td><td ${thR}>${f0(l.roc)}</td>` : '')+
    `<td ${thR}>${f0(l.vol)}</td>`+
    `<td ${thR}>${f0(l.acum)}</td></tr>`; });
  html+='</table>';
  html+=`<div style="margin-top:8px;line-height:1.55">`+
    `<b>Total in situ: ${f0(total)} m³</b>`;
  if(capOn){
    html+=`<div style="margin-top:6px;padding:6px 8px;border:1px solid var(--line);border-radius:8px">`+
      `<b>Capeamento (estéril): ${f0(totalCap)} m³</b> in situ`+
      (capDens>0? `<br>Massa de estéril: <b>${f0(totalCap*capDens)} t</b> <span style="color:var(--ink-dim)">(${f2(capDens)} t/m³)</span>`:'')+
      (capEmp>0? `<br>Estéril empolado: <b>${f0(totalCap*(1+capEmp/100))} m³</b> <span style="color:var(--ink-dim)">(empolamento ${f0(capEmp)}% — capacidade do depósito)</span>`:'')+
      `<br><span style="font-size:11px;color:var(--ink-dim)">Critério: `+
      (capModo==='esp'? `espessura média de ${f2(capEsp)} m` : `superfície de contato “${esc(capNome)}”`)+
      (capExtrap>0? ` · ${f0(capExtrap)} célula(s) extrapoladas por vizinho mais próximo`:'')+
      `</span></div>`+
      `<div style="margin-top:6px"><b>Minério (rocha sã): ${f0(totalRoc)} m³</b> in situ`+
      (dens>0? `<br>Massa de minério: <b>${f0(totalRoc*dens)} t</b> <span style="color:var(--ink-dim)">(${f2(dens)} t/m³)</span>`:'')+
      (emp>0? `<br>Minério empolado: <b>${f0(totalRoc*(1+emp/100))} m³</b> <span style="color:var(--ink-dim)">(empolamento ${f0(emp)}%)</span>`:'')+
      `</div>`+
      `<div style="margin-top:6px;padding:6px 8px;border:1px solid var(--amber);border-radius:8px">`+
      `Repartição do volume total: <b>${pctCap.toFixed(1)}% estéril</b> · <b>${pctRoc.toFixed(1)}% minério</b>`+
      (remV!=null? `<br><b style="font-size:13px">REM = ${remV.toFixed(2)} m³/m³</b> <span style="color:var(--ink-dim)">(estéril / minério, volume in situ)</span>`:'')+
      (remM!=null? `<br><b style="font-size:13px">REM = ${remM.toFixed(2)} t/t</b> <span style="color:var(--ink-dim)">(em massa)</span>`:'')+
      (remV==null? `<br><span style="color:var(--ink-dim)">Sem minério no corpo — REM indefinida.</span>`:'')+
      `</div>`;
  } else {
    html+=(dens>0? `<br>Massa: <b>${f0(total*dens)} t</b> <span style="color:var(--ink-dim)">(${f2(dens)} t/m³)</span>`:'')+
          (emp>0? `<br>Volume empolado: <b>${f0(total*(1+emp/100))} m³</b> <span style="color:var(--ink-dim)">(empolamento ${f0(emp)}%)</span>`:'');
  }
  html+=`<br><span style="font-size:11px;color:var(--ink-dim)">${linhas.length} bancada(s) · patamares ${niveis.map(v=>v.toFixed(0)).join(' · ')} · grade ${res} m</span>`+
    `</div>`;
  out.innerHTML=html;
  toast(`📊 ${linhas.length} bancada(s) · ${f0(total)} m³`);
}

/* PDF do relatório — desenhado num canvas e empacotado pelo gerador existente.
   ATENÇÃO à unidade: o canvas trabalha em milímetros (S1 = px por mm), mas os
   tamanhos de fonte são dados em PONTOS. A conversão pt→mm (×25,4/72) é
   obrigatória; sem ela o texto sai 2,8× maior e as colunas se sobrepõem.   */
async function relPDF(){
  const R=S._rel;
  if(!R||!R.linhas.length){ toast('Gere o relatório primeiro'); return; }
  showLoad('Montando PDF…'); await new Promise(r=>setTimeout(r,20));

  const PW=210, PH=297, DPI=200;
  const px=Math.round(PW/25.4*DPI), py=Math.round(PH/25.4*DPI);
  const cv=document.createElement('canvas'); cv.width=px; cv.height=py;
  const g=cv.getContext('2d');
  g.fillStyle='#ffffff'; g.fillRect(0,0,px,py);
  const S1=px/PW;                    // px por mm
  const PT=25.4/72;                  // 1 pt em mm
  const X=mm=>mm*S1, Y=mm=>mm*S1;

  const txt=(t,pt,xmm,ymm,al,bold,cor)=>{
    g.font=`${bold?'600 ':''}${(pt*PT*S1).toFixed(2)}px Signika, "Segoe UI", Arial, sans-serif`;
    g.fillStyle=cor||'#111'; g.textAlign=al||'left'; g.textBaseline='alphabetic';
    g.fillText(t, X(xmm), Y(ymm));
  };
  const linha=(x1,y1,x2,y2,w,cor)=>{ g.strokeStyle=cor||'#888'; g.lineWidth=Math.max(1,(w||0.25)*S1);
    g.beginPath(); g.moveTo(X(x1),Y(y1)); g.lineTo(X(x2),Y(y2)); g.stroke(); };
  const caixa=(xm,ym,wm,hm,fill)=>{ g.fillStyle=fill; g.fillRect(X(xm),Y(ym),X(wm),Y(hm)); };
  const f0=v=>v.toLocaleString('pt-BR',{maximumFractionDigits:0});
  const f2=v=>v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});

  const ML=18, MR=192, LARG=MR-ML;
  const AMBAR='#b8860b', TINTA='#1a1a1a', CINZA='#666';

  /* ---- cabeçalho com a marca ---- */
  let y=16;
  try{
    if(typeof CCM_LOGO==='string' && CCM_LOGO){
      const img=new Image();
      await new Promise(res=>{ img.onload=res; img.onerror=res; img.src=CCM_LOGO; });
      if(img.width){ const lw=32, lh=lw*(img.height/img.width);
        g.drawImage(img, X(MR-lw), Y(y-4), X(lw), Y(lh)); }
    }
  }catch(e){}
  txt('RELATÓRIO DE VOLUME POR BANCADA', 15, ML, y+3, 'left', true, TINTA); y+=8;
  txt('Cubagem entre superfícies · CCMGIS', 9, ML, y, 'left', false, CINZA); y+=6;
  linha(ML,y,MR,y,0.6,AMBAR); y+=7;

  /* ---- identificação ---- */
  const ident=[
    ['Superfície de topo', R.topo],
    ['Superfície de base', R.base],
    ['Domínio de cálculo', `${(R.dom.x1-R.dom.x0).toFixed(0)} × ${(R.dom.y1-R.dom.y0).toFixed(0)} m · grade ${R.res} m`],
    ['Patamares adotados', R.niveis.map(v=>v.toFixed(0)).join(' · ')+' m'],
    ['Emissão', new Date().toLocaleString('pt-BR')],
  ];
  ident.forEach(([a,b])=>{ txt(a+':',9,ML,y,'left',true,TINTA); txt(String(b),9,ML+42,y,'left',false,TINTA); y+=5.2; });
  y+=4;

  /* ---- tabela (colunas extras quando há capeamento) ---- */
  const CAP = !!(R.cap && R.cap.modo && R.cap.modo!=='nao');
  const col = CAP ? [ML, ML+26, ML+48, ML+60, ML+84, ML+108, ML+132, ML+154, MR]
                  : [ML, ML+34, ML+56, ML+72, ML+104, ML+138, MR];
  const cab = CAP ? ['Bancada','Cotas (m)','h (m)','Estéril (m³)','Minério (m³)','Total (m³)','Acum. (m³)','Massa minério (t)']
                  : ['Bancada','Cotas (m)','h (m)','Volume (m³)','Acumulado (m³)','Massa (t)'];
  const FS = CAP ? 7.2 : 8.5;
  caixa(ML, y-4.2, LARG, 6.4, '#efe7d6');
  linha(ML,y-4.2,MR,y-4.2,0.4,AMBAR);
  txt(cab[0],FS,col[0]+1.5,y,'left',true,TINTA);
  for(let c=1;c<cab.length;c++) txt(cab[c],FS,col[c+1]-1.5,y,'right',true,TINTA);
  y+=2.2; linha(ML,y,MR,y,0.4,AMBAR); y+=5.4;

  R.linhas.forEach((l,i)=>{
    if(i%2===1) caixa(ML,y-4,LARG,5.6,'#f7f7f7');
    txt(l.nome,FS,col[0]+1.5,y,'left',false,TINTA);
    const vals = CAP
      ? [`${l.de.toFixed(0)} – ${l.ate.toFixed(0)}`, l.h.toFixed(1),
         f0(l.cap), f0(l.roc), f0(l.vol), f0(l.acum),
         (R.dens>0? f0(l.roc*R.dens):'—')]
      : [`${l.de.toFixed(0)} – ${l.ate.toFixed(0)}`, l.h.toFixed(1),
         f0(l.vol), f0(l.acum),
         (R.dens>0? f0(l.vol*R.dens):'—')];
    vals.forEach((v,c)=>txt(v,FS,col[c+2]-1.5,y,'right',false,TINTA));
    y+=5.6;
  });
  linha(ML,y-3.6,MR,y-3.6,0.5,AMBAR); y+=3;

  /* ---- totais ---- */
  caixa(ML,y-4.4,LARG,7,'#efe7d6');
  txt('TOTAL in situ',9.5,col[0]+1.5,y,'left',true,TINTA);
  if(CAP){
    txt(f0(R.totalCap),FS,col[4]-1.5,y,'right',true,TINTA);
    txt(f0(R.totalRoc),FS,col[5]-1.5,y,'right',true,TINTA);
    txt(f0(R.total),FS,col[6]-1.5,y,'right',true,TINTA);
    txt(R.dens>0? f0(R.totalRoc*R.dens)+' t':'—',FS,col[8]-1.5,y,'right',true,TINTA);
  } else {
    txt(f0(R.total)+' m³',10,col[5]-1.5,y,'right',true,TINTA);
    txt(R.dens>0? f0(R.total*R.dens)+' t':'—',10,col[6]-1.5,y,'right',true,TINTA);
  }
  y+=10;

  /* ---- faixa de destaque: repartição e REM ---- */
  if(CAP){
    caixa(ML,y-4.6,LARG,7,'#f4efe2');
    linha(ML,y-4.6,MR,y-4.6,0.3,AMBAR);
    txt('ESTÉRIL '+R.pctCap.toFixed(1)+' %   ·   MINÉRIO '+R.pctRoc.toFixed(1)+' %',9,ML+1.5,y,'left',true,TINTA);
    let rem='REM —';
    if(R.remV!=null) rem='REM = '+R.remV.toFixed(2)+' m³/m³';
    if(R.remM!=null) rem+='   ·   '+R.remM.toFixed(2)+' t/t';
    txt(rem,9,MR-1.5,y,'right',true,TINTA);
    y+=10;
  }

  /* ---- parâmetros de conversão ---- */
  txt('Parâmetros adotados',10,ML,y,'left',true,TINTA); y+=5.5;
  if(CAP){
    txt('Capeamento definido por '+(R.cap.modo==='esp'
          ? `espessura média de ${f2(R.cap.esp)} m, medida na vertical a partir do topo`
          : `superfície de contato “${R.cap.nome}”`)+'.',8,ML,y,'left',false,TINTA); y+=4.6;
    if(R.cap.extrap>0){
      txt(`${f0(R.cap.extrap)} célula(s) fora da cobertura da superfície — cota do contato extrapolada pelo vizinho mais próximo.`,
          7.5,ML,y,'left',false,CINZA); y+=4.6; }
    y+=1.5;
  }
  const par=[];
  if(CAP){
    par.push(['Volume de capeamento (estéril)', f0(R.totalCap)+' m³', 'in situ']);
    if(R.cap.dens>0) par.push(['Densidade do capeamento', f2(R.cap.dens)+' t/m³',
                               'massa de estéril = '+f0(R.totalCap*R.cap.dens)+' t']);
    if(R.cap.emp>0)  par.push(['Empolamento do capeamento', f0(R.cap.emp)+' %',
                               'estéril empolado = '+f0(R.totalCap*(1+R.cap.emp/100))+' m³']);
    par.push(['Volume de minério', f0(R.totalRoc)+' m³', 'in situ, abaixo do contato']);
    par.push(['Repartição do volume total',
              `${R.pctCap.toFixed(1)}% / ${R.pctRoc.toFixed(1)}%`, 'estéril / minério']);
    if(R.remV!=null) par.push(['REM (volume)', R.remV.toFixed(2)+' m³/m³',
                               'estéril in situ / minério in situ']);
    if(R.remM!=null) par.push(['REM (massa)', R.remM.toFixed(2)+' t/t',
                               'massa de estéril / massa de minério']);
  }
  if(R.dens>0) par.push([CAP?'Densidade in situ do minério':'Densidade in situ', f2(R.dens)+' t/m³',
                         'massa = volume in situ × densidade']);
  if(R.emp>0)  par.push([CAP?'Empolamento do minério':'Fator de empolamento', f0(R.emp)+' %',
                         'V empolado = V in situ × (1 + e/100)']);
  if(R.emp>0)  par.push([CAP?'Volume empolado (minério)':'Volume empolado',
                         f0((CAP?R.totalRoc:R.total)*(1+R.emp/100))+' m³',
                         'referência para transporte e pilhas']);
  par.forEach(([a,b,c])=>{
    txt(a,8.5,ML+1.5,y,'left',false,TINTA);
    txt(b,8.5,ML+74,y,'right',true,TINTA);
    txt(c,7.2,ML+78,y,'left',false,CINZA);
    y+=5.2;
  });
  if(CAP){ y+=1.5;
    txt(`Conferência: ${f0(R.totalCap)} + ${f0(R.totalRoc)} = ${f0(R.totalCap+R.totalRoc)} m³ (total in situ).`,
        7.5,ML,y,'left',false,CINZA); y+=4.6; }
  y+=4;
  linha(ML,y,MR,y,0.25,'#bbb'); y+=5;
  txt('Volumes obtidos por integração da espessura entre as superfícies, fatiada nos patamares indicados.',
      7.5,ML,y,'left',false,CINZA); y+=4;
  txt('Os patamares são detectados pelo histograma de cotas da superfície de base (praças de bancada).',
      7.5,ML,y,'left',false,CINZA);

  /* ---- rodapé ---- */
  linha(ML,PH-16,MR,PH-16,0.3,'#bbb');
  txt('CCM Engenharia · CCMGIS',7.5,ML,PH-11,'left',false,CINZA);
  txt('Página 1 de 1',7.5,MR,PH-11,'right',false,CINZA);

  const jpeg=b64ToBytes(cv.toDataURL('image/jpeg',0.94).split(',')[1]);
  const blob=buildPDFmulti([{jpeg,PW,PH,pxW:px,pxH:py}]);
  download(blob,'relatorio_bancadas.pdf');
  hideLoad(); toast('⤓ PDF gerado');
}

/* ============ SEQUENCIAMENTO DA LAVRA E VIDA ÚTIL ==========================
   A lavra avança de cima para baixo: para uma produção acumulada Q, existe uma
   única cota z tal que a quantidade contida ACIMA de z vale Q. É essa cota que
   a barra do ano resolve, e o sólido é reconstruído com o teto rebaixado até
   ela — por isso o corpo "encolhe" ao arrastar.

   A curva quantidade × cota é montada UMA vez, por histograma de espessura em
   600 faixas (O(n), com as faixas cheias resolvidas por array de diferenças).
   Recalcular célula a célula a cada quadro da barra travaria o tablet.       */
S._seq=null;

function seqHist(){
  const R=S._rel; if(!R||!R.cel) return null;
  const zt=R.cel.zt, zb=R.cel.zb, zk=R.cel.zk, A=R.cel.A, n=zt.length;
  if(!n) return null;
  let zmin=Infinity, zmax=-Infinity;
  for(let i=0;i<n;i++){ if(zb[i]<zmin) zmin=zb[i]; if(zt[i]>zmax) zmax=zt[i]; }
  if(!(zmax>zmin)) return null;
  const NS=600, dz=(zmax-zmin)/NS;
  const vO=new Float64Array(NS), vE=new Float64Array(NS);
  const fO=new Float64Array(NS+2), fE=new Float64Array(NS+2);
  const kOf=z=>Math.max(0,Math.min(NS-1,Math.floor((z-zmin)/dz)));
  const add=(part,full,a,b)=>{
    if(!(b>a)) return;
    const k0=kOf(a), k1=kOf(b);
    if(k0===k1){ part[k0]+=(b-a); return; }
    part[k0]+=(zmin+(k0+1)*dz-a);
    part[k1]+=(b-(zmin+k1*dz));
    if(k1>k0+1){ full[k0+1]+=1; full[k1]-=1; }
  };
  for(let i=0;i<n;i++){
    const t=zt[i], b=zb[i], c=Math.max(b,Math.min(zk[i],t));
    add(vO,fO,b,c);      // minério: do piso até o contato
    add(vE,fE,c,t);      // estéril: do contato até o teto
  }
  let aO=0,aE=0;
  for(let k=0;k<NS;k++){ aO+=fO[k]; aE+=fE[k];
    vO[k]=(vO[k]+aO*dz)*A; vE[k]=(vE[k]+aE*dz)*A; }
  const cumO=new Float64Array(NS+1), cumE=new Float64Array(NS+1);
  for(let k=NS-1;k>=0;k--){ cumO[k]=cumO[k+1]+vO[k]; cumE[k]=cumE[k+1]+vE[k]; }
  return {zmin,zmax,dz,NS,cumO,cumE};
}
/* quantidade acumulada acima de cada cota, na base e unidade escolhidas */
function seqQuant(H, base, massa, dens, capDens){
  const q=new Float64Array(H.NS+1);
  for(let k=0;k<=H.NS;k++){
    const o=H.cumO[k], e=H.cumE[k];
    q[k]= massa ? (base==='tot' ? o*dens+e*capDens : o*dens)
                : (base==='tot' ? o+e             : o);
  }
  return q;
}
/* cota em que a quantidade acumulada acima dela vale "alvo" */
function seqZdeQ(H,q,alvo){
  if(!(alvo>0)) return H.zmax;
  if(alvo>=q[0]) return H.zmin;
  for(let k=0;k<H.NS;k++){
    if(q[k]>=alvo && alvo>=q[k+1]){
      const d=q[k]-q[k+1];
      return H.zmin + (k + (d>0? (q[k]-alvo)/d : 0))*H.dz;
    }
  }
  return H.zmin;
}

function seqCalc(){
  const out=document.getElementById('relSeqOut');
  const R=S._rel;
  if(!R||!R.cel){ out.innerHTML='<span style="color:#e0a">Gere o relatório por bancada (seção 5) primeiro — é dele que saem as células.</span>'; return; }
  const num=(id,d)=>{ const v=parseFloat(String((document.getElementById(id)||{}).value).replace(',','.'));
    return isFinite(v)? v : d; };
  const taxa=num('relSeqTaxa',0);
  if(!(taxa>0)){ out.innerHTML='<span style="color:#e0a">Informe a taxa de produção.</span>'; return; }
  const un=(document.getElementById('relSeqUn')||{}).value||'m3a';
  const base=(document.getElementById('relSeqBase')||{}).value||'min';
  const massa=(un==='ta'||un==='tm');
  const anual=(un==='m3m'||un==='tm')? taxa*12 : taxa;
  const dens=R.dens||0, capDens=(R.cap&&R.cap.dens)||0;
  if(massa && !(dens>0)){ out.innerHTML='<span style="color:#e0a">Produção em toneladas exige a densidade do minério (seção 5).</span>'; return; }
  if(massa && base==='tot' && !(capDens>0)){ out.innerHTML='<span style="color:#e0a">Produção total em toneladas exige também a densidade do capeamento.</span>'; return; }
  const H=seqHist();
  if(!H){ out.innerHTML='<span style="color:#e0a">Não foi possível montar a curva volume × cota.</span>'; return; }
  const q=seqQuant(H,base,massa,dens,capDens);
  const Qtot=q[0];
  if(!(Qtot>0)){ out.innerHTML='<span style="color:#e0a">Quantidade lavrável nula na base escolhida.</span>'; return; }
  const vida=Qtot/anual, NA=Math.max(1,Math.ceil(vida-1e-9));
  S._seq={H,q,Qtot,anual,vida,NA,massa,base,un};

  const sl=document.getElementById('relSeqAno');
  if(sl){ sl.max=String(NA*10); sl.step='1'; sl.value='0'; }

  const f0=v=>v.toLocaleString('pt-BR',{maximumFractionDigits:0});
  const U=massa?'t':'m³';
  let html=`<b>Vida útil: ${vida.toFixed(1)} anos</b> <span style="color:var(--ink-dim)">(${Math.floor(vida)} a ${Math.round((vida%1)*12)} m)</span>`+
    `<br>Reserva na base escolhida: <b>${f0(Qtot)} ${U}</b> <span style="color:var(--ink-dim)">(${base==='tot'?'minério + estéril':'somente minério'})</span>`+
    `<br>Produção adotada: <b>${f0(anual)} ${U}/ano</b>`;
  html+='<table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:8px">'+
    '<tr style="background:var(--line);font-weight:600"><td style="padding:3px 4px">Ano</td>'+
    '<td style="text-align:right">Cota final (m)</td>'+
    `<td style="text-align:right">Produção (${U})</td>`+
    `<td style="text-align:right">Acum. (${U})</td>`+
    '<td style="text-align:right">%</td></tr>';
  let ant=0;
  for(let a=1;a<=NA;a++){
    const ac=Math.min(Qtot, anual*a);
    const z=seqZdeQ(H,q,ac);
    html+=`<tr style="border-bottom:1px solid var(--line)">`+
      `<td style="padding:3px 4px">${a}</td>`+
      `<td style="text-align:right">${z.toFixed(1)}</td>`+
      `<td style="text-align:right">${f0(ac-ant)}</td>`+
      `<td style="text-align:right">${f0(ac)}</td>`+
      `<td style="text-align:right">${(100*ac/Qtot).toFixed(0)}%</td></tr>`;
    ant=ac;
  }
  html+='</table>';
  html+=`<div class="hint" style="margin-top:6px">O último ano é parcial quando a reserva não é múltiplo exato da produção anual.</div>`;
  out.innerHTML=html;
  const lbl=document.getElementById('relSeqLbl');
  if(lbl) lbl.innerHTML='Arraste a barra para ver o avanço (ano 0 = cava intacta).';
  toast(`⏳ Vida útil ${vida.toFixed(1)} anos`);
  seqAplica(0);
}

/* ---- barra do ano: throttle por quadro, senão cada pixel arrastado
        dispararia uma reconstrução do sólido ---- */
let _seqBusy=false, _seqPend=null;
function seqSlider(){
  if(!S._seq) return;
  _seqPend=(+((document.getElementById('relSeqAno')||{}).value||0))/10;
  if(_seqBusy) return;
  _seqBusy=true;
  requestAnimationFrame(async()=>{
    while(_seqPend!==null){ const t=_seqPend; _seqPend=null; await seqAplica(t); }
    _seqBusy=false;
  });
}

async function seqAplica(t){
  const Q=S._seq; if(!Q) return;
  const alvo=Math.min(Q.Qtot, Q.anual*t);
  const z=seqZdeQ(Q.H,Q.q,alvo);
  const f0=v=>v.toLocaleString('pt-BR',{maximumFractionDigits:0});
  const lbl=document.getElementById('relSeqLbl');
  if(lbl) lbl.innerHTML=`<b>Ano ${t.toFixed(1)}</b> · praça em <b>${z.toFixed(1)} m</b> · `+
    `${f0(alvo)} ${Q.massa?'t':'m³'} lavrados (${(100*alvo/Q.Qtot).toFixed(1)}%) · `+
    `restam ${f0(Q.Qtot-alvo)} ${Q.massa?'t':'m³'}`;
  await seqRender(z);
}

function seqMalha(G,OX,OY,z0,ve,corFixa,opac){
  const n=G.pos.length/3;
  let zmn=Infinity,zmx=-Infinity;
  for(let i=0;i<G.zval.length;i++){ const v=G.zval[i]; if(v<zmn)zmn=v; if(v>zmx)zmx=v; }
  const P=new Float32Array(n*3), CL=new Float32Array(n*3);
  for(let i=0;i<n;i++){
    P[i*3]  = G.pos[i*3]-OX;
    P[i*3+1]= (G.pos[i*3+2]-z0)*ve;
    P[i*3+2]= -(G.pos[i*3+1]-OY);
    const rgb=corFixa||solColor((G.zval[i]-zmn)/Math.max(1e-6,zmx-zmn));
    CL[i*3]=rgb[0]; CL[i*3+1]=rgb[1]; CL[i*3+2]=rgb[2];
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(P,3));
  geo.setAttribute('color',new THREE.BufferAttribute(CL,3));
  geo.computeVertexNormals();
  const mat=v3LambertMaterial({vertexColors:true, side:THREE.DoubleSide,
    transparent:(opac<1), opacity:opac, depthWrite:(opac>=1)},true);
  return new THREE.Mesh(geo,mat);
}

async function seqRender(z){
  const out=document.getElementById('relSeqOut3D');
  const prep=cubPrepRest();
  if(prep.err){ if(out) out.innerHTML='<span style="color:#e0a">'+esc(prep.err)+'</span>'; return; }
  let res=parseFloat(String((document.getElementById('relSeqRes')||{}).value||'2').replace(',','.'));
  if(!isFinite(res)||res<=0) res=2;
  const erro=await cubPrepara3D();
  if(erro){ if(out) out.innerHTML='<b style="color:#e0a">'+String(erro).replace(/\n/g,'<br>')+'</b>'; return; }
  let G;
  try{ G=await cubSolidoLiso(prep.rules,res,z,-Infinity); }
  catch(e){ if(out) out.innerHTML='<b style="color:#e0a">'+esc(String(e.message||e))+'</b>'; return; }
  const fantOn=!!(document.getElementById('relSeqGhost')||{}).checked;
  let F=null;
  if(fantOn){ try{ F=await cubSolidoLiso(prep.rules,res,Infinity,z); }catch(e){ F=null; } }

  const VE=parseFloat((document.getElementById('cubVE')||{}).value)||1;
  const ref=(G&&!G.err)? G : F;
  if(!ref||ref.err){ if(out) out.innerHTML='<span style="color:var(--ink-dim)">Cava totalmente lavrada nesta cota.</span>'; return; }
  let zmn=Infinity,zmx=-Infinity;
  for(let i=0;i<ref.zval.length;i++){ const v=ref.zval[i]; if(v<zmn)zmn=v; if(v>zmx)zmx=v; }
  const Cc={dom:ref.dom, zmn, zmx};
  try{ if(!V3.scene||!V3.ren||!v3ContextoVivo()){
         if(!cubCenaMinima(Cc,VE)){ if(out) out.innerHTML='<b style="color:#e0a">Painel 3D não encontrado.</b>'; return; } } }
  catch(e){ if(out) out.innerHTML='<b style="color:#e0a">Cena: '+esc(String(e.message||e))+'</b>'; return; }

  let OX=V3.OX, OY=V3.OY, z0=V3.z0, ve=V3.VE||VE;
  if(!isFinite(OX)){ OX=(ref.dom.x0+ref.dom.x1)/2; OY=(ref.dom.y0+ref.dom.y1)/2; z0=zmn; ve=VE;
    V3.OX=OX; V3.OY=OY; V3.z0=z0; V3.VE=ve; }

  if(V3.cubGroup){ V3.scene.remove(V3.cubGroup);
    V3.cubGroup.traverse(o=>{ if(o.geometry)o.geometry.dispose(); if(o.material)o.material.dispose(); });
    V3.cubGroup=null; }
  const grupo=new THREE.Group();
  let nTri=0;
  if(G&&!G.err){ grupo.add(seqMalha(G,OX,OY,z0,ve,null,1)); nTri+=G.nTri; }
  if(F&&!F.err){ grupo.add(seqMalha(F,OX,OY,z0,ve,[0.62,0.62,0.64],0.25)); nTri+=F.nTri; }
  V3.cubGroup=grupo; V3.scene.add(grupo);
  V3.cubGroup.visible = ((V3.aba||'cub')==='cub') || !!(document.getElementById('cubSolIn3D')||{}).checked;
  v3Resize();
  const f0=v=>v.toLocaleString('pt-BR',{maximumFractionDigits:0});
  if(nTri>400000 && out) out.innerHTML='<span style="color:var(--amber)">Malha densa ('+
    f0(nTri)+' triângulos) — aumente a resolução da barra para arrastar sem travar.</span><br>';
  else if(out) out.innerHTML='';
  if(out) out.innerHTML+=`Sólido remanescente abaixo de <b>${z.toFixed(1)} m</b> · `+
    `${f0(nTri)} triângulos · grade ${res} m`+
    (fantOn? ' · <span style="color:var(--ink-dim)">fantasma do lavrado ligado</span>':'');
}

function seqSolIn3D(){
  if(V3.cubGroup) V3.cubGroup.visible = ((V3.aba||'cub')==='cub') ||
    !!(document.getElementById('cubSolIn3D')||{}).checked;
  if(typeof v3Resize==='function') v3Resize();
}

function bindCubPanel(){
  const on=(id,ev,fn)=>{ const e=document.getElementById(id); if(e) e[ev]=fn; };
  on('btnCub','onclick',runCubagem);
  on('btnCubPreset','onclick',cubPresetAplicar);
  on('btnCubConfigRest','onclick',e=>cubAbrirRestricoes(e.currentTarget));
  on('btnCubAddRest','onclick',cubAddRest);
  on('btnCubSolido','onclick',cubRenderSolido);
  on('btnRelBanc','onclick',relBancadas);
  on('btnRelPDF','onclick',relPDF);
  on('relCapModo','onchange',relCapToggle);
  on('btnRelSeq','onclick',seqCalc);
  on('relSeqAno','oninput',seqSlider);
  on('relSeqGhost','onchange',seqSlider);
  on('cubSolIn3D','onchange',seqSolIn3D);
  on('relModo','onchange',()=>{ const m=document.getElementById('relManual');
    if(m) m.style.display=(document.getElementById('relModo').value==='manual')?'block':'none'; });
  on('btnCubSurf3D','onclick',cubRenderSurf);
  on('btnCub3D','onclick',cubRenderBlocos);
  on('btnCubLimpa3D','onclick',cubLimpa3D);
  on('btnCubFit','onclick',cubReenquadra);
  on('btnCubCSV','onclick',cubToCSV);
  on('btnCubPts','onclick',cubToPoints);
  on('btnCubIso','onclick',cubToIso);
  ['cubBX','cubBY','cubBZ','cubSX','cubSY','cubSZ'].forEach(id=>on(id,'oninput',cubSubHint));
  ['cubSX','cubSY','cubSZ'].forEach(id=>on(id,'onchange',cubSubHint));
  const ve=document.getElementById('cubVE'), vel=document.getElementById('cubVEv');
  if(ve&&vel) ve.oninput=()=>{ vel.textContent=(+ve.value).toFixed(1).replace('.0','')+'×'; };
  const cl=document.getElementById('cubClip'); if(cl) cl.oninput=cubClipLbl;
  const ss=document.getElementById('cubSurfShow');
  if(ss) ss.onchange=()=>{ if(V3.aba==='cub') v3AbaSync('cub'); };
}

function bind3DPanel(){
  const executa3DSeguro=()=>Promise.resolve().then(()=>build3D()).catch(err=>{
    try{hideLoad();}catch(_){}
    const msg=(err&&err.message)||String(err);
    try{cmdLog('Falha ao montar o 3D: '+msg,'erro');}catch(_){}
    const out=document.getElementById('v3dOut');
    if(out)out.textContent='Falha ao montar o 3D: '+msg;
    toast('Não foi possível montar a cena 3D');
  });
  ['btnV3D','btnV3Dtopo','btnV3DSuperf','btnV3DTextura','btnV3DExagero'].forEach(id=>{
    const b=document.getElementById(id); if(b) b.onclick=executa3DSeguro;
  });
  {
    const br=document.getElementById('btnV3Render');
    if(br) br.onclick=()=>v3RenderAgora();
    const au=document.getElementById('v3dAuto');
    /* Visibilidade é sempre simultânea: manter este checkbox desligado
       contrariava o olho da árvore e conservava linhas antigas na cena. */
    if(au){au.checked=true;au.disabled=true;au.title='Atualização simultânea com a árvore de camadas';}
  }
  // recolher/expandir a lista de camadas a drapejar
  const vt=document.getElementById('v3dVecToggle'), vw=document.getElementById('v3dVecWrap');
  if(vt && vw){ vt.onclick=()=>{ const open=vw.style.display!=='none';
    vw.style.display=open?'none':''; vt.textContent=(open?'▸':'▾')+' Camadas vetoriais no 3D'; }; }
  // altura sobre o terreno: ajusta AO VIVO, refazendo só os vetores (o MDT não é remontado)
  const num=document.getElementById('v3dVecOff'), rng=document.getElementById('v3dVecOffR'),
        lbl=document.getElementById('v3dVecOffv');
  if(num && rng && lbl){
    const sync=(v,fonte)=>{
      v=Math.max(0,+v||0);
      if(fonte!=='num') num.value=v;
      if(fonte!=='rng') rng.value=Math.min(50,v);
      lbl.textContent=v.toFixed(1).replace('.',',')+' m';
      v3BuildVectors();
    };
    rng.addEventListener('input',()=>sync(rng.value,'rng'));
    num.addEventListener('input',()=>sync(num.value,'num'));
  }
  ['v3dVec','v3dVecFix'].forEach(id=>{
    const e=document.getElementById(id);
    if(e) e.addEventListener('change',()=>{ V3._avisouCor=0; v3BuildVectors(); });
  });
  const dr=document.getElementById('v3dDrape');
  if(dr) dr.addEventListener('change',()=>{
    dr._touched=true;
    /* O checkbox é um atalho do seletor, não uma segunda fonte de estado. */
    const tt=document.getElementById('v3dTexTipo');
    if(tt){tt.value=dr.checked?'orto':'hipso';tt.dispatchEvent(new Event('change'));}
    else if(typeof v3Auto==='function') v3Auto();
  });
  const sel=document.getElementById('v3dBg'), ci=document.getElementById('v3dBgC');
  if(sel&&ci){
    let modo='theme', custom='#0a0e14';
    try{
      modo=localStorage.getItem('ccm_v3dbg_mode')||'theme';
      custom=localStorage.getItem('ccm_v3dbg')||custom;
    }catch(_){}
    if(![...sel.options].some(o=>o.value===modo)) modo='theme';
    sel.value=modo;
    if(modo==='custom') ci.value=custom;
    v3dApplyCurrentBg(false);
    sel.onchange=()=>{
      if(sel.value==='custom'){ ci.click(); return; }
      v3dApplyCurrentBg(true);
    };
    ci.oninput=()=>{
      sel.value='custom';
      v3dApplyCurrentBg(true);
    };
  }
}

/* ============================================================================
   TABELA DE ATRIBUTOS
   ========================================================================== */
async function attachDBFToLayer(L, dbfBuf, cpg){
  const d=parseDBF(dbfBuf, cpg);
  const vivos=d.rows.filter(r=>!r._del);
  // aceita tanto o .dbf íntegro (mesmo número de linhas) quanto o já compactado
  const usa = (d.rows.length===L.features.length) ? d.rows
            : (vivos.length===L.features.length) ? vivos : null;
  if(!usa){
    toast(`.dbf tem ${d.rows.length} registros (${vivos.length} ativos), a camada tem `+
          `${L.features.length} feições — não anexado (é o .dbf de outro shape?)`);
    return false;
  }
  L.fields=d.fields;
  L.features.forEach((f,i)=>f.props=usa[i]||{});
  drawLayer(L); refreshUI();
  toast(`Atributos anexados: ${d.fields.length} campos × ${d.rows.length} registros`);
  return true;
}
function openAttr(selIdx){
  const L=activeLayer(); const panel=document.getElementById('attrPanel');
  if(!L){toast('Sem camada ativa');return;}
  // camada de drenagem: corrige nomes duplicados antes de listar (feições antigas)
  if(L.name && /^Drenagem — /.test(L.name) && typeof drenCorrigeDuplicados==='function'){
    try{ const t=L.name.replace(/^Drenagem — /,''); const n=drenCorrigeDuplicados(L, t);
      if(n){ try{ drawLayer(L); }catch(e){} toast(n+' nome(s) duplicado(s) corrigido(s)'); } }catch(e){}
  }
  const nAttr=attrFilterCount(L),temAttr=!!(L.attrFilter&&L.attrFilter.enabled!==false&&L.attrFilter.field);
  document.getElementById('attrTtl').textContent=`Atributos · ${L.name} (${temAttr?nAttr+' de ':''}${L.features.length})`;
  // botão "Recalcular pelo MDT" + seletor de qual MDT usar: aparecem para
  // camadas de drenagem OU qualquer linha com os campos geométricos do terreno
  const bR=document.getElementById('btnAttrRecalc');
  const selM=document.getElementById('attrMDT');
  {
    const ehDren=(typeof edEhDrenagem==='function' && edEhDrenagem(L));
    const temCampos = L.gtype==='line' && (L.fields||[]).some(f=>/^(COTA_INI|COMP_2D|DECL_PCT|DESNIVEL_M)$/.test(f.name));
    const mostra=(ehDren || temCampos);
    if(bR) bR.style.display = mostra ? '' : 'none';
    if(selM){
      if(mostra && typeof drenMDTsDisponiveis==='function'){
        const mdts=drenMDTsDisponiveis();
        if(mdts.length){
          selM.style.display='';
          selM.innerHTML='<option value="">MDT: automático</option>'+
            mdts.map(m=>`<option value="${m.id}">MDT: ${esc(m.nome)}</option>`).join('');
          selM.value = (S.drenMDT!=null? String(S.drenMDT):'');
          selM.onchange=()=>{ const v=selM.value;
            S.drenMDT = v==='' ? null : (v==='hidro'?'hidro':(isFinite(+v)?+v:v)); };
        } else { selM.style.display='none'; }
      } else { selM.style.display='none'; }
    }
  }
  const body=document.getElementById('attrBody');
  body.dataset.lid=String(L.id);            // de qual camada é esta tabela
  const soFID=(L.fields||[]).every(f=>f.name==='FID');
  const banner=soFID? `<div style="background:#3a2b12;border:1px solid var(--amber);border-radius:8px;padding:8px 10px;margin:6px 8px;display:flex;gap:10px;align-items:center;font-size:12px">
      ⚠ Esta camada veio <b>sem o .dbf</b> (só a geometria).
      <button class="tbtn" id="attrFixDbf" style="margin-left:auto">📎 Anexar .dbf…</button>
    </div>`:'';
  if(banner){
    setTimeout(()=>{
      const b=document.getElementById('attrFixDbf');
      if(b) b.onclick=()=>{
        const inp=document.createElement('input');
        inp.type='file'; inp.accept='.dbf,.cpg'; inp.multiple=true; inp.style.display='none';
        document.body.appendChild(inp);
        inp.onchange=async()=>{
          const fs=[...inp.files]; inp.remove();
          const fD=fs.find(f=>/\.dbf$/i.test(f.name));
          const fC=fs.find(f=>/\.cpg$/i.test(f.name));
          if(!fD){ toast('Selecione o arquivo .dbf'); return; }
          const ok=await attachDBFToLayer(L, await fD.arrayBuffer(), fC?await fC.text():null);
          if(ok) openAttr();                       // reabre a tabela já com os campos
        };
        inp.click();
      };
    },60);
  }
  let html=banner+'<table><thead><tr><th>#</th>'+L.fields.map(f=>`<th>${f.name}<br><span style="color:var(--ink-dim);font-weight:400">${f.type}${f.length?','+f.length:''}</span></th>`).join('')+'</tr></thead><tbody>';
  L.features.forEach((f,i)=>{
    if(!attrFilterMatch(L,f))return;
    html+=`<tr data-i="${i}" class="${i===selIdx?'sel':''}"><td>${i}</td>`+
      L.fields.map(fl=>`<td contenteditable data-f="${fl.name}" data-i="${i}">${f.props[fl.name]??''}</td>`).join('')+'</tr>';
  });
  body.innerHTML=html+'</tbody></table>';
  body.querySelectorAll('td[contenteditable]').forEach(td=>{
    td.addEventListener('blur',()=>{ try{
      const i=+td.dataset.i, fn=td.dataset.f;
      const feat=L.features[i]; if(!feat) return;
      const fld=(L.fields||[]).find(f=>f.name===fn);
      let v=td.textContent.trim();
      if(fld && (fld.type==='N'||fld.type==='F')){
        v = v==='' ? null : Number(String(v).replace(',','.'));
        if(v!==null && !isFinite(v)) v=null;          // texto inválido em campo numérico
      } else if(fld && fld.type==='L'){ v=/^[yYtTvV1]/.test(v); }
      if(!feat.props) feat.props={};
      feat.props[fn]=v;
      /* O campo editado pode ser justamente o campo de classificação. Nesse
         caso mudam cor e visibilidade no 2D e no 3D, mesmo sem ser rótulo. */
      L._rev=(+L._rev||0)+1;
      drawLayer(L);
      if(S._view==='v3d'&&typeof v3Auto==='function')v3Auto();
    }catch(err){ toast('Não foi possível salvar a célula: '+(err.message||err)); } });
  });
  /* Recém-montada, a tabela já mostra a feição que estiver selecionada. */
  setTimeout(()=>{ try{ attrDestacaSelecao(); }catch(e){} },0);
  body.querySelectorAll('tr[data-i]').forEach(tr=>tr.addEventListener('click',e=>{
    if(e.target.isContentEditable) return; const i=+tr.dataset.i;
    S.selFeat={layer:L, layerId:L.id, idx:i}; S.activeId=L.id;
    highlightSel(); zoomToSel();
    body.querySelectorAll('tr').forEach(r=>r.classList.remove('sel')); tr.classList.add('sel');
  }));
  panel.classList.add('open');
}
document.getElementById('attrClose').onclick=()=>document.getElementById('attrPanel').classList.remove('open');
(function(){ const b=document.getElementById('btnAttrRecalc'); if(b) b.onclick=attrRecalcMDT; })();
/* recalcula os atributos geométricos (cotas, comprimentos, declividade, zg) de
   TODAS as feições da camada ativa a partir do MDT — corrige, por exemplo,
   linhas quebradas que ficaram sem cota. */
function attrRecalcMDT(){
  const L=activeLayer();
  const ehDren=(typeof edEhDrenagem==='function' && edEhDrenagem(L));
  const temCampos = L && L.gtype==='line' && (L.fields||[]).some(f=>/^(COTA_INI|COMP_2D|DECL_PCT|DESNIVEL_M)$/.test(f.name));
  if(!L || !(ehDren||temCampos)){ toast('Selecione uma camada de drenagem (ou linha com cotas)'); return; }
  const d=(typeof drenGrade==='function')?drenGrade():null;
  if(!d){ toast('Nenhum MDT disponível — carregue um raster/MDE ou rode o Hidro'); return; }
  let n=0, falhas=0, semCota=0;
  L.features.forEach(f=>{
    if(!f.geom){ return; }
    try{ const G=drenAplicaGeom(L, f);
      if(G){ n++; if(G.COTA_INI==null && G.COTA_FIM==null) semCota++; }
      else falhas++; }
    catch(e){ falhas++; }
  });
  // TODAS sem cota → os pontos estão fora do MDT escolhido: avisa e não engana
  if(n>0 && semCota===n){
    toast('⚠ Os pontos não caem sobre o MDT selecionado — cotas ficaram vazias. '+
          'Escolha outro MDT no seletor ao lado (o certo cobre a área das feições).', 6000);
  }
  try{ drawLayer(L); }catch(e){}
  refreshUI();
  try{ openAttr(); }catch(e){}                 // reconstrói a tabela com os novos valores
  if(!(n>0 && semCota===n))
    toast(n+' feição(ões) recalculada(s) pelo MDT'+(semCota?` · ${semCota} sem cota (fora do MDT)`:'')+(falhas?` · ${falhas} sem geometria`:''));
}
/* ============================================================================
   CALCULADORA DE CAMPO (nos moldes do QGIS)
   Abre no "+ Campo" da tabela de atributos: cria um campo novo OU atualiza um
   existente, preenchendo com uma expressão avaliada feição a feição.
   Convenção igual à do QGIS: campo entre ASPAS DUPLAS ("NOME"), texto entre
   ASPAS SIMPLES ('sim'). As variáveis de geometria reaproveitam geomValor(),
   o mesmo cálculo que a tabela e o ⓘ já usam — nada de outra conta paralela.
   ========================================================================== */
const FC_FUNCOES={
  'arredondar(x, casas)':'arredondar(', 'abs(x)':'abs(', 'raiz(x)':'raiz(',
  'pot(x, n)':'pot(', 'min(a, b)':'min(', 'max(a, b)':'max(',
  'se(condição, então, senão)':'se(',
  'maiusc(txt)':'maiusc(', 'minusc(txt)':'minusc(', 'titulo(txt)':'titulo(',
  'juntar(a, b, …)':'juntar(', 'texto(x)':'texto(', 'numero(txt)':'numero(',
  'comprimento(txt)':'comprimento(', 'trecho(txt, ini, n)':'trecho(',
  'trocar(txt, de, para)':'trocar(', 'apara(txt)':'apara('
};
/* Conversão numérica previsível para dados brasileiros e internacionais.
   Não usa parseFloat diretamente porque ele aceita lixo no final ("12abc")
   e interpreta "1.234,56" como 1.234. */
function fcNumero(t){
  if(typeof t==='number') return Number.isFinite(t)?t:null;
  let s=String(t??'').trim().replace(/[\s\u00a0]/g,'');
  if(!s) return null;
  const virg=s.lastIndexOf(','), ponto=s.lastIndexOf('.');
  if(virg>=0 && ponto>=0){
    if(virg>ponto) s=s.replace(/\./g,'').replace(',','.');
    else s=s.replace(/,/g,'');
  }else if(virg>=0){
    if(s.indexOf(',')!==virg) return null;
    s=s.replace(',','.');
  }
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)) return null;
  const n=Number(s);
  return Number.isFinite(n)?n:null;
}
function fcAmbiente(L,f,i){
  const V=Object.create(null);
  (L.fields||[]).forEach(fd=>{ V[fd.name]=f.props?f.props[fd.name]:null; });
  /* variáveis de geometria — só as que fazem sentido para o tipo da camada */
  geomCamposDe(L.gtype).forEach(k=>{ V[k]=geomValor(L,f,k); });
  V['$X']=V['$X']??geomValor(L,f,'$X'); V['$Y']=V['$Y']??geomValor(L,f,'$Y');
  const z=Array.isArray(f.zg)?f.zg[0]:f.zg;
  V['$Z']=Number.isFinite(+z)?+z:null;
  V['$ID']=i+1; V['$LINHA']=i+1; V['$NFEIC']=(L.features||[]).length;
  V['$CAMADA']=L.name; V['$CRS']=L.crs||S.workCRS;
  V['$VERTICES']=(()=>{ try{ const r=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
    return r.reduce((t,q)=>t+q.length,0); }catch(e){ return null; } })();
  return V;
}
const FC_AJUDA={
  arredondar:(x,c)=>{const k=Math.pow(10,c||0);return Math.round((+x)*k)/k;},
  abs:x=>Math.abs(+x), raiz:x=>Math.sqrt(+x), pot:(x,n)=>Math.pow(+x,+n),
  min:(...a)=>Math.min(...a.map(Number)), max:(...a)=>Math.max(...a.map(Number)),
  se:(c,a,b)=>c?a:b,
  maiusc:t=>String(t??'').toUpperCase(), minusc:t=>String(t??'').toLowerCase(),
  titulo:t=>String(t??'').toLowerCase().replace(/(^|\s)\S/g,c=>c.toUpperCase()),
  juntar:(...a)=>a.map(v=>v==null?'':String(v)).join(''),
  texto:x=>x==null?'':String(x),
  numero:fcNumero,
  comprimento:t=>String(t??'').length,
  trecho:(t,i,n)=>String(t??'').substr(Math.max(0,(+i||1)-1), n==null?undefined:+n),
  trocar:(t,de,para)=>String(t??'').split(String(de)).join(String(para)),
  apara:t=>String(t??'').trim()
};
/* Traduz a expressão para JS percorrendo caractere a caractere:
     · texto entre ASPAS SIMPLES é preservado intacto (inclusive um $ dentro);
     · "CAMPO" (aspas duplas) vira leitura do ambiente;
     · $VARIAVEL de geometria/contexto também vira leitura do ambiente — sem
       isto ela seria um identificador livre e estouraria ReferenceError,
       zerando a coluna inteira em silêncio. */
function fcCompila(expr){
  const s=String(expr); let jsExpr='', i=0;
  while(i<s.length){
    const c=s[i];
    if(c==="'"){                                   // literal de texto
      let j=i+1, lit="'";
      while(j<s.length){
        if(s[j]==='\\'){ lit+=s[j]+(s[j+1]||''); j+=2; continue; }
        if(s[j]==="'"){ lit+="'"; j++; break; }
        lit+=s[j]; j++;
      }
      jsExpr+=lit; i=j; continue;
    }
    if(c==='"'){                                   // nome de campo
      const fim=s.indexOf('"', i+1);
      if(fim<0){ jsExpr+=c; i++; continue; }
      jsExpr+='V['+JSON.stringify(s.slice(i+1,fim))+']'; i=fim+1; continue;
    }
    if(c==='$'){                                   // variável de geometria/contexto
      const m=/^\$[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
      if(m){ jsExpr+='V['+JSON.stringify(m[0])+']'; i+=m[0].length; continue; }
    }
    jsExpr+=c; i++;
  }
  const nomes=Object.keys(FC_AJUDA);
  const corpo='return function(V,$){ const {'+nomes.join(',')+'}=$; return ('+jsExpr+'); };';
  return (new Function(corpo))();
}
function fcAvalia(L, expr, tipo){
  const fn=fcCompila(expr);                 // erro de sintaxe estoura aqui
  const out=[]; let erros=0, primeiroErro='';
  (L.features||[]).forEach((f,i)=>{
    let v=null;
    try{ v=fn(fcAmbiente(L,f,i), FC_AJUDA); }
    catch(e){ erros++; if(!primeiroErro)primeiroErro=e.message; v=null; }
    out.push(fcConverte(v,tipo));
  });
  return {valores:out, erros, primeiroErro};
}
function fcConverte(v,tipo){
  if(tipo==='N') return fcNumero(v);
  if(v==null) return '';
  if(typeof v==='boolean') return v?'sim':'não';
  return String(v);
}
/* NUMERAÇÃO AUTOMÁTICA — enumera as feições em ordem crescente segundo um
   critério (ordem da tabela, um campo, ou a posição no terreno). Devolve os
   valores JÁ NA ORDEM DAS FEIÇÕES da camada, para gravar direto. */
function fcChaveOrdem(L,f,i,criterio){
  switch(criterio){
    case 'tabela':   return i;
    case 'oeste':    return fcNumero(geomValor(L,f,'$X'));  // O → L
    case 'leste': { const n=fcNumero(geomValor(L,f,'$X')); return n==null?null:-n; }
    case 'norte': { const n=fcNumero(geomValor(L,f,'$Y')); return n==null?null:-n; } // N → S
    case 'sul':      return fcNumero(geomValor(L,f,'$Y'));
    case 'maior': { const n=fcNumero(geomValor(L,f,L.gtype==='polygon'?'$AREA_M2':'$COMPRIM')); return n==null?null:-n; }
    case 'menor':    return fcNumero(geomValor(L,f,L.gtype==='polygon'?'$AREA_M2':'$COMPRIM'));
    default:         return null;                            // por campo: trata fora
  }
}
function fcNumera(L,o){
  const feats=L.features||[];
  const idx=feats.map((f,i)=>i);
  if(o.criterio==='campo' && o.campo){
    /* Ordena pelo campo: números comparam como número, texto como texto (com
       acento e caixa neutros), para "Área 10" vir depois de "Área 9". */
    const val=i=>feats[i].props?feats[i].props[o.campo]:null;
    const num=fcNumero;
    const naoVazios=feats.map((f,i)=>val(i)).filter(v=>v!=null&&String(v).trim()!=='');
    const todosNum=naoVazios.length>0&&naoVazios.every(v=>num(v)!==null);
    idx.sort((a,b)=>{
      const va=val(a), vb=val(b);
      const vazioA=va==null||String(va).trim()==='', vazioB=vb==null||String(vb).trim()==='';
      if(vazioA&&vazioB) return a-b;
      if(vazioA) return 1;
      if(vazioB) return -1;
      if(todosNum) return num(val(a))-num(val(b));
      return String(va).localeCompare(String(vb),'pt-BR',{numeric:true,sensitivity:'base'});
    });
  }else{
    const k=feats.map((f,i)=>fcChaveOrdem(L,f,i,o.criterio));
    idx.sort((a,b)=>{
      const ka=k[a], kb=k[b];
      if(ka==null&&kb==null) return a-b;
      if(ka==null) return 1;
      if(kb==null) return -1;
      return ka-kb || a-b;                                   // empate: ordem da tabela
    });
  }
  if(o.decrescente) idx.reverse();
  const out=new Array(feats.length);
  idx.forEach((iFeic,pos)=>{
    const n=(+o.inicio||1)+pos*(+o.passo||1);
    let txt=String(Math.round(n));
    if(+o.digitos>0) txt=txt.padStart(+o.digitos,'0');
    out[iFeic]=(o.tipo==='N') ? n : ((o.prefixo||'')+txt+(o.sufixo||''));
  });
  return out;
}

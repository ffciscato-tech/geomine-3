/* ==========================================================================
   FÓRMULAS SEGURAS PARA RÓTULOS
   Sintaxe próxima da calculadora/QGIS, mas avaliada por AST próprio: nenhum
   eval/new Function e nenhum acesso a propriedades do navegador.
   ========================================================================== */
const LABEL_FORMULA_FUNCOES=new Set([
  'arredondar','abs','raiz','pot','min','max','se','coalesce','formatar',
  'maiusc','minusc','titulo','juntar','texto','numero','comprimento','trecho',
  'trocar','apara'
]);
const LABEL_FORMULA_VARIAVEIS=new Set([
  '$COMPRIM','$AREA_M2','$AREA_HA','$PERIM','$X','$Y','$Z','$ID','$LINHA',
  '$NFEIC','$CAMADA','$CRS','$VERTICES'
]);
function lfNormNome(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function lfNumero(v){
  if(typeof v==='number')return Number.isFinite(v)?v:null;
  let s=String(v??'').trim().replace(/[\s\u00a0]/g,'');if(!s)return null;
  const vg=s.lastIndexOf(','),pt=s.lastIndexOf('.');
  if(vg>=0&&pt>=0)s=vg>pt?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
  else if(vg>=0){if(s.indexOf(',')!==vg)return null;s=s.replace(',','.');}
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s))return null;
  const n=Number(s);return Number.isFinite(n)?n:null;
}
function lfTokeniza(expr){
  const s=String(expr??'');
  if(s.length>1200)throw new Error('A fórmula ultrapassa 1.200 caracteres');
  const out=[];let i=0;
  const add=(t,v,p=i)=>{out.push({t,v,p});if(out.length>600)throw new Error('A fórmula tem elementos demais');};
  while(i<s.length){
    const c=s[i];if(/\s/.test(c)){i++;continue;}
    if(c==="'"){
      const p=i++;let v='',fechou=false;
      while(i<s.length){
        if(s[i]==="'"&&s[i+1]==="'"){v+="'";i+=2;continue;}
        if(s[i]==="'"){i++;fechou=true;break;}
        if(s[i]==='\\'){
          const n=s[++i];if(n==null)break;
          v+=n==='n'?'\n':n==='t'?'\t':n==='r'?'\r':n;i++;continue;
        }
        v+=s[i++];
      }
      if(!fechou)throw new Error('Texto sem aspas de fechamento na posição '+(p+1));
      add('lit',v,p);continue;
    }
    if(c==='"'){
      const p=i++;let v='',fechou=false;
      while(i<s.length){
        if(s[i]==='"'&&s[i+1]==='"'){v+='"';i+=2;continue;}
        if(s[i]==='"'){i++;fechou=true;break;}
        v+=s[i++];
      }
      if(!fechou)throw new Error('Campo sem aspas de fechamento na posição '+(p+1));
      if(!v.trim())throw new Error('Nome de campo vazio na posição '+(p+1));
      add('campo',v,p);continue;
    }
    if(c==='$'){
      const p=i,m=/^\$[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
      if(!m)throw new Error('Variável inválida na posição '+(i+1));
      i+=m[0].length;add('var',m[0].toUpperCase(),p);continue;
    }
    const n=/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i));
    if(n){const p=i;i+=n[0].length;add('lit',Number(n[0]),p);continue;}
    const id=/^[A-Za-zÀ-ÖØ-öø-ÿ_][A-Za-zÀ-ÖØ-öø-ÿ0-9_]*/.exec(s.slice(i));
    if(id){const p=i;i+=id[0].length;add('id',id[0],p);continue;}
    const op=['<=','>=','<>','!=','==','||','&&'].find(x=>s.startsWith(x,i));
    if(op){const p=i;i+=op.length;add('op',op,p);continue;}
    if('+-*/%=<>!(),'.includes(c)){const p=i++;add(c==='('||c===')'||c===','?c:'op',c,p);continue;}
    throw new Error('Símbolo não permitido na fórmula, posição '+(i+1));
  }
  add('eof','',s.length);return out;
}
function lfCompila(expr){
  const T=lfTokeniza(expr);let k=0,prof=0;
  const campos=new Set(),variaveis=new Set(),peek=()=>T[k],take=()=>T[k++];
  const erro=m=>{throw new Error(m+' (posição '+((peek()?.p||0)+1)+')');};
  const op=v=>peek().t==='op'&&peek().v===v;
  const kw=v=>peek().t==='id'&&lfNormNome(peek().v)===v;
  function prim(){
    const q=peek();
    if(q.t==='lit'){take();return {t:'lit',v:q.v};}
    if(q.t==='campo'){take();campos.add(q.v);return {t:'campo',v:q.v};}
    if(q.t==='var'){take();variaveis.add(q.v);return {t:'var',v:q.v};}
    if(q.t==='('){take();if(++prof>40)erro('Fórmula muito aninhada');const a=ou();
      if(peek().t!==')')erro('Falta fechar parêntese');take();prof--;return a;}
    if(q.t==='id'){
      const nome=lfNormNome(q.v);take();
      if(nome==='verdadeiro'||nome==='true'||nome==='sim')return {t:'lit',v:true};
      if(nome==='falso'||nome==='false')return {t:'lit',v:false};
      if(nome==='nulo'||nome==='null')return {t:'lit',v:null};
      if(peek().t!=='(')erro('Use aspas duplas para campos; identificador desconhecido: '+q.v);
      if(!LABEL_FORMULA_FUNCOES.has(nome))erro('Função não permitida: '+q.v);
      take();const a=[];
      if(peek().t!==')')for(;;){a.push(ou());if(peek().t===','){take();continue;}break;}
      if(peek().t!==')')erro('Falta fechar a função '+q.v);take();return {t:'call',n:nome,a};
    }
    erro('Valor esperado');
  }
  function un(){
    if(op('+')||op('-')||op('!')){const o=take().v;return {t:'un',o,a:un()};}
    if(kw('nao')||kw('not')){take();return {t:'un',o:'!',a:un()};}
    return prim();
  }
  function mul(){let a=un();while(op('*')||op('/')||op('%')){const o=take().v;a={t:'bin',o,a,b:un()};}return a;}
  function soma(){let a=mul();while(op('+')||op('-')){const o=take().v;a={t:'bin',o,a,b:mul()};}return a;}
  function concat(){let a=soma();while(op('||')){take();a={t:'bin',o:'||',a,b:soma()};}return a;}
  function compara(){let a=concat();while(['=','==','!=','<>','<','<=','>','>='].some(op)){
    const o=take().v;a={t:'bin',o,a,b:concat()};}return a;}
  function e(){let a=compara();while(op('&&')||kw('e')||kw('and')){take();a={t:'bin',o:'e',a,b:compara()};}return a;}
  function ou(){let a=e();while(kw('ou')||kw('or')){take();a={t:'bin',o:'ou',a,b:e()};}return a;}
  const ast=ou();if(peek().t!=='eof')erro('Trecho inesperado');
  return {expr:String(expr),ast,campos:[...campos],variaveis:[...variaveis]};
}
function lfVerdade(v){if(v==null||v==='')return false;if(typeof v==='string'&&/^(?:0|false|falso|não|nao)$/i.test(v.trim()))return false;return !!v;}
function lfCompara(a,b){const x=lfNumero(a),y=lfNumero(b);if(x!=null&&y!=null)return x===y?0:(x<y?-1:1);
  return String(a??'').localeCompare(String(b??''),'pt-BR',{numeric:true,sensitivity:'base'});}
function lfChama(n,a){
  const num=(v,d=0)=>lfNumero(v)??d;
  switch(n){
    case 'arredondar':{const c=Math.max(0,Math.min(10,Math.trunc(num(a[1])))),p=10**c;return Math.round(num(a[0])*p)/p;}
    case 'abs':return Math.abs(num(a[0]));case 'raiz':return Math.sqrt(num(a[0]));
    case 'pot':return Math.pow(num(a[0]),num(a[1]));case 'min':return Math.min(...a.map(v=>num(v)));
    case 'max':return Math.max(...a.map(v=>num(v)));case 'se':return lfVerdade(a[0])?a[1]:a[2];
    case 'coalesce':return a.find(v=>v!=null&&v!=='')??null;
    case 'formatar':{const x=lfNumero(a[0]);if(x==null)return '';const c=Math.max(0,Math.min(10,Math.trunc(num(a[1],0))));
      return x.toLocaleString('pt-BR',{minimumFractionDigits:c,maximumFractionDigits:c});}
    case 'maiusc':return String(a[0]??'').toUpperCase();case 'minusc':return String(a[0]??'').toLowerCase();
    case 'titulo':return String(a[0]??'').toLowerCase().replace(/(^|\s)\S/g,c=>c.toUpperCase());
    case 'juntar':return a.map(v=>v==null?'':String(v)).join('');case 'texto':return a[0]==null?'':String(a[0]);
    case 'numero':return lfNumero(a[0]);case 'comprimento':return String(a[0]??'').length;
    case 'trecho':return String(a[0]??'').substr(Math.max(0,Math.trunc(num(a[1],1))-1),a[2]==null?undefined:Math.max(0,Math.trunc(num(a[2]))));
    case 'trocar':return String(a[0]??'').split(String(a[1]??'')).join(String(a[2]??''));
    case 'apara':return String(a[0]??'').trim();default:throw new Error('Função não permitida: '+n);
  }
}
function lfExecuta(n,V){
  switch(n.t){
    case 'lit':return n.v;case 'campo':return V[n.v]??null;case 'var':return V[n.v]??null;
    case 'un':{const a=lfExecuta(n.a,V);if(n.o==='!')return !lfVerdade(a);const x=lfNumero(a);return x==null?null:(n.o==='-'?-x:x);}
    case 'call':return lfChama(n.n,n.a.map(x=>lfExecuta(x,V)));
    case 'bin':{
      if(n.o==='e')return lfVerdade(lfExecuta(n.a,V))&&lfVerdade(lfExecuta(n.b,V));
      if(n.o==='ou')return lfVerdade(lfExecuta(n.a,V))||lfVerdade(lfExecuta(n.b,V));
      const a=lfExecuta(n.a,V),b=lfExecuta(n.b,V);
      if(n.o==='||')return String(a??'')+String(b??'');
      if(['=','==','!=','<>','<','<=','>','>='].includes(n.o)){const c=lfCompara(a,b);
        return n.o==='='||n.o==='=='?c===0:n.o==='!='||n.o==='<>'?c!==0:n.o==='<'?c<0:n.o==='<='?c<=0:n.o==='>'?c>0:c>=0;}
      if(n.o==='+'&&(typeof a==='string'||typeof b==='string'))return String(a??'')+String(b??'');
      const x=lfNumero(a),y=lfNumero(b);if(x==null||y==null)return null;
      if(n.o==='+')return x+y;if(n.o==='-')return x-y;if(n.o==='*')return x*y;
      if(n.o==='/')return y===0?null:x/y;if(n.o==='%')return y===0?null:x%y;return null;
    }
  }
  return null;
}
function labelFormulaAmbiente(L,f,idx){
  const V=Object.create(null);Object.entries((f&&f.props)||{}).forEach(([k,v])=>V[k]=v);
  geomCamposDe(L.gtype).forEach(k=>V[k]=geomValor(L,f,k));
  V.$X=V.$X??geomValor(L,f,'$X');V.$Y=V.$Y??geomValor(L,f,'$Y');
  const z=Array.isArray(f&&f.zg)?f.zg[0]:f&&f.zg;V.$Z=Number.isFinite(+z)?+z:null;
  const i=Number.isInteger(idx)?idx:0;V.$ID=i+1;V.$LINHA=i+1;V.$NFEIC=(L.features||[]).length;
  V.$CAMADA=L.name;V.$CRS=L.crs||S.workCRS;
  V.$VERTICES=(()=>{let n=0;(function walk(g){if(!Array.isArray(g))return;if(typeof g[0]==='number'){n++;return;}g.forEach(walk);})(f&&f.geom);return n;})();
  return V;
}
function labelFormulaValida(expr,L){
  const s=String(expr||'').trim();if(!s)return {ok:true,compiled:null};
  try{
    const compiled=lfCompila(s),disponiveis=new Set((L&&L.fields||[]).map(x=>typeof x==='string'?x:x&&x.name).filter(Boolean));
    if(L)for(const f of (L.features||[]).slice(0,20))Object.keys((f&&f.props)||{}).forEach(k=>disponiveis.add(k));
    const faltam=compiled.campos.filter(k=>!disponiveis.has(k));
    if(faltam.length)return {ok:false,error:'Campo não encontrado: '+faltam.map(x=>'"'+x+'"').join(', ')};
    const vars=compiled.variaveis.filter(k=>!LABEL_FORMULA_VARIAVEIS.has(k));
    if(vars.length)return {ok:false,error:'Variável desconhecida: '+vars.join(', ')};
    return {ok:true,compiled};
  }catch(e){return {ok:false,error:e&&e.message?e.message:String(e)};}
}
function labelFormulaAvalia(L,f,expr,idx){
  const s=String(expr||'').trim();if(!s)return {ok:true,value:null};
  let C=L._labelExprCache;
  if(!C||C.expr!==s){const v=labelFormulaValida(s,L);C=L._labelExprCache=v.ok?{expr:s,compiled:v.compiled}:{expr:s,error:v.error};}
  if(C.error)return {ok:false,error:C.error};
  try{
    if(!Number.isInteger(idx)&&/(?:\$ID|\$LINHA)\b/i.test(s))idx=(L.features||[]).indexOf(f);
    let value=lfExecuta(C.compiled.ast,labelFormulaAmbiente(L,f,Number.isInteger(idx)&&idx>=0?idx:0));
    if(typeof value==='number'&&!Number.isFinite(value))value=null;
    if(value!=null&&String(value).length>4000)value=String(value).slice(0,4000);
    return {ok:true,value};
  }catch(e){return {ok:false,error:e&&e.message?e.message:String(e)};}
}
function labelFormulaTexto(L,f,expr,idx){
  const c=labelCfg(L);if(!labelPassaFiltro(L,f,c))return null;
  const r=labelFormulaAvalia(L,f,expr,idx);if(!r.ok){L._labelExprError=r.error;return null;}
  L._labelExprError='';let v=r.value;if(v==null||v==='')return null;
  if(c.dec>=0&&typeof v==='number')v=v.toLocaleString('pt-BR',{minimumFractionDigits:c.dec,maximumFractionDigits:c.dec});
  let t=typeof v==='boolean'?(v?'sim':'não'):String(v);
  if(c.case==='upper')t=t.toUpperCase();else if(c.case==='lower')t=t.toLowerCase();
  else if(c.case==='title')t=t.replace(/\S+/g,w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase());
  return (c.pre||'')+t+(c.suf||'');
}
function labelAtivo(L){return !!String(labelCfg(L).expr||'').trim()||labelCampos(L).length>0;}

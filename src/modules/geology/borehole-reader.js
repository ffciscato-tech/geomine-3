/* GeoMine — importação de sondagens, sem estado de projeto/interface.
   Adapta o fluxo collar/survey/intervalos e a curvatura mínima do Varioscape.
   As verificações são estritas: nenhuma linha inválida é descartada.
   XYZ e profundidade medida em metros. Azimute: norte, sentido horário.
   O dip normalizado é positivo para baixo, entre -90 e +90 graus. */
(function(root){
  'use strict';
  const limits=Object.freeze({textBytes:64*1024*1024,fieldChars:1024*1024,rows:250000,columns:256,cells:2000000,
    holes:10000,intervals:250000,stations:10000,tracePerHole:12000,traceTotal:1000000});
  const NUMBER=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
  function fail(message){throw new Error('Sondagens: '+message);}
  function idText(value,where){
    const id=String(value==null?'':value).trim();
    if(!id||id.length>160||/[\u0000-\u001f\u007f]/.test(id))fail(where+': informe um identificador não vazio, sem controles e com até 160 caracteres.');
    return id;
  }
  function numeric(value,table,where,optional=false){
    let s=String(value==null?'':value).trim();
    if(s===''){if(optional)return null;fail(where+': valor numérico ausente.');}
    if(table&&table.decimalComma&&s.includes(',')){
      if(/^[+-]?\d{1,3}(?:\.\d{3})+,\d+(?:[eE][+-]?\d+)?$/.test(s))s=s.replace(/\./g,'').replace(',','.');
      else if(/^[+-]?(?:\d+(?:,\d*)?|,\d+)(?:[eE][+-]?\d+)?$/.test(s))s=s.replace(',','.');
    }else if(table&&table.decimalComma&&/^[+-]?\d{1,3}(?:\.\d{3})+(?:[eE][+-]?\d+)?$/.test(s)&&Number(s)!==Number(s.replace(/\./g,''))){
      fail(where+': número ambíguo (“'+s+'”) em tabela com vírgula decimal. Remova separadores de milhar ou use a vírgula decimal explicitamente.');
    }
    if(!NUMBER.test(s)||!Number.isFinite(Number(s)))fail(where+': número inválido (“'+String(value).slice(0,60)+'”).');
    return Number(s);
  }
  function delimiterOf(source){
    let quoted=false;const counts=new Map([[',',0],[';',0],['\t',0],['|',0]]);
    for(let i=0;i<source.length;i++){
      const c=source[i];if(c==='"'){if(quoted&&source[i+1]==='"')i++;else quoted=!quoted;}
      else if(!quoted&&(c==='\n'||c==='\r')){if([...counts.values()].some(Boolean))break;}
      else if(!quoted&&counts.has(c))counts.set(c,counts.get(c)+1);
    }
    return [...counts].sort((a,b)=>b[1]-a[1])[0][0];
  }
  function parseCSV(source,options={}){
    if(typeof source!=='string')fail('o CSV deve ser fornecido como texto.');
    if(source.length>limits.textBytes)fail('CSV acima do limite de 64 MB. Divida a campanha.');
    source=source.replace(/^\uFEFF/,'');const delimiter=options.delimiter||delimiterOf(source);
    if(typeof delimiter!=='string'||delimiter.length!==1||/[\r\n"\w]/.test(delimiter))fail('separador CSV inválido.');
    const records=[];let row=[],field='',quoted=false,closed=false,start=true,line=1,cells=0;
    function fieldDone(){
      // Verifique antes da alocação: milhões de separadores numa só linha
      // não podem produzir uma lista imensa antes de chegar ao fim da linha.
      if(row.length>=limits.columns)fail('CSV tem mais de '+limits.columns+' colunas.');
      if(field.length>limits.fieldChars)fail('linha '+line+': campo CSV excessivamente longo (limite de 1 milhão de caracteres).');
      row.push(field.trim());field='';closed=false;start=true;
    }
    function rowDone(){
      fieldDone();
      if(row.length!==1||row[0]!==''){
        if(row.length>limits.columns)fail('CSV tem mais de '+limits.columns+' colunas.');
        cells+=row.length;if(cells>limits.cells||records.length>limits.rows)fail('CSV excede o limite seguro de linhas/células.');
        records.push(row);
      }
      row=[];
    }
    for(let i=0;i<source.length;i++){
      const c=source[i];
      if(field.length>limits.fieldChars)fail('linha '+line+': campo CSV excessivamente longo (limite de 1 milhão de caracteres).');
      if(c==='\u0000')fail('CSV contém byte NUL; selecione um CSV de texto, não Excel binário.');
      if(quoted){
        if(c==='"'){if(source[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}
        else{if(c==='\n')line++;field+=c;}continue;
      }
      if(closed&&c!==delimiter&&c!=='\r'&&c!=='\n'&&c!==' '&&c!=='\t')fail('linha '+line+': texto inesperado após aspas de fechamento.');
      if(c===delimiter){fieldDone();continue;}
      if(c==='\r'||c==='\n'){if(c==='\r'&&source[i+1]==='\n')i++;rowDone();line++;continue;}
      if(c==='"'){
        if(!start&&field.trim()!=='')fail('linha '+line+': aspas dentro de campo não delimitado.');
        quoted=true;start=false;continue;
      }
      if(!closed){field+=c;if(c!==' '&&c!=='\t')start=false;}
    }
    if(quoted)fail('CSV incompleto: campo entre aspas não foi fechado.');
    if(field!==''||row.length||closed)rowDone();
    if(records.length<2)fail('CSV deve conter cabeçalho e pelo menos uma linha de dados.');
    const columns=records.shift(),seen=new Set();
    for(const column of columns){
      if(!column||column.length>256||/[\u0000-\u001f\u007f]/.test(column))fail('cabeçalho vazio, excessivamente longo ou com caracteres de controle.');
      if(seen.has(column))fail('coluna duplicada no cabeçalho: '+column);seen.add(column);
    }
    records.forEach((r,i)=>{if(r.length!==columns.length)fail('registro '+(i+2)+': '+r.length+' valores para '+columns.length+' colunas; confira o separador.');});
    const decimalComma=records.some(r=>r.some(v=>/^[+-]?(?:(?:\d{1,3}(?:\.\d{3})+|\d+),\d+|,\d+)(?:[eE][+-]?\d+)?$/.test(v)));
    return {columns,rows:records,decimalComma,delimiter};
  }
  function tableOf(spec,name){
    const t=spec&&spec.table;
    if(!t||!Array.isArray(t.columns)||!Array.isArray(t.rows)||!t.columns.length)fail(name+': tabela não carregada.');
    if(t.columns.length>limits.columns||t.rows.length>limits.rows||t.rows.length*t.columns.length>limits.cells)fail(name+': tabela excede o limite seguro.');
    if(new Set(t.columns).size!==t.columns.length||t.columns.some(c=>typeof c!=='string'||!c))fail(name+': cabeçalhos inválidos/duplicados.');
    t.rows.forEach((r,i)=>{if(!Array.isArray(r)||r.length!==t.columns.length)fail(name+', linha '+(i+2)+': quantidade incorreta de colunas.');});
    return t;
  }
  function mapper(spec,required,name){
    const table=tableOf(spec,name),map=spec.map||{},indices=Object.create(null),used=new Map();
    for(const key of Object.keys(map)){
      const value=map[key];if(value==null||value===''||value===-1||value==='-1')continue;
      let index=typeof value==='number'?value:table.columns.indexOf(String(value));
      if(index<0&&/^\d+$/.test(String(value)))index=Number(value);
      if(!Number.isInteger(index)||index<0||index>=table.columns.length)fail(name+': coluna mapeada inexistente para '+key+'.');
      if(used.has(index))fail(name+': a coluna “'+table.columns[index]+'” foi escolhida para '+used.get(index)+' e '+key+'. Cada atributo deve ter sua própria coluna.');
      used.set(index,key);
      indices[key]=index;
    }
    for(const key of required)if(!own(indices,key))fail(name+': escolha a coluna '+key+'.');
    return {table,indices,value:(row,key)=>own(indices,key)?row[indices[key]]:null};
  }
  function attrs(table,row){const out=Object.create(null);table.columns.forEach((key,i)=>{out[key]=row[i];});return out;}
  function angle(az,dip,convention,where){
    if(!['down','negative-down','zenith'].includes(convention))fail('selecione a convenção de inclinação: down, negative-down ou zenith.');
    if(az<0||az>360)fail(where+': azimute deve estar entre 0 e 360°.');
    if(convention==='zenith'){
      if(dip<0||dip>180)fail(where+': ângulo zenital deve estar entre 0 e 180°.');dip=90-dip;
    }else{
      if(dip<-90||dip>90)fail(where+': inclinação deve estar entre −90 e 90°.');
      if(convention==='negative-down')dip=-dip;
    }
    return {az:az===360?0:az,dip};
  }
  function direction(az,dip){const a=az*Math.PI/180,b=dip*Math.PI/180,c=Math.cos(b);return [Math.sin(a)*c,Math.cos(a)*c,-Math.sin(b)];}
  function dot(a,b){return Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1]+a[2]*b[2]));}
  function desurvey(stations,depth,collar){
    // Curvatura mínima do Varioscape: dl/2 * RF * (d1+d2).
    // Slerp parametriza a direção pelo arco, preservando exatamente a solução
    // de cada trecho de survey mesmo quando densificado para visualização.
    if(!Number.isFinite(depth)||depth<=0||depth>1e7||!Array.isArray(collar)||collar.length!==3||!collar.every(Number.isFinite)||
      !Array.isArray(stations)||!stations.length||stations.length>limits.stations+1)fail('dados inválidos para calcular a trajetória.');
    stations.forEach((s,i)=>{
      if(!s||![s.md,s.az,s.dip].every(Number.isFinite)||s.md<0||s.md>depth+1e-8||s.az<0||s.az>=360||s.dip<-90||s.dip>90||
        (i===0&&s.md!==0)||(i>0&&s.md<=stations[i-1].md))fail('estações inválidas para calcular a trajetória; inicie em MD 0 e use profundidades crescentes.');
    });
    const trace=[{x:collar[0],y:collar[1],z:collar[2],md:0}];let xyz=collar.slice();
    const step=Math.max(.5,depth/240);
    for(let si=0;si<stations.length;si++){
      const a=stations[si],b=stations[si+1]||{...a,md:depth};if(a.md>=depth)break;
      const end=Math.min(depth,b.md),length=end-a.md;if(length<=0)continue;
      const d1=direction(a.az,a.dip),d2=direction(b.az,b.dip),dogleg=Math.acos(dot(d1,d2));
      if(dogleg>=Math.PI-1e-7)fail('mudança de direção de 180° entre estações não permite curvatura mínima.');
      const n=stations.length===1?1:Math.max(1,Math.ceil(length/step));
      if(trace.length+n>limits.tracePerHole)fail('trajetória com estações demais; divida a campanha/revise o survey.');
      const origin=xyz.slice();
      for(let k=1;k<=n;k++){
        const t=k/n,at=a.md+length*t,theta=dogleg*t;
        let d=d1;
        if(dogleg>1e-10){const den=Math.sin(dogleg),u=Math.sin((1-t)*dogleg)/den,v=Math.sin(t*dogleg)/den;d=d1.map((value,i)=>u*value+v*d2[i]);}
        const rf=theta<1e-8?1:2/theta*Math.tan(theta/2),factor=length*t/2*rf;
        xyz=origin.map((value,i)=>value+factor*(d1[i]+d[i]));
        if(!xyz.every(Number.isFinite))fail('coordenadas não finitas na trajetória calculada.');
        trace.push({x:xyz[0],y:xyz[1],z:xyz[2],md:at});
      }
    }
    return trace;
  }
  function validateRanges(entries,depth,where){
    const sorted=entries.slice().sort((a,b)=>a.DE_M-b.DE_M||a.ATE_M-b.ATE_M);let previous=null;
    for(const r of sorted){
      if(r.DE_M<0||r.ATE_M<=r.DE_M)fail(where+': intervalo '+r.DE_M+'–'+r.ATE_M+' inválido (0 ≤ De < Até).');
      if(depth!=null&&r.ATE_M>depth+1e-8)fail(where+': intervalo até '+r.ATE_M+' m ultrapassa a profundidade declarada de '+depth+' m.');
      if(previous&&r.DE_M<previous.ATE_M-1e-8)fail(where+': intervalos sobrepostos em '+r.DE_M+' m.');
      previous=r;
    }
    return sorted;
  }
  function buildCSV(input){
    input=input||{};const warnings=[],holes=[],byId=new Map(),c=mapper(input.collar,['id','x','y','z'],'Collar'),convention=input.dipConvention;
    let intervalCount=0,traceCount=0,stationCount=0,cellCount=c.table.rows.length*c.table.columns.length;
    function countTable(table){cellCount+=table.rows.length*table.columns.length;if(cellCount>limits.cells)fail('o conjunto de tabelas excede '+limits.cells+' células; divida a campanha.');}
    c.table.rows.forEach((row,i)=>{
      const where='Collar, linha '+(i+2),id=idText(c.value(row,'id'),where);
      if(byId.has(id))fail('collar duplicado para o furo '+id+'.');
      if(holes.length>=limits.holes)fail('campanha com mais de '+limits.holes+' furos.');
      const collar=['x','y','z'].map(k=>numeric(c.value(row,k),c.table,where+' '+k));
      const depth=numeric(c.value(row,'depth'),c.table,where+' profundidade',true);
      if(depth!=null&&(depth<=0||depth>1e7))fail(where+': profundidade deve ser positiva e até 10 milhões de metros.');
      const az=numeric(c.value(row,'az'),c.table,where+' azimute',true),dip=numeric(c.value(row,'dip'),c.table,where+' inclinação',true);
      if((az==null)!==(dip==null))fail(where+': informe azimute e inclinação juntos.');
      const orientation=az==null?null:angle(az,dip,convention,where);
      const hole={id,collar,depth,survey:[],trace:[],geologyLog:[],coreRuns:[],tables:[],attributes:attrs(c.table,row),_orientation:orientation};
      holes.push(hole);byId.set(id,hole);
    });
    if(!holes.length)fail('a tabela collar não contém furos.');
    function owner(row,m,name,i){const id=idText(m.value(row,'id'),name+', linha '+(i+2)),hole=byId.get(id);if(!hole)fail(name+', linha '+(i+2)+': furo '+id+' não existe na tabela collar.');return hole;}
    if(input.survey){
      const s=mapper(input.survey,['id','md','az','dip'],'Survey');countTable(s.table);
      s.table.rows.forEach((row,i)=>{
        const where='Survey, linha '+(i+2),hole=owner(row,s,'Survey',i),md=numeric(s.value(row,'md'),s.table,where+' profundidade');
        if(++stationCount>limits.rows)fail('a campanha excede '+limits.rows+' estações survey.');
        if(md<0)fail(where+': profundidade negativa.');
        if(hole.survey.length>=limits.stations)fail('furo '+hole.id+' com estações demais.');
        const orientation=angle(numeric(s.value(row,'az'),s.table,where+' azimute'),numeric(s.value(row,'dip'),s.table,where+' inclinação'),convention,where);
        hole.survey.push({md,...orientation,attributes:attrs(s.table,row)});
      });
    }
    const intervalSpecs=input.intervals||[];if(!Array.isArray(intervalSpecs)||intervalSpecs.length>50)fail('selecione até 50 tabelas de intervalos.');
    intervalSpecs.forEach((spec,tableIndex)=>{
      const name=String(spec.name||'Intervalos '+(tableIndex+1)),role=spec.role||'drill';
      if(!['lithology','drill','assay','core'].includes(role))fail(name+': finalidade de tabela não reconhecida.');
      const m=mapper(spec,['id','from','to'],name),perHole=new Map();countTable(m.table);
      m.table.rows.forEach((row,i)=>{
        if(++intervalCount>limits.intervals)fail('a campanha excede '+limits.intervals+' intervalos.');
        const where=name+', linha '+(i+2),hole=owner(row,m,name,i),a=attrs(m.table,row);
        const entry={DE_M:numeric(m.value(row,'from'),m.table,where+' De'),ATE_M:numeric(m.value(row,'to'),m.table,where+' Até'),
          LITOLOGIA:String(m.value(row,'lithology')||''),attributes:a,source:{table:name,role,row:i+2}};
        for(const [key,out] of [['recovery','REC_PCT'],['rqd','RQD_PCT']])if(own(m.indices,key)){
          const value=numeric(m.value(row,key),m.table,where+' '+key,true);
          if(value!=null&&(value<0||value>100))fail(where+': '+key+' deve estar entre 0 e 100%.');entry[out]=value;
        }
        if(!perHole.has(hole.id))perHole.set(hole.id,[]);perHole.get(hole.id).push({entry,row:row.slice()});
      });
      perHole.forEach((records,id)=>{
        const h=byId.get(id),entries=validateRanges(records.map(r=>r.entry),h.depth,name+' / '+id);
        h.tables.push({name,role,columns:m.table.columns.slice(),rows:records.map(r=>r.row),map:{...spec.map},decimalComma:!!m.table.decimalComma,intervals:entries});
        if(role==='lithology'||(role==='drill'&&own(m.indices,'lithology')))h.geologyLog=h.geologyLog.concat(entries);
        if(role==='core')h.coreRuns=h.coreRuns.concat(entries);
      });
    });
    for(const h of holes){
      const warningStart=warnings.length;
      if(h.survey.length){
        let reordered=false;for(let i=1;i<h.survey.length;i++)if(h.survey[i].md<h.survey[i-1].md)reordered=true;
        h.survey.sort((a,b)=>a.md-b.md);
        for(let i=1;i<h.survey.length;i++)if(Math.abs(h.survey[i].md-h.survey[i-1].md)<1e-8)fail('furo '+h.id+': estações survey duplicadas na profundidade '+h.survey[i].md+' m.');
        if(reordered)warnings.push(h.id+': estações survey ordenadas por profundidade medida.');
      }
      let observed=h.survey.length?h.survey[h.survey.length-1].md:0;
      for(const table of h.tables)for(const entry of table.intervals)observed=Math.max(observed,entry.ATE_M);
      if(h.depth==null){
        if(!(observed>0)){
          // A collar é suficiente para cadastrar a boca. Sem profundidade,
          // não inventar uma trajetória, espessura, survey ou litologia.
          h.trace=[{x:h.collar[0],y:h.collar[1],z:h.collar[2],md:0}];traceCount++;
          if(!h.survey.length&&h._orientation)h.survey=[{md:0,...h._orientation,derived:true}];
          warnings.push(h.id+': somente boca do furo; profundidade não informada. Nenhuma trajetória de subsolo foi criada.');
          delete h._orientation;
          h.source={format:'csv',method:'collar-only',depthBasis:'unknown',dipConvention:convention||null,normalizedDipConvention:'down',warnings:warnings.slice(warningStart)};
          continue;
        }
        h.depth=observed;warnings.push(h.id+': profundidade de '+observed+' m inferida do último survey/intervalo; não é profundidade total declarada no collar.');
      }else if(observed>h.depth+1e-8)fail('furo '+h.id+': survey/intervalos ultrapassam a profundidade declarada de '+h.depth+' m.');
      if(h.depth>1e7)fail('profundidade excessiva no furo '+h.id+'.');
      h.geologyLog=validateRanges(h.geologyLog,h.depth,'Litologia / '+h.id);
      h.coreRuns=validateRanges(h.coreRuns,h.depth,'Testemunho / '+h.id);
      if(!h.survey.length){
        let orientation=h._orientation;
        if(!orientation){
          if(input.allowVertical!==true)fail('furo '+h.id+': falta survey ou orientação do collar. Confirme explicitamente a hipótese vertical se ela for válida.');
          orientation={az:0,dip:90};warnings.push(h.id+': trajetória vertical assumida por confirmação explícita; não representa survey medido.');
        }
        h.survey=[{md:0,...orientation,derived:true}];
      }else if(h.survey[0].md>0){
        const orientation=h._orientation||{az:h.survey[0].az,dip:h.survey[0].dip};
        h.survey.unshift({md:0,...orientation,derived:true});
        warnings.push(h.id+': orientação na boca '+(h._orientation?'obtida do collar.':'inferida da primeira estação survey.'));
      }
      if(h.survey.length>1&&h.survey.at(-1).md<h.depth)warnings.push(h.id+': última orientação survey prolongada até '+h.depth+' m.');
      h.trace=desurvey(h.survey,h.depth,h.collar);traceCount+=h.trace.length;
      if(traceCount>limits.traceTotal)fail('campanha excede o limite de '+limits.traceTotal+' pontos de trajetória; divida a campanha.');
      if(h.trace.some((p,i)=>i&&p.z>h.trace[i-1].z+1e-8))warnings.push(h.id+': a trajetória possui trecho ascendente. Confira a convenção da inclinação se o furo deveria descer.');
      delete h._orientation;
      h.source={format:'csv',method:'minimum-curvature',dipConvention:convention||null,normalizedDipConvention:'down',
        warnings:warnings.slice(warningStart)};
    }
    return {holes,warnings};
  }
  function buildSTR(data,options={}){
    if(!root.GeoMineSurpacReader?.parseSTR)fail('leitor Surpac não carregado.');
    if((typeof data==='string'?data.length:data?.byteLength)>limits.textBytes)fail('STR acima do limite de 64 MB. Divida a campanha.');
    const parsed=root.GeoMineSurpacReader.parseSTR(data,{maxRecords:limits.traceTotal+limits.holes+1,maxPoints:limits.traceTotal,
      maxSegmentPoints:limits.tracePerHole,maxStrings:limits.holes}),holes=[],warnings=['STR: profundidade calculada pelo comprimento geométrico 3D, não por survey de profundidade medida. O primeiro ponto de cada string é a boca do furo; confirme a ordem antes de importar.'],ids=new Set();
    const mode=options.idMode||'description';if(!['description','number'].includes(mode))fail('selecione ID por descrição ou número da string.');
    let pointCount=0;
    for(const [si,segment] of (parsed.strings||[]).entries()){
      if(holes.length>=limits.holes)fail('STR tem mais de '+limits.holes+' segmentos/furos.');
      if(segment.pts.length>limits.tracePerHole||pointCount+segment.pts.length>limits.traceTotal)fail('STR excede o limite seguro de pontos por campanha/furo.');
      const points=options.reverse?segment.pts.slice().reverse():segment.pts.slice(),descs=options.reverse?segment.descs.slice().reverse():segment.descs.slice();
      if(points.length<2)fail('string '+segment.number+': são necessários pelo menos dois pontos para uma trajetória.');
      // A inversão muda a origem/progressiva, nunca a identidade do furo.
      const description=String(segment.descs.find(d=>String(d).trim())||'').split(',').find(d=>d.trim())?.trim();
      if(mode==='description'&&!description)fail('string '+segment.number+': sem descrição para identificar o furo; selecione ID pelo número da string.');
      const id=idText(mode==='number'?segment.number:description,'String '+segment.number);
      if(ids.has(id))fail('identificador '+id+' repetido em segmentos STR distintos. Corrija as descrições/números; segmentos não serão unidos automaticamente.');ids.add(id);
      let md=0;const trace=points.map((point,i)=>{
        if(i){const prev=points[i-1],distance=Math.hypot(point[0]-prev[0],point[1]-prev[1],point[2]-prev[2]);
          if(!(distance>0))fail('string '+segment.number+': pontos consecutivos coincidentes; corrija a trajetória.');md+=distance;}
        return {x:point[0],y:point[1],z:point[2],md};
      });
      pointCount+=trace.length;if(pointCount>limits.traceTotal||trace.length>limits.tracePerHole)fail('STR excede o limite seguro de pontos por campanha/furo.');
      if(!Number.isFinite(md)||md<=0)fail('string '+segment.number+': comprimento da trajetória inválido.');
      const survey=trace.map((p,i)=>{
        const a=trace[Math.min(i,trace.length-2)],b=trace[Math.min(i+1,trace.length-1)],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
        return {md:p.md,az:(Math.atan2(dx,dy)*180/Math.PI+360)%360,dip:Math.atan2(-dz,Math.hypot(dx,dy))*180/Math.PI,derived:true};
      });
      holes.push({id,collar:points[0].slice(),depth:md,survey,trace,geologyLog:[],coreRuns:[],tables:[],
        attributes:{SURPAC_STRING:segment.number,SURPAC_SEGMENT:si+1,DESCRIPTIONS:descs},
        source:{format:'surpac-str',method:'original-xyz-polyline',mdBasis:'geometric-length',reversed:!!options.reverse,
          warnings:['Profundidade por comprimento geométrico XYZ; não é profundidade medida por survey.',
            options.reverse?'Último ponto original adotado como boca, por inversão explícita.':'Primeiro ponto da string adotado como boca.']}});
    }
    if(!holes.length)fail('STR não contém trajetórias.');
    if(options.reverse)warnings.push('Ordem de todos os segmentos STR invertida explicitamente; a última coordenada original foi adotada como boca.');
    return {holes,warnings};
  }
  root.GeoMineBoreholeReader=Object.freeze({parseCSV,buildCSV,buildSTR,limits,desurvey});
})(typeof window!=='undefined'?window:globalThis);

/* GeoMine — Surpac .dtm + .str/.stx (texto e binário).
   Leitor independente, sem estado do projeto ou interface. Adaptado dos leitores
   SURPACIO e surpac_io do Varioscape, com validação estrita de limites/fim de arquivo.
   Nós DTM indexam REGISTROS STR (1-based), incluindo terminadores de strings.
   Coordenadas Surpac Y,X,Z são devolvidas como X,Y,Z; nenhuma reprojeção é inferida.
   O DTM começa por uma seção de strings própria: quase sempre só o registro END, mas o
   Surpac também grava ali pontos que os triângulos NÃO indexam (os nós continuam
   valendo para o .str). compactSTR/compactDTM/compactPair devolvem os mesmos dados em
   vetores tipados, para a importação geral de arquivos com milhões de registros. */
(function(root){
  'use strict';

  const LIMITS=Object.freeze({bytes:256*1024*1024,records:2000000,faces:2000000,groups:10000,line:1024*1024,
    compactRecords:8000000,compactFaces:8000000});
  const NUMBER=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  function fail(kind,message){throw new Error('Surpac '+kind+': '+message);}
  function label(value,fallback){
    return String(value==null?'':value).replace(/[\u0000-\u001f\u007f<>]/g,' ').trim().slice(0,160)||fallback||'';
  }
  function basename(value){return String(value||'').split(/[\\/]/).pop().replace(/\.(?:dtm|str|stx)$/i,'');}
  function bytes(data,kind){
    let result;
    if(data instanceof ArrayBuffer)result=new Uint8Array(data);
    else if(ArrayBuffer.isView(data))result=new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
    else fail(kind,'esperado ArrayBuffer, Uint8Array ou texto.');
    if(result.length>LIMITS.bytes)fail(kind,'arquivo maior que o limite de leitura segura (256 MB). Divida a superfície em partes.');
    if(!result.length)fail(kind,'arquivo vazio.');
    return result;
  }
  function latin1(a,start,end){
    let result='';
    for(let p=start;p<end;p+=8192)result+=String.fromCharCode.apply(null,a.subarray(p,Math.min(end,p+8192)));
    return result;
  }
  function text(data,kind){
    if(typeof data==='string'){
      if(data.length>LIMITS.bytes)fail(kind,'texto maior que o limite de leitura segura.');
      return data.replace(/^\uFEFF/,'');
    }
    try{return new TextDecoder('utf-8',{fatal:true}).decode(data).replace(/^\uFEFF/,'');}
    catch(_){return latin1(data,0,data.length).replace(/^\uFEFF/,'');}
  }
  function lineEnd(a,count,kind){
    let p=0;
    for(let i=0;i<count;i++){
      const start=p;
      while(p<a.length&&a[p]!==10&&p-start<LIMITS.line)p++;
      if(p===a.length||a[p]!==10)fail(kind,'cabeçalho incompleto ou excessivamente longo.');
      p++;
    }
    return p;
  }
  function* lines(source,kind){
    let p=0,n=0;
    while(p<source.length){
      let end=source.indexOf('\n',p);if(end<0)end=source.length;
      if(end-p>LIMITS.line)fail(kind,'linha '+(n+1)+' excessivamente longa.');
      yield {number:++n,value:source.slice(p,end).replace(/\r$/,'').trim()};p=end+1;
    }
  }
  function numeric(value,kind,context,integer,min){
    const s=String(value==null?'':value).trim(),n=Number(s);
    if(!NUMBER.test(s)||!Number.isFinite(n)||(integer&&!Number.isSafeInteger(n))||(min!=null&&n<min)||
      (integer&&n>0xffffffff))fail(kind,context+' inválido.');
    return n;
  }
  function cstring(a,pos,kind){
    let end=pos;
    while(end<a.length&&a[end]!==0&&end-pos<LIMITS.line)end++;
    if(end>=a.length)fail(kind,'arquivo truncado: descrição sem terminador NUL.');
    if(a[end]!==0)fail(kind,'descrição excessivamente longa.');
    return {value:latin1(a,pos,end),end:end+1};
  }
  function trailingBytes(a,pos,kind){
    // Apenas separadores de linha/espaços são tolerados depois do fim explícito.
    for(let i=pos;i<a.length;i++)if(![9,10,13,32].includes(a[i]))fail(kind,'há dados inesperados depois do terminador final.');
  }
  function coordinate(x,y,z,kind,where){
    if(![x,y,z].every(Number.isFinite))fail(kind,where+': coordenada não finita.');
    return [x,y,z];
  }
  function addRecord(result,point,number,description){
    if(result.records.length>=LIMITS.records)fail('STR','mais de '+LIMITS.records+' registros. Divida a superfície em partes.');
    const cap=result._limits;
    if(cap){
      if(result.records.length>=cap.maxRecords||(point&&result.pointCount>=cap.maxPoints))fail('STR','quantidade de registros/pontos excede o limite seguro de sondagens. Divida a campanha.');
      if(point&&result._string?.number===number&&result._string.pts.length>=cap.maxSegmentPoints)fail('STR','string '+number+' excede o limite de '+cap.maxSegmentPoints+' pontos por trajetória.');
      if(point&&(!result._string||result._string.number!==number)&&(result.strings?.length||0)>=cap.maxStrings)fail('STR','quantidade de strings excede o limite seguro de sondagens.');
    }
    result.records.push(point);if(point)result.pointCount++;
    // Segmentos independentes e descrições são necessários para sondagens.
    // Os registros (incluindo terminadores) continuam idênticos para o DTM.
    if(!result.strings)result.strings=[];
    if(!point){result._string=null;return;}
    if(!result._string||result._string.number!==number){
      result._string={number,pts:[],descs:[]};result.strings.push(result._string);
    }
    result._string.pts.push(point);result._string.descs.push(String(description||''));
  }
  function parseSTRText(source,limits,allowRecordEnd=false){
    const result={binary:false,header:'',records:[],pointCount:0,_limits:limits};let ended=false,axis=false,lastRecordEnd=false;
    for(const row of lines(source,'STR')){
      const t=row.value;
      if(row.number===1){result.header=label(t);continue;}
      if(!t)continue;
      if(ended)fail('STR','linha '+row.number+': dados depois de END.');
      if(t.toUpperCase()==='END'){ended=true;continue;}
      const f=t.split(','),n=numeric(f[0],'STR','número de string na linha '+row.number,true,0);
      if(f.length<4)fail('STR','linha '+row.number+': registro incompleto (esperado número,Y,X,Z).');
      const y=numeric(f[1],'STR','Y na linha '+row.number),x=numeric(f[2],'STR','X na linha '+row.number),
        z=numeric(f[3],'STR','Z na linha '+row.number);
      if(!axis){
        axis=true;
        if(n===0){result.axis=[x,y,z];continue;}
      }
      addRecord(result,n===0?null:coordinate(x,y,z,'STR','Linha '+row.number),n,f.slice(4).map(v=>v.trim()).join(','));
      lastRecordEnd=n===0&&f.slice(4).some(v=>v.trim()==='END');
    }
    if(!ended&&!(allowRecordEnd&&lastRecordEnd))fail('STR','arquivo incompleto: terminador END ausente.');
    if(!result.pointCount)fail('STR','não contém coordenadas de pontos.');
    delete result._string;delete result._limits;return result;
  }
  function parseSTRBinary(a,start,limits){
    const result={binary:true,header:label(latin1(a,0,lineEnd(a,1,'STR'))),records:[],pointCount:0,_limits:limits},
      view=new DataView(a.buffer,a.byteOffset,a.byteLength);
    let p=start;
    if(p+5>a.length)fail('STR','arquivo truncado no preâmbulo binário.');
    for(let i=0;i<5;i++)if(a[p+i]!==0)fail('STR','preâmbulo binário inválido.');
    p+=5;let ended=false;
    while(p<a.length){
      if(p+28>a.length)fail('STR','arquivo truncado no registro '+(result.records.length+1)+'.');
      const n=view.getUint32(p,false),y=view.getFloat64(p+4,false),x=view.getFloat64(p+12,false),z=view.getFloat64(p+20,false);
      coordinate(x,y,z,'STR','Registro '+(result.records.length+1));p+=28;
      const d=cstring(a,p,'STR');p=d.end;
      addRecord(result,n===0?null:[x,y,z],n,d.value);
      if(n===0&&d.value==='END'){ended=true;break;}
    }
    if(!ended)fail('STR','arquivo truncado: registro final END ausente.');
    trailingBytes(a,p,'STR');
    if(!result.pointCount)fail('STR','não contém coordenadas de pontos.');
    delete result._string;delete result._limits;return result;
  }
  function parseSTR(data,options){
    let limits=null;
    if(options){
      limits={};for(const key of ['maxRecords','maxPoints','maxSegmentPoints','maxStrings']){
        const value=options[key]??LIMITS.records;
        if(!Number.isSafeInteger(value)||value<=0||value>LIMITS.records)fail('STR','limite de leitura inválido: '+key+'.');limits[key]=value;
      }
    }
    if(typeof data==='string')return parseSTRText(text(data,'STR'),limits,options?.allowRecordEnd===true);
    const a=bytes(data,'STR'),start=lineEnd(a,2,'STR');
    return a[start]===0?parseSTRBinary(a,start,limits):parseSTRText(text(a,'STR'),limits,options?.allowRecordEnd===true);
  }

  function topology(binary,header){return {binary,header:label(header),groups:[],faceCount:0};}
  function topologyBuilder(result,maxFaces=LIMITS.faces){
    let objectId=1,objectText='',current=null;const used=new Set();
    return {
      object(id,description){objectId=id;objectText=label(description);current=null;},
      group(id,description){
        const key=objectId+':'+id;
        if(used.has(key))fail('DTM','objeto '+objectId+', trisolation '+id+' repetido.');
        if(result.groups.length>=LIMITS.groups)fail('DTM','quantidade de objetos/trisolations excede o limite seguro.');
        used.add(key);current={objectId,trisolationId:id,objectText,trisolationText:label(description),triangles:[]};
        result.groups.push(current);
      },
      triangle(number,nodes){
        if(!current)this.group(1,'');
        if(result.faceCount>=maxFaces)fail('DTM','mais de '+maxFaces+' triângulos. Divida a superfície em partes.');
        if(new Set(nodes).size!==3)fail('DTM','triângulo '+number+' tem nós repetidos.');
        current.triangles.push({number,nodes});result.faceCount++;
      }
    };
  }
  function parseDTMText(source,maxFaces){
    const result=topology(false,''),builder=topologyBuilder(result,maxFaces);let ended=false,strings=true;
    for(const row of lines(source,'DTM')){
      const t=row.value;
      if(row.number===1){result.header=label(t);continue;}
      if(!t)continue;
      if(ended)fail('DTM','linha '+row.number+': dados depois de END.');
      if(t.toUpperCase()==='END'){ended=true;continue;}
      const f=t.split(',').map(v=>v.trim()),tag=f[0].toUpperCase();
      if(tag==='OBJECT'||tag==='TRISOLATION'){
        strings=false;
        const id=numeric(f[1],'DTM',tag+' na linha '+row.number,true,1),description=f.slice(2).join(',');
        if(tag==='OBJECT')builder.object(id,description);else builder.group(id,description);continue;
      }
      const id=numeric(f[0],'DTM','número de triângulo na linha '+row.number,true,0);
      if(strings){
        // Seção de strings do DTM, antes de OBJECT: o registro "0, 0.000, 0.000, 0.000, END"
        // encerra a seção (não o arquivo) e os pontos próprios do DTM não são triângulos.
        if(id===0&&f.slice(4).some(v=>v.toUpperCase()==='END')){
          f.slice(1,4).filter(v=>v!=='').forEach(v=>numeric(v,'DTM','terminador na linha '+row.number));
          strings=false;continue;
        }
        const yxz=f.slice(1,4);
        if(id!==0&&yxz.length===3&&yxz.every(v=>NUMBER.test(v))&&yxz.some(v=>!/^[+-]?\d+$/.test(v)))continue;
      }
      if(id===0){
        // Linha inicial de eixos e terminadores de grupos; não indexam vértices.
        f.slice(1).filter(v=>v!=='').forEach(v=>numeric(v,'DTM','terminador na linha '+row.number));continue;
      }
      if(f.length<4)fail('DTM','triângulo incompleto na linha '+row.number+'.');
      const nodes=f.slice(1,4).map(v=>numeric(v,'DTM','nó na linha '+row.number,true,1)-1);
      const extra=f.slice(4).filter(v=>v!=='');
      if(extra.length!==0&&extra.length!==3)fail('DTM','vizinhos incompletos na linha '+row.number+'.');
      extra.forEach(v=>numeric(v,'DTM','vizinho na linha '+row.number,true,0));builder.triangle(id,nodes);
    }
    if(!ended)fail('DTM','arquivo incompleto: terminador END ausente.');
    if(!result.faceCount)fail('DTM','não contém triângulos.');
    return result;
  }
  function dtmStringsEnd(a,view,start){
    // Preâmbulo padrão: cinco zeros e um registro STR vazio com END; não procurar END em todo o arquivo.
    let p=start;
    while(p<a.length&&a[p]===0&&p-start<65536)p++;
    if(p+4<=a.length&&a[p]===69&&a[p+1]===78&&a[p+2]===68&&a[p+3]===0)return p+4;
    // Seção de strings com pontos próprios do DTM: cinco zeros e registros
    // [número][Y][X][Z][descrição NUL] até o registro END. Os triângulos não os indexam.
    p=start+5;
    if(p<=a.length&&[0,1,2,3,4].every(i=>a[start+i]===0))while(p+28<a.length){
      let end=p+28;
      while(end<a.length&&a[end]!==0&&end-p-28<LIMITS.line)end++;
      if(end>=a.length||a[end]!==0)break;
      if(view.getUint32(p,false)===0&&end-p-28===3&&a[p+28]===69&&a[p+29]===78&&a[p+30]===68)return end+1;
      p=end+1;
    }
    fail('DTM','preâmbulo binário incompleto ou não reconhecido (END ausente).');
  }
  function parseDTMBinary(a,start,maxFaces){
    const result=topology(true,latin1(a,0,start)),builder=topologyBuilder(result,maxFaces),view=new DataView(a.buffer,a.byteOffset,a.byteLength);
    let p=dtmStringsEnd(a,view,start),ended=false;
    while(p<a.length){
      if(p+8>a.length)fail('DTM','arquivo truncado no cabeçalho de registro.');
      const type=view.getUint32(p,false),number=view.getUint32(p+4,false);p+=8;
      if(type===0xffffffff){
        if(number!==0xffffffff)fail('DTM','terminador final inválido.');
        ended=true;break;
      }
      if(![1,2,3].includes(type))fail('DTM','registro binário de tipo '+type+' não reconhecido.');
      if(number===0)fail('DTM','número de registro zero fora de terminador.');
      let nodes=null;
      if(type===3){
        if(p+24>a.length)fail('DTM','arquivo truncado no triângulo '+number+'.');
        nodes=[view.getUint32(p,false),view.getUint32(p+4,false),view.getUint32(p+8,false)];
        if(nodes.some(n=>n===0))fail('DTM','triângulo '+number+' referencia nó zero.');
        nodes=nodes.map(n=>n-1);p+=24;
      }
      const d=cstring(a,p,'DTM');p=d.end;
      if(type===1)builder.object(number,d.value);
      else if(type===2)builder.group(number,d.value);
      else builder.triangle(number,nodes);
    }
    if(!ended)fail('DTM','arquivo truncado: terminador final ausente.');
    trailingBytes(a,p,'DTM');
    if(!result.faceCount)fail('DTM','não contém triângulos.');
    return result;
  }
  function parseDTM(data,options={}){
    const maxFaces=options.maxInputFaces??LIMITS.faces;
    if(!Number.isSafeInteger(maxFaces)||maxFaces<1||maxFaces>4000000)fail('DTM','limite de triângulos inválido.');
    if(typeof data==='string')return parseDTMText(text(data,'DTM'),maxFaces);
    const a=bytes(data,'DTM'),start=lineEnd(a,1,'DTM');
    return a[start]===0?parseDTMBinary(a,start,maxFaces):parseDTMText(text(a,'DTM'),maxFaces);
  }
  function parsePair(dtmData,strData,options){
    options=options||{};
    const dtm=parseDTM(dtmData,options),str=parseSTR(strData,options.allowRecordEnd?{allowRecordEnd:true}:undefined),warnings=[],base=label(basename(options.dtmName)||basename(dtm.header.split(',')[0]),'Superfície Surpac');
    const namedSTR=String(dtm.header.split(',')[0]||'').trim(),provided=String(options.strName||'');
    if(/\.(?:str|stx)$/i.test(namedSTR)&&provided&&basename(namedSTR).toLowerCase()!==basename(provided).toLowerCase())
      warnings.push('O cabeçalho DTM indica '+label(namedSTR)+', mas foi selecionado '+label(provided)+'. Confirme se são o mesmo par; a topologia foi validada, mas isso não confirma a origem das coordenadas.');
    const meshes=[];
    for(const group of dtm.groups){
      if(!group.triangles.length){warnings.push('Objeto '+group.objectId+', trisolation '+group.trisolationId+' sem triângulos.');continue;}
      const vertices=[],faces=[],indices=new Map();
      for(const triangle of group.triangles){
        const face=[];
        for(const node of triangle.nodes){
          if(node<0||node>=str.records.length||!str.records[node])
            fail('DTM','objeto '+group.objectId+', trisolation '+group.trisolationId+', triângulo '+triangle.number+' referencia nó '+(node+1)+' ausente ou terminador no STR. Verifique se selecionou o par correto.');
          let index=indices.get(node);
          if(index===undefined){index=vertices.length;indices.set(node,index);vertices.push(str.records[node].slice());}
          face.push(index);
        }
        faces.push(face);
      }
      meshes.push({name:label(base+'_obj'+group.objectId+'_tri'+group.trisolationId),vertices,faces,
        objectId:group.objectId,trisolationId:group.trisolationId,
        objectText:group.objectText,trisolationText:group.trisolationText});
    }
    if(!meshes.length)fail('DTM','nenhuma malha válida no par selecionado.');
    return {meshes,warnings};
  }

  /* ---------------- Leitura compacta (vetores tipados) ----------------
     Mesmos arquivos e mesma regra de numeração de parseSTR/parseDTM, sem criar um objeto por
     registro: number[i]===0 marca terminador de segmento, description(i) decodifica sob demanda. */
  function cap(value,fallback,max,kind,what){
    const v=value??fallback;
    if(!Number.isSafeInteger(v)||v<1||v>max)fail(kind,'limite de '+what+' inválido.');
    return v;
  }
  function compactSTRBinary(a,start,max){
    const view=new DataView(a.buffer,a.byteOffset,a.byteLength),size=a.length;
    let p=start;
    if(p+5>size)fail('STR','arquivo truncado no preâmbulo binário.');
    for(let i=0;i<5;i++)if(a[p+i]!==0)fail('STR','preâmbulo binário inválido.');
    p+=5;
    const first=p;let count=0,ended=false;
    while(p<size){                                   // 1ª passada: conta e valida a estrutura
      if(p+28>size)fail('STR','arquivo truncado no registro '+(count+1)+'.');
      let end=p+28;
      while(end<size&&a[end]!==0)end++;
      if(end>=size)fail('STR','arquivo truncado: descrição sem terminador NUL.');
      if(end-p-28>=LIMITS.line)fail('STR','descrição excessivamente longa.');
      if(++count>max)fail('STR','mais de '+max+' registros. Divida o arquivo em partes.');
      const last=end-p-28===3&&a[p+28]===69&&a[p+29]===78&&a[p+30]===68&&view.getUint32(p,false)===0;
      p=end+1;
      if(last){ended=true;break;}
    }
    if(!ended)fail('STR','arquivo truncado: registro final END ausente.');
    trailingBytes(a,p,'STR');
    const number=new Uint32Array(count),x=new Float64Array(count),y=new Float64Array(count),z=new Float64Array(count),
      at=new Uint32Array(count),len=new Uint32Array(count);
    let pointCount=0;p=first;
    for(let i=0;i<count;i++){
      const n=view.getUint32(p,false),py=view.getFloat64(p+4,false),px=view.getFloat64(p+12,false),pz=view.getFloat64(p+20,false);
      if(!(Number.isFinite(px)&&Number.isFinite(py)&&Number.isFinite(pz)))fail('STR','Registro '+(i+1)+': coordenada não finita.');
      let end=p+28;
      while(a[end]!==0)end++;
      number[i]=n;x[i]=px;y[i]=py;z[i]=pz;at[i]=p+28;len[i]=end-p-28;
      if(n!==0)pointCount++;
      p=end+1;
    }
    if(!pointCount)fail('STR','não contém coordenadas de pontos.');
    let lastAt=-1,lastLen=-1,lastText='';
    const description=i=>{
      const n=len[i],o=at[i];
      if(!n)return '';
      if(n===lastLen){let k=0;while(k<n&&a[o+k]===a[lastAt+k])k++;if(k===n)return lastText;}
      lastAt=o;lastLen=n;lastText=latin1(a,o,o+n);return lastText;
    };
    return {binary:true,header:label(latin1(a,0,lineEnd(a,1,'STR'))),count,pointCount,number,x,y,z,description};
  }
  function compactSTR(data,options){
    options=options||{};
    const max=cap(options.maxRecords,LIMITS.compactRecords,LIMITS.compactRecords,'STR','registros');
    let a=null,start=0;
    if(typeof data!=='string'){a=bytes(data,'STR');start=lineEnd(a,2,'STR');}
    if(a&&a[start]===0)return compactSTRBinary(a,start,max);
    // Texto: reaproveita o leitor por registros e converte; os terminadores continuam contando.
    const r=parseSTRText(text(a||data,'STR'),null,true),count=r.records.length;
    if(count>max)fail('STR','mais de '+max+' registros. Divida o arquivo em partes.');
    const number=new Uint32Array(count),x=new Float64Array(count),y=new Float64Array(count),z=new Float64Array(count),texts=new Array(count);
    let si=0,pi=0;
    for(let i=0;i<count;i++){
      const point=r.records[i];
      if(!point){texts[i]='';continue;}
      const string=r.strings[si];
      number[i]=string.number;x[i]=point[0];y[i]=point[1];z[i]=point[2];texts[i]=string.descs[pi];
      if(++pi>=string.pts.length){si++;pi=0;}
    }
    return {binary:false,header:r.header,count,pointCount:r.pointCount,number,x,y,z,description:i=>texts[i]||''};
  }
  function compactDTMBinary(a,start,maxFaces){
    const view=new DataView(a.buffer,a.byteOffset,a.byteLength),size=a.length,groups=[],used=new Set();
    let p=dtmStringsEnd(a,view,start),nodes=new Uint32Array(3*Math.min(maxFaces,Math.floor((size-p)/33))+3),faces=0,
      objectId=1,objectText='',current=null,ended=false;
    const group=(id,description)=>{
      const key=objectId+':'+id;
      if(used.has(key))fail('DTM','objeto '+objectId+', trisolation '+id+' repetido.');
      if(groups.length>=LIMITS.groups)fail('DTM','quantidade de objetos/trisolations excede o limite seguro.');
      used.add(key);current={objectId,trisolationId:id,objectText,trisolationText:label(description),first:faces,count:0};groups.push(current);
    };
    while(p<size){
      if(p+8>size)fail('DTM','arquivo truncado no cabeçalho de registro.');
      const type=view.getUint32(p,false),number=view.getUint32(p+4,false);p+=8;
      if(type===0xffffffff){
        if(number!==0xffffffff)fail('DTM','terminador final inválido.');
        ended=true;break;
      }
      if(type!==1&&type!==2&&type!==3)fail('DTM','registro binário de tipo '+type+' não reconhecido.');
      if(number===0)fail('DTM','número de registro zero fora de terminador.');
      if(type===3){
        if(p+24>size)fail('DTM','arquivo truncado no triângulo '+number+'.');
        const n1=view.getUint32(p,false),n2=view.getUint32(p+4,false),n3=view.getUint32(p+8,false);
        if(n1===0||n2===0||n3===0)fail('DTM','triângulo '+number+' referencia nó zero.');
        if(n1===n2||n2===n3||n1===n3)fail('DTM','triângulo '+number+' tem nós repetidos.');
        if(faces>=maxFaces)fail('DTM','mais de '+maxFaces+' triângulos. Divida a superfície em partes.');
        if(!current)group(1,'');
        nodes[3*faces]=n1-1;nodes[3*faces+1]=n2-1;nodes[3*faces+2]=n3-1;faces++;current.count++;p+=24;
        // descrição do triângulo: quase sempre vazia
        if(p<size&&a[p]===0){p++;continue;}
      }
      const d=cstring(a,p,'DTM');p=d.end;
      if(type===1){objectId=number;objectText=label(d.value);current=null;}
      else if(type===2)group(number,d.value);
    }
    if(!ended)fail('DTM','arquivo truncado: terminador final ausente.');
    trailingBytes(a,p,'DTM');
    if(!faces)fail('DTM','não contém triângulos.');
    if(nodes.length>3*faces)nodes=nodes.length>3.3*faces+64?nodes.slice(0,3*faces):nodes.subarray(0,3*faces);
    return {binary:true,header:label(latin1(a,0,start)),groups,faceCount:faces,nodes};
  }
  function compactDTM(data,options){
    options=options||{};
    const maxFaces=cap(options.maxInputFaces,LIMITS.compactFaces,LIMITS.compactFaces,'DTM','triângulos');
    let a=null,start=0;
    if(typeof data!=='string'){a=bytes(data,'DTM');start=lineEnd(a,1,'DTM');}
    if(a&&a[start]===0)return compactDTMBinary(a,start,maxFaces);
    const r=parseDTMText(text(a||data,'DTM'),Math.min(maxFaces,4000000)),nodes=new Uint32Array(3*r.faceCount),groups=[];
    let faces=0;
    for(const g of r.groups){
      groups.push({objectId:g.objectId,trisolationId:g.trisolationId,objectText:g.objectText,trisolationText:g.trisolationText,first:faces,count:g.triangles.length});
      for(const t of g.triangles){nodes[3*faces]=t.nodes[0];nodes[3*faces+1]=t.nodes[1];nodes[3*faces+2]=t.nodes[2];faces++;}
    }
    return {binary:false,header:r.header,groups,faceCount:faces,nodes};
  }
  function compactPair(dtmData,strData,options){
    options=options||{};
    const dtm=compactDTM(dtmData,options),str=compactSTR(strData,options),warnings=[],number=str.number,count=str.count,nodes=dtm.nodes;
    for(const g of dtm.groups){
      for(let k=3*g.first,end=3*(g.first+g.count);k<end;k++){
        const node=nodes[k];
        if(node>=count||number[node]===0)
          fail('DTM','objeto '+g.objectId+', trisolation '+g.trisolationId+', triângulo '+(((k/3)|0)-g.first+1)+' do grupo referencia nó '+(node+1)+' ausente ou terminador no STR. Verifique se selecionou o par correto.');
      }
      if(!g.count)warnings.push('Objeto '+g.objectId+', trisolation '+g.trisolationId+' sem triângulos.');
    }
    const namedSTR=String(dtm.header.split(',')[0]||'').trim(),provided=String(options.strName||'');
    if(/\.(?:str|stx)$/i.test(namedSTR)&&provided&&basename(namedSTR).toLowerCase()!==basename(provided).toLowerCase())
      warnings.push('O cabeçalho DTM indica '+label(namedSTR)+', mas foi selecionado '+label(provided)+'. Confirme se são o mesmo par.');
    return {str,dtm,warnings};
  }
  root.GeoMineSurpacReader=Object.freeze({parsePair,parseSTR,parseDTM,compactSTR,compactDTM,compactPair,limits:LIMITS});
})(typeof window!=='undefined'?window:globalThis);

/* GeoMine — Surpac .dtm + .str/.stx (texto e binário).
   Leitor independente, sem estado do projeto ou interface. Adaptado dos leitores
   SURPACIO e surpac_io do Varioscape, com validação estrita de limites/fim de arquivo.
   Nós DTM indexam REGISTROS STR (1-based), incluindo terminadores de strings.
   Coordenadas Surpac Y,X,Z são devolvidas como X,Y,Z; nenhuma reprojeção é inferida. */
(function(root){
  'use strict';

  const LIMITS=Object.freeze({bytes:256*1024*1024,records:2000000,faces:2000000,groups:10000,line:1024*1024});
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
    const result=topology(false,''),builder=topologyBuilder(result,maxFaces);let ended=false;
    for(const row of lines(source,'DTM')){
      const t=row.value;
      if(row.number===1){result.header=label(t);continue;}
      if(!t)continue;
      if(ended)fail('DTM','linha '+row.number+': dados depois de END.');
      if(t.toUpperCase()==='END'){ended=true;continue;}
      const f=t.split(',').map(v=>v.trim()),tag=f[0].toUpperCase();
      if(tag==='OBJECT'||tag==='TRISOLATION'){
        const id=numeric(f[1],'DTM',tag+' na linha '+row.number,true,1),description=f.slice(2).join(',');
        if(tag==='OBJECT')builder.object(id,description);else builder.group(id,description);continue;
      }
      const id=numeric(f[0],'DTM','número de triângulo na linha '+row.number,true,0);
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
  function parseDTMBinary(a,start,maxFaces){
    const result=topology(true,latin1(a,0,start)),builder=topologyBuilder(result,maxFaces),view=new DataView(a.buffer,a.byteOffset,a.byteLength);
    let p=start;
    // Preâmbulo padrão é um registro STR vazio; não procurar END em todo o arquivo.
    while(p<a.length&&a[p]===0&&p-start<65536)p++;
    if(p+4>a.length||a[p]!==69||a[p+1]!==78||a[p+2]!==68||a[p+3]!==0)
      fail('DTM','preâmbulo binário incompleto ou não reconhecido (END ausente).');
    p+=4;let ended=false;
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
  root.GeoMineSurpacReader=Object.freeze({parsePair,parseSTR,parseDTM,limits:LIMITS});
})(typeof window!=='undefined'?window:globalThis);

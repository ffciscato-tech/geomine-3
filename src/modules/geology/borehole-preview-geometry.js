/* GeoMine — geometria pura da prévia de sondagens.
   Os contatos são interpolados em profundidade medida (MD), nunca pelo
   comprimento XYZ. Nenhuma trajetória, estação ou litologia é inventada. */
(function(root){
  'use strict';
  const limits=Object.freeze({holes:10000,tracePoints:1000000,intervals:250000,intervalSegments:500000});
  const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
  function fail(message){throw new Error('Prévia de sondagens: '+message);}
  function finite(value,where){
    if(typeof value!=='number'||!Number.isFinite(value))fail(where+': informe um número finito.');
    return value;
  }
  function configuredLimits(options){
    if(options==null)return limits;
    if(typeof options!=='object'||Array.isArray(options))fail('opções inválidas.');
    const requested=options.limits;
    if(requested==null)return limits;
    if(typeof requested!=='object'||Array.isArray(requested))fail('limites inválidos.');
    const result={...limits};
    for(const key of Object.keys(requested)){
      if(!own(limits,key)||!Number.isSafeInteger(requested[key])||requested[key]<0||requested[key]>limits[key])
        fail('limite inválido para '+key+'; os limites de segurança só podem ser reduzidos.');
      result[key]=requested[key];
    }
    return result;
  }
  function capacity(total,key,cap){
    if(total>cap[key])fail('limite seguro de '+cap[key]+' '+({holes:'furos',tracePoints:'pontos de trajetória',
      intervals:'intervalos',intervalSegments:'segmentos litológicos'}[key])+' excedido; divida a campanha.');
  }
  // Tolera apenas arredondamento de ponto flutuante na última estação
  // produzida pelo desurvey; não corrige profundidades inconsistentes.
  function sameDepth(a,b){return Math.abs(a-b)<=8*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b));}
  function xyz(point){return [point.x,point.y,point.z];}
  function lowerBound(trace,md){
    let lo=0,hi=trace.length;
    while(lo<hi){const mid=lo+Math.floor((hi-lo)/2);if(trace[mid].md<md)lo=mid+1;else hi=mid;}
    return lo;
  }
  function position(trace,md,depth,where){
    const end=trace[trace.length-1];
    if(md===depth&&sameDepth(end.md,depth))return xyz(end);
    const index=lowerBound(trace,md);
    if(index<trace.length&&trace[index].md===md)return xyz(trace[index]);
    if(index===0||index===trace.length)fail(where+': contato fora da profundidade medida da trajetória.');
    const a=trace[index-1],b=trace[index],t=(md-a.md)/(b.md-a.md);
    // A soma ponderada evita overflow de (b - a) em coordenadas opostas.
    const result=[a.x*(1-t)+b.x*t,a.y*(1-t)+b.y*t,a.z*(1-t)+b.z*t];
    if(!result.every(Number.isFinite))fail(where+': coordenada não finita ao interpolar o contato.');
    return result;
  }
  function build(parsed,options){
    const cap=configuredLimits(options);
    if(!parsed||!Array.isArray(parsed.holes))fail('informe uma lista de furos já interpretados.');
    capacity(parsed.holes.length,'holes',cap);
    // Conte antes de copiar ou ordenar: entrada excessiva nunca é truncada.
    let inputPoints=0,inputIntervals=0;
    for(let index=0;index<parsed.holes.length;index++){
      const hole=parsed.holes[index],where='furo '+(index+1);
      if(!hole||typeof hole!=='object'||Array.isArray(hole))fail(where+': registro inválido.');
      if(!Array.isArray(hole.trace)||!hole.trace.length)fail(where+': trajetória ausente.');
      if(hole.geologyLog!=null&&!Array.isArray(hole.geologyLog))fail(where+': lista de intervalos inválida.');
      inputPoints+=hole.trace.length;inputIntervals+=(hole.geologyLog||[]).length;
      capacity(inputPoints,'tracePoints',cap);capacity(inputIntervals,'intervals',cap);
    }
    const holes=[],ids=new Set(),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    const counts={holes:parsed.holes.length,tracePoints:inputPoints,traceSegments:0,intervals:0,intervalSegments:0};
    function include(point){for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],point[axis]);max[axis]=Math.max(max[axis],point[axis]);}}
    for(let index=0;index<parsed.holes.length;index++){
      const input=parsed.holes[index];
      if(typeof input.id!=='string'||!input.id.trim())fail('furo '+(index+1)+': identificador ausente.');
      const id=input.id.trim(),where='furo '+id;
      if(ids.has(id))fail(where+': identificador duplicado.');ids.add(id);
      if(!Array.isArray(input.collar)||input.collar.length!==3)fail(where+': collar deve conter XYZ.');
      const collar=input.collar.map((value,axis)=>finite(value,where+' collar '+['X','Y','Z'][axis]));
      const collarOnly=input.source&&input.source.method==='collar-only';
      const depth=input.depth;
      if(depth===null){
        if(!collarOnly||input.trace.length!==1||(input.geologyLog||[]).length)
          fail(where+': profundidade desconhecida só admite collar-only, uma estação MD 0 e nenhum intervalo.');
      }else{
        finite(depth,where+' profundidade');
        if(depth<=0||collarOnly||input.trace.length<2)fail(where+': profundidade positiva requer trajetória completa com pelo menos duas estações.');
      }
      const trace=[];
      for(let pointIndex=0;pointIndex<input.trace.length;pointIndex++){
        const point=input.trace[pointIndex],at=where+', estação '+(pointIndex+1);
        if(!point||typeof point!=='object'||Array.isArray(point))fail(at+': estação inválida.');
        const copied={x:finite(point.x,at+' X'),y:finite(point.y,at+' Y'),z:finite(point.z,at+' Z'),md:finite(point.md,at+' MD')};
        if(pointIndex===0){
          if(copied.md!==0)fail(at+': a trajetória deve começar em MD 0.');
          if(copied.x!==collar[0]||copied.y!==collar[1]||copied.z!==collar[2])fail(at+': XYZ inicial não coincide com o collar.');
        }else{
          const previous=trace[pointIndex-1];
          if(copied.md<=previous.md)fail(at+': MD duplicada ou fora de ordem; use profundidades estritamente crescentes.');
          if(copied.x===previous.x&&copied.y===previous.y&&copied.z===previous.z)
            fail(at+': XYZ repetido em estações consecutivas; segmento espacial de comprimento zero. Revise as coordenadas ou acrescente estações intermediárias.');
        }
        if(depth!==null&&pointIndex>0&&pointIndex<input.trace.length-1&&copied.md>=depth)
          fail(at+': estação interna alcança ou ultrapassa a profundidade final do furo.');
        trace.push(copied);include(xyz(copied));
      }
      if(depth!==null&&!sameDepth(trace[trace.length-1].md,depth))
        fail(where+': MD final da trajetória não coincide com a profundidade do furo.');
      counts.traceSegments+=Math.max(0,trace.length-1);
      const rows=input.geologyLog||[],validated=[];
      for(let sourceIndex=0;sourceIndex<rows.length;sourceIndex++){
        const row=rows[sourceIndex],at=where+', intervalo '+(sourceIndex+1);
        if(!row||typeof row!=='object'||Array.isArray(row))fail(at+': registro inválido.');
        const from=finite(row.DE_M,at+' De'),to=finite(row.ATE_M,at+' Até');
        if(from<0||to<=from)fail(at+': intervalo inválido; use 0 ≤ De < Até.');
        if(depth===null||to>depth)fail(at+': intervalo ultrapassa a profundidade do furo.');
        if(row.LITOLOGIA!=null&&typeof row.LITOLOGIA!=='string')fail(at+': litologia deve ser texto.');
        validated.push({from,to,lithology:row.LITOLOGIA==null?'':row.LITOLOGIA.trim(),sourceIndex});
      }
      validated.sort((a,b)=>a.from-b.from||a.to-b.to);
      for(let rowIndex=1;rowIndex<validated.length;rowIndex++){
        const a=validated[rowIndex-1],b=validated[rowIndex];
        if(b.from<a.to)fail(where+': intervalos '+(a.sourceIndex+1)+' e '+(b.sourceIndex+1)+' sobrepostos ou duplicados.');
      }
      const intervals=[];
      for(const interval of validated){
        if(!interval.lithology)continue;
        const at=where+', intervalo '+(interval.sourceIndex+1),segments=[];
        let md=interval.from,a=position(trace,md,depth,at),station=lowerBound(trace,md);
        if(station<trace.length&&trace[station].md===md)station++;
        function append(to,b){
          if(a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2])
            fail(at+': segmento espacial de comprimento zero após interpolar MD '+md+'–'+to+'; revise a precisão das coordenadas e dos contatos.');
          capacity(counts.intervalSegments+1,'intervalSegments',cap);
          segments.push({a:a.slice(),b:b.slice(),from:md,to});counts.intervalSegments++;
          md=to;a=b;
        }
        while(station<trace.length-1&&trace[station].md<interval.to){
          const point=trace[station++];append(point.md,xyz(point));
        }
        append(interval.to,position(trace,interval.to,depth,at));
        intervals.push({...interval,segments});counts.intervals++;
      }
      holes.push({id,index,collar,depth,trace,intervals});
    }
    // Uma lista vazia tem bounds neutros; não há ponto ou furo artificial.
    return {holes,bounds:{min:holes.length?min:[0,0,0],max:holes.length?max:[0,0,0]},counts,warnings:[]};
  }
  root.GeoMineBoreholePreviewGeometry=Object.freeze({build,limits});
})(typeof window!=='undefined'?window:globalThis);

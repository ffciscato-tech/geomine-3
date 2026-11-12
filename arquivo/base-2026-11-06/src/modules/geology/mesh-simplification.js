/* GeoMine — representação leve de malhas Surpac, local/offline.
   meshoptimizer 1.0 (MIT), sem deslocar coordenadas originais e sem remover
   trisolations. A saída é explicitamente de visualização, nunca de cubagem. */
(function(root){
  'use strict';
  const MAX_INPUT_FACES=4000000,MAX_OUTPUT_FACES=1000000,MAX_OBJECT_FACES=500000;
  const usage='Somente visualização. Use os arquivos integrais para cubagem, recursos/reservas e projeto executivo.';
  function settings(options={}){
    const mode=options.mode||'integral',detail=mode==='integral'?10:Number(options.detail??10);
    if(!['integral','simplified'].includes(mode))throw new Error('Escolha Integral ou Simplificado para visualização.');
    if(!Number.isFinite(detail)||detail<1||detail>100)throw new Error('O detalhe deve estar entre 1% e 100%.');
    return {mode,detail};
  }
  async function prepare(parsed,options={},progress=()=>{}){
    const cfg=settings(options);
    if(!parsed?.meshes?.length)throw new Error('Nenhuma malha encontrada.');
    if(cfg.mode==='integral')return parsed;
    const optimizer=root.MeshoptSimplifier;
    if(!optimizer?.supported)throw new Error('Simplificação indisponível neste navegador. Use um navegador com WebAssembly.');
    const count=parsed.meshes.reduce((n,m)=>n+m.faces.length,0);
    if(count>MAX_INPUT_FACES)throw new Error('O par excede 4 milhões de triângulos de entrada. Separe os objetos no programa de origem.');
    await optimizer.ready;
    const meshes=[];let outputCount=0;
    for(const [mi,m] of parsed.meshes.entries()){
      if(!m.vertices.length||!m.faces.length)throw new Error('Objeto sem geometria: '+m.name);
      const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
      for(const p of m.vertices){
        if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))throw new Error('Coordenada inválida em '+m.name);
        for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k]);}
      }
      const center=lo.map((v,k)=>v+(hi[k]-v)/2),positions=new Float32Array(m.vertices.length*3),indices=new Uint32Array(m.faces.length*3);
      m.vertices.forEach((p,i)=>{for(let k=0;k<3;k++)positions[i*3+k]=p[k]-center[k];});
      m.faces.forEach((f,i)=>{
        if(!Array.isArray(f)||f.length!==3||f.some(n=>!Number.isInteger(n)||n<0||n>=m.vertices.length))throw new Error('Triângulo inválido em '+m.name);
        indices.set(f,i*3);
      });
      progress('Simplificando objeto '+(mi+1)+' de '+parsed.meshes.length+'…');
      // LockBorder keeps open borders. No Prune/Sloppy: small disconnected
      // bodies must not disappear merely to meet the requested percentage.
      const target=Math.min(indices.length,Math.max(12,Math.round(m.faces.length*cfg.detail/100)*3));
      const [reduced,error]=target<indices.length?optimizer.simplify(indices,positions,3,target,0.01,['LockBorder']):[indices,0];
      if(!reduced.length||reduced.length%3)throw new Error('A simplificação não preservou o objeto '+m.name);
      const vertices=[],faces=[],remap=new Map();
      for(let i=0;i<reduced.length;i+=3){
        const face=[];
        for(let j=0;j<3;j++){
          const old=reduced[i+j];if(old>=m.vertices.length)throw new Error('Índice inválido após simplificação.');
          let id=remap.get(old);if(id===undefined){id=vertices.length;remap.set(old,id);vertices.push(m.vertices[old].slice());}face.push(id);
        }
        faces.push(face);
      }
      outputCount+=faces.length;
      if(faces.length>MAX_OBJECT_FACES||outputCount>MAX_OUTPUT_FACES)throw new Error('O detalhe solicitado ainda excede o limite de importação. Diminua a porcentagem ou separe os objetos; nenhuma camada foi adicionada.');
      const simplification={purpose:usage,method:'meshoptimizer 1.0 / simplify / LockBorder',requestedDetailPercent:cfg.detail,
        originalFaces:m.faces.length,displayFaces:faces.length,originalVertices:m.vertices.length,displayVertices:vertices.length,
        relativeQuadricError:error,positionScaleMetres:optimizer.getScale(positions,3),coordinates:'Vértices XYZ selecionados do original em dupla precisão; sem reprojeção ou alteração de cotas.'};
      meshes.push({...m,vertices,faces,source:{...m.source,representation:'simplified',simplification},simplifiedForVisualization:true});
    }
    return {...parsed,meshes,warnings:[...(parsed.warnings||[]),usage],representation:{mode:'simplified',originalFaces:count,displayFaces:outputCount,objects:meshes.length,requestedDetailPercent:cfg.detail}};
  }
  root.GeoMineMeshSimplification=Object.freeze({prepare,settings,usage,limits:{maxInputFaces:MAX_INPUT_FACES}});
})(typeof window!=='undefined'?window:globalThis);

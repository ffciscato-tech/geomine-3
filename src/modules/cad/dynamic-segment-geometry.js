(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GeoMineSegmentGeometry=api;})(typeof window==='undefined'?globalThis:window,function(){
'use strict';
function number(value){if(value==null||String(value).trim()==='')return null;const n=Number(String(value).trim().replace(',','.'));if(!Number.isFinite(n))throw Error('Digite um número válido.');return n;}
function segment(anchor,cursor,{length=null,angle=null,scale=1}={}){
 if(![...anchor,...cursor,scale].every(Number.isFinite)||scale<=0)throw Error('Coordenadas ou unidade inválidas.');
 const distance=Math.hypot(cursor[0]-anchor[0],cursor[1]-anchor[1])*scale;
 const heading=Math.atan2(cursor[1]-anchor[1],cursor[0]-anchor[0])*180/Math.PI;
 const m=length==null?distance:number(length),a=angle==null?heading:number(angle);
 if(m==null||!Number.isFinite(m)||m<0||(length!=null&&m===0))throw Error('O comprimento deve ser maior que zero.');
 if(a==null)throw Error('Digite um ângulo válido.');
 const radians=a*Math.PI/180,point=[anchor[0]+m/scale*Math.cos(radians),anchor[1]+m/scale*Math.sin(radians)];
 return {point,length:m,angle:((a%360)+360)%360,constrained:length!=null||angle!=null};
}
return {number,segment};
});

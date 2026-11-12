/* A3 title block: separate contractor logo cell; the project/title columns
   never share image space. Project-scoped logo is embedded for offline export. */
(function(){
'use strict';
let revision=0;
const safeURL=value=>typeof value==='string'&&/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/.test(value)?value:null;
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const companyRole=value=>value==='executora'?'executora':'contratada';
function geometry(paper){const a3=String(paper).startsWith('a3');return {a3,width:a3?112:89,logoFraction:a3?.48:.4125};}
function logos({x,y,width,height,company,client,fs=1}){
 const half=width/2,pad=1.1,labelH=2.6*fs,clientURL=safeURL(client);
 const image=(url,left,top,w,h,role)=>`<image data-titleblock-logo="${role}" href="${esc(url)}" x="${left}" y="${top}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
 return `<g data-titleblock-logos="a3">`+
 `<text data-titleblock-role="company" x="${x+pad}" y="${y+2*fs}" font-size="${1.45*fs}" fill="#333">${companyRole(S.seloCompanyRole).toUpperCase()}</text>`+
 image(company,x+pad,y+labelH,half-2*pad,Math.max(1,height-labelH-pad),'company')+
 `<line x1="${x+half}" y1="${y}" x2="${x+half}" y2="${y+height}" stroke="#111" stroke-width="0.3"/>`+
 `<text data-titleblock-role="client" x="${x+half+pad}" y="${y+2*fs}" font-size="${1.45*fs}" fill="#333">CONTRATANTE</text>`+
 (clientURL?image(clientURL,x+half+pad,y+labelH,half-2*pad,Math.max(1,height-labelH-pad),'client'):'')+`</g>`;
}
function sync(){
 const url=safeURL(S.cliLogo),name=S.cliLogoName||'Logomarca carregada';
 const role=document.getElementById('seloCompanyRole');if(role)role.value=companyRole(S.seloCompanyRole);
 for(const id of ['cliLogoInfo','seloCliLogoInfo']){const e=document.getElementById(id);if(e)e.textContent=url?name+' ✔':'Nenhuma logomarca da contratante.';}
 const img=document.getElementById('seloCliLogoPreview');if(img){img.hidden=!url;if(url)img.src=url;else img.removeAttribute('src');}
}
function changed(reason='logomarca da contratante'){
 sync();window.GeoMineSessionAutosave?.markDirty?.(reason);
 if(typeof layoutInvalidateOrtho==='function')layoutInvalidateOrtho(reason,false);
 if(S._view==='layout'&&typeof buildLayout==='function')void buildLayout();
}
async function load(file){
 if(!file)return false;
 const current=++revision,project=S.projectId;
 const generation=window.GeoMineSessionAutosave?.state?.generation;
 const valid=()=>current===revision&&project===S.projectId&&generation===window.GeoMineSessionAutosave?.state?.generation;
 let url;
 try{
  if(file.size>10*1024*1024)throw Error('A logomarca deve ter no máximo 10 MB.');
  url=URL.createObjectURL(file);
  const image=await new Promise((resolve,reject)=>{
   const im=new Image(),timer=setTimeout(()=>{im.onload=im.onerror=null;reject(Error('A imagem não respondeu. Selecione-a novamente.'));},15000);
   im.onload=()=>{clearTimeout(timer);resolve(im);};im.onerror=()=>{clearTimeout(timer);reject(Error('Não foi possível ler a imagem. Use PNG, JPG, WebP ou SVG.'));};im.src=url;
  });
  if(!valid())return false;
  if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40e6)throw Error('Dimensões da logomarca inválidas ou muito grandes.');
  const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const result=canvas.toDataURL('image/png');if(!safeURL(result))throw Error('Não foi possível preparar a logomarca.');
  if(!valid())return false;
  S.cliLogo=result;S.cliLogoName=file.name||'Logomarca da contratante';changed();
  toast('Logomarca da contratante carregada no selo. Salve o projeto para mantê-la.');return true;
 }catch(e){if(valid())toast(e.message||'Não foi possível carregar a logomarca.');return false;}
 finally{if(url)URL.revokeObjectURL(url);}
}
function remove(){revision++;S.cliLogo=null;S.cliLogoName=null;changed();}
function restore(data){revision++;S.cliLogo=safeURL(data?.cliLogo);S.cliLogoName=S.cliLogo?String(data.cliLogoName||'Logomarca da contratante'):null;S.seloCompanyRole=companyRole(data?.seloCompanyRole);sync();}
function bind(){
 const role=document.getElementById('seloCompanyRole');if(role)role.onchange=()=>{S.seloCompanyRole=companyRole(role.value);changed('identificação da contratada no selo');};
 for(const id of ['cliLogoFile','seloCliLogoFile']){const e=document.getElementById(id);if(e)e.onchange=()=>{const f=e.files[0];e.value='';void load(f);};}
 for(const id of ['cliLogoDrop','seloCliLogoDrop']){const e=document.getElementById(id);if(e)e.onclick=remove;}
 sync();
}
window.GeoMineTitleblockLogo={geometry,logos,safeURL,companyRole,load,remove,restore,sync,bind};
})();

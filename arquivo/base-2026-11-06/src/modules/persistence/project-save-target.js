/* Project saving has its own capability policy. fsApiOK() also protects
   import/directory pickers on mobile and must not disable a supported SAVE
   picker. Do not infer write access from a File opened through an input. */
(function(){
'use strict';
// fsHandlesOK: navegador que oferece o seletor mas recusa gravar no arquivo escolhido.
function available(){return typeof window.showSaveFilePicker==='function'&&(typeof fsHandlesOK!=='function'||fsHandlesOK());}
function mobile(){
 const ua=navigator.userAgent||'';
 return navigator.userAgentData?.mobile===true||/Android|iPhone|iPad|Mobile/i.test(ua)||
  (/Macintosh/i.test(ua)&&(navigator.maxTouchPoints||0)>1);
}
function pick(options){
 if(!available())throw new Error('Este navegador não oferece escolha de destino para gravação.');
 // Call synchronously from the Save gesture, before raster work. Android's
 // document providers do not all accept desktop startIn handles or custom
 // MIME filters. Keep the suggested .ccmgis name and allow all destinations
 // exposed by the system (including Drive when the provider supports it).
 if(mobile())return window.showSaveFilePicker({
  suggestedName:options.suggestedName,excludeAcceptAllOption:false
 });
 if(window.GeoMineProjectTabSession){
  options={...options};delete options.startIn;
  // The legacy helper fills an absent startIn from the GLOBAL last export.
  // A fresh project instead starts in the browser's generic Documents place.
  options.startIn=GeoMineProjectTabSession.startIn()||'documents';
 }
 return pickSaveFile(options);
}
window.GeoMineProjectSaveTarget={available,pick};
})();

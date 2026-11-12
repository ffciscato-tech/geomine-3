/* THREE r128 já é carregado no início do HTML. Este slot existia no arquivo
   legado como uma segunda cópia completa da mesma versão, que sobrescrevia
   THREE depois de OrbitControls e descartava o controle recém-instalado. */
(function(){
  if(!globalThis.THREE||String(globalThis.THREE.REVISION)!=='128')
    console.warn('CCMGIS: THREE r128 não está disponível no carregamento offline.');
})();

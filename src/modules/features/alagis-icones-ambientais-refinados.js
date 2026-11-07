
(function iconesAmbientaisRefinados(){
  if(typeof RIB_SVG==='undefined')return;
  /* Mesma gramática visual dos pictogramas CCMGIS: 32 px, contorno terroso,
     tons naturais, luz superior e sombra curta. */
  const pro=(id,body)=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">'+
    '<defs><linearGradient id="'+id+'g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EDF7D9"/><stop offset=".52" stop-color="#A8C979"/><stop offset="1" stop-color="#648F4F"/></linearGradient>'+
    '<linearGradient id="'+id+'s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF2D6"/><stop offset=".55" stop-color="#E2BD7D"/><stop offset="1" stop-color="#B98047"/></linearGradient>'+
    '<linearGradient id="'+id+'b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E5F5FF"/><stop offset=".52" stop-color="#7FC4E8"/><stop offset="1" stop-color="#3C79A5"/></linearGradient>'+
    '<linearGradient id="'+id+'o" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE5A6"/><stop offset=".55" stop-color="#E9AE4E"/><stop offset="1" stop-color="#B9742E"/></linearGradient>'+
    '<filter id="'+id+'d" x="-30%" y="-30%" width="160%" height="165%"><feDropShadow dx="0" dy=".8" stdDeviation=".65" flood-color="#654B38" flood-opacity=".24"/></filter></defs>'+
    '<g stroke="#795D49" stroke-width="1.08" stroke-linecap="round" stroke-linejoin="round" filter="url(#'+id+'d)">'+
    body.replace(/@g/g,'url(#'+id+'g)').replace(/@s/g,'url(#'+id+'s)').replace(/@b/g,'url(#'+id+'b)').replace(/@o/g,'url(#'+id+'o)')+'</g></svg>';
  Object.assign(RIB_SVG,{
    org_ibama:pro('pib','<path d="M3.8 16c3.6-6.2 7.7-9.1 12.2-9.1S24.6 9.8 28.2 16c-3.6 6.2-7.7 9.1-12.2 9.1S7.4 22.2 3.8 16z" fill="@g"/><circle cx="16" cy="16" r="4.7" fill="@b"/><circle cx="16" cy="16" r="2" fill="#F7EBC9"/><path d="M16 11.4c1.4-4.1 5.3-6 9-4.5-.4 4.3-3.5 7-8.4 7.3" fill="@s"/><path d="M7 17.4c4.2 1.6 7.6 1.6 10.8-.2" stroke="#F7F0DB"/>'),
    org_icmbio:pro('pic','<path d="M16 3.7c6.2 3.1 10.6 7.8 10.6 14.2L16 27.7 5.4 17.9C5.4 11.5 9.8 6.8 16 3.7z" fill="@g"/><path d="M16 7v16m0-9-5.8-4.6M16 18l5.7-5.1M10.1 24h11.8"/><path d="M8.8 18.8c2.3-.4 4.3.2 5.9 1.7M23.2 18.8c-2.3-.4-4.3.2-5.9 1.7" stroke="#F8F0D9"/>'),
    org_iphan:pro('pip','<path d="m4.2 11 11.8-6.4L27.8 11z" fill="@s"/><path d="M5.4 12.2h21.2M7.2 25.2h17.6M4.5 27.5h23"/><path d="M8.8 12.2v13m4.8-13v13m4.8-13v13m4.8-13v13"/><circle cx="16" cy="8.2" r="1.35" fill="@g"/>'),
    org_mma:pro('pmm','<circle cx="16" cy="16" r="11.7" fill="@g"/><path d="M7.3 19.1c5.6-.9 9.1-4.6 11.5-10.1 4.3 4.3 5.1 9.6 1.2 13.5-3.5 3.4-8.6 2-12.7-3.4z" fill="#F7F5DE"/><path d="M8.2 24.3c4.7-5.2 9.1-7.8 14.2-10.1" stroke="#5D874B" stroke-width="1.55"/><path d="M12 20.3c1.2.1 2.4.5 3.3 1.4" stroke="#C89A5D"/>'),
    org_funai:pro('pfu','<path d="M5.4 25.5 8.6 9.4 16 4l7.4 5.4 3.2 16.1L16 28.3z" fill="@s"/><path d="m8.6 9.4 7.4 7.4 7.4-7.4M16 16.8v11.5M6.2 24.5h19.6"/><circle cx="16" cy="8.1" r="2.15" fill="@g"/><path d="m11.4 22.8 4.6-3.6 4.6 3.6" stroke="#F7ECD6"/>'),
    org_incra:pro('pin','<path d="M4.7 5.2h22.6v22.1H4.7z" fill="@s"/><path d="M4.7 13.5h22.6M12.5 5.2v22.1m7.2-13.8v13.8M12.5 20.7h14.8"/><path d="m6.8 11.3 3-3 3 3" fill="@g"/><path d="M16 8.5h8M16 17h8M7.7 17h2" stroke="#F8EED8"/>'),
    org_car:pro('pca','<path d="M4.4 6.2h23.2v21.2H4.4z" fill="@s"/><path d="m4.4 21.1 7.8-6.5 5.6 3.8 9.8-8.2M12.8 27.4V14.1"/><path d="M16.7 12.7c.1-5.3 4.3-8.7 10-7.7-.1 5.1-3.8 8.1-10 7.7z" fill="@g"/><path d="M19 10.7c2-1.4 4-2.3 6.3-2.7" stroke="#F7F3DD"/>'),
    org_anm:pro('pan','<path d="M6.2 26.7 19.8 7.4M25.8 26.7 12.2 7.4" stroke="#73523A" stroke-width="2.55"/><path d="m17.2 8 5.2-4.7 5.2 5.4-6.3 2.4zM14.8 8 9.6 3.3 4.4 8.7l6.3 2.4z" fill="@o"/><path d="M4.5 28h23"/><path d="m12.4 17.6 3.6-5.1 3.6 5.1" stroke="#F6E1B5"/>'),
    org_ana:pro('pna','<path d="M16 3.4C11.7 9.8 7.5 14.4 7.5 20.2a8.5 8.5 0 0 0 17 0C24.5 14.4 20.3 9.8 16 3.4z" fill="@b"/><path d="M4.2 26.2c3.9-2.3 7.8 2.4 11.8 0s7.9 2.3 11.8 0"/><path d="M11 20.5c.2 2.4 1.7 3.8 4 4.2" stroke="#EFF8F3" stroke-width="1.25"/>'),
    org_ibge:pro('pbg','<circle cx="16" cy="16" r="11.6" fill="@b"/><path d="M4.4 16h23.2M16 4.4c4.1 4 6.2 7.7 6.2 11.6S20.1 23.6 16 27.6M16 4.4c-4.1 4-6.2 7.7-6.2 11.6S11.9 23.6 16 27.6M7.2 10.1h17.6M7.2 21.9h17.6"/><path d="M7.2 16h17.6" stroke="#EEF7E1"/>'),
    org_inde:pro('pde','<circle cx="16" cy="16" r="4.2" fill="@b"/><circle cx="5.8" cy="7.5" r="2.3" fill="@g"/><circle cx="26.3" cy="7" r="2.3" fill="@o"/><circle cx="26.8" cy="24.7" r="2.3" fill="@g"/><circle cx="5.5" cy="25" r="2.3" fill="@o"/><path d="m7.6 9 5.3 4.5m6.1-.8 5.4-4.1m-5.1 10 5.5 4.5m-12-4-5.5 4.6"/><circle cx="16" cy="16" r="1.2" fill="#F7F1D8" stroke="none"/>'),
    org_sgb:pro('psg','<path d="m3.8 23.8 8.1-16.4 6.2 8.3 4.1-6.4 6 14.5z" fill="@s"/><path d="M4.7 23.8h22.6M8.2 19h16.4M10.5 14.8h11.9M14.1 10.6h3.4"/><path d="m18.6 26.2 3.1 3 6.1-7.2" stroke="#5D8C50" stroke-width="1.8"/><path d="m11.9 7.4 2.2 3.2 4-1.2" stroke="#F7E9CF"/>'),
    org_inpe:pro('pnp','<circle cx="15.2" cy="16.3" r="5.3" fill="@b"/><path d="M3.8 19.7c5.6-7.6 14.9-12.6 24.4-9.4M4.6 23c8.9 3.8 18.1.6 23.7-7.4"/><path d="m22.7 4.1 4.6 1.3 1.3 4.6-4.7-1.3z" fill="@s"/><path d="M7.8 8.2 4.5 4.9m19.7 19.4 3.3 3.3"/><circle cx="15.2" cy="16.3" r="1.5" fill="#EFF7DD"/>'),
    ambiente_estaduais:pro('pes','<path d="M5.2 11.1 16 4.7l10.8 6.4v14.2H5.2z" fill="@s"/><path d="M3.7 11.1h24.6M7.4 25.3h17.2M4.5 28h23M8.8 11.1v11.7m4.8-11.7v11.7m4.8-11.7v11.7m4.8-11.7v11.7"/><path d="M12.7 7.9h6.6" stroke="#648D50" stroke-width="1.45"/><circle cx="16" cy="7.9" r="1" fill="@g"/>')
  });
  /* Marca apenas os botões dessa família para o acabamento visual. */
  const marcar=()=>document.querySelectorAll('#ribbon .rbtn').forEach(b=>{
    const n=b.textContent.trim();
    if(/^(Ibama|ICMBio|IPHAN|MMA · CNUC|Funai|Incra|SICAR · CAR|ANM|ANA|IBGE|INDE|SGB|INPE|Órgão estadual)$/.test(n))b.dataset.orgao='1';
  });
  if(typeof RIB_CAT_ATUAL!=='undefined'&&RIB_CAT_ATUAL==='ambiente'&&typeof ribbonBuild==='function')ribbonBuild();
  setTimeout(marcar,0);
})();

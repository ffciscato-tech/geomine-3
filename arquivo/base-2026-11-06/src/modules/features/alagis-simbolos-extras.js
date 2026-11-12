
/* Grupos de símbolo que existiam na outra linhagem do CCMGIS e não tinham
   vindo para cá: infraestrutura, sinalização de obra, estruturais adicionais
   do padrão USGS e sedimentares/paleontológicos. Entram por Object.assign, de
   modo que os símbolos de trânsito já existentes ficam intactos. */
Object.assign(PT_SYMS,{
  /* — Infraestrutura e serviços — */
  hospital:   {lb:'Hospital',            g:'Infraestrutura', d:(f,k,w)=>`<rect x="-8" y="-8" width="16" height="16" rx="2" fill="${f}" stroke="${k}" stroke-width="${w}"/><path d="M0,-5V5M-5,0H5" stroke="#fff" stroke-width="${w*2.2}" stroke-linecap="round"/>`},
  posto_saude:{lb:'Posto de saúde',      g:'Infraestrutura', d:(f,k,w)=>`<circle r="8" fill="${f}" stroke="${k}" stroke-width="${w}"/><path d="M0,-4.5V4.5M-4.5,0H4.5" stroke="#fff" stroke-width="${w*2}" stroke-linecap="round"/>`},
  igreja:     {lb:'Igreja',              g:'Infraestrutura', d:(f,k,w)=>`<path d="M-6,8V-1l6-4 6,4v9z" fill="${f}" stroke="${k}" stroke-width="${w}"/><path d="M0,-5V-9M-2.2,-7.2H2.2" stroke="${k}" stroke-width="${w*1.4}" stroke-linecap="round"/>`},
  escola:     {lb:'Escola',              g:'Infraestrutura', d:(f,k,w)=>`<path d="M-9,-1 0,-7 9,-1v9h-18z" fill="${f}" stroke="${k}" stroke-width="${w}"/><path d="M-3.5,8V2h7v6" fill="#fff" stroke="${k}" stroke-width="${w*.8}"/>`},
  aeroporto:  {lb:'Aeroporto',           g:'Infraestrutura', d:(f,k,w)=>`<path d="M0,-9 2,-2 9,1v2l-7-1.5-1 5 3 2v1.5L0,9l-3-1 3-2-1-5L-9,3V1l7-3z" fill="${f}" stroke="${k}" stroke-width="${w*.8}"/>`},
  heliponto:  {lb:'Heliponto',           g:'Infraestrutura', d:(f,k,w)=>`<circle r="8.5" fill="${f}" stroke="${k}" stroke-width="${w}"/><path d="M-3.5,-4.5V4.5M3.5,-4.5V4.5M-3.5,0H3.5" stroke="#fff" stroke-width="${w*1.8}" stroke-linecap="round"/>`},
  porto:      {lb:'Porto / atracadouro', g:'Infraestrutura', d:(f,k,w)=>`<path d="M0,-8V6M-4.5,-4.5H4.5" stroke="${k}" stroke-width="${w*1.6}" stroke-linecap="round"/><path d="M-7,2a7,7 0 0 0 14,0" fill="none" stroke="${k}" stroke-width="${w*1.6}"/><circle cy="-8" r="2" fill="${f}" stroke="${k}" stroke-width="${w}"/>`},
  energia:    {lb:'Torre de energia',    g:'Infraestrutura', d:(f,k,w)=>`<path d="M-6,9 0,-9 6,9M-4.4,3H4.4M-2.8,-2.5H2.8M-7,-6H7" fill="none" stroke="${k}" stroke-width="${w*1.2}" stroke-linejoin="round"/>`},
  subestacao: {lb:'Subestação',          g:'Infraestrutura', d:(f,k,w)=>`<rect x="-8" y="-8" width="16" height="16" rx="2" fill="${f}" stroke="${k}" stroke-width="${w}"/><path d="M1.5,-6 -3,0.5h3.5L-1.5,6 3.5,-0.5H0z" fill="#fff"/>`},
  eta:        {lb:'ETA / captação',      g:'Infraestrutura', d:(f,k,w)=>`<path d="M0,-9c4,5 6,7.5 6,10a6,6 0 0 1-12,0c0-2.5 2-5 6-10z" fill="${f}" stroke="${k}" stroke-width="${w}"/>`},
  ete:        {lb:'ETE / tratamento',    g:'Infraestrutura', d:(f,k,w)=>`<circle r="8" fill="${f}" stroke="${k}" stroke-width="${w}"/><path d="M-5,1q2.5,-3 5,0t5,0M-5,4.5q2.5,-3 5,0t5,0" fill="none" stroke="#fff" stroke-width="${w*1.2}"/>`},
  reservatorio:{lb:'Reservatório',       g:'Infraestrutura', d:(f,k,w)=>`<path d="M-7,-6h14v9a7,3.5 0 0 1-14,0z" fill="${f}" stroke="${k}" stroke-width="${w}"/><ellipse cy="-6" rx="7" ry="3.2" fill="${f}" stroke="${k}" stroke-width="${w}"/>`},
  combustivel:{lb:'Combustível',         g:'Infraestrutura', d:(f,k,w)=>`<path d="M-7,9V-7a2,2 0 0 1 2-2h5a2,2 0 0 1 2,2V9z" fill="${f}" stroke="${k}" stroke-width="${w}"/><path d="M4,-4h3v8a2,2 0 0 0 2,2" fill="none" stroke="${k}" stroke-width="${w*1.1}"/><path d="M-5,-5h5v4h-5z" fill="#fff"/>`},
  industria:  {lb:'Indústria',           g:'Infraestrutura', d:(f,k,w)=>`<path d="M-9,9V0l6,4V0l6,4V-6h6V9z" fill="${f}" stroke="${k}" stroke-width="${w}"/>`},
  armazem:    {lb:'Armazém / silo',      g:'Infraestrutura', d:(f,k,w)=>`<path d="M-6,9V-3a6,6 0 0 1 12,0V9z" fill="${f}" stroke="${k}" stroke-width="${w}"/><path d="M-6,1H6M-6,5H6" stroke="${k}" stroke-width="${w*.7}"/>`},
  balanca:    {lb:'Balança',             g:'Infraestrutura', d:(f,k,w)=>`<path d="M0,-8V7M-7,7H7M-7,-5H7" stroke="${k}" stroke-width="${w*1.3}" stroke-linecap="round"/><path d="M-7,-5 -10,1h6zM7,-5 4,1h6z" fill="${f}" stroke="${k}" stroke-width="${w*.8}"/>`},
  portaria:   {lb:'Portaria / guarita',  g:'Infraestrutura', d:(f,k,w)=>`<path d="M-6,9V-3l6-5 6,5V9z" fill="${f}" stroke="${k}" stroke-width="${w}"/><rect x="-2" y="1" width="4" height="8" fill="#fff"/>`},
  oficina:    {lb:'Oficina',             g:'Infraestrutura', d:(f,k,w)=>`<path d="M4,-8a5,5 0 0 0-6.5,6.2L-8,4.7 -4.7,8 1.8,1.5A5,5 0 0 0 8,-4l-3.2,3.2-2.6-.7-.7-2.6z" fill="${f}" stroke="${k}" stroke-width="${w}" stroke-linejoin="round"/>`},
  laboratorio:{lb:'Laboratório',         g:'Infraestrutura', d:(f,k,w)=>`<path d="M-2.5,-9v6L-7.5,6a2,2 0 0 0 1.8,3h11.4a2,2 0 0 0 1.8,-3L2.5,-3v-6z" fill="${f}" stroke="${k}" stroke-width="${w}"/><path d="M-4,-9h8" stroke="${k}" stroke-width="${w*1.3}" stroke-linecap="round"/>`},
  estacionamento:{lb:'Estacionamento',   g:'Infraestrutura', d:(f,k,w)=>`<rect x="-8" y="-8" width="16" height="16" rx="2.5" fill="${f}" stroke="${k}" stroke-width="${w}"/><path d="M-2.5,6V-6h3.5a3.2,3.2 0 0 1 0,6.4h-3.5" fill="none" stroke="#fff" stroke-width="${w*1.8}" stroke-linecap="round" stroke-linejoin="round"/>`},
  policia:    {lb:'Polícia',             g:'Infraestrutura', d:(f,k,w)=>`<path d="M0,-9 7,-6v6c0,5-3.5,8-7,9-3.5,-1-7,-4-7,-9v-6z" fill="${f}" stroke="${k}" stroke-width="${w}"/>`},
  bombeiros:  {lb:'Bombeiros',           g:'Infraestrutura', d:(f,k,w)=>`<path d="M0,9c-4,0-6.5,-2.7-6.5,-6 0-4 3.5,-5.5 3-9 3,1.5 4,4 4,6 1,-1 1.5,-2.5 1.5,-4 3,2.5 4.5,4.7 4.5,7 0,3.3-2.5,6-6.5,6z" fill="${f}" stroke="${k}" stroke-width="${w}"/>`},
  ponte:      {lb:'Ponte',               g:'Infraestrutura', d:(f,k,w)=>`<path d="M-9,4H9M-9,4V-1M9,4V-1M-9,-1q9,-7 18,0" fill="none" stroke="${k}" stroke-width="${w*1.4}" stroke-linecap="round"/>`},
  antena:     {lb:'Antena / repetidora', g:'Infraestrutura', d:(f,k,w)=>`<path d="M-4,9 0,-4 4,9M-2.6,4H2.6" fill="none" stroke="${k}" stroke-width="${w*1.2}"/><circle cy="-6" r="1.8" fill="${f}" stroke="${k}" stroke-width="${w}"/><path d="M-5,-9a7,7 0 0 1 10,0" fill="none" stroke="${k}" stroke-width="${w*.9}"/>`},

  /* — Sinalização e segurança — */
  perigo:     {lb:'Perigo (geral)',      g:'Sinalização', d:(f,k,w)=>`<path d="M0,-9 9.5,7.5h-19z" fill="${f}" stroke="${k}" stroke-width="${w}" stroke-linejoin="round"/><path d="M0,-3.5V2" stroke="${k}" stroke-width="${w*1.7}" stroke-linecap="round"/><circle cy="5" r="1.2" fill="${k}"/>`},
  proibido:   {lb:'Proibido',            g:'Sinalização', d:(f,k,w)=>`<circle r="8.5" fill="${f}" stroke="${k}" stroke-width="${w*1.6}"/><path d="M-5.5,5.5 5.5,-5.5" stroke="${k}" stroke-width="${w*1.8}" stroke-linecap="round"/>`},
  pare:       {lb:'Pare',                g:'Sinalização', d:(f,k,w)=>`<path d="M-3.5,-8.5h7l5,5v7l-5,5h-7l-5,-5v-7z" fill="${f}" stroke="${k}" stroke-width="${w}" stroke-linejoin="round"/>`},
  obrigatorio:{lb:'Obrigatório',         g:'Sinalização', d:(f,k,w)=>`<circle r="8.5" fill="${f}" stroke="${k}" stroke-width="${w}"/><path d="M-3.5,0.5 -1,3.5 4,-3" fill="none" stroke="#fff" stroke-width="${w*2}" stroke-linecap="round" stroke-linejoin="round"/>`},
  epi:        {lb:'EPI obrigatório',     g:'Sinalização', d:(f,k,w)=>`<circle r="8.5" fill="${f}" stroke="${k}" stroke-width="${w}"/><path d="M-5,3a5,5 0 0 1 10,0z" fill="#fff"/><path d="M-6.5,3H6.5" stroke="#fff" stroke-width="${w*1.4}" stroke-linecap="round"/>`},
  alta_tensao:{lb:'Alta tensão',         g:'Sinalização', d:(f,k,w)=>`<path d="M0,-9 9.5,7.5h-19z" fill="${f}" stroke="${k}" stroke-width="${w}" stroke-linejoin="round"/><path d="M1.5,-4 -3,2.5h3.5L-1,6.5 4,0H0.5z" fill="${k}"/>`},
  explosivos: {lb:'Explosivos',          g:'Sinalização', d:(f,k,w)=>`<path d="M0,-9 9.5,7.5h-19z" fill="${f}" stroke="${k}" stroke-width="${w}" stroke-linejoin="round"/><path d="M0,-1 2,2h-4zM0,3.5v1.5M-3,0 -5,-1M3,0 5,-1" stroke="${k}" stroke-width="${w*1.1}" stroke-linecap="round" fill="${k}"/>`},
  inflamavel: {lb:'Inflamável',          g:'Sinalização', d:(f,k,w)=>`<path d="M0,-9 9.5,7.5h-19z" fill="${f}" stroke="${k}" stroke-width="${w}" stroke-linejoin="round"/><path d="M0,6c-2.2,0-3.6,-1.5-3.6,-3.3 0-2.2 1.9,-3 1.7,-5 1.7,.8 2.2,2.2 2.2,3.3 .6,-.6 .8,-1.4 .8,-2.2 1.7,1.4 2.5,2.6 2.5,3.9C3.6,4.5 2.2,6 0,6z" fill="${k}"/>`},
  queda_rocha:{lb:'Queda de rocha',      g:'Sinalização', d:(f,k,w)=>`<path d="M0,-9 9.5,7.5h-19z" fill="${f}" stroke="${k}" stroke-width="${w}" stroke-linejoin="round"/><path d="M-4,-1 -1.5,-3 -0.5,0 -3,1.5z M2,2 4,0.5 5,3 3,4z" fill="${k}"/><path d="M-5.5,5.5H5.5" stroke="${k}" stroke-width="${w*1.2}"/>`},
  escorregadio:{lb:'Piso escorregadio',  g:'Sinalização', d:(f,k,w)=>`<path d="M0,-9 9.5,7.5h-19z" fill="${f}" stroke="${k}" stroke-width="${w}" stroke-linejoin="round"/><path d="M-5,4.5q2.5,-2.5 5,0t5,0" fill="none" stroke="${k}" stroke-width="${w*1.3}"/><circle cx="-1" cy="-1.5" r="1.4" fill="${k}"/>`},
  declive:    {lb:'Declive acentuado',   g:'Sinalização', d:(f,k,w)=>`<path d="M0,-9 9.5,7.5h-19z" fill="${f}" stroke="${k}" stroke-width="${w}" stroke-linejoin="round"/><path d="M-5,5.5 5,-1.5V5.5z" fill="${k}"/>`},
  caminhao:   {lb:'Tráfego de caminhões',g:'Sinalização', d:(f,k,w)=>`<path d="M0,-9 9.5,7.5h-19z" fill="${f}" stroke="${k}" stroke-width="${w}" stroke-linejoin="round"/><path d="M-6,4.5V0h5v-2h3l2,2h2v4.5z" fill="${k}"/>`},
  pedestre:   {lb:'Pedestre',            g:'Sinalização', d:(f,k,w)=>`<path d="M0,-9 9.5,7.5h-19z" fill="${f}" stroke="${k}" stroke-width="${w}" stroke-linejoin="round"/><circle cy="-2.5" r="1.5" fill="${k}"/><path d="M0,-1v4M0,3 -2,6.5M0,3 2,6.5M-2.5,0.5 2.5,0.5" stroke="${k}" stroke-width="${w*1.1}" stroke-linecap="round"/>`},
  velocidade: {lb:'Velocidade máxima',   g:'Sinalização',
    paramDefs:{speed:{label:'Velocidade (km/h)',type:'number',min:1,max:999,step:1,default:40}},
    d:(f,k,w,p)=>{const n=Math.round(Math.max(1,Math.min(999,+((p&&p.speed)??40)||40))),t=String(n),fs=t.length>=3?6.6:t.length===2?9:10;
      return `<circle r="8.5" fill="${f}" stroke="${k}" stroke-width="${w*1.8}"/><text y="3.4" text-anchor="middle" font-size="${fs}" font-weight="700" fill="${k}" font-family="Signika,sans-serif">${t}</text>`;}},
  sentido:    {lb:'Sentido único',       g:'Sinalização', d:(f,k,w)=>`<rect x="-9" y="-5" width="18" height="10" rx="1.5" fill="${f}" stroke="${k}" stroke-width="${w}"/><path d="M-5,0H4M1,-3 5,0 1,3" fill="none" stroke="#fff" stroke-width="${w*1.6}" stroke-linecap="round" stroke-linejoin="round"/>`},
  detonacao:  {lb:'Área de detonação',   g:'Sinalização', d:(f,k,w)=>`<path d="M0,-9 2.5,-3 8.5,-4.5 5,0.5 9,5 3,5.5 2,9.5 -1,5.5 -6,7.5 -5,2 -9,-1 -3.5,-3z" fill="${f}" stroke="${k}" stroke-width="${w}" stroke-linejoin="round"/>`},
  ruido:      {lb:'Ruído',               g:'Sinalização', d:(f,k,w)=>`<circle r="8.5" fill="${f}" stroke="${k}" stroke-width="${w}"/><path d="M-4,-2h2.5L1,-5v10L-1.5,2H-4z" fill="#fff"/><path d="M3,-3.5a4.5,4.5 0 0 1 0,7M5.5,-6a8,8 0 0 1 0,12" fill="none" stroke="#fff" stroke-width="${w*1.2}"/>`},
  cerca:      {lb:'Cerca / limite',      g:'Sinalização', d:(f,k,w)=>`<path d="M-8,-4V7M0,-6V7M8,-4V7M-9,-1H9M-9,3H9" fill="none" stroke="${k}" stroke-width="${w*1.2}" stroke-linecap="round"/>`}
});
Object.assign(PT_SYMS,{
  /* — Estruturais — */
  sd_xist:{lb:'Xistosidade — direção/mergulho',g:'Estruturais (USGS)',oriented:true,dip:true,
    d:(f,k,w)=>`<path d="M0,-8V8" stroke="${k}" stroke-width="${w*1.3}"/><path d="M0,0H6" stroke="${k}" stroke-width="${w*1.3}"/><path d="M0,-3H4M0,3H4" stroke="${k}" stroke-width="${w*.8}"/>`},
  sd_gnaisse:{lb:'Gnaissificação — direção/mergulho',g:'Estruturais (USGS)',oriented:true,dip:true,
    d:(f,k,w)=>`<path d="M0,-8V8" stroke="${k}" stroke-width="${w*1.3}"/><path d="M0,0H6.5" stroke="${k}" stroke-width="${w*1.5}"/><path d="M-1.6,-8V8" stroke="${k}" stroke-width="${w*.7}"/>`},
  sd_cliv:{lb:'Clivagem — direção/mergulho',g:'Estruturais (USGS)',oriented:true,dip:true,
    d:(f,k,w)=>`<path d="M0,-8V8" stroke="${k}" stroke-width="${w*1.2}" stroke-dasharray="2.6 1.6"/><path d="M0,0H6" stroke="${k}" stroke-width="${w*1.2}"/>`},
  sd_joint_vt:{lb:'Junta vertical',g:'Estruturais (USGS)',oriented:true,
    d:(f,k,w)=>`<path d="M0,-8V8" stroke="${k}" stroke-width="${w*1.5}"/><path d="M-3,0H3" stroke="${k}" stroke-width="${w*1.5}"/>`},
  lin_estir:{lb:'Lineação de estiramento',g:'Estruturais (USGS)',oriented:true,dip:true,
    d:(f,k,w)=>`<path d="M0,-7V6" stroke="${k}" stroke-width="${w*1.2}"/><path d="M-2.2,3.4 0,7 2.2,3.4" fill="none" stroke="${k}" stroke-width="${w*1.2}" stroke-linejoin="round"/><circle cy="-7" r="1.5" fill="none" stroke="${k}" stroke-width="${w}"/>`},
  eixo_anti:{lb:'Eixo de antiforme',g:'Estruturais (USGS)',oriented:true,
    d:(f,k,w)=>`<path d="M0,-9V9" stroke="${k}" stroke-width="${w*1.3}"/><path d="M-3,-4 0,-8 3,-4M-3,4 0,8 3,4" fill="none" stroke="${k}" stroke-width="${w*1.3}" stroke-linejoin="round"/>`},
  eixo_sin:{lb:'Eixo de sinforme',g:'Estruturais (USGS)',oriented:true,
    d:(f,k,w)=>`<path d="M0,-9V9" stroke="${k}" stroke-width="${w*1.3}"/><path d="M-3,-8 0,-4 3,-8M-3,8 0,4 3,8" fill="none" stroke="${k}" stroke-width="${w*1.3}" stroke-linejoin="round"/>`},
  falha_norm:{lb:'Falha normal',g:'Estruturais (USGS)',oriented:true,
    d:(f,k,w)=>`<path d="M0,-9V9" stroke="${k}" stroke-width="${w*1.6}"/><path d="M0,0h4.5" stroke="${k}" stroke-width="${w*1.2}"/><circle cx="4.5" cy="0" r="1.4" fill="${k}"/>`},
  falha_inv:{lb:'Falha inversa / empurrão',g:'Estruturais (USGS)',oriented:true,
    d:(f,k,w)=>`<path d="M0,-9V9" stroke="${k}" stroke-width="${w*1.6}"/><path d="M0,-4 3.6,-2.4 0,-0.8zM0,3 3.6,4.6 0,6.2z" fill="${k}"/>`},
  falha_dex:{lb:'Falha transcorrente dextral',g:'Estruturais (USGS)',oriented:true,
    d:(f,k,w)=>`<path d="M0,-9V9" stroke="${k}" stroke-width="${w*1.6}"/><path d="M2.4,-5.4h4M6,-7.2 8.4,-5.4 6,-3.6M-2.4,5.4h-4M-6,3.6 -8.4,5.4 -6,7.2" fill="none" stroke="${k}" stroke-width="${w*1.1}" stroke-linejoin="round" stroke-linecap="round"/>`},
  falha_sin:{lb:'Falha transcorrente sinistral',g:'Estruturais (USGS)',oriented:true,
    d:(f,k,w)=>`<path d="M0,-9V9" stroke="${k}" stroke-width="${w*1.6}"/><path d="M-2.4,-5.4h-4M-6,-7.2 -8.4,-5.4 -6,-3.6M2.4,5.4h4M6,3.6 8.4,5.4 6,7.2" fill="none" stroke="${k}" stroke-width="${w*1.1}" stroke-linejoin="round" stroke-linecap="round"/>`},
  zona_cis:{lb:'Zona de cisalhamento',g:'Estruturais (USGS)',oriented:true,
    d:(f,k,w)=>`<path d="M-2,-9V9M2,-9V9" stroke="${k}" stroke-width="${w*1.2}"/><path d="M-2,-3 2,-1M-2,3 2,5" stroke="${k}" stroke-width="${w}"/>`},
  dique_sym:{lb:'Dique',g:'Estruturais (USGS)',oriented:true,
    d:(f,k,w)=>`<path d="M-2.2,-9V9M2.2,-9V9" stroke="${k}" stroke-width="${w*1.5}"/><path d="M-2.2,-9H2.2M-2.2,9H2.2" stroke="${k}" stroke-width="${w*1.5}"/>`},
  contato_aprox:{lb:'Contato aproximado',g:'Estruturais (USGS)',oriented:true,
    d:(f,k,w)=>`<path d="M0,-9V9" stroke="${k}" stroke-width="${w*1.4}" stroke-dasharray="4 2.6"/>`},
  contato_inf:{lb:'Contato inferido',g:'Estruturais (USGS)',oriented:true,
    d:(f,k,w)=>`<path d="M0,-9V9" stroke="${k}" stroke-width="${w*1.4}" stroke-dasharray="1.6 2.4"/>`},

  /* — Sedimentares — */
  est_cruzada:{lb:'Estratificação cruzada',g:'Sedimentares · paleo',
    d:(f,k,w)=>`<path d="M-8,-5H8M-8,5H8" stroke="${k}" stroke-width="${w*1.1}"/><path d="M-8,5 -2,-5M-2,5 4,-5M4,5 8,-1.5" fill="none" stroke="${k}" stroke-width="${w*.8}"/>`},
  est_plana:{lb:'Estratificação plano-paralela',g:'Sedimentares · paleo',
    d:(f,k,w)=>`<path d="M-8,-5H8M-8,-1.6H8M-8,1.8H8M-8,5.2H8" stroke="${k}" stroke-width="${w*1.1}"/>`},
  est_grad:{lb:'Granodecrescência (gradacional)',g:'Sedimentares · paleo',
    d:(f,k,w)=>`<path d="M-8,-6H8M-8,6H8" stroke="${k}" stroke-width="${w*1.1}"/><circle cx="-4" cy="3.4" r="1.7" fill="${k}"/><circle cx="1" cy="3.8" r="1.3" fill="${k}"/><circle cx="5" cy="4.2" r="0.9" fill="${k}"/><circle cx="-2" cy="-2.6" r="0.7" fill="${k}"/><circle cx="3" cy="-3" r="0.55" fill="${k}"/>`},
  marcas_ond:{lb:'Marcas onduladas (ripples)',g:'Sedimentares · paleo',
    d:(f,k,w)=>`<path d="M-8,2q2.6,-6 5.2,0t5.2,0 5.2,0" fill="none" stroke="${k}" stroke-width="${w*1.2}"/><path d="M-8,6q2.6,-6 5.2,0t5.2,0 5.2,0" fill="none" stroke="${k}" stroke-width="${w*.9}"/>`},
  bioturbacao:{lb:'Bioturbação',g:'Sedimentares · paleo',
    d:(f,k,w)=>`<path d="M-5,7q1.6,-5 0,-9M0,8q2.4,-6 -0.6,-11M5,7q-1.8,-5 0.4,-9" fill="none" stroke="${k}" stroke-width="${w*1.1}" stroke-linecap="round"/>`},
  paleocorrente:{lb:'Paleocorrente',g:'Sedimentares · paleo',oriented:true,
    d:(f,k,w)=>`<path d="M0,8V-6" stroke="${k}" stroke-width="${w*1.4}"/><path d="M-3.2,-2.6 0,-8 3.2,-2.6" fill="none" stroke="${k}" stroke-width="${w*1.4}" stroke-linejoin="round"/>`},
  concrecao:{lb:'Concreção / nódulo',g:'Sedimentares · paleo',
    d:(f,k,w)=>`<ellipse rx="6.5" ry="4.4" fill="none" stroke="${k}" stroke-width="${w*1.2}"/><ellipse rx="3.2" ry="2.1" fill="${k}" opacity=".55"/>`},
  estromatolito:{lb:'Estromatólito',g:'Sedimentares · paleo',
    d:(f,k,w)=>`<path d="M-7,7q3.5,-11 7,0M-4,7q1.6,-6 3.2,0M-8.5,7H8.5" fill="none" stroke="${k}" stroke-width="${w*1.1}" stroke-linecap="round"/><path d="M1,7q3,-9 6,0" fill="none" stroke="${k}" stroke-width="${w*1.1}"/>`},
  fossil_veg:{lb:'Fóssil vegetal',g:'Sedimentares · paleo',
    d:(f,k,w)=>`<path d="M0,8V-2" stroke="${k}" stroke-width="${w*1.2}"/><path d="M0,-2q-6,-1 -5,-6 5,-1 5,6M0,-2q6,-1 5,-6 -5,-1 -5,6" fill="none" stroke="${k}" stroke-width="${w}"/>`},
  fossil_animal:{lb:'Fóssil animal (concha)',g:'Sedimentares · paleo',
    d:(f,k,w)=>`<path d="M-7,3a7,6 0 0 1 14,0z" fill="none" stroke="${k}" stroke-width="${w*1.2}"/><path d="M-3.5,3 -1.5,-2.6M0,3V-3M3.5,3 1.5,-2.6" fill="none" stroke="${k}" stroke-width="${w*.8}"/>`}
});

/* Placas canônicas fornecidas em Sinalizacao_placas.gpkg. O montador troca
   estes tokens por data URI, de forma que o HTML continue totalmente offline
   e nenhuma placa dependa de /Users/... ou de uma conexão externa. */
const GEOMINE_PLACA_IMG=Object.freeze({
  limite_20:'__GM_PLACA_LIMITE_20__',
  limite_30:'__GM_PLACA_LIMITE_30__',
  declive:'__GM_PLACA_DECLIVE__',
  pessoal_autorizado:'__GM_PLACA_PESSOAL_AUTORIZADO__',
  veiculos_pesados:'__GM_PLACA_VEICULOS_PESADOS__',
  acesso_interrompido:'__GM_PLACA_ACESSO_INTERROMPIDO__',
  sentido_duplo:'__GM_PLACA_SENTIDO_DUPLO__',
  caminho_seguro:'__GM_PLACA_CAMINHO_SEGURO__',
  rotatoria:'__GM_PLACA_ROTATORIA__',
  transito_veiculos_pesados:'__GM_PLACA_TRANSITO_VEICULOS_PESADOS__',
  entrada_saida_caminhoes:'__GM_PLACA_ENTRADA_SAIDA_CAMINHOES__',
  balanca:'__GM_PLACA_BALANCA__',
  estacione_re:'__GM_PLACA_ESTACIONE_RE__',
  proibido_pedestre:'__GM_PLACA_PROIBIDO_PEDESTRE__',
  acesso_restrito:'__GM_PLACA_ACESSO_RESTRITO__',
  proibido_celular:'__GM_PLACA_PROIBIDO_CELULAR__'
});
function geominePlacaRaster(tipo){
  const src=GEOMINE_PLACA_IMG[tipo];
  return `<image x="-9" y="-9" width="18" height="18" preserveAspectRatio="xMidYMid meet" href="${src}"/>`;
}
function geominePlacaVelocidade(valor){
  const n=Math.round(Math.max(1,Math.min(999,+valor||40))),t=String(n),fs=t.length>=3?5.5:t.length===2?7.6:8.2;
  return `<circle r="8.35" fill="#fff" stroke="#f51d2b" stroke-width="1.75"/>`+
    `<circle r="8.92" fill="none" stroke="#d8d8d8" stroke-width=".18"/>`+
    `<text x="0" y=".8" font-size="${fs}" font-family="Arial Narrow,Arial,sans-serif" font-weight="800" fill="#29292d" text-anchor="middle">${t}</text>`+
    `<text x="0" y="5.35" font-size="2.65" font-family="Arial,sans-serif" font-weight="700" fill="#29292d" text-anchor="middle">Km/h</text>`;
}

/* A biblioteca usa os mesmos nomes estáveis da versão anterior quando eles
   existem, para projetos já salvos passarem a mostrar as placas corretas. */
Object.assign(PT_SYMS,{
  tr_vel_20:{lb:'Limite 20 km/h',g:'Placas CCM · Operação',d:()=>geominePlacaVelocidade(20)},
  tr_vel_30:{lb:'Limite 30 km/h',g:'Placas CCM · Operação',d:()=>geominePlacaRaster('limite_30')},
  tr_vel_40:{lb:'Limite 40 km/h',g:'Placas CCM · Operação',d:()=>geominePlacaVelocidade(40)},
  placa_declive:{lb:'Declive acentuado',g:'Placas CCM · Operação',d:()=>geominePlacaRaster('declive')},
  placa_sentido_duplo:{lb:'Sentido duplo de circulação',g:'Placas CCM · Operação',d:()=>geominePlacaRaster('sentido_duplo')},
  placa_entrada_saida_caminhoes:{lb:'Entrada e saída de caminhões',g:'Placas CCM · Operação',d:()=>geominePlacaRaster('entrada_saida_caminhoes')},
  placa_balanca:{lb:'Balança',g:'Placas CCM · Operação',d:()=>geominePlacaRaster('balanca')},
  placa_proibido_pedestre:{lb:'Proibido trânsito de pedestres',g:'Placas CCM · Operação',d:()=>geominePlacaRaster('proibido_pedestre')},
  seg_caminho_seguro:{lb:'Caminho seguro',g:'Placas CCM · Operação',d:()=>geominePlacaRaster('caminho_seguro')},
  seg_sem_celular:{lb:'Proibido uso de celular',g:'Placas CCM · Operação',d:()=>geominePlacaRaster('proibido_celular')},
  tr_rotatoria:{lb:'Rotatória',g:'Placas CCM · Operação',d:()=>geominePlacaRaster('rotatoria')},
  seg_acesso_restrito:{lb:'Acesso restrito',g:'Placas CCM · Operação',d:()=>geominePlacaRaster('acesso_restrito')},
  seg_acesso_interrompido:{lb:'Acesso interrompido',g:'Placas CCM · Operação',d:()=>geominePlacaRaster('acesso_interrompido')},
  seg_pessoal_autorizado:{lb:'Somente pessoas autorizadas',g:'Placas CCM · Operação',d:()=>geominePlacaRaster('pessoal_autorizado')},
  seg_veiculos_pesados:{lb:'Veículos pesados',g:'Placas CCM · Operação',d:()=>geominePlacaRaster('veiculos_pesados')},
  seg_transito_pesados:{lb:'Trânsito de caminhões',g:'Placas CCM · Operação',d:()=>geominePlacaRaster('transito_veiculos_pesados')},
  seg_estacione_re:{lb:'Estacione de ré',g:'Placas CCM · Operação',d:()=>geominePlacaRaster('estacione_re')},
  velocidade:{lb:'Velocidade máxima (compatibilidade)',g:'Sinalização',hidden:true,
    paramDefs:{speed:{label:'Velocidade (km/h)',type:'number',min:1,max:999,step:1,default:40}},
    d:(f,k,w,p)=>geominePlacaVelocidade((p&&p.speed)??40)}
});

/* Biblioteca persistente por VALOR de atributo. Só guarda IDs confiáveis do
   catálogo e parâmetros declarativos; nunca aceita SVG arbitrário. Isso
   mantém o projeto seguro e permite que uma escolha feita hoje reapareça em
   outra camada aberta no mesmo navegador/tablet. */
(()=>{
  const KEY='geomine_point_symbol_memory_v2', VERSION=2;
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  const clone=o=>o?JSON.parse(JSON.stringify(o)):o;
  function cleanStyle(raw){
    if(!raw||!PT_SYMS[raw.shape])return null;
    const d=PT_SYMS[raw.shape], out={shape:raw.shape};
    if(Number.isFinite(+raw.size))out.size=Math.max(6,Math.min(96,+raw.size));
    ['color','stroke'].forEach(k=>{if(/^#[0-9a-f]{6}$/i.test(String(raw[k]||'')))out[k]=raw[k];});
    if(Number.isFinite(+raw.weight))out.weight=Math.max(0,Math.min(12,+raw.weight));
    if(raw.symbolParams&&d.paramDefs){out.symbolParams={};Object.entries(d.paramDefs).forEach(([k,p])=>{
      let v=raw.symbolParams[k]??p.default;
      if(p.type==='number')v=Math.max(p.min??-Infinity,Math.min(p.max??Infinity,Number.isFinite(+v)?+v:(p.default??0)));
      else v=String(v??'').slice(0,80);
      out.symbolParams[k]=v;
    });}
    return out;
  }
  function base(shape,size,extra){return Object.assign({shape,size:size||34,color:'#ffffff',stroke:'#111111',weight:1.5},extra||{});}
  function builtIn(value){
    const n=norm(value); if(!n)return null;
    if(n.includes('CAMINHO SEGURO'))return base('seg_caminho_seguro',48);
    if(n.includes('CELULAR')&&n.includes('PROIB'))return base('seg_sem_celular',58);
    if((n.includes('VELOCIDADE')||n.includes('LIMITE'))&&/\b\d{1,3}\b/.test(n)){
      const speed=+(n.match(/\b(\d{1,3})\b/)||[])[1];
      if(speed===20||speed===30||speed===40)return base(`tr_vel_${speed}`,46);
      return base('tr_vel',46,{symbolParams:{speed}});
    }
    if(n.includes('ROTATORIA'))return base('tr_rotatoria',48);
    if(n.includes('SENTIDO DUPLO')||n.includes('DUPLO SENTIDO')||n.includes('MAO DUPLA'))return base('placa_sentido_duplo',48);
    if(n.includes('ACESSO RESTRITO'))return base('seg_acesso_restrito',58);
    if(n.includes('ACESSO INTERROMPIDO')||n.includes('ACESSO BLOQUEADO')||n.includes('TRANSITO IMPEDIDO'))return base('seg_acesso_interrompido',58);
    if(n.includes('DECLIVE'))return base('placa_declive',48);
    if((n.includes('ENTRADA')&&n.includes('SAIDA')&&n.includes('CAMINH'))||n.includes('ENTRADA SAIDA CAMINHOES'))return base('placa_entrada_saida_caminhoes',58);
    if((n.includes('TRANSITO')&&n.includes('PESADO'))||n==='ATENCAO')return base('seg_transito_pesados',58);
    if(n.includes('VEICULO')&&n.includes('PESADO'))return base('seg_veiculos_pesados',58);
    if((n.includes('PESSOAL')&&n.includes('AUTORIZAD'))||(n.includes('PESSOA')&&n.includes('AUTORIZAD'))||(n.includes('VEICUL')&&n.includes('AUTORIZAD'))||(n.includes('ENTRADA EXCLUSIVA')&&n.includes('AUTORIZAD')))return base('seg_pessoal_autorizado',58);
    if(n==='BALANCA'||n.includes('PESAGEM'))return base('placa_balanca',54);
    if((n.includes('ESTACIONE')||n.includes('ESTECIONE')||n.includes('ESTACIONAMENTO'))&&(n.endsWith(' DE RE')||n.endsWith(' RE')))return base('seg_estacione_re',58);
    if(n.includes('PROIBIDO')&&n.includes('PEDESTRE'))return base('placa_proibido_pedestre',50);
    return null;
  }
  function read(){
    try{const d=JSON.parse(localStorage.getItem(KEY)||'null');return d&&d.version===VERSION&&d.entries&&typeof d.entries==='object'?d.entries:{};}catch(e){return {};}
  }
  function write(entries){try{localStorage.setItem(KEY,JSON.stringify({version:VERSION,updatedAt:new Date().toISOString(),entries}));return true;}catch(e){return false;}}
  function resolve(value){
    const key=norm(value), bi=builtIn(value), mem=cleanStyle(read()[key]);
    if(!bi)return mem;
    if(!mem)return cleanStyle(bi);
    return cleanStyle(Object.assign({},bi,mem,{symbolParams:Object.assign({},bi.symbolParams||{},mem.symbolParams||{})}));
  }
  function rememberLayer(L){
    if(!L||L.gtype!=='point'||!L.sym||L.sym.mode!=='cat')return 0;
    const entries=read();let n=0;
    (L.sym.cats||[]).forEach(c=>{const k=norm(c.value),st=cleanStyle(c);if(k&&st){entries[k]=st;n++;}});
    if(n)write(entries);return n;
  }
  function valuesFor(L,field){
    const map=new Map();(L.features||[]).forEach(f=>{const v=f&&f.props?f.props[field]:null;if(v==null||String(v).trim()==='')return;const k=String(v);map.set(k,(map.get(k)||0)+1);});return map;
  }
  function chooseField(L){
    let best=null;
    (L.fields||[]).forEach(fd=>{const field=typeof fd==='string'?fd:fd&&fd.name;if(!field)return;
      const vals=valuesFor(L,field), known=[...vals.keys()].filter(v=>resolve(v)).length;
      const hint=/SINAL|PLACA|TRANSITO|TRAFEGO|TIPO/i.test(norm(field)+' '+norm(L.name));
      const score=known*10+(hint?5:0)-(vals.size-known);
      if(known&&(!best||score>best.score))best={field,values:vals,known,total:vals.size,score,hint};
    });return best;
  }
  function applyToLayer(L,opt){
    opt=opt||{};if(!L||L.gtype!=='point'||!L.sym)return 0;
    const migrate=(+L.sym.pointSymbolLibraryVersion||0)<VERSION;
    const picked=opt.field?{field:opt.field,values:valuesFor(L,opt.field)}:((L.sym.mode==='cat'&&L.sym.field)?{field:L.sym.field,values:valuesFor(L,L.sym.field)}:chooseField(L));
    if(!picked||!picked.field||!picked.values.size)return 0;
    if(L.sym.mode!=='cat'&&!opt.autoConvert&&!opt.force)return 0;
    const old=new Map((L.sym.cats||[]).map(c=>[String(c.value),c])), cols=rampColors(L.sym.ramp||'aleatorio',picked.values.size);
    const generalSize=!!(L.sym.pt&&L.sym.pt.sizeGeneralSet);
    let matched=0,i=0;
    const cats=[...picked.values.entries()].map(([value,count])=>{
      const prev=old.get(value), c=prev?Object.assign({},prev,{value,count}):{value,count,color:cols[i],stroke:'#111111',weight:1.5};i++;
      const st=resolve(value);
      const hadOwnSize=!!(prev&&Object.prototype.hasOwnProperty.call(prev,'size')&&Number.isFinite(+prev.size));
      if(st&&(!prev||opt.force||migrate||!prev.shape)){Object.assign(c,clone(st));matched++;}
      if(generalSize){if(hadOwnSize)c.size=prev.size;else delete c.size;}
      return c;
    });
    if(!matched&&L.sym.mode!=='cat')return 0;
    L.sym.mode='cat';L.sym.field=picked.field;L.sym.cats=cats;L.sym.pointSymbolLibraryVersion=VERSION;
    L.sym.pt=L.sym.pt||{shape:'circle',size:14,rot:0,rotField:'',dipField:''};
    L._pointSymbolLibrary=true;return matched;
  }
  function autoApplyLayer(L){
    if(!L||L.gtype!=='point'||!L.features||!L.features.length)return 0;
    if(L.sym&&L.sym.mode==='cat'&&L.sym.field)return applyToLayer(L);
    const p=chooseField(L);if(!p||p.known<2)return 0;
    const ratio=p.total?p.known/p.total:0;
    if(!p.hint&&ratio<.6)return 0;
    return applyToLayer(L,{field:p.field,autoConvert:true});
  }
  window.GeoMinePointSymbols={version:VERSION,storageKey:KEY,normalize:norm,
    resolve,rememberLayer,applyToLayer,autoApplyLayer,
    list:()=>Object.entries(PT_SYMS).map(([id,d])=>({id,label:d.lb,group:d.g,parameters:clone(d.paramDefs||null)}))};
})();

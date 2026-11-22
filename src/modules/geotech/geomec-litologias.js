/* GeoMine — GEOMEC: banco de litologias (ângulo de atrito, coesão e peso específico).
   Pedido de 22/11/2026: "buscar em bancos de dados os fatores de ângulo de atrito e de
   coesão para diferentes litologias". Cada linha traz o valor típico que vai para o material,
   a faixa usual e a fonte. São valores de partida para estudo e pré-projeto: o projeto
   precisa de ensaios do local (NBR 13029 e NBR 11682 pedem parâmetros do material real).

   Fontes (abreviadas em "fonte"):
     navfac  NAVFAC DM-7.02 (1986), tab. 1 — propriedades típicas de solos compactados. c′ é o
             saturado (o "como compactado" fica no topo da faixa); φ′ vem de tan φ′.
     hoek    Marinos & Hoek (2000, 2001) — constante mi da rocha intacta; Hoek (2007), Practical
             Rock Engineering — estimativa de σci pela classe de resistência (R0 a R6); D de
             Hoek, Carranza-Torres & Corkum (2002) para taludes escavados com explosivo.
     gnaisse Ensaios publicados em solos de gnaisse do Sudeste e do Sul (Nova Friburgo e
             Soberbo/RJ, Santo Amaro da Imperatriz/SC); GeoRio (2014), Manual Técnico de Encostas.
     qf      Estéreis de pilhas do Quadrilátero Ferrífero (triaxiais CID/CIU em PDE: φ′ ≈ 28–30°,
             coesão baixa ou nula).
     leps    Leps (1970), resistência de enrocamentos; Hawley & Cunning (2017), Guidelines for
             Mine Waste Dump and Stockpile Design.
     barton  Barton & Choubey (1977): ângulo básico de superfícies lisas não alteradas, 25–35°.
     skempton Skempton (1985): ângulo residual de argilas, 8–25° conforme a fração argila.
     consistencia  Terzaghi & Peck: argila de consistência mole, Su de 12,5 a 25 kPa.
   Sem faixa publicada na fonte, a linha traz só o valor típico (faixa nula).
     geomine Biblioteca anterior do GeoMine (Pinto 2006; Ortigão 2007; GeoRio 2014; Look 2007).
     usual   Massa específica usual da rocha (γ = ρ·g). */
(function(root){
  'use strict';
  const GM=root.GeoMineGeomecInterno; if(!GM) return;
  const FONTES={
    navfac:'NAVFAC DM-7.02 (1986), tab. 1 — solos compactados',
    hoek:'Marinos & Hoek (2000/2001), mi; Hoek (2007), σci por classe de resistência',
    gnaisse:'Ensaios publicados em solos de gnaisse (RJ e SC); GeoRio (2014)',
    qf:'Estéreis de PDE do Quadrilátero Ferrífero (triaxiais CID/CIU)',
    leps:'Leps (1970); Hawley & Cunning (2017)',
    barton:'Barton & Choubey (1977), ângulo básico 25–35°',
    skempton:'Skempton (1985), resistência residual de argilas',
    consistencia:'Terzaghi & Peck: argila mole tem Su de 12,5 a 25 kPa',
    geomine:'Biblioteca anterior do GeoMine (Pinto 2006; Ortigão 2007; GeoRio 2014)'
  };
  const G1='Solos residuais e naturais', G2='Estéril, rejeito e enrocamento', G3='Solos compactados (USCS)', G4='Rochas — maciço (Hoek–Brown)', G5='Descontinuidades e camadas fracas';
  /* mc: γ, c′, φ′ e faixas · hb: γ, σci (MPa) e faixa, mi ± dp · leps: φ0 a 100 kPa e queda por ciclo log */
  const mc=(id,grupo,nome,gama,c,phi,fc,fphi,fonte,nota)=>({id,grupo,nome,modelo:'mc',gama,c,phi,faixa:fc||fphi?{c:fc,phi:fphi}:null,fonte,nota:nota||''});
  const hb=(id,nome,gama,sci,fsci,mi,dp,nota)=>({id,grupo:G4,nome,modelo:'hb',gama,sci,mi,miDp:dp,GSI:50,D:.7,faixa:{sci:fsci},fonte:'hoek',
    nota:(nota?nota+'. ':'')+'GSI 50 e D 0,7 (desmonte controlado) são de partida: ajuste o GSI ao maciço e use D 1,0 em cava com desmonte de produção'});
  const L=[
    mc('residual-maduro',G1,'Solo residual maduro (gnaisse, granito)',18,10,30,[3,25],[27,40],'gnaisse','perde resistência quando satura (ex.: c′ 37→23 kPa e φ′ 33→27° inundado): confira com ensaio inundado'),
    mc('saprolito',G1,'Saprolito / solo residual jovem (gnaisse)',19,15,32,[4,45],[24,39],'gnaisse','herda a xistosidade da rocha: atenção a planos micáceos'),
    mc('coluvio',G1,'Colúvio / tálus',18,8,25,null,null,'geomine'),
    mc('residual-micaceo',G1,'Solo residual micáceo (xisto, filito)',18,10,26,null,null,'gnaisse','valor de partida; a mica derruba o ângulo residual (8–11° medidos em solos de gnaisse micáceo)'),
    mc('canga',G1,'Canga / laterita',22,50,35,null,null,'geomine'),
    mc('areia-fofa',G1,'Areia fofa (natural)',17,0,29,null,null,'geomine'),
    mc('areia-compacta',G1,'Areia compacta (natural)',19.5,0,37,null,null,'geomine'),
    mc('argila-mole',G1,'Argila mole (parâmetros efetivos)',16,5,22,null,null,'geomine','em carregamento rápido use o modelo não drenado (Su)'),
    {id:'argila-mole-su',grupo:G1,nome:'Argila mole (não drenada, Su)',modelo:'su',gama:15.5,su:15,suK:0,faixa:{su:[12.5,25]},fonte:'consistencia',nota:'faixa da consistência mole; meça Su (palheta ou CPTu) e o ganho com a profundidade'},
    mc('esteril-lancado',G2,'Estéril de solo lançado (sem compactação)',17,0,29,[0,0],[28,30],'qf','coesão difícil de garantir em campo: os estudos a tomam baixa ou nula'),
    mc('esteril-compactado',G2,'Estéril compactado (aterro argiloso)',19,15,27,null,null,'geomine'),
    mc('esteril-rocha',G2,'Estéril de rocha desmontada (Mohr–Coulomb)',19,0,37,null,null,'geomine'),
    {id:'esteril-rocha-leps',grupo:G2,nome:'Estéril de rocha / enrocamento (atrito × tensão)',modelo:'leps',gama:19.5,phi0:45,dphi:7,faixa:null,fonte:'leps',nota:'o atrito cai com a tensão normal: pilhas altas pedem esta envoltória'},
    mc('calcario-desmontado',G2,'Calcário / dolomito desmontado (estéril de pedreira)',18.5,0,38,null,null,'geomine'),
    mc('rejeito-arenoso',G2,'Rejeito arenoso',19,0,30,null,null,'geomine','sujeito a liquefação se fofo e saturado: a análise estática não cobre'),
    mc('rejeito-fino',G2,'Rejeito fino / lama',16.5,5,23,null,null,'geomine'),
    mc('gw',G3,'GW — pedregulho bem graduado',21,0,38,[0,0],null,'navfac','tan φ′ > 0,79'),
    mc('gp',G3,'GP — pedregulho mal graduado',20,0,36.5,[0,0],null,'navfac','tan φ′ > 0,74'),
    mc('gm',G3,'GM — pedregulho siltoso',21,0,34,[0,0],null,'navfac','tan φ′ > 0,67'),
    mc('gc',G3,'GC — pedregulho argiloso',20.5,0,31,[0,0],null,'navfac','tan φ′ > 0,60'),
    mc('sw',G3,'SW — areia bem graduada',20,0,38,[0,0],null,'navfac'),
    mc('sp',G3,'SP — areia mal graduada',19,0,36.5,[0,0],null,'navfac'),
    mc('sm',G3,'SM — areia siltosa',19.5,20,34,[20,50],null,'navfac'),
    mc('sm-sc',G3,'SM-SC — areia siltoargilosa',19.5,14,33,[14,50],null,'navfac'),
    mc('sc',G3,'SC — areia argilosa',19.5,11,31,[11,74],null,'navfac'),
    mc('ml',G3,'ML — silte de baixa plasticidade',18.5,9,32,[9,67],null,'navfac'),
    mc('ml-cl',G3,'ML-CL — silte argiloso',18.5,22,32,[22,64],null,'navfac'),
    mc('cl',G3,'CL — argila de baixa plasticidade',18.5,13,28,[13,86],null,'navfac'),
    mc('mh',G3,'MH — silte de alta plasticidade',16.5,20,25,[20,72],null,'navfac'),
    mc('ch',G3,'CH — argila de alta plasticidade',17,11,19,[11,103],null,'navfac'),
    hb('granito','Granito',26,150,[100,300],32,3),
    hb('gnaisse','Gnaisse',26.5,130,[100,300],28,5,'foliado: com a foliação a favor do talude, analise também a ruptura planar'),
    hb('anfibolito','Anfibolito',29,150,[100,250],26,6),
    hb('quartzito','Quartzito',26,180,[100,300],20,3),
    hb('basalto','Basalto',28.5,150,[100,300],25,5),
    hb('diabasio','Diabásio',29,200,[100,300],15,5),
    hb('marmore','Mármore',26.5,100,[50,250],9,3),
    hb('calcario-cristalino','Calcário cristalino',26.5,100,[50,250],12,3),
    hb('calcario-micritico','Calcário micrítico',26,80,[50,250],9,2),
    hb('dolomito','Dolomito',27.5,100,[50,250],9,3,'σci pela mesma classe dos calcários'),
    hb('arenito','Arenito',23.5,90,[50,250],17,4),
    hb('xisto','Xisto',26.5,50,[25,100],12,3,'mi vale para ruptura através da rocha; pela xistosidade a resistência é bem menor'),
    hb('filito','Filito',26.5,60,[50,100],7,3,'mi estimado (entre parênteses na tabela de Hoek); alterado, o filito cai para as classes R1–R3'),
    hb('ardosia','Ardósia',27,90,[50,250],7,4,'σci estimado: a ardósia não aparece nos exemplos das classes de Hoek'),
    hb('folhelho','Folhelho',24,40,[25,100],6,2),
    hb('siltito','Siltito',24.5,35,[25,50],7,2),
    hb('argilito','Argilito',23,30,[25,50],4,2),
    mc('junta-lisa',G5,'Junta lisa em rocha dura (granito, gnaisse, quartzito)',26,0,30,[0,0],[25,35],'barton','superfície limpa e não alterada; a rugosidade (JRC) aumenta o atrito'),
    mc('foliacao',G5,'Foliação ou junta em xisto, filito, ardósia',26,0,25,[0,0],[25,30],'barton','com mica, talco ou clorita pode ficar bem abaixo'),
    mc('argila-residual',G5,'Contato ou falha com argila (resistência residual)',18,0,15,[0,0],[8,25],'skempton','quanto mais argila, menor: perto de 8–12° acima de 50% de fração argila')
  ];
  GM.LITOLOGIAS=L;
  GM.FONTES_LITO=FONTES;
  GM.GRUPOS_LITO=[G1,G2,G3,G4,G5];
  GM.litologia=id=>L.find(x=>x.id===id)||null;
  GM.biblioteca=()=>L;
  const faixaTxt=(f,un)=>f?(f[0]===f[1]?String(f[0]).replace('.',','):String(f[0]).replace('.',',')+'–'+String(f[1]).replace('.',','))+(un==='°'?'':' ')+un:'';
  /* Texto curto da faixa e da fonte, para a nota do card e para a tabela do banco. */
  const v=x=>String(x).replace('.',',');
  /* Valor típico e, quando a fonte publica, a faixa. */
  GM.faixaLitologia=b=>{
    if(!b) return '';
    const f=b.faixa||{};
    if(b.modelo==='mc') return 'φ′ '+(f.phi?faixaTxt(f.phi,'°'):v(b.phi)+'°')+' · c′ '+(f.c?faixaTxt(f.c,'kPa'):v(b.c)+' kPa')+' · γ '+v(b.gama);
    if(b.modelo==='hb') return 'σci '+faixaTxt(f.sci,'MPa')+' · mi '+b.mi+' ± '+b.miDp+' · γ '+v(b.gama);
    if(b.modelo==='leps') return 'φ0 '+v(b.phi0)+'° a 100 kPa, −'+v(b.dphi)+'° por ciclo log · γ '+v(b.gama);
    if(b.modelo==='su') return 'Su '+(f.su?faixaTxt(f.su,'kPa'):v(b.su)+' kPa')+' · γ '+v(b.gama);
    return '';
  };
  GM.fonteLitologia=b=>b?FONTES[b.fonte]||b.fonte:'';
  /* Põe os valores típicos da litologia no material (a cor, o papel e o que não for da litologia ficam). */
  GM.aplicaLitologia=(m,id)=>{
    const b=GM.litologia(id); if(!m||!b) return false;
    /* o papel da camada na seção (pilha, fundação) fica no nome */
    Object.assign(m,{nome:m.papel?m.papel+' — '+b.nome:b.nome, modelo:b.modelo, gama:b.gama, gamaSat:'', ru:0, lito:b.id});
    if(b.modelo==='mc') Object.assign(m,{c:b.c, phi:b.phi});
    else if(b.modelo==='hb') Object.assign(m,{sci:b.sci, mi:b.mi, GSI:b.GSI, D:b.D});
    else if(b.modelo==='leps') Object.assign(m,{phi0:b.phi0, dphi:b.dphi});
    else if(b.modelo==='su') Object.assign(m,{su:b.su, suK:b.suK});
    return true;
  };
})(typeof window!=='undefined'?window:globalThis);

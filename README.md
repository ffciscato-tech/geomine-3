# GeoMine

Código-fonte do GeoMine, o GIS web da CCM publicado em https://geomine-3.web.app/
(projeto Firebase `geomine-3`).

A raiz deste repositório corresponde à versão publicada em 23/11/2026 às 14h34
(horário de Brasília), e a montagem feita a partir daqui reproduz o site byte a
byte:

| Arquivo gerado | SHA-256 |
|---|---|
| `dist/GeoMine.html` | `00431caba283106b24191676991152bc33910f385401f067d7883e461cfe8663` |
| `public/index.html` | `166590e39e81e26cf266d8608606da0b4f958a2ccb23a15b8bcb67f297721afa` |

Os mesmos valores estão em `CURRENT_RELEASE.json` (`distSha256` e
`publishedSha256`), junto com o histórico de publicações e validações.

Esta versão parte da publicada às 15h12 (commit `3d24d76`, vinda da pasta
`GeoMine/atual` do Google Drive) e acrescenta as novas janelas de propriedades
(veja "Janelas de propriedades" abaixo). **A pasta `GeoMine/atual` do Drive
ainda não tem essa mudança**: antes de publicar a partir dela, traga os
arquivos alterados deste repositório, senão a publicação desfaz as janelas
novas.

## Montar

Edite somente arquivos dentro de `src/`. Os HTML de `dist/` e `public/` são
saídas geradas, não entram no git e nunca devem ser alterados à mão.

```bash
python3 -I -X utf8 tools/build.py            # gera dist/GeoMine.html (uso offline)
python3 -I -X utf8 tools/preparar_hosting.py # gera public/index.html (com login Google)
sha256sum dist/GeoMine.html public/index.html
```

## Publicar

```bash
python3 -I -X utf8 tools/publicar_firebase.py --canal previa   # canal de prévia temporário
python3 -I -X utf8 tools/publicar_firebase.py --live           # site no ar
```

`tools/publicar_firebase.py` publica a pasta `public/` pela API do Firebase
Hosting, sem o Firebase CLI, e confere os hashes dos arquivos depois de
publicar. A credencial é a chave JSON de uma conta de serviço do projeto,
informada por `--credencial`, por `GOOGLE_APPLICATION_CREDENTIALS` ou por
`FIREBASE_SERVICE_ACCOUNT`. A chave padrão do projeto (`firebase-adminsdk`)
funciona com este script; com o Firebase CLI ela é recusada por falta de uma
permissão de consulta de serviços.

O workflow `.github/workflows/firebase-hosting.yml` monta e publica
automaticamente a cada push na branch `main`, e gera um canal de prévia em
pull requests. Ele precisa do segredo `FIREBASE_SERVICE_ACCOUNT_GEOMINE_3`
cadastrado no repositório; sem ele, só a montagem roda.

Antes de publicar, confirme que o site no ar ainda corresponde ao
`publishedSha256` de `CURRENT_RELEASE.json`. Se não corresponder, alguém
publicou de outro lugar e este repositório está desatualizado.

## Requisitos permanentes

- **Resolução nativa por padrão.** Todo GeoTIFF importado, ortofoto ou MDT, deve
  abrir já na resolução original, lido por tiles, sem exigir que a pessoa ative
  essa opção. A prévia reduzida só pode aparecer enquanto o original não está
  disponível. Qualquer mudança na importação precisa preservar esse padrão
  (`S.orthoHD` e `S.orthoDispFull` na ortofoto; `demHD` e `dispFull` no MDT).
- **Janelas de propriedades só com controles.** Nas janelas de propriedades da
  ortofoto (`#imgModal`), da camada vetorial (`#lpModal`) e do MDT
  (`#rasModal`), **o nome e o botão Renomear ficam sempre visíveis**, numa
  linha logo abaixo do cabeçalho (o usuário não encontrou o Renomear quando
  ele ficava dentro do painel do **i**; pedido de 14/11/2026: essa opção tem de
  aparecer sempre nas propriedades). O botão **i** do cabeçalho abre só os
  dados de leitura (arquivo, CRS, tamanho, datas), que ficam recolhidos. Os
  textos de cada seção ficam no **i** ao lado do título. Na janela ficam só os
  controles, com botões do tamanho do texto (nada de largura total) e as seções
  pouco usadas recolhidas. Layout aprovado em 12/11/2026 e compactado em
  seguida a pedido: fonte de 12 px, controles de 28 px de altura e espaços
  rentes ao texto. Não voltar a aumentar.
- **Lixeira com grupos.** Na seleção múltipla da árvore de camadas, grupos
  inteiros também podem ser marcados (chave `G:`+id em `S._layerMulti`).
  Excluir um grupo marcado exclui o grupo, os subgrupos e tudo o que está
  dentro, depois de uma confirmação que lista o que será apagado.
- **Caneta sem pressão e "botão direito" na tela.** O botão direito nunca
  depende de pressão (a Apple Pencil USB-C não tem esse sensor). Com dedo ou
  caneta: um toque seleciona, dois toques na camada abrem as propriedades e
  segurar parado por meio segundo vale como botão direito (menu da árvore,
  propriedades da feição no mapa ou concluir o comando em andamento). Para
  quem prefere não esperar, o botão ◨ (ícone de mouse) da barra de baixo arma
  o botão direito: o próximo toque numa feição ou numa linha da árvore vale
  como botão direito, e o botão se desarma sozinho. Com a caneta em contato, a
  palma apoiada na tela não conta como segundo toque nem cancela o "segurar"
  (`touch-workspace.js`; pedido do usuário em 14/11/2026).
- **Desenho à mão livre (mãozinha ao lado do ✓).** Com o modo ligado e uma
  ferramenta de traçado ativa, arrastar a caneta sobre o mapa desenha: o traço
  vira vértices enxutos no mesmo rascunho dos toques ponto a ponto, e o ✓
  conclui como sempre. Vale para linha e polígono do CAD, feição de drenagem
  (com a cota do MDT em cada vértice), régua por pontos (distância 2D/3D ao
  longo do traço) e seleção por polígono (laço: seleciona ao levantar). Regras
  (`modules/cad/freehand-drawing.js`; pedido do usuário em 14/11/2026):
  - a caneta desenha e os dedos movem o mapa; com a caneta em contato, a palma
    não desenha nem move o mapa. Num aparelho em que nunca se usou caneta, um
    dedo desenha e dois dedos navegam; no computador, o botão esquerdo desenha;
  - um toque curto continua criando um vértice; traço que começa na ponta do
    rascunho emenda sem repetir o vértice; o ímã vale na primeira e na última
    ponta; o modo ortogonal não entra no traço nem no fechamento do polígono;
  - desfazer tira o traço inteiro (Ctrl/Alt+Z ou "Desfazer" do menu •••);
  - com o modo ligado, segurar a caneta parada não conclui o comando (ela está
    começando um traço): conclua pelo ✓ ou pelo botão ◨; a caixa de
    comprimento/ângulo do CAD só aparece com o mouse;
  - o Perfil fica de fora: cada vértice dele ganha um rótulo (A, B, C…);
  - o modo começa desligado e fica guardado por aparelho
    (`geomine.maoLivre.v1`). Desligado, nada muda no desenho.
- **Caneta no papel do mouse** (`modules/ui/pen-mouse.js`; pedido do usuário em
  14/11/2026: "fazer todo o papel do mouse com a caneta"). Sem mouse, a caneta
  faz o papel dele e os dedos continuam sendo o toque:
  - arrastar com a caneta não move o mapa (isso é com os dedos), como o botão
    esquerdo do mouse: na seta desenha a caixa de seleção (janela ou
    cruzando), move a feição já selecionada — inclusive pelo interior — e
    arrasta as alças de vértice;
  - nas ferramentas de clique (ponto, linha, polígono, drenagem, régua,
    perfil, informação, área contribuinte, barramento, inundação, lâmina,
    ponto cotado), encostar e arrastar é mirar: as coordenadas, a mira do ímã
    e a prévia do segmento acompanham a ponta, e o ponto entra onde a caneta é
    levantada. O toque curto continua valendo como clique;
  - com a caneta em contato no mapa, a palma não move o mapa nem dá zoom;
  - a caixa de comprimento/ângulo do CAD vai para o canto do mapa quando a
    caneta levanta (com o mouse ela acompanha o cursor);
  - botão direito: segurar meio segundo ou o botão ◨. Com a mão livre ligada,
    o traço tem a vez nas ferramentas que ela atende;
  - vem ligado e fica guardado por aparelho (`geomine.canetaMouse.v1`); o menu
    ••• › "Caneta: voltar a arrastar o mapa" devolve o comportamento antigo.
  O que a caneta não substitui: a roda do mouse (o zoom é com dois dedos ou
  pelos botões de zoom), o botão do meio (mover o mapa é com os dedos) e as
  dicas que aparecem ao passar o mouse.
  Técnica: o Leaflet embutido (1.9.4) recebe a caneta como toque nativo. Só o
  arrasto e a pinça do MAPA (`map.dragging._draggable._onDown` e
  `map.touchZoom._onTouchStart`) passam a ignorá-la, e isso só é aplicado
  quando uma caneta toca o mapa; os marcadores arrastáveis não mudam. Ao
  atualizar o Leaflet, conferir esses dois pontos.
- **Layout: arrastar o mapa dentro da moldura não refaz a folha a cada
  movimento.** O conteúdo já desenhado (grupo `#loMapContent`, dentro do
  recorte da moldura) acompanha o ponteiro na hora, e a folha é refeita uma
  única vez, ao soltar, com fundo e ortofoto na resolução de sempre. Antes,
  cada movimento baixava o fundo de satélite e recortava a ortofoto de novo, e
  com ortofoto grande o gesto travava (relato do usuário em 14/11/2026).
  Moldura, grade, legenda, escala e norte ficam parados durante o gesto e são
  acertados no redesenho. No toque de um dedo, o gesto dentro da moldura é do
  mapa e não da rolagem da folha; dois dedos seguem com o navegador
  (`18-lidar-layout-extensions.js`). Não voltar a chamar `buildLayout()`
  durante o arrasto. Cuidados que não podem ser desfeitos (a primeira versão,
  das 13h27, quebrou o Layout no iPad com ortofoto grande):
  - nenhuma referência à folha é guardada entre um quadro e outro — o grupo é
    sempre lido da tela, senão a folha anterior inteira (ortofoto e fundo)
    fica presa na memória depois de cada arrasto;
  - enquanto o mapa é arrastado, um redesenho em curso é descartado, para a
    folha não ser trocada no meio do gesto (isso interrompe o toque);
  - um novo toque encerra um gesto que tenha ficado sem o seu "soltar".
- **Fundo do Layout que não carrega não derruba a folha nem a saída.** Cada
  tile do fundo tem três tentativas. Se ainda faltar algum (ou o fundo
  inteiro), a folha é desenhada assim mesmo, com o aviso no painel "Fundo do
  Layout" — antes, um único tile perdido impedia o redesenho inteiro: a folha
  não atualizava, a escala não era aplicada e o Copiar falhava. A saída
  (Copiar, PNG, PDF, SVG) leva o que a tela mostra: se a alta resolução do
  fundo não vier inteira, usa a captura da tela quando ela está completa e,
  em último caso, sai com o fundo incompleto e um aviso a cada saída
  (`captureBasemap` e `buildLayout` em `17-layout-printing.js`). Não voltar a
  lançar erro por tile perdido: o usuário ficou sem conseguir copiar a figura
  que estava vendo (14/11/2026).
- **Copiar no iPad com um toque.** No WebKit do iPad/iPhone a gravação na
  área de transferência é iniciada dentro do toque e recebe a imagem por uma
  promessa (`ClipboardItem` com promessa), só em PNG. No caminho antigo a
  primeira gravação era sempre recusada (gerar a figura demora mais que a
  ativação do toque) e era preciso tocar em Copiar de novo. Nos outros
  navegadores segue o blob pronto com PNG+HTML, que é o que o Google Docs
  consegue colar (`copyLayoutIMG`).
- **Dicas dos comandos no toque** (`modules/ui/touch-tips.js`; pedido do
  usuário em 14/11/2026: "não consegui ver o texto flutuante de cada
  comando"). No tablet não existe "passar o mouse". Segurar o dedo ou a caneta
  parados por meio segundo sobre um botão mostra a dica dele — a mesma do
  mouse — e, ao soltar, o comando **não** é executado; o toque normal continua
  executando. Ficam de fora o mapa e as linhas da árvore de camadas (botões
  delas inclusive): ali, segurar já é o botão direito. No modo de toque o CSS
  (`body.gm-touch-ui`) desliga a seleção de texto dos botões para o iPad não
  abrir a lupa por cima da dica. A dica do mouse no desktop não mudou.
- **Engrenagem do Layout com o nome de cada ajuste.** O painel "Ajustes do
  layout" mostra, ao lado do ícone, o nome curto de cada barra ("Texto das
  coordenadas", "Comprimento da escala"…), em duas colunas na tela larga e uma
  na estreita. Os ajustes que não agem no modo atual aparecem apagados: na
  prancha A4/A3, "Largura da figura", "Altura da figura", "Fonte da cartela" e
  "Título da cartela". "Colunas da legenda" só tem efeito quando a legenda tem
  mais de uma coluna. Não voltar ao painel só de ícones: no tablet o nome é a
  única forma de saber o que cada barra faz.
- **Coordenadas do Layout: texto padrão de 1× e faixa justa ao texto.** A faixa
  reservada às coordenadas em cada borda acompanha o tamanho do texto
  (`layoutCoordBand`: altura do texto + 1,8 mm, entre 3 e 21,8 mm). Antes era
  fixa em 8 mm: com o texto padrão sobravam mais de 5 mm em branco entre as
  coordenadas e o limite da margem, e o texto não passava de 6,5 mm. Enquanto
  a barra "Texto das coordenadas" anda, só o texto é trocado; a folha é
  refeita uma única vez, 450 ms depois de a barra parar, para ajustar a faixa.
  O tamanho padrão passou de 0,7× (1,5 mm) para 1× (2,2 mm, o corpo do texto
  da legenda). Projetos e pranchas gravados no padrão antigo passam ao novo ao
  abrir; quem já tinha escolhido outro tamanho continua com o seu. A marca
  `coordV` (em `layout` e em cada prancha, `f.loCoordV`) indica que o tamanho
  foi gravado já com o padrão novo — aí vale o que está gravado, inclusive
  0,7×. Não remover a marca nem voltar à faixa fixa.
- **Só o toque vale como clique nas ferramentas de ponto.** No tablet, o
  reforço de toque de `06-map-tools-snap.js` (drenagem, área contribuinte,
  barramento, lâmina e inundação) convertia qualquer `touchend` em clique:
  mover o mapa com um dedo ou dar zoom com dois deixava um ponto solto no
  traçado. Agora o `touchend` só vale quando o dedo não saiu do lugar (12 px)
  e não houve segundo dedo. Não voltar a aceitar o fim de um arrasto como
  clique.
- **Botão direito na árvore traz a lixeira e os demais símbolos.** Os símbolos
  de ação de cada linha (cadeado, propriedades, remover) ficam à direita e, no
  painel estreito do iPad, saem da área visível. O botão direito — ou o toque
  longo — abre um menu com as mesmas ações, cada uma com o seu símbolo:
  mostrar/ocultar, zoom, congelar, tabela de atributos, copiar e colar estilo,
  propriedades e, por último e em vermelho, **excluir** (lixeira). Vale para
  camada vetorial, superfície/ortofoto e grupo (`treeMenuLayer`,
  `treeMenuRaster` e `treeMenuGroup` em `15-layer-tree-crs-ui.js`). Um item
  novo no menu sempre leva símbolo.
- **Retomada automática: falha de gravação vira aviso, e sobras são limpas.**
  A retomada (`workspace-resume.js`) grava a sessão em blocos no IndexedDB. No
  iPad, com o armazenamento do navegador cheio, o `idbSet` rejeitava com
  `null` e o tratamento do erro quebrava em `e.name`: aparecia a caixa
  vermelha "PROMISE REJEITADA: null is not an object" (caso de 14/11/2026).
  Agora o `idbSet` sempre rejeita com um erro de verdade (e termina quando a
  transação é abortada), e a retomada mostra o motivo ("armazenamento do
  navegador cheio", com o uso no registro de comandos). Na partida, `sweep()`
  apaga os blocos de gravações interrompidas — recarregar a página ou ter a
  aba descartada no meio de uma gravação deixava dezenas de MB sem dono a cada
  vez. Só saem blocos que nenhum ponteiro referencia, desta aba ou de abas já
  fechadas; um bloco sem ponteiro nunca pode ser retomado.
- **Caixa de comandos discreta.** No rodapé, a caixa tem altura automática:
  barra, andamento do carregamento (quando há), as últimas linhas do histórico
  e o campo de comando. Minimizada (botão ▾), mostra só a barra e o andamento
  do carregamento, e continua assim ao carregar arquivos, recarregar a página
  ou abrir projetos. Nada deve forçar uma altura fixa nem reabri-la sozinha
  (`CMD.alt` em `01-bootstrap-crs-state-command.js`; classes `.cmd-auto` e
  `.cmd-min` em `app.css`).

- **Apagar vale para a seleção inteira.** Com duas ou mais feições selecionadas
  (caixa, polígono, ou soma com Shift/Ctrl e "Somar à seleção"), todo caminho de
  apagar remove todas elas: tecla Delete, lixeira da barra do mapa, "Apagar
  seleção" do menu do botão direito, "Excluir feição" do CAD e do editor de
  vetores e "Apagar selecionadas" da caixa de seleção (pedido de 19/11/2026:
  "quando eu selecionar várias feições e apagá-las todas devem ser apagadas").
  Todos passam por `mselDelete()` (`08-selection-and-drawing.js`): nada é
  apagado se alguma camada da seleção estiver congelada, o Ctrl+Z desfaz uma
  camada por vez e, nas camadas de cava/DCE paramétricos, a exclusão de cristas
  e pés fica registrada na receita, para a próxima bancada não trazê-las de
  volta. Com **uma** feição selecionada a lixeira continua só armando a
  borracha (toque na feição para apagar), porque uma feição pode estar
  selecionada sem a pessoa ter clicado nela — ao terminar um desenho ou ao
  reabrir o projeto. Na aba **Cava** a lixeira é outro comando ("Limpar tudo
  da cava/DCE") e não mudou.
- **A lixeira também apaga pedaços de raster.** Pedido de 22/11/2026, print
  IMG_0243 com os pedaços soltos do "DCE 1 — MDT recortado · 0,20" circulados:
  "também devo poder apagar pedaços raster". Com a lixeira armada no Mapa 2D, o
  toque num pedaço — a região conexa de células com valor em volta do ponto (8
  vizinhos) — transforma o pedaço em NoData (`modules/raster/raster-pieces.js`,
  chamado do ramo `del` de `onMapClick`). Regras: (1) **feição primeiro**: o
  toque numa linha, num ponto ou num polígono com preenchimento visível continua
  apagando a feição, e o toque que fica *junto* de uma feição sem acertá-la não
  apaga nada — quem errou a linha por pouco não pode perder um pedaço do MDT;
  se ali embaixo há um pedaço solto, um aviso diz para tocar longe das linhas
  (aproximar o mapa ou ocultar a camada). Polígono sem preenchimento visível não
  bloqueia pelo interior. (2) Vale o raster visível mais alto com célula sob o
  ponto; a folga do dedo (22 px no toque, 10 px no mouse) só serve para pedaço
  solto de raster apagável, para acertar uma lasca de poucos pixels. (3) **Só
  superfícies geradas no GeoMine e guardadas inteiras no projeto** (MDT
  recortado da cava/DCE e demais grades em memória). MDT importado continua
  sendo lido do arquivo original na resolução nativa — apagar células só na
  grade de trabalho deixaria tela, perfil e projeto em desacordo — e é recusado
  com aviso, assim como o TIN. (4) Raster de um pedaço só não sai por aqui (a
  camada é excluída na árvore); pedaço com mais da metade das células é o corpo
  principal e pede confirmação. (5) Ctrl+Z repõe as mesmas cotas (`undoPush` com
  `t:'rasterpiece'`, tratado em `doUndo`); acima de 2 milhões de células o
  pedaço não cabe no desfazer e a pergunta avisa antes. (6) No MDT recortado, o
  volume, as células e a área do corte (`r.src.volumes`, `d.cutVolume` e
  `resultadoCorte` do desenho) acompanham o pedaço apagado e o desfazer; o
  volume do pedaço é medido contra o MDT de origem. (7) O projeto salvo depois
  reabre sem o pedaço. As linhas da Recortada que estiverem sobre o pedaço não
  saem junto: são feições e saem pela seleção ou pela própria lixeira. Testes em
  `raster-pieces.test.cjs`.
- **O que é apagado numa cava/DCE continua apagado.** As camadas que a aba Cava
  gera ("… — Bruta" e "… — Bruta · preenchimento e rampas") são reescritas pelo
  motor a cada publicação, e o salvamento automático publica meio segundo
  depois de qualquer alteração; por isso tudo o que se apagava nelas voltava
  sozinho. Desde 19/11/2026 cada feição publicada leva uma chave estável
  (`_cava2Key`; os anéis são contados de fora para dentro, como o motor faz
  com as bermas editadas, para a chave seguir a mesma crista ou pé quando o
  número de bancadas muda) e `publicaDesenho` (`cava2-workspace.js`) compara a
  camada com o que ela mesma recebeu da última vez: o que saiu entra em
  `apagadas` no registro do desenho (vai para o projeto) e deixa de ser
  redesenhado no Mapa 2D, no Layout e no 3D; o que reapareceu por Ctrl+Z sai da
  lista. O botão **↺ N** da barra de desenhos traz tudo de volta; "Limpar
  desenho" e um limite novo zeram a lista. O motor da aba Cava, os volumes e a
  camada Recortada continuam usando o desenho paramétrico inteiro (a Recortada
  só é refeita quando o desenho ou o MDT mudam).
- **As camadas da cava/DCE já nascem em grupos.** Pedido de 22/11/2026:
  "quando for gerar a Cava, já gera em um grupo, Cava ou PDE, DCE1 bruto e DCE1
  cortado, já em grupos". Cada desenho tem dois subgrupos — "<nome> — Bruta"
  (linhas, preenchimento e rampas, interseção com o MDT) e "<nome> — Recortada"
  (o corte congelado) — dentro do grupo do tipo: **Cava** para cavas, **PDE**
  para pilhas (`CAVA2_GRUPO_RAIZ`, em `cava2-workspace.js`). Um grupo que a
  pessoa já tenha criado com esse nome é aproveitado; se estiver vazio, passa a
  ficar onde as camadas estão. Regras: (1) cada camada é agrupada **uma vez**,
  quando nasce — ou, em projeto anterior, ao abrir, e só se estiver solta na
  raiz. Depois a árvore é de quem usa: camada arrastada para outro lugar não é
  puxada de volta (`d.grupos.feito`, no registro do desenho, que vai para o
  projeto junto com os ids dos grupos). (2) Grupo novo não ganha chave própria
  na pilha: aparece onde as camadas estão, e a ordem de desenho do mapa não
  muda. (3) O **MDT recortado continua junto do MDT de origem**: a ordem da
  árvore é a ordem de desenho, e um raster no alto da árvore cobriria as
  camadas de baixo. (4) A Recortada nova não herda mais o grupo da Bruta; a
  que já existe fica onde estiver a cada novo corte. (5) Excluir o desenho
  leva os subgrupos que ficaram vazios, e o Ctrl+Z os traz de volta com as
  camadas no mesmo lugar; o grupo do tipo fica.
- **Na aba Cava, o MDT ligado na árvore aparece sobre o fundo, e a barra dos
  desenhos é baixa.** Pedido de 22/11/2026 (print IMG_0239: "DIMINUIR" sobre a
  barra "＋ Nova · abas · fundo" e a camada DEM, com o olho ligado, apontada com
  "não aparece aqui"). Eram dois defeitos. (1) O quadro da aba Cava pintava as
  imagens do projeto e **depois** o fundo de satélite, que as cobria: o MDT só
  aparecia com "Sem fundo". Agora o fundo é pintado primeiro
  (`desenhaContexto`, em `cava-pilha-v106.html`) e as superfícies vêm por cima,
  de baixo para cima da árvore, com a opacidade da camada, como no Mapa 2D.
  Quando o fundo é a ortofoto principal do projeto, o que a árvore põe abaixo
  dela continua por baixo (`belowBasemap`, em `contextoDasCamadas`). (2) O
  projeto adia o desenho das camadas ocultas ao abrir, e o MDT de origem fica
  oculto enquanto a variante Recortada está ativa; ao voltar para a Bruta (ou
  excluir a Recortada) só a marca "visível" era religada — olho ligado e nada
  no Mapa 2D nem na aba Cava. `cava2GaranteDesenhoDoRaster` faz o desenho
  adiado e devolve o overlay ao mapa. A barra dos desenhos passou de 45 para
  32 px no toque (34 → 30 px com mouse), a altura da barra de ferramentas logo
  abaixo. Não voltar a pintar o fundo depois das imagens.
- **No desenho recortado, toda ponta de trecho de rampa tem a sua aresta.**
  Print IMG_0276 (23/11/2026), DCE 1 — Recortada na aba Cava: "ainda saindo sem
  essa aresta", apontando o começo de um trecho de rampa no patamar. A ponta em
  que o trecho chega numa berma coincide com a crista (ou o pé) daquele nível e
  o anel fechado já a desenha; a ponta em que ele sai da berma não é borda de
  anel nenhum, e a rampa parecia começar no meio da berma, sem linha. O corte
  agora recebe também essas arestas transversais (`cava2ArestasDeRampa`, em
  `feicoesFechadasParaIntersecao`): uma linha "Rampa" de borda a borda, só nas
  pontas que nenhum anel cobre (sem linha dobrada), cortada pelo MDT como as
  outras. Retorno em gancho não tem quebra de inclinação e fica de fora. Vale
  para pilha e cava; o desenho já recortado só ganha a aresta ao cortar de novo.
- **Interseção apagada: o desenho bruto fica inteiro naquele trecho.** Pedido
  de 22/11/2026, print IMG_0237 com um laço pequeno de interseção circulado
  junto à rampa: "essas pequenas intersecções se eu apagá-las o desenho bruto
  deve ser mantido". Cada linha de contato publicada (camada "Interseção — …" e
  a Recortada) leva a chave `I|…`, e a camada guarda, da última publicação, 24
  pontos e o comprimento de cada linha (`cava2Contatos`). A linha que some vira
  um registro em `contatosApagados` do desenho (vai para o projeto); a que volta
  por Ctrl+Z sai dele. Na prévia a linha casada com um registro não volta. No
  **Cortar**, `GeoMineCavaTerrain.faces` rotula as regiões mantidas e cortadas
  do projeto (a pista conta, inclusive o trecho que sai do anel de fora) e
  `heal` decide: a região cortada vizinha da linha apagada passa a seguir o
  desenho bruto (cristas, pés, rampa e MDT recortado de 0,20 m). **Apagar uma
  interseção nunca retira desenho.** A primeira versão (15h14) retirava a
  "ilha" pequena do lado mantido, e as cristas, pés e bordas de rampa dela
  sumiam do corte — print IMG_0240, "quando cortei essas linhas sumiram".
  Desde as 16h07, quando o lado mantido é uma ilha pequena (menor que a vizinha
  e que 10% de tudo o que fica), nada muda no corte: o desenho ali já é o bruto
  e a linha só deixa de ser desenhada. A medida é sobre a área mantida: com o
  DCE da CSN na cota 315 o laço de 17 mil m² era 77% do que ficava e não pode
  ser tratado como ilha. A linha apagada não é redesenhada nem na prévia nem
  na Recortada. A máscara vai para o `rasterize` e, por uma troca
  temporária de `sampleZbil`, para o corte das cristas e pés. O casamento é
  geométrico (comprimento entre 0,5× e 2× e 80% dos pontos a menos de
  max(0,5 m; ¼ da célula; 2% do comprimento)); linha sem dois lados claros não
  muda o corte, com aviso. Apagar na Recortada registra e avisa para cortar de
  novo (o corte não é refeito sozinho: o raster de 0,20 m e o arquivo .ccmgis
  são pesados). O ↺ conta e traz de volta também as linhas de contato; "Limpar
  desenho" e um limite novo zeram o registro. Sem nada apagado o corte é
  idêntico ao anterior (conferido com a CSN: mesmo volume, mesmas células e
  feições). Testes em `cava2-terrain-contact.test.cjs`.
- **Na aba Cava, a linha selecionada tem um ❄ de cada lado: o lado congelado
  fica totalmente congelado e o outro, totalmente livre. O ângulo do talude
  nunca varia: a única coisa que muda é o tamanho da berma.** Três pedidos de
  22/11/2026. Print IMG_0247: "no momento que eu selecionei uma linha, vão
  aparecer dois botõezinhos, um de cada lado, para escolher qual lado eu quero
  congelar … tudo que estiver daquele lado vai ser movimentado". Depois da primeira versão: "a
  gente tem que partir do princípio sempre que o ângulo de talude não pode
  variar … a única coisa que varia é o tamanho da berma … tem que aparecer a
  opção de congelar os dois lados". Depois da segunda: "quando eu apagar um vértice da
  linha que eu selecionei, as linhas congeladas não podem mudar … alguns
  pontos só se movem em uma direção; eles têm que estar livres. A parte que eu
  selecionei para movimentar tem que estar totalmente livre; a parte que ficou
  congelada, totalmente congelada". Vale para qualquer crista ou pé, da cava e
  do DCE. Regras, em `cava-pilha-v106.html` (`bermaDaLinha`, `planoDoLado`,
  `editaPorSementes`, `fixaAnel`, `alcasDoAnel`): (1) toda linha é borda de
  uma **berma** — a dela, ou, na linha do topo, a que fica depois do talude — e
  os **dois ❄ valem sempre**; o resultado depende só do lado congelado, não de
  qual das duas linhas da berma foi clicada; (2) **❄ de fora**: anda a borda de
  dentro da berma, com tudo o que está por dentro; **❄ de dentro**: anda a
  borda de fora, com tudo o que está por fora e a linha desenhada; (3) a berma
  editada vira uma **junta**: a borda de dentro dela ganha contorno próprio
  (`bermas._travas`, com `S` = `Sin`), e dali para dentro o desenho nasce desse
  contorno, não da linha desenhada. O projeto fica em blocos separados sempre
  por uma berma, nunca por um talude; (4) **mover, apagar (duplo toque) e
  inserir (+) vértice** são feitos na semente do bloco da linha que anda, em
  **qualquer direção**; o lado congelado não é tocado (0,00 m nos testes); (5)
  os outros blocos do lado que anda acompanham por transporte (`campoEntre`),
  e o que o transporte não fechar vai para a largura de uma berma; (6) a linha
  que fica aparece em azul e a que anda em **laranja**, com os vértices e os
  "+" dela; no dedo, pega-se por um vértice ou pela própria linha (vale o
  vértice mais próximo). **Todo canto da linha livre é vértice** (print
  IMG_0254: "ainda tem vértices que não aparecem; têm que aparecer todos eles
  para que eu possa mexer"): o afastamento das linhas cria cantos que não vêm
  de nenhum vértice da linha desenhada, e no contorno da junta cada um ganha
  rótulo próprio (`rotulaJunta`). Com o ❄ de fora a junta nasce já na escolha
  do lado, para todos aparecerem antes do primeiro arrasto; enquanto nada for
  editado ela não muda o desenho, não aparece marcada e some ao soltar o lado.
  **Para o lado de fora vale igual** (print IMG_0256: "veja agora para o lado
  de fora"): com o ❄ de dentro a linha livre é a borda de fora da berma, presa
  pelo talude à linha seguinte para fora; essa linha (o pé do talude) ganha o
  contorno próprio do lado livre (`juntaDoLado`), também já na escolha do lado.
  Os cantos da linha livre que ainda nascem do afastamento, sem vértice próprio
  na semente, são de arrastar e de apagar do mesmo jeito: o movimento do canto
  vira um campo de deslocamento aplicado à semente (`campoDoCanto`, em
  `editaPorSementes`), iterado até o canto parar onde foi solto. Os vértices
  que o gerador repõe nas linhas vêm da semente do bloco (`Eref`), não sempre
  da linha desenhada; cada vértice do contorno tem rótulo único; e o desenho
  gravado da linha congelada não é refeito ao criar a junta (refazê-lo deixava
  a linha livre empurrá-la até 0,5 m). O ↺ fica fora da linha, além do ❄ do
  lado congelado, para não ser tocado no lugar de um vértice. **Pontos da
  rampa e arrasto longo** ("arrume tudo, inclusive os pontos da rampa"): com
  um lado congelado, todo ponto do desenho da linha livre em que ela vira (12°
  ou mais) é de arrastar, inclusive os cantos do entalhe da rampa; quando o
  campo de deslocamento não acha vértice na semente que responda por ele, o
  ponto da parede atrás da rampa ganha um vértice e é ele que anda. O arrasto
  é feito **em etapas** do tamanho de uma berma (`arrastaPorPassos`): a cada
  passo o resto do lado livre acompanha, então a linha não bate na berma
  seguinte antes de ela sair do lugar (um arrasto de 26 m parava a 15 m do
  dedo); o passo que não cabe tenta meio passo e um quarto, e o que não faz o
  vértice avançar é desfeito — o arrasto **vai até onde cabe** em vez de ser
  recusado inteiro, e a barra diz quanto andou e por quê parou. Com o ❄ de
  dentro, o "+" entra também nas linhas de fora, para elas acompanharem por
  inteiro. **As outras linhas do lado livre seguem na mesma proporção**
  (prints IMG_0259 e IMG_0260: "quando estou arrastando para fora … todas as
  linhas que estão para fora devem seguir na mesma proporção"). Com o ❄ de
  dentro, só a linha desenhada (a mais de fora) era deslocada; as linhas entre
  ela e a linha livre são paralelas dela, e o avanço de um canto encolhe a cada
  banco para dentro — num arrasto de 24 m as de fora andavam ~20 m e a berma
  junto da linha livre caía de 8,7 m para 2 m (em 8 de 25 vértices de teste
  chegava a 0,3 m). Dar a todas "o mesmo deslocamento" também espreme (as
  laterais de um canto puxado ficam mais inclinadas: berma de 8 m caindo para
  1,3 m). Agora **cada banco de fora tem o seu contorno** (uma junta em cada
  berma de fora, marcada `segue`, criada na primeira edição) e cada contorno
  acompanha o do banco de dentro **mantendo a distância a ele**
  (`acompanhaParalelo`, usado por `transportaParaFora`): o vértice de fora em
  frente a um vértice de dentro guarda a distância às duas arestas dele, o que
  está em frente a uma aresta gira junto com ela, e onde o de dentro tem um
  vértice que mexeu e o de fora não tem nenhum em frente, o de fora ganha um.
  O talude de cada banco continua exato e as bermas de fora ficam com a
  largura que tinham (8 → 8 m nos vértices comuns do teste); num canto saliente
  as linhas de fora andam um pouco mais que a linha puxada, que é o que as
  mantém paralelas. As linhas de fora acompanham **a cada tentativa do
  cálculo**, e o contorno do banco nunca é empurrado mais que o triplo do que
  a linha respondeu (num bico ou canto do entalhe da rampa o cálculo empurrava
  o contorno 50 m para a linha andar 3,6 m, escondido pelo desenho). Uma edição
  com lado congelado é recusada, com o motivo — e o arrasto para no último
  passo que coube —, quando: um banco deixaria de caber; **o lado congelado
  mudaria** (conferido linha por linha, folga de 0,3 m: a projeção da entrada
  da rampa é reacomodada olhando o projeto inteiro e chegou a redesenhar 10 m
  de uma linha congelada); **um talude ficaria mais íngreme** que o projeto
  (`taludeApertado`: mais de 20 m novos de talude a menos de 60% da largura);
  ou um vértice de contorno que andou ficaria a menos de meia berma da linha
  de fora dele. O arrasto por passos não passa mais pela conferência final de
  "linha fixada atropelada" (as juntas de fora nascem durante a edição e a
  medida de antes não as tinha: o arrasto era desfeito sem motivo e a escolha
  do lado se perdia). A rampa não acompanha o contorno: junto dela o arrasto
  vai menos longe. **Vértice não some** (print
  IMG_0255: "dependendo do movimento os vértices somem"): o gerador conserta
  sozinho uma linha que se dobra sobre si mesma ou passa da vizinha (corta o
  laço, tira o bico, empurra para dentro), e os vértices do trecho cortado
  sumiam, com o contorno gravado ainda dobrado por baixo. Agora o vértice que
  encosta na linha congelada fica gravado onde o desenho o deixou (berma
  mínima de 0,3 m); a edição que ainda assim faria a linha se dobrar ou perder
  vértices é recusada com o motivo; e um contorno que já esteja dobrado é
  saneado ao abrir — o laço sai e o cruzamento vira vértice (`saneiaJunta`);
  (7) uma edição que faria a linha passar por cima da
  vizinha da berma, ou as linhas se cruzarem, é recusada com o motivo; (8) a
  junta aparece em azul fino com "berma ✎", vai com o projeto, com o desfazer e
  com a cadeia de blocos, e o **↺** de qualquer das duas linhas da berma (ou
  R/Delete) devolve a berma ao nominal; (9) sem ❄, num desenho que já tem
  juntas, o arrasto mexe só no bloco daquela linha. A tecla F (trava antiga)
  continua como era. Limites conhecidos: a âncora da rampa de um bloco não
  acompanha o contorno dele; um "+" dentro do entalhe da rampa muda o entalhe.
  Testes em `cava2/cava-lado.test.cjs`.
- **Na aba Cava há um ✓ e uma mãozinha sobre o desenho, como no modo 2D.**
  Pedido de 22/11/2026. O **✓** é o "terminado": fecha o desenho em
  curso (limite ou polígono de seleção) ou encerra a edição da linha (solta a
  seleção e o lado congelado); sem nada em curso, volta para Mover. A
  **mãozinha** move a vista **sem trocar de ferramenta**: a linha selecionada
  e o lado congelado continuam (a ferramenta Mover da barra desmarca tudo).
  No 2D a mãozinha é o desenho à mão livre; na aba Cava ela é o mover a vista,
  que é o que a mão já significa na barra de lá.
- **Na aba Cava, a linha selecionada tem também o ✂, que divide o desenho ali.**
  Pedido de 23/11/2026, print IMG_0278: "ali também deve aparecer mais um botão
  além do congelamento, um botão que servirá para dividir o desenho; se eu
  clicar nele a rampa acaba ali e a partir daquele ponto eu posso continuar o
  desenho com outro ângulo de talude ou direção da rampa". O motor já dividia em
  blocos encadeados (`limiteDeLinhaExistente`, o "⊙ Escolher linha existente"
  do painel); o ✂ é a porta de entrada junto da linha, ao lado do ❄ de fora
  (`botoesDeLado`, `divideNaSelecao`, `podeDividirNaSelecao`). O bloco atual
  passa a terminar na linha, com a rampa dele; a linha vira o limite de um bloco
  novo, que leva as bancadas que faltavam, fica selecionado e tem ângulo, berma
  e rampa próprios ("Início da rampa" marca onde a rampa dele começa). As linhas
  do trecho anterior não se movem. O botão só aparece onde sobra bancada dos
  dois lados (nem na linha desenhada, nem na última) e some enquanto um ❄ está
  aceso, para não ganhar o toque dos vértices da linha livre. Se a continuação
  não fecha a partir daquela linha, a divisão é desfeita com aviso; o desfazer
  junta de novo. A tesoura é desenhada no canvas (o caractere vira emoji no
  iPad). Testes em `cava2/cava-divide.test.cjs`.
- **Na Visão 3D, linha que está acima do terreno aparece nítida, mesmo com a
  superfície translúcida.** Reclamação de 23/11/2026, print IMG_0279: "na visão
  3D aparece que todas as linhas estão abaixo da superfície". O MDT entra com
  80% de opacidade (`style.opacity` 0,8), e superfície com transparência é
  desenhada na passada dos transparentes, depois de todas as linhas; como as
  linhas não gravavam profundidade, a superfície era misturada por cima de
  TODAS — o desenho inteiro parecia enterrado, inclusive a pilha que está acima
  do terreno. Regras: (1) linha opaca grava profundidade (`depthWrite` em
  `screen-lines-3d.js` e nos materiais de linha de `v3BuildVectors`): a que
  está na frente da superfície fica nítida, a que está atrás continua aparecendo
  através dela, e com a superfície a 100% a que está atrás some; linha
  semitransparente não grava; (2) nas vistas laterais, em que as linhas são
  desenhadas por cima (`v3LinhasSempreVisiveis`), elas entram na passada dos
  transparentes, depois da superfície, e o modo é reaplicado quando os vetores
  são refeitos com a câmera ainda na pose lateral (`V3._linhasPorCima`) — antes
  ele se perdia calado na primeira atualização de camada. Não volte as linhas
  para `depthWrite:false` sem trocar a ordem de desenho da superfície. Testes
  em `visualization/screen-lines-3d.test.cjs` e
  `core/parts/3d-linhas-superficie.test.cjs`.
- **A régua mede nos dois modos; na aba Cava a Seção A–A′ fica no botão de
  linha.** Print IMG_0266 (23/11/2026), com a régua da barra de baixo circulada
  e "MEDIÇÃO" escrito à mão: "essa ferramenta de medição aqui no modo cava está
  como perfil, tem que ser medição nos dois modos". Até então a régua e o botão
  de linha armavam a mesma seção. Agora a régua abre na aba Cava o **mesmo
  painel "Régua" do modo 2D**, em "Distância por pontos": os pontos são marcados
  no desenho da cava (o motor os guarda e desenha — ferramenta `medir`,
  `desenhaMedicao`, `encaixeDaMedicao` em `cava-pilha-v106.html`) e o painel
  calcula como sempre: distância horizontal e 3D, cotas, desnível e
  declividade, por trecho e no total. Com "Grudar em vértices e linhas" ligado
  o ponto encaixa nas linhas do projeto e leva a **cota da linha**; solto, usa
  a fonte de cota do painel, que ali começa no MDT de trabalho do desenho. O ↺
  desfaz o último ponto, Esc limpa e mantém a régua armada, o ✕ fecha e devolve
  a aba à seleção; escolher outra ferramenta encerra a régua; a régua armada
  acompanha a troca de aba (2D ↔ Cava) com a medição zerada. A ponte está em
  `cava2-workspace.js` (`abreReguaDaCava`, `recebeMedicaoDaCava`,
  `sincronizaReguaDaCava`), com três ganchos em
  `09-measurement-properties-cad.js` e um em `switchView`.
- **Na aba Cava, a Seção A–A′ (botão de linha) tem de fazer sentido.**
  Print IMG_0245 (22/11/2026), com a régua da barra de baixo circulada e o
  painel "Seção A–A′ · L = 19 m · z: 315 a 405 m · EV 0,04×": "esta seção
  (imagem) não tem sentido — apareceu quando cliquei aqui". O painel desenhava
  só o projeto e incluía sempre a cota de trabalho na faixa vertical; numa
  linha de 19 m no alto de uma pilha de 90 m saía um bloco achatado. Regras, em
  `quadroDaSecao` e `desenhaSecPainel` (`cava-pilha-v106.html`): (1) dois
  perfis — o **projeto**, só onde a linha passa por ele, e o **terreno**, do
  MDT de trabalho —, com aterro (projeto acima) e corte (abaixo) entre eles;
  (2) a faixa de cotas é a dos perfis ao longo da linha; a cota de trabalho só
  entra se estiver perto, senão vira nota no título; (3) a figura **nunca é
  achatada**: sem caber em 1:1, encolhe por igual e fica centrada; o exagero
  vertical só aumenta (inteiro, até 10×); (4) linha curta sobre aterro alto: o
  terreno faria a figura virar uma coluna de poucos pixels, então a faixa fica
  só com o projeto e o terreno vai para o título; (5) o título traz a medida
  da linha — distância, desnível de A para A′ e inclinação — e, cabendo, as
  cotas de cada perfil. Testes em `cava2/cava-secao.test.cjs`. (Na época a
  régua armava esta seção; desde 23/11/2026 quem a arma é o botão de linha.)
- **Raspão: onde o contato deu a superfície como mantida, a linha e o MDT
  recortado ficam.** Print IMG_0244 (22/11/2026, 17h40), com dois trechos
  circulados na chegada da rampa à berma: "ainda não aparece a linha, ela
  continua sendo apagada". Causa: três medidas diferentes do mesmo contato. A
  linha de interseção sai de uma malha de ¾ de célula do MDT (9 m num MDT de
  12,5 m); as cristas, pés e rampas eram cortados ponto a ponto a cada 0,75 m;
  o MDT recortado, a cada 0,20 m. Onde o terreno só raspa por cima do pé de uma
  bancada, o contato não via nada — ou via uma lente de 1 m no meio do trecho —
  e mesmo assim a linha sumia por vários metros e a grade abria um furo, sem
  nenhuma interseção que a pessoa pudesse apagar. Reproduzido com uma faixa de
  terreno de 1 m de largura, 40 cm acima do pé, por 30 m: 28,5 m de pé
  apagados sem interseção por perto; depois da correção, nenhum, e o volume do
  corte não muda. Regras, em `cava2RecortaSuperficieNoMdt` e em
  `cava2-terrain-contact.js`: (1) **o contato manda**: no ponto coberto por uma
  face mantida (`GeoMineCavaTerrain.cover`), a linha fica enquanto o terreno a
  cobrir por até `cava2Raspao(g)` — 10% da célula do MDT, entre 0,30 e 1,25 m —,
  e a célula do MDT recortado também (`rasterize` com `graze`); essa célula não
  soma volume. Bolsão mais fundo continua cortando como antes. (2) **Laço
  pequeno apagado vale pelo próprio polígono** (`heal`): uma lente de 1 ou 2 m
  de largura não cabe na grade de regiões de 1 m, ficava "sem dois lados
  claros" e nada mudava; agora, dentro de um laço fechado pequeno (até 10% do
  mantido, a mesma fração que define uma ilha) vale o projeto. (3) **Arco
  aberto** — o contato de uma lasca costuma sair assim, com as duas pontas
  sobre o pé da bancada — é fechado pela corda entre as pontas. (4) Laço que
  cerca um pedaço **mantido** (ilha) continua sem mexer em nada. (5) Os pedaços
  menores do mesmo bolsão, vizinhos da mesma linha apagada, acompanham o
  principal. Sem nada apagado e sem raspão o corte é o mesmo de antes (CSN,
  cota 350: mesmas feições, mesmo volume, 237 células de 0,20 m a mais na
  borda). Não voltar a cortar linha ou célula por comparação direta com o
  terreno onde a face é mantida. Testes em `cava2-terrain-contact.test.cjs`.
- **Interseção da cava/DCE com o MDT: faixa exata entre os anéis e rampa dentro
  do cálculo.** Pedido de 22/11/2026, com o print da pilha da CSN (Cantagalo):
  "veja se as interseções com a rampa estão bem feitas". Não estavam, por dois
  motivos. (1) A superfície de projeto entre um pé e a crista seguinte era
  montada ligando os dois anéis **pelo comprimento de arco**; junto de cantos
  e dos degraus que a rampa abre nos anéis a faixa torcia e a linha
  "Interseção" ganhava dentes falsos e se partia em pedaços. (2) A rampa não
  entrava no cálculo: a faixa de cada bancada era um talude único do pé à
  crista, e a linha não passava onde as linhas da própria rampa encontram o
  terreno. Desde então `GeoMineCavaTerrain.intersect`
  (`cava2-terrain-contact.js`) triangula exatamente a região entre os dois
  anéis (a malha é só suporte) e tira a cota de uma função da faixa
  (`bandSurface`): razão das distâncias aos dois anéis — a regra que o motor
  usa na seção (`cotaEm`) —, medida pelas retas das arestas nos cantos, para
  as faces seguirem planas até a aresta de encontro. Rampa
  (`cava2RampasParaIntersecao`, `cava2-workspace.js`): dentro da pista vale o
  greide dela; ao lado, o talude conserva o ângulo da face (anel de fora →
  borda de fora, borda de dentro → anel de dentro); o patamar entre dois
  trechos fica na cota da chegada; o começo de um trecho que ainda corre sobre
  a berma também conta. Sem triangulação ou com anéis não aninhados vale a
  faixa antiga. Medido no MDT de Cantagalo (12,5 m) com uma pilha de 8
  bancadas e rampa, contra uma superfície de referência calculada à parte: o
  desvio da linha caiu de 10–12 m (95% dos pontos; máximo 17–25 m) para
  0,3–0,5 m (máximo 2,9 m); das 14 pontas das linhas de rampa cortadas no
  terreno, 12 ficavam a mais de 1 m da interseção (até 22,7 m) e agora todas
  ficam a menos de 0,35 m; o volume do corte passou de +1,0% para +0,2% em
  relação à referência. Não alterar a regra da faixa sem repetir essa
  conferência (`cava2-terrain-contact.test.cjs` tem os casos de resposta
  exata: canto, degrau, rampa em pilha e em cava, patamar, rampa sobre a
  berma).
- **Importar lê os arquivos do Surpac: strings (`.str`) e superfícies
  (`.dtm` + `.str`).** Pedido de 22/11/2026 ("ele deve importar nativamente tb
  arquivos do surpac como strings e dtm"). Vale no ＋ Importar, no
  arrastar-e-soltar e dentro de `.zip`
  (`modules/data-sources/surpac-import.js`, chamado pelo `handleFiles`):
  - **`.str` (ou `.stx`) sozinho vira vetores.** Cada segmento de string é uma
    linha com a cota de cada vértice (`zg`) e os campos `STRING`, `SEGMENTO`,
    `D1`, `D2`… (descrições do Surpac, na posição em que vieram; coluna toda
    vazia não vira campo) e `COTA` (só quando a linha é de nível). String
    fechada continua fechada, como linha — as ferramentas de limite aceitam
    linha fechada. Com 2 a 12 strings a camada já entra colorida por `STRING`,
    como no Surpac. Arquivo inteiro em Z = 0 entra sem cota. Ponto isolado e
    nuvem de pontos gravada como uma string só vão para uma camada de pontos
    com `COTA`.
  - **`.dtm` com o `.str` de mesmo nome vira Superfície TIN**, triângulo por
    triângulo, sem retriangular nem reamostrar (`malhaCriaSuperficieTIN`, o
    mesmo destino das malhas OBJ/PLY/STL). O `.dtm` só guarda a topologia, e
    por isso o par: o `.str` do par não vira também camada de vetores (para
    ter as strings, importe o `.str` sozinho). Uma superfície por objeto do
    Surpac, juntando as trisolations abertas; sólido fechado (`closed=yes`, ou
    faces que se anulam em planta) fica de fora, com aviso — é assunto da
    Geologia ▸ Superfícies / Sólidos Surpac. Sem o `.str` na seleção, o
    GeoMine procura o nome citado no cabeçalho do `.dtm`, depois a pasta de
    trabalho concedida e, por fim, pede o arquivo numa caixa compacta que abre
    o seletor dentro do toque (exigência do iPad). Par trocado é recusado pela
    topologia, sem criar nada.
  - **O Surpac não grava o CRS**: as coordenadas entram no CRS de trabalho,
    como no DXF, e a mensagem diz isso. Dois avisos, sem bloquear: nome de
    arquivo que cita um datum diferente do projeto (os arquivos da CCM trazem
    "sad69" no nome; entre SAD69 e SIRGAS 2000 são dezenas de metros) e
    coordenadas locais (fora da faixa UTM), que o mapa em UTM não consegue
    mostrar — nesse caso a vista do mapa não é levada para o polo. Projeto em
    graus com arquivo em metros é recusado.
  - **Um leitor só.** Os bytes são lidos pelo `GeoMineSurpacReader`
    (`modules/geology/surpac-reader.js`), o mesmo da Geologia e das
    sondagens; a importação geral usa a leitura compacta em vetores tipados
    (`compactSTR`, `compactDTM`, `compactPair`), que não cria um objeto por
    registro. Formato binário conferido em 12 conjuntos reais do Drive da CCM
    contra um leitor independente: no `.str`, cabeçalho e registro de eixo em
    texto, 5 zeros e registros `[nº da string u32][Y f64][X f64][Z f64]
    [descrição NUL]` em big-endian, com um registro nulo no fim de cada
    segmento e `END` no último; no `.dtm`, cabeçalho `nome.str,…`, uma seção
    de strings própria e registros de objeto, trisolation e triângulo (3 nós +
    3 vizinhos), terminando em 8 bytes `0xFF`. **O nó do triângulo é a posição
    do registro no `.str`, contando os terminadores de segmento** — pular os
    terminadores embaralha a malha. A seção de strings do `.dtm` quase sempre
    traz só o `END`, mas o Surpac também grava ali pontos que os triângulos
    não indexam (3 dos 9 pares reais): o leitor antigo recusava esses arquivos
    com "END ausente", inclusive na Geologia. O `.dtm` em texto aceita a linha
    `0, 0.000, 0.000, 0.000, END` depois do cabeçalho.
  - **Linha ou nuvem** (`surpacPareceNuvem`): o arquivo não diz, e ligar uma
    nuvem ponto a ponto dá um novelo. Só vira pontos com prova forte: viradas
    de mais de 120° em ≥ 25% dos vértices **e** trechos que se cruzam (nuvem
    em ordem qualquer), ou ≥ 11 pontos por célula 3D de 4 passos de lado numa
    string espalhada por ≥ 6 células e com < 20% de viradas bruscas (nuvem em
    fileiras: grade, varredura, malha de furos). Na dúvida fica linha, que é o
    erro que se vê e se conserta com Extrair vértices → pontos. Nos arquivos
    reais: curvas e limites têm 0 cruzamento, até 20% de viradas bruscas e 2 a
    5 pontos por célula; nuvens, 40–56% de viradas e mais de 16 pontos por
    célula. Limites conhecidos, que ficam como linha: nuvem em fileiras com
    menos de ~100 pontos e grade regular em planta sobre parede íngreme.
  - **Tamanho.** Leitura de até 256 MB por arquivo e 8 milhões de registros ou
    triângulos; camada vetorial até 2 milhões de pontos (o teto das nuvens
    LiDAR). Medido com pares sintéticos: 2 milhões de triângulos em ~7 s e
    3,9 milhões em ~14 s (a leitura leva 0,1–0,3 s; o resto é o desenho da
    malha, igual ao de qualquer TIN); nuvem de 1 milhão de pontos como
    vetores em ~6 s, com ~0,5 GB de memória — para nuvem grande, o caminho
    leve é o par, como superfície.
  - Testes: `surpac-reader.test.cjs` e `surpac-import.test.cjs`, com arquivos
    sintéticos. **Arquivos reais do Drive não entram no repositório.**
- **GEOTECNIA calcula estabilidade de taludes, e os resultados das seções
  aparecem na aba de vista GEOMEC.** Pedido de 22/11/2026 ("vamos deixar essa
  aba funcional com a maior precisão possível para análise da estabilidade de
  taludes, siga como exemplo o geoslope… crie uma aba para a geomecânica… pode
  chamar a aba de GEOMEC onde a gente consiga ver os resultados gráficos das
  seções"). Na faixa, Talude, Seção Geotécnica, Estabilidade (FS), NA, Análise
  Sísmica e Relatório Geotécnico funcionam; Dreno, a instrumentação e
  Deformação continuam "em breve". A aba GEOMEC fica ao lado de 2D, Cava,
  Visão 3D e Layout, em cards numerados. O que não pode regredir (detalhes e
  conferências na seção **GEOMEC**, mais abaixo):
  - **A seção sai do MDT na resolução nativa**, pelo mesmo caminho do Perfil
    (`gridBruto` + `GeoMineLongitudinalComparison.sample`): passo igual à
    menor célula das superfícies usadas (mínimo de 0,25 m), TIN pelo triângulo.
  - **O fator de segurança não depende de onde caem os pontos da busca nem do
    sentido em que a linha foi traçada.** A busca tem a malha geral de entrada
    e saída **e** janelas em cada par crista–pé do terreno; sem as janelas, a
    ruptura de bancada era achada num alinhamento e pulada no outro (1,05 ×
    0,96 na mesma seção de três bancadas). Não tirar as janelas nem afrouxar o
    teste "talude em bancadas…" de `slope-stability.test.cjs`.
  - **A ruptura crítica é a menor entre todos os portes** (local,
    intermediária, global): os refinos das candidatas concorrem na classe em
    que caíram.
  - **Nenhuma classe de porte some da tabela** quando há superfície válida
    nela (auditoria de 23/11/2026, pilha com c′ = 0: o refino achatava o arco
    até raspar os pés dos bancos, a superfície deixava de valer na análise
    final e o FS global não aparecia). O motor recua do ponto refinado em
    direção à melhor da triagem. Não afrouxar o teste "pilha sem coesão em
    bancadas…" de `slope-stability.test.cjs`.
  - **O cálculo roda em segundo plano** (Web Worker montado com o próprio texto
    do motor): a tela não trava e uma alteração no meio do cálculo o
    interrompe. Sem Worker, calcula na própria página.
  - **O projeto guarda as seções e só o resumo do cálculo** (chave `geomec`);
    os resultados pesados são refeitos ao abrir a aba.
  - **Toda seção cortada no mapa tem sempre a sua camada** na aba Camadas
    ("Seção geotécnica S-01", grupo "Seções geotécnicas"; pedido de 23/11/2026:
    "as seções geomecânicas devem ficar todas como camadas na aba camadas"). A
    camada que falta é criada ao abrir o projeto, ao abrir a aba GEOMEC e a cada
    cálculo; é atualizada a cada cálculo e sai com a seção. Para tirar da lista,
    exclui-se a seção; para só esconder, o olho da camada. Seção paramétrica
    (sem linha no mapa) não tem camada.
  - **Sobrecarga no card 4: início (m) · compr. (m) · carga (kPa)**, com
    rótulo. Início digitado leva a carga inteira (o comprimento não muda) e a
    carga fica sempre dentro da seção; o projeto continua guardando `x1`, `x2`
    e `q` (`GM.defineCarga`, `GM.vistaCarga`). **Sem setas de passo:** as
    duplas ▼ ▲ embaixo dos campos foram pedidas e retiradas no mesmo dia
    (23/11/2026: "pode tirar as setas de rolagem, ficaram ruins"). Não repor
    sem pedido; mover a carga é pelo arrasto na figura ou pelos campos.
  - **Seção primeiro, depois a estabilidade e o NA** (pedido de 22/11/2026, à
    tarde, com o print da faixa: "A seção geotécnica deve vir em primeiro,
    depois estabilidade e o nível de água eu devo poder escolher o pior caso
    para analisar o FS lembrando que a seção deve levar em consideração a
    topografia (vetorial ou mdt) e os perfis do PDE, caso quero analisar a
    estabilidade de um talude que não esta in situ seleciono somente o perfil
    topográfico, buscar em bancos de dados os fatores de angulo de atrito e de
    coesão para diferentes litologias"). Na faixa: Seção Geotécnica,
    Estabilidade (FS), NA, Talude, Dreno.
  - **Em cada card da seção nova escolhe-se primeiro o tipo: imagem ou
    vetorial.** Pedido de 22/11/2026, com o print dos três cards: "a topografia
    tenho que poder escolher se será imagem ou vetorial, se for imagem aparecer
    as opções e vetorial tb, o mesmo vale para a superfície de análise e
    superfícies de contato". Os cards são 1 Topografia, 2 Superfície de análise
    (Nenhuma · Imagem · Vetorial) e 3 Superfícies de contato, iguais e lado a
    lado; as opções só aparecem depois do tipo e só entra o que cruza a linha.
    Ficam de fora camadas 2D gravadas com z = 0 e as camadas de apoio do DCE
    (prévia da interseção, preenchimentos). Os botões Criar e Cancelar ficam ao
    lado do título, para a caixa de comandos não os cobrir.
  - **A prévia da seção nova só mostra o que está escolhido nos cards, e
    raster sem cota não é opção.** Print IMG_0267 (23/11/2026), com a prévia
    mostrando o MDT, uma ortofoto lida como cota (0 a 170 "m") e a DCE com a
    superfície de análise em "Nenhuma": "aqui só aparecer as imagens e
    arquivos selecionados nos cards; ortofoto não tem dado de elevação;
    somente aparecer nos perfis as linhas que a gente tem interesse". A prévia
    desenhava tudo o que cruzava a linha. Agora (`GM.seriesDaPrevia`,
    `geomec-core.js`) entram só a topografia, a superfície de análise e os
    contatos marcados, mais a linha na distância informada; com isso a faixa
    de cotas é a do perfil, e a legenda vai para o canto em que cobre menos
    pontos. E um raster que não mede cota não entra nas listas
    (`GM.rasterSemCota`, além do `GeoMineChannelDEM.isElevation`): ortofoto ou
    mosaico pelo nome, ou imagem de uma banda — todas as células amostradas
    inteiras de 0 a 255 e nome sem MDT/MDE/DEM/cota. Um MDT de cotas inteiras
    com nome de MDT continua valendo. O que ficou de fora é listado numa nota
    ("Sem dado de cota, fora das listas: …").
  - **A seção pega exatamente o que os perfis mostram: nada é prolongado nem
    estimado.** Print IMG_0268 (23/11/2026), com o primeiro talude da pilha
    circulado: "essa parte do perfil está saindo mais inclinada". Uma primeira
    correção (10h31) prolongava a face do talude até o terreno; o usuário
    recusou: "tem que pegar exatamente o que os perfis mostram, não esticar nem
    estimar nada". A superfície da seção é o maior (pilha) ou o menor (cava)
    entre o perfil do projeto e o do terreno; ela era medida só nas estações —
    as do MDT (12,5 m naquele projeto) e os cruzamentos das linhas do desenho —
    e ligada por retas, e onde os perfis trocam de lugar entre duas estações
    essa reta não era nenhum dos dois. Regras, em `GM.encaixaProjetoNoTerreno`
    (`geomec-core.js`): (1) onde o projeto cruza o terreno, o cruzamento é uma
    estação; (2) onde o perfil do projeto começa ou acaba fora do terreno (o
    pé do desenho bruto acima do terreno; na cava, a crista abaixo dele), o
    terreno vai até ali como ele é e o projeto começa ali como ele é — fica o
    **degrau** que os dois perfis mostram (antes saía uma reta de 67° ou 81°
    numa pilha de 34°); (3) onde a **linha da seção acaba dentro do desenho**
    (ponta dentro do contorno de alguma linha dele), o perfil do projeto
    termina no último traço cruzado e depois não há dado da superfície: a
    seção vai só até esse traço (antes caía para o terreno que está por baixo
    do aterro, e o FS saía absurdo — 0,05 num teste). O degrau e o
    encurtamento ficam gravados na seção (`s.degraus`, `s.encurtada`), são
    avisados ao cortar e ficam no ⓘ do card 1 ("Esta seção"), não no corpo
    do card: o texto de origem da seção — comprimento, pontos, passo, fontes,
    degrau — saiu de lá a pedido (23/11/2026, texto circulado: "esse texto não
    precisa"). Não prolongar faces, não supor
    superfície onde o perfil não tem dado.
  - **A sobrecarga é de arrastar na figura da seção.** Print IMG_0269
    (23/11/2026), com a carga de 50 kPa circulada: "essa carga aqui eu devo
    poder arrastar com o mouse, com caneta, para definir o local". O corpo (a
    faixa das setas) leva a carga inteira sem mudar o comprimento; a bolinha
    de cada ponta muda o início ou o fim; nada sai dos limites da seção
    (`GM.arrastaCarga`, `GM.alvo` com `alcasCarga`). Numa carga mais estreita
    que o dedo, o meio continua levando a carga inteira. Os campos "de" e
    "até" do card 4 acompanham durante o arrasto e o cálculo refaz ao soltar.
    Vale para mouse, caneta e dedo (eventos de ponteiro); com o mouse, o
    cursor muda sobre a carga. As alças não aparecem na figura exportada nem
    enquanto se edita o NA ou a superfície à mão.
  - **A seção nova pede 1 Topografia, 2 Projeto e 3 Contatos.** Topografia é
    um MDT/TIN **ou** curvas de nível (qualquer camada de linhas com cota no
    vértice ou em campo COTA/Z/ELEV). Projeto é o desenho do DCE/cava (as
    linhas "— Bruta"), um PDE importado com cota ou um MDT do projeto; pilha =
    maior entre projeto e topografia, com a topografia virando o contato
    pilha/fundação; cava = o menor dos dois. "Nenhum" deixa só a topografia
    (talude natural). Os cruzamentos das linhas com cota entram como estações,
    para crista e pé ficarem exatos.
  - **Água com condição de cálculo e pior caso**: NA desenhado, seco, NA
    crítico (o desenhado elevado de Δ, sem passar do terreno), saturado (NA no
    terreno) e "pior caso entre as marcadas", que calcula cada condição e
    fica com o menor FS, mostrando a tabela. FS mínimo por condição (1,50
    normal; 1,30 crítico e saturado, como na NBR 13029:2017 para pilhas) e o
    botão "NA no contato pilha/fundação".
  - **Banco de litologias com faixa e fonte em cada linha** (`geomec-litologias.js`):
    não colocar valor sem fonte; onde a fonte só dá o típico, a linha não tem
    faixa.
- **Opacidade do preenchimento em 0% é transparente.** Pedido de 21/11/2026,
  com o print de um polígono laranja opaco e a barra "Opacidade do
  preenchimento" em 0%. O polígono sem preenchimento visível — hachura
  "nenhuma" ou cor sólida com 0% — é criado com `fill:false`, para o interior
  não capturar cliques; nesse caso o Leaflet não escreve `fill-opacity`, e
  `applyHatch` (`05-layer-model-symbology.js`) recolocava a cor sólida, que
  saía 100% opaca. `applyHatch` usa agora o mesmo teste do desenho e da
  seleção (`polygonFillVisible`): sem preenchimento visível fica só o
  contorno. A amostra da camada e das classes na árvore (`swatchCSS`) e o
  quadrinho da legenda do Layout (`legendPolyHollow`, em
  `17-layout-printing.js`) seguem a mesma regra: 0% é vazado, com a cor do
  contorno. Não mudou: hachura de padrão com 0% continua desenhando o padrão,
  e a legenda continua usando 70% para as cores sólidas com preenchimento.
- **Hachura com espaçamento, espessura do traço e direção.** Pedido de
  21/11/2026 ("aqui também deve ter a função de editar a espessura da linha,
  além do espaçamento, e a direção em graus; pode ser com barras de
  arrastar"). O estilo do polígono tem, ao lado de `hatchScale`
  (espaçamento), `hatchWeight` (multiplicador do traço, 0,25–8×, padrão 1) e
  `hatchAngle` (graus no sentido anti-horário, 0–180, padrão 0). Valem na
  camada (`sym`), na classe e na feição, e vão no projeto com a simbologia.
  Limites e desenho ficam num só lugar, em `05-layer-model-symbology.js`:
  `hatchWeightOf`, `hatchAngleOf`, `hatchVariantKey` (sufixo do identificador
  do padrão, vazio nos valores padrão — projeto antigo desenha igual),
  `hatchRotateAttr` e `hatchBodyAtSpacing(padrão, cor, espaçamento,
  espessura)`. O mapa (`applyHatch`), o Layout e a legenda (`layoutHatch`) e
  a prévia do "Estilo da feição" usam essas mesmas rotinas; o giro é um
  `patternTransform`, então vale para qualquer padrão, inclusive as
  litologias. Na janela de propriedades e no "Estilo da feição" os três
  ajustes são barras de arrastar com o número ao lado (`GeoMineStyleSliders`
  passou a aceitar barras com unidade: × e °). A amostra da camada na árvore
  continua indicando só que há hachura (listra fixa), sem a direção.
- **Escolha visual da hachura compacta.** Pedido de 22/11/2026 ("esses ícones
  podem ser menores também"). Em `alagislithologyvisualpickerstyles.css` os
  cartões têm cerca de 30 px de altura, com amostra de 30×22 (eram 53 px e
  50×39), e a janela tem 480 px: os 32 padrões cabem sem rolar no iPad. A
  amostra é desenhada maior e reduzida no `::before` — à metade em tela de
  alta densidade, a 75% nas demais, onde meio pixel some — para o padrão
  continuar reconhecível. No script, as opções soltas (Sólido, Sem
  preenchimento) ficam num grupo só, "Sem hachura", em vez de um título
  repetido para cada uma; as amostras de Diagonal ╱ e ╲ deixaram de sair em
  branco (o rótulo usa ╱ e ╲, não / e \); e a janela nunca passa da borda de
  baixo da tela. O botão da hachura nas janelas de estilo passou de 50 para
  38 px.
- **Cards numerados.** Desde 18/11/2026 as ferramentas do GeoMine são
  apresentadas em cards numerados, na ordem em que a pessoa trabalha (pedido
  de 19/11/2026: o que for criado ou reorganizado segue esse padrão). Um card é
  `<section class="gm-work-card">` com o cabeçalho `.gm-card-heading` (número
  em `.gm-card-step`, título em `<b>` e a ajuda no **ⓘ**,
  `details.gm-card-info`). `src/modules/ui/panel-cards.js` numera em sequência
  só os cards visíveis de cada janela, então um card escondido não deixa
  buraco na numeração. Painéis com cards escritos à mão (bacia, escada
  hidráulica e estrada) ficam fora da divisão automática desse módulo.
- **Textos explicativos ficam no ⓘ do card.** Pedido de 19/11/2026, sobre a
  janela do Perfil Longitudinal: "esses textos podem ficar escondidos no botão
  i". Nos cards montados automaticamente (`panel-cards.js`) as dicas estáticas
  — `.hint` sem `id`, sem controles, fora de resultados (`.hout`) e de blocos
  `<details>` — ficam ocultas, e o ⓘ do cabeçalho mostra uma cópia delas,
  agrupadas pelo nome do campo escrito em `data-gm-help` na própria dica (o
  nome não é deduzido do rótulo vizinho: a dedução erra quando a dica fecha um
  grupo inteiro de campos). Nada é movido: a dica original continua no lugar,
  com a classe `gm-card-help-text` e oculta por CSS, de modo que o módulo dono
  segue mostrando, escondendo e reescrevendo o que é dele, e a cópia
  acompanha — as dicas do modo raster somem no modo vetorial, as do resultado
  só existem depois de gerar, e sem nenhuma dica aplicável o ⓘ não aparece.
  Avisos de estado e resultados (com `id` ou dentro de `.hout`) nunca são
  escondidos. Texto gerado por código entra na regra recebendo a classe
  `gm-card-help-text` na origem (as duas listas de fontes do perfil, em
  `25-geoprocessing-tin.js`). A regra está ligada só no painel de perfis
  (`helpHosts='#sidePerfis'`: Perfil Longitudinal, Perfil Transversal, Seções
  Transversais e Estabilidade de talude). Para ligar em outra ferramenta,
  acrescente o seletor e confira os textos um a um.
- **O menu de texto do aparelho nunca fica por cima dos comandos do GeoMine.**
  Pedido de 19/11/2026, com o print do iPad mostrando "Colar / Selecionar /
  Selecionar Tudo / Ferramentas de Escrita / Formatar" sobre o menu da feição.
  O iPad monta esse menu a partir do cursor de texto ou da seleção que estiver
  viva na página; ele não depende do evento `contextmenu`, então cancelar o
  evento não basta. A causa encontrada foi um cursor esquecido numa célula da
  tabela de atributos (`td contenteditable`, o único conteúdo editável do
  aplicativo): `clearNativeEditing` só removia seleção não colapsada, e o
  cursor é justamente uma seleção colapsada; o WebKit conserva o cursor de um
  `contenteditable` quando o clique seguinte cai em área sem seleção de texto
  (o mapa); e a tabela fechada continua na página, com altura zero. Regras,
  em `installNativeContextGuard` (`src/modules/ui/touch-workspace.js`) e em
  `13-attribute-table.js`: (1) todo clique secundário fora de um campo de
  texto — botão direito, `contextmenu` do iPad, toque longo — encerra a edição
  que ficou em outro lugar: tira o foco do campo e remove cursor e seleção,
  em qualquer ponto da tela e também da aba Cava para a página de fora; (2) um
  campo que perde o foco de verdade não deixa cursor para trás (com a janela
  em segundo plano o cursor espera a volta); (3) fechar a tabela de atributos
  por qualquer caminho grava a célula e solta o cursor. Dentro de um campo de
  texto o menu do aparelho continua valendo — é por ele que se cola um valor
  no iPad — e o texto selecionado no histórico de comandos continua
  selecionado ao receber o clique direito. Não mude um menu do GeoMine para
  `contenteditable="false"` esperando resolver isto: o menu do aparelho vem do
  cursor que ficou em outro elemento, não do menu clicado. Este comportamento
  só existe no WebKit do iPad; fora dele o que se testa é o estado que o
  provoca (elemento focado e seleção do documento com o menu do GeoMine
  aberto). O mecanismo foi conferido no código-fonte do WebKit:
  `clearSelectionIfNeeded` (`FocusController.cpp`) não limpa a seleção de um
  `contenteditable` quando o foco muda depois de um clique;
  `prepareSelectionForContextMenuWithLocationInView` (`WebPageIOS.mm`) sempre
  manda apresentar o menu no clique secundário e no toque longo, sem mexer na
  seleção quando o ponto está em área `user-select:none`; e
  `canPerformActionForWebView` (`WKContentViewInteraction.mm`) só habilita
  Colar, Selecionar, Selecionar Tudo e Formatar com cursor ou seleção viva —
  sem eles o menu não tem o que mostrar.

## Organização

| Caminho | Conteúdo |
|---|---|
| `src/index.template.html` | Estrutura do documento |
| `src/module-order.json` | Contrato e ordem de montagem |
| `src/core/parts/` | Núcleo legado dividido em partes ordenadas |
| `src/modules/` | Recursos por domínio (blasting, cad, environmental, mining, raster, ui...) |
| `src/styles/`, `src/assets/`, `src/vendor/`, `src/services/` | Estilos, imagens, bibliotecas embarcadas e serviços auxiliares |
| `tools/` | `build.py`, `preparar_hosting.py`, `publicar_firebase.py` e utilitários |
| `web/` | Portão de login (`gate.template.html`), configuração do Firebase e logotipos |
| `public/` | Licenças servidas junto com o site; `index.html` é gerado |
| `validation/` | Relatórios e testes das validações de cada entrega |
| `firestore.rules`, `firestore.indexes.json`, `storage.rules` | Regras da colaboração em nuvem |
| `docs/` | Notas técnicas por funcionalidade |
| `reference/HASHES.sha256` | Hashes de proveniência da versão-base histórica |

## Projeto sempre na versão mais recente

Quem atualiza um projeto por fora do GeoMine (por exemplo o Claude, pelo
conector do Google Drive) só consegue **criar um arquivo novo** na pasta, não
sobrescrever o original. Por isso, para um projeto aberto pelo comando
**Abrir do Google Drive**, o GeoMine procura na mesma pasta do Drive o arquivo
`.ccmgis` mais recente com o **mesmo `projectId`** e abre esse arquivo:

- ao recarregar a página, sozinho, enquanto a sessão do Drive estiver válida
  (cerca de 50 minutos depois da última autorização);
- ao tocar em **↻** ao lado do nome do projeto, sempre.

Edições locais não salvas nunca são substituídas: o GeoMine mantém o que está
no aparelho e avisa que há versão mais nova. Um arquivo escolhido à mão no
seletor é aberto como pedido, com um aviso se a pasta tiver versão mais nova.

Regras para quem grava a versão nova: salve na **mesma pasta** do arquivo que
está aberto e **preserve o `projectId`** do projeto (ele fica no começo do
JSON). O nome do arquivo é livre.

### Entrega pelo banco do GeoMine (não depende do Drive)

No iPad o projeto costuma ser aberto pelo seletor de arquivos, e um arquivo
escolhido assim é uma cópia: o navegador não tem como enxergar o Drive ao
recarregar. Por isso, quem altera um projeto por fora **também entrega a versão
nova pelo Firestore do GeoMine** (escolha do usuário em 14/11/2026):

    python3 -I -X utf8 tools/enviar_atualizacao_projeto.py --credencial CHAVE.json \
        --projeto Projeto_alterado.ccmgis --email <conta do dono> \
        --nota "o que foi alterado, em uma frase" --live

- O GeoMine aberto com a conta do dono confere o banco ao carregar a página, ao
  voltar para a aba e a cada minuto (`src/modules/persistence/project-updates.js`;
  leitura em `web/gate.template.html`, métodos `projectUpdateHead` e
  `projectUpdatePart`). Há também o comando **Carregar atualização do projeto**
  na busca de comandos.
- Só vale para o projeto que está aberto e tem o **mesmo `projectId`**.
- Só é oferecida a atualização enviada **depois** do conteúdo carregado (data
  do arquivo aberto, do último Salvar ou da última atualização aplicada).
- Sem alterações não salvas no aparelho, carrega sozinha e avisa. Com
  alterações não salvas, **pergunta antes**: carregar substitui o projeto
  inteiro, e o que foi feito só no aparelho se perderia.
- Coleção `projectUpdates/{sha256("e-mail\nprojectId")}` com as partes em
  `parts/` (projeto em ZIP, até 700 KB por parte). Só o dono lê; ninguém grava
  pelo navegador (`firestore.rules`). Cada envio substitui o anterior.
- O arquivo novo no Drive continua sendo criado: é o registro durável, e o que
  os colegas abrem. O e-mail do dono nunca é gravado no repositório nem em logs.
- Regras do Firestore: `tools/publicar_regras_firestore.py` (compara, publica
  e permite voltar). Antes de publicar, teste no emulador local
  (`firebase emulators:start --only firestore --project demo-geomine`, envie um
  projeto com `--emulador http://127.0.0.1:8085` e rode
  `node validation/regras-firestore-atualizacoes.emulador.cjs`).

O código está em `src/modules/persistence/drive-project-source.js` (`latest`)
e `project-tab-session.js` (`reopen`). A leitura da pasta usa o escopo
`drive.readonly`, pedido em `web/gate.template.html`; sem ele o GeoMine
continua abrindo só o arquivo vinculado.

## Área contribuinte no ponto (Hidro)

O comando **Área Contribuinte** (faixa Hidrologia, também aberto pelo ícone de
mancha de inundação) delimita toda a área que drena até um exutório marcado no
mapa, sobre uma linha de fluxo ou em qualquer ponto do MDT.

- **Sempre o TIFF nativo.** O cálculo usa só as cotas e o georreferenciamento
  do `.tif` do MDT, célula por célula: nenhuma grade reduzida, média de cotas
  ou arredondamento entra no resultado. A grade guardada no projeto serve para
  desenhar o mapa, nunca para medir. Não existe método alternativo no painel.
  Se o TIFF inteiro cabe na memória, é roteado de uma vez (`routeGrid` e
  `analyzeRouted`: direção e acumulação de fluxo D8, reaproveitadas nos pontos
  seguintes); senão, usa a janela que cresce a montante (`analyze`).
- **Sem o `.tif` aberto na sessão a ferramenta não calcula.** Explica o motivo
  e oferece **Localizar MDT original**, que abre o seletor de arquivo daquele
  MDT e reabre o painel depois de vincular.
- **Religar o `.tif` original não pode recusar o arquivo certo.** A grade
  guardada no projeto não reproduz a do TIFF ao mícron (a altura da célula
  deixava de ser gravada quando diferia da largura em até 0,1 mm). Em
  `rasterVerifyLegacyPreview`, diferença de extensão de até uma célula da
  prévia é a mesma área; quem prova a identidade é a conferência das cotas.
  Quando essa prova não pode rodar (prévia amostrada, caso do iPad), vale o
  tamanho em bytes gravado no projeto ou, sem ele, a confirmação da pessoa.
  Outra área ou outro CRS continuam recusados, com a diferença em metros na
  mensagem. Teste: `node validation/legacy-preview-verification.test.cjs`.
- **Quem escolhe um `.tif` compatível não pode ficar sem MDT (requisito
  permanente).** Três situações faziam `religaFonte` recusar o arquivo com um
  aviso de segundos, e o Hidro continuava dizendo que o MDT "não está aberto":
  o arquivo não era o mesmo gravado no projeto (há MDTs de mesmo nome e
  resoluções diferentes no Drive); o tamanho em bytes diferia do gravado; ou o
  projeto tinha sido regravado depois do último vínculo. Agora, nesses casos,
  o arquivo passa pela conferência de CRS e área
  (`rasterVerifyLegacyPreview` com `otherFile`) e a pessoa responde a uma
  pergunta que mostra os dois tamanhos e resoluções. Aceitando, o arquivo vira
  o original da camada (`srcDims` passa a ser o dele) e o Hidro o reconhece;
  recusando, nada muda. Nada é vinculado em silêncio. Toda recusa fica em
  `r._recusaOriginal` (não é gravada no projeto) e aparece escrita na janela
  do MDT e no painel da área contribuinte. Teste:
  `node validation/mdt-native-relink.test.cjs`.
- **MDT carregado pela pessoa é o nativo; diferença vira pergunta, nunca
  recusa (requisito permanente, 13/11/2026).** O `.tif` que a pessoa escolhe
  para uma camada de MDT é tratado como o nativo dela. Se ele difere da
  superfície gravada no projeto (outra área, outro CRS, outras cotas, outras
  dimensões), `religaFonte` mostra a diferença com as duas resoluções lado a
  lado e pergunta "Quer continuar?" (`substitui`). Continuando, a grade da
  camada é trocada pela do arquivo, como numa importação (`trocaGrade`): nome
  e estilo ficam, e mapa, cotas e Hidro passam a usar o arquivo. Só não
  vincula quando a pessoa responde que não, ou quando o arquivo não é um MDT
  (imagem de várias bandas, sem georreferência, ilegível) — e o motivo fica
  escrito em `r._recusaOriginal`. O programa não pode dizer que "não há MDT
  nativo" depois de a pessoa ter carregado um.
- **Mesmo terreno vincula sem pergunta.** Quando o projeto não guardou a
  identidade do arquivo (projeto convertido do QGIS, prévia feita de outra
  resolução, cópia com outro tamanho), `rasterVerifyLegacyPreview` devolve
  `terrain()`: lê do TIFF só as janelas que cobrem 36 células da prévia e
  compara as cotas. Mesma área, mesmo CRS e diferença mediana de até 1 m (80 %
  dos pontos a até 3 m): o arquivo é vinculado direto, mantendo a prévia, sem
  reler o arquivo inteiro. Cotas diferentes: é outro MDT, e vale a pergunta do
  item anterior. Sem amostras suficientes: pergunta simples com as duas
  resoluções.
- **Autorização do Drive no iPad (`driveAccess` em `web/gate.template.html`).**
  A janela do Google abre em outra guia e o iPad põe o GeoMine em espera; as
  duas tarefas de rede que o SDK fazia depois de abrir a janela estouravam o
  tempo (`auth/network-request-failed`, seguido da asserção "Pending promise
  was never set"). `aqueceJanelaGoogle` faz essas tarefas antes (2,5 s depois
  do login e a cada falha) e apaga a conferência de origem que falhou, que o
  SDK guardava e repetia. As falhas chegam com mensagem em português e não
  contam como recusa da permissão de leitura. Não dá para testar fora do site
  oficial: confirmar no iPad a cada mudança aqui.
- **Reamostragem por escolha na área contribuinte (pedido do usuário,
  13/11/2026).** O painel tem o interruptor "Reamostrar o MDT para o cálculo"
  (padrão `.gmp-sw`) e a lista de células (fatores inteiros da célula nativa).
  Desligado, vale a regra de sempre: cotas do TIFF nativo. Ligado, o cálculo
  usa `coarsen(native,fator)` (média das cotas) e, cabendo na memória, a
  direção e a acumulação D8 da grade inteira, guardadas para os pontos
  seguintes. O resultado e o atributo `METODO` dizem "REAMOSTRADO por
  escolha". A escolha fica em `geomine.hidro.reamostragem.v1`. `coarsen` lê o
  TIFF em pedaços de até 2.048 colunas: janelas largas estouravam o limite de
  32 MiB do leitor no iPad. O raio de busca do talvegue é o da versão que
  funcionou em 12/11 (dedo, 3 células, 3 m com linha; até 40 m): uma redução
  para 8 m junto à linha foi publicada às 09h34 e desfeita a pedido do
  usuário. Não mexer nessa regra sem um caso reproduzido. Teste de referência (terreno sintético de 0,25 m,
  ponto no talvegue): 64,0 ha na grade de 0,5 m e 66,0 ha na de 1 m.
- **D8 já calculado como base da área contribuinte (pedido do usuário,
  13/11/2026).** Quando o Hidro tem direção de fluxo nesta sessão
  (`S.hidro.dem.dir`, ou a grade de origem de uma acumulação, `_d8Source`), o
  campo "MDT" do painel ganha o grupo "D8 já calculado (sem reler o MDT)".
  Escolhido, `clickD8` converte os receptores com
  `GeoMineContinuousCatchment.routeReceivers` e delimita por
  `analyzeRouted`: mesmo snap, mesmo raio de busca do talvegue e mesmo
  contorno, sem ler nenhuma cota. A direção do Hidro não é gravada no projeto:
  depois de recarregar a página é preciso gerá-la de novo para a opção
  aparecer. Com MDT bruto as depressões são sumidouros e a bacia sai cortada
  (o painel avisa). Referência no terreno sintético de 1 m: 56,16 ha pelo D8
  preenchido contra 56,13 ha pelo MDT.
- **As setas do D8 não participam do snap.** A camada "Direção de fluxo D8 —
  setas" é uma amostra da grade espalhada pelo mapa e tem "fluxo" no nome:
  roubava o ponto da linha de fluxo de verdade (`isArrows`/`snapLines` em
  `point-catchment.js`).
- **Ctrl+Z desfaz a área contribuinte.** Cada bacia gerada entra na pilha de
  desfazer (`catchmentresult`, tratado por `GeoMinePointCatchment.undo`); antes
  o atalho pulava a bacia e desfazia uma ação mais antiga. O atalho vale como
  Ctrl+Z, Cmd+Z e Alt+Z (`gmUndoShortcut`, que usa a tecla física quando o
  teclado do iPad entrega "Ω"), e só é deixado para o campo quando o foco está
  num campo de digitação — interruptores e botões não engolem o atalho.
- **Salvar grava direto no Google Drive quando não há seletor de arquivos.**
  Definido pelo usuário em 14/11/2026: no iPad, Salvar grava sozinho EM CIMA
  do arquivo que estava aberto, sem download, e Salvar Como mostra todas as
  pastas do Drive (`drive-project-save.js`, chamado por
  `alagis-130-gravacao-por-partes.js`).
  - O original é o arquivo vinculado à aba (projeto aberto pelo Drive) ou, para
    projeto aberto pelo seletor do aparelho, o arquivo de mesmo nome e mesmo
    `projectId` no Drive; com cópias iguais vale a de mesmo tamanho, e só se a
    dúvida persistir a pessoa escolhe. Depois do primeiro Salvar o vínculo fica
    guardado na aba.
  - A gravação usa a permissão ampla do Drive (`driveAccess(true,{write:true})`
    no portão), escolhida pelo usuário para dispensar a indicação do arquivo.
    A janela do Google reaparece quando a autorização de 55 minutos vence. No
    iPad, o usuário relatou (14/11/2026) que essa janela falhava no Safari e
    funciona bem no Chrome.
  - **O acesso ao Drive vale para o aparelho, não só para a aba** (22/11/2026:
    "quando vou salvar um projeto ele abre outra janela"). O acesso ficava
    guardado só na aba (`sessionStorage`). O iPad descarta a aba do GeoMine
    quando falta memória e essa guarda pode ir junto: o projeto voltava da
    cópia local e o Salvar seguinte abria de novo a janela do Google, mesmo
    minutos depois de autorizar; abrir o GeoMine em outra aba fazia o mesmo,
    sempre.
    Agora o acesso fica também no `localStorage` (`geomine.drive.access.v2`,
    `driveGuardado` no portão), pelo mesmo prazo de 55 minutos, e qualquer aba
    da mesma conta o aproveita. Sair da conta, trocar de conta ou o Google
    recusar o acesso (HTTP 401) apaga-o em todos os lugares. Continuam abrindo
    a janela do Google, porque o limite é dele: a primeira gravação de cada
    aparelho (pede a permissão de gravar) e toda operação no Drive feita mais
    de 55 minutos depois da última autorização — inclusive o primeiro Salvar
    depois de recarregar a página com a autorização vencida.
  - **Uma autorização serve para abrir e salvar** (pedido do usuário em
    14/11/2026: "não precisa abrir uma aba do Firebase quando clico em
    salvar"). O acesso de leitura obtido ao abrir não servia para gravar, e o
    primeiro Salvar abria a aba de autorização outra vez. Quem já autorizou a
    gravação neste aparelho (`geomine.drive.gravacao.v1` no `localStorage`,
    por conta) passa a recebê-la em toda autorização do Drive; quem nunca
    salvou continua sendo perguntado só pela leitura. Se o Google recusar a
    gravação pedida junto, a marca sai e a tentativa seguinte pede só a
    leitura. Limite que não depende do GeoMine: o Google só deixa um acesso
    valer por uma hora, e renová-lo sem janela exigiria guardar no servidor
    uma autorização permanente do Drive (não existe hoje).
  - Envio retomável em partes de 8 MB, com andamento, nova tentativa em queda
    de rede e conferência do tamanho gravado. Se o arquivo foi alterado no
    Drive depois da versão aberta, pergunta antes de gravar por cima.
  - **Salvar Como usa uma janela do próprio GeoMine**
    (`drive-folder-browser.js`), não o seletor de pastas do Google. O seletor
    do Google abria grande, atrás das barras do GeoMine, e listava todas as
    pastas do Drive misturadas (pedido do usuário em 14/11/2026: "mais bonita
    e funcional"). A janela é compacta, abre na pasta do projeto, mostra o
    caminho, navega por Meu Drive e pelos drives compartilhados, busca pasta
    pelo nome, cria pasta, lista os projetos que já existem ali e pede o nome
    do arquivo no mesmo lugar. O seletor de arquivos do Google continua só no
    Abrir do Google Drive, agora acima das barras (`.picker-dialog` em
    `app.css`).
  - **Salvar nunca vira download** (reforçado pelo usuário em 14/11/2026:
    "como no Word, no AutoCAD, no QGIS"). Se o Drive falhar, o Salvar avisa o
    motivo e as alterações continuam em tela; a única saída por download é o
    comando explícito **Baixar cópia do projeto**, na busca de comandos.
  - Projeto novo (que não veio de um arquivo): o primeiro Salvar pede a pasta
    do Drive e o nome; os seguintes gravam nesse arquivo.
  - Nada de perguntas no caminho: o Salvar no Drive não pede "pasta de
    projeto" para os rasters. **A janela "Resolução das superfícies ao salvar"
    só aparece quando precisa** (22/11/2026; regra do usuário: superfícies
    sempre na resolução nativa). Antes ela abria no primeiro Salvar de todo
    projeto acima de 60 MB no tablet (180 MB no computador) e em todo Salvar
    Como, com a nativa já marcada. Agora a nativa é gravada sem perguntar
    enquanto couber com folga: até 250 MB no tablet e no celular, até 380 MB
    no computador. A janela continua em dois casos: projeto acima desse peso
    (pergunta uma vez por projeto no Drive e guarda a resposta em
    `geomine.salvar.resolucao.v1:`; Salvar Como pergunta de novo) e projeto
    para o qual a pessoa já escolheu uma resolução reduzida neste aparelho (o
    Salvar segue usando a escolha; o Salvar Como pergunta, para ela poder
    voltar à nativa).
  - Ao recarregar a página, autorização do Drive vencida não é erro: o projeto
    volta do que está guardado no aparelho, sem aviso na tela
    (`drive/authorization-needed`). Com a autorização válida e nada novo no
    Drive, também não baixa o projeto de novo.
  - Em navegador de mesa com seletor de arquivos o Salvar continua gravando no
    arquivo local, como antes.
- **No iPad, o Abrir do Google Drive usa uma janela do próprio GeoMine.**
  Pedido de 22/11/2026, com o print do seletor do Google (grade de miniaturas
  com todo tipo de arquivo misturado): "essa janela tem que ser bem mais
  organizada, aparecer as opções de pastas com estrela, arquivos recentes e
  sempre ficar memorizada a última pasta que abri… para PC não precisa".
  `GeoMineDriveFolderBrowser.pick()` (`drive-folder-browser.js`) é a mesma
  janela compacta do Salvar Como, em dois cards numerados:
  - **1 · Onde procurar:** atalhos Recentes, Com estrela, Meu Drive e Drives
    compartilhados, e busca por nome. Recentes mostra primeiro o que foi aberto
    neste aparelho (`geomine.drive.recentes.v1:<conta>`) e depois os
    modificados no Drive.
  - **2 · Escolha o projeto:** caminho da pasta e lista só de pastas e
    projetos (inclusive o projeto que chegou como `.ccmgis.txt`); um toque no
    arquivo abre. Na escolha do original de um raster (`drive-originals.js`) a
    mesma janela lista só pastas e TIFF.
  - **A última pasta visitada fica guardada** no aparelho, por conta
    (`geomine.drive.navegacao.v1` para projetos e
    `geomine.drive.navegacao.originais.v1` para originais), e a janela abre
    nela; se a pasta sumiu, abre na do último projeto e, por fim, em Meu Drive.
  - A estrela das pastas pode ser posta e tirada na própria janela quando a
    conta já autorizou a gravação (primeiro Salvar); sem isso a estrela só
    aparece, parada, nas pastas que já a têm.
  - "Seletor do Google" continua no rodapé. No computador o Abrir do Drive
    segue com o seletor do Google, como antes (`GeoMineDriveProject.pick`
    decide por `fsApiOK()`).
  - A janela leva `data-gm-no-dirty`: `session-autosave.js` não conta a busca
    como edição do projeto. Sem isso, digitar na busca marcava o projeto como
    alterado e o Abrir descartava em silêncio o arquivo escolhido.
- **No iPad, exportar grava direto na pasta do projeto no Google Drive.**
  Pedido de 22/11/2026 ("quando vou salvar um projeto ele abre outra janela",
  com o print da prancha em PDF no Layout). Sem seletor de arquivos para
  escrita, toda exportação virava download e o Chrome do iPad abria a barra
  "Salvar…" e a caixa "Salvar em…" (Arquivos / Drive), para o arquivo ainda
  cair fora da pasta do projeto. Agora `download()` (`16-vector-export.js`)
  entrega o arquivo a `GeoMineDriveSave.saveExport` (`drive-project-save.js`)
  quando o aparelho é móvel, o navegador não tem `showSaveFilePicker` e a aba
  está vinculada a um projeto do Drive (aberto pelo Drive ou já salvo nele).
  - Vale para toda exportação que passa por `download()`: PDF, PNG e SVG da
    prancha, shapefile, CSV, relatórios. Não vale para **Baixar cópia do
    projeto**, que é download de propósito.
  - A pasta é a do arquivo do projeto. Exportar de novo com o mesmo nome
    regrava o arquivo que o GeoMine criou para este projeto (marcas
    `appProperties.geomineExport` e `geomineProject`; o Drive guarda as
    versões). Arquivo de mesmo nome vindo de outro lugar ou de outro projeto
    nunca é trocado: a exportação sai como "nome (2)", e é esse que passa a
    ser regravado.
  - A autorização é a do Salvar. Nas exportações do Layout ela é pedida logo
    no toque (`layoutExportDriveReady`), antes de gerar a prancha a 300 dpi,
    porque a geração demora mais do que o toque vale para o navegador. Se a
    autorização venceu e o toque já passou, uma caixa do GeoMine pede um toque
    (Autorizar e gravar no Drive / Baixar pelo navegador / Cancelar) em vez de
    deixar o navegador bloquear a janela do Google.
  - Projeto sem vínculo com o Drive, computador com seletor de arquivos e
    Android com folha de compartilhar continuam como antes. Se o Drive falhar
    (sem permissão na pasta, rede), o GeoMine avisa o motivo e a exportação
    segue pelo navegador, para não se perder.
- **Layout: ícone Compartilhar.** Pedido de 22/11/2026 ("aqui deve ter um
  ícone de opção de compartilhamento", com o print do Layout no iPad). O botão
  `#btnLoShare`, ao lado de Exportar na barra do Layout, abre a folha de
  compartilhar do aparelho (WhatsApp, e-mail, AirDrop, Salvar em Arquivos…)
  com o PDF da prancha aberta (`shareLayoutPDF` em `17-layout-printing.js`). Só
  aparece onde o navegador compartilha arquivos (`navigator.canShare`).
  - O navegador só abre a folha de compartilhar dentro de um toque, e gerar a
    prancha a 300 dpi demora mais do que o toque vale. Se o PDF desta prancha
    já está pronto (acabou de ser exportado ou compartilhado e nada mudou), a
    folha abre no próprio toque. Senão o PDF é gerado e, se o toque venceu, a
    caixa "Prancha pronta para compartilhar" pede o toque que abre a folha.
  - O PDF pronto fica guardado em `_loPDF` e é descartado junto com a imagem
    do Copiar (`loBlobInvalida`), sempre que a prancha é redesenhada.
  - Exportar → PDF e Compartilhar geram o mesmo arquivo (`layoutPDFFile`).
    Compartilhar não grava no Drive nem baixa nada por conta própria.
- **Camadas de resultado entram no desfazer.** Comandos que só criam uma
  camada nova (Mesclar, Dissolver, curvas de nível, bacias, direção de fluxo e
  os demais de `25-geoprocessing-tin.js` e `19-hydrology-and-flooding.js`)
  chamam `addLayer({undo:true,...})`. A camada é anotada em `S._undoProdutos`
  com o mesmo contador de ordem de `S.undo`, e o Ctrl+Z a remove quando ela é a
  ação mais recente; camadas criadas juntas pelo mesmo comando saem juntas.
  Os módulos de mineração, que têm histórico próprio, não usam essa marca.
- **O marcador da área contribuinte fica no ponto marcado.** Quando o ímã gruda
  o toque na linha de fluxo, o marcador fica em cima da linha, e não no centro
  da célula usada como exutório: na grade de 1,8 m do D8 do Hidro o centro da
  célula fica até 0,9 m ao lado da linha, e com zoom alto o ponto parecia ter
  saído do lugar (caso do usuário em 14/11/2026). A célula de escoamento usada
  continua nos atributos (`E_CELULA`, `N_CELULA`, `AJUSTE_MDT`) e no texto do
  resultado. Vale para o D8 pronto e para o cálculo pelo MDT.
- **O marcador da área contribuinte é temporário.** Ele mostra o ponto
  marcado enquanto o cálculo roda e por cerca de 6 segundos depois do
  resultado, e então se apaga sozinho. Sai na hora quando o painel é fechado,
  quando outro ponto vai ser marcado e quando a área é desfeita. Antes ficava
  no mapa indefinidamente (pedido do usuário em 14/11/2026).
- **Cada área contribuinte registra o exutório na camada "Exutórios".** A
  ferramenta antiga de bacia deixava cada exutório numa camada de pontos
  única; esta a substituiu e deixou de fazer isso (pedido do usuário em
  14/11/2026: "não vejo mais a camada de ponto com os exutórios").
  `registerOutlet` grava o ponto marcado (em cima da linha, quando o ímã
  grudou) com os campos da camada antiga (`NOME`, `E`, `N`, `AREA_M2`,
  `AREA_HA`, `ACUM_CEL`, `COTA`, `DESLOC_M`), numa camada "Exutórios" que o
  projeto já tenha ou numa nova, no grupo do MDT. Ctrl+Z tira a área e o
  ponto dela. É uma camada comum (liga e desliga na árvore); o marcador
  temporário continua sumindo sozinho.
- **Aviso quando a célula usada fica longe do ponto.** O ajuste ao talvegue
  procura a célula de maior escoamento num raio que acompanha o dedo na tela
  (maior com o mapa afastado); perto de uma confluência ela pode estar em
  outra linha de escoamento, e a bacia sai a de outro exutório (relato do
  usuário em 14/11/2026). O raio não foi mexido; quando o ajuste passa de 3 m
  (ou 3 células), o resultado avisa e orienta a aproximar o zoom
  (`farNote`). Ainda falta reproduzir o caso real para decidir se a regra de
  escolha da célula muda.
- **Grade-guia: cava a montante cortada pela janela de análise.** MDT que não
  cabe inteiro na memória é roteado numa janela que cresce em volta do
  exutório, e as bordas da janela funcionam como saídas falsas. Uma depressão
  grande a montante (cava) cortada pela borda escoava para a borda em vez de
  transbordar para o exutório: a bacia ficava "interna e estável" em duas
  janelas seguidas sem a cava e sem tudo o que drena para ela (88% de fora
  num terreno de teste; 15 de 240 exutórios em terrenos aleatórios). A grade
  do MDT que o projeto guarda em memória (a de tela) é roteada inteira uma
  vez (`routeGuide`) e, quando a regra de sempre aceita uma bacia, diz o que
  mais drena para dentro dela (`guideNeed`); se isso passa da janela, a
  janela é ampliada e o cálculo é refeito nas cotas nativas. A guia só indica
  onde olhar — nenhuma cota dela entra no resultado — e a janela ampliada
  contém a anterior, então a bacia nunca sai menor do que saía. Se a janela
  pedida não cabe na memória, a pessoa escolhe entre a grade agregada e a
  bacia nativa com o aviso de que pode estar incompleta (`CONFERENCIA`).
  Limites conhecidos: a guia não enxerga ligações que só existem na resolução
  nativa, e uma bacia menor que uma célula da guia fica sem conferência (a
  célula da guia sob o exutório não entra sozinha: junto de uma confluência
  ela costuma ser a do rio maior e daria alarme falso). Em terrenos
  aleatórios de teste: erros em 4 de 160 exutórios com guia 4× e 10 de 120
  com guia 9×, contra 17 e 15 da regra antiga; em nenhum caso a bacia saiu
  menor que a da regra antiga nem com células a mais que a da grade inteira.
  Teste de ponta a ponta com MDT sintético de 4.400 × 4.400 células (cava a
  montante): 8,2 ha antes, 69,3 ha depois, igual à grade inteira.
- **Snap na linha de fluxo segue o ímã.** Com o ímã ligado (`S.snapOn`), o
  toque gruda na linha visível mais próxima a até a tolerância do snap das
  outras ferramentas (`SNAP_PX` = 15 px; 24 px no toque), em qualquer zoom; o
  limite antigo de 10 m no terreno dava ~2 px na vista geral e o dedo nunca
  acertava. Linhas de drenagem (pelo nome) e a camada selecionada têm
  preferência, mas qualquer linha visível serve
  (`point-catchment-snap.js`). Ímã desligado: vale o ponto tocado. O
  resultado diz qual linha foi usada ou por que não houve snap.
- **Exutório no talvegue.** O toque, ou o ponto projetado numa linha vetorial,
  quase nunca cai na célula exata por onde o escoamento passa no MDT, e uma
  célula de encosta ao lado devolve só alguns metros quadrados. Por isso
  `locateOutlet` (`continuous-catchment-engine.js`) procura, num raio pequeno
  (o dedo, ao menos 3 células, no máximo 40 m), a linha de escoamento dominante
  e move o ponto para a célula **mais próxima** dela, sem descer o rio. O
  marcador e o resultado mostram o exutório usado e o ajuste em metros.
- **Bacias grandes.** Se a bacia não cabe na memória do aparelho no TIFF
  nativo, a ferramenta pergunta antes de fazer qualquer outra coisa. Só com o
  aceite explícito ela calcula numa grade com média das cotas (`coarsen` em
  `point-catchment.js`), e o resultado e o atributo `METODO` saem marcados como
  NÃO NATIVO. Recusando, nada é calculado.
- **Grade do projeto sem arredondamento.** Na importação, a altura da célula
  (`csy`) é guardada sempre que difere da largura, sem limiar, para a extensão
  da grade reproduzir a do TIFF.

Testes do motor: `node src/modules/hydrology/continuous-catchment.test.cjs` e
`node src/modules/hydrology/point-catchment.test.cjs`.

## Originais buscados no Google Drive

O projeto guarda só a prévia dos rasters; os TIFF originais do MDT e da
ortofoto ficam no Drive. Para a pessoa não ter de procurá-los a cada aparelho,
`src/modules/persistence/drive-originals.js`:

- ao abrir ou retomar um projeto, depois da procura no próprio aparelho,
  procura no Drive cada original que falta pelo **nome** e pelo **tamanho em
  bytes** gravados no projeto (`names`, `expectedSize`, `find`);
- baixa o arquivo para o armazenamento do aparelho e o entrega ao mesmo
  caminho de conferência e vínculo de quem escolhe à mão
  (`rasEscolherNativoAgora(r,{file})`, `ortoReligarTIFF`). O módulo não decide
  que um arquivo "serve";
- não baixa sozinho arquivos acima de 1,5 GB nem quando falta espaço; aí o
  botão **Buscar no Google Drive** faz isso a pedido;
- sem o tamanho gravado e com mais de um arquivo de mesmo nome, não escolhe:
  pede o arquivo.

Depende da sessão do Drive (cerca de 50 minutos depois da última autorização)
e do escopo `drive.readonly`. Nada é gravado, movido ou apagado no Drive.

**Seletor já na pasta.** O seletor de arquivos do sistema (iPad, Chrome) não
aceita pasta inicial vinda de uma página. O seletor do Google Drive do próprio
GeoMine aceita: `pick({parent})` em `drive-project-source.js` abre na pasta do
último projeto aberto pelo Drive, e **Escolher no Drive…** abre na pasta onde
o último original foi encontrado.

## Estradas (Civil)

O painel **CIVIL → Estrada** (`#secCivil`) tem seis cards, na ordem do projeto.
Os três primeiros aparecem sempre; o 4 e o 5 quando há um traçado escolhido; o
6 depois de confirmar o alinhamento.

| Card | Conteúdo | Onde está o código |
|---|---|---|
| 1 Estrada e terreno | estrada em edição, nome e MDT | `roads.js` |
| 2 Critérios de projeto | largura, raio mínimo, rampa máxima; taludes, bancadas e bermas | `roads.js` (`readParams`) |
| 3 Traçado pelo MDT | pontos A e B, três opções comparadas por corte e aterro | `road-alternatives.js` |
| 4 Alinhamento horizontal | tabela de curvas com o raio de cada uma, mover PIs no mapa | `road-geometry.js`, `road-curves.js` |
| 5 Alinhamento vertical | perfil resumido, tabela de PVIs com o L de cada curva, perfil completo, confirmar | `road-geometry.js`, `road-editor.js` |
| 6 Corredor e volumes | taludes até o terreno e cubagem por seções | `corridor.js` |

Todos os arquivos ficam em `src/modules/civil/`. Ao escolher uma opção o painel
continua aberto e os cards 4 e 5 aparecem; o perfil completo abre pelo card 5 e,
ao fechar, devolve o painel.

**Alinhamento horizontal.** O eixo é a poligonal dos PIs
(`horizontalControls`, do ponto A ao B) concordada por curvas circulares
(`civCurvasTangentes`). Cada PI interno guarda o raio da sua curva em `r`;
sem `r` vale o raio mínimo dos critérios. O raio nunca é reduzido para a curva
caber: a rotina recusa e diz qual vértice não comporta. O card mostra, por
curva, deflexão e lado, R, tangente T, desenvolvimento D, estacas do PC e do PT
(metros desde A) e "cabe até", o maior raio que ainda cabe com os vizinhos como
estão (`GeoMineRoadGeometry.horizontalElements`, com as mesmas condições da
rotina que traça). Um raio menor que o mínimo dos critérios não é aceito; se o
mínimo subir depois, as curvas menores ficam sinalizadas e nada muda sozinho.

**Alinhamento vertical.** O greide é `verticalDesign`: PVIs com `u` (posição de
0 a 1 no eixo), cota `z`, comprimento `L` da parábola e `fixed`. O card mostra,
por PVI, estaca, cota, a rampa que chega e a que sai, o tipo (côncava ou
convexa), K = L ÷ |diferença das rampas em %| e o maior L que cabe
(`verticalElements`, com as condições de `GeoMineRoadEditor.vertical`). O resumo
traz a rampa máxima contra o limite, o menor K com o PVI e o maior corte e o
maior aterro no eixo. O perfil completo (`road-editor.js`) desenha terreno,
greide, corte, aterro, a rampa de cada tangente, o trecho de cada curva
vertical e as estacas; cotas, estacas e novos PVIs continuam sendo editados
nele.

**Uma só rotina aplica tudo.** Os cards chamam `GeoMineRoadEditor.update` e o
arrasto dos PIs no mapa e o perfil chamam `apply`: as mesmas conferências (eixo
dentro do MDT, rampa máxima, curvas que cabem, camadas desbloqueadas) e o mesmo
histórico de Desfazer, que vale enquanto a estrada, o MDT e o projeto forem os
mesmos — fechar o perfil não o apaga.

**O que não é calculado.** Velocidade de projeto, distância de visibilidade,
superelevação, superlargura e curva de transição. As tabelas descrevem a
geometria; a verificação de norma é do projetista. O campo "Passo do greide"
saiu da tela em 19/11/2026 porque nenhum cálculo o usa mais (continua no
formulário, oculto, para os projetos gravados).

Testes: `node src/modules/civil/road-geometry.test.cjs` (raio por curva e os
elementos das duas tabelas, conferidos contra as rotinas que traçam o eixo e o
greide).

## GEOMEC (estabilidade de taludes)

A faixa **GEOTECNIA** abre a aba de vista **GEOMEC** (`data-view="geomec"`,
`#gmGeomecWorkspace`), que ocupa a área do mapa como as Licenças. Enquanto ela
está aberta, o painel de Propriedades da camada sai de cena para a seção ganhar
largura; em área com menos de 700 px os cards viram uma gaveta (botão ☰).

| Arquivo (`src/modules/geotech/`) | Papel |
|---|---|
| `slope-stability.js` | Motor de equilíbrio-limite (`GeoMineSlope`), sem DOM |
| `geomec-core.js` | Seções, montagem do modelo, cálculo, estudos, projeto e a thread de cálculo (`GeoMineGeomecInterno`) |
| `geomec-canvas.js` | Desenho da seção em escala 1:1 e o que há debaixo do ponteiro |
| `geomec-graficos.js` | Gráficos dos resultados e o corpo livre da fatia |
| `geomec-workspace.js` | A tela: cards, interações, mapa, saídas (`GeoMineGeomec`) |
| `styles/modules/geomec.css` | Estilo da aba |
| `geomec-litologias.js` | Banco de litologias (φ′, c′, γ; σci e mi de rochas) com faixa e fonte |

**Cards.** 1 Seção (nome, sentido, FS admissível, base do modelo, recalcular a
cada alteração) · 2 Camadas e materiais · 3 Água (NA) · 4 Cargas, sismo e trinca ·
5 Superfície de ruptura · 6 Estudos · 7 Saída. Cada um tem o ⓘ com a
explicação.

**De onde vem a seção.** *Seção Geotécnica* arma a ferramenta `geomecSecao`:
dois toques no mapa (com ímã), acima da crista e além do pé. Com uma única
fonte de cota cruzando a linha a seção nasce direto; senão a aba mostra a
prévia das escolhidas ao longo da linha e três cards iguais. Em cada um escolhe-se
primeiro o **tipo** — *Imagem* (MDT, TIN, superfície raster) ou *Vetorial*
(linhas com cota) — e só então aparecem as opções daquele tipo
(`candidatos(papel, tipo)`; `sugere` dá a melhor de cada tipo: na topografia
por imagem, a superfície que fica por cima na maior parte da linha, nunca o
MDT recortado se houver outra). Os cards: **1 Topografia** (MDT/TIN na resolução
nativa ou curvas de nível — camada de linhas com Z nos vértices, `zg`, ou num
campo COTA/Z/ELEV/ELEVACAO…; entre duas curvas a cota é linear), **2 Superfície
de análise** (nenhuma, o desenho do DCE/cava — camada com `DESIGN_ID` e `PROJETO`, de
preferência a "— Bruta" —, um PDE importado com cota ou um MDT do projeto;
pilha ou cava) e **3 Superfícies de contato** (topo da rocha, camada fraca;
o que foi marcado num tipo continua marcado ao trocar para o outro; o terceiro
tipo, *Distância*, está descrito abaixo). A sugestão é a
topografia de trabalho (nunca o MDT recortado, se houver outro) e, como
projeto, o desenho que a linha cruza. Pilha: superfície = maior entre projeto
e topografia, e a topografia sob o projeto vira o primeiro contato (camadas
"Pilha (PDE)" e "Fundação", com valores de partida do banco). Cava: o menor
dos dois. Os cruzamentos das linhas com cota (`GM.perfilVetorial`) entram como
estações, além das do MDT. Onde a topografia não tem cota vale o contato mais
alto; contato que não passa abaixo do terreno é ignorado, com aviso. As linhas são
simplificadas com tolerância de 2 cm (ou 1/2500 do desnível). *Talude* cria um
talude paramétrico (bancadas, altura, ângulo da face, berma). **Cada seção
cortada no mapa tem a sua camada** ("Seção geotécnica S-01", no grupo **Seções
geotécnicas**; pedido de 22/11/2026: "cada seção geotécnica deve gerar uma
camada para ficar exposta na aba camadas"): a linha da seção, com rótulo do
nome e do FS, e o trecho entre a entrada e a saída da ruptura crítica colorido
pela classe do fator de segurança (campos GEOMEC, SECAO, TIPO, FS, CONDICAO,
CLASSE). A camada nasce com a seção (também ao duplicar e no "Ver no mapa"), é
atualizada a cada cálculo e ao renomear a seção, e sai quando a seção é
excluída. Desde 23/11/2026 ("as seções geomecânicas devem ficar todas como
camadas na aba camadas") **toda** seção cortada no mapa tem sempre a sua
camada: a que falta — seção de projeto anterior, ou camada apagada — é criada
de novo ao abrir o projeto, ao abrir a aba GEOMEC e a cada cálculo
(`sincronizaMapa`). Seção paramétrica não tem linha no mapa e fica sem camada.
A marca `_geomecSecao` vai para o projeto; em projeto antigo a camada é
achada pelas feições (todas com o mesmo GEOMEC). A camada única de antes,
"Seções geomecânicas", dá lugar a uma camada por seção.

**Contato por distância.** Pedido de 22/11/2026: "no caso de não haver uma
superfície de contato embaixo da topografia, eu devo poder dizer que distância
considerar, tipo 5 metros, e fazer uma linha". O contato é uma linha paralela
a uma referência, *h* metros abaixo dela, **medidos na vertical** (como a
profundidade de um furo), e vira o topo de uma camada nova
(`GM.novaCamadaProfundidade(sec, h, ref)`; `fonte:{tipo:'profundidade', h,
ref}`). Dois lugares: (1) na seção nova, o card 3 tem o tipo **Distância** —
campo "m abaixo da topografia", com a linha já desenhada na prévia; quando
nenhuma superfície de contato cruza a linha, o card abre nesse tipo; (2) na
seção existente, o card 2 tem a linha "distância (m) · abaixo de… · ＋ camada",
e a camada criada mostra a distância num campo que pode ser alterado
(`GM.mudaProfundidade`). Referências (`GM.referenciasContato`, a primeira é a
de partida): a **topografia** — na pilha, o contato pilha/fundação (a linha
segue o terreno natural também sob a pilha); na cava, a topografia original,
que a seção passa a guardar em `s.natural`, com a linha limitada pela
escavação; no talude natural, o próprio terreno —, a **superfície do talude**
quando há projeto, e o **topo de cada contato** que a seção já tem. A camada
entra na ordem das cotas médias, logo abaixo da referência. No talude
paramétrico o contato acompanha o terreno quando a geometria é refeita. Seção
de cava criada antes desta versão não tem `s.natural`: nela a referência é a
superfície escavada.

**Água (card 3).** A linha desenhada (horizontal por cota, editada no desenho
ou "no contato pilha/fundação") e a **condição do cálculo**: NA desenhado
(com o ru dos materiais), seco (sem água e sem ru), NA crítico (o desenhado
elevado de Δ — padrão 20% do desnível — sem subir acima do terreno onde estava
abaixo dele, `GM.elevaNA`; leva o ru), saturado (NA na superfície, sem ru) ou
**pior caso entre as marcadas**: cada condição vai para a thread de cálculo,
uma de cada vez (o andamento aparece no topo), e fica a de menor FS
(`GM.combinaPior`), com a tabela no card, no Resumo e no relatório. Os estudos
usam a condição que governou. FS mínimo: o admissível da seção para seco e
desenhado; 1,30 para crítico e saturado (editáveis), como a NBR 13029:2017
para pilhas — 1,50 com o NA normal no contato pilha/fundação e 1,30 com o NA
elevado no maciço. Tocar no nome de uma condição passa a calcular só ela.

**Banco de litologias.** O seletor de cada material e a aba "Litologias"
(busca e "usar" no material escolhido) trazem 50 linhas: solos residuais e
naturais, estéril/rejeito/enrocamento, solos USCS compactados, rochas por
Hoek–Brown (σci pela classe de resistência, mi ± desvio de Marinos & Hoek) e
descontinuidades. Cada linha tem valor típico, faixa quando a fonte publica e
a fonte: NAVFAC DM-7.02; Marinos & Hoek (2000/2001) e Hoek (2007); ensaios
publicados em solos de gnaisse (RJ, SC) e GeoRio (2014); estéreis de PDE do
Quadrilátero Ferrífero; Leps (1970) e Hawley & Cunning (2017); Barton &
Choubey (1977); Skempton (1985); Terzaghi & Peck; a biblioteca anterior do
GeoMine. Aplicar uma litologia guarda o papel da camada no nome ("Fundação —
…"). São valores de partida: o card lembra de confirmar com ensaios.

**Motor.** Método das fatias na formulação geral (GLE, Fredlund e Krahn, 1977),
a mesma família do SLOPE/W: para cada λ há um fator de segurança que fecha os
momentos (Fm) e outro que fecha as forças (Ff). Bishop simplificado é Fm com
λ = 0; Janbu simplificado, Ff com λ = 0 (o corrigido multiplica por f0);
Spencer e Morgenstern–Price são Fm = Ff com função entre fatias constante e
meia-senoide; Ordinário só em superfície circular. Resistência por
Mohr–Coulomb, não drenada (Su, com ganho em profundidade), Hoek–Brown
generalizado (2002), enrocamento (atrito que cai com o logaritmo da tensão),
envoltória por pontos e rocha impenetrável (a superfície escorrega por cima
dela). Linha freática com lâmina d'água sobre o terreno, ru por material,
sobrecargas, sismo pseudo-estático (kh, kv) e trinca de tração com água.
Os vértices do terreno, dos contatos, da água e das cargas sempre viram divisa
de fatia, e também os cruzamentos da base com os contatos e com a água.

**Busca.** Círculos por entrada e saída: malha geral de 22 × 22 pares e 10
flechas (36 × 36 × 14 na varredura fina) **mais** janelas em cada par crista–pé
(`quebras` e `janelas` do motor). Triagem por Bishop, refino dos seis melhores
por Nelder–Mead com o método escolhido, e a melhor superfície de cada porte:
local (desnível até 1/3 do da seção), intermediária e global. A otimização não
circular parte do círculo crítico e dos de cada porte, troca cada um por uma
poligonal e move os vértices enquanto o fator de segurança cai (sem curvatura
reversa acima de 5° e com a base entre −50° e 88°); não se aplica a Bishop nem
ao Ordinário. A superfície também pode ser testada à mão, arrastando a
entrada, a saída e o fundo, com o fator de segurança ao vivo.

**Resultados.** Resumo (todos os métodos, λ, f0, geometria da superfície, FS
por porte, avisos de tração) · FS × λ · tensões na base · forças entre fatias ·
corpo livre e polígono de forças de cada fatia (toque na fatia) · FS × porte
com todas as superfícies tentadas · sensibilidade (±20%) · probabilidade (Monte
Carlo de 2.000 sorteios, com semente fixa) · sismo (FS × kh e aceleração de
escoamento ky) · retroanálise (pares c′–φ′ com FS = 1) · tabela e gráfico de
todas as seções. Saída em PNG, CSV das fatias e relatório em PDF (A4, 300 dpi,
pelo `buildPDFmulti` do Layout).

**Conferências do motor** (todas em `slope-stability.test.cjs`):

| Caso | Referência | GeoMine |
|---|---|---|
| ACADS 1(a), talude homogêneo | FS 1,00 (árbitros do estudo) | Bishop 0,985 · Spencer 0,984 · Morgenstern–Price 0,984 · Janbu corrigido 0,986 · Janbu 0,935 · Ordinário 0,942 |
| φ = 0 num círculo dado | c·R·arco ÷ momento do peso | igual até a 5ª casa (1,47489 × 1,47490) |
| Talude infinito | fórmulas fechadas, com coesão, sismo e ru | iguais |
| Ruptura plana (Hoek e Bray) | 1,27097, e 1,09403 com sismo | iguais por Janbu, Spencer e Morgenstern–Price |
| Talude submerso | peso submerso | igual |
| Ábaco de Taylor, φ = 0 | Ns 0,261 / 0,219 / 0,191 / 0,181 (90°, 75°, 60°, 45°) | dentro de ±0,002 |
| Seção espelhada | mesmo fator de segurança | idêntico |
| Equilíbrio de cada fatia | resultante nula | resíduo abaixo de 10⁻¹² kN/m |
| Bishop e Spencer | fórmulas clássicas escritas à parte | coincidem |
| Hoek–Brown (σci 50, mi 10, GSI 45, D 0,7) | mb 0,4870 · s 3,453·10⁻⁴ · a 0,5081 | iguais |
| Bancadas, 5 comprimentos de crista × 2 sentidos, 9 taludes | mesmo FS crítico | diferença máxima de 0,01% |

`geomec-core.test.cjs` cobre a montagem da seção (terreno incompleto, contatos,
vírgula decimal), os estudos, o projeto e a thread de cálculo.

**Tempo** (medido no Chromium deste ambiente): talude de três bancadas, 0,2 a
0,4 s; seção de MDT com três camadas e água, 0,3 a 0,8 s; com a otimização não
circular, 1 a 2 s.

**Limites conhecidos.** A seção é reta (dois pontos). A água é uma linha
freática: não há rede de fluxo. O sismo é pseudo-estático. A probabilidade e a
sensibilidade usam a superfície em análise, fixa. O contato vem de superfícies
do projeto ou de uma cota; desenhar um contato livre na seção ainda não existe.
Parâmetros de resistência são os informados: a biblioteca de materiais traz
valores típicos, que não substituem ensaio.

## Janelas de propriedades

As três janelas usam o mesmo conjunto de classes, definido no fim de
`src/styles/app.css` (bloco `.gmp`):

| Classe | Papel |
|---|---|
| `.gmp` | marca a janela (`<div class="modal gmp">`) |
| `.gmp-info` | faixa sempre visível abaixo do cabeçalho, com o nome e o Renomear |
| `.gmp-i` + `.gmp-leitura` | botão **i** do cabeçalho e os dados de leitura que ele abre |
| `details.gmp-sec` | seção recolhível; `data-gmp-sec` é a chave com que o navegador lembra se ficou aberta |
| `.gmp-st` | resumo ao lado do título da seção (preenchido por `gmpStatus(id, texto, tipo)`) |
| `.gmp-row`, `.gmp-g2` | linha com rótulo e campo lado a lado; grade de dois campos |
| `.gmp-sw` | caixa de marcar desenhada como interruptor |
| `.gmp-f` | rodapé fixo com as ações da janela |

O comportamento está em `src/core/parts/09b-properties-help.js`: `gmpOpen(id)`
é chamado ao abrir cada janela, o botão **i** de uma seção usa o balão de ajuda
que já existia e `data-help-from` aceita vários ids, para reunir num balão os
textos de leitura da seção. Os ids dos controles não mudaram.

Na janela vetorial, as ações que dependem da seleção (continuar desenho,
restaurar estilo, sondagens) ficam visíveis em `#lpAcoes`; use
`lpInfoRender(L)` para atualizar o painel do **i** e essa faixa juntos. Na
janela do MDT, as abas Estilo e Dados estão no próprio HTML e
`src/modules/raster/raster-panel-tabs.js` só troca a aba visível.

## Uma única linha de código

Este repositório mantém somente a versão publicada. As cópias antigas foram
retiradas da árvore e continuam recuperáveis pelo histórico do git:

- **Base de 06/11/2026** (`GeoMine/src` do Drive, com a etapa de
  compartimentação que não chegou à versão publicada): commit `29d224a`, pasta
  `arquivo/base-2026-11-06/`.
- **Árvore não oficial com placas de 02/09/2026**: commit `29d224a`, pasta
  `reference/nao_oficial_com_placas_2026-09-02/`.
- **Projetos auxiliares de hospedagem** (`cloud/`, protótipo Next.js, e
  `firebase/`, portão por Cloud Functions): commit `12c7c22`.

Para consultar uma delas: `git show 29d224a:arquivo/base-2026-11-06/README.md`
ou `git checkout 29d224a -- arquivo/`.

Os HTML monolíticos de referência (acima de 2 MB) e os pacotes `.zip` de
entregas antigas ficaram só no Drive.

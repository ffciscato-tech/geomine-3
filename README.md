# GeoMine

Código-fonte do GeoMine, o GIS web da CCM publicado em https://geomine-3.web.app/
(projeto Firebase `geomine-3`).

A raiz deste repositório corresponde à versão publicada em 14/11/2026 às 11h30
(horário de Brasília), e a montagem feita a partir daqui reproduz o site byte a
byte:

| Arquivo gerado | SHA-256 |
|---|---|
| `dist/GeoMine.html` | `cb743384095030a6ce9e57aa7e4ddacfec9bae9ecc0d3fc9a1432214b26067bc` |
| `public/index.html` | `bea2a6b9da0fd31c4669858fdd54e7b950329450c73a598889af4fd3111017c3` |

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
    Só é pedida ao salvar; a janela do Google reaparece quando a autorização
    de 50 minutos vence. No iPad, o usuário relatou (14/11/2026) que essa
    janela falhava no Safari e funciona bem no Chrome.
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
    projeto" para os rasters nem repete a pergunta de resolução — até 60 MB
    grava as superfícies como estão; acima disso pergunta uma vez por projeto
    e guarda a resposta (`geomine.salvar.resolucao.v1:`).
  - Ao recarregar a página, autorização do Drive vencida não é erro: o projeto
    volta do que está guardado no aparelho, sem aviso na tela
    (`drive/authorization-needed`). Com a autorização válida e nada novo no
    Drive, também não baixa o projeto de novo.
  - Em navegador de mesa com seletor de arquivos o Salvar continua gravando no
    arquivo local, como antes.
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

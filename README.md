# GeoMine

Código-fonte do GeoMine, o GIS web da CCM publicado em https://geomine-3.web.app/
(projeto Firebase `geomine-3`).

A raiz deste repositório corresponde à versão publicada em 13/11/2026 às 08h22
(horário de Brasília), e a montagem feita a partir daqui reproduz o site byte a
byte:

| Arquivo gerado | SHA-256 |
|---|---|
| `dist/GeoMine.html` | `440d272c3da58d9f61be1254d63cf0ebeb38c38ce2c4747d64622f56497651fd` |
| `public/index.html` | `0355f55465452a93380ebb608cb3f5f28f9e05f635a1bf3d7cb480fa801b9b54` |

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
  (`#rasModal`), o nome e o botão Renomear ficam no painel aberto pelo botão
  **i** do cabeçalho. Os dados de leitura (arquivo, CRS, tamanho, datas) ficam
  recolhidos dentro desse painel e só aparecem no **i** ao lado do nome. Os
  textos de cada seção ficam no **i** ao lado do título. Na janela ficam só os
  controles, com botões do tamanho do texto (nada de largura total) e as seções
  pouco usadas recolhidas. Layout aprovado em 12/11/2026 e compactado em
  seguida a pedido: fonte de 12 px, controles de 28 px de altura e espaços
  rentes ao texto. Não voltar a aumentar.
- **Lixeira com grupos.** Na seleção múltipla da árvore de camadas, grupos
  inteiros também podem ser marcados (chave `G:`+id em `S._layerMulti`).
  Excluir um grupo marcado exclui o grupo, os subgrupos e tudo o que está
  dentro, depois de uma confirmação que lista o que será apagado.
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
| `.gmp-i` + `.gmp-info` | botão **i** do cabeçalho e o painel que ele abre (nome e Renomear) |
| `.gmp-leitura` | dados de leitura, recolhidos; abrem pelo **i** ao lado do nome (`data-gmp-info`) |
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

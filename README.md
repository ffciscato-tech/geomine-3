# GeoMine

Código-fonte do GeoMine, o GIS web da CCM publicado em https://geomine-3.web.app/
(projeto Firebase `geomine-3`).

A raiz deste repositório corresponde à versão publicada em 12/11/2026 às 17h53
(horário de Brasília), e a montagem feita a partir daqui reproduz o site byte a
byte:

| Arquivo gerado | SHA-256 |
|---|---|
| `dist/GeoMine.html` | `142fe4b19d7c7471781266f312bce1676c4284878b1bc9e832f19f35bce9913d` |
| `public/index.html` | `a56dfe45a1f5841d4505681bc0ad833220e54e7446c1a18202782aa04c7f4e17` |

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
  pouco usadas recolhidas. Layout aprovado em 12/11/2026.

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

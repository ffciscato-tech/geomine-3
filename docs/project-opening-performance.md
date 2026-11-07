# Abertura de projeto: tablet e desktop

## Mudanças

- `modules/persistence/project-opening.js`: criação visual adiada para vetores e MDTs desligados ao restaurar o projeto. Dados, geometrias, cotas, grupos e atributos continuam presentes em memória e no salvamento. A árvore cria o desenho na primeira ativação. Redesenhos explícitos de edição invalidam a marca de adiamento.
- `project-reader.js`: arquivos até 32 MiB usam primeiro uma leitura sequencial completa, com tamanho e UTF-8 estritamente validados, progresso, cancelamento e timeout. Isso evita uma solicitação ao provedor Android por MiB. A falha conserva o fallback por faixas; arquivos maiores continuam limitados a faixas de 1 MiB.
- Eventos de restauração dos controles do Layout não geram mais uma prancha enquanto a vista ativa é Mapa/3D. O debounce permanece quando o Layout está aberto.

## Evidência

Arquivo privado `BN_Drenagem_com_shapes.ccmgis`, versão Drive de 2026-09-28 10:51:50 UTC, 16.371.642 bytes. Cinco das sete camadas vetoriais desligadas eram desenhadas na abertura. Em Chrome isolado, configuração Android e CPU limitada em 4×, a comparação inicial reduziu a abertura local de 3.894 ms para 2.404 ms (~38%). Não inclui o download do Google Drive, nem representa medição no tablet físico do usuário.

Testes:

- `validate_project_reader.mjs`: 16 casos, incluindo leitura única, fallback, arquivos grandes, truncamento, permissão, cancelamento e UTF-8.
- `smoke_project_opening.cjs <arquivo>`: projeto real, camadas/MDT ocultos, ativação/desativação, serialização completa de geometria/Z/grupos, Layout oculto/visível.
- `smoke_project_reopen.cjs`: projeto mais recente, cores, prancha e troca de vista.
- `validate_manual_session.mjs`: 15 casos, preservando salvamento manual.

O arquivo do Drive não é alterado. Não há descarte nem simplificação de geometria, autosave novo, migração de hospedagem ou alteração de regras de acesso.

## Preparação de projeções na abertura — 29/09/2026

`project-opening.js` oferece `begin()`/`end()`, usados no `try/finally` de
`loadProject`. Durante essa operação síncrona, `toWGS` reutiliza o par de
projeções já preparado pelo mesmo proj4. Antes, o desenho e o enquadramento
montavam novamente esse par para cada vértice. Os vértices ainda são todos
transformados: não há simplificação, amostragem, cache de coordenadas nem
mudança dos critérios de enquadramento/filtros.

O cache tem no máximo 32 pares e não sobrevive ao carregamento, erro ou troca
de projeto. Definições substituídas por outro objeto e mudança do motor durante
a operação invalidam o par. Exceções usam o caminho original e conservam seu
aviso de projeção. Escopos aninhados restauram o anterior; `end()` é idempotente.
Nenhuma leitura, permissão, escrita, reconexão nativa ou timeout foi alterado.

### Medição controlada

Chrome isolado com identificação Android, CPU limitada a 4×, arquivos locais;
mediana de três aberturas completas da versão anterior e três da nova. O tempo
abaixo mede **a etapa síncrona de montagem de `loadProject`**, não o download do
Drive, permissão, religação posterior de TIFF externo nem tablet físico:

| Arquivo privado de teste | Tamanho | Antes | Depois | Redução |
|---|---:|---:|---:|---:|
| BLOCASA | 8.601.222 bytes | 2.172 ms | 1.084 ms | 50% |
| BN_Drenagem_com_shapes | 16.371.642 bytes | 2.220 ms | 1.373 ms | 38% |

A leitura local dos mesmos arquivos levou dezenas de milissegundos. Uma
análise separada descartou espera por IndexedDB/Web Lock no novo comando Abrir
por aba. Foi reproduzido também o timeout preexistente de 15 s quando um
provedor não fornece progresso na primeira leitura, mas isso não comprova que
seja a causa no dispositivo do usuário. Rasters externos e sua restauração
automática ainda podem acrescentar tempo mesmo a um `.ccmgis` pequeno.

### Verificação

- `validate_project_opening_projection.mjs`: proj4 e definições reais,
  equivalência numérica, fallback, definições e limpeza dos escopos.
- `smoke_project_opening_projection.cjs`: comparação de dados, geometria,
  atributos, grupos, visibilidade, rasters, desenho e limites entre builds,
  mais falha forçada seguida de nova abertura.
- `benchmark_project_opening.cjs`: leitura, análise do JSON, montagem, desenho,
  enquadramento e amostragem de CPU, em navegador descartável sem rede. Usar
  `APP_PATH`, `BENCH_LABEL` e `BENCH_REPEATS` para comparação. O modo opcional
  `PROBE_REUSE=1` é só experimento diagnóstico e não deve ser usado para medir
  o produto final. Resultados e arquivos privados não integram Hosting.
- Regressões de salvamento manual, isolamento de snapshots, duas abas,
  abertura/visibilidade de vetores/MDT e alternância Mapa/Layout.

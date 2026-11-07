# Compartimentação do GeoMine

Implementada em 06/11/2026 na fonte oficial. A distribuição continua sendo
`dist/GeoMine.html`, gerado por `python3 tools/build.py` e aberto offline.

## Estado e camadas

- `src/core/project-state.js`: `GeoMineProjectState.create({projectMeta, touch})`
  cria um estado por projeto, sem DOM, mapa ou acesso ao armazenamento.
- `src/core/layer-store.js`: `GeoMineLayerStore` recebe o estado explicitamente
  em `allNodes(state)` e `stackSync(state)`. As funções `nodeKey(type, id)` e
  `nodeLayer(node)` completam o contrato. O modelo conserva vetores, rasters,
  ortofoto, grupos vazios e ordem visual, inclusive quando abrir um projeto
  substitui os arrays do estado.
- `src/core/parts/01-bootstrap-crs-state-command.js` mantém a instância `S` e os
  nomes legados como adaptadores. Permissões, visibilidade e desenho no mapa
  continuam na integração existente; não foram transferidos ao modelo puro.

## Interface por responsabilidade

O antigo `10-ribbon-ui-preferences.js` conserva modo de interface e auxiliares.
O restante foi extraído, preservando o conteúdo e a sequência original:

| Fonte | Responsabilidade |
| --- | --- |
| `src/modules/ui/ribbon-catalog.js` | Categorias e vínculos dos comandos |
| `src/modules/ui/ribbon-svg-icons.js` | Biblioteca de ícones SVG |
| `src/modules/ui/ribbon-png-icons.js` | Cartelas PNG e aliases |
| `src/modules/ui/preferences.js` | Preferências da interface |
| `src/modules/ui/ribbon-renderer.js` | Faixa de ferramentas e painéis |
| `src/modules/ui/layer-properties.js` | Propriedades de camadas e inicialização dos painéis |
| `src/modules/analysis/geometry-cleanup.js` | Limpeza de geometria e relatório |

## Extensões da faixa

`src/modules/ui/ribbon-registry.js` fornece
`GeoMineRibbon.register(id, prepareCatalog)`. A função recebe o catálogo antes
da reconstrução da faixa. O registro retorna uma função de remoção; repetir a
mesma identidade substitui o callback sem encadear wrappers. O registro é
independente do DOM. `GeoMineRibbon.create()` cria instâncias isoladas.

O talvegue usa a identidade `environmental.thalweg`; não substitui mais
`ribbonBuild`. Novas extensões devem usar esse contrato. Extensões legadas de
outros domínios ainda podem depender de globais ou de seus adapters atuais.

## Montagem e validação

`src/module-order.json` inclui todas as novas fontes. A auditoria de comandos
em `tools/build.py` consulta as partes do manifesto, continuando a detectar
vínculos duplicados depois da extração do catálogo.

Validações executadas: estado e pilha, reabertura de projeto no modelo,
registro de extensões, atualização da árvore, exportação em lote, colaboração,
comandos geológicos, preservação de pranchas A4/A3, salvamento manual e sessão.
A inicialização no Chromium manteve as 14 abas, os 25 comandos iniciais e o
mapa, sem erros de JavaScript. Com a rede bloqueada, o talvegue abriu e seu
comando permaneceu único após quatro reconstruções da faixa.

O teste existente `validate_project_tab_session.mjs` já falhava antes desta
mudança, tentando acessar `gmTabReopen` ausente, e apresenta a mesma falha
depois. Essa pendência não foi corrigida nesta refatoração.

## Limites da migração

Estado e regras da pilha têm contratos próprios. A interface foi dividida
por responsabilidade, mas suas partes ainda são concatenadas no mesmo script
e compartilham o catálogo legado. `S`, `map`, CRS e outros pontos globais
continuam por compatibilidade. Esta etapa não representa isolamento completo
dos 19 domínios nem altera a publicação Web/Firebase.

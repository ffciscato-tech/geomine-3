# Superfície de curvas abertas e fechadas

O gerador **Topografia → Superfície Raster / Superfície TIN** usa os vértices cotados das linhas abertas e fechadas. Uma curva fechada de nível não é necessariamente o limite da superfície.

## Correção

O cálculo já incluía as linhas abertas. Porém, ao desenhar o resultado, `rasterClipRings` recuperava a camada fonte e tratava suas curvas fechadas como máscara. O mapa, os tiles, o layout e os limites visíveis acabavam escondendo grande parte da superfície que havia sido calculada.

O raster gerado passa a registrar `_tinAutoClip: false`. Essa política impede apenas inferências de recorte a partir do identificador ou nome da camada fonte. Anéis de recorte e limites explicitamente selecionados continuam válidos. O recorte por terreno também mantém as células efetivamente calculadas, sem receber uma segunda máscara baseada nas curvas de entrada.

A política é preservada no arquivo do projeto por `tinAutoClip`. Projetos antigos sem essa informação mantêm seu comportamento anterior: não é possível distinguir com segurança uma máscara escolhida pelo usuário de uma máscara inferida e salva anteriormente. Para corrigir uma superfície antiga afetada, gere-a novamente a partir das curvas na versão atualizada, usando **Sem recorte**.

As linhas originais não são fechadas nem modificadas. Sem uma máscara, o domínio continua sendo o fecho convexo da triangulação Delaunay, sujeito ao filtro de aresta máxima informado. Áreas fora da triangulação continuam sem dados. Não houve alteração do motor de interpolação nem preenchimento artificial de cotas.

## Validação

- Regressão sintética com curvas abertas/fechadas, máscaras explícitas, limite 3D, terreno e compatibilidade legada.
- Verificação de serialização e reabertura com a política preservada.
- Teste em navegador isolado de uma cópia somente leitura do projeto fornecido pelo usuário, cuja camada de NA contém 23 linhas abertas, 9 fechadas e 2.593 vértices com cotas válidas.
- Comparação entre grade calculada, pintura compartilhada por mapa/layout e recorte dos tiles. O projeto de diagnóstico não integra a publicação nem substitui o arquivo compartilhado original.

O teste independente roda com `node tools/validate_tin_clip_policy.cjs`. O teste em navegador exige uma cópia local autorizada do projeto e pode receber seu caminho como terceiro argumento: `node tools/smoke_tin_open_contours.cjs dist/GeoMine.html /caminho/HidrogeologiaV2.ccmgis`. Use `GEOMINE_CAVA=1` para incluir a geração da cava no mesmo ensaio. O arquivo fornecido não é alterado.

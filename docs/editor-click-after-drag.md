# Arrastar vértice depois de arrastar segmento

## Problema

No editor vetorial (Selecionar), depois de arrastar um vértice ou o "+" do meio de um segmento, não dava mais para arrastar pontos.

Ao soltar o botão, o navegador dispara um "click" no ponto de soltura, mesmo depois de um arrasto. Em camadas desenhadas em canvas, como as do projeto BN_Drenagem_revisao_v3, esse clique chegava ao Leaflet como clique na feição. Se a soltura caísse dentro do polígono, isso abria o menu flutuante da feição, o mesmo do clique de seleção. Em outra feição embaixo, trocava a seleção. O menu ficava sobre os vértices, e o arrasto seguinte pegava o menu, não o ponto.

O arrasto da aresta inteira (`polygon-edge-drag.js`) já descartava esse clique. Os gestos de vértice e de "+" do editor não descartavam.

Medido no projeto real (cópia, sem gravar), em Massa de Água, Areas Prontas e Faixa por altura MDT: o menu abria em todo arrasto de vértice e de "+" solto dentro do polígono.

## Correção

`edBindPointer` (27-vector-editor.js) registra o ponto e a hora em que um gesto de vértice ou de "+" termina. Um ouvinte de `click` em captura, no contêiner do mapa, descarta o clique seguinte quando ele chega em até 700 ms e a até 8 px desse ponto. Assim ele não chega ao Leaflet. Cliques comuns, fora desses gestos, continuam selecionando e abrindo o menu como antes.

## Verificação

`tools/smoke_editor_click_after_drag.cjs` (navegador isolado, polígono sintético sobre outro polígono) cobre os gestos soltos dentro do polígono:

- vértice, "+" do meio e aresta: sem menu, com a seleção mantida;
- o vértice seguinte continua arrastável;
- um clique comum em outra feição ainda a seleciona.

Na versão anterior, o teste falha no primeiro cenário (menu aberto). Também passam `smoke_polygon_edge_drag`, `smoke_vertex_drag_priority` e `smoke_vertex_handles`.

# Prioridade dos gestos de vértices — 28/09/2026

Reproduzido na versão anterior com mouse e toque: numa linha com três pontos,
a alça de mover a feição inteira coincide com o vértice central. Seu zIndexOffset
400 superava o vértice (0) e capturava o gesto, movendo todos os pontos. A mesma
colisão ocorre com a alça de inserir no meio de um segmento (150).

A prioridade fica no módulo `cad/vertex-handles.js`: vértice 1200, inserção 600,
mover feição 0. Os intervalos excedem o diâmetro dos alvos; isso mantém a ordem
mesmo com o componente de coordenada Y acrescentado pelo Leaflet. Não há mudança
nas geometrias, cotas, seleção múltipla explícita, snap, ortogonal ou salvamento.
A alça de mover a feição continua operante quando não sobrepõe outro controle.

`tools/smoke_vertex_drag_priority.cjs` reproduz a falha com `--baseline` e o HTML
anterior. Na versão corrigida verifica com mouse e eventos reais de toque que os
extremos ficam intactos, só o vértice central muda (ou é inserido), as cotas Z
ficam preservadas e desfazer restaura a geometria. O teste anterior de handles
também confere os vértices não arrastados, além de fechamento de anel, inserção,
movimento separado da feição, cancelamento de ferramentas e ausência de rastros.

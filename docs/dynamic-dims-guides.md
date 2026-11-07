# Cotas dinâmicas e guias de alinhamento no arrasto de vértice

## Pedidos

- Uma cota colocada numa figura geométrica deve acompanhar quando um vértice dela é arrastado (cota dinâmica).
- Ao arrastar um vértice de um retângulo com azimute, deve aparecer uma projeção para seguir o mesmo alinhamento, mantendo as arestas paralelas.
- O centro da figura (alça ✥) deve permitir arrastar a figura.

## Cota dinâmica (`dimensions.js`)

- **Vínculo:** ao criar a cota, cada ponta encaixada num vértice (ímã de vértices da ferramenta Cotas) guarda o vínculo em `_dimLink.a/.b`. Ele contém a camada, o `_gid` da feição (criado se faltar), o anel, o índice do vértice, a coordenada e o tamanho do anel. Ponta solta, sem encaixe, continua fixa.
- **Atualização:** toda edição de geometria redesenha a camada. Isso cobre arrasto de vértice nos dois editores, alça ✥, Mover, aresta, Colar, desfazer, reabrir etc. Depois desse redesenho, `drawLayer` refaz as cotas ligadas àquela camada a partir dos vértices atuais. O texto (medida) é recalculado.
  - **Alinhada:** mantém o afastamento perpendicular da linha de cota.
  - **Horizontal/vertical:** mantém a folga em relação ao ponto mais alto ou mais baixo (mais à esquerda ou à direita).
- **Vértice seguido:** pelo índice. Quando o anel muda de tamanho (vértice inserido ou apagado), é localizado pela coordenada, a mais próxima do índice antigo.
- **Persistência:** `_gid` e `_dimLink` ficam na própria feição e vão no projeto (gravar/reabrir).
- **Ímã:** as camadas de cota deixam de ser alvo do ímã (`snapLatLng`). Suas linhas passam rente aos cantos da figura e puxariam o vértice arrastado.

## Guias de alinhamento (`vertex-guides.js`)

- **Ao começar a arrastar um vértice,** em qualquer dos dois editores, aparecem linhas tracejadas a partir dos vizinhos, no CRS da camada, válidas para qualquer azimute:
  - **paralela:** direção original da aresta vizinho→vértice. Seguindo-a, a aresta continua paralela a como era; num retângulo, paralela à oposta.
  - **90°:** perpendicular à outra aresta do vizinho, que forma ângulo reto nele.
- **Encaixe:** perto de uma guia (10 px; 16 px no toque), o vértice encaixa nela; perto de duas, no cruzamento. A guia ativa fica laranja, com a etiqueta "paralela" ou "90°".
- **Regras:** o encaixe segue o ímã (desligado, as guias aparecem mas não puxam). O ORTO e os alvos do próprio ímã (vértice, centro, linha de outra feição) têm precedência. Arrasto em grupo (vários vértices) não usa guias.
- **Ligação aos editores:** `GeoMineVertexGuides.resolve` substitui `GeoMineOrtho.resolve` no arrasto de um vértice (`12-feature-selection-vertices.js` e `27-vector-editor.js`). As guias começam no `dragstart`/`pointerdown` e somem ao soltar.

## Centro (✥)

O arrasto pela alça do centro já funcionava nos dois modos. Medido: o retângulo andou 4,21 m. Agora as cotas presas à figura andam junto.

## Verificação

`tools/smoke_dynamic_dims_guides.cjs` (mouse real; retângulo de 5 × 3 m girado 12°; duas cotas criadas por cliques):

- **Guias:**
  - no Editar vértices, P3 encaixa no prolongamento da aresta P0–P3, com a etiqueta "paralela", e as guias somem ao soltar;
  - no editor Selecionar, P2 encaixa no prolongamento de P1–P2, e a cota dessa aresta acompanha com o mesmo afastamento.
- **Cotas dinâmicas:**
  - P1 livre: as duas cotas do canto acompanham, com o texto refeito;
  - alça ✥: figura e cotas andam juntas, e Ctrl+Z devolve tudo;
  - vértice inserido antes do canto: a cota continua no canto;
  - gravar e reabrir: o vínculo segue.
- **Ímã desligado:** as guias aparecem, mas não encaixam.

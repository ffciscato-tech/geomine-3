# Raio do círculo, círculo por arrasto, Mover e Copiar/Colar no menu da feição

## Raio e diâmetro na informação (ⓘ)

A ⓘ já mostrava, para polígonos, área (m² e ha) e perímetro, calculados pela geometria. Agora, quando a figura é um círculo, mostra também **Raio (m)** e **Diâmetro (m)**. O painel da feição selecionada (`showProps`) mostra os mesmos valores.

- O raio é um campo geométrico (`$RAIO`, `$DIAM` em `GEOM_CAMPOS`), não um atributo gravado. Por isso também está disponível nos rótulos e na calculadora de campo.
- `geomCirculo` reconhece o círculo pela própria geometria: um anel único com pelo menos 16 vértices, todos à mesma distância do centroide (até 0,5%), sem lado maior que 1/8 da volta. Polígono regular de poucos lados, meio círculo fechado por corda, anel com furo e círculo com vértice editado não recebem raio. Quando o círculo é editado, o valor some em vez de ficar errado.
- A ferramenta Círculo grava um polígono de 72 lados. A área e o perímetro mostrados são os dessa geometria, a mesma que vai para a exportação. Com R = 12,5 m: área de 490,25 m², contra πr² = 490,87 m²; perímetro de 78,51 m.

## Círculo arrastando no mapa

A janela do Círculo ganhou o botão **◎ Desenhar arrastando no mapa (centro → raio)**:

- **Gestos:** aperte no centro, arraste e solte no raio; ou clique no centro e depois no ponto do raio.
- **Prévia:** mostra o círculo e a linha do raio, com "R = … m" ao lado do cursor.
- **Ímã:** vale para os dois pontos, como no resto do desenho: centro de outro círculo, vértice, linha.
- **Mapa:** não desliza enquanto o raio é definido. Ao terminar ou cancelar (Esc, outra ferramenta), volta à regra da ferramenta seguinte.

## Ímã no centro da feição

Nenhuma mudança foi necessária. O snap "centro", ligado por padrão, já reconhece o centroide de área, que num círculo é o centro. Foi conferido com cliques reais nas ferramentas ponto, linha e círculo: o indicador mostra "centro" e o ponto cai exatamente nele.

## Mover, Copiar e Colar no menu da feição

O menu que abre ao clicar numa feição ganhou três itens:

- **✥ Mover** (ou "Mover somente esta parte", "Mover seleção"): arma o comando Mover para esta feição. Arraste até o destino, ou clique na base e no destino. Com o editor ligado, a feição dele passa a ser esta antes de armar.
- **⎘ Copiar** (Ctrl+C): guarda um retrato da feição, da parte ou da seleção. Editar a origem depois não altera o que foi copiado.
- **⤓ Colar** (Ctrl+V): aparece quando há algo copiado.
  - **Destino:** a camada ativa, se for do mesmo tipo e editável; senão, a camada de origem.
  - **Regras de cópia:** atributos pelo nome do campo, FID novo, CRS convertido, as mesmas de "Copiar para outra camada".
  - **Posição:** a cópia nasce no mesmo lugar e o Mover já vem armado para posicioná-la. Esc a deixa onde está, e um Ctrl+Z desfaz a colagem inteira.
- **Teclado:** Ctrl+C/Ctrl+V não agem dentro de campos de texto nem com texto marcado na página.

O módulo `src/modules/cad/feature-clipboard.js` reaproveita as funções de `feature-copy.js`, agora expostas em `GeoMineFeatureCopy.helpers`.

## Verificação

- `tools/smoke_info_circle.cjs`:
  - círculo da ferramenta com raio 12,50 m e diâmetro 25,00 m;
  - hexágono, retângulo e círculo editado sem raio;
  - `$RAIO` na calculadora;
  - meio círculo e anel com furo;
  - painel da feição.
- `tools/smoke_circle_drag_move_clipboard.cjs` (mouse real):
  - círculo arrastando, com o centro preso pelo ímã e o mapa parado durante o raio;
  - círculo por dois cliques;
  - Esc no meio;
  - Mover pelo menu;
  - Copiar/Colar pelo menu, com cópia posicionada, atributos e FID;
  - Ctrl+C/Ctrl+V, Esc e Ctrl+Z.

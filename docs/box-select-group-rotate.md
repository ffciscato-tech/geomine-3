# Seleção por retângulo na seta e giro do conjunto

## Pedido

- **Seta (Selecionar):** dá para selecionar uma feição clicando nela, ou arrastando para desenhar um retângulo. Todas as feições dentro dele são selecionadas, exceto as de camadas com cadeado trancado.
- **Girar e mover:** valem para todas as feições selecionadas.
- **Menu da feição:** a opção **Girar** aparece ao clicar na feição. Antes, várias linhas selecionadas não podiam ser giradas.

## Comportamento

- **Retângulo na seta (como no AutoCAD):**
  - **Onde começa:** arrastar com o mouse desenha o retângulo, a partir de qualquer ponto: vazio, interior de polígono ou em cima de uma feição **não** selecionada. Sem arrasto, o clique continua selecionando a feição.
  - **Esquerda → direita: JANELA** (azul, contorno cheio). Entram só as feições **inteiras dentro**. Nas multipartes, entram as partes inteiras dentro, e uma linha que cruza a borda fica fora.
  - **Direita → esquerda: CRUZANDO** (verde, tracejado). Entra tudo o que o retângulo toca.
  - **Camadas ignoradas:** as que têm cadeado (`L.locked`) e as ocultas. O aviso informa quantas camadas com cadeado foram ignoradas.
  - **Somar:** **Shift**, Ctrl ou Cmd somam à seleção atual. Durante esse gesto, o zoom por caixa do Leaflet (Shift+arrasto) fica desligado e volta logo depois.
  - **O que não muda:**
    - em cima de uma feição **já selecionada**, o gesto é o Mover direto; nas alças de vértice e na aresta da feição do editor, é a edição;
    - no toque, o arrasto do dedo continua sendo o pan;
    - a ferramenta "Selecionar por polígono/retângulo" (selpoly) continua igual, selecionando o que toca.
  - **Pan do mapa (defeito corrigido):** arrastar um vértice no editor, terminar a caixa de vértices (Ctrl) ou desligar o editor religava o arraste do mapa no desktop. Daí em diante, o arrasto na seta movia o mapa em vez de desenhar o retângulo. Agora esses pontos voltam à regra da ferramenta pelo helper `mapaPanPadrao()` (`06-map-tools-snap.js`): no desktop, o mapa anda com a roda pressionada, e no toque com o dedo. Além disso, o retângulo desliga o arraste do mapa durante o gesto, se o encontrar ligado.
  - Implementado em `08-selection-and-drawing.js`:
    - `mselSelect(anel,{modo:'dentro'|'toca',somar,caixa})`;
    - `caixaNaSeta`/`naSelecao` em `mselBind`;
    - o clique que fecha o arrasto é engolido.
- **Clique numa feição que já faz parte de uma seleção múltipla:**
  - **Seleção mantida:** o clique não reduz a seleção a uma só feição (`pickFeature`).
  - **Menu:** abre normalmente, e lá estão **Mover** e **Girar seleção**, que valem para o conjunto.
- **Mover:** arrastar uma feição selecionada (ou usar Mover no menu) leva o conjunto inteiro. Esse comportamento já existia (`GeoMineDragMove`).
- **Girar:**
  - **Menu:** o item **⟳ Girar** fica no menu da feição.
  - **Uma feição:** gira em torno do centro dela, como antes.
  - **Várias feições ou partes:** a janela Girar mostra "N feições/partes selecionadas giram juntas".
    - **Ângulo e azimute:** o conjunto gira em torno do **centro do retângulo envolvente** da seleção.
    - **Com o mouse:** o giro livre segue o cursor, com o mesmo centro.
    - **Desfazer:** um único Ctrl+Z desfaz o giro do conjunto inteiro (entrada `geomlote`).
  - **Geometria:**
    - as contas são feitas no CRS de trabalho e voltam para o CRS de cada camada;
    - o Z é preservado;
    - as hachuras CAD acompanham quando a feição gira inteira;
    - as cotas CAD não entram no conjunto.
  - **Bloqueios:** o giro é recusado, com aviso, se houver feição em camada com cadeado, oculta, protegida (derivada do projeto) ou sem permissão de colaboração.
  - Implementado em `modules/cad/mouse-rotation.js` (`rotateSelection`, `isGroup`, caminho de grupo em `start`/`commit`) e em `27-vector-editor.js` (`edAbreGirar`, `edTransform('girar')`).

## Verificação

`tools/smoke_box_select_group_rotate.cjs` (navegador isolado, mouse real, dados sintéticos):

1. **Retângulo:** seleciona L1, L2 e Q1. L3 cruza a borda e fica fora. A camada com cadeado é ignorada, e o clique do arrasto não abre o menu.
2. **Shift + retângulo:** soma Q2, sem zoom por caixa.
3. **Arrastar uma das feições:** move as quatro, e Ctrl+Z devolve.
4. **Clique numa selecionada:** a seleção fica e o menu traz "Girar seleção". 90° por ângulo giram as quatro em torno do centro do conjunto, e um Ctrl+Z desfaz.
5. **Girar com o mouse:** o conjunto gira inteiro e o giro é rígido.
6. **Feição avulsa:** pelo menu, Girar 90° só nela, em torno do centro dela.
7. **Direção do arrasto:** da direita para a esquerda é cruzando (verde tracejado) e pega também L3, que cruza a borda. Da esquerda para a direita é janela (azul, contorno cheio).
8. **Arrasto sobre uma feição:** começando em cima de uma linha não selecionada, o gesto também vira retângulo e não abre o menu.
9. **Depois de editar vértice:** com o editor, o arrasto de vértice não religa o pan. O retângulo seguinte seleciona sem mover o mapa, e desligar o editor também não religa o pan.

O clique que confirma o giro com o mouse engole cliques por 400 ms, então o teste espera 450 ms antes do próximo.

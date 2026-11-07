# Cotas CAD: fora da legenda do Layout e com Negrito/Itálico

## Pedido

- **Legenda:** no modo Layout, as cotas (de figuras geométricas) não precisam aparecer na legenda.
- **Fonte:** a fonte das cotas deve ter as opções de negrito e itálico.

## Comportamento

- **Legenda do Layout:**
  - **O que sai:** a camada de cotas CAD (`GeoMineDimensions.isLayer`) não entra na legenda da prancha nem na lista de itens da legenda (checklist).
  - **O que fica:** as cotas continuam desenhadas na prancha (linhas, setas e texto), e as outras camadas não mudam.
  - **Onde:** `legendNodeMapVisible` em `17-layout-printing.js`. A checagem usa `globalThis` porque os validadores de legenda rodam esse trecho em vm, sem `window`.
- **Negrito e Itálico:**
  - **Onde ficam:** são caixas novas em "Estilo das cotas", na janela de propriedades da camada de cotas. "Aplicar a todas as cotas" aplica e entra no desfazer (Ctrl+Z).
  - **Fonte da verdade:** o rótulo da camada (`L.lbl.style`: `normal`, `bold`, `italic` ou `bold italic`). Por isso, o mesmo ajuste feito na aba Rótulos aparece marcado aqui. Sem rótulo, vale `dimensionStyle.bold/italic`.
  - **Onde o estilo vale:**
    - no rótulo do mapa;
    - no texto da prancha do Layout (`font-weight`/`font-style`);
    - na prévia da cota em criação;
    - no DXF exportado.
  - **No DXF:** o estilo de texto ganha sufixo (`GM_DIM_Arial_N_I`) e aponta para o TrueType da variante. Por exemplo, Arial usa `arial`, `arialbd`, `ariali` e `arialbi.ttf`; Calibri, Times, Courier e Verdana seguem a mesma lógica.
- **Ajuste menor:** o campo "Tamanho da seta" mostrava resíduo de ponto flutuante (0,32000000000000006). Agora mostra até 6 casas.

Implementação em `modules/cad/dimensions.js`:

- `styleOf`, `fontStyle` e `setLayerStyle`;
- `applyStyle` e `properties`;
- `dxfStyles`/`dxfText` com a tabela `TTF`.

## Verificação

`tools/smoke_dims_legend_font.cjs` (navegador isolado, cliques reais, dados sintéticos):

1. Uma cota de 5,00 m é criada num retângulo.
2. **Layout:**
   - "Retângulo" aparece na legenda;
   - "Cotas CAD" não aparece na legenda, na lista de itens nem no SVG;
   - o texto "5,00 m" continua na prancha.
3. **Negrito + Itálico na janela:**
   - o rótulo do mapa fica com peso 700 e itálico, e o texto da prancha também;
   - o DXF traz o estilo `GM_DIM_Arial_N_I` com `arialbi.ttf`.
4. **Reabrir a janela:** as caixas aparecem marcadas. Tirar o itálico deixa só negrito, e Ctrl+Z volta para negrito itálico.

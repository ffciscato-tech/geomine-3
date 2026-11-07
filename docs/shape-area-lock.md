# Formas geométricas pela área, com medida fixa

## Pedido

Ao desenhar uma figura geométrica, como um retângulo, poder digitar a área desejada. Uma caixa de marcar congela uma dimensão: com o comprimento fixo, a largura varia para atingir a área. Assim dá para desenhar na proporção desejada.

## Comportamento (janela de Formas: retângulo, quadrado, círculo, elipse, polígono regular)

- **Campo Área (m²):** mostra a área atual e acompanha qualquer mudança nas medidas e no nº de lados.
- **Ao digitar a área:**
  - **Retângulo:** a medida marcada com **🔒 fixar** (comprimento ou largura) fica, e a outra se ajusta. Sem nenhuma marcada, a proporção atual é mantida, com as duas medidas escalonadas.
  - **Elipse:** idem com os semi-eixos.
  - **Quadrado, círculo e polígono regular:** o lado ou o raio se ajusta.
- **Uma só medida fixa:** marcar uma caixa desmarca a outra, porque com as duas fixas a área não teria como ser atingida.
- **Área exata:** a conta é a do polígono criado (`formaGeom`). Círculo e elipse têm 72 lados (área = n/2·sen(2π/n)·r²), então a área gravada na feição (`AREA_M2`) é a digitada, e não πr² arredondado.
- **Medidas:** os campos aceitam decimais livres (`step="any"`).

Implementação em `28-drainage-and-basin.js`:

- `formaAreaDe` / `formaMedidasDaArea`: as contas, nos dois sentidos;
- `formaAreaLiga`: os eventos da janela;
- campos novos em `formaModal`.

## Caixa da Hidrologia (Bacia de retenção / contenção)

O mesmo vale para a boca da caixa no retângulo paramétrico (C × L):

- **Campos:** "🔒 fixar" em Comprimento C e em Largura L, e o campo **Área da boca (m²)** (`bcA`).
- **Comportamento:** `areaTravaLiga` usa as mesmas contas (`formaMedidasDaArea`). A área acompanha C e L; ao digitar a área, a medida fixa fica e a outra se ajusta; sem nenhuma fixa, a proporção é mantida. Só uma fica fixa por vez.
- **Gerar caixa:** lê C e L do painel como antes, e a área informada é a da boca (topo no terreno).

## Verificação

`tools/smoke_shape_area.cjs`:

- **Retângulo:**
  - a área acompanha o comprimento;
  - comprimento fixo: 150 m² dá largura 6;
  - largura fixa: 300 m² dá comprimento 50, e a outra caixa é desmarcada;
  - sem fixa: 600 m² mantém a proporção, e a feição criada tem 600,00 m².
- **Círculo:** 500 m², com o raio igual ao `$RAIO` da feição.
- **Elipse:** semi-eixo X fixo, 300 m².
- **Polígono regular:** a área acompanha o nº de lados; 100 m².
- **Caixa da Hidrologia:** área da boca 200 → C 30 dá 300; C fixo + 450 dá L 15; L fixo + 600 dá C 40, e a caixa de C é desmarcada; sem fixa, 2400 mantém a proporção.

A ferramenta de forma ignora o clique a menos de 250 ms do anterior (proteção contra duplo clique). O teste espera 400 ms entre uma forma e a próxima.

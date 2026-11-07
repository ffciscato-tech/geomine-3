# APP por calha com margem detalhada (MDT de 15 cm)

## Problema

Projeto `BN_Drenagem_revisao_v10_refino_focado.ccmgis`, camada "Hidro Pronta - revisada v10": 353 calhas e **340.946 vértices**. As margens foram traçadas no MDT de 15 cm, com um vértice a cada 20–50 cm.

"Gerar APP" parava logo no começo com *"Mais de 100 mil vértices: processe por trechos ou simplifique uma cópia antes de gerar a APP."* A mensagem aparecia abaixo da barra de progresso vazia, fora da área visível da janela.

Levantar só o limite não resolvia, porque o motor tinha três gargalos:

1. **Uma seção por aresta, no mínimo.** Uma calha de 3 km com arestas de 20 cm dava 15 mil seções em vez de ~650 a cada 5 m. Acima de 4.000 seções, a calha caía na largura média.
2. **Um disco de 128 lados em cada vértice da margem** para formar a faixa: centenas de milhares de discos.
3. **A união global das 353 calhas** (341 mil vértices) antes de recortar a água.

## Correção

- **Seções ao longo do perímetro** (`riparian-width.js`):
  - **Espaçamento:** as seções ficam a cada `passo` metros do perímetro, ou seja, perímetro ÷ passo seções.
  - **Margem de cada seção:** cada trecho leva os vértices originais que contém, então a faixa parte da margem real.
  - **Posição:** a seção sai do meio da porção de aresta mais longa do trecho. Numa quina exata, a única corda válida corria sobre a borda (o teste da calha de 12 m dava uma classe de 100 m falsa).
  - **Limites:** o orçamento de cálculo passou a ser proporcional ao número de arestas e seções, e o limite por anel subiu para 60 mil vértices.
- **Generalização explícita só para traçar a faixa** (`riparian-app.js`, `generaliza`/`faixa`):
  - **Como:** Douglas-Peucker com tolerância de 10 cm, abaixo do pixel de 15 cm do MDT. A distância da faixa é acrescida do **desvio real** dos vértices retirados.
  - **Garantia:** todo ponto da margem original fica a ≤ desvio da cópia. Por isso, a APP medida da borda real fica sempre inteira dentro da faixa, e o excesso é ≤ 2 × desvio.
  - **Sem vértice retirado** (geometrias simples), a faixa é idêntica à de antes.
  - **Registro:** o desvio usado fica no campo **`GEN_FAIXA_M`** de cada área.
- **Água recortada localmente, com a geometria original** (`semAgua`): cada faixa perde as calhas cuja caixa envolvente a toca. Não há mais a união global.
- **Robustez da biblioteca de recorte:**
  - **Referencial deslocado:** cada operação que aborta ("Unable to find segment…", "Unable to complete output ring") é refeita em referenciais deslocados por frações de metro, e o resultado volta ao lugar com erro de ~1e-12 m.
  - **Terceira tentativa por calha:** em `seguro`, depois do arredondamento a 1 cm, a margem é generalizada a 0,5 m, ainda compensada pelo desvio, e isso fica registrado em `GEN_FAIXA_M`.
  - **Fusão:** a fusão das faixas não arredonda mais a 1 mm de saída. Isso empurrava para dentro da água um vértice que estava sobre uma margem inclinada. O arredondamento a 1 cm continua como segunda tentativa de cada faixa recusada.
- **Limite:** o teto de vértices de entrada passou para 1,5 milhão.
- **Mensagem visível:** ao terminar (APP criada ou erro), a janela rola até a mensagem, que fica abaixo da barra de progresso.

Uma alternativa testada foi descartada: construir a faixa com retângulos e leques de arco só no lado externo das dobras, que é o buffer exato. Ela deixa vértices exatamente coincidentes, a biblioteca falhou mais e ficou mais lenta.

## Resultado no projeto real (cópia local, mesma configuração da tela do usuário)

- **Tempo:** 164 s para as 353 calhas. Todas receberam APP.
- **Resultado:** 441 áreas contínuas e 658,72 ha; classes de 30, 50 e 100 m; 34.094 seções de conferência.
- **Largura média:** 10 calhas estreitas (2 a 8 m) não puderam ser medidas seção a seção e receberam a APP pela largura média. Todas ficaram com 30 m e estão listadas para conferência.
- **Conferência por amostragem:**
  - 600/600 pontos a 29,5 m da margem real estão dentro da APP;
  - 619/619 pontos a 0,5 m também;
  - 0/300 pontos sorteados dentro das calhas caíram na APP.
- **`GEN_FAIXA_M`:** ≤ 0,1 m, exceto numa área (0,49 m), a da calha que precisou da 3ª tentativa.

## Verificação automática

- **`tools/smoke_riparian_dense.cjs` (novo):** 20 calhas diagonais com margem em degraus de 15 cm, cerca de 113 mil vértices.
  - Gera sem recusa e sem calha de fora.
  - As seções seguem o perímetro ÷ 5.
  - Nenhum ponto da água fica na APP.
  - Os pontos a 29,5 m da margem estão na APP.
  - `GEN_FAIXA_M` fica ≤ 0,1 m, e não há faixa além de 2 × desvio.
- **Testes existentes:** `validate_riparian_width.mjs`, `smoke_riparian_app.cjs` e `smoke_riparian_auto.cjs` continuam passando.
- **Conferência da faixa contra a distância exata:** 36 mil pontos em polilinhas aleatórias. Nenhum ponto a ≤ 30 m ficou de fora, e nenhum ponto a > 30,21 m entrou.

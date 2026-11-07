# Copiar ou mover feições para outra camada

## Comportamento

- **Clique direito** sobre uma feição seleciona-a e abre o menu da feição (o mesmo do clique esquerdo). No interior de um polígono, longe da borda, o clique direito também encontra a feição; vence a camada mais acima na árvore.
- O menu ganhou **Copiar para outra camada** e **Mover para outra camada**. Se a feição clicada fizer parte de uma seleção múltipla, os itens viram **Copiar/Mover seleção para outra camada** e levam todas as feições/partes selecionadas.
- Na caixa **Seleção múltipla**, os botões **⇪ Mover p/ outra camada** e **⧉ Copiar p/ outra camada** fazem o mesmo para a seleção atual (úteis no tablet). O antigo "Mover p/ nova camada" (`<camada>_sel`) ficou coberto pela opção **Nova camada…** do diálogo.
- O destino é uma camada **existente do mesmo tipo** (pontos, linhas ou polígonos), editável, diferente da origem, ou **Nova camada…**, que pede um nome livre: um nome já usado no projeto é recusado.
- **Copiar** não altera a origem. **Mover** retira da origem as feições inteiras ou, numa multiparte, só as partes selecionadas (as demais partes ficam).
- As feições são reprojetadas para o CRS do destino e preservam a cota Z (`zg`). Partes selecionadas de uma multiparte viram uma única feição com essas partes.
- Atributos são levados pelo **nome do campo** (sem diferenciar maiúsculas). Campos que não existem no destino são ignorados, a menos que se marque **Criar no destino os campos que faltam**. O `FID` do destino é renumerado. Uma camada nova recebe todos os campos da origem.
- Camadas com editor e metadados próprios (geologia, cava, TIN e rampa por bancada) não aparecem como destino. Mover também recusa origem bloqueada/sem reserva e resultados vinculados da calha (`_channelLink`): para esses, use Copiar.
- Numa sala de colaboração, só aparecem camadas reservadas por você (a reserva acompanha a camada ativa); o diálogo avisa para ativar a camada de destino antes.
- Depois da operação, a camada de destino fica ativa e as feições levadas ficam selecionadas. **Um Ctrl+Z** desfaz tudo: remove as feições (e os campos criados) do destino ou a camada criada e, ao mover, devolve cada feição à sua posição original na origem.
- Durante um desenho ou edição em andamento, o clique direito apenas seleciona, sem abrir o menu sobre o traçado.

## Estrutura

`modules/cad/feature-copy.js` concentra o diálogo e a operação (`window.GeoMineFeatureCopy.open(refs)` para copiar e `.move(refs)` para mover, com `refs` no formato dos itens da seleção múltipla). No núcleo ficam somente os pontos de entrada: os itens do menu da feição, os botões da seleção múltipla, o clique direito com a busca no interior do polígono (`poligonoSobPonto`) e o desfazer `featadd`/`featmove`.

## Verificações

- `tools/smoke_feature_copy.cjs` (navegador isolado, dados sintéticos): clique direito em linha e no interior de polígono, cópia reprojetada com atributos pelo nome e campos criados, nova camada com nome livre/recusado, seleção múltipla, tipos misturados recusados, polígono de cima vence, mover feição inteira e só uma parte de multiparte com Ctrl+Z restaurando posições, origem bloqueada ou vinculada recusada. `PLAYWRIGHT_MODULE`, `CHROME_PATH` e `APP_PATH` permitem rodá-lo fora do macOS.

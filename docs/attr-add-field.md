# "+ Campo" da tabela de atributos cria coluna vazia

## Problema

O botão **+ Campo** da tabela de atributos abre a calculadora de campo. Com "Criar campo novo" marcado e a expressão em branco, **Aplicar** não criava nada: só aparecia, na prévia, o aviso "Escreva uma expressão…", e a janela continuava aberta. Quem queria apenas acrescentar uma coluna para digitar os valores na tabela ficava sem campo.

## Comportamento agora

- **Campo novo sem expressão:** a coluna é criada vazia (texto em branco ou número nulo) em todas as feições, a tabela é refeita, a coluna nova é trazida para a vista e as células já podem ser editadas. Aviso: "Campo criado vazio: NOME — preencha na tabela". O rótulo da expressão indica "(em branco: o campo novo é criado vazio)", e a prévia diz o mesmo.
- **Campo novo com expressão** ou numeração automática: como antes.
- **Atualizar campo existente** continua exigindo expressão, para não apagar os valores por engano.
- **Nome repetido** é recusado também quando muda só a caixa ("obs" × "OBS"), porque DBF e QGIS tratam os dois como o mesmo campo.
- Camada sem lista de campos não quebra mais o Aplicar; a revisão da camada (`_rev`) é incrementada, como na edição de célula.

## Verificação

`tools/smoke_attr_add_field.cjs` (navegador isolado, polígonos sintéticos): texto e número sem expressão, edição da célula nova, expressão `$ID*2`, nome repetido em outra caixa, atualizar existente sem expressão e gravar/reabrir o projeto com os campos vazios. `PLAYWRIGHT_MODULE`, `CHROME_PATH` e `APP_PATH` permitem rodá-lo fora do macOS.

`tools/validate_field_calculator_text_roundtrip.mjs` ganhou o stub de `GeoMineProjectOpening`, exigido por `loadProject` desde a abertura de projeto em etapas.

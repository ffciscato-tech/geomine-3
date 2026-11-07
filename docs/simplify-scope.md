# Simplificar por camada ou feição

O módulo `src/modules/cad/simplify-scope.js` fornece o painel e a operação. Os pontos de entrada existentes no editor encaminham para ele; a ordem está em `src/module-order.json`.

- Escolha a camada de linhas/polígonos e o alcance da operação.
- Feição selecionada: altera somente a feição escolhida; pode desfazer.
- Camada inteira: cria uma camada independente, incluindo feições filtradas, sem alterar a original; pode desfazer a criação.
- Tolerância em metros no CRS projetado de trabalho. Zero preserva todos os vértices.
- Preserva atributos, coordenadas originais dos vértices retidos, multipartes e cotas Z correspondentes. Recusa Z com contagem incompatível.
- Anéis que colapsariam são mantidos e contabilizados no aviso. Não há simplificação topológica conjunta de limites vizinhos.
- Verifica bloqueio, permissão e mudanças de projeto/camada antes de aplicar. Prepara os resultados antes de editar a camada.
- Não altera salvamento, autenticação, regras Firebase ou importação de rasters.

Validação: `node tools/smoke_simplify_scope.cjs` executa em navegador isolado, sem rede: painel, troca de camada, cancelamento, ambos os escopos, desfazer, atributos, Z, serialização, multipartes, furos, anéis, Z legado, CRS geográfico de origem, bloqueio e entrada inválida.

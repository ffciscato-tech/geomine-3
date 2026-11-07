# Suavizar por feição ou camada

O módulo `src/modules/cad/smooth-scope.js` fornece o painel, preparação dos resultados e suavização Chaikin. A ribbon e o comando legado encaminham ao mesmo painel por `edAbreSuavizar()`.

- Escolher a camada de linhas/polígonos e o alcance: feição selecionada ou camada inteira.
- Camada inteira cria uma cópia independente (inclui feições filtradas), conservando a original, atributos, grupo e simbologia. Desfazer remove a cópia.
- Feição selecionada altera somente aquela feição e permite desfazer. Os vínculos existentes de cota automática e drenagem são mantidos.
- De 1 a 5 iterações inteiras; cálculo em CRS projetado de trabalho, com retorno ao CRS original.
- Extremidades de linhas abertas preservadas; multipartes, furos e convenção de fechamento dos anéis conservados.
- Interpolação XY e Z com os mesmos pesos 1/4 e 3/4. Z desconhecido não vira zero. Recusa vetor Z de tamanho incompatível.
- Limite de 1 milhão de vértices na saída; bloqueio, permissão e mudança de projeto/camada verificados antes de aplicar. Dados preparados antes de modificar a camada.
- Suavizar altera a forma e pode alterar a área. Limites compartilhados não são ajustados topologicamente em conjunto. Não usar em cristas/pés/limites que precisam permanecer angulosos.

Validação: `tools/smoke_smooth_scope.cjs` cobre interface, ambos os alcances, desfazer, troca de camada, cancelar, interpolação XY/Z, anéis e furos, Z ausente/legado, endpoints geográficos, limite de crescimento e validações. `tools/smoke_simplify_scope.cjs` verifica regressão do Simplificar. Testes em navegador isolado, sem rede nem projeto do usuário.

Não altera autenticação, salvamento, importação de ortofotos ou otimizações anteriores de abertura.

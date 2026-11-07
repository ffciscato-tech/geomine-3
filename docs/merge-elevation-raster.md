# Mesclagem de curvas e cotas — 23/09/2026

## Causa reproduzida

O importador representa uma PolyLineZ de uma parte como `geom=[pontos]`, `multi=true`, `zg=[cotas]`. `runMerge` achatava a geometria para `geom=pontos`, `multi=false`, mas copiava `zg` intacto e por referência. O coletor TIN procurava números e encontrava um vetor dentro de outro: nenhuma amostra válida, disparando “Menos de 3 vértices com cota válida”.

No projeto fornecido, as duas camadas de curvas têm 1.004 + 4.467 feições (5.471 curvas), com 1.180.563 vértices e cotas entre 6 e 94 m. A versão anterior gera zero amostras após mesclar; o arquivo original contém todas as cotas.

## Correção

No módulo existente `src/core/parts/25-geoprocessing-tin.js`:

- `gtZg` devolve uma lista de cotas por parte, normalizando o invólucro extra inequívoco das mesclagens antigas, sem modificar a feição. Partes com tamanhos incompatíveis não são reindexadas nem unidas por suposição.
- Mesclagem armazena geometria e Z com o mesmo aninhamento, sem compartilhar os vetores de cota originais. Preserva também Z/dimensões embutidas nos vértices durante a transformação XY.
- O coletor e o seletor da fonte TIN usam a mesma leitura. Cotas nulas/vazias não são convertidas para zero; zero e negativos reais continuam válidos. XYZ embutido também é reconhecido.
- Camadas já mescladas pela versão anterior podem gerar raster sem repetir a mesclagem. Não há regravação automática nem alteração do projeto do Drive.

## Validação

`tools/validate_merge_elevation.cjs` verifica parte simples, multipartes, mescla antiga, XYZ, cota zero/negativa, tipos numéricos, ausência de cota, dimensões incompatíveis, independência de arrays e transformação XY sem mudar Z. Com o projeto como argumento, reproduz a falha anterior (0 amostras) e compara a leitura antiga recuperada à nova mesclagem: 1.181.627 amostras, nenhuma cota ausente, valores idênticos.

`tools/smoke_merge_raster.cjs` abre as duas camadas reais em um navegador isolado, executa o comando de mescla, serializa/reabre pelo caminho real do projeto e gera a imagem pela interface de Topografia. Grade de teste 808×510, célula 5 m, 254.833 células válidas, 6–94 m, todas as células válidas pintadas no raster e overlay 2D presente. Sem erros JavaScript; hash do arquivo original preservado. O teste não publica nem modifica o projeto de referência.

Também aprovadas as verificações existentes de camada derivada/árvore, política de recorte TIN (curvas abertas), CRS do Layout, perfil longitudinal e isolamento de snapshots. Publicação somente do app, mantendo login e regras Firebase.

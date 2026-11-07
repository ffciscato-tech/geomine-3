# Resultado de triangulação visível no mapa 2D

Uma superfície recém-gerada podia aparecer no 3D, mas ficar encoberta no mapa 2D. A imagem e suas coordenadas estavam corretas: `runTIN` registrava o raster e deixava `stackSync` inserir sua chave no fim da pilha, abaixo do MDT e dos polígonos existentes.

O comando **Superfície Raster / Superfície TIN** passa a inserir explicitamente o novo resultado no topo da pilha antes do primeiro desenho. A ordem relativa, os grupos e os estilos dos demais itens são preservados. O comportamento anterior de desligar resultados antigos da mesma camada fonte não muda.

Não alteramos a ordem automaticamente ao redesenhar, trocar de vista ou reabrir um projeto: essas operações devem respeitar a composição salva pelo usuário. Para uma superfície já criada e posicionada abaixo do MDT, arraste sua linha na árvore de camadas para cima do MDT e das demais camadas que a encobrem. Não é necessário recalcular a superfície para corrigir somente essa ordem.

## Verificação

- Reproduzir com o projeto completo, mantendo rasters e polígonos visíveis, em vez de isolar a camada de curvas.
- Conferir a imagem anexada ao mapa, o pane e seu z-index, além dos pixels da imagem individual.
- Confirmar o novo resultado acima das demais camadas e a preservação da ordem relativa/grupos existentes.
- Conferir Raster e TIN, salvar/reabrir e manter uma ordem alterada manualmente.
- Manter a regressão anterior de curvas abertas, máscaras explícitas e persistência da política de recorte.

Testes: `node tools/validate_tin_map_order.cjs` e `node tools/smoke_tin_map_order.cjs dist/GeoMine.html /caminho/HidrogeologiaV2.ccmgis`. O teste real requer cópia autorizada do projeto de diagnóstico; esse arquivo privado não integra a publicação. `GEOMINE_BASELINE=1` permite conferir a reprodução da falha em uma versão anterior.

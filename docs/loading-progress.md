# Progresso de carregamento de rasters

Módulo: src/modules/ui/loading-progress.js.

A área Comandos exibe uma barra para a etapa de leitura ativa. Percentuais vêm dos eventos reais de leitura ou de progSet; etapas sem total conhecido usam indicador indeterminado. Não representa um percentual inventado do processo inteiro.

Uma segunda barra agrega os tiles de alta resolução da ortofoto e do MDT em processamento, incluindo grades simultâneas. Mudanças de zoom, retirada de tiles, conclusão, falhas e remoção da camada atualizam ou encerram a indicação. Falhas preservam o aviso de prévia. A área ganha altura temporariamente para manter ambas as barras visíveis.

O mapa continua disponível. O seletor nativo de arquivos/Drive antes de entregar o arquivo ao aplicativo não fornece progresso mensurável. Login, permissões, salvamento e decodificação não são alterados.

Validação: smoke_loading_progress.cjs (percentuais conhecidos/desconhecidos, GeoTIFF real, cancelamento, erro, tiles simultâneos, temporizadores antigos, remoção, desktop/tablet); smoke_mdt_controls.cjs; validate_tile_lifecycle.mjs; validate_ortho_tablet_relink.mjs.

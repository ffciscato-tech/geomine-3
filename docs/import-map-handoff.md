# Importação: retorno ao mapa no Android

O módulo `modules/ui/import-map-handoff.js` separa o recebimento do arquivo da leitura. Depois do evento de seleção, copia os arquivos, limpa o input para permitir nova seleção do mesmo arquivo e cede uma pintura antes de iniciar o leitor existente.

Em dispositivos móveis, fecha o ribbon e o painel de origem, volta à vista 2D e mostra o progresso no painel Comandos. No desktop, mantém a vista e as propriedades abertas. Abrange a importação geral e a seleção do TIFF original nas propriedades do MDT e da ortofoto. A seleção cancelada não altera a vista nem encerra outra leitura. A troca de projeto ou cancelamento durante a transição impede iniciar uma leitura obsoleta.

O seletor nativo pertence ao Android/Drive: não pode ser fechado pelo aplicativo antes de entregar o arquivo. A alteração não acelera o download prévio do Drive nem a decodificação; evita iniciar processamento antes de o mapa poder reaparecer. As perguntas posteriores de importação, como classificação de DXF, continuam disponíveis.

Verificação: `tools/smoke_import_map_handoff.cjs` usa o aplicativo completo em Chrome isolado, com desktop e Android emulado. Confere pintura antes da leitura, retorno ao mapa, cancelamento, reimportação do mesmo arquivo, GeoJSON real, grade GeoTIFF nativa real e encaminhamento da ortofoto. A decodificação da ortofoto é substituída apenas nesse cenário de UI. Regressões de controles MDT, identidade do arquivo salvo e isolamento do snapshot também aprovadas. Não equivale a teste em aparelho Android físico.

# Consulta EPSG e cidades — 23/09/2026

Módulos independentes `cartography/city-catalog.js` (dados) e `cartography/crs-city-navigation.js` (interface), slots 106/107. O clique no EPSG abre mapa de referência, consulta de área de uso e busca local por cidade brasileira. A seleção prévia de outro EPSG é apenas consulta. “Ir para cidade” altera somente o centro/zoom do mapa Leaflet: não transforma nem reatribui coordenadas, não altera camadas ou sua ordem. Os comandos explícitos de alterar CRS do projeto/camada continuam acessíveis no rodapé.

## Fontes e limites

- IBGE, Localidades do Brasil 2022: https://geoftp.ibge.gov.br/organizacao_do_territorio/estrutura_territorial/localidades/Localidades_do_Brasil/2022/Localidades_Brasil_gpkg.zip . Tabela BR_localidades_2022, apenas CT_LOCALIDADE=Cidade; 5.570 códigos municipais únicos. Duplicatas das capitais (capital/sede municipal) consolidadas por CD_MUN, preferindo capital. Usa o ponto da sede municipal, não extensão territorial. Não inclui endereços, POIs ou atualizações municipais posteriores à edição 2022. Nome + UF, pesquisa sem acentos, filtro UF; nenhum nome pesquisado é transmitido a terceiros.
- Área de uso EPSG extraída do PROJ proj.db, EPSG v12.029, data 2025-10-02 (PROJ 9.8.1). Bboxes oficiais para códigos suportados; o retângulo é explicitamente descrito como envolvente, não limite exato. Códigos legados sem entrada não recebem região presumida. As áreas globais são recortadas em ±85° para exibição Mercator; dados originais preservados. Zonas que cruzem antimeridiano são divididas para desenhar.
- Contexto de mapa: Natural Earth lowres distribuído nos fixtures do pyogrio/QGIS, linhas de contorno ilustrativas, domínio público: https://www.naturalearthdata.com/about/terms-of-use/ . Não é base cadastral nem fronteira legal.

`tools/build_city_catalog.py` recebe explicitamente os três arquivos de origem e gera catálogo JS incorporado ao HTML offline. O build normal não depende de QGIS, conexão ou dos arquivos originais. Não publicar GPKG, ZIP ou fontes de projetos privados.

## ESRI

Corrigida apenas URL do fundo 2D em `06-map-tools-snap.js`: ArcGIS usa `/tile/level/row/column`, portanto `{z}/{y}/{x}`. Estava `{z}/{x}/{y}`. As rotas de Layout já usavam a ordem correta. Referência primária: https://developers.arcgis.com/rest/services-reference/enterprise/map-tile/ . Nenhuma alteração de georreferenciamento ou reprojeção dos arquivos do usuário.

## Verificação

`tools/smoke_crs_city.cjs`: app completo, sem rede; cidade com/sem acento, UF, nomes repetidos, ausência de resultado, código sem área oficial, consulta sem alterar CRS, centralização São Paulo, preservação de camadas/seleção, modal adaptado 1440×1000 / 1024×600 / 600×800, fechamento/reabertura e menu antigo de CRS. URL ESRI verificada com x≠y.

Com `GEOMINE_LIVE_ESRI=1`, libera apenas os tiles ESRI após os testes offline, exige imagens 256×256 carregadas e captura o mosaico de São Paulo. Teste aprovado sem erros JavaScript e continuidade visual conferida. Validações existentes de CRS/Layout, árvore A3, estilos, snapshot e salvamento manual, geologia, furos e perfis também aprovadas. A aplicação já contém consulta reversa de localização fora deste módulo; nenhum nome pesquisado é enviado pelo navegador de cidades.

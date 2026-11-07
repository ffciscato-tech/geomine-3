# GeoTIFF esparso (ortofotos e MDT)

## Falha reproduzida

Na versão anterior, `BN_orto_mosaico_50cm.tif` falhou em `SOI not found` ao importar. O arquivo fornecido tem 77.930.425 bytes, 22.010 × 36.133 pixels, RGB + alfa, compressão JPEG, tiles de 512 × 512 e 8 níveis de imagem. Na imagem original, 2.462 dos 3.053 blocos têm offset e byte count iguais a zero. A biblioteca tentava decodificar esses blocos implícitos como JPEG.

## Correção modular

`src/modules/raster/sparse-blocks.js` intercepta somente pares `offset=0` e `byteCount=0` antes da decodificação. Gera os pixels correspondentes com NoData declarado ou zero, conforme o comportamento documentado pelo [GDAL](https://gdal.org/en/stable/drivers/raster/gtiff.html#sparse-files). Para esta ortofoto RGBA, os blocos sem dados permanecem transparentes.

O mesmo caminho atende leitura direta, importação, tiles nativos e Layout, sem converter ou modificar o arquivo original. O cache limitado existente continua responsável pelos blocos. Blocos reais, inclusive corrompidos, seguem para o decoder original; nenhum erro de leitura é convertido indiscriminadamente em transparência. Há cancelamento e limite de alocação por bloco. Amostras esparsas suportadas: inteiros 8/16/32 e floats 32/64, intercaladas ou planares. Outros formatos de amostra esparsa retornam erro explícito.

## Validação

- `tools/validate_sparse_tiff.cjs`: RGBA, NoData/NaN, endian, planar, última faixa parcial, cancelamento, metadata ausente/inconsistente e preservação de erros de blocos reais.
- `tools/smoke_sparse_ortho.cjs <arquivo-local>`: arquivo privado fora do repositório; importação real, conteúdo dos 8 níveis, pixels nativos e recorte nativo para Layout. `TEST_ANDROID=1` seleciona configuração móvel em navegador de teste, não um tablet físico.
- `tools/validate_layout_ortho_resolution.mjs`: 12 cenários de regressão.
- `tools/validate_ortho_lzw_reader.mjs`: 6 cenários de regressão.

O teste desktop da cópia local importou em cerca de 1,6 segundo. Esse tempo não inclui transferência pelo Drive e não é garantia de tempo no dispositivo do usuário. Não houve alteração no login, salvamento, permissões ou arquivo do Drive.

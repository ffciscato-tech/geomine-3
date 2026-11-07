# Calha: original recuperável e faixas estreitas

## Fonte original

`GeoMineChannelNativeSource.resolve` integra o sampler da calha à leitura
nativa já existente. Não altera `r`, `r.d`, os estilos ou o arquivo do usuário.

Ordem: TIFF já aberto na camada; bytes originais com vínculo de revisão
confirmado; cópia em `ALAGIS/rasters` com pasta já autorizada, descritor,
fingerprint amostrado, revisão integral da prévia, geometria e CRS coerentes.
O fingerprint existente não é um hash criptográfico integral do arquivo.
Arquivos de mesma área, handles legados sem identidade comprovada e prévias
reduzidas não são aceitos automaticamente como fonte nativa.

O leitor abre os metadados e amostra janelas nativas de até 128×128 células.
Não chama `demFull`, não reconstrói o raster completo, não solicita permissões
durante a análise e não fecha TIFFs compartilhados. As fontes privadas são
liberadas ao concluir ou cancelar. Esperas têm limite de 45 s por operação e
90 s para a recuperação; contexto, revisão, remoção e troca de projeto são
verificados. Uma restauração concorrente que mude a grade invalida a análise
em vez de misturar os dados; nesse caso, execute novamente.

Quando o arquivo não está disponível, `CHANNEL_NATIVE_MISSING` apresenta o
botão **Localizar MDT original**. O seletor existente abre no clique direto,
inclusive o seletor de arquivos do Android. Cancelar preserva dados e calha.
Após selecionar e validar o original, o usuário pode repetir a análise.
Este fluxo não torna acessível um TIFF que não esteja no dispositivo ou em
uma pasta autorizada.

## Faixas menores que dois pixels

Nos modos atuais `depth` e `auto`, uma largura positiva e geometricamente
válida não é mais recusada apenas por ser inferior a dois pixels. A geometria
interpolada permanece inalterada: não se força largura mínima e não se muda
a resolução do MDT. As demais validações (NoData, margens ausentes, topologia,
eixos ambíguos e limites computacionais) continuam em vigor.

O caso sintético de regressão reproduz largura **1,931 m**, pixel **1 m**,
fundo **63,82 m** e nível **64,32 m**. Não é o projeto real do usuário.
Seções estreitas recebem `resolutionLimited`; resumo, perfil e detalhes em
imagem sinalizam a limitação de precisão. Atributos `RES_LIMIT` (seções) e
`N_ESTREITA` (contagem no polígono) conservam a informação no projeto.
O modo legado `height`, não oferecido na caixa atual, mantém sua política para
receitas antigas. `axisDepth` já aceita uma faixa de um pixel e segue usando
a máscara de preenchimento 2D.

## Verificação

- `validate_channel_native_source.cjs`: fontes reais em memória, helpers reais
  de identidade, caminhos/CRS/dimensões, cancelamento, timeout e ownership.
- `validate_channel_dem_sampler.mjs`: janelas nativas, CRS, NoData, cache,
  recuperação privada, erro acionável e descarte de fonte inválida.
- `validate_channel_extraction.mjs`: regressão 1,931 m e limites 1,999/2/2,001 m,
  entradas imutáveis, margens e segurança geométrica.
- `smoke_channel_native_recovery.cjs`: aplicativo construído, TIFF sintético,
  recuperação da pasta do projeto, mesma camada, ação direta/cancelamento,
  viewport de desktop e tablet.

Não foram alterados projetos reais, configurações de acesso ou dados no Drive.
Publicação deve incluir apenas o aplicativo, nunca fixtures ou capturas de QA.

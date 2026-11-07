# Abertura da ortofoto no Android — 28/09/2026

## Causas encontradas

- A religação do original calculava a escolha da overview com `H0/h`, embora a variável dessa função fosse `hh`. O erro era absorvido e a prévia bilinear processava o nível nativo inteiro. Reprodução com a ortofoto real no Chrome isolado levou cerca de 11 segundos no computador, mesmo usando prévia de 1024. Isso não é um tempo medido no tablet do usuário.
- A mesma função aguardava uma cópia integral para OPFS (Android, >=64 MiB) e abria a fonte sem o cache de intervalos. A restauração dos originais do projeto também usa essa função.
- O importador RGB comum já adiava a cópia, mas preparava 2560/4096 pixels antes de concluir. Leituras de 4 MiB amplificavam o acesso aos metadados distantes do TIFF.

## Correção modular

- Escolha correta da overview na religação, com teste que exige a chamada e o nível reduzido selecionado.
- Religação usa o mesmo leitor limitado por intervalos da importação. A cópia local opcional só começa depois da reconstrução da prévia.
- Android usa prévia inicial de até 1024 pixels; zoom e Layout continuam lendo o original, sem converter, reduzir ou sobrescrever o GeoTIFF.
- Leitor Android usa blocos fixos de 512 KiB por fonte abaixo de 1 GiB. Desktop mantém 4 MiB, arquivos >=1 GiB mantêm 128 KiB. Cache global de 16 MiB e no máximo duas leituras físicas permanecem.
- Uma cópia em segundo plano não pode substituir a fonte depois de outra religação ou troca de imagem/projeto.

## Medição reproduzível

Arquivo local de teste: BN_orto_mosaico_50cm.tif, 77.930.425 bytes, 22.010 × 36.133, oito níveis de imagem mais um diretório de metadados. Chrome isolado no Mac com identificação Android; não é um aparelho Android físico nem mede a transferência do Drive.

A leitura inicial passou de 15.015.865 para 1.908.665 bytes, mantendo quatro leituras físicas. O tempo local da importação passou de aproximadamente 1,64 s para 0,26 s. Após corrigir a seleção da overview, a religação caiu de 11,17 s para 0,218 s, sem a decodificação de milhares de blocos nativos para a prévia. A resolução da prévia passou de 2445 × 4014 para 611 × 1003; os pixels originais continuam os mesmos. Metadados solicitam 48.002 bytes, mas o tamanho antigo dos blocos fazia ler 10.821.561 bytes antes dos pixels.

Executar benchmark_ortho_provider.cjs; APP_PATH permite comparar com o build anterior. PROVIDER_DELAY_MS é latência artificial, não medição do Android. smoke_sparse_ortho.cjs com TEST_ANDROID=1 TEST_RELINK=1 compara pixels de nível nativo, transparência, todos os níveis e a exportação de uma janela em resolução original no Layout. O teste inclui preservação das propriedades durante a religação.

## Segurança e limites

Validações concluídas: leitor de intervalos (21 cenários), cache da fonte (26), salvamento manual (64), leitura amostrada (14 cenários / 151 comparações), first-frame, religação com falhas do provedor e rollback, abertura rápida, revisão da fonte nativa e controles do tablet. Aplicativo completo conferido com TIFF real em configuração desktop e Android simulado, incluindo religação e pixels do Layout. Nenhuma mudança na biblioteca GeoTIFF vendorizada.

Não altera o salvamento manual nem as proteções da correção anterior. Nenhum projeto do usuário é reaberto, gravado ou atualizado pelos testes. Publicação é somente Hosting; autenticação, regras e dados ficam intactos. A página em uso não deve ser recarregada sem uma cópia confirmada das alterações.

A espera do seletor/provedor antes da primeira leitura e o download na nuvem ainda dependem do aparelho e do provedor. Não se promete um tempo no dispositivo sem medição nele. TIFFs sem overviews podem exigir decodificação de muitos blocos mesmo com saída pequena; formatos não suportados pela leitura amostrada mantêm o fallback existente.

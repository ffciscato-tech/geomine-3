# GeoMine Cloud

Portal de publicação privada do GeoMine. A autenticação e a autorização são
aplicadas pelo servidor antes de qualquer rota ou arquivo estático ser entregue.

## Fonte única

O aplicativo não é editado nesta pasta. `src/` e `tools/build.py`, na raiz do
projeto GeoMine, continuam sendo a única fonte do produto. O comando de build
deste portal executa `scripts/sync-geomine.mjs`, que copia somente o artefato
oficial `../dist/GeoMine.html`, registra tamanho e SHA-256 e então monta a saída
de hospedagem.

## Publicação

A publicação inicial deve permanecer privada e limitada ao proprietário. Novos
usuários devem ser incluídos explicitamente na política de acesso do Site; o
HTML não contém usuários, senhas ou tokens.

Projetos, rasters e vetores continuam armazenados no navegador/dispositivo nesta
primeira versão. A hospedagem do aplicativo não envia esses dados ao servidor.

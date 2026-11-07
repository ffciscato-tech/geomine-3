# GeoMine

Fonte de desenvolvimento do GeoMine — GIS, CAD e planejamento de mina.

## Arquivo para abrir

Abra sempre:

`dist/GeoMine.html`

Esse nome permanece estável. O arquivo é gerado; alterações manuais nele serão
substituídas na próxima montagem.

## Fonte oficial

- `src/`: código e estilos editáveis.
- `src/core/parts/`: núcleo legado separado por domínio.
- `src/modules/`: funcionalidades independentes e motor de cava.
- `src/build-overlays/geomine/`: correções recentes ainda em migração para os
  módulos definitivos.
- `tools/build_geomine.mjs`: único orquestrador autorizado a gerar o aplicativo.
- `reference/`: checkpoints imutáveis para auditoria e recuperação.
- `dist/`: arquivos gerados.

Nenhum passo da montagem depende de `Downloads`, da pasta antiga do CCMGIS ou
de outro diretório externo.

## Montagem

```bash
node tools/build_geomine.mjs
```

Para comprovar igualdade com a primeira base aprovada:

```bash
node tools/build_geomine.mjs --verify-golden
```

O orquestrador:

1. monta em `build/` a base modular com as placas e símbolos QGIS;
2. incorpora o motor Cava v10.6 e as evoluções recentes;
3. executa a validação integrada;
4. só depois substitui atomicamente `dist/GeoMine.html`.

## Estado da migração

A fonte está reunida numa única pasta e a montagem é reproduzível. O núcleo
histórico ainda compartilha escopo global e depende da ordem do manifesto; isso
será reduzido gradualmente. Durante essa transição, novos recursos devem entrar
como módulos com contrato explícito, nunca como edição direta do HTML final.

Base aprovada em 02/09/2026:

- tamanho: `8.026.825` bytes;
- SHA-256: `5ab68fde96313b9c2d13e49e60c7f0777df4e7553f79d7d7f3f166e5073f913e`.

## Google Drive

Evite duas sessões alterando os mesmos arquivos ao mesmo tempo. Antes de abrir
o HTML gerado em outra máquina, aguarde o indicador de sincronização da pasta.

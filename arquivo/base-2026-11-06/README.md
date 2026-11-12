# GeoMine

Fonte oficial do aplicativo GeoMine.

## Versão-base

Esta árvore foi extraída exclusivamente de
`CCMGIS2_011_CRS_PROJETO_ARQUIVO_AGRUPADOS.html`. Esse arquivo permanece como
referência histórica imutável; as novas funções do GeoMine são acrescentadas
somente pela árvore modular. Recursos da experiência de placas QGIS não fazem
parte desta fonte oficial.

- arquivo para abrir: `dist/GeoMine.html`
- referência imutável: `reference/GeoMine_001_BASE.html`
- SHA-256 da versão-base: `6341acd1835250188d47e3ae72cadd248b1a2154da2f33ad8fd71f4158e13377`

## Regra de trabalho

Edite somente arquivos dentro de `src/`. O HTML em `dist/` é uma saída gerada
e nunca deve receber alterações manuais.

Para montar e conferir a equivalência com a versão-base:

```bash
python3 tools/build.py --verify-reference
```

Depois da primeira alteração funcional intencional, monte sem comparar com a
referência histórica:

```bash
python3 tools/build.py
```

## Organização

- `src/index.template.html`: estrutura do documento.
- `src/module-order.json`: contrato e ordem de montagem.
- `src/core/parts/`: núcleo legado dividido em partes ordenadas.
- `src/modules/`: recursos organizados por domínio.
- `src/modules/mining/cava2/`: motor Cava v10.6 separado do integrador.
- `src/styles/`: estilos do aplicativo.
- `src/vendor/`: bibliotecas embarcadas para uso offline.
- `tools/build.py`: orquestrador da montagem.
- `reference/`: referência imutável e hashes de proveniência.
- `dist/GeoMine.html`: aplicativo final em arquivo único.

## Exportação em lote

O menu **Exportar → Várias camadas** reproduz a ordem da árvore do projeto,
incluindo grupos e subgrupos, e reúne tudo em um único ZIP. Somente grupos e
subgrupos viram pastas; os arquivos de cada camada ficam diretamente no grupo
correspondente, com prefixos numéricos que preservam a ordem visual. O tipo é detectado
automaticamente: vetores usam Shapefile por padrão, rasters numéricos usam
GeoTIFF e ortofotos usam o GeoTIFF original quando a fonte está ligada; em um
projeto reaberto, usam explicitamente o PNG da prévia + PGW + PRJ. Também é
possível escolher por item GeoJSON, KML, DXF 3D, ESRI ASCII Grid ou XYZ.
Superfícies TIN permanecem bloqueadas até serem rasterizadas.

Cada Shapefile exportado inclui `.shp`, `.shx`, `.dbf`, `.prj` e `.cpg`. A
tabela DBF é gravada em UTF-8 e o `.cpg` declara essa mesma codificação, evitando
acentos quebrados no GeoMine, QGIS e demais leitores compatíveis.

Na janela, **Pastas conforme a árvore** preserva essa hierarquia e aplica os
prefixos numéricos. A opção **Arquivos brutos · sem pastas ou numeração** coloca
todos os componentes diretamente na raiz do ZIP com o nome da camada. O pacote
contém somente os arquivos escolhidos: não acrescenta
`LEIA-ME.txt` nem `manifesto.json`.

Para validar a árvore, grupos/subgrupos, formatos vetoriais e raster, ortofoto,
filtros, multipartes, nomes seguros e falhas parciais:

```bash
node tools/validate_batch_export.mjs
```

## Colaboração em nuvem

Na versão Web autenticada, **Início → Colaboração** permite criar ou entrar
numa sala, convidar contas da CCM e acompanhar pessoas e histórico. A unidade
de edição simultânea é a camada vetorial: colaboradores podem trabalhar em
camadas diferentes; uma reserva renovável impede sobrescrita silenciosa da
mesma camada. Alterações feitas sem conexão entram numa fila local e um
conflito recebido é preservado como uma nova camada para comparação.

O convite autoriza a conta informada, mas não envia e-mail: quem cria a sala
deve encaminhar também o código mostrado na tela. O acesso exige e-mail
`@ccmeng.net` verificado.

Escopo desta primeira versão: a fotografia inicial leva o projeto completo e
a sincronização ao vivo cobre camadas vetoriais — inclusive observações,
contatos, litologias e logs gravados nas feições geológicas. Exclusão de
camada, árvore/grupos, rasters, pranchas e configurações globais das seções
geológicas ainda permanecem locais e devem ser consolidados num `.ccmgis`.

O aplicativo offline continua independente do Firebase. Firestore e Storage
só são usados depois que a pessoa cria ou entra numa sala. O autosave e os
arquivos `.ccmgis` locais continuam funcionando normalmente.

Para preparar a versão autenticada e incluir no `firebase.json` as regras de
Firestore e Storage:

```bash
python3 tools/build.py
python3 tools/publicar_web.py --config web/firebase-config.json
```

Antes de publicar, valide os dois contratos:

```bash
node tools/validate_collaboration_core.mjs
node tools/validate_collaboration_firebase_contract.mjs
```

## Estado da modularização

Estado inicial e regras da pilha possuem módulos independentes. A interface
foi dividida por responsabilidade e dispõe de um registro de extensões para
novas integrações. Veja `docs/compartimentacao.md` para contratos, fontes e
validações da etapa de 06/11/2026.

A autoria é modular e a montagem é reproduzível. Parte do núcleo ainda depende
de ordem de carga e de nomes globais; portanto, a separação atual organiza a
fonte, mas ainda não representa isolamento completo entre todos os módulos.

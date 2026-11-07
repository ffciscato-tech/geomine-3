# CCMGIS modular

Esta é a árvore de desenvolvimento modular do CCMGIS. O arquivo original foi
preservado em `reference/`; o trabalho cotidiano deve acontecer nos arquivos
de `src/`.

## Organização inicial

- `src/index.template.html`: estrutura HTML sem os blocos executáveis.
- `src/module-order.json`: manifesto do orquestrador e ordem de montagem.
- `src/vendor/`: bibliotecas de terceiros mantidas separadas do produto.
- `src/core/parts/`: núcleo legado dividido por domínio; o orquestrador ainda
  concatena as partes no mesmo bloco para preservar o escopo global.
- `src/modules/`: funcionalidades já isoladas conforme seus blocos originais.
- `src/styles/`: estilos do aplicativo e de funcionalidades específicas.
- `tools/build.py`: orquestrador que gera um único HTML offline em `dist/`.

### Cava 2

O motor independente v0.9 está preservado em
`src/modules/mining/cava2/cava-pilha-v09.html` e é aberto na área de trabalho
**Cava 2** por `src/modules/mining/cava2-workspace.js`. O isolamento em iframe
evita colisões entre os IDs e as variáveis dos dois programas.

A barra de integração permite usar a feição selecionada no Mapa 2D como limite
de Cava ou Pilha/DCE, informar a cota-base absoluta e devolver cristas, pés e
rampas ao CCMGIS em camadas 3D. Essas camadas passam a fazer parte do projeto,
da Visão 3D e da exportação DXF como as demais camadas vetoriais.

Durante a montagem, `embed_files` no manifesto incorpora o HTML do motor no
arquivo final. Assim, o desenvolvimento permanece modular, mas o usuário ainda
abre e compartilha somente `dist/CCMGIS_158_PLACAS_QGIS.html`.

## Gerar o HTML offline

```bash
python3 tools/build.py
```

Antes da primeira alteração funcional, a montagem pode ser conferida contra o
original:

```bash
python3 tools/build.py --verify-reference
```

Após qualquer alteração intencional, a igualdade com o original deixa de ser o
critério; passam a valer os testes do módulo alterado e a validação integrada.

## Regra de dependências durante a migração

O manifesto preserva a ordem histórica dos scripts porque o código atual ainda
compartilha símbolos globais. Mover um módulo no manifesto pode mudar o
comportamento. A próxima etapa é dar a cada domínio um contrato explícito e
reduzir gradualmente essa dependência de ordem.

# Arquitetura do GeoMine

A etapa de 06/11/2026 separou o estado inicial, o modelo da pilha e as
responsabilidades da interface. Os contratos e limites atuais estão em
`compartimentacao.md`. O talvegue usa o registro `GeoMineRibbon` para preparar
o catálogo sem substituir `ribbonBuild`.

O arquivo `src/module-order.json` é o manifesto do aplicativo. O orquestrador
insere cada estilo e script no marcador correspondente de
`src/index.template.html`, respeitando rigorosamente a ordem registrada.

O motor da Cava v10.6 fica em arquivo próprio e é convertido para um literal
JavaScript somente durante a montagem. Assim, ele continua isolado no `iframe`
em tempo de execução e permanece legível na fonte.

O resultado continua sendo um único HTML offline. Essa decisão simplifica a
abertura local e a distribuição, mas não significa que todo o JavaScript esteja
desacoplado: o núcleo legado ainda possui dependências globais e contrato de
ordem. Novos recursos devem nascer em módulos com entradas e saídas explícitas,
sem editar diretamente o HTML de `dist/`.


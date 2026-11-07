# Logomarca da contratante no selo A3

O módulo `src/modules/layout/titleblock-client-logo.js` reserva uma célula
independente ao lado da CCM. O selo A3 passa de 89 para 112 mm de largura,
mantendo a altura de 42,275 mm e todos os campos existentes. A faixa da legenda
usa o espaço restante. A4 mantém sua geometria anterior.

Em **Layout → Dados do selo**, o campo **Título acima da logomarca da CCM (A3)**
permite escolher **Contratada** (padrão) ou **Executora**. O título fica acima da
imagem, com espaço reservado, sem sobreposição. O quadro do cliente é identificado
como **Contratante**. A seleção é salva em `seloCompanyRole` por projeto, assim como
a imagem; projetos antigos ou valores inválidos usam Contratada, sem herdar a
escolha do projeto anterior. A4 conserva o desenho anterior.

Em **Layout → Dados do selo → Inserir logomarca do cliente**, carregue PNG, JPG,
WebP ou SVG. A imagem é normalizada para PNG, mantendo proporção e transparência,
com até 1600 px no maior lado. Limite de entrada: 10 MB / 40 milhões de pixels.
Não há logomarca fictícia padrão. Sem imagem, a célula fica identificada e vazia.

A imagem é compartilhada pelas pranchas do projeto e embutida no arquivo salvo
(`cliLogo`, `cliLogoName`), sem depender do arquivo externo na exportação. É
necessário salvar o projeto após alterar a logo. Projetos antigos sem esses
campos não herdam a imagem do projeto anterior. Leituras atrasadas são descartadas
ao trocar projeto ou remover a logo. Os controles antigos da lateral continuam
funcionando e são sincronizados com o diálogo do selo.

Validação: `tools/smoke_titleblock_client_logo.cjs` usa o aplicativo completo em
navegador isolado e imagem sintética. Confere upload, geometria das células,
preservação de campos, exportação real para PNG, salvamento/reabertura, remoção,
arquivo inválido, projeto legado e preservação do A4. Também passam os testes de
árvore A4/A3, visibilidade da legenda, estilos, atualização da prancha, estado do
mapa no salvamento e isolamento de snapshots.

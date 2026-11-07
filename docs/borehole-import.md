# Importação de furos de sondagem

Disponível em **Geologia → Importar sondagens**, com os ícones nativos do GeoMine:

- **Furos · String Surpac**: trajetórias XYZ já calculadas em `.str` ou `.stx`, texto ou binário compatível com o leitor Varioscape.
- **Furos · CSV**: uma tabela collar, survey opcional e várias tabelas de intervalos (drill/litologia, análises ou testemunhos).

## CSV: procedimento

1. Escolha os arquivos nas caixas separadas **Collar**, **Survey**, **Litho / Drill**, **Assay** e **Testemunhos**. Só collar é obrigatório. A escolha de survey ou litho mantém os arquivos anteriores; escolher outro collar/survey substitui apenas aquela tabela. Também é possível **adicionar vários arquivos juntos**, em uma ou mais seleções cumulativas. Remova individualmente um arquivo pela lista abaixo dos seletores. As tabelas são fontes da mesma campanha, não camadas de furos duplicadas.
   A janela de escolha não restringe o tipo anunciado pelo sistema: CSVs do aparelho/Drive podem ser identificados como texto, planilha ou binário. A extensão e o conteúdo são validados depois da seleção; outros formatos, como XLSX, não são aceitos. Os nomes permanecem visíveis; o botão **Baixar modelos CSV** fornece exemplos de collar, survey e drill.
2. Selecione o CRS projetado e confirme as unidades em metros. Não há transformação do datum vertical: cotas devem ser compatíveis com o MDT e demais modelos.
3. Clique **Ler tabelas e conferir colunas**. Cada seletor separado já define a função da tabela, independentemente do nome do arquivo. Na seleção conjunta, os nomes sugerem funções; cada função e coluna pode ser corrigida. A amostra mostra as cinco primeiras linhas sem alterar os dados. Adicionar/substituir/remover arquivos invalida a prévia anterior e exige nova conferência, sem perder os mapeamentos das tabelas mantidas.
4. Vincule pelo código do furo:
   - **Collar**: código, X/Leste, Y/Norte e cota da boca. Profundidade final recomendada; azimute/inclinação opcionais.
   - **Survey**: código, profundidade medida (MD), azimute e inclinação.
   - **Drill/Litologia**: código, De, Até e descrição da litologia. Alimenta o log e as cores de intervalos na seção.
   - **Análises**: código, De e Até. Outras colunas são conservadas nas tabelas do furo, sem interpolação ou classificação automática de teores.
   - **Testemunhos**: código, De, Até e, opcionalmente, litologia, recuperação e RQD.
5. Confirme a convenção de inclinação: +90° para baixo, −90° para baixo ou 0° vertical para baixo. Azimute é medido do norte, no sentido horário. Sem survey, usa a orientação do collar; se também faltar, a hipótese vertical exige confirmação explícita.
6. **Validar e visualizar** cruza as tabelas pelo código do furo, confere os dados e calcula as trajetórias por curvatura mínima, adaptada do Varioscape. Abre automaticamente a prévia 3D com as bocas e os intervalos litológicos posicionados por profundidade medida na trajetória desviada. A prévia é sem exagero vertical e não cria camadas. Só **Importar no projeto** adiciona a campanha ao grupo Geologia.

Na prévia, selecione todos os furos ou um furo específico, gire, aproxime e use **Enquadrar**. Clique em uma boca ou intervalo para consultar seus dados e atributos de origem. As litologias têm legenda; trechos sem litologia permanecem como linha neutra. **Espessura visual** altera apenas o símbolo dos tubos, não o diâmetro real nem as coordenadas do furo.

Somente a **collar** é obrigatória; survey, assay e litho/drill são independentes e opcionais. Se a collar trouxer apenas ID e XYZ, sem profundidade nem intervalos/survey que a determinem, importa-se **somente a boca**: profundidade desconhecida, um ponto XYZ/MD 0 e nenhuma linha de subsolo ou litologia inventada. Com profundidade conhecida, a ausência de orientação continua exigindo a confirmação explícita da hipótese vertical. A prévia mostra separadamente as contagens litológicas e de análises.

Os nomes padronizados `hole_id`, `max_depth`, `depth_from`, `depth_to`, `xcollar`, `ycollar` e `zcollar` são reconhecidos no mapeamento; todas as escolhas podem ser conferidas antes da importação. Uma coluna De/Até nunca é confundida automaticamente com a profundidade total.

CSV precisa de cabeçalhos únicos. São aceitos vírgula, ponto e vírgula e tabulação, campos entre aspas, decimal com vírgula e texto UTF-8 ou Windows-1252. Remova separadores de milhar ambíguos. O código `001` é diferente de `1`; o vínculo entre tabelas não altera maiúsculas, acentos ou zeros iniciais.

## Strings Surpac

Cada segmento contínuo deve representar um furo completo. Escolha código pela descrição original ou pelo número da string. A boca pode ser o primeiro vértice ou, por inversão explícita, o último. Inverter a ordem não troca a identidade original do furo.

O traço XYZ é mantido sem desurvey adicional. A profundidade é o comprimento geométrico da string, **não** uma profundidade medida original. Segmentos com IDs repetidos não são unidos automaticamente. Importação de superfícies continua sendo um comando separado, com par DTM + STR/STX.

## Uso, persistência e cuidados

- No mapa 2D os pontos são as bocas, com cotas em `zg`/`COTA_BOCA`. O furo completo fica em `boreholeTrace` (XYZ + MD), com survey, origem e tabelas junto da feição.
- A seção usa o traço importado completo e a profundidade medida, não uma reta deduzida da inclinação na boca. Furos com cotas próprias podem gerar seção sem MDT; nenhum terreno é inventado.
- **Log gráfico** abre diretamente o furo selecionado no mapa; os seletores permitem trocar camada/furo sem perder o rascunho de intervalos. O gráfico usa profundidade medida (MD), com cores litológicas consistentes com a seção; lacunas permanecem vazias. Tabelas extensas são paginadas em 100 intervalos sem descartar os demais. Concluir valida e salva conjuntamente os furos editados; cancelar não os altera.
- A paleta de propriedades e as propriedades da camada oferecem **Propriedades do furo**, **Log gráfico** e **Testemunhos**. O código e atributos extras são editáveis, inclusive número/descrições Surpac. Os metadados originais em `boreholeSource` permanecem intactos para rastreabilidade. Cancelar não aplica alterações; IDs duplicados, JSON inválido ou alterações concorrentes são bloqueados. `DESCRIPTIONS` mantém uma entrada por ponto, sem ser interpretado como litologia.
- A geometria importada fica protegida para não deslocar a boca sem o traço. Coordenadas, profundidade e orientação são somente leitura na ficha de metadados; reimporte a campanha corrigida para modificar sua trajetória. A importação cria uma nova camada, não sobrescreve campanhas existentes.
- **＋ Novo furo no mapa** reutiliza o cadastro existente na aba Geologia e sua ficha de campo; não cria um segundo procedimento de cadastro nem mistura pontos avulsos na campanha importada.
- Salve normalmente o `.ccmgis`: trajetórias, survey, metadados, logs, testemunhos e atributos extras permanecem ao reabrir. A proteção geométrica também é restaurada.
- Nesta etapa, a importação é feita fora da sala colaborativa ativa. O arquivo salvo conserva os dados completos; nenhuma regra Firebase ou permissão de acesso foi alterada.
- Leituras são canceláveis, com prazo de dois minutos por leitura/processamento. Trocar o projeto durante a leitura/validação impede adicionar o resultado ao projeto errado.

IDs duplicados, furos órfãos, coordenadas inválidas, mapeamento ambíguo de colunas, survey com MD repetido, intervalos invertidos/sobrepostos ou além da profundidade declarada e recuperação/RQD fora de 0–100% impedem a importação. Linhas inválidas não são descartadas silenciosamente. Profundidade ausente pode ser inferida do último intervalo/survey, com aviso explícito.

## Limites

Até 20 arquivos/64 MB por importação, 10 mil furos, 256 colunas e 250 mil linhas por tabela, 2 milhões de células no conjunto, 250 mil intervalos e 250 mil estações survey. Até 12 mil pontos de trajetória por furo e 1 milhão no conjunto. Estes limites não constituem garantia de desempenho em qualquer dispositivo; campanhas maiores precisam ser divididas.

A prévia 3D tem limites gráficos próprios: 250 mil pontos de trajetória, 100 mil intervalos e 100 mil segmentos litológicos. Ultrapassá-los gera aviso, sem descartar geometrias silenciosamente. Identificações simultâneas são limitadas aos primeiros 200 furos, com aviso; o seletor permite conferir qualquer furo. O seletor de intervalos lista até mil por furo; todos os intervalos desenhados também podem ser consultados por clique.

## Módulos e verificações

`borehole-reader.js` é independente da interface; `borehole-import.js` contém os seletores cumulativos e a importação/mapeamento. `borehole-preview-geometry.js` interpola contatos por MD e subdivide os intervalos nas estações da trajetória; `borehole-preview.js` apresenta a conferência 3D com cilindros instanciados, legenda e consulta. `borehole-properties.js` mantém a ficha de metadados e o desenho do log, integrado ao editor transacional já existente em `geology-workspace.js`. O manifesto os integra ao HTML gerado, mantendo a modularização. O leitor Surpac compartilhado conserva compatibilidade com a importação de superfícies.

A referência local do motor é `fontes/modelagem-3d-v2.12.html`: `GUESS_KEYS` e `buildHoles` vinculam collar/survey/intervalos; `desurveyHole` implementa curvatura mínima. A adaptação preserva essa semântica com validação estrita e mantém assay separado de litologia. O módulo `build/vs_cubagem.js` da referência é o relatório de modelos de blocos, não um leitor de sondagens.

Testes cobrem leitores, curvatura mínima, convenções angulares, proteção de geometria, seções, reabertura e importação real por seletor de arquivos/worker no Chrome. A publicação continua exclusivamente no Hosting `geomine-3`, com o login existente.

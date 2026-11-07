# APP por largura da calha

Disponível em **Meio Ambiente → APP por calha**. Módulo independente
`src/modules/environmental/riparian-app.js`, com motor de medição em
`src/modules/environmental/riparian-width.js`, montados pelo manifesto. Nenhuma
mudança no buffer genérico, no cálculo de favorabilidade ou na autenticação.

## Base legal e alcance

Consulta em 28/09/2026: [Lei 12.651/2012 consolidada na Câmara](https://www2.camara.leg.br/legin/fed/lei/2012/lei-12651-25-maio-2012-613076-normaatualizada-pl.html), art. 3º XIX e art. 4º I.
Somente cursos naturais perenes/intermitentes; efêmeros e canais artificiais
não são processados por essa regra. Distância marginal a partir da borda do
leito regular. Resultado técnico preliminar, sujeito à revisão profissional,
às normas locais e à avaliação do órgão ambiental, não homologação jurídica.

| Largura da calha (m) | Afastamento marginal (m) |
| --- | --- |
| 0 < L < 10 | 30 |
| 10 ≤ L < 50 | 50 |
| 50 ≤ L < 200 | 100 |
| 200 ≤ L ≤ 600 | 200 |
| L > 600 | 500 |

Em 50 e 200 m, os intervalos do texto legal se sobrepõem. A aplicação adota
explicitamente a faixa maior por prudência, não como interpretação judicial
definitiva. A convenção aparece no formulário e nos atributos.

O art. 4º §10 contempla análise específica em áreas urbanas consolidadas;
o art. 61-A trata de recomposição rural, não da delimitação geral implementada.
Esses casos não recebem reduções automáticas. A opção de enquadramento
específico bloqueia a geração e pede análise da norma/licença pertinente.
Nascentes, lagos, reservatórios e demais modalidades de APP não são abrangidos.

## Entradas e procedimento geométrico

- Escopo: um polígono selecionado, camada respeitando filtros/categorias ou
  toda a camada. Não é necessário desenhar um eixo para usar os polígonos.
- Calhas em polígonos, preferenciais: faixa de distância calculada na borda,
  retirando a união das calhas processadas.
- **Automático (estimativa geométrica):** amostra as margens (passo inicial
  5 m, ajustável entre 0,5 e 50 m), procura a margem oposta por normal interna
  e mede a menor seção interior defensável entre margens aproximadamente
  paralelas em 12 orientações. Até três recentragens reduzem o efeito das
  pontas. Aplica a faixa legal por segmento de margem; não é um único valor
  obtido pela área/perímetro. Canal de 5 m recebe 30 m desde cada margem;
  a variação local entre 8 e 12 m produz classes de 30 e 50 m.
- Um polígono não identifica o sentido do escoamento. O resultado automático
  é **estimado e exige revisão das seções**, principalmente nas confluências,
  términos, trechos curtos/largos e mudanças bruscas de forma. Não substitui
  levantamento hidrológico ou avaliação profissional. Calha que não pode ser
  medida seção a seção (ilhas/furos, multipartes, seção ambígua) não derruba
  as demais: recebe APP pela **largura média** (área ÷ metade do perímetro),
  marcada em `N_LARG_MEDIA` e listada para conferência; se nem assim for
  possível, fica sem APP e o motivo é informado. Não fecha nem corrige a origem.
- O modo manual continua disponível: largura única ou campo por feição,
  incluindo polígonos com margens internas de ilhas.
- Eixos em linhas: calha aproximada por meia largura; buffer externo por meia
  largura mais afastamento, menos a união das calhas estimadas. Produto
  identificado como estimativa, não equivalente ao levantamento da margem.
- Largura única positiva em metros ou atributo por feição; aceita vírgula
  decimal. Valores ausentes/inválidos interrompem tudo, sem APP parcial.
  No modo manual, dividir os cursos em trechos ao variar a largura/classe.
  Em ambos os modos, confirmar o enquadramento e revisar o resultado.
- Exige CRS de trabalho UTM em metros da região. Reprojeta as entradas sem
  alterar as coordenadas originais. Não utiliza distância em graus/Web Mercator.
- Junções e extremidades arredondadas. Revise términos artificiais dos trechos.
  Discos circunscritos de 128 lados evitam encurtar a distância mínima nos arcos;
  excesso radial máximo de 0,031% do raio. Sem simplificação ou jitter silencioso.
- Faixas que se sobrepõem (confluências, calhas vizinhas, classes do mesmo
  curso) são **fundidas** numa área contínua: a área não é contada duas vezes.
  Cada área leva os trechos (`TRECHOS`, `N_TRECHOS`), as classes de APP
  (`APP_CLASSES`) e as seções que contém. Todas as partes são mantidas: ilhas
  no meio do rio, partes separadas de multipartes e pedaços cortados pela água.
  Se a união não aceitar alguma geometria, ela fica separada e o aviso pede
  Dissolver nessa camada.
- O cálculo é feito num referencial local arredondado a 1 mm (1 cm na segunda
  tentativa de uma calha), o que evita a falha da biblioteca de recorte com
  coordenadas UTM; o resultado volta para UTM.

## Integridade, desempenho e persistência

Motor polygon-clipping existente, incorporado no worker offline (sem CDN).
Uniões em árvore e lotes evitam reter todos os discos brutos. Interface livre
com progresso por etapa/trecho e cancelamento que termina o worker. Limite de
100 mil vértices de entrada, 1,5 milhão de saída e 10 minutos (com a aba em
segundo plano o navegador reduz a prioridade do cálculo); mensagens orientam
dividir a operação. Não há resultado parcial em cancelamento/erro.
O motor de largura usa índice espacial, no máximo 20 mil vértices e 4 mil
amostras por feição e orçamento de 8 milhões de operações. A normalização de
1 µm corrige apenas ruído numérico nos limites de classe, não indica precisão
de levantamento. As geometrias originais nunca são arredondadas.

Validações de identidade do projeto, CRS, revisão, seleção/escopo e conteúdo da
origem impedem gravar um resultado obsoleto. Não modifica a origem. Cria uma
nova camada poligonal independente; no modo automático, cria também uma
camada de seções de largura, com largura, APP aplicada, origem e aviso de
estimativa. Ambas são preparadas antes da inserção e revertidas se a criação
falhar. Desfazer remove uma camada por vez (duas ações para o resultado
automático). Mantém salvamento manual.
Tabela: trechos originais da área contínua (`TRECHOS`, índices 1-based, e
`N_TRECHOS`), origem, largura, APP aplicada e classes (`APP_CLASSES`), regime,
método, base legal, convenção de limites, área, data UTC, URL legal e escopo.
A camada de seções continua com o trecho de cada seção em `TRECHO`.
A camada funciona no mapa, no layout e na persistência vetorial normal.
Os polígonos automáticos registram largura mínima/máxima por classe, passo
e número de seções; a camada de seções permite conferir cada medição.

## Verificação

`tools/smoke_riparian_app.cjs`: limites legais/valores inválidos, distância da
borda (não eixo), meia largura no modo estimado, área analítica retangular,
furos/multipartes, exclusão das calhas adjacentes, filtros, botão idempotente,
worker real, cancelamento, alterações concorrentes, campos, salvamento/abertura,
desfazer, proteção contra CRS angular e rodapé acessível em tela 1024×640.

`tools/validate_riparian_width.mjs`: largura 5 m em rotações e sentidos
diversos, mudança 8→12 m, curva em U, limiares 10/50/200/600 m, preservação
da origem, geometrias inválidas e limites de recursos.

`tools/smoke_riparian_auto.cjs`: escopo por feição/camada, faixas de 30/50 m
desde a margem, seções e atributos, persistência, desfazer, falha transacional,
cancelamento e alterações concorrentes.
Inclui regressões de seleção antiga no editor desligado, cancelamento por
Escape sem cálculo oculto, e rollback de falha após inserir a segunda camada.
Testes completos passaram no navegador isolado; interface conferida em
viewport de computador e tablet, sem recarregar projetos do usuário.

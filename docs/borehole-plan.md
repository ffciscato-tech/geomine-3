# Projeção de sondagens na planta 2D

Os furos importados de CSV/Surpac mantêm a boca como geometria pontual e o desvio completo em `boreholeTrace`. O desenho genérico de pontos consumia apenas a boca; a trajetória aparecia nas seções, mas não era desenhada no mapa.

O módulo `modules/geology/borehole-plan.js` acrescenta uma representação derivada da trajetória em planta. O cadastro continua pontual: não se criam feições duplicadas, não se muda `geom`, não se reinterpreta o survey e não se alteram profundidades, tabelas ou atributos. A linha projetada usa o mesmo índice de feição, estilo, filtro, visibilidade e posição na pilha da camada de sondagens. O halo e o tracejado ajudam a distingui-la do desenho superficial. O Layout e o enquadramento da camada usam a mesma projeção.

## Fonte da trajetória

- Importados: usa todas as estações XYZ/MD válidas da trajetória, sem substituí-las por uma reta da orientação inicial. Profundidades declaradas menores limitam o traçado conforme as seções; não se extrapola além da última estação.
- Cadastro manual tipado como sondagem/SPT: só calcula a projeção reta quando profundidade, azimute e inclinação foram informados explicitamente e o CRS usa metros.
- Furo vertical: sua projeção horizontal é um ponto, portanto permanece o símbolo da boca, sem linha artificial.
- Collar sem trajetória, camada pontual legada sem orientação ou dados inválidos: permanece somente a boca. O nome da camada e uma cota de nível d’água não autorizam deduzir uma trajetória.

A projeção respeita a ordem das camadas. Um raster acima da camada de sondagens pode encobri-la; para vê-la sobre a imagem, ligue a camada e coloque-a acima do raster. Não se altera automaticamente uma visibilidade ou ordem salva pelo usuário.

A opção explícita **Visibilidade real (por cota, contra o MDT)** mantém o caminho de desenho por profundidade já existente. Para a projeção integral em planta descrita aqui, deixe essa opção desligada, como no padrão de importação.

## Verificação

Testes de geometria com furos curvos, verticais, collar isolado, dados incompletos/inválidos, limite de profundidade e cadastro manual; ausência de mutações; cor, espessura, seleção e reprojeção. Teste em navegador com importação pelo motor existente, desenho real, ocultação/filtro, ordem perante um raster, enquadramento, Layout e salvar/reabrir.

O projeto anteriormente enviado contém a camada `Sondagens` desligada e somente as 12 posições das bocas, sem trajetória ou orientação. Ele não foi alterado nem usado para fabricar linhas. A validação de trajetórias usa dados de teste explícitos.

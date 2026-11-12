# Geoestatística — convenções numéricas

Implementação própria, sem copiar código de bibliotecas externas. Entrada: pontos
XY no CRS projetado em metros do projeto e um valor escalar por amostra. Valores
ausentes são contados e excluídos; XY coincidentes com valores diferentes impedem
o cálculo. Coincidentes iguais são considerados uma vez.

- **IDW²:** pesos proporcionais a 1/d², normalizados pelo vizinho mais próximo;
  número de vizinhos, mínimo e raio explícitos. Coincidência exata retorna a amostra.
- **Vizinho mais próximo:** retorna o valor de uma amostra, sem suavização; empates
  seguem a ordem original. Raio máximo opcional.
- **Multilevel B-Spline:** base bicúbica uniforme; ajusta resíduos em malhas de
  controle com espaçamento sucessivamente dividido por dois. O valor inicial é a
  média. Níveis, espaçamento e tolerância são explícitos. Não força coincidência
  artificial nos pontos: informa RMSE, maior resíduo e se atingiu a tolerância.
- **Krigagem ordinária:** sistema de semivariâncias com soma dos pesos igual a um,
  resolvido por LU com pivoteamento. Isotrópica, vizinhança móvel, valores exatos
  nos pontos. Patamar é TOTAL, pepita não negativa e menor que o patamar. Alcance
  esférico é o alcance finito; exponencial usa exp(-3h/a); gaussiano usa
  exp(-49h²/16a²), convenções do PyKrige. Modelos são configurados manualmente,
  sem ajuste automático ou alegação de validação geológica. Variância em valor²
  é um produto separado e não uma garantia de exatidão local.
- **Variograma:** experimental, omnidirecional, média de (zi-zj)²/2 em classes de
  distância. Acima de 1.500 amostras, usa subconjunto determinístico distribuído
  na ordem de entrada e informa quantidade utilizada. Interpolação usa TODOS os
  pontos válidos. Estatísticas e histograma usam todos os pontos únicos válidos.

Grade: centros de células, linhas do norte para o sul, Float32, NaN como NoData.
Por padrão, fica restrita ao contorno convexo das amostras; desligar permite
extrapolar no retângulo envolvente. A resolução escolhida não é aumentada
automaticamente. Limite explícito de dois milhões de células por operação.
O processamento é cancelável, em worker; troca/edição da fonte impede gravar
um resultado obsoleto. Resultados e parâmetros integram os rasters do projeto.

Referências primárias:

- Lee, Wolberg & Shin (1997): https://cg.postech.ac.kr/papers/scatteredData.pdf
- PyKrige — modelos: https://geostat-framework.readthedocs.io/projects/pykrige/en/stable/variogram_models.html
- Sistema de krigagem: https://pygeostatistics.readthedocs.io/en/latest/basics/kriging.html
- IDW: https://pro.arcgis.com/en/pro-app/latest/help/analysis/geostatistical-analyst/how-inverse-distance-weighted-interpolation-works.htm

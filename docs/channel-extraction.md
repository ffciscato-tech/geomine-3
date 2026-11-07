# Extração de calha estimada pelo MDT

**Meio Ambiente → Extrair Calha MDT**. Módulos independentes:
`channel-extraction-engine.js`, `channel-dem-sampler.js`, `channel-extraction.js`,
`channel-search-policy.js`, `channel-live.js` e `channel-details.js`.
O núcleo só encaminha cliques à nova ferramenta e limpa seu traçado temporário
ao trocar de comando. Não reutiliza nem apaga o perfil longitudinal/geológico.

## Uso

1. Desenhar o eixo como uma linha contínua normal, concluindo com Enter, duplo
   clique/toque ou tocando novamente no botão **Linha** do rodapé; ou escolher
   uma linha existente. Sem caixa de contagem nem marcadores de vértices.
   O eixo novo vira uma camada real com desfazer. O editor anterior é desligado
   pelo fluxo normal, preservando alterações, e trabalho pendente impede iniciar.
2. Escolher linha selecionada, camada com filtros/categorias ou camada inteira.
   Cada feição deve ser um eixo aberto contínuo. Multipartes precisam ser separados.
3. Escolher um MDT altimétrico. O trabalho ocorre no UTM métrico da região.
4. A opção **Limitar a faixa de busca** usa a largura total informada, com folga.
   Ex.: 40 m significam 20 m para cada lado do eixo. Não impõe largura ao rio.
   Desmarcada, a busca começa com 20 m totais e pode ampliar para 40, 80, 160,
   320 e 640 m. Para na primeira análise completa válida; não amplia para
   contornar NoData, cristas, ambiguidade ou geometria inválida. Permanecem os
   limites de amostras e tempo, portanto a busca nunca é indefinida.
5. Usar **Automático — encontrar margens no MDT** ou **Profundidade de cheia
   informada — acompanhar o fundo**. No segundo modo, informar desnível sobre o **fundo encontrado**, não a cota
   da guia, uma largura ou uma cota global. Intervalo inicial: 5 m.
6. **Analisar e visualizar** não grava camadas: mostra o polígono temporário e
   uma lista de seções com perfil do terreno, nível e margens, e o perfil
   longitudinal do fundo e nível local (escalas distintas, explicitadas). Na falha de uma
   seção, mostra seu perfil e a linha transversal laranja no mapa, mas mantém
   confirmação/criação bloqueadas. Revisar e marcar confirmação depois de uma
   análise válida; só então **Criar calha no projeto**.
7. São criadas duas camadas: calha estimada (automático) ou faixa por profundidade
   (preenchimento), em polígonos, e seções (linhas), com
   origem, MDT, modo, resolução, busca, progressiva, larguras e cotas. Ctrl+Z
   desfaz uma camada por vez. O botão **Abrir APP por calha** apenas abre a
   ferramenta anterior; não afirma o enquadramento legal nem gera APP sozinho.
   Esse atalho não é mostrado após gerar a faixa por profundidade: um cenário
   de preenchimento não identifica automaticamente a calha do leito regular.
8. **Atualizar a calha ao editar o eixo** vem marcada. Ao concluir o movimento
   de um vértice, recalcula calha e seções nas mesmas camadas. O vínculo e os
   parâmetros permanecem no `.ccmgis`. Uma calha antiga estática precisa ser
   gerada novamente com a opção marcada para adquirir o vínculo.

## Imagens dos trechos

Após **Analisar e visualizar**, uma análise válida habilita **Gerar imagens dos
trechos** no resultado. Informe o tamanho aproximado em metros, clique em
**Atualizar trechos** e confira a prévia. Os limites usam as seções realmente
calculadas; não inventam perfis intermediários. Trechos adjacentes compartilham
a seção de limite e eixos distintos nunca são unidos. Cada imagem contém:

- planta em XY, norte de quadrícula, escala gráfica, guia, fundo e limites;
- até três seções transversais existentes (início, intermediária, fim);
- perfil longitudinal do fundo e nível local, com escalas H/V distintas;
- identificação do MDT, CRS, resolução, modo, profundidade e alcance de busca.

A planta não inclui ortofoto de fundo. O PNG é ilustrativo, não georreferenciado.
O rodapé informa que se trata de estimativa topográfica, não simulação hidráulica
nem certificação de leito regular. Gere antes de criar as camadas; para resultado
salvo/reaberto, analise novamente com o MDT original acessível.

Use **Gerar PNG deste trecho** ou **Gerar ZIP de todos os trechos**, depois
**Baixar arquivo gerado**. O segundo clique preserva a ativação do seletor de
arquivos/compartilhamento. PNG de 1600×1140 pixels; ZIP inclui `indice.json` com
origem e extensão de cada trecho. Limites: 80 imagens e 64 MiB de PNGs por lote,
geração sequencial, cancelável pelo botão ou Esc. A fonte alterada durante a
geração ou antes do download invalida o arquivo; não exporta uma revisão antiga.
Essa operação não modifica camadas, MDT, geometria nem histórico.

Testes específicos: `validate_channel_details.mjs` (9 casos puros) e
`smoke_channel_details.cjs` (12 casos no app completo, incluindo PNG real,
ZIP/índice, cancelamento, dados obsoletos, limites e rodapé em 1280×800).

## Método

O eixo é amostrado em estações regulares, preservando todos os vértices. Em
vértices, a normal usa a bissetriz das tangentes adjacentes. Inverter o sentido
mantém as mesmas estações físicas. Normais amostradas com passo de no máximo
meio pixel nativo; isso não melhora a resolução da informação original.

**Localização do fundo:** a guia define as transversais, mas não precisa estar
no talvegue nem dentro da calha. Seleciona uma bacia local acessível próxima da
guia, sem atravessar NoData ou uma crista mais de 0,15 m acima da guia. Agrupa
mínimos separados por cristas de até 0,15 m acima do mínimo mais alto; escolhe
a amostra mais baixa da bacia. Duas alternativas com diferença de distância
até um pixel exigem revisão, em vez de escolher um lado arbitrariamente.
Esses limiares são heurísticos operacionais, não critérios universais de rios.
O mínimo global indiscriminado do corredor não é usado. O eixo nunca é movido.

**Profundidade informada (`depth`):** para cada seção, nível = cota do fundo
encontrado + profundidade. Não exige quebra de declive. A profundidade é
constante; a cota absoluta varia conforme o fundo encontrado.
O nível acompanha a variação longitudinal; não é uma lâmina horizontal única.
Percorre o perfil desde o fundo e usa o primeiro cruzamento desse nível em cada
lado, interpolando linearmente entre amostras. Ondulações estritamente abaixo
do nível informado ficam submersas, incluindo pequenas cristas seguidas de
depressão. Terreno no nível ou acima dele encerra aquele lado; não salta essa
barreira nem NoData. A seleção inicial do fundo continua local, sem pular para
o mínimo de uma bacia distante. Obstáculos entre amostras ou menores que um
pixel ainda podem escapar à representação. Não calcula fluxo longitudinal,
remanso, vazão ou conectividade hidráulica tridimensional.

**Compatibilidade (`height`):** receitas salvas anteriormente conservam seu
modo e altura. A antiga restrição contra crista seguida de outra depressão
permanece nesse modo, mesmo quando submersa. Não há migração silenciosa para
`depth`. A interface de novas análises oferece apenas automático e profundidade.

**Automático:** procura a primeira redução sustentada da inclinação, sem exigir
dois patamares horizontais. Usa ajustes robustos em janelas de 1, 1,5, 2 e 3 pixels,
sem ler além do corredor. Limiares operacionais, não critérios geomorfológicos
universais: inclinação interna ≥0,05 m/m; inclinação externa absoluta ≤50% da
interna; ganho absoluto ≥0,01 m e relativo ≥30% em relação ao ajuste único;
relevo mínimo de 0,15 m; tolerância residual=max(0,025 m; 15% do desnível da
janela), com pelo menos 75% de aderência. Refina a primeira transição em até
1 pixel, documenta escalas de apoio e usa a cota do perfil observado na posição
estimada, não a cota extrapolada das retas.

Com duas bordas identificadas, usa a **menor cota** e o primeiro cruzamento em
ambos os lados. Com somente uma quebra e o outro lado sem quebra, pode usar a
cota da borda identificada e cruzar a encosta oposta no mesmo nível. Isso não
significa ter identificado duas bordas geomorfológicas. A prévia avisa apoio
unilateral; APOIO=1 e METODO registram a condição, TOPO_ESQ/TOPO_DIR ausente
fica nulo, e N_UMA_MRG registra a quantidade no polígono. Não aplica esse recurso
para NoData, fundo acima de borda ou barreira antes de outra depressão. Continua
obrigatório encontrar ambos os cruzamentos dentro da faixa de busca. Relevo
sem quebra nos dois lados exige altura manual/revisão; não usa a borda do
corredor como margem. O eixo original nunca é deslocado automaticamente.

As margens entre seções são conectadas por segmentos. O eixo e o polígono devem
ser simples, sem interseções; o percurso dos **fundos encontrados** não pode
sair da calha interpolada. A guia pode estar fora da calha. Fechar
o polígono nos extremos do eixo é artificial e exige revisão. Curvas apertadas,
confluências, pontes, aterros, ilhas e canais ramificados devem ser tratados por
trechos e conferidos, não resolvidos por fechamento automático arbitrário.

As seções registram `Z_EIXO`, `Z_FUNDO`, `DESLOC_M` (esquerda positiva conforme
sentido da guia) e `ALTURA_M` (nível menos fundo). `BUSCA_M`/`RAIO_M` guardam
o alcance efetivamente usado para cada eixo; `BUSCA_AUTO` identifica a busca
adaptativa. O gráfico distingue a guia cinza do fundo verde.
No modo `depth`, ambas as camadas incluem `PROF_M`, `MODO=Profundidade informada`
e STATUS identificando estimativa sem certificação de cheia ou leito regular.
Falhas depois de encontrar o fundo e definir o nível conservam essas cotas no
diagnóstico, representando o alvo tracejado e sem permitir criar um polígono.

## Atualização vinculada

O cálculo é adiado até soltar o ponteiro/concluir o gesto; usa o mesmo motor,
MDT original, modo de altura e política de busca da geração inicial. Altera
apenas as duas camadas derivadas existentes, preservando IDs, ordem, grupo,
visibilidade e simbologia. Desfazer uma edição do eixo também recalcula.

As feições do eixo recebem apenas uma chave técnica `_channelAxisId`, sem
alterar suas coordenadas, campos ou atributos. O par resultante recebe receita
`_channelLink` persistida. A fonte raster é conferida inclusive após o cálculo,
antes de atualizar as geometrias; a revisão visual do raster não é uma edição.

Na falha, mantém o último desenho, com `[desatualizada]` no nome e `STATUS`
explícito; não substitui o resultado por um polígono parcial. Se o usuário editar
diretamente a geometria ou os atributos das camadas derivadas, o vínculo é
pausado para não sobrescrever esse trabalho. Gere outra calha para retomar,
preservando a versão manual. Não recria camadas apagadas nem troca um eixo
removido por outra feição que tomou seu índice. Respeita bloqueios e permissões.

Ao reabrir, a geometria salva fica disponível. Para recalcular depois de editar
o eixo, o MDT original precisa estar acessível; uma prévia suavizada não o
substitui. **Recalcular calhas vinculadas** permite tentar novamente após anexar
o original. Gravar enquanto há cálculo pendente registra essa condição.
APPs e outras camadas derivadas anteriormente não são recalculadas em cascata.

## Fonte altimétrica e limites

Leitura do TIFF original em janelas nativas de 128×128 pixels, com cache próprio
limitado a 4 MiB; não solicita resolução reduzida/overview nem cópia integral.
As faixas/blocos físicos de um TIFF ainda são decodificados pelo runtime comum.
Aceita também grade integral em memória e grades geradas reconhecidas por
proveniência LiDAR/TIN. Recusa substituir original ausente por prévia suavizada.
Se necessário, anexar o original nas propriedades do MDT e refazer a análise.

Interpolação bilinear estrita: NoData em qualquer contribuinte com peso positivo
produz lacuna. Reprojeção estrita, pixel X/Y distinto e recorte são respeitados.
TIFF rotacionado/invertido e produtos não altimétricos conhecidos (declividade,
aspecto, índices, CN etc.) são recusados. Para TIFF genérico, o usuário continua
responsável por confirmar terreno e cotas verticais em metros.

Limites: 10 mil pontos de eixo, 2 mil seções e 250 mil amostras por eixo;
100 eixos/500 mil amostras por operação e 3 minutos. Largura menor que dois
pixels é recusada como resolução operacional insuficiente, não como regra
universal de precisão. NoData antes da margem, alcance insuficiente, geometria
inválida ou falha em uma feição cancelam o conjunto sem resultado parcial.

## Integridade

MDT, geometrias/atributos dos eixos e perfis existentes não são alterados.
O vínculo usa somente os metadados técnicos descritos acima.
Leituras têm abort/sessão própria; cancelar não fecha o TIFF compartilhado.
O motor roda em worker; Escape cancela durante análise. Captura de projeto,
CRS, seleção, objetos de origem e assinatura integral da grade impede commit de
prévia obsoleta, incluindo mudanças in-place, NoData e recortes. Revisão de
**desenho** do raster não é revisão altimétrica (resize/estilo não devem invalidar).
As duas camadas são inseridas transacionalmente com rollback inclusive quando
addLayer lança depois de inserir. Mantém o salvamento manual já existente.

## Validação

- `validate_channel_extraction.mjs`: worker serializável, canais V/trapezoidal/
  assimétrico, declive, rotações e inversão, barreira antes de depressão vizinha,
  NoData, orçamento, curvas e interseções; automático com patamar, assimetria,
  ruído/entalhe subpixel, recusa de V sem quebra e terreno plano.
- `validate_channel_dem_sampler.mjs`: 31 testes de resolução nativa, memória/
  janelas/cache, CRS, fonte reduzida, proveniência, unidades/quantidade, clip,
  NoData, cancelamento e fonte obsoleta.
- `smoke_channel_extraction.cjs`: app completo isolado, geração/visualização,
  confirmação, desenho de eixo, duas camadas e persistência, falhas, cancelamento,
  dados obsoletos, fonte preservada, desfazer e rodapé em viewport de tablet.
- `smoke_channel_drawing.cjs`: traçado sólido sem contador, editor limpo sem
  perda de alterações, Enter/duplo clique/toque e botão Linha, cancelamento e
  preservação de S.prof, desfazer e trabalho em andamento.
- `smoke_channel_native.cjs`: GeoTIFF Float32 real gerado para o teste, decoder
  e runtime de tiles reais, prévia artificialmente incorreta ignorada, faixas
  originais lidas por janelas e fonte compartilhada legível após encerrar.
- `validate_channel_guide_project.mjs`: QA independente com interseção de
  polígonos/corredor, guia externa, inversão, crista/vale vizinho e dados nativos
  do projeto (quando o arquivo diagnóstico local está presente).
- `smoke_channel_live.cjs`: arrasto, soltar, desfazer, mesmos IDs/estilos/grupos,
  salvar/reabrir vínculo, falha sem resultado parcial, fonte trocada em voo e
  preservação de edição manual das camadas derivadas.
- `smoke_channel_depth.cjs`: duas escolhas explícitas, alternativa à detecção
  sem inventar profundidade, nível local em V inclinado, perfil longitudinal,
  atributos, persistência e distinção de finalidade do resultado.
- `channel-depth-results.cjs`: imagens reproduzíveis dos resultados calculados
  pelo motor, com testes controlados e amostras anteriores identificados.

Em 28/09/2026 foram lidos o projeto BN_Drenagem_com_shapes_v2 e o TIFF original
MDT_BracoDoNorte_mosaico_1m em cópias de leitura. A reprodução usou 47 seções,
resolução nativa de 1 m, amostragem de 0,5 m e alcance de 5/10/20 m por lado.
Confirmou margens assimétricas e trechos em que o eixo está lateralmente acima
do fundo. Isso é teste de reprodução, não validação de campo nem garantia de
delimitação correta. Os dados privados do projeto não integram a publicação.

Na revisão de 29/09/2026, a faixa total de 40 m gerou 47/47 seções e um polígono
simples contido no corredor. Faixas totais de 10/20 m ainda recusam o conjunto
por margens fora do alcance (16/45 seções individuais válidas, respectivamente).
Os fundos das seções 29 e 32 ficaram a +4,5/+4 m da guia, sem movê-la. As seções
41/42, muito próximas de um vértice, têm normais distintas e mudança abrupta
de largura/nível: a prévia sinaliza esse tipo de situação para revisão. Validade
topológica não significa continuidade hidráulica nem validação de campo.

Na mesma revisão, `depth` com 0,50 m processou as 47 seções anteriores. Esse
valor foi escolhido apenas para teste, não estimado como cheia local. Com 1 m,
o polígono de teste cruza a si mesmo numa curva e é corretamente recusado,
sem gravar resultado parcial. Isso não reproduz o novo eixo de 256,73 m da
foto recebida em 29/09; seu arquivo atualizado ainda precisa ser conferido.

## Alcance técnico

O resultado é uma **estimativa topográfica**, não modelo hidráulico, vazão,
nível de cheia, limite cadastral ou delimitação legal automática do leito regular.
Mesmo dados LiDAR podem representar superfície da água em vez de batimetria.
Quebras de declive também podem indicar terraços que não correspondem à margem
de interesse. É necessária revisão com seções, dados de campo e contexto local.

Referências consultadas em 28/09/2026 (limitações e observação de margens, não
uma alegação de reprodução dos respectivos algoritmos):

- [USGS — Automated Identification of Stream-Channel Geomorphic Features From High-Resolution DEMs](https://pubs.usgs.gov/sir/2016/5141/sir20165141.pdf).
- [US Forest Service — Stream channel reference sites: an illustrated guide to field technique](https://research.fs.usda.gov/treesearch/20753).

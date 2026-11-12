Você vai implementar no GeoMine uma ferramenta que refina polígonos de drenagem a partir do TPI (Topographic Position Index) do MDT. Sempre que houver ortofoto na área, a ferramenta deve conferir cada decisão na ortofoto. A metodologia abaixo já foi testada à mão no projeto de Braço do Norte (Revisão C). Siga os parâmetros e as regras como estão escritos e só mude o que a calibração da etapa 2 mandar.
- O GeoMine é modular. Toda alteração vai em src/ (módulo novo em src/modules/, CSS em src/styles/modules/, registro no module-order.json). O dist/GeoMine.html só é regerado por python3 tools/build.py e nunca é editado à mão.
- Não sobrescreva a camada de hidrografia vigente. O resultado sai sempre numa camada candidata nova, com uma camada de registros, num grupo novo. A substituição da camada vigente é um comando separado e só roda depois da aprovação do usuário.
- Não mexa em nada fora da área de trabalho escolhida. Fora dela, a geometria das feições tem que ficar idêntica, inclusive a referência do array.
- Não altere os arrays de geometria das camadas existentes (não acrescente propriedades neles). Copie antes de transformar.
- Leia os rasters sempre na grade nativa, por janela do GeoTIFF original (raster.d._img0.readRasters({window}), ou a função equivalente do projeto). Nunca use a prévia de tela. Se a ortofoto estiver só com a prévia, avise e ofereça "Buscar a ortofoto original" antes de rodar a conferência.
- Antes de usar qualquer função existente, confira no código o nome e a assinatura atuais. Funções que devem ser reaproveitadas: addLayer, drawLayer, refreshUI, orthoWindow, rasterPontoNativo/rasterZNativo, a biblioteca polygonClipping já embarcada, proj4 e S.layers/S.rasters/S.groups/S.stack.
- Processamento pesado roda de forma assíncrona, com barra de progresso no painel de comandos e opção de cancelar. Nada pode travar a interface.
- Na aba MEIO AMBIENTE, grupo "Preservação permanente", ao lado de "Extrair Calha MDT" e "APP por calha", crie o botão Refino de calha (TPI).
- O diálogo pede: 
  - camada de hidrografia vigente (polígonos), camada da linha guia da contratante (linhas), camada de Massa de Água e camada de Edificações (opcional);
  - raster TPI, raster MDT e ortofoto. Se não houver TPI, oferecer gerar a partir do MDT com célula de 0,45 m e o raio como parâmetro;
  - área de trabalho, com três opções: quadrantes por estado (ex.: quadrantes sem estilo/azuis), quadrantes selecionados, ou área visível da tela. Na área visível, desconte o que estiver coberto pelo painel de comandos e pelos painéis laterais;
  - checkbox "Conferir na ortofoto" (ligado por padrão quando houver ortofoto).
- Antes de alterar qualquer coisa, a ferramenta mostra uma prévia (contorno novo sobre ortofoto e TPI) e só grava depois de "Aplicar".
- Use os quadrantes já aprovados (amarelos) que tenham hidrografia e linha guia.
- Nas bordas dos polígonos aprovados, meça a razão TPI / mínimo local do TPI (raio de 3 m). No projeto de referência a mediana deu cerca de 0,55: a margem aprovada fica perto da metade da profundidade local da calha. Esse valor é o alpha da etapa 4.
- Grave no registro: alpha calibrado, número de quadrantes usados e os quartis.
- Processe por quadrante (250 m) com margem de 25 m de contexto. Recorte o resultado no núcleo do quadrante, ou na interseção do quadrante com a área de trabalho, e depois una os blocos. Como todos usam a mesma grade nativa e o mesmo contexto, as emendas ficam contínuas.
Parâmetros padrão (todos expostos no diálogo, em "avançado"):
1. Mínimo local Lm = mínimo do TPI num raio de 3 m (filtro separável).
2. Corredor de busca: até 3 m da hidrografia vigente; ou até 8 m da linha guia, só onde não houver polígono vigente a menos de 15 m. Isso evita puxar valas paralelas quando o canal já existe.
3. Máscara de calha: Lm < -0,15 e TPI < alpha × Lm, dentro do corredor. Em seguida, fechamento morfológico de 0,45 m.
4. Componentes mantidos: 
   - os que tocam a hidrografia vigente e têm algum pixel com TPI < -0,25;
   - os que só têm apoio na guia, se cumprirem tudo isto: pelo menos 10 m de guia a até 3 m; pelo menos 4 m² com TPI < -0,4; pelo menos 12 m² de área; nenhuma edificação a menos de 12 m. Isso descarta meio-fio e sarjeta em área urbana.
5. Continuidade (para unir trechos do mesmo curso): 
   - máscara fraca (Lm < -0,05 e TPI < 0,2 × Lm) no corredor; caminho geodésico mais curto entre fragmentos, de até 40 m, engrossado em 0,7 m e limitado à máscara fraca;
   - lacunas do polígono vigente de até 80 m² que ligam dois fragmentos entram de volta.
6. Rio largo: o miolo do polígono vigente, recuado 1,5 m da borda, só é mantido quando o trecho tem mais de 12 m de largura (raio inscrito > 6 m) e há calha no TPI nas margens. Em canal mais estreito, a forma vem só do TPI.
7. Sem cobertura de MDT/TPI: peça do polígono vigente com mais de 15% em NoData é mantida inteira e registrada como "SEM COBERTURA DO TPI". Assim não se cria borda acompanhando o limite do levantamento.
8. Peça vigente sem calha no TPI (mais de 1,5 m da calha detectada, 10 m² ou mais): teste de fundo de vale no MDT. Mediana da cota num anel de 8 a 20 m em volta, menos a mediana da peça. 
   - Se der 0,4 m ou mais, está em fundo de vale: preservar a geometria anterior e registrar.
   - Se der menos, remover e registrar como antropizado. Quando a conferência na ortofoto estiver ligada, a remoção depende dela (etapa 6).
9. Limpeza: 
   - preencher furos de até 400 m² e furos com mais da metade dentro do polígono vigente;
   - descartar componentes com menos de 4 m²;
   - trecho novo (sem polígono vigente) só entra com pelo menos 15 m² e diagonal da caixa de pelo menos 15 m;
   - descontar Massa de Água que o polígono vigente não cobria.
- Rasterize o resultado a 0,15 m. Aplique gaussiana com sigma de 0,7 m e limiar de 0,5. Isso tira as pontas e os dentes e deixa a margem orgânica.
- Onde a suavização cortar um canal estreito, devolva a ligação com a geometria anterior. Ilhas que sumirem inteiras voltam como estavam.
- Preencha furos menores que 4 m².
- Contorno → Douglas-Peucker 0,06 m → Chaikin com 2 iterações → Douglas-Peucker 0,12 m.
- Proibido: faixa de largura constante (buffer em volta de eixo) e quinas que não representam o curso. A calha tem que afunilar naturalmente para montante, porque vem do terreno.
Leia a ortofoto na resolução original, na mesma janela do bloco. Classifique os pixels por regras simples de cor, com limiares calibrados nos quadrantes aprovados e gravados no registro:
- água: brilho baixo, pouco verde (ExG = 2g - r - b baixo) ou tom azulado. Atenção: sombra se confunde com água;
- vegetação densa / copa: ExG alto e textura alta;
- impermeável / telhado / asfalto: saturação baixa e brilho médio a alto;
- solo exposto: r > g e brilho médio.
Avalie cada decisão por trechos de cerca de 10 m ao longo do eixo da calha, dentro do polígono e numa faixa de 3 m em volta:
Para cada decisão que não for um ajuste simples (novo, removido, preservado, pendente, conflito), salve uma imagem de evidência: ortofoto e TPI lado a lado, com contorno antigo, contorno novo, linha guia e escala. A imagem vai para a pasta do projeto (Refino_TPI_<data>/evidencias/<ID>.jpg) e o nome do arquivo fica no campo EVIDENCIA do registro.
- A camada candidata é a camada vigente inteira, com o refino aplicado só na área de trabalho. Tem os mesmos campos da vigente, mais REFINO_TPI (INALTERADO, AJUSTADO, NOVO) e CONF_ORTO (CONFIRMADO, SOB COPA, CONFLITO, NAO CONFIRMADO, SEM ORTO).
- Para cada feição vigente que entra na área: o que está fora da área fica igual; o que está dentro é substituído pelos componentes novos atribuídos a ela por maior sobreposição (ou por contato, se não houver sobreposição). Componentes sem dono viram feições novas.
- Feições duplicadas ou sobrepostas na camada vigente que forem cobertas pelo novo traçado são unificadas e registradas como UNIFICADO, com a feição de destino.
- Atualize AREA_M2 e AREA_HA.
- Se alguma feição for excluída, renumere as referências nos registros (campo INDICE e o texto "feição N da camada candidata"). Nunca deixe índice apontando para a feição errada.
- Simbologia: categorizada por REFINO_TPI, com bordas pretas em todas as categorias. Preenchimento: AJUSTADO magenta, NOVO verde, INALTERADO cinza claro.
- Campos: ID (T001…), DATA, QUADRANTE, CAMADA, INDICE, SITUACAO, OBS, FONTES, EVIDENCIA.
- Valores de SITUACAO, com cores na simbologia: 
  - AJUSTADO - MARGENS PELO TPI (azul)
  - NOVO - CALHA IDENTIFICADA NO TPI (verde)
  - REMOVIDO - SEM CALHA NO TPI (ANTROPIZADO) (vermelho)
  - PRESERVADO - FUNDO DE VALE SEM CALHA NITIDA NO TPI (roxo)
  - GUIA SEM CALHA NO TPI (laranja). Regra: a guia é amostrada a cada 1 m, e conta trecho de 20 m ou mais sem calha a até 12 m. Guia dentro de Massa de Água conta como coberta.
  - SEM COBERTURA DO TPI (cinza)
  - UNIFICADO - FEICAO SOBREPOSTA (verde-azulado)
  - CONFIRMADO NA ORTO, SOB COPA - ORTO NAO CONCLUSIVA, PENDENTE - CONFLITO TPI x ORTO, PENDENTE - NAO CONFIRMADO NA ORTO (definir cores)
- OBS em português corrido, com área antes e depois em "m2", desnível do teste de vale e frações de água, copa e impermeável da ortofoto. Sem símbolos especiais.
- FONTES: TPI (célula), MDT, ortofoto (resolução), linha guia, camada vigente, EPSG do projeto.
- Painel de revisão que percorre os quadrantes da área de trabalho, um a um ou em folhas 2x2. Cada quadro mostra ortofoto e TPI com contorno antigo (ciano), contorno novo (magenta), guia (amarelo tracejado) e os pontos de registro.
- Botões Aprovar (pinta o quadrante de amarelo no estilo por feição da camada de quadrantes) e Pendente (laranja), com campo de observação.
- Comando separado Substituir camada vigente pela candidata. Antes de substituir, faz backup do projeto (backup_antes_refino_tpi_<data_hora>.ccmgis).
- Ao rasterizar polígonos, faça paridade par/ímpar dentro de cada feição e OU entre feições. Paridade entre feições anula polígonos duplicados e faz o canal "sumir".
- polygonClipping falha com segmentos quase nulos. Quantize as coordenadas em 1 cm, remova vértices repetidos e tente de novo com 2 cm e 5 cm antes de desistir. Conte e registre as falhas.
- Diferencie Polygon ([anel]) de MultiPolygon ([[anel]]) em todas as chamadas. O retângulo de recorte e a área da tela têm que entrar como MultiPolygon nas funções que esperam isso.
- O sistema de coordenadas de tela (Mercator) é girado em relação ao UTM. A área visível tem que ser o quadrilátero dos quatro cantos convertidos, não a caixa envolvente.
- A camada de quadrantes guarda o estado (amarelo/laranja) em _featureStyle por feição, não num atributo. Leia o estado pelo estilo.
1. Calibração: alpha entre 0,45 e 0,65 nos quadrantes aprovados. Com os parâmetros padrão, o refino aplicado num quadrante aprovado tem que reproduzir o polígono aprovado com diferença pequena de área.
2. Fora da área de trabalho: geometria idêntica, com no máximo arredondamento de emenda abaixo de 2 m² por feição.
3. Casos do projeto de Braço do Norte (Revisão C): 
   - Q0516: rede com junções; o resultado acompanha a calha escura do TPI e é contínuo;
   - Q0254: rio largo; o miolo é mantido e as margens seguem o TPI;
   - Q0618 e Q0450: área urbana; nenhuma calha nova em meio-fio ou rua, e a guia fica registrada como GUIA SEM CALHA;
   - Q0612: fundo de vale sem calha nítida; preservado, não removido;
   - Q0455: feições duplicadas; unificadas, sem perda de canal;
   - Q0587: polígono no limite do levantamento; mantido inteiro, sem tira na borda.
4. Ortofoto: em trechos com água visível, os registros saem CONFIRMADO NA ORTO; sob mata, SOB COPA; em rua ou telhado, nenhuma remoção acontece sem a confirmação de antropização.
5. Desempenho: cerca de 150 quadrantes em poucos minutos, sem travar a interface, com cancelamento
# Superfícies e sólidos Surpac nas seções geológicas

## Utilização

1. Abra **Geologia → Superfícies / Sólidos Surpac**.
2. Selecione o `.dtm` e seu arquivo de coordenadas `.str` ou `.stx` correspondente. O nome completo e o tamanho de cada arquivo permanecem visíveis em caixas separadas. Os leitores aceitam as variantes textuais e binárias testadas com o gravador do Varioscape.
   - Ao selecionar o segundo arquivo, a leitura e a análise topológica começam automaticamente, sem adicionar camadas. A caixa **Arquivos verificados e prontos para importar** só é marcada depois dessa verificação; não pode ser marcada manualmente.
   - Trocar qualquer arquivo limpa a marcação e verifica o novo par. Em erro ou cancelamento ela permanece desmarcada; **Verificar arquivos novamente** retoma a leitura mantendo os nomes.
   - O resultado distingue sólido fechado (contorno e preenchimento na seção) de malha aberta ou fechamento não confirmado (somente linhas). O eixo A–B precisa efetivamente cruzar o objeto. A verificação não detecta auto-interseções globais nem comprova o CRS ou que arquivos com referências válidas vieram da mesma versão do modelo.
3. Confirme o CRS dos arquivos e as unidades em metros, incluindo as cotas Z. Coordenadas locais precisam ser georreferenciadas antes da importação. Não há transformação de datum vertical.
4. Confira o nome de cada corpo/unidade antes de importar. Descrições do objeto/triangulação são aproveitadas; se o arquivo só possui identificadores, informe nomes como Calcário e Dolomito, sem atribuição automática de litologia.
5. Clique **Importar superfícies / sólidos**. O app aproveita a geometria já validada, sem reler os arquivos. Cada objeto/trisolation gera duas camadas: **Superfície/Sólido** e **Vetores** (todas as arestas únicas da triangulação). Elas podem ser ligadas separadamente na planta 2D, na visão 3D e no Layout. Não é uma caixa de localização nem um raster artificial: o sólido conserva múltiplas cotas no mesmo XY.
6. Em **Seção Geológica**, trace A–B ou selecione uma linha existente e marque as malhas desejadas. O MDT é opcional para um corte só de malhas. Projetos de cava continuam sendo fontes independentes que podem ser sobrepostas.
7. Gere a seção, exporte o PNG e salve a seção e o projeto `.ccmgis`. A geometria original fica uma única vez no arquivo, compartilhada pelas duas camadas; não é necessário reencontrar o par Surpac ao reabrir.

Projetos antigos com caixas de localização são migrados ao abrir: a caixa é substituída pela superfície real e recebe uma camada irmã de vetores. Camadas de versões atuais removidas intencionalmente não são recriadas. Remover apenas uma representação preserva a outra e a fonte para seções.

## Regras de representação

- Triângulos 3D são intersectados pelo plano vertical de cada trecho da seção, sem transformá-los em raster e sem limitar a uma cota por XY.
- Superfícies abertas geram linhas. Sólidos com fechamento topológico confirmado podem gerar regiões preenchidas, conservando cavidades pela regra par/ímpar.
- A/B podem terminar dentro de um sólido: o preenchimento é recortado à janela da seção, sem desenhar nas bordas falsos contatos geológicos.
- O preenchimento nunca é prolongado até a cota inferior escolhida. Essa cota limita a janela do gráfico, não a espessura real do sólido.
- Escalas horizontal e vertical são iguais. Mudanças de direção em A–B usam distância acumulada ao longo da linha.
- Fechamento é verificado pelas arestas e pelo leque de faces nos vértices. Auto-interseções globais não são verificadas. Faces inválidas, duplicadas, degeneradas ou topologia não manifold impedem preenchimento e geram avisos.

## Limites desta etapa

- Não importa modelos de blocos `.mdl/.dm`; não calcula recursos/reservas nem cria um modelo geológico a partir de observações.
- Até 128 MB por par, 500 mil triângulos/600 mil vértices por objeto e 1 milhão de triângulos retidos na sessão. Malhas com ambas as representações removidas ficam disponíveis ao Desfazer até reabrir, mas não entram no arquivo salvo.
- Limite cumulativo de 10 milhões de testes triângulo × trecho na geração da seção. Excedentes geram aviso, nunca simplificação silenciosa.
- Arquivos são lidos com cancelamento e prazo máximo de 2 minutos; análise inicial em segundo plano também pode ser cancelada.
- Importação de malhas novas em sala colaborativa ativa está bloqueada nesta etapa. Elas seguem no arquivo `.ccmgis` e no snapshot completo, não em eventos de importação ao vivo.

## Organização do código

- `surpac-reader.js`: leitor puro adaptado do Varioscape/SURPACIO, com validação estrita de registros e referências.
- `mesh-section-engine.js`: análise topológica e interseção exata de triângulos.
- `geological-meshes.js`: importação, gerenciamento, localização, prévia 3D e persistência.
- `mesh-rendering.js`: projeção real das faces/arestas no mapa, malhas XYZ na visão 3D e desenho no plano da prancha; a planta usa buffer de profundidade para mostrar as faces superiores de cada objeto.
- `geological-sections.js`: seleção das fontes, cálculo e desenho do perfil.

O aplicativo continua distribuído em HTML único gerado pelo manifesto. A publicação web mantém o portão Firebase existente; nenhum serviço externo novo foi criado.

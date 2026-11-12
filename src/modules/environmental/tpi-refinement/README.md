# Refino de calha (TPI)

Entrada: **MEIO AMBIENTE > Preservação permanente > Refino de calha (TPI)**.

1. Escolher hidrografia vigente, guia, Massa de Água, quadrantes e MDT. Edificações são opcionais. O TPI pode ser uma banda de valores ou ser calculado por janela a partir do MDT original.
2. Vincular os TIFFs originais ausentes e escolher a pasta do projeto para as evidências. A conferência usa os pixels originais da ortofoto, nunca a prévia.
3. Escolher quadrantes por estado, selecionados ou a área visível. Os aprovados em amarelo fornecem a calibração. Alpha fora de 0,45–0,65 interrompe a análise, sem ajustar artificialmente a mediana.
4. Calibrar e visualizar. A prévia usa ciano para o traçado anterior, magenta para o candidato e amarelo tracejado para a guia. Processamento e montagem ocorrem em Worker cancelável.
5. Aplicar cria um grupo novo com a camada candidata inteira e os registros. Geometrias inteiramente externas ou protegidas mantêm a referência original do array. A montagem verifica a diferença externa e recusa emendas acima de 2 m2 por feição.
6. Revisar por quadrante ou folhas 2x2 e registrar aprovação/pendência. Aprovação fica no estilo por feição e no histórico da candidata. As evidências não conclusivas não autorizam remoções automaticamente.
7. A substituição é um comando separado, exige aprovação e grava/verifica `backup_antes_refino_tpi_<data_hora>.ccmgis` antes de trocar a camada vigente. Ctrl+Z restaura a camada anterior.

A camada vigente deve estar no CRS de trabalho projetado em metros para conservar a identidade das geometrias externas. A resolução de análise deve ser múltipla inteira da célula nativa do MDT; padrão 0,45 m para MDT de 0,15 m. O núcleo é 250 m, contexto 25 m e suavização final 0,15 m. O estado aprovado/pendente é lido de `_featureStyle`, sem inventar atributos de quadrantes.

A proteção é conservadora: uma peça com mais de 15% de NoData fica protegida inteira; trechos preservados por fundo de vale ou incerteza da ortofoto são reinseridos por interseção com os polígonos originais, antes da montagem da candidata. Sombras sem evidência cromática de água ficam inconclusivas. A ferramenta não certifica automaticamente antropização sob copa ou em NoData.

## Validação

`node --test src/modules/environmental/tpi-refinement/engine.test.cjs` cobre geometria, paridade, duplicatas, raio/mínimos, calibração na borda vetorial, morfologia, trechos do eixo, NoData, fundo de vale, urbano e rio largo com dados sintéticos. `browser.test.cjs` integra o teste de navegador existente: Worker, leitura nativa, alpha, prévia sem gravação, candidata, registros, evidências JPEG, aprovação, backup completo verificado, substituição, desfazer e cancelamento.

**Pendente de arquivos de referência:** os casos reais Q0516, Q0254, Q0618, Q0450, Q0612, Q0455 e Q0587 e o tempo para 150 quadrantes da Revisão C não foram certificados. É necessário o .ccmgis completo e os TIFFs originais de MDT, TPI e ortofoto. Alpha observado nos testes sintéticos não é o alpha do projeto Braço do Norte.

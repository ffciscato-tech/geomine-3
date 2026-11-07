# Comparação no Perfil Longitudinal

Em **Topografia → Perfil Longitudinal**, o painel permite:

- Vários MDTs/TIFFs: escolha o terreno, use **＋ Comparar**, depois escolha a cava ou outra superfície. Repita para manter mais fontes na lista.
- Várias camadas vetoriais 3D: o mesmo botão mantém linhas XYZ/zg ou curvas com atributo de cota. Não é necessário TIFF.
- **Comparar MDTs e vetores 3D juntos**: combina as duas listas no mesmo gráfico.

O eixo comum é independente das fontes. Escolha uma linha 2D/3D em **Eixo comum**, selecione a feição/parte no mapa ou trace A–B. Em camadas multipartes, cada parte pode ser escolhida separadamente. A lista limita a exibição a 1.000 partes para não carregar bases grandes inteiras no formulário; outras partes podem ser selecionadas no mapa. A primeira linha simples adicionada à comparação sugere o eixo quando ele ainda não foi definido.

As fontes seguem a ordem adicionada, antes da escolha atual. Em modo misto, MDTs antecedem vetores. Para exportação GEO5, adicione primeiro o terreno, pois o exportador usa a primeira série como superfície de referência.

Os gráficos, PNG, CSV e DXF usam a mesma malha de progressivas. O cálculo conserva vértices e cruzamentos vetoriais mesmo fora do passo regular. Raster e vetor não são sobrepostos por índice; cada amostra corresponde à mesma posição do eixo. Linhas paralelas fora do eixo e sem cruzamentos não são deslocadas para gerar cotas fictícias. Curvas cruzadas pelo eixo mantêm a interpolação entre cruzamentos já existente no aplicativo.

Rasters respeitam a grade escolhida (nativa ou de trabalho), CRS horizontal, dimensões X/Y da célula e valores NoData. Cotas devem estar em metros e no mesmo referencial vertical; transformar coordenadas horizontais não converte datum vertical. O teto de 50 mil amostras regulares aumenta o passo efetivo, informado no resumo, sem eliminar vértices ou estações vetoriais. Feições menores que o passo podem não ser amostradas.

**Editar linhas do perfil** mantém estilos independentes por ID/tipo de fonte, mesmo quando os nomes são iguais. O PNG respeita a visibilidade; CSV/DXF continuam exportando as séries calculadas, como antes. Reabrir o painel não substitui as fontes pelo MDT de trabalho.

A comparação é temporária na sessão, como o perfil anterior: o alinhamento continua sendo salvo automaticamente como camada. Ao abrir outro projeto, o perfil temporário é limpo para não reutilizar eixos ou IDs de outro arquivo. Não foi introduzido salvamento automático nem alterado o fluxo clássico dos projetos.

Correções: seletor de MDT deixou de ser único; escolha do eixo deixou de depender de haver apenas uma fonte vetorial; modo misto usa união de estações; fontes ausentes geram aviso em vez de substituição; leitura nativa em andamento é descartada caso o usuário altere fontes/eixo ou troque de projeto.

Implementação modular: `modules/topography/longitudinal-comparison.js`; integração nos controles existentes de Topografia. A seção geológica permanece independente.

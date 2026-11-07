# Sondagens na seção geológica

Correção da seleção e da representação de furos, sem alterar os dados dos projetos abertos ou o método de desvio importado.

- As caixas de seleção e os papéis das camadas são sincronizados imediatamente. Desmarcar todas é uma escolha persistente, não um pedido de seleção automática. A configuração guarda `layerSelectionSet` e a seção vetorial guarda `SEL_CAM`.
- O botão **Abrir seção geológica**, após importar furos, inclui explicitamente somente a camada recém-importada, preservando as outras escolhas. Importar normalmente não altera a seleção existente. Uma camada removida ou de outro projeto não pode ser incluída por um diálogo antigo.
- Collars legados reconhecem cotas decimais textuais, como `420,6`, e cotas próprias em `zg`, preservando o vínculo entre coordenadas e Z. Campos explicitamente mapeados têm precedência. Cotas ou profundidades explicitamente inválidas são informadas, não substituídas silenciosamente.
- Sem profundidade, a boca aparece apenas como ponto cotado, identificado como **boca sem trajetória**. Não se cria furo, intervalo ou profundidade usando a coluna `Cota indic`. As trajetórias importadas continuam usando suas estações XYZ e MD, com recorte no corredor e sem recalcular survey.
- O resumo explica furos fora do corredor, filtros/categorias e camadas não selecionadas. O corredor é a largura total: 100 m inclui até 50 m de cada lado do eixo. Nenhum corredor é ampliado automaticamente.
- A prévia é invalidada enquanto se edita o corredor, antes do clique em **Gerar**. Isso evita que o botão mude de posição entre pressionar e soltar, descartando o clique.

## Validação

Testes unitários e ensaio no navegador com importação CSV real, geração de seção, seleção de camadas, salvar/reabrir, cotas locais e PNG da seção. Mantidos os testes de escala 1:1, sondagens importadas, logs, perfis e projeção em planta.

Na cópia de leitura do projeto fornecido, a seção A–B tem corredor de 100 m e os 12 collars estão a aproximadamente 453–1.240 m do eixo. O teste verifica que eles continuam excluídos com aviso; somente no ensaio em memória com corredor mais largo são exibidas as 12 bocas, sem traçados inventados. O arquivo original não é alterado. Um corredor largo não é recomendado automaticamente: cabe ao usuário escolher o eixo e a faixa adequados à interpretação.

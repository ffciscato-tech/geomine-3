# Desenho e deslocamento ortogonal

O módulo `src/modules/cad/orthogonal.js` unifica o antigo ORTO do CAD com o
menu Snap (ímã). Marque **Ortogonal (0° / 90°)** ou pressione **F8**. O pequeno
esquadro sobre o ímã indica o estado ativo. O controle CAD reflete o mesmo estado.
O modo começa desligado e funciona independentemente do Snap magnético.

## Referências e escopo

- Desenho de linhas/polígonos: eixo dominante X/Y a partir do último vértice.
  O primeiro ponto continua livre. A prévia pontilhada e o cursor mostram o
  mesmo destino que será gravado no clique. Fechar um polígono acrescenta uma
  esquina ortogonal, quando necessária, antes de retornar ao primeiro ponto.
- Arraste de vértice, vértice recém-inserido, grupo ou feição inteira: movimento
  X **ou** Y relativo à posição inicial do gesto, sem acumular deriva a cada
  evento. Isso restringe o deslocamento; não retifica os segmentos existentes.
- Editor vetorial: cobre os dois sistemas de edição, por marcadores e canvas,
  além do destino dos comandos Mover/Copiar por dois cliques.
- Eixos no CRS da camada editada, com CRS do projeto como fallback. A visualização
  Web Mercator não governa o cálculo. Formas, Z e histórico de desfazer continuam
  sob responsabilidade das rotinas existentes de edição.
- Coordenadas digitadas explicitamente no CAD continuam exatas; não são
  silenciosamente modificadas. Ferramentas temáticas (régua, seção geológica,
  seleção, formas paramétricas etc.) mantêm suas próprias regras de entrada.

## Snap compatível

O cursor é projetado no eixo antes de buscar alvos. Um ponto/vértice fora do
eixo é rejeitado mesmo que esteja próximo. Para um segmento, é calculada a
interseção com o eixo ortogonal; se for colinear, usa-se o ponto mais próximo
no intervalo. A tolerância de atração continua sendo a tolerância visual do
Snap. O Snap livre não recebe os filtros novos e preserva seu comportamento.
A prévia limita as buscas à cadência existente de 45 ms.

## Validação

`tools/smoke_orthogonal_snap.cjs` usa o aplicativo completo em perfis isolados
de desktop e toque: menu/CAD/F8, desenho, prévia, rejeição de alvo fora do eixo,
atração a vértice alinhado, interseção com linha, arraste de vértice/grupo/feição,
cotas Z, movimento livre com ORTO desligado, Mover, fechamento de polígono,
gestos reais do editor canvas e Desfazer. Regressões verificadas: seção geológica,
selo A3 com logomarca e isolamento dos snapshots de projeto.

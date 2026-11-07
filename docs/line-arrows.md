# Setas no final das linhas

Em **Propriedades da camada → Simbologia**, camadas de linha oferecem:

- Sem seta (padrão de projetos antigos).
- Seta aberta no final.
- Seta preenchida no final.
- Comprimento da ponta, em milímetros na plotagem (0,5–20 mm).

O padrão geral vale para a camada inteira. Nas categorias/classes, a opção
“Usar padrão da camada” mantém a herança; uma seta ou tamanho próprio é opcional.
A ponta está no último vértice de cada parte da feição, na direção do último
segmento não nulo. Vértices finais duplicados são ignorados somente para
determinar a direção. Nenhuma coordenada é alterada.

A representação é compartilhada pelo mapa 2D, Layout e suas exportações
SVG/PNG/PDF, legendas e vetores da vista 3D. No mapa, as pontas usam o mesmo
painel/renderizador da camada, incluindo o modo canvas. Sua visibilidade
acompanha categorias, filtros, ordem das camadas e visibilidade real por cota.
Recortar uma linha na borda do mapa ou no terreno nunca cria um novo terminal.

O tamanho em tela usa a conversão convencional de 96 px/polegada; na prancha,
usa milímetros e acompanha o multiplicador de símbolos do mapa. As amostras
da legenda são reduzidas à caixa de símbolo, como os demais estilos.
No 3D, a ponta mantém o terminal XYZ e acompanha a câmera para permanecer
legível. O exagero vertical geral do 3D não modifica as coordenadas salvas.

As opções ficam em `sym.arrowEnd`/`sym.arrowSize`, com substituições opcionais
nas categorias/classes. Salvar/reabrir o projeto e copiar/colar estilo
preservam esses valores. Exportações de geometrias (como DXF/shape) não
transformam a seta visual em novos vértices ou feições.

## Validação

`tools/validate_line_arrows.mjs`: geometria terminal, herança, duplicatas,
multipartes, reversão, dados inválidos, recorte e geração SVG segura.

`tools/smoke_line_arrows.cjs`: Chrome isolado com dados sintéticos, controles
reais de propriedades, estilos por categoria, copiar/colar, salvar/reabrir,
pan/recorte, visibilidade real por cota, SVG de Layout/legenda, cena 3D e
canvas para mais de 4.000 feições.

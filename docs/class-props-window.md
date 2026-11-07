# Janela resumida de propriedades da classe

## Pedido

Numa camada classificada (por exemplo, 3 silos categorizados pelo nome), dar dois cliques numa classe da árvore deve abrir uma janela resumida para editar só aquele item: cor de preenchimento, largura da linha, hachura etc.

## Comportamento

- **Dois cliques** numa classe sob a camada (linha `.clsrow`, com as classes expandidas) abrem direto a janela **Classe “…” · camada**. O clique simples não abre menu nenhum. O antigo minimenu com "Renomear classe…" saiu (12/10), a pedido.
- **Nome da classe** (só categorias), no topo da janela: o botão **Renomear** ou Enter troca o valor do campo de classificação em todas as feições da classe (`renameCategorizedClassCore`). Legenda, rótulos, tabela e título acompanham, e o estilo da classe é mantido. Nome repetido é recusado e o campo volta ao nome atual. O nome não entra na aplicação ao vivo do estilo; renomear é sempre explícito. Nas classes graduadas, o "nome" é a faixa de valores e não aparece.
- O conteúdo é o mesmo editor por classe da janela completa da camada (`clsEditor`), já aberto:
  - **Polígono:** preenchimento e contorno com paleta, hachura e espaçamento, espessura, opacidade do preenchimento e estilo de linha.
  - **Linha:** cor, espessura, estilo de linha e seta própria da categoria.
  - **Ponto:** símbolo, tamanho próprio, cores e espessura.
- **Aplicação ao vivo:** mapa, amostra da árvore e prancha aberta acompanham cada ajuste, com o mesmo atraso curto da janela completa.
- **Usar o padrão da camada** tira as exceções da classe (contorno, hachura, espessura, opacidade, linha, seta, símbolo, tamanho) e mantém só a cor, que é o que distingue a classe.
- **Propriedades da camada…** abre a janela completa.
- O estilo fica em `L.sym.cats` / `L.sym.classes`, então é gravado e reaberto com o projeto. Respeita a reserva de camada da colaboração.

## Implementação

`09-measurement-properties-cad.js`:

- `clsBindEditors(box, camada)`: ligações do editor (paleta, hachura, tamanho próprio, galerias de símbolo e de linha), extraídas de `renderLpClasses`.
- `clsLerEditor(el, c, L)`: leitura de uma classe, extraída de `lpCollect`.
- `openClassProps(L, ci)`: a janela resumida.

A janela completa da camada usa as mesmas duas funções. `lpBindPtPreview` passou a aceitar o contêiner.

`15-layer-tree-crs-ui.js` liga o duplo clique nas classes categorizadas e graduadas. O clique simples no nome não tem mais ação.

## Verificação

`tools/smoke_class_props.cjs` (mouse real; camada "Silos" com 3 silos por NOME e camada de linhas "Correias"):

- o clique simples não abre nada; dois cliques em "Silo B" abrem a janela direto, com o nome editável;
- renomear para "Silo Beta" pela janela troca o campo das feições, mantém o estilo, atualiza título e árvore; "Silo A" repetido é recusado;
- preenchimento, contorno, espessura 4, hachura malha e espaçamento 2 só no Silo B, também no SVG do mapa;
- Silo A sem mudança;
- "Usar o padrão da camada";
- gravar e reabrir;
- estilo de linha só da classe "Ramal", sem hachura na janela de linha;
- a janela completa da camada segue aplicando pelo mesmo leitor.

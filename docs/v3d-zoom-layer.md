# Visão 3D — zoom na camada ativa e barra de ícones

## Comportamento

- A barra de ícones da Visão 3D ganhou **Zoom na camada ativa** (camadas com lupa), entre "Centralizar rotação" e "Vista em planta".
- A camada ativa é a vetorial selecionada na árvore ou, quando o selecionado é um raster/MDT, esse raster. O zoom enquadra só os objetos da cena que pertencem a ela (`userData.layerId` nos vetores e malhas, `userData.rasterId` nas superfícies), considerando a largura e a altura da janela.
- A escala de navegação (`V3.size`) passa a ser a da camada: a roda do mouse limita o raio da câmera a 0,02–20 × essa escala, então é possível aproximar de uma estrutura de poucos metros sobre um MDT de quilômetros. O plano próximo da câmera desce de 1 m só o necessário para não cortar a camada de perto.
- **Vista em planta** e as vistas laterais devolvem a escala do conjunto visível e o plano próximo de 1 m.
- Sem camada selecionada, ou com a camada desligada/fora da cena, uma mensagem explica o motivo e a câmera não muda.

## Barra cortada pelas abas

No tema atual, as abas 2D/Cava/Visão 3D/Layout ocupam 31 px no topo da área de trabalho. O CSS já posicionava `#v3d` abaixo delas (`body.alagis3 #v3d{top:31px}`), mas o estilo embutido `inset:0` no HTML vencia essa regra: a cena 3D inteira ficava sob as abas e o topo dos ícones era coberto. A extensão `inset:0` passou para o CSS (`#v3d{inset:0}`), e a regra do tema volta a valer. O canvas acompanha o novo tamanho pelo `ResizeObserver` existente.

## Verificação

Navegador isolado, terreno sintético de 240 m e polígono de 20 × 15 m, em 1280×800 e 1920×1080: nenhum dos ícones fica coberto pelas abas; o zoom leva o raio de 262 m para 32 m e a escala de 238 m para 20,6 m; zoom no raster selecionado; mensagens sem seleção e com camada desligada; a vista em planta restaura escala e plano próximo; sem erros de página.

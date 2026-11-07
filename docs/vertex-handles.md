# Marcadores de edição no tablet

## Defeito reproduzido

Ao ativar o Editor de Vetores/CAD e depois Editar vértices, o editor de canvas
continuava ligado enquanto o editor Leaflet montava os marcadores DOM. Em um
polígono simples, a versão anterior manteve 9 marcadores DOM e 20 primitivas
no canvas simultaneamente. Eventos de ponteiro podiam alterar a geometria no
canvas sem atualizar os marcadores DOM. No toque, o glifo tinha 26 px em vez
de distinguir tamanho visível e área de interação.

## Correção modular

`src/modules/cad/vertex-handles.js` controla a exclusividade dos editores e a
criação dos ícones. Integrações pequenas nas partes 06 (troca de ferramenta),
12 (marcadores Leaflet) e 27 (canvas e ponteiro).

- Editar vértices limpa o canvas, os índices antigos e qualquer arraste do
  editor secundário. O canvas não desenha nem recebe gestos enquanto o editor
  Leaflet estiver ativo. Ao voltar à seleção, retorna o editor de canvas.
- Vértice visível de 12 px, inserção de 10 px e alça da feição de 20 px, iguais
  no mouse e no toque. Alvos de toque transparentes de 28/24/32 px, centrados.
- Pontos médios são ocultados durante o arraste e recalculados ao soltar.
  Ao mover a feição inteira, todos os vértices acompanham o gesto em tempo real.
- Rebuild remove também os invólucros órfãos dos ícones. Sem mudanças no
  formato de projeto, nas geometrias salvas ou nas configurações de usuário.

## Verificação

`tools/smoke_vertex_handles.cjs`: teste de regressão contra o HTML anterior
(`caminho.html --baseline`), seguido de testes no Chrome com toque habilitado.
Gestos nativos via eventos de toque: mover vértice, inserir pelo ponto médio,
mover toda a feição, desfazer; fechamento do anel e cotas Z preservados.
Verifica coordenadas dos marcadores contra os vértices, ausência de canvas
duplicado, reconstruções repetidas, transição entre ferramentas, toque no
editor de canvas e arraste com mouse. Não equivale a um teste em tablet físico.

# Sólidos no 3D sem depender do MDT e volume a partir de uma cota

## Sólido que "sumia" ao desligar o MDT

A cena 3D usa uma origem local: o centro da **primeira superfície ligada** (ou dos vetores) e a menor cota. Os vértices de um sólido eram gravados nessa origem no momento em que ele era gerado. Ao desligar o MDT, a cena era remontada com a origem de outra superfície, mas o sólido voltava com as coordenadas antigas e ia parar a dezenas de metros do lugar (no projeto FRONTERA ISIS DCE, 105 m a oeste e 77 m ao norte). O mesmo acontecia com a cena mínima da cubagem e ao mudar o exagero vertical.

Agora:

- Todo sólido guarda a origem e o exagero com que foi montado (`userData.ccmOrigin`). `solPosiciona` desloca e escala o grupo para as mesmas coordenadas reais sempre que a cena muda de origem (`build3D`, `cubCenaMinima`) ou de exagero (`v3SetVE`).
- Sem superfície nem vetor 3D ligados, a cena 3D é montada com a extensão dos sólidos visíveis (`solExtensao`), em vez de recusar. Os sólidos também entram no enquadramento da câmera.
- O sólido fechado do DCE (Projeções de taludes → Concluir com sólido) não tinha objeto 3D: só aparecia a superfície do topo apoiada no MDT. Agora a casca fechada (`sol.mesh`, em coordenadas reais) vira um objeto próprio na cena (`solGarantaGrupo`), com deslocamento de polígono para não cintilar sob a superfície projetada.

## Volume a partir de uma cota

Nas **propriedades do sólido** (clique no sólido na árvore), a seção **Volume a partir de uma cota** recebe uma cota em metros e mostra o volume **acima** e **abaixo** dela, com percentuais, a massa (quando há densidade) e o total. A última cota usada fica no sólido e é recalculada ao reabrir as propriedades.

- Sólidos extraídos (pilhas, edificações, objetos): exato por célula, com topo e piso de cada coluna (a casca 3D deles não tem face inferior).
- Modelo de blocos: exato por bloco, usando todos os blocos do modelo (não só os exibidos).
- Demais sólidos (cubagem lisa, escalonada, DCE fechado): pela casca 3D, com o teorema da divergência aplicado a F = (0, 0, min(z, c)). O volume abaixo da cota é a integral de min(z, c)·n_z na casca, sem fechar tampa no corte; faces verticais não contam e a orientação é normalizada pelo volume total.

## Sólidos gravados no projeto

O `.ccmgis` grava a lista `solidos`: propriedades (nome, modo, origem, volume, densidade, cotas, domínio, cor, opacidade, regras, cota de corte, dados do modelo de blocos) e a geometria em coordenadas reais, em base64 como as grades dos rasters:

- casca triangulada (`malha`): vértices relativos a uma origem inteira (precisão milimétrica em float32), soldados ao milímetro e indexados; cores por cota são refeitas ao abrir;
- blocos instanciados (`blocos`): centro, dimensões e cor de cada bloco exibido;
- `colunas` dos sólidos extraídos e o modelo de blocos completo (`blocos`, até 1 milhão) usados no volume por cota;
- `casca` fechada do DCE (`sol.mesh`).

Ao abrir o projeto, os sólidos do projeto anterior saem e os gravados voltam à árvore; o volume por cota funciona mesmo antes de abrir o 3D, e a cena 3D os recoloca na posição real. Salvar de novo sem refazer o sólido regrava a mesma geometria, sem recodificar. A escrita por partes grava cada sólido separadamente (`solidos` entra nas listas grandes, como `layers` e `rasters`).

No projeto FRONTERA ISIS DCE (cópia), o sólido entre `dce_22jun26_c` e `MDT sem Depressao` ocupou 284 KB num arquivo de 66 MB e voltou na mesma posição, com o mesmo volume e o mesmo corte por cota.

## Verificação

`tools/smoke_solid_cota_3d.cjs` (navegador isolado, superfícies sintéticas): sólido entre topo em cunha e base plana; posição real mantida ao desligar o MDT que definia a origem, sem nenhuma superfície e com exagero 3×; cena montada só com o sólido; volume por cota 0 / 3/4 / total nos limites da cunha (30 000 m³ ⇒ 22 503 m³ abaixo de 105 m); casca fechada tipo DCE com objeto próprio e volume exato; colunas e blocos exatos; painel de propriedades com acima/abaixo e percentuais; gravação e reabertura da cunha, da casca fechada, de blocos e de um sólido extraído com propriedades, volume por cota e posição real, regravação idêntica e limpeza ao abrir outro projeto. `PLAYWRIGHT_MODULE`, `CHROME_PATH`, `APP_PATH` e `QA_CAPTURE_DIR` permitem rodá-lo fora do macOS.

Reprodução no projeto real (cópia, sem gravar): `FRONTERA_ISIS_DCE_Caixas_MDT.ccmgis`, sólido entre `dce_22jun26_c` e `MDT sem Depressao` com o MDT como primeira superfície — o centro do sólido permanece em E 313 512, N 7 683 590, cota 987 com o MDT ligado, desligado e sem superfícies.

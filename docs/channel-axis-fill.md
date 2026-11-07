# Preenchimento por altura acompanhando o eixo

## Fluxo visível

Meio Ambiente → Extrair Calha MDT → Modo de delimitação → **Altura acompanhando o eixo — preenchimento 2D (Hidro)**.

Selecionar o MDT original e uma linha, informar a altura acima do terreno no eixo, analisar, conferir e criar a faixa. Os modos automático e profundidade acima do fundo continuam separados; receitas salvas não mudam de significado.

Este modo não identifica fundo, crista ou quebra antes de preencher. Uma falha do modo automático oferece atalho explícito para ele, sem inventar uma altura nem criar camadas automaticamente.

## Motor modular

- `hydrology/flood-fill-engine.js`: núcleo compartilhado de conectividade por quatro vizinhos e limiar estrito. O módulo Hidro também chama esse núcleo. Não altera cotas nem a lógica dos contornos antigos do Hidro.
- `environmental/channel-axis-fill-engine.js`: corredor XY na resolução nativa; densificação interna do eixo; campo de níveis locais; máscara preenchida; união em polígonos e ilhas; seções diagnósticas.
- `environmental/channel-extraction.js`: leitura por janelas, worker cancelável, revisão, criação transacional das duas camadas e atributos auditáveis.
- `environmental/channel-live.js`: mesma construção do worker e mesmo método no recálculo após editar o eixo.
- `environmental/channel-details.js`: detalhes PNG/ZIP a partir dos polígonos reais, não de uma faixa reconstruída pelas extremidades das seções.

O eixo é densificado apenas para cálculo, com passo máximo de meio pixel. Os vértices originais não são substituídos. A cota do MDT é lida nas referências densificadas; o intervalo escolhido para os perfis de conferência não define a densidade dessa referência.

O alvo em cada posição é a cota do terreno no eixo mais a altura informada. A cota local é interpolada longitudinalmente e atribuída pelo trecho mais próximo do eixo. O resíduo `terreno - nível local` é entregue ao mesmo núcleo do Hidro com limiar zero, usando sementes ao longo do eixo. Isso permite contornar uma ilha por uma passagem molhada em 2D, sem inundar a própria ilha.

A união remove bordas internas entre células molhadas e preserva partes separadas e furos. O contorno permanece limitado pela resolução do MDT. Não se usa uma cota absoluta alta de montante para inundar indiscriminadamente todo o trecho a jusante.

## Referências e limites

Não é uma simulação hidráulica de vazão, velocidade ou remanso, nem identificação legal do leito regular. O MDT pode registrar água, vegetação ou terreno; a fonte e a altura precisam ser conferidas.

`Z_REF` e `Z_EIXO` representam a referência no eixo. `Z_FUNDO` fica nulo nesse modo: não foi localizado um talvegue. `ALT_EIXO`, `N_REF`, `PASSO_REF`, `PIXEL_M`, alcance e método ficam nos atributos. As larguras molhadas somam os intervalos reais; `ENVOLV_M` é a distância entre os extremos. Uma ilha seca não vira um segmento molhado.

NoData tocando a mancha, ausência de cota no eixo ou alcance lateral insuficiente são erros explícitos, não margens artificiais. A busca pode ser limitada pelo usuário ou ampliada por etapas, dentro dos orçamentos do aplicativo. Os extremos da linha são limites artificiais declarados. Faixas resolvidas com menos de dois pixels recebem aviso de precisão, sem o veto usado nos modos antigos.

Nenhum dado é inserido antes da confirmação. MDT, eixo, estilos e geometria original são preservados. Quando o vínculo está ligado, mover um vértice recalcula após concluir a edição; **Recalcular calhas vinculadas** permite nova tentativa. Falha de recálculo preserva o último desenho marcado desatualizado. Editar manualmente o resultado pausa o vínculo para preservar o trabalho.

## Verificações

Testes cobrem comparação do núcleo Hidro com 500 grades determinísticas; cristas submersas e no nível; conexão contornando ilha; NoData; referências densificadas; invariância ao intervalo de perfis e à inversão da linha; curvas; área e cobertura da máscara; dados originais imutáveis; limites de recursos; save/reopen; recálculo vinculado; GeoJSON com ilhas; PNG/ZIP e os modos anteriores.

As capturas de testes são identificadas como terreno sintético. O eixo de 531 m da imagem mais recente do usuário não foi apresentado como se tivesse sido reproduzido com dados locais. O projeto local anterior é um caso adicional diferente.

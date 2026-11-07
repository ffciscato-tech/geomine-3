# Destino persistente da calha

## Comportamento

- **Gerar como** escolhe o tipo: **Calha de rio** (método `Automático`) ou **Massa de água** (`Altura acompanhando o eixo` ou `Profundidade acima do fundo`). Calha e massa d'água têm destinos separados; uma nunca grava na camada da outra, e a lista de nomes só oferece camadas do tipo escolhido.
- O destino é o **Nome da camada a gerar**. O campo já vem com o nome da camada em uso daquele tipo: sem mudar o nome, o resultado grava nela (outro rio é acrescentado; o mesmo eixo é substituído). Somente na primeira geração de cada tipo a dupla é criada, com um nome padrão livre.
- Se a camada em uso for renomeada na árvore com o diálogo aberto, o nome sugerido (não editado) continua apontando para ela: o resultado não cria outra camada com o nome antigo.
- Recalcular um eixo substitui somente as feições desse eixo. Um eixo adicional é acrescentado à dupla, preservando os outros trechos e as feições manuais independentes.
- Digitar **outro nome** é a escolha explícita de uma camada nova (com a de seções `Seções — <nome>`). Se o nome digitado for o de uma camada do mesmo tipo, o resultado entra nela; se for o de outra camada qualquer, a criação é recusada. Nenhuma camada criada pela ferramenta repete um nome existente: nomes padrão recebem ` (2)`, ` (3)`… quando necessário. Após criar, o campo passa a ter o nome da nova dupla.
- Se a camada de seções ou a de calha da dupla foi apagada, a restante continua sendo o destino: a geração recria somente a camada ausente, com as mesmas receitas, e um único Desfazer remove a camada recriada e restaura a outra.
- `Desenhar linha-guia no mapa` acrescenta o novo eixo à camada `Eixo da calha MDT` já existente (editável) e seleciona apenas esse eixo para o cálculo. A camada só é criada quando ainda não existe.
- O destino mais recentemente usado é identificado pelos metadados gravados no projeto, sem depender do nome das camadas ou de uma preferência global do navegador. O tipo fica em `_channelLink.kind` (`calha` ou `agua`); duplas anteriores sem esse campo são classificadas pelos modos das receitas e, se misturadas, pelo nome dado na criação.
- IDs das camadas, nomes, grupo, ordem, estilo e visibilidade permanecem durante a atualização. Desativar o vínculo automático não perde o destino persistente.
- Regenerar um trecho editado manualmente exige confirmação; cancelar não altera dados. Editar outros trechos não provoca confirmação nem sua substituição.

## Estrutura e segurança

`channel-destination.js` concentra a seleção de destino, migração, gravação transacional e desfazer. A integração no core é somente um despacho da ação `channelresult`, antes de retirar a ação da pilha de undo, preservando a prioridade existente dos outros editores.

O campo já persistido e compartilhado `_channelLink` aceita um container v2 `{version:2,id,kind,role,updatedAt,entries}` (`kind` é opcional e ignorado por versões anteriores). Cada entrada mantém uma receita de eixo, e as feições correspondentes recebem `_channelRecipeId`. Não há alteração de formato do arquivo nem de permissões do serviço.

`channel-live.js` processa cada entrada separadamente e mantém suporte às receitas v1. Uma atualização automática não substitui outros eixos da camada. A migração v1 divide o lote por eixo de forma validada, preservando assinaturas individuais dos trechos que não mudaram.

O destino é conferido antes e depois da leitura do MDT: identidade, composição do par, dados, bloqueio e permissão das duas camadas. Mudança concorrente ou erro na segunda camada desfaz toda a gravação. Um destino bloqueado/incompleto não é convertido silenciosamente em nova camada.

Uma geração corresponde a um único Desfazer para as duas camadas. Se houver alterações posteriores nos dados, a ação se recusa a sobrescrevê-las. Alterações posteriores só de estilo são preservadas ao desfazer a geração.

## Verificações

- Auditoria de destino: 26 casos, inclusive migração multieixo, falha/cancelamento, undo, alteração concorrente, separação calha/massa d'água, nomes e recriação da camada ausente.
- Navegador isolado (`tools/smoke_channel_kind_destination.cjs`): 5 grupos — destinos separados, reaproveitamento por tipo, nome novo/repetido, recriação após apagar as seções e eixo-guia acrescentado à camada existente. `PLAYWRIGHT_MODULE`, `CHROME_PATH` e `APP_PATH` permitem rodá-lo fora do macOS.
- Vínculos por entrada: 6 grupos, incluindo leitura/gravação sem mutar o projeto aberto e suspensão durante atualização manual.
- Navegador isolado: destino 9, criação 6, preenchimento pelo eixo 9 e profundidade 5 grupos; regressões completas de extração, vínculos v1, desenho e leitura de TIFF nativo.
- Nenhum projeto do usuário foi aberto, recarregado ou modificado durante os testes.

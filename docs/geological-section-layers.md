# Camada automática do eixo da seção geológica

Em Geologia → Seção Geológica → Traçar no mapa, marque A e B e, se desejar,
pontos intermediários. **Concluir A–B** cria imediatamente uma camada vetorial
independente no grupo Geologia, sem exigir gerar primeiro o perfil ou clicar
em Salvar no projeto. Gerar seção enquanto o desenho está ativo também
conclui o eixo antes de calcular o perfil.

Cada novo traçado tem seu próprio identificador e camada. Nomes repetidos
recebem sufixos como “A–B (2)”. A camada anterior não é substituída. Concluir
novamente ou salvar os parâmetros da mesma seção atualiza a camada existente,
sem criar uma duplicata. O grupo é expandido ao incluir a nova camada.

A camada pode ser ligada/desligada, estilizada ou removida pela árvore de
camadas. Depois da conclusão, não existe uma cópia temporária desenhada por
cima que desrespeite essa visibilidade. Limpar encerra o traçado ativo; não
apaga camadas previamente concluídas. Um ponto isolado ou um eixo sem
extensão não gera camada vazia.

Usar linha copia o eixo escolhido para a configuração da nova seção; ao
concluir/salvar, cria uma camada de seção sem modificar a fonte. Camadas
antigas com múltiplos eixos mantêm seus demais registros, campos e nome
personalizado. As coordenadas são convertidas para o CRS da camada ao
atualizar um eixo antigo.

O salvamento geral do projeto continua **manual**: clique em Salvar para
gravar as camadas e configurações no arquivo. Esta mudança não habilita
salvamento contínuo no arquivo nem publica dados de projeto na nuvem.

Testes: `tools/smoke_geological_section_layers.cjs` e
`tools/smoke_geological_section_drawing.cjs`, com projetos sintéticos e
navegador isolado.

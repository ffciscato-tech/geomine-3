# Criação direta e contorno editável da calha

## Interface

- Removida a confirmação obrigatória. Criar executa a análise quando não existe uma prévia atual e, se válida, cria as duas camadas.
- Analisar e visualizar continua disponível, mas é opcional.
- Status, progresso, cancelamento e ações ficam no rodapé visível; campos e perfis rolam no corpo.
- Removidos os parágrafos explicativos. Permanecem rótulos, perfis, resumo numérico e avisos de erro.
- Os controles funcionais de limite de busca e atualização pelo eixo permanecem.
- Cliques durante cálculo/criação são ignorados. Um resultado já criado, com as mesmas fontes/opções e ambas as camadas existentes, não é duplicado.
- Alteração do eixo, MDT, seleção, filtro ou opções invalida a prévia e exige novo cálculo antes da criação.

## Contorno no modo Altura acompanhando o eixo

O preenchimento continua usando o MDT original e a densificação interna do eixo. Depois da união, o módulo independente `channel-contour-simplification.js` simplifica somente os polígonos derivados.

A tolerância inicial é metade do espaçamento entre seções. Ela é reduzida automaticamente até preservar componentes, furos, ausência de cruzamentos e diferença simétrica máxima de 10% da área de cada componente. Se não for possível validar em segurança, o contorno original é mantido. Não se promete distância uniforme entre vértices, nem remoção de todos os detalhes.

O eixo desenhado, MDT e perfis nativos não são simplificados. A prévia e a camada criada usam o mesmo contorno. Campos TOL_SIMPL, VERT_ORIG e VERT_FINAL registram o resultado; imagens/ZIP identificam o contorno simplificado e mantêm os perfis nativos.

Vínculos novos guardam `simplifyOutput:true`. Receitas antigas sem a opção mantêm o comportamento original, sem migração automática. Edições manuais nas camadas geradas suspendem o vínculo existente, preservando o trabalho.

## Verificação

- Simplificador: 11 grupos, incluindo furos, componentes próximos, simetria por inversão, coordenadas UTM, área XOR e entradas imutáveis.
- Criar direto: erro sem MDT, prévia opcional, antiduplicação, fonte modificada, NoData, recuperação e ajustes manuais.
- Regressões: preenchimento por eixo, profundidade, atualização vinculada, MDT original, desenho do eixo, detalhes e núcleo Hidro.
- Layout conferido em navegador isolado desktop e tablet. Nenhum projeto aberto do usuário foi recarregado ou alterado.

Trata-se de uma faixa topográfica estimada, não de cálculo hidráulico ou delimitação automática do leito regular.

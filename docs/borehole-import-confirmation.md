# Importação de sondagens: ação e confirmação

Em **Geologia → Furos · CSV / Furos · Strings**, o botão **Importar no projeto** inicia a leitura e validação quando não existe prévia válida. Não cria uma camada nessa primeira ação. Após a validação, passa a **Confirmar importação (N)**; somente a confirmação adiciona as sondagens ao grupo Geologia. O botão **Validar e visualizar** continua disponível e também lê as tabelas quando necessário.

O rodapé apresenta permanentemente o andamento, a próxima ação ou o erro. O corpo mantém a mensagem completa, avisos, tabela de prévia e visualização 3D. Falta de confirmação das unidades ou um CRS inválido direcionam o foco ao campo correspondente. O sucesso muda a ação para **Importado**, bloqueando cliques repetidos.

Renomear a camada não invalida os dados já validados. Alterar arquivos, mapeamentos, sistema de coordenadas ou convenções invalida a prévia e exige nova validação, com aviso explícito. Leituras canceladas, mudanças de projeto ou alterações de configuração durante o processamento não podem produzir uma prévia confirmável.

Permanecem obrigatórios o CRS projetado em metros e a confirmação explícita das unidades. A convenção de inclinação não é deduzida silenciosamente. As validações de collar, survey, intervalos e trajetórias, a restrição de importação em sala colaborativa e a reversão da camada quando a criação falha permanecem intactas. Nada é publicado ou salvo automaticamente no projeto do usuário.

Problemas corrigidos: ação desativada sem resposta depois de apenas ler as tabelas; necessidade inesperada de validar duas vezes quando ainda não tinham sido lidas; alteração do nome no blur desativando o botão antes do clique; erros apenas fora da vista no corpo rolável.

Verificação: testes do leitor e importação, regressões CSV/múltiplas tabelas/atributos/logs e teste integrado com 15 collars e 30 estações survey, usando arquivos sintéticos e navegador isolado. O teste integrado verifica os dois caminhos de entrada, validação antes da confirmação, criação única da camada, mensagens de erro e alcance dos controles em computador e tablet.

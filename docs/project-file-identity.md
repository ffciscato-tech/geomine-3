# Identidade e destino do projeto — salvamento manual

O módulo `modules/persistence/project-file-identity.js` separa o nome exibido do
direito de sobrescrever um arquivo. O destino explicitamente aberto/escolhido
é mantido somente em memória e vinculado ao projeto, geração e conta atuais.
Nenhum destino gravável é inferido pelo nome do arquivo ou por um snapshot antigo.
O módulo `project-tab-session.js` conserva uma referência de leitura por aba;
somente após o clique em Reabrir, leitura atual e carregamento bem-sucedidos o
destino volta a ser vinculado à nova geração do projeto. Ver
`project-tab-session.md`.

## Comportamento

- As entradas legadas de Abrir usam o mesmo seletor nativo do desktop. O handle
  obtido fica disponível para Salvar; a abertura por input continua disponível
  nos navegadores sem essa capacidade.
- Salvar com destino confirmado reutiliza esse destino, inclusive se uma rotina
  legada limpar apenas `S.auto.handle`. Trocar/carregar/recuperar um projeto invalida
  o vínculo, mesmo com o mesmo projectId. Salvar Como continua explícito.
- A autorização de escrita é solicitada antes da preparação dos rasters e da
  serialização, enquanto o gesto de Salvar ainda está disponível.
- Nome na barra, título do projeto e título da aba acompanham a abertura e a
  gravação confirmada. Importar um projeto também usa seu nome real de arquivo.
- Download atualiza o nome exibido se não houver destino gravável, mas não
  confirma a gravação nem a substituição do original. Uma cópia baixada via
  Salvar Como não desvincula um arquivo gravável anterior sem confirmação.
- Android/Safari e cópias recebidas por input podem não oferecer escrita no
  original. Essa limitação é informada; não há sincronização automática com Drive.
- Sem autosave, escrita ao sair ou restauração automática.

## Verificações

`smoke_project_file_identity.cjs`: aplicação completa em Chrome isolado, com
handles e projetos sintéticos: botão Salvar, Ctrl+S, destino único em salvamentos
consecutivos, pedido de permissão antecipado, cancelamento de Salvar Como,
novo destino, abertura legada, troca de geração, input, importação genérica,
nome visível, título da aba e distinção entre download e escrita confirmada.

Regressões: `validate_manual_project_saving.mjs`, `validate_manual_session.mjs`,
`validate_project_snapshot_isolation.mjs` e `smoke_project_reopen.cjs`.

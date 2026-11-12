# Contrato — salvamento clássico de projetos

Atualizado em 2026-09-21 a pedido do usuário: retirar o comportamento de
salvamento contínuo semelhante ao Google Docs e voltar ao modo clássico.

## Executar

```bash
node tools/validate_manual_project_saving.mjs
node tools/validate_project_autosave_refresh.mjs
```

O segundo comando é um ponto de entrada de compatibilidade para o mesmo
validador. O contrato antigo de autosave foi substituído, não ignorado.

Os testes executam as funções reais do núcleo e o módulo de gravação por
partes em contextos isolados. Usam handles, seletores, arquivos e IndexedDB
simulados: não acessam arquivos do usuário nem publicam no Firebase.

## Comportamento esperado

- Abrir um arquivo apenas lê o projeto e conserva seu nome e handle, quando
  disponível. Não grava rascunho, não altera o arquivo e não inicia timer.
- Editar, trocar de aba ou atualizar a página não salva automaticamente.
- Atualizar a página não restaura automaticamente uma sessão ou rascunho.
  O projeto é aberto novamente por uma ação explícita do usuário.
- **Salvar** atualiza o arquivo vinculado. Sem destino, inicia **Salvar Como**.
- **Salvar Como** permite selecionar outro arquivo. Navegadores sem seletor
  de arquivos usam download, uma vez para cada comando explícito.
- O retorno de uma gravação só é `true` quando o arquivo foi escrito e
  conferido ou quando o download foi entregue ao navegador. Cancelamento,
  permissão recusada, falha de escrita ou falha de download não são sucesso.
- **Recuperar** continua explícito. Cópias antigas não são apagadas, e uma
  cópia de segurança pode ser atualizada durante um salvamento manual.
- A interface mantém a indicação de alterações não salvas e o aviso antes
  de sair, em vez de prometer salvamento em segundo plano.
- A gravação por partes e a fila de escrita continuam ativas para evitar
  strings gigantes e escritas concorrentes no mesmo arquivo.
- A sincronização de uma sala colaborativa, iniciada pelo usuário, é uma
  função separada: não deve ser confundida com autosave do arquivo local.

## Regressões cobertas

O teste verifica abertura por handle e por input, compatibilidade de chamadas
legadas, estado manual inicial, cancelamento dos timers antigos, Save/Save As,
download, permissão negada, aborto de escrita, tamanho incorreto, erro de
serialização, recuperação da fila após falha e troca de projeto enquanto uma
gravação é preparada. O módulo de sessão tem seu próprio validador para os
eventos de edição, indicação de alterações e aviso ao sair.

```bash
node tools/validate_session_autosave_runtime.mjs
node tools/validate_project_data_layout_map_state.mjs
node tools/validate_geology_project_roundtrip.mjs
node tools/validate_raster_native_resolution.mjs
node tools/validate_collaboration_core.mjs
```

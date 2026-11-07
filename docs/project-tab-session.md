# Referência do projeto por aba

`src/modules/persistence/project-tab-session.js` conserva o destino de cada aba
sem reintroduzir autosave nem restauração de conteúdo antigo. É carregado após
o módulo de sessão manual e a identidade do arquivo, pelo manifesto modular.

## Uso

Depois de atualizar uma aba já vinculada, o aviso mostra o nome do projeto.
**Reabrir arquivo atual** solicita acesso e lê o arquivo novamente. **Escolher
arquivo** usa a referência daquela aba como ponto de partida do seletor, quando
a API do navegador permite. **Agora não** apenas fecha o aviso. O botão Abrir
normal também usa essa referência, não a pasta da última imagem exportada.

O salvamento continua manual. Alterações não salvas não são recuperadas. Não há
cache de bytes do projeto, sincronização de Drive nem gravação ao fechar a aba.
Se outra pessoa tiver atualizado o arquivo, a reabertura lê os bytes que o
provedor local entregar naquele momento; não força sincronização do provedor.

Android/input e navegadores sem handle persistente conservam o nome como dica,
mas exigem selecionar novamente o arquivo no seletor de Arquivos/Drive. Não se
promete forçar a pasta de um provedor no Android. Sem Web Locks a identidade
não é reutilizada no reload: informa nova seleção para evitar compartilhar o
destino de uma aba duplicada.

## Isolamento e segurança

- `sessionStorage` guarda só um identificador por aba. IndexedDB guarda nome,
  projectId, conta, metadados básicos e, quando permitido, o handle real.
- Navegação nova não herda a aba anterior. Em reload/back-forward, um Web Lock
  exclusivo evita que uma aba duplicada use o mesmo identificador.
- Aguarda autenticação no aplicativo publicado. Troca de conta limpa os vínculos
  em memória, sem apagar dados ou cópias legadas de outra conta.
- Reabrir requer gesto explícito, permissão, JSON de projeto válido e verificação
  de aba/conta/projeto/geração/versão de edição antes de carregar.
- Projeto alterado, edição iniciada ou conta trocada durante a leitura impede
  substituição tardia. Falha/permissão negada/arquivo vazio não usa snapshot.
- Novo Projeto limpa só a referência da aba atual. Os outros projetos abertos
  não são afetados. Limpar dados do navegador pode remover as referências.
- Salvar Como ancora-se ao arquivo da aba, validado contra a identidade/geração,
  ou à pasta padrão Documentos. Downloads genéricos não trocam esse destino.

## Validação

`validate_project_tab_session.mjs`: 17 casos de isolamento, reload, clone,
contas, permissão, corrida de leitura/edição, metadados sem conteúdo e fallback.
`smoke_project_tab_session.cjs`: aplicativo completo em navegador descartável,
duas abas e handles OPFS reais; bytes atuais, destino correto, salvamento
separado, Android, autenticação e Novo Projeto. Nenhum arquivo do usuário é
aberto, sobrescrito ou enviado nesses testes.

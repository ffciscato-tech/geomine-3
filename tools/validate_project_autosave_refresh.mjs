// Compatibilidade com rotinas de validação anteriores. Em 21/09/2026 o usuário
// solicitou remover o salvamento contínuo e retornar ao modo clássico.
// O contrato antigo de autosave/auto-restore foi deliberadamente substituído.
await import('./validate_manual_project_saving.mjs');

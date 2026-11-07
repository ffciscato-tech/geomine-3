# Conferência da gravação — 28/09/2026

A foto do usuário mostra NotReadableError, mas não permite identificar se ocorreu na abertura, escrita, fechamento ou leitura de conferência. Não foi reproduzida a falha real no provedor do usuário. A correção trata uma causa possível e melhora o diagnóstico das demais.

O novo módulo persistence/save-verification renova o File retornado por getFile ao receber NotReadableError ou NotFoundError na conferência. São no máximo três tentativas, com espera de 200 e 600 ms. Cada tentativa compara tamanho e todos os bytes, recriando o gerador do conteúdo esperado. Não regrava o destino durante a repetição. Erros de permissão, tamanho e conteúdo não são ocultados nem tratados como sucesso.

Os escritores de projeto normal e por partes identificam a etapa da falha: abrir, escrever, concluir ou conferir. Somente a confirmação integral limpa o estado de alterações pendentes. Não há mudança no salvamento manual, recuperação existente, autenticação, regras ou compartilhamento. A recuperação em memória mantém seu limite preexistente de 200 MiB; não substitui uma cópia local confirmada.

Validação:

- validate_manual_project_saving.mjs: 64 cenários, incluindo snapshot inválido, getFile temporariamente indisponível, falha persistente, permissão negada e corrupção.
- smoke_project_file_identity.cjs: aplicação completa em Chrome isolado, File inválido em duas leituras seguido de sucesso na terceira; apenas uma escrita, nenhum seletor adicional. Falha persistente conserva alterações pendentes e destino. Novo salvamento posterior funciona. Mantidos os testes de Salvar, Ctrl+S, Salvar Como, nomes e isolamento entre projetos.
- smoke_native_source_reuse.cjs: GeoTIFFs continuam sem duplicação em salvamentos repetidos, reconstrução de visualização e relocalização; bytes e referências preservados.
- Build modular concluído.

Referência: https://developer.chrome.com/docs/capabilities/web-apis/file-system-access — um File obtido por getFile pode deixar de ser legível quando o arquivo subjacente muda; é necessário obter um novo File.

Não recarregar a sessão do usuário com alterações pendentes. Orientar Salvar Como fora da pasta sincronizada e confirmar a cópia antes de atualizar o aplicativo.

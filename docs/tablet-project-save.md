# Salvamento manual do projeto no tablet

O seletor de **gravação de projetos** agora é habilitado pela presença de
`showSaveFilePicker`, independentemente do sistema operacional. A proteção
existente de importadores e seletores de pasta (`fsApiOK`) permanece intacta.

No tablet, o seletor recebe o nome `.ccmgis`, sem filtros de MIME personalizados
nem âncoras de pasta do desktop. Os destinos disponíveis, inclusive o Google
Drive, dependem do navegador e do provedor de documentos do aparelho.

O primeiro **Salvar** de um projeto aberto sem acesso de escrita permite escolher
o destino. Depois de escrever, fechar e conferir o conteúdo completo, o aplicativo
reutiliza esse mesmo arquivo nos próximos **Salvar** da sessão. **Salvar Como**
permite escolher outro destino. A conferência é do arquivo exposto pelo provedor;
não comprova que a sincronização remota do Google Drive terminou.

O seletor é aberto no clique, antes de preparar rasters ou serializar o projeto.
Cancelar não baixa uma cópia inesperada. Falhas de escrita/leitura de conferência
não são anunciadas como sucesso. O projeto aberto permanece intacto e continua
com alterações não salvas. A cópia de recuperação manual continua sendo tentada
após gerar o snapshot, dentro do limite de memória já existente.

Sem essa API, permanece o download `.ccmgis` em Downloads: ele **não substitui o
arquivo original no Drive** nem confirma gravação. Não foi introduzido
compartilhamento que renomeie o arquivo para `.bin`, autorização OAuth adicional,
sincronização automática ou mudança nos importadores.

Validação automatizada usa provedores de documentos simulados. A folha de
arquivos e a sincronização do Drive de um tablet físico precisam de conferência
no próprio aparelho.

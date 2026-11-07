# Reutilização da base GeoTIFF ao salvar — 28/09/2026

O módulo `persistence/native-source-reuse.js` separa a referência ao arquivo
nativo da revisão da prévia desenhada. Reproduzido no código anterior: alterar
a PNG da prévia, mantendo o mesmo Blob TIFF original, criava um novo TIFF.

- Uma referência válida é conferida antes de codificar/copiar o raster. Sem
  mudança, mantém o mesmo caminho e não grava novamente o TIFF nem o catálogo.
  Nomes/estilos/visibilidade atuais continuam no .ccmgis; o catálogo da base é
  atualizado quando há uma gravação de fonte, não em toda mudança do projeto.
- Invalidar a referência mantém um candidato somente em memória. Esse candidato
  não é serializado e não pode restaurar uma fonte antiga. Só pode ser reutilizado
  depois de conferir o arquivo atual e o arquivo da pasta pelo contrato existente
  de fingerprint amostrado (tamanho + início/meio/fim), nunca apenas pelo nome.
- Mudança de data pelo provedor, sem mudança dos bytes conferidos, atualiza o
  descritor sem recópia. O comportamento conservador da restauração é preservado.
- Grades editadas usam também o hash de todas as células. O fingerprint amostrado
  não pode ignorar uma edição fora das amostras. Dados novos/editados e arquivos
  ausentes ou alterados continuam exigindo outra cópia, sem sobrescrever a antiga.
- A fila por objeto impede duplicação quando a gravação da importação e o botão
  Salvar acontecem juntos. Trocar de projeto cancela as operações ainda na fila.
- Não altera a exportação explícita, a resolução original, login ou modo manual
  de salvamento. Não apaga GeoTIFFs já existentes e não desvincula o projeto deles.

Validação: `validate_native_source_reuse.cjs --baseline` reproduz a duplicação.
Sem essa opção, testa repetição, concorrência, prévia, religação, data, fonte
diferente, arquivo ausente, célula editada fora das amostras e troca de projeto.
`validate_native_source_revision.cjs` mantém os dez cenários de integridade,
incluindo falha de gravação, reabertura, originais e edição da grade completa.

No aplicativo completo, `smoke_native_source_reuse.cjs` importa TIFFs reais
sintéticos (MDT gerado pelo gravador do app e orto RGB), verifica os mesmos dois
arquivos após saves repetidos, reconstrução da PNG e religação do original;
confere também bytes originais e descritores serializados. Salvamento manual:
56 cenários aprovados. Reabertura e estados de Layout/mapa: smoke aprovado.
O harness antigo `validate_project_snapshot_isolation.mjs` para no mock ausente
`GeoMineProjectOpening`; a mesma falha foi conferida na versão anterior sem
esta alteração. Não foi modificada a lógica do aplicativo para contornar isso.

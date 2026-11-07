# Abrir e gravar projeto em navegador que recusa o arquivo escolhido

## Problema

Ao abrir um projeto no navegador integrado do app Claude, aparecia este erro:

> Erro ao abrir projeto: Failed to execute 'getFile' on 'FileSystemFileHandle': The request is not allowed by the user agent or the platform in the current context.

Esse navegador é Electron com Chrome 152 (user agent `Claude/2.x … Chrome/152`). Ele expõe `showOpenFilePicker` e `showSaveFilePicker`, então o GeoMine usava o seletor avançado. Mas o app hospedeiro não concede acesso ao arquivo escolhido: `getFile()` e `createWritable()` rejeitam com `NotAllowedError`. Nenhum teste prévio de recursos detecta isso; só se descobre na leitura. O "Salvar como" falharia do mesmo jeito, ao escrever.

## Comportamento agora

- **Regra comum** (`03-file-loading-qgis.js`): `fsMarcaRecusa(e)` registra a recusa (`NotAllowedError`/`SecurityError`) e `fsHandlesOK()` informa se o seletor avançado ainda vale nesta aba. A marca fica na memória e no `sessionStorage`, só durante a sessão da aba. Assim, uma recusa avulsa num Chrome comum não desliga o seletor para sempre.
- **Abrir projeto:**
  - Se a leitura do arquivo recém-escolhido for recusada, não aparece erro. Abre uma janela com **📂 Escolher o arquivo**, que usa o seletor simples (`<input type=file>`). O clique novo é necessário, porque o gesto anterior já foi consumido.
  - Nas aberturas seguintes da mesma aba, o GeoMine vai direto ao seletor simples.
- **Salvar como** (`alagis-130-gravacao-por-partes.js`, `saveProject` e `download()`):
  - Se a escrita no arquivo escolhido for recusada, o projeto é baixado na hora, como no Firefox/Safari, em vez de falhar.
  - Depois disso, o seletor de gravação não é mais oferecido naquela aba.
  - Só a recusa de escrever no arquivo já escolhido marca o navegador. Um `SecurityError` do próprio seletor, quando o gesto expira, não marca.

## Limite

O arquivo baixado vai para a pasta de downloads do navegador integrado. "Salvar" não sobrescreve o arquivo aberto, porque o seletor simples não dá acesso de escrita a ele. Para trabalhar sobre o arquivo do Drive, com Salvar sobrescrevendo, use o Chrome ou o Edge.

## Verificação

`tools/smoke_file_access_refused.cjs` simula seletores que devolvem um arquivo e recusam a leitura e a escrita. Os cenários:

- abrir mostra a janela, sem o erro;
- "Escolher o arquivo" carrega o projeto pelo seletor simples;
- a segunda abertura vai direto ao seletor simples;
- "Salvar Como" baixa o projeto completo sem chamar o seletor;
- numa aba nova, a recusa na escrita cai no download.

Na versão anterior, o teste falha no primeiro cenário.

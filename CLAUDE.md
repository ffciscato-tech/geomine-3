# GeoMine — instruções de trabalho

GIS web da CCM, publicado em https://geomine-3.web.app/ (projeto Firebase
`geomine-3`). Leia o `README.md` para a organização do código e os requisitos
permanentes.

- **Idioma:** responda sempre em português.
- **Fonte do código:** este repositório é a versão de referência. A pasta
  `GeoMine/atual` do Google Drive ficou desatualizada em 12/11/2026 e não deve
  ser usada para publicar.
- **Editar:** só arquivos dentro de `src/` (e `web/` para o portão de login).
  `dist/` e `public/index.html` são gerados.
- **Montar:** `python3 -I -X utf8 tools/build.py` e
  `python3 -I -X utf8 tools/preparar_hosting.py`.
- **Testar:** abra `dist/GeoMine.html` por um servidor local com Playwright
  (emulação de iPad e desktop, temas claro e escuro) antes de publicar. O login
  Google não funciona fora do site oficial; `dist/` não tem o portão de login.
- **Publicar:** o usuário autorizou em 12/11/2026 publicar direto no site
  oficial toda correção ou melhoria que ele pedir, depois de testada, avisando
  o que foi publicado. Antes de publicar, confirme que o site ainda corresponde
  ao `publishedSha256` de `CURRENT_RELEASE.json`; se não corresponder, pare e
  avise. Use `tools/publicar_firebase.py --live` e depois
  `tools/registrar_publicacao.py`. Mudanças que o usuário não pediu continuam
  exigindo confirmação.
- **Segredos:** nunca grave chaves, tokens ou senhas no repositório, em
  relatórios ou em logs, nem peça que sejam colados no chat.

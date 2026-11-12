# GeoMine

Código-fonte do GeoMine, o GIS web da CCM publicado em https://geomine-3.web.app/
(projeto Firebase `geomine-3`).

A raiz deste repositório corresponde à versão publicada em 12/11/2026 às 11h27
(horário de Brasília). Ela foi trazida da pasta `GeoMine/atual` do Google Drive
e a montagem feita a partir daqui reproduz o site byte a byte:

| Arquivo gerado | SHA-256 |
|---|---|
| `dist/GeoMine.html` | `24afcc3e67e705d38be7ea0ce037eef6857ad7cb5fa5ac7184692d1f3f81a848` |
| `public/index.html` | `bdaef92045f3c324d591dee76fa03a3187d28f13a2273eb9be28146e7f8becf1` |

Os mesmos valores estão em `CURRENT_RELEASE.json` (`distSha256` e
`publishedSha256`), junto com o histórico de publicações e validações.

## Montar

Edite somente arquivos dentro de `src/`. Os HTML de `dist/` e `public/` são
saídas geradas, não entram no git e nunca devem ser alterados à mão.

```bash
python3 -I -X utf8 tools/build.py            # gera dist/GeoMine.html (uso offline)
python3 -I -X utf8 tools/preparar_hosting.py # gera public/index.html (com login Google)
sha256sum dist/GeoMine.html public/index.html
```

## Publicar

```bash
firebase deploy --only hosting --project geomine-3
```

O workflow `.github/workflows/firebase-hosting.yml` faz a montagem e a
publicação automaticamente a cada push na branch `main`, e gera um link de
prévia em pull requests. Ele precisa do segredo
`FIREBASE_SERVICE_ACCOUNT_GEOMINE_3` cadastrado no repositório.

Antes de publicar, confirme que o site no ar ainda corresponde ao
`publishedSha256` de `CURRENT_RELEASE.json`. Se não corresponder, alguém
publicou de outro lugar e este repositório está desatualizado.

## Organização

| Caminho | Conteúdo |
|---|---|
| `src/index.template.html` | Estrutura do documento |
| `src/module-order.json` | Contrato e ordem de montagem |
| `src/core/parts/` | Núcleo legado dividido em partes ordenadas |
| `src/modules/` | Recursos por domínio (blasting, cad, environmental, mining, raster, ui...) |
| `src/styles/`, `src/assets/`, `src/vendor/`, `src/services/` | Estilos, imagens, bibliotecas embarcadas e serviços auxiliares |
| `tools/` | `build.py`, `preparar_hosting.py` e utilitários |
| `web/` | Portão de login (`gate.template.html`), configuração do Firebase e logotipos |
| `public/` | Licenças servidas junto com o site; `index.html` é gerado |
| `validation/` | Relatórios e testes das validações de cada entrega |
| `firestore.rules`, `firestore.indexes.json`, `storage.rules` | Regras da colaboração em nuvem |
| `docs/` | Notas técnicas por funcionalidade |
| `firebase/`, `cloud/` | Projetos auxiliares (functions e protótipo Next.js) |
| `reference/` | Referências históricas da migração para a árvore modular |
| `arquivo/base-2026-11-06/` | Linha anterior do código, descrita abaixo |

## Duas linhas de código

Até 06/11/2026 existiam duas árvores no Drive que evoluíram em paralelo:

- **`GeoMine/src` (base de 06/11).** Recebeu a etapa de compartimentação de
  06/11: `core/layer-store.js`, `core/project-state.js` e o ribbon dividido em
  `modules/ui/ribbon-*.js`. Não é a versão publicada. Está preservada em
  `arquivo/base-2026-11-06/`.
- **`GeoMine/development/Blasting` (publicada).** Recebeu tudo o que foi ao ar
  depois: desmonte (blasting), licenças ambientais, geoestatística, refinamento
  de TPI, área de trabalho para tablet e ortofotos por tiles. É a raiz deste
  repositório.

A compartimentação de 06/11 não foi incorporada à linha publicada. Se ela for
retomada, o trabalho é portá-la de `arquivo/base-2026-11-06/` para `src/`.

Os HTML monolíticos de referência (acima de 2 MB) e os pacotes `.zip` de
entregas antigas ficaram só no Drive.

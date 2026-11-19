"""Recria public/index.html a partir do dist e do gate de autenticação do GeoMine.

O portão tem duas partes, separadas em web/gate.template.html pela marca
<!-- GEOMINE_APP_MODULES -->: a cabeça (estilo e formulário de entrada) e o
script de sessão. Na página publicada a cabeça vem antes dos últimos módulos
do aplicativo e o script vem depois deles; o template do aplicativo marca os
dois lugares com <!-- GEOMINE_GATE:HEAD --> e <!-- GEOMINE_GATE:SCRIPT -->
(no dist, que não tem portão, as duas marcas ficam como comentários).
"""
from pathlib import Path
import json

HEAD = "<!-- GEOMINE_GATE:HEAD -->"
SCRIPT = "<!-- GEOMINE_GATE:SCRIPT -->"
SPLIT = "<!-- GEOMINE_APP_MODULES -->"

def main():
    base = Path(__file__).resolve().parents[1]
    html = (base / "dist/GeoMine.html").read_text(encoding="utf-8")
    gate = (base / "web/gate.template.html").read_text(encoding="utf-8")
    config = json.loads((base / "web/firebase-config.json").read_text(encoding="utf-8"))
    if gate.count("__FIREBASE_CONFIG__") != 1:
        raise ValueError("Marcador de configuração do Firebase ausente ou duplicado")
    gate = gate.replace("__FIREBASE_CONFIG__", json.dumps(config, ensure_ascii=False, indent=2))
    if gate.count(SPLIT) != 1 or html.count(HEAD) != 1 or html.count(SCRIPT) != 1:
        raise ValueError("Marcas do portão ausentes ou duplicadas (cabeça, script ou divisão do gate)")
    head, script = gate.split(SPLIT)
    destination = base / "public/index.html"
    destination.write_bytes(html.replace(HEAD, head).replace(SCRIPT, script).encode("utf-8"))
    print(destination)

if __name__ == "__main__":
    main()

"""Recria public/index.html a partir do dist e do gate de autenticação do GeoMine."""
from pathlib import Path
import json

def main():
    base = Path(__file__).resolve().parents[1]
    html = (base / "dist/GeoMine.html").read_text(encoding="utf-8")
    gate = (base / "web/gate.template.html").read_text(encoding="utf-8")
    config = json.loads((base / "web/firebase-config.json").read_text(encoding="utf-8"))
    if gate.count("__FIREBASE_CONFIG__") != 1:
        raise ValueError("Marcador de configuração do Firebase ausente ou duplicado")
    gate = gate.replace("__FIREBASE_CONFIG__", json.dumps(config, ensure_ascii=False, indent=2))
    end = html.rindex("</body>")
    destination = base / "public/index.html"
    destination.write_bytes((html[:end] + gate + html[end:]).encode("utf-8"))
    print(destination)

if __name__ == "__main__":
    main()


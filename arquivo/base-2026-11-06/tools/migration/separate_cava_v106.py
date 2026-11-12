#!/usr/bin/env python3
"""Separa o HTML incorporado da Cava v10.6 sem alterar o build final."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"
MANIFEST_PATH = SRC / "module-order.json"
OLD_SCRIPT = SRC / "modules/features/cava2-workspace-module.js"
NEW_SCRIPT = SRC / "modules/mining/cava2-workspace.js"
OLD_STYLE = SRC / "styles/modules/cava2-workspace-style.css"
NEW_STYLE = SRC / "styles/modules/cava2-workspace.css"
ENGINE = SRC / "modules/mining/cava2/cava-pilha-v106.html"
TOKEN = "__GEOMINE_CAVA_V106_SOURCE__"


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def write_exact(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as stream:
        stream.write(value)


def main() -> None:
    if OLD_SCRIPT.exists():
        source = OLD_SCRIPT.read_text(encoding="utf-8")
        prefix = "const CAVA2_V106_SOURCE="
        start = source.index(prefix) + len(prefix)
        end = source.index(";\nconst STORAGE_KEY=", start)
        engine = json.loads(source[start:end])
        separated = source[:start] + TOKEN + source[end:]
        write_exact(ENGINE, engine)
        write_exact(NEW_SCRIPT, separated)
        OLD_SCRIPT.unlink()
    else:
        engine = ENGINE.read_text(encoding="utf-8")

    if OLD_STYLE.exists():
        NEW_STYLE.parent.mkdir(parents=True, exist_ok=True)
        OLD_STYLE.replace(NEW_STYLE)

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    manifest.update(
        {
            "description": (
                "Ordem de montagem do GeoMine. A ordem dos módulos é parte do contrato de compatibilidade."
            ),
            "source_reference": "reference/GeoMine_001_BASE.html",
            "source_sha256": "6341acd1835250188d47e3ae72cadd248b1a2154da2f33ad8fd71f4158e13377",
            "output": "dist/GeoMine.html",
        }
    )
    for asset in manifest["assets"]:
        path = asset.get("path")
        if path == "styles/modules/cava2-workspace-style.css":
            asset["path"] = "styles/modules/cava2-workspace.css"
        elif path == "modules/features/cava2-workspace-module.js":
            asset["path"] = "modules/mining/cava2-workspace.js"
            asset["embed_files"] = {
                TOKEN: "modules/mining/cava2/cava-pilha-v106.html"
            }
    write_exact(MANIFEST_PATH, json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

    old_reference = ROOT / "reference/CCMGIS_157_MARCA.original.html"
    new_reference = ROOT / "reference/GeoMine_001_BASE.html"
    if old_reference.exists():
        old_reference.replace(new_reference)

    print(f"Motor separado: {ENGINE.relative_to(ROOT)}")
    print(f"SHA-256 do motor adaptado: {sha256_text(engine)}")


if __name__ == "__main__":
    main()

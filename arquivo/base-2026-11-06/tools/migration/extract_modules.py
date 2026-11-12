#!/usr/bin/env python3
"""Extrai os blocos executáveis do HTML monolítico sem alterar seu conteúdo.

O resultado é uma árvore de fontes modular, um template com marcadores e um
manifesto que preserva a ordem exata dos blocos. Esta ferramenta é destinada à
migração inicial; depois da extração, o trabalho cotidiano acontece em ``src``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import unicodedata
from pathlib import Path


OPEN_BLOCK = re.compile(r"<(script|style)\b[^>]*>", re.IGNORECASE)

SCRIPT_PATHS = {
    1: "vendor/leaflet.min.js",
    2: "vendor/proj4.min.js",
    3: "vendor/jszip.min.js",
    4: "vendor/three.min.js",
    5: "vendor/orbit-controls.js",
    6: "vendor/geotiff.min.js",
    7: "vendor/polygon-clipping.min.js",
    8: "modules/ui/alagis-126-fallback.js",
    9: "vendor/three-r128-embedded.min.js",
    10: "vendor/laz-perf-embedded.js",
    11: "core/legacy-main.js",
    12: "modules/data-sources/wms-ogc.js",
    13: "modules/mining/slope-projections.js",
    26: "modules/raster/raster-panel-tabs.js",
}

STYLE_PATHS = {
    1: "vendor/leaflet.min.css",
    2: "styles/app.css",
    3: "styles/modules/command-bar.css",
    4: "styles/modules/wms-catalog.css",
}


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def write_exact(path: Path, value: str) -> None:
    with path.open("w", encoding="utf-8", newline="") as stream:
        stream.write(value)


def slug(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")


def script_category(name: str) -> str:
    padded_name = f"-{name}-"
    categories = (
        ("data-sources", ("osm", "sgb", "mde", "car", "sicar", "icmbio", "ana", "estaduais", "federais", "funai", "sigef", "servidores", "orgaos")),
        ("environmental", ("ambiental", "favorabilidade", "multicriterio", "espeleologia", "canie", "cecav")),
        ("mining", ("cava", "talude", "rampa", "bancada", "cruzamento", "iteracao", "saidas")),
        ("analysis", ("recorte", "filtro", "identificar", "limpar-extremos")),
        ("symbology", ("simbolo", "litologia", "lithology", "qml", "legenda", "icone")),
        ("layout", ("layout", "escala")),
        ("persistence", ("gravacao", "projeto")),
        ("visualization", ("vis-real", "visual")),
        ("raster", ("raster", "ortofoto")),
    )
    for category, terms in categories:
        if any(f"-{term}-" in padded_name for term in terms):
            return category
    return "features"


def unique_path(relative: str, used: set[str]) -> str:
    candidate = Path(relative)
    suffix = candidate.suffix
    stem = candidate.stem
    parent = candidate.parent
    number = 2
    while candidate.as_posix() in used:
        candidate = parent / f"{stem}-{number}{suffix}"
        number += 1
    result = candidate.as_posix()
    used.add(result)
    return result


def asset_path(kind: str, index: int, open_tag: str, used: set[str]) -> str:
    id_match = re.search(r"\bid\s*=\s*(['\"])(.*?)\1", open_tag, re.IGNORECASE)
    element_id = id_match.group(2) if id_match else ""

    if kind == "script":
        fixed = SCRIPT_PATHS.get(index)
        if fixed:
            return unique_path(fixed, used)
        name = slug(element_id) if element_id else f"script-{index:02d}"
        category = script_category(name)
        return unique_path(f"modules/{category}/{name}.js", used)

    fixed = STYLE_PATHS.get(index)
    if fixed:
        return unique_path(fixed, used)
    name = slug(element_id) if element_id else f"inline-style-{index:02d}"
    return unique_path(f"styles/modules/{name}.css", used)


def extract(source: Path, project_root: Path, force: bool) -> None:
    source_text = source.read_text(encoding="utf-8")
    src_root = project_root / "src"
    template_path = src_root / "index.template.html"
    manifest_path = src_root / "module-order.json"

    if (template_path.exists() or manifest_path.exists()) and not force:
        raise SystemExit("A árvore modular já existe. Use --force somente para refazer a extração inicial.")

    counters = {"script": 0, "style": 0}
    used_paths: set[str] = set()
    manifest_assets: list[dict[str, object]] = []
    template_parts: list[str] = []
    position = 0
    order = 0

    while True:
        match = OPEN_BLOCK.search(source_text, position)
        if not match:
            template_parts.append(source_text[position:])
            break

        kind = match.group(1).lower()
        close_match = re.search(rf"</{kind}\s*>", source_text[match.end():], re.IGNORECASE)
        if not close_match:
            raise SystemExit(f"Bloco <{kind}> sem fechamento, próximo ao caractere {match.start()}.")

        close_start = match.end() + close_match.start()
        close_end = match.end() + close_match.end()
        open_tag = match.group(0)
        close_tag = source_text[close_start:close_end]
        body = source_text[match.end():close_start]

        counters[kind] += 1
        order += 1
        relative = asset_path(kind, counters[kind], open_tag, used_paths)
        asset_file = src_root / relative
        asset_file.parent.mkdir(parents=True, exist_ok=True)
        write_exact(asset_file, body)

        slot = f"asset-{order:03d}"
        marker = f"<!-- CCMGIS_MODULE:{slot} -->"
        template_parts.append(source_text[position:match.start()])
        template_parts.append(marker)

        manifest_assets.append(
            {
                "order": order,
                "slot": slot,
                "kind": kind,
                "path": relative,
                "open_tag": open_tag,
                "close_tag": close_tag,
                "sha256": sha256_text(body),
                "lines": body.count("\n") + 1,
            }
        )
        position = close_end

    template = "".join(template_parts)
    src_root.mkdir(parents=True, exist_ok=True)
    write_exact(template_path, template)

    manifest = {
        "format": 1,
        "description": "Ordem de montagem dos módulos do CCMGIS. A ordem é parte do contrato de compatibilidade.",
        "source_reference": "reference/CCMGIS_157_MARCA.original.html",
        "source_sha256": sha256_text(source_text),
        "template": "src/index.template.html",
        "output": "dist/CCMGIS_157_MARCA.html",
        "assets": manifest_assets,
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    reference = project_root / "reference" / "CCMGIS_157_MARCA.original.html"
    if source.resolve() != reference.resolve():
        reference.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, reference)

    print(f"Extraídos {counters['script']} scripts e {counters['style']} estilos.")
    print(f"Template: {template_path}")
    print(f"Manifesto: {manifest_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="HTML monolítico original")
    parser.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--force", action="store_true", help="refaz a extração inicial")
    args = parser.parse_args()
    extract(args.source.resolve(), args.project_root.resolve(), args.force)


if __name__ == "__main__":
    main()

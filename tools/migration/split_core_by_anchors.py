#!/usr/bin/env python3
"""Divide o núcleo GeoMine por fronteiras semânticas, preservando cada byte.

Esta ferramenta existe apenas para documentar a ressincronização inicial. O
trabalho normal deve acontecer diretamente nos arquivos de ``src/core/parts``.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path


PARTS = (
    ("01-bootstrap-crs-state-command.js", None),
    ("02-shapefile-dbf.js", "/* ============================================================================\n   LEITOR DE SHAPEFILE"),
    ("03-file-loading-qgis.js", "/* ============================================================================\n   IMPORTAÇÃO DE ARQUIVOS"),
    ("04-vector-format-importers.js", "/* ============================================================================\n   IMPORTAÇÃO UNIVERSAL"),
    ("05-layer-model-symbology.js", "/* ---------- Modelo de camada ---------- */"),
    ("06-map-tools-snap.js", "/* ============================================================================\n   MAPA"),
    ("07-feature-info-favorability.js", "/* ============================================================================\n   FAVORABILIDADE AMBIENTAL — seleção"),
    ("08-selection-and-drawing.js", "/* ---------- SELEÇÃO MÚLTIPLA por polígono/retângulo ----------"),
    ("09-measurement-properties-cad.js", "/* ---------- Medição (no CRS de trabalho, m / m²) ---------- */"),
    ("10-ribbon-ui-preferences.js", "/* ================== MODO AUTOCAD =================="),
    ("11-geotiff-project-workspace.js", "/* ===========================================================================\n   ESCRITA DE GeoTIFF"),
    ("12-feature-selection-vertices.js", "/* ---------- Seleção & edição de vértices ---------- */"),
    ("13-attribute-table.js", "/* ============================================================================\n   TABELA DE ATRIBUTOS"),
    ("14-field-calculator.js", "/* ============================================================================\n   FAVORABILIDADE AMBIENTAL — MEIO AMBIENTE"),
    ("15-layer-tree-crs-ui.js", "/* ============================================================================\n   UI: listas, estilos, CRS"),
    ("16-vector-export.js", "/* ============================================================================\n   EXPORTAÇÃO"),
    ("17-layout-printing.js", "/* ============================================================================\n   LAYOUT (SVG)"),
    ("18-lidar-layout-extensions.js", "/* ============================================================================\n   PRANCHAS (modo A4)"),
    ("19-hydrology-and-flooding.js", "/* ============================================================================\n   MÓDULO HIDRO"),
    ("20-raster-dem.js", "/* ============================================================================\n   RASTERS NO MAPA"),
    ("21-profiles-and-3d.js", "/* ============================================================================\n   MÓDULO 3D"),
    ("22-mine-pit-design.js", "/* ==================== CAVA — bancos"),
    ("23-block-model-and-volumes.js", "/* ================= IMPORTAÇÃO DE MODELO DE BLOCOS SURPAC"),
    ("24-slope-stability.js", "/* ============================================================================\n   ESTABILIDADE DE TALUDE"),
    ("25-geoprocessing-tin.js", "/* ============================================================================\n   MÓDULO GEOPROCESSAMENTO"),
    ("26-project-persistence.js", "/* ============================================================================\n   PROJETO — salvar/carregar"),
    ("27-vector-editor.js", "/* ============================================================================\n   EDITOR DE VETORES"),
    ("28-drainage-and-basin.js", "/* ============================================================================\n   ÍCONES do módulo HIDRO"),
)


def write_exact(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as stream:
        stream.write(value)


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    source = root / "src" / "core" / "legacy-main.js"
    manifest_path = root / "src" / "module-order.json"
    archive = root / "reference" / "legacy-main.unsplit.js"
    text = source.read_text(encoding="utf-8")

    starts = [0]
    for name, anchor in PARTS[1:]:
        count = text.count(anchor)
        if count != 1:
            raise SystemExit(f"Fronteira {name} encontrada {count} vez(es).")
        starts.append(text.index(anchor))
    if starts != sorted(starts) or len(set(starts)) != len(starts):
        raise SystemExit("As fronteiras do núcleo não estão na ordem esperada.")

    paths = []
    rebuilt = []
    for index, (name, _) in enumerate(PARTS):
        end = starts[index + 1] if index + 1 < len(starts) else len(text)
        body = text[starts[index]:end]
        relative = f"core/parts/{name}"
        write_exact(root / "src" / relative, body)
        paths.append(relative)
        rebuilt.append(body)
    if "".join(rebuilt) != text:
        raise SystemExit("As partes não recompõem exatamente o núcleo.")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    asset = next((item for item in manifest["assets"] if item.get("path") == "core/legacy-main.js"), None)
    if not asset:
        raise SystemExit("O núcleo não foi encontrado no manifesto.")
    asset["parts"] = paths
    asset.pop("path", None)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    archive.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(source, archive)
    print(f"Núcleo dividido em {len(paths)} partes e recomposto sem alteração.")


if __name__ == "__main__":
    main()

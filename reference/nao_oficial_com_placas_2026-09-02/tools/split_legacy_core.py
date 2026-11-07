#!/usr/bin/env python3
"""Divide o núcleo legado em fragmentos concatenáveis sem mudar um byte."""

from __future__ import annotations

import json
import shutil
from pathlib import Path


PARTS = (
    (1, "01-bootstrap-crs-state-command.js"),
    (426, "02-shapefile-dbf.js"),
    (611, "03-file-loading-qgis.js"),
    (1622, "04-vector-format-importers.js"),
    (2065, "05-layer-model-symbology.js"),
    (3450, "06-map-tools-snap.js"),
    (4129, "07-feature-info-favorability.js"),
    (4852, "08-selection-and-drawing.js"),
    (5320, "09-measurement-properties-cad.js"),
    (7306, "10-ribbon-ui-preferences.js"),
    (10709, "11-geotiff-project-workspace.js"),
    (11159, "12-feature-selection-vertices.js"),
    (11808, "13-attribute-table.js"),
    (12124, "14-field-calculator.js"),
    (12733, "15-layer-tree-crs-ui.js"),
    (13336, "16-vector-export.js"),
    (14033, "17-layout-printing.js"),
    (17128, "18-lidar-layout-extensions.js"),
    (20131, "19-hydrology-and-flooding.js"),
    (23631, "20-raster-dem.js"),
    (25555, "21-profiles-and-3d.js"),
    (27691, "22-mine-pit-design.js"),
    (37842, "23-block-model-and-volumes.js"),
    (39980, "24-slope-stability.js"),
    (40453, "25-geoprocessing-tin.js"),
    (45953, "26-project-persistence.js"),
    (46958, "27-vector-editor.js"),
    (48993, "28-drainage-and-basin.js"),
)


def write_exact(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as stream:
        stream.write(value)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    source = root / "src" / "core" / "legacy-main.js"
    archive = root / "reference" / "legacy-main.unsplit.js"
    manifest_path = root / "src" / "module-order.json"

    if not source.exists():
        raise SystemExit("O núcleo já foi dividido ou src/core/legacy-main.js está ausente.")

    original = source.read_text(encoding="utf-8")
    lines = original.splitlines(keepends=True)
    if PARTS[-1][0] > len(lines):
        raise SystemExit("Os limites configurados não correspondem à versão deste núcleo.")

    part_paths: list[str] = []
    rebuilt: list[str] = []
    for index, (start, name) in enumerate(PARTS):
        end = PARTS[index + 1][0] - 1 if index + 1 < len(PARTS) else len(lines)
        content = "".join(lines[start - 1:end])
        relative = f"core/parts/{name}"
        write_exact(root / "src" / relative, content)
        part_paths.append(relative)
        rebuilt.append(content)

    if "".join(rebuilt) != original:
        raise SystemExit("A divisão não recompõe o núcleo original.")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    target = next((a for a in manifest["assets"] if a.get("path") == "core/legacy-main.js"), None)
    if not target:
        raise SystemExit("O núcleo não foi encontrado no manifesto.")
    target["parts"] = part_paths
    target.pop("path")
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    archive.parent.mkdir(parents=True, exist_ok=True)
    if not archive.exists():
        shutil.move(source, archive)
    else:
        source.unlink()

    print(f"Núcleo dividido em {len(part_paths)} fragmentos.")
    print(f"Cópia não dividida preservada em: {archive}")


if __name__ == "__main__":
    main()

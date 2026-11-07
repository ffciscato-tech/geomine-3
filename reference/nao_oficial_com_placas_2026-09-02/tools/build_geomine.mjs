#!/usr/bin/env node
/** Montagem canônica do GeoMine: fonte modular + overlay de transição. */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "src/module-order.json"), "utf8"));
const modularOutput = path.join(ROOT, manifest.output);
const engine = path.join(ROOT, "src/modules/mining/cava2/cava-pilha-v106.html");
const assembler = path.join(ROOT, "src/build-overlays/geomine/assemble-geomine.mjs");
const validator = path.join(ROOT, "tools/validate_geomine.mjs");
const output = path.join(ROOT, "dist/GeoMine.html");
const temporary = path.join(ROOT, `dist/.GeoMine.${process.pid}.tmp.html`);
const golden = path.join(ROOT, "reference/GeoMine_001_GOLDEN.html");

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit" });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} terminou com código ${result.status}`);
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

try {
  run(process.env.PYTHON || "python3", [path.join(ROOT, "tools/build.py"), "--project-root", ROOT],
    "Montagem modular");
  run(process.execPath, [assembler, modularOutput, engine, temporary], "Integração GeoMine");
  run(process.execPath, [validator, modularOutput, temporary], "Validação GeoMine");

  if (process.argv.includes("--verify-golden")) {
    const actual = sha256(temporary), expected = sha256(golden);
    if (actual !== expected) throw new Error(`A montagem divergiu do golden: ${actual} != ${expected}`);
    console.log("Verificação golden: resultado idêntico à base aprovada.");
  }

  fs.renameSync(temporary, output);
  console.log(JSON.stringify({ output, bytes: fs.statSync(output).size, sha256: sha256(output) }, null, 2));
} catch (error) {
  try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch {}
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const core=fs.readFileSync(path.join(__dirname,
  '../src/core/parts/09-measurement-properties-cad.js'),'utf8');

assert.match(core,/function undoNextOrder\(\)/,
  'o núcleo deve possuir um relógio compartilhado para as ações');
assert.match(core,/a\._undoOrd=undoNextOrder\(\)/,
  'toda ação da pilha geral deve receber ordem cronológica');
assert.match(core,/a\._ts=Date\.now\(\)/,
  'a ação também deve conservar data para compatibilidade e diagnóstico');

console.log('OK: ações gerais recebem relógio cronológico compartilhado.');

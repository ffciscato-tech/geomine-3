#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),file=path.join(root,'src/core/parts/04-vector-format-importers.js'),
  full=fs.readFileSync(file,'utf8'),parser=full.split('const DXF_MAX_FACES')[0];
const ctx={console,Math,Number,Array,Object,parseInt,parseFloat,isFinite};
vm.createContext(ctx); vm.runInContext(parser,ctx,{filename:path.basename(file)});

/* Um contorno linear Surpac e uma face triangulada devem seguir fluxos
   independentes. A face nunca pode voltar a ser anunciada como polilinha. */
const dxf=`0\nSECTION\n2\nENTITIES\n0\nPOLYLINE\n8\nPE\n70\n0\n0\nVERTEX\n8\nPE\n10\n300000\n20\n7700000\n30\n820\n70\n0\n0\nVERTEX\n8\nPE\n10\n300010\n20\n7700010\n30\n820\n70\n0\n0\nSEQEND\n0\n3DFACE\n8\nTIN\n10\n300000\n20\n7700000\n30\n820\n11\n300010\n21\n7700000\n31\n821\n12\n300000\n22\n7700010\n32\n822\n13\n300000\n23\n7700010\n33\n822\n0\nENDSEC\n0\nEOF\n`;
const r=ctx.parseDXF(dxf);
assert.strictEqual(r.lins.length,1);
assert.strictEqual(r.pols.length,0,'3DFACE não pode ser polilinha fechada');
assert.strictEqual(r.faces.length,1,'face 3D deve ficar em coleção própria');
assert.strictEqual(r.faces[0].kind,'3dface');
assert(full.includes('data-faces'),'modal precisa da opção explícita de malha 3D');
assert(full.includes("'malha 3D (faces)'"),'faces devem entrar em camada separada');
assert(full.includes('r.faces.length && !importarFaces'),'faces ignoradas precisam ser informadas');
console.log('OK: DXF Surpac separa polilinhas úteis da malha 3D opcional.');

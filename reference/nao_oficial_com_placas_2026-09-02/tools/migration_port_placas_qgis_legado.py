"""Aplica a leitura de placas/hachuras do QGIS sobre o build monolítico mais novo."""
from pathlib import Path
import sys
M=Path('/Users/filipeciscato/Documents/CCMGIS-modular/src/core/parts')
p05=M.joinpath('05-layer-model-symbology.js').read_text(encoding='utf-8')
p03=M.joinpath('03-file-loading-qgis.js').read_text(encoding='utf-8')

def entre(s,a,b,inclui_b=False):
    i=s.index(a); j=s.index(b,i); return s[i:j+(len(b) if inclui_b else 0)]

# blocos novos, extraídos da árvore modular para as duas linhas ficarem idênticas
bloco_img   = entre(p05, '/* ---------- SÍMBOLO DE PONTO POR IMAGEM ----------', 'function ptCfg(L){')
helpers_qgs = entre(p03, '/* ============================================================================\n   LEITURA DE UM SÍMBOLO DO QGIS', 'function applyQGSProject(xmlText){')
extracao    = entre(p03, "    const rend=ml.querySelector('renderer-v2');", '    /* RÓTULOS: campo, corpo, cor e halo do "simple" labeling */')
aplicacao   = entre(p03, "    if(L.sym){\n      const S1=inf.sim||{};", "    if(inf.rotulo && inf.rotulo.campo")

alvo=Path(sys.argv[1]); saida=Path(sys.argv[2])
s=alvo.read_text(encoding='utf-8')
def troca(s,a,b):
    if s.count(a)!=1: raise SystemExit('âncora ausente ou repetida: '+a[:60])
    return s.replace(a,b,1)

# 1) símbolo de ponto por imagem
s=troca(s,'};\nfunction ptCfg(L){', '};\n'+bloco_img+'function ptCfg(L){')
# 2) leitor completo do símbolo do QGIS
s=troca(s,'function applyQGSProject(xmlText){', helpers_qgs+'function applyQGSProject(xmlText){')
# 3) extração e aplicação do estilo
s=troca(s, entre(s,"    const rend=ml.querySelector('renderer-v2');",'    /* RÓTULOS: campo, corpo, cor e halo do "simple" labeling */'), extracao)
s=troca(s,"    if(id) info[id]={name:nm, file, color, stroke, weight, opac, dash, classes, rotulo};",
          "    if(id) info[id]={name:nm, file, color, stroke, weight, opac, dash, classes, rotulo, sim};")
s=troca(s, entre(s,"    if(L.sym){\n      if(inf.color && L.sym.mode==='single') L.sym.color=inf.color;","    if(inf.rotulo && inf.rotulo.campo"), aplicacao)
# 4) persistência das placas
s=troca(s,"    groups:S.groups.map(g=>({id:g.id,name:g.name,collapsed:!!g.collapsed})),",
  "    /* Placas e demais símbolos de ponto por imagem viajam com o projeto: sem\n"
  "       isto, o .ccmgis reabriria a sinalização como círculos. */\n"
  "    ptImgs:(typeof ptImgSnapshot==='function')?ptImgSnapshot():null,\n"
  "    groups:S.groups.map(g=>({id:g.id,name:g.name,collapsed:!!g.collapsed})),")
s=troca(s,"  S.groups=(d.groups||[]).map(g=>({id:g.id,name:g.name,collapsed:!!g.collapsed}));",
  "  /* Os símbolos por imagem precisam existir ANTES de qualquer camada ser\n"
  "     desenhada — é PT_SYMS que o desenho consulta. */\n"
  "  try{ if(typeof ptImgRestore==='function') ptImgRestore(d.ptImgs); }catch(e){}\n"
  "  S.groups=(d.groups||[]).map(g=>({id:g.id,name:g.name,collapsed:!!g.collapsed}));")
saida.write_text(s,encoding='utf-8')
print('gerado', saida, f'{saida.stat().st_size/1048576:.2f} MB')

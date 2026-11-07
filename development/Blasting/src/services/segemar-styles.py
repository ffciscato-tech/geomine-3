"""Preserva cores, classes e legenda do SLD oficial de cada camada SEGEMAR."""
import concurrent.futures, json, urllib.request, urllib.parse, xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/data/segemar/styles.json'
layers=json.loads((ROOT/'public/data/segemar/manifest.json').read_text())['layers']
def local(n): return n.tag.split('}')[-1]
def expression(n):
    k=local(n)
    if k in ('PropertyName','ValueReference'): return {'property':n.text or ''}
    if k=='Literal': return {'literal':n.text or ''}
    if k=='Function': return {'function':n.get('name'),'args':[expression(c) for c in n]}
    if k in ('Filter','And','Or','Not','PropertyIsEqualTo','PropertyIsNotEqualTo','PropertyIsGreaterThan','PropertyIsGreaterThanOrEqualTo','PropertyIsLessThan','PropertyIsLessThanOrEqualTo','PropertyIsNull','PropertyIsBetween','LowerBoundary','UpperBoundary','PropertyIsLike'):
        return {'op':k,'args':[expression(c) for c in n],**dict(n.attrib)}
    return {'unsupported':k}
def css(n,name,default=None):
    if n is None:return default
    return next((p.text for p in n.iter() if local(p) in ('CssParameter','SvgParameter') and p.get('name')==name),default)
def build(layer):
    params=urllib.parse.urlencode({'service':'WMS','version':'1.1.1','request':'GetStyles','layers':layer['name']})
    source='https://sigam.segemar.gov.ar/geoserver217/wms?'+params
    with urllib.request.urlopen(source,timeout=60) as response: doc=ET.fromstring(response.read())
    rules=[]
    for i,r in enumerate(doc.findall('.//{*}Rule')):
        symbol=next((n for n in r.iter() if local(n) in ('PolygonSymbolizer','LineSymbolizer','PointSymbolizer')),None)
        if symbol is None:continue
        fill=symbol.find('.//{*}Fill');stroke=symbol.find('.//{*}Stroke')
        kind=local(symbol);color=css(fill,'fill',css(stroke,'stroke','#808080'))
        condition=r.find('{*}Filter');label=r.findtext('{*}Title') or r.findtext('{*}Name') or ('Classe '+str(i+1))
        rules.append({'id':str(i),'label':label,'filter':expression(condition) if condition is not None else None,'else':r.find('{*}ElseFilter') is not None,
          'style':{'color':color,'stroke':css(stroke,'stroke',color),'weight':float(css(stroke,'stroke-width','1')),'fill':float(css(fill,'fill-opacity','1')) if kind=='PolygonSymbolizer' else 1,'dash':css(stroke,'stroke-dasharray','')},
          'specialSymbols':any(local(n) in ('GraphicFill','GraphicStroke','ExternalGraphic') for n in symbol.iter())})
    if not rules:raise ValueError('SLD sem regras')
    return layer['name'],{'provider':'SEGEMAR / SIGAM','country':'AR','source':source,'rules':rules}
if __name__=='__main__':
    result={};errors={}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        jobs={pool.submit(build,l):l for l in layers}
        for job in concurrent.futures.as_completed(jobs):
            layer=jobs[job]
            try:k,v=job.result();result[k]=v
            except Exception as e:errors[layer['name']]=str(e)
    OUT.write_text(json.dumps({'styles':result,'errors':errors},ensure_ascii=False,separators=(',',':')))
    print(json.dumps({'styles':len(result),'errors':errors,'bytes':OUT.stat().st_size},ensure_ascii=False))

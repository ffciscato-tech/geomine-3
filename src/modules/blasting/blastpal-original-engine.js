/* BlastPal 1.33: original geometric engine, preserved verbatim.
 * Origin, SHA256 and conventions: blastpal-original-engine.provenance.json.
 * Adapter validations belong in drilling-geometry.js, never in this block. */
(function (root) {
  'use strict';
/* FOGO-START */ /* plano de fogo — funções puras (testáveis isoladas) */
  function _fogoPip(x, y, ring) {
    /* ponto-em-polígono (ray casting) */
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function _fogoDistRing(x, y, ring) {
    /* menor distância do ponto às arestas do anel */
    var bd = Infinity;
    for (var i = 0; i < ring.length; i++) {
      var a = ring[i], b = ring[(i + 1) % ring.length];
      var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
      var t = L2 ? ((x - a[0]) * dx + (y - a[1]) * dy) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      var px = a[0] + dx * t, py = a[1] + dy * t;
      var d = Math.hypot(x - px, y - py);
      if (d < bd) bd = d;
    }
    return bd;
  }
  function fogoBestAz(ring) {
    /* aresta mais longa do polígono = face livre. Devolve { az: azimute da aresta
       (linhas de furos paralelas a ela), leanAz: azimute da normal APONTANDO PARA
       FORA do polígono nessa aresta (lado do mergulho dos furos), edgeLen }. */
    var n = ring.length, bi = 0, bl = -1;
    for (var i = 0; i < n; i++) {
      var p = ring[i], q = ring[(i + 1) % n];
      var L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (L > bl) { bl = L; bi = i; }
    }
    var a = ring[bi], b = ring[(bi + 1) % n];
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var az = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    var cx = 0, cy = 0;
    ring.forEach(function (p) { cx += p[0]; cy += p[1]; }); cx /= n; cy /= n;
    var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    var nx = dy, ny = -dx, nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    var dPos = (mx + nx - cx) * (mx + nx - cx) + (my + ny - cy) * (my + ny - cy);
    var dNeg = (mx - nx - cx) * (mx - nx - cx) + (my - ny - cy) * (my - ny - cy);
    if (dPos < dNeg) { nx = -nx; ny = -ny; }
    var leanAz = (Math.atan2(nx, ny) * 180 / Math.PI + 360) % 360;
    return { az: az, leanAz: leanAz, edgeLen: bl };
  }
  function fogoGrid(ring, burden, spacing, azDeg, staggered, inset) {
    /* malha de furos dentro do polígono: LINHAS no azimute az (furos a cada
       "espaçamento" ao longo da linha; linhas a cada "afastamento"). Malha
       estagiada desloca as linhas ímpares em ½ espaçamento (pé de galinha).
       inset = recuo mínimo da borda (m). Devolve [[x, y, linha], …]. */
    var A = azDeg * Math.PI / 180;
    var ux = Math.sin(A), uy = Math.cos(A);       /* direção da linha */
    var vx = Math.cos(A), vy = -Math.sin(A);      /* perpendicular (avanço entre linhas) */
    var umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
    ring.forEach(function (p) {
      var u = p[0] * ux + p[1] * uy, v = p[0] * vx + p[1] * vy;
      if (u < umin) umin = u; if (u > umax) umax = u;
      if (v < vmin) vmin = v; if (v > vmax) vmax = v;
    });
    var pts = [], row = 0;
    for (var v = vmin + burden / 2; v <= vmax + 1e-9; v += burden, row++) {
      var u0 = umin + spacing / 2 + ((staggered && row % 2 === 1) ? spacing / 2 : 0);
      for (var u = u0; u <= umax + 1e-9; u += spacing) {
        var x = u * ux + v * vx, y = u * uy + v * vy;
        if (!_fogoPip(x, y, ring)) continue;
        if (inset > 0 && _fogoDistRing(x, y, ring) < inset) continue;
        pts.push([x, y, row]);
      }
    }
    return pts;
  }
  function fogoBuild(ring, prm, topoZAt, baseZAt) {
    /* prm = { burden, spacing, azDeg, staggered, inset, sub, angDeg, leanAz, prefix }.
       topoZAt(x,y) → cota do colar; baseZAt(x,y) → cota do pé do banco (null = fora,
       o furo é pulado). Furo inclinado: profundidade vertical H = topo − (base − sub);
       comprimento = H / cos(ângulo); pé do furo deslocado H·tan(ângulo) no azimute
       do mergulho (leanAz). Devolve { holes:[{id,cx,cy,cz,tx,ty,tz,len,az,dip,row}],
       n, meters, skipped }. */
    var g = fogoGrid(ring, prm.burden, prm.spacing, prm.azDeg, prm.staggered !== false, prm.inset || 0);
    var a = (prm.angDeg || 0) * Math.PI / 180, tanA = Math.tan(a), cosA = Math.cos(a);
    var LA = (prm.leanAz || 0) * Math.PI / 180, lx = Math.sin(LA), ly = Math.cos(LA);
    var holes = [], meters = 0, skipped = 0, seq = 1;
    for (var i = 0; i < g.length; i++) {
      var x = g[i][0], y = g[i][1];
      var zt = topoZAt(x, y), zb = baseZAt(x, y);
      if (zt == null || zb == null || !isFinite(zt) || !isFinite(zb)) { skipped++; continue; }
      var H = zt - (zb - (prm.sub || 0));
      if (!(H > 0)) { skipped++; continue; }
      var len = H / cosA;
      var id = (prm.prefix || 'F') + String(seq++).padStart(3, '0');
      holes.push({
        id: id, cx: x, cy: y, cz: zt,
        tx: x + H * tanA * lx, ty: y + H * tanA * ly, tz: zb - (prm.sub || 0),
        len: len, az: (prm.angDeg > 0 ? (prm.leanAz || 0) : 0), dip: 90 - (prm.angDeg || 0), row: g[i][2]
      });
      meters += len;
    }
    return { holes: holes, n: holes.length, meters: meters, skipped: skipped };
  }
  function fogoCollarCSV(holes) {
    var out = ['hole_id;x;y;z;max_depth'];
    holes.forEach(function (h) { out.push(h.id + ';' + h.cx.toFixed(3) + ';' + h.cy.toFixed(3) + ';' + h.cz.toFixed(3) + ';' + h.len.toFixed(2)); });
    return out.join('\n');
  }
  function fogoSurveyCSV(holes) {
    var out = ['hole_id;depth;azimuth;dip'];
    holes.forEach(function (h) { out.push(h.id + ';0;' + h.az.toFixed(1) + ';' + h.dip.toFixed(1)); });
    return out.join('\n');
  }
  /* FOGO-END */
  root.BlastPalOriginalEngine = Object.freeze({
    grid: fogoGrid, build: fogoBuild, bestAz: fogoBestAz,
    collarCSV: fogoCollarCSV, surveyCSV: fogoSurveyCSV
  });
})(typeof window !== 'undefined' ? window : globalThis);

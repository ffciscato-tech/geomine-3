/* GeoMine Blasting: input contract around the unmodified BlastPal 1.33 engine.
 * A -> B is the horizontal direction of the holes; rows remain perpendicular.
 * depthMD means collar-to-toe length along the straight borehole, in metres.
 * Raster sampling, CRS validation, persistence and drawing belong to GeoMine. */
(function (root) {
  'use strict';
  const MAX_CANDIDATES = 250000;
  const RAD = Math.PI / 180;
  const normAz = a => (a % 360 + 360) % 360;
  const pointKey = (x, y) => String(x) + ',' + String(y);

  function fail(message) { throw new Error(message); }
  function finite(v) { return typeof v === 'number' && Number.isFinite(v); }
  function xy(p, label) {
    if (!Array.isArray(p) || !finite(p[0]) || !finite(p[1])) fail(label + ': informe coordenadas XY válidas.');
    return [p[0], p[1]];
  }
  function positive(v, label) {
    if (!finite(v) || !(v > 0)) fail(label + ': informe um valor maior que zero.');
    return v;
  }
  function original() {
    const e = root.BlastPalOriginalEngine;
    if (!e || typeof e.grid !== 'function' || typeof e.build !== 'function') fail('O mecanismo original do BlastPal não foi carregado.');
    return e;
  }

  function prepare(options) {
    const o = options || {};
    if (!Array.isArray(o.ring) || o.ring.length < 3) fail('Selecione ou desenhe o polígono da bancada.');
    if (o.ring.some(p => Array.isArray(p) && Array.isArray(p[0]))) fail('Use um único contorno de bancada, sem partes ou furos internos.');
    const ring = o.ring.map(p => xy(p, 'Polígono da bancada'));
    const origin = ring[0];
    let area2 = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      area2 += (a[0] - origin[0]) * (b[1] - origin[1]) - (b[0] - origin[0]) * (a[1] - origin[1]);
    }
    if (!finite(area2) || area2 === 0) fail('O contorno da bancada não delimita uma área válida.');
    if (!Array.isArray(o.direction) || o.direction.length !== 2) fail('Desenhe ou selecione uma reta orientada A → B.');
    const A = xy(o.direction[0], 'Ponto A'), B = xy(o.direction[1], 'Ponto B');
    const dx = B[0] - A[0], dy = B[1] - A[1];
    if (!finite(dx) || !finite(dy) || !(Math.hypot(dx, dy) > 0)) fail('Os pontos A e B devem ser distintos.');
    const burden = positive(o.burden, 'Afastamento');
    const spacing = positive(o.spacing, 'Espaçamento');
    const depthMD = positive(o.depthMD, 'Comprimento do furo (MD)');
    const inclination = o.inclination == null ? 0 : o.inclination;
    if (!finite(inclination) || inclination < 0 || inclination > 45) fail('A inclinação do BlastPal deve estar entre 0° e 45° da vertical.');
    if (o.staggered != null && typeof o.staggered !== 'boolean') fail('Selecione o arranjo retangular ou estagiado.');
    const drillAz = normAz(Math.atan2(dx, dy) / RAD);
    const rowAz = normAz(drillAz - 90);
    const angle = rowAz * RAD, ux = Math.sin(angle), uy = Math.cos(angle), vx = Math.cos(angle), vy = -Math.sin(angle);
    let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
    ring.forEach(p => {
      const u = p[0] * ux + p[1] * uy, v = p[0] * vx + p[1] * vy;
      umin = Math.min(umin, u); umax = Math.max(umax, u);
      vmin = Math.min(vmin, v); vmax = Math.max(vmax, v);
    });
    const nu = Math.max(0, Math.ceil((umax - umin) / spacing) + 1);
    const nv = Math.max(0, Math.ceil((vmax - vmin) / burden) + 1);
    if (!finite(nu * nv) || nu * nv > MAX_CANDIDATES) {
      fail('A malha exige examinar mais de ' + MAX_CANDIDATES.toLocaleString('pt-BR') + ' posições. Delimite uma bancada menor ou ajuste espaçamento e afastamento.');
    }
    if (umin + spacing === umin || vmin + burden === vmin) fail('O espaçamento ou afastamento é menor que a precisão das coordenadas do projeto.');
    const prm = {
      burden, spacing, azDeg: rowAz, staggered: o.staggered !== false,
      inset: 0, sub: 0, angDeg: inclination, leanAz: drillAz,
      prefix: String(o.prefix == null ? 'F' : o.prefix).trim() || 'F'
    };
    const candidates = original().grid(ring, burden, spacing, rowAz, prm.staggered, 0);
    return {ring, direction: [A, B], prm, candidates, rowAz, drillAz, depthMD, inclination};
  }

  function build(options) {
    const o = options || {}, plan = prepare(o);
    if (typeof o.topoZAt !== 'function') fail('Selecione uma superfície topográfica para obter as cotas dos colares.');
    const elevations = new Map(), rejected = [];
    const verticalDepth = plan.depthMD * Math.cos(plan.inclination * RAD);
    plan.candidates.forEach(p => {
      const key = pointKey(p[0], p[1]);
      const z = o.topoZAt(p[0], p[1]);
      if (!finite(z)) {
        elevations.set(key, null);
        rejected.push({x: p[0], y: p[1], row: p[2], reason: 'NoData'});
        return;
      }
      elevations.set(key, z);
      if (!(z - (z - verticalDepth) > 0)) rejected.push({x: p[0], y: p[1], row: p[2], reason: 'Profundidade não representável na precisão das cotas'});
    });
    const topoZAt = (x, y) => elevations.get(pointKey(x, y));
    // Only the source supplied to the original engine is adapted: H = MD*cos(i).
    // The original engine still computes length, trajectory, numbering and rows.
    const baseZAt = (x, y) => {
      const z = topoZAt(x, y);
      return z == null ? null : z - verticalDepth;
    };
    const result = original().build(plan.ring, plan.prm, topoZAt, baseZAt);
    return Object.assign(result, {
      rejected, rowAz: plan.rowAz, drillAz: plan.drillAz,
      candidates: plan.candidates, depthMD: plan.depthMD, inclination: plan.inclination,
      conventions: {inclination: 'degrees-from-vertical', depth: 'measured-along-hole', direction: 'A-to-B-hole-azimuth', rows: 'perpendicular-to-hole-azimuth'},
      engine: 'BlastPal 1.33 original'
    });
  }

  root.GeoMineDrillingGeometry = Object.freeze({prepare, grid: prepare, build, pointKey, MAX_CANDIDATES});
})(typeof window !== 'undefined' ? window : globalThis);

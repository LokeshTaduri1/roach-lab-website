/* =========================================================
   Cell sprite renderer (BUILD TOOL, not loaded by the site)
   ---------------------------------------------------------
   Renders the 3-D blood-cell frames used by js/bloodflow.js.
   Run tools/build-sprites.ps1 to regenerate assets/cells/*.webp.
   ========================================================= */
(function () {
  "use strict";
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function makeCanvas(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  var SICKLE_VARIANTS = [
    { span: 2.5, thick: 0.42, pow: 0.75, spikes: 0, spikeAmp: 0, noise: 0.05 }, // classic crescent
    { span: 1.3, thick: 0.30, pow: 0.70, spikes: 0, spikeAmp: 0, noise: 0.08 }, // long & thin
    { span: 1.9, thick: 0.36, pow: 0.80, spikes: 4, spikeAmp: 0.12, noise: 0.06 }, // holly-leaf
    { span: 2.1, thick: 0.38, pow: 0.65, spikes: 0, spikeAmp: 0, noise: 0.22 }, // irregular lumpy
    { span: 1.6, thick: 0.34, pow: 0.90, spikes: 3, spikeAmp: 0.08, noise: 0.15 } // irregular spiky
  ];
  /* =========================================================
     True 3-D cells
     ---------------------------------------------------------
     Each cell type is modelled as a real 3-D mesh:
       • red blood cell – the biconcave disc (Evans–Fung shape)
       • sickled cell   – a rigid, tapered crescent with HbS
                          polymer-fibre striations
       • platelet       – a lumpy discoid with granules
     A tiny software rasterizer renders every mesh once, from every
     tumble angle, with per-pixel lighting: key + fill light, glossy
     specular, Fresnel rim light, and light transmission through the
     cell's real thickness (so the thin centre glows paler than the
     thick rim, as in real blood). Frames are generated in small idle
     slices; until they are ready the painted sprites above are used.
     ========================================================= */
  var spr3d = { rbc: null, rbcSoft: null, sickle: null, plt: null, wbc: null, bokeh: null, bokehSickle: null };
  var F3 = 144, SS3 = 2;

  function norm3(v) { var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  var L1 = norm3([-0.45, -0.62, 0.65]), L2 = norm3([0.75, 0.3, 0.35]);
  var HV1 = norm3([L1[0], L1[1], L1[2] + 1]), HV2 = norm3([L2[0], L2[1], L2[2] + 1]);

  function newMesh() { return { p: [], n: [], a: [], i: [] }; }
  function seal(m) { return { p: new Float32Array(m.p), n: new Float32Array(m.n), a: new Float32Array(m.a), i: new Uint32Array(m.i) }; }
  function gridIdx(m, base, rows, cols) {
    for (var r = 0; r < rows - 1; r++) for (var c = 0; c < cols; c++) {
      var c2 = (c + 1) % cols, a = base + r * cols + c, b = base + r * cols + c2, d = base + (r + 1) * cols + c, e = base + (r + 1) * cols + c2;
      m.i.push(a, d, b, b, d, e);
    }
  }

  // Half-thickness of a red blood cell at normalised radius r (units of cell radius)
  function rbcH(r) { var q = 1 - r * r; return q <= 0 ? 0 : 0.5 * Math.sqrt(q) * (0.207 + 2.003 * r * r - 1.123 * r * r * r * r); }

  function rbcMesh() {
    var m = newMesh(), NR = 40, NP = 72;
    [1, -1].forEach(function (s) {
      var base = m.p.length / 3;
      for (var k = 0; k <= NR; k++) {
        var r = k === NR ? 1 : Math.sin((k / NR) * Math.PI / 2);
        var h = rbcH(r), lo = Math.max(0, r - 1e-4), hi = Math.min(1, r + 1e-4);
        var dh = k === NR ? 0 : (rbcH(hi) - rbcH(lo)) / (hi - lo);
        for (var j = 0; j < NP; j++) {
          var f = (j / NP) * Math.PI * 2, cs = Math.cos(f), sn = Math.sin(f);
          m.p.push(r * cs, r * sn, s * h);
          var nn = k === NR ? [cs, sn, 0] : norm3([-dh * cs, -dh * sn, s]);
          m.n.push(nn[0], nn[1], nn[2]);
          m.a.push(r, 0);
        }
      }
      gridIdx(m, base, NR + 1, NP);
    });
    return seal(m);
  }

  function sickleMesh(v) {
    var m = newMesh(), NT = 84, NS = 28, a0 = -v.span / 2;
    var p0 = rand(0, 6), p1 = rand(0, 6), p2 = rand(0, 6);
    for (var u = 0; u <= NT; u++) {
      var t = 0.5 - 0.5 * Math.cos(Math.PI * u / NT), a = a0 + v.span * t;
      var rx = Math.cos(a), ry = Math.sin(a);
      var w = v.thick * Math.pow(Math.sin(Math.PI * t), v.pow);
      var irr = 1 + v.noise * (Math.sin(t * 9 + p0) * 0.5 + Math.sin(t * 17 + p1) * 0.3 + Math.sin(t * 5 + p2) * 0.2);
      var spike = v.spikes ? v.spikeAmp * Math.pow(Math.max(0, Math.sin(t * Math.PI * v.spikes)), 10) * Math.sin(Math.PI * t) : 0;
      var wo = w * 0.55 * irr + spike, wi = w * 0.45 * (2 - irr);
      var off = (wo - wi) / 2, aw = Math.max(1e-3, (wo + wi) / 2 * 1.12), bw = Math.max(1e-3, aw * 0.74);
      for (var j = 0; j < NS; j++) {
        var ps = (j / NS) * Math.PI * 2, cp = Math.cos(ps), sp = Math.sin(ps), rr = 1 + off + aw * cp;
        // rotate 90° so the long axis is horizontal: (x, y) -> (y, -x)
        m.p.push(rr * ry, -rr * rx, bw * sp);
        var nn = norm3([rx * cp / aw, ry * cp / aw, sp / bw]);
        m.n.push(nn[1], -nn[0], nn[2]);
        m.a.push(t, Math.sin(5 * ps));
      }
    }
    gridIdx(m, 0, NT + 1, NS);
    // centre the shape on its bounding box
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, i;
    for (i = 0; i < m.p.length; i += 3) { minX = Math.min(minX, m.p[i]); maxX = Math.max(maxX, m.p[i]); minY = Math.min(minY, m.p[i + 1]); maxY = Math.max(maxY, m.p[i + 1]); }
    var cx = (minX + maxX) / 2, cyy = (minY + maxY) / 2, ext = Math.max(maxX - minX, maxY - minY);
    for (i = 0; i < m.p.length; i += 3) { m.p[i] = (m.p[i] - cx) / ext; m.p[i + 1] = (m.p[i + 1] - cyy) / ext; m.p[i + 2] /= ext; }
    return seal(m);
  }

  function plateletMesh() {
    var m = newMesh(), NA = 22, NB = 40, seed = rand(0, 6);
    for (var i = 0; i <= NA; i++) {
      var th = (i / NA) * Math.PI, st = Math.sin(th), ct = Math.cos(th);
      for (var j = 0; j < NB; j++) {
        var ph = (j / NB) * Math.PI * 2, dx = st * Math.cos(ph), dy = st * Math.sin(ph), dz = ct;
        var r = 1 + 0.09 * Math.sin(3 * ph + seed) * st + 0.05 * Math.sin(5 * ph + 2 * th + seed);
        m.p.push(dx * r, dy * r * 0.82, dz * r * 0.4);
        var nn = norm3([dx, dy / 0.82, dz / 0.4]);
        m.n.push(nn[0], nn[1], nn[2]);
        var gr = Math.max(0, Math.sin(dx * 9 + seed) * Math.sin(dy * 8 + 1) * Math.sin(dz * 7 + 2));
        m.a.push(gr, 0);
      }
    }
    gridIdx(m, 0, NA + 1, NB);
    return seal(m);
  }

  // White blood cell: a sphere covered in membrane ruffles (microvilli)
  function computeNormals(m) {
    var n = new Array(m.p.length).fill(0), P = m.p, I = m.i, t, k;
    for (t = 0; t < I.length; t += 3) {
      var a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      var ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      var vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      var fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      [a, b, c].forEach(function (q) { n[q] += fx; n[q + 1] += fy; n[q + 2] += fz; });
    }
    for (k = 0; k < n.length; k += 3) {
      var v = norm3([n[k], n[k + 1], n[k + 2]]);
      if (v[0] * P[k] + v[1] * P[k + 1] + v[2] * P[k + 2] < 0) v = [-v[0], -v[1], -v[2]]; // point outward
      n[k] = v[0]; n[k + 1] = v[1]; n[k + 2] = v[2];
    }
    m.n = n;
  }
  function wbcMesh() {
    var m = newMesh(), NA = 56, NB = 100;
    // isotropic 3-D noise (sum of waves in random directions) so the ruffles are even everywhere
    var waves = [];
    for (var w = 0; w < 14; w++) {
      var d = norm3([rand(-1, 1), rand(-1, 1), rand(-1, 1)]);
      waves.push({ d: d, f: rand(7, 16), ph: rand(0, 6.28), a: w < 6 ? 0.22 : 0.12 });
    }
    function field(x, y, z) {
      var s = 0;
      for (var q = 0; q < waves.length; q++) { var W0 = waves[q]; s += W0.a * Math.sin(W0.f * (W0.d[0] * x + W0.d[1] * y + W0.d[2] * z) + W0.ph); }
      return s;
    }
    for (var i = 0; i <= NA; i++) {
      var th = (i / NA) * Math.PI, st = Math.sin(th), ct = Math.cos(th);
      for (var j = 0; j < NB; j++) {
        var ph = (j / NB) * Math.PI * 2;
        // poles point left/right (x axis) so they never face the viewer
        var dx = ct, dy = st * Math.cos(ph), dz = st * Math.sin(ph);
        var bump = field(dx, dy, dz);
        var r = 1 + 0.05 * bump;
        m.p.push(dx * r, dy * r, dz * r);
        m.a.push(0.5 + bump, Math.max(0, Math.sin(31 * dx + 5) * Math.sin(29 * dy + 1) * Math.sin(27 * dz + 3)));
      }
    }
    gridIdx(m, 0, NA + 1, NB);
    computeNormals(m);
    return seal(m);
  }
  // Multi-lobed nucleus (neutrophil), seen through the translucent cell body
  function nucleusMesh() {
    var m = newMesh(), lobes = [[-0.34, 0.1, 0.05, 0.3], [0.02, -0.2, 0.02, 0.33], [0.34, 0.12, -0.04, 0.28], [-0.13, -0.02, 0, 0.18], [0.18, -0.03, 0, 0.17]];
    lobes.forEach(function (L) {
      var base = m.p.length / 3, NA = 16, NB = 28;
      for (var i = 0; i <= NA; i++) {
        var th = (i / NA) * Math.PI;
        for (var j = 0; j < NB; j++) {
          var ph = (j / NB) * Math.PI * 2, dx = Math.sin(th) * Math.cos(ph), dy = Math.sin(th) * Math.sin(ph), dz = Math.cos(th);
          m.p.push(L[0] + dx * L[3], L[1] + dy * L[3] * 0.85, L[2] + dz * L[3] * 0.8);
          var nn = norm3([dx, dy / 0.85, dz / 0.8]);
          m.n.push(nn[0], nn[1], nn[2]);
          m.a.push(0, 0);
        }
      }
      gridIdx(m, base, NA + 1, NB);
    });
    return seal(m);
  }

  function rotX(t) { var c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, -s, 0, s, c]; }
  function rotZ(t) { var c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
  function mulM(A, B) {
    var R = [];
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) R.push(A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]);
    return R;
  }

  // Software rasterizer: z-buffered triangles, front + back depth (for real
  // thickness), interpolated normals, deferred per-pixel shading.
  function rasterize(mesh, M, S, scale, shade) {
    var nv = mesh.p.length / 3, P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), i, k, o = S / 2;
    for (i = 0; i < nv; i++) {
      var j = i * 3, x = mesh.p[j], y = mesh.p[j + 1], z = mesh.p[j + 2], nx = mesh.n[j], ny = mesh.n[j + 1], nz = mesh.n[j + 2];
      P[j] = o + (M[0] * x + M[1] * y + M[2] * z) * scale;
      P[j + 1] = o + (M[3] * x + M[4] * y + M[5] * z) * scale;
      P[j + 2] = M[6] * x + M[7] * y + M[8] * z;
      N[j] = M[0] * nx + M[1] * ny + M[2] * nz;
      N[j + 1] = M[3] * nx + M[4] * ny + M[5] * nz;
      N[j + 2] = M[6] * nx + M[7] * ny + M[8] * nz;
    }
    var SS = S * S, zf = new Float32Array(SS).fill(-1e9), zb = new Float32Array(SS).fill(1e9);
    var bx = new Float32Array(SS), by = new Float32Array(SS), bz = new Float32Array(SS), ba = new Float32Array(SS), bb = new Float32Array(SS);
    var I = mesh.i, A = mesh.a;
    for (var t = 0; t < I.length; t += 3) {
      var i0 = I[t] * 3, i1 = I[t + 1] * 3, i2 = I[t + 2] * 3;
      var x0 = P[i0], y0 = P[i0 + 1], z0 = P[i0 + 2], x1 = P[i1], y1 = P[i1 + 1], z1 = P[i1 + 2], x2 = P[i2], y2 = P[i2 + 1], z2 = P[i2 + 2];
      var area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
      if (area > -1e-9 && area < 1e-9) continue;
      var inv = 1 / area;
      var minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(S - 1, Math.ceil(Math.max(x0, x1, x2)));
      var minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(S - 1, Math.ceil(Math.max(y0, y1, y2)));
      var a0 = I[t] * 2, a1 = I[t + 1] * 2, a2 = I[t + 2] * 2;
      for (var py = minY; py <= maxY; py++) {
        var Y = py + 0.5;
        for (var px = minX; px <= maxX; px++) {
          var X = px + 0.5;
          var w0 = ((x2 - x1) * (Y - y1) - (y2 - y1) * (X - x1)) * inv;
          var w1 = ((x0 - x2) * (Y - y2) - (y0 - y2) * (X - x2)) * inv;
          var w2 = 1 - w0 - w1;
          if (w0 < -1e-5 || w1 < -1e-5 || w2 < -1e-5) continue;
          k = py * S + px;
          var zz = w0 * z0 + w1 * z1 + w2 * z2;
          if (zz < zb[k]) zb[k] = zz;
          if (zz > zf[k]) {
            zf[k] = zz;
            bx[k] = w0 * N[i0] + w1 * N[i1] + w2 * N[i2];
            by[k] = w0 * N[i0 + 1] + w1 * N[i1 + 1] + w2 * N[i2 + 1];
            bz[k] = w0 * N[i0 + 2] + w1 * N[i1 + 2] + w2 * N[i2 + 2];
            ba[k] = w0 * A[a0] + w1 * A[a1] + w2 * A[a2];
            bb[k] = w0 * A[a0 + 1] + w1 * A[a1 + 1] + w2 * A[a2 + 1];
          }
        }
      }
    }
    var img = new ImageData(S, S), d = img.data, out = [0, 0, 0];
    for (k = 0; k < SS; k++) {
      if (zf[k] < -1e8) continue;
      var lx = bx[k], ly = by[k], lz = bz[k], l = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
      shade(lx / l, ly / l, lz / l, zf[k] - zb[k], ba[k], bb[k], out);
      d[k * 4] = out[0]; d[k * 4 + 1] = out[1]; d[k * 4 + 2] = out[2]; d[k * 4 + 3] = 255;
    }
    var c = makeCanvas(S, S);
    c.getContext("2d").putImageData(img, 0, 0);
    return c;
  }

  function wrapL(dp, w) { var v = (dp + w) / (1 + w); return v > 0 ? v : 0; }

  // Physically-inspired cell material
  function material(pal) {
    return function (nx, ny, nz, thick, a0, a1, out) {
      var ab = 1 - Math.exp(-pal.k * Math.max(thick, pal.minT));         // light absorbed through the cell
      var r = pal.thin[0] + (pal.thick[0] - pal.thin[0]) * ab;
      var g = pal.thin[1] + (pal.thick[1] - pal.thin[1]) * ab;
      var b = pal.thin[2] + (pal.thick[2] - pal.thin[2]) * ab;
      if (pal.tint) { var tw = pal.tint(a0, a1); r += (pal.tintC[0] - r) * tw; g += (pal.tintC[1] - g) * tw; b += (pal.tintC[2] - b) * tw; }
      var d1 = nx * L1[0] + ny * L1[1] + nz * L1[2], d2 = nx * L2[0] + ny * L2[1] + nz * L2[2];
      var diff = pal.amb + pal.kd * wrapL(d1, 0.35) + pal.kf * wrapL(d2, 0.5);
      if (pal.ao) diff *= pal.ao(a0, a1);
      var h1 = nx * HV1[0] + ny * HV1[1] + nz * HV1[2]; h1 = h1 > 0 ? h1 : 0;
      var h2 = nx * HV2[0] + ny * HV2[1] + nz * HV2[2]; h2 = h2 > 0 ? h2 : 0;
      var spec = pal.ks * Math.pow(h1, pal.gloss) + pal.sheen * Math.pow(h1, 8) + pal.ks * 0.25 * Math.pow(h2, pal.gloss * 0.6);
      var fr = 1 - (nz > 0 ? nz : 0); fr = fr * fr * fr;
      var tr = (1 - ab) * pal.glow;
      r = r * diff + spec * 255 + fr * pal.rim[0] + tr * pal.glowC[0];
      g = g * diff + spec * 245 + fr * pal.rim[1] + tr * pal.glowC[1];
      b = b * diff + spec * 248 + fr * pal.rim[2] + tr * pal.glowC[2];
      out[0] = r > 255 ? 255 : r; out[1] = g > 255 ? 255 : g; out[2] = b > 255 ? 255 : b;
    };
  }

  var MAT_RBC = material({
    thin: [255, 150, 160], thick: [150, 0, 28], k: 3.0, minT: 0.04,
    amb: 0.28, kd: 0.85, kf: 0.25, ks: 0.5, gloss: 60, sheen: 0.09,
    rim: [95, 55, 65], glow: 0.28, glowC: [255, 70, 95],
    ao: function (r) { return 1 - 0.16 * (1 - smooth(0, 0.7, r)); }
  });
  var MAT_SICKLE = material({
    thin: [178, 30, 78], thick: [78, 0, 34], k: 4.2, minT: 0.08,
    amb: 0.26, kd: 0.85, kf: 0.22, ks: 0.34, gloss: 34, sheen: 0.07,
    rim: [70, 24, 50], glow: 0.12, glowC: [170, 30, 85],
    ao: function (t, fib) { return (0.93 + 0.07 * fib) * (0.97 + 0.03 * Math.sin(t * 37)); }
  });
  var MAT_PLT = material({
    thin: [255, 238, 234], thick: [238, 172, 188], k: 2.0, minT: 0.05,
    amb: 0.35, kd: 0.75, kf: 0.25, ks: 0.3, gloss: 30, sheen: 0.06,
    rim: [60, 40, 50], glow: 0.1, glowC: [255, 200, 210],
    tint: function (gr) { return Math.min(1, gr * gr * 4) * 0.38; }, tintC: [170, 90, 140]
  });

  var MAT_WBC = material({
    thin: [255, 247, 249], thick: [232, 212, 224], k: 1.1, minT: 0.05,
    amb: 0.34, kd: 0.72, kf: 0.24, ks: 0.32, gloss: 38, sheen: 0.06,
    rim: [40, 30, 42], glow: 0.08, glowC: [255, 230, 240],
    ao: function (bump) { return 0.9 + 0.1 * bump; },
    tint: function (bump, gran) { return gran > 0.82 ? 0.22 : 0; }, tintC: [200, 150, 190]
  });
  var MAT_NUC = material({
    thin: [196, 128, 200], thick: [112, 50, 140], k: 3.2, minT: 0.1,
    amb: 0.4, kd: 0.65, kf: 0.2, ks: 0.15, gloss: 20, sheen: 0,
    rim: [0, 0, 0], glow: 0, glowC: [0, 0, 0]
  });

  // Downsample the supersampled render and bake a soft contact shadow under it
  function finishSprite(big, size) {
    var F = size || F3;
    var c = makeCanvas(F, F), g = c.getContext("2d");
    g.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in g) g.imageSmoothingQuality = "high";
    if ("filter" in g) {
      g.save();
      g.filter = "blur(" + (F * 0.03).toFixed(1) + "px) brightness(0)";
      g.globalAlpha = 0.26;
      g.drawImage(big, F * 0.012, F * 0.04, F, F);
      g.restore();
    }
    g.drawImage(big, 0, 0, F, F);
    return c;
  }
  // White blood cell frame: ruffled membrane with the lobed nucleus showing through
  function wbcFrame(mem, nuc, M, F) {
    var S = F * SS3, body = rasterize(mem, M, S, S * 0.4, MAT_WBC), core = rasterize(nuc, M, S, S * 0.4, MAT_NUC);
    var g = body.getContext("2d");
    g.save();
    g.globalCompositeOperation = "source-atop";
    g.globalAlpha = 0.5;
    if ("filter" in g) g.filter = "blur(" + (S * 0.008).toFixed(1) + "px)";
    g.drawImage(core, 0, 0);
    g.restore();
    return finishSprite(body, F);
  }
  function blurred(src, px) {
    var c = makeCanvas(src.width, src.height), g = c.getContext("2d");
    if ("filter" in g) g.filter = "blur(" + px + "px)";
    g.drawImage(src, 0, 0);
    return c;
  }

  function sheet(frames, cols) {
    var F = frames[0].width, rows = Math.ceil(frames.length / cols);
    var c = makeCanvas(F * cols, F * rows), g = c.getContext('2d');
    frames.forEach(function (f, i) { g.drawImage(f, (i % cols) * F, Math.floor(i / cols) * F); });
    return c;
  }
  window.CellRenderer = {
    build: function () {
      var i, out = {};
      var rbcM = rbcMesh(), rbc = [];
      for (i = 0; i < 32; i++) rbc.push(finishSprite(rasterize(rbcM, rotX((i / 32) * Math.PI), 256, 256 * 0.4, MAT_RBC), 128));
      out.rbc = sheet(rbc, 8);
      var sick = [];
      SICKLE_VARIANTS.forEach(function (v) {
        var m = sickleMesh(v);
        for (var f = 0; f < 12; f++) sick.push(finishSprite(rasterize(m, rotX((f / 12) * Math.PI * 2), 256, 256 * 0.8, MAT_SICKLE), 128));
      });
      out.sickle = sheet(sick, 12);
      var pm = plateletMesh(), plt = [];
      for (i = 0; i < 8; i++) plt.push(finishSprite(rasterize(pm, rotX((i / 8) * Math.PI), 144, 144 * 0.36, MAT_PLT), 72));
      out.plt = sheet(plt, 8);
      var wM = wbcMesh(), nM = nucleusMesh(), wbc = [];
      for (i = 0; i < 24; i++) wbc.push(wbcFrame(wM, nM, mulM(rotX(0.35), rotZ((i / 24) * Math.PI * 2)), 176));
      out.wbc = sheet(wbc, 8);
      return out;
    }
  };
})();

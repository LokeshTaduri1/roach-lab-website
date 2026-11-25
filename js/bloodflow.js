/* =========================================================
   Powell-Roach Lab — interactive blood-flow / vaso-occlusion scene
   ---------------------------------------------------------
   Healthy red blood cells tumble through a vessel. In
   "Sickle crisis" mode, rigid sickle-shaped cells lodge where
   the vessel narrows, cells pile up behind them, flow drops,
   and a pain signal fires at the blockage.

   Interaction
     • hover a cell        → label (healthy / sickled / platelet)
     • move cursor quickly → push cells aside
     • click / tap         → clear the blockage and heal nearby
                             sickled cells
     • panel buttons       → Healthy ↔ Sickle crisis
   ========================================================= */
(function () {
  "use strict";

  var hero = document.querySelector("[data-bloodflow]");
  if (!hero) return;
  var canvas = hero.querySelector(".hero-canvas");
  var ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  if (!ctx) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- UI ---------- */
  var panel = hero.querySelector(".flow-panel");
  var uiValue = panel && panel.querySelector(".flow-value");
  var uiBar = panel && panel.querySelector(".flow-bar b");
  var uiHint = panel && panel.querySelector(".flow-hint");
  var modeBtns = panel ? Array.prototype.slice.call(panel.querySelectorAll("[data-mode]")) : [];

  /* ---------- State ---------- */
  var DPR = 1, W = 0, H = 0, mobile = false;
  var R0 = 100, CS = 30, xJam = 0, targetCount = 100;
  var vesselLayer = null, lumenPath = null, spr = null;
  var cells = [], drawList = [], streaks = [], bokeh = [], ripples = [], rings = [];
  var mode = "crisis";
  var mouse = { x: -9999, y: -9999, active: false, energy: 0, lx: 0, ly: 0 };
  var hovered = null;
  var time = 0, lastInteract = -99, blockedSince = 0, cooldown = 2.5, ringTimer = 0, uiTimer = 0;
  var block = 0, lodgedCount = 0, flowShown = 100;
  var running = false, onScreen = true, lastT = 0;
  var MAX_LODGED = 14;

  /* ---------- Helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function makeCanvas(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

  /* ---------- Vessel geometry ---------- */
  function cy(x) {
    var t = x / W;
    if (mobile) return H - 192 + Math.sin(t * Math.PI * 2) * 10;
    return H * (0.74 - 0.27 * smooth(0.08, 0.95, t)) + Math.sin(t * Math.PI * 2.2) * H * 0.025;
  }
  function rad(x) {
    var t = x / W;
    return R0 * (1 - 0.56 * smooth(mobile ? 0.48 : 0.6, mobile ? 0.7 : 0.8, t));
  }
  function slope(x) { return (cy(x + 2) - cy(x - 2)) / 4; }

  /* =========================================================
     Sprites (pre-rendered once, drawn many times)
     ========================================================= */
  var SPR = 192;

  function rbcSprite(blur) {
    var c = makeCanvas(SPR, SPR), g = c.getContext("2d"), m = SPR / 2, r = SPR * 0.4;
    if (blur && "filter" in g) g.filter = "blur(" + blur + "px)";
    g.save();
    g.shadowColor = "rgba(120,0,25,0.35)";
    g.shadowBlur = SPR * 0.06;
    g.shadowOffsetY = SPR * 0.03;
    var body = g.createRadialGradient(m, m, 0, m, m, r);
    body.addColorStop(0, "#f2808f");    // central pallor
    body.addColorStop(0.3, "#e4415d");
    body.addColorStop(0.6, "#cf1239");
    body.addColorStop(0.8, "#e52d4d");  // thick rim (torus)
    body.addColorStop(0.93, "#c40f35");
    body.addColorStop(1, "#99001f");
    g.fillStyle = body;
    g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fill();
    g.restore();
    // concave dimple shading
    var dim = g.createRadialGradient(m + r * 0.08, m + r * 0.1, 0, m, m, r * 0.52);
    dim.addColorStop(0, "rgba(150,0,30,0.28)");
    dim.addColorStop(1, "rgba(150,0,30,0)");
    g.fillStyle = dim;
    g.beginPath(); g.arc(m, m, r * 0.52, 0, Math.PI * 2); g.fill();
    // specular highlight
    var sp = g.createRadialGradient(m - r * 0.38, m - r * 0.42, 0, m - r * 0.38, m - r * 0.42, r * 0.6);
    sp.addColorStop(0, "rgba(255,255,255,0.55)");
    sp.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = sp;
    g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fill();
    // rim light
    g.strokeStyle = "rgba(255,255,255,0.22)";
    g.lineWidth = SPR * 0.012;
    g.beginPath(); g.arc(m, m, r * 0.93, Math.PI * 1.05, Math.PI * 1.75); g.stroke();
    return c;
  }

  // Sickle shapes: a crescent-like spine with a tapered, irregular body.
  var SICKLE_VARIANTS = [
    { span: 2.5, thick: 0.42, pow: 0.75, spikes: 0, spikeAmp: 0, noise: 0.05 }, // classic crescent
    { span: 1.3, thick: 0.30, pow: 0.70, spikes: 0, spikeAmp: 0, noise: 0.08 }, // long & thin
    { span: 1.9, thick: 0.36, pow: 0.80, spikes: 4, spikeAmp: 0.12, noise: 0.06 }, // holly-leaf
    { span: 2.1, thick: 0.38, pow: 0.65, spikes: 0, spikeAmp: 0, noise: 0.22 }, // irregular lumpy
    { span: 1.6, thick: 0.34, pow: 0.90, spikes: 3, spikeAmp: 0.08, noise: 0.15 } // irregular spiky
  ];

  function sicklePoints(v) {
    var N = 110, outer = [], inner = [], a0 = -v.span / 2;
    var p0 = rand(0, 6), p1 = rand(0, 6), p2 = rand(0, 6);
    for (var i = 0; i <= N; i++) {
      var t = i / N, a = a0 + v.span * t;
      var nx = Math.cos(a), ny = Math.sin(a);
      var w = v.thick * Math.pow(Math.sin(Math.PI * t), v.pow);
      var irr = 1 + v.noise * (Math.sin(t * 9 + p0) * 0.5 + Math.sin(t * 17 + p1) * 0.3 + Math.sin(t * 5 + p2) * 0.2);
      var spike = v.spikes ? v.spikeAmp * Math.pow(Math.max(0, Math.sin(t * Math.PI * v.spikes)), 10) * Math.sin(Math.PI * t) : 0;
      var wo = w * 0.55 * irr + spike, wi = w * 0.45 * (2 - irr);
      outer.push([nx * (1 + wo), ny * (1 + wo)]);
      inner.push([nx * (1 - wi), ny * (1 - wi)]);
    }
    // rotate 90° so the long axis is horizontal
    return outer.concat(inner.reverse()).map(function (p) { return [p[1], -p[0]]; });
  }

  function sickleSprite(v, blur) {
    var pts = sicklePoints(v);
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    pts.forEach(function (p) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    });
    var s = (SPR * 0.8) / Math.max(maxX - minX, maxY - minY);
    var ox = SPR / 2 - ((minX + maxX) / 2) * s, oy = SPR / 2 - ((minY + maxY) / 2) * s;
    var c = makeCanvas(SPR, SPR), g = c.getContext("2d");
    if (blur && "filter" in g) g.filter = "blur(" + blur + "px)";
    function path() {
      g.beginPath();
      pts.forEach(function (p, i) { var x = ox + p[0] * s, y = oy + p[1] * s; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.closePath();
    }
    g.save();
    g.shadowColor = "rgba(90,0,20,0.4)";
    g.shadowBlur = SPR * 0.05;
    g.shadowOffsetY = SPR * 0.025;
    var body = g.createLinearGradient(0, oy + minY * s, 0, oy + maxY * s);
    body.addColorStop(0, "#c8153d");
    body.addColorStop(0.5, "#9a0026");
    body.addColorStop(1, "#6e001b");
    g.fillStyle = body;
    path(); g.fill();
    g.restore();
    // glossy highlight clipped to the cell
    g.save(); path(); g.clip();
    var top = oy + minY * s;
    var hl = g.createRadialGradient(SPR / 2, top + SPR * 0.06, 0, SPR / 2, top + SPR * 0.06, SPR * 0.38);
    hl.addColorStop(0, "rgba(255,255,255,0.5)");
    hl.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = hl; g.fillRect(0, 0, SPR, SPR);
    g.restore();
    g.strokeStyle = "rgba(80,0,18,0.55)";
    g.lineWidth = SPR * 0.012;
    path(); g.stroke();
    return c;
  }

  function plateletSprite() {
    var c = makeCanvas(64, 64), g = c.getContext("2d");
    g.beginPath();
    for (var i = 0; i <= 24; i++) {
      var a = (i / 24) * Math.PI * 2, r = 22 + Math.sin(a * 3 + 1) * 3 + Math.sin(a * 5) * 2;
      var x = 32 + Math.cos(a) * r, y = 32 + Math.sin(a) * r * 0.7;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
    var grd = g.createRadialGradient(28, 26, 2, 32, 32, 26);
    grd.addColorStop(0, "#fff6f0");
    grd.addColorStop(1, "#f2b3bf");
    g.fillStyle = grd; g.fill();
    g.strokeStyle = "rgba(190,60,90,0.35)"; g.lineWidth = 1.5; g.stroke();
    return c;
  }

  function buildSprites() {
    spr = {
      rbc: rbcSprite(0),
      rbcBlur: rbcSprite(SPR * 0.05),
      sickle: SICKLE_VARIANTS.map(function (v) { return sickleSprite(v, 0); }),
      sickleBlur: sickleSprite(SICKLE_VARIANTS[0], SPR * 0.05),
      plt: plateletSprite()
    };
  }

  /* =========================================================
     Vessel (static layer, rebuilt on resize)
     ========================================================= */
  function buildVessel() {
    var c = makeCanvas(Math.max(1, Math.round(W * DPR)), Math.max(1, Math.round(H * DPR)));
    var g = c.getContext("2d");
    g.scale(DPR, DPR);
    var xs = [];
    for (var x = -40; x <= W + 40; x += 6) xs.push(x);

    function band(extra) {
      var p = new Path2D();
      xs.forEach(function (x, i) { var y = cy(x) - rad(x) - extra; if (i) p.lineTo(x, y); else p.moveTo(x, y); });
      for (var i = xs.length - 1; i >= 0; i--) p.lineTo(xs[i], cy(xs[i]) + rad(xs[i]) + extra);
      p.closePath();
      return p;
    }

    // side capillaries
    var br = mobile ? [[0.28, -1], [0.86, 1]] : [[0.2, -1], [0.44, 1], [0.66, -1], [0.9, 1]];
    g.lineCap = "round";
    br.forEach(function (b) {
      var bx = W * b[0], by = cy(bx) + b[1] * rad(bx) * 0.5, len = mobile ? 70 : 150;
      var ex = bx + len * 0.75, ey = by + b[1] * len, qx = bx + len * 0.05, qy = by + b[1] * len * 0.75;
      g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(qx, qy, ex, ey);
      g.strokeStyle = "rgba(239,148,167,0.6)"; g.lineWidth = mobile ? 14 : 22; g.stroke();
      g.strokeStyle = "rgba(253,226,231,0.95)"; g.lineWidth = mobile ? 8 : 13; g.stroke();
    });

    // soft halo
    g.save();
    g.shadowColor = "rgba(204,0,51,0.22)";
    g.shadowBlur = 44;
    g.fillStyle = "rgba(247,182,194,0.55)";
    g.fill(band(18));
    g.restore();

    // vessel wall
    var wall = g.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, "#f6aebd");
    wall.addColorStop(1, "#ec8da1");
    g.fillStyle = wall;
    g.fill(band(11));

    // lumen (plasma)
    var lumen = band(0);
    var lg = g.createLinearGradient(0, 0, 0, H);
    lg.addColorStop(0, "#fff2f4");
    lg.addColorStop(0.5, "#fde0e6");
    lg.addColorStop(1, "#fbd0d9");
    g.fillStyle = lg;
    g.fill(lumen);

    // inner wall shading
    g.save(); g.clip(lumen);
    g.strokeStyle = "rgba(190,20,60,0.16)"; g.lineWidth = 16; g.stroke(lumen);
    g.restore();

    // wall highlight
    g.strokeStyle = "rgba(255,255,255,0.8)"; g.lineWidth = 2;
    g.beginPath();
    xs.forEach(function (x, i) { var y = cy(x) - rad(x) - 9; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();

    vesselLayer = c;
    lumenPath = lumen;
  }

  /* =========================================================
     Cells
     ========================================================= */
  function baseSpeed() { return mobile ? 68 : 92; }

  function newCell(x, forceType) {
    var type = forceType;
    if (!type) {
      var r = Math.random();
      type = mode === "crisis" && r < 0.3 ? "sickle" : r > 0.93 ? "plt" : "rbc";
    }
    var z = Math.random();
    var c = {
      type: type, x: x, o: 0, vx: baseSpeed() * 0.8, vo: 0, z: z,
      size: CS * (0.8 + z * 0.32) * (type === "plt" ? 0.32 : 1),
      rot: rand(-0.7, 0.7), spin: rand(-0.6, 0.6), tilt: rand(0, 6.28), tiltSpd: rand(0.8, 2),
      variant: (Math.random() * SICKLE_VARIANTS.length) | 0, flip: Math.random() < 0.5 ? -1 : 1,
      lodged: false, lodgeAngle: 0, heal: 0
    };
    var lim = Math.max(0, rad(x) - c.size * 0.45);
    c.o = rand(-lim, lim);
    return c;
  }

  function populate() {
    var area = 0;
    for (var x = 0; x < W; x += 10) area += rad(x) * 2 * 10;
    targetCount = clamp(Math.round(area / (CS * CS * 1.9)), 40, mobile ? 90 : 190);
    cells = [];
    for (var i = 0; i < targetCount; i++) cells.push(newCell(rand(-CS, W)));
    streaks = [];
    for (var s = 0; s < (mobile ? 16 : 34); s++) streaks.push({ x: rand(0, W), o: rand(-0.85, 0.85), len: rand(24, 70), k: rand(1.2, 1.9) });
    bokeh = [];
    for (var b = 0; b < (mobile ? 4 : 8); b++) {
      bokeh.push({ x: rand(W * 0.35, W), y: rand(0, H), s: rand(40, 100), a: rand(0.08, 0.16), vy: rand(-6, 6), vx: rand(-4, 4), sick: Math.random() < 0.3, r: rand(0, 6) });
    }
  }

  function lodge(c) {
    if (c.lodged || lodgedCount >= MAX_LODGED) return;
    c.lodged = true;
    c.vx = 0;
    c.lodgeAngle = rand(-1.25, 1.25);
    lodgedCount++;
  }

  function clearBlockage(pt) {
    var any = false, jamY = cy(xJam);
    var nearJam = !pt || Math.hypot(pt.x - xJam, pt.y - jamY) < rad(xJam) + (mobile ? 90 : 150);
    var healR = mobile ? 90 : 140;
    cells.forEach(function (c) {
      if (c.lodged && nearJam) { c.lodged = false; c.vx = baseSpeed() * 1.4; any = true; }
      if (pt && c.type === "sickle" && !c.heal && Math.hypot(c.x - pt.x, cy(c.x) + c.o - pt.y) < healR) { c.heal = 0.001; c.lodged = false; any = true; }
    });
    if (any) { cooldown = 6; blockedSince = 0; }
    return any;
  }

  function setMode(m) {
    mode = m;
    modeBtns.forEach(function (b) {
      var on = b.getAttribute("data-mode") === m;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    if (m === "healthy") {
      clearBlockage(null);
      cells.forEach(function (c) { if (c.type === "sickle") c.heal = 0.001 - Math.random() * 0.8; }); // staggered healing
    } else {
      cooldown = 1.5;
      // turn a share of the current cells into sickled cells
      cells.forEach(function (c) { if (c.type === "rbc" && Math.random() < 0.25) { c.type = "sickle"; c.heal = 0; } });
    }
    lastInteract = time;
    if (reduceMotion) presimulate(240);
  }

  /* ---------- Simulation step ---------- */
  function step(dt) {
    time += dt;
    var bs = baseSpeed(), i, c;

    lodgedCount = 0;
    for (i = 0; i < cells.length; i++) if (cells[i].lodged) lodgedCount++;
    var target = Math.min(1, lodgedCount / (mobile ? 5 : 7));
    block += (target - block) * Math.min(1, dt * 2);
    if (cooldown > 0) cooldown -= dt;

    // auto-clear so visitors who don't interact still see the full cycle
    if (block > 0.9) {
      if (!blockedSince) blockedSince = time;
      if (time - blockedSince > 9 && time - lastInteract > 6) clearBlockage(null);
    } else blockedSince = 0;

    mouse.energy *= Math.pow(0.04, dt);

    for (i = 0; i < cells.length; i++) {
      c = cells[i];
      if (c.heal !== 0) {
        c.heal += dt * 1.5;
        if (c.heal >= 1) { c.type = "rbc"; c.heal = 0; }
      }
      if (c.lodged) continue;

      var r = Math.max(1, rad(c.x));
      var lane = c.o / r;
      var profile = 1 - 0.55 * lane * lane;               // parabolic flow profile
      var narrow = 1 + (R0 / r - 1) * 0.3;                 // speeds up in the narrow part
      var slow = 1;
      if (c.x < xJam + 10) slow = 1 - 0.92 * block * (0.35 + 0.65 * smooth(0, xJam, c.x));
      var tv = bs * profile * narrow * slow * (c.type === "sickle" ? 0.86 : 1);
      c.vx += (tv - c.vx) * Math.min(1, dt * 2.5);

      c.vo += (Math.sin(time * 1.3 + c.z * 20) * 7 - c.vo * 1.5) * dt;

      // cursor pushes cells when it moves quickly
      if (mouse.active && mouse.energy > 0.05) {
        var px = c.x, py = cy(c.x) + c.o, dx = px - mouse.x, dy = py - mouse.y, R = mobile ? 70 : 115;
        var d2 = dx * dx + dy * dy;
        if (d2 < R * R) {
          var d = Math.sqrt(d2) || 1, f = (1 - d / R) * 520 * dt * mouse.energy;
          c.x += (dx / d) * f * 0.6;
          c.o += (dy / d) * f;
          c.spin += rand(-1, 1) * f * 0.02;
        }
      }

      c.x += c.vx * dt;
      c.o += c.vo * dt;
      var lim = Math.max(0, rad(c.x) - c.size * (c.type === "sickle" ? 0.36 : 0.42));
      if (c.o > lim) { c.o = lim; c.vo *= -0.3; } else if (c.o < -lim) { c.o = -lim; c.vo *= -0.3; }

      c.rot += c.spin * dt * 0.35;
      c.spin *= 0.995;
      c.tilt += c.tiltSpd * dt * (0.3 + c.vx / bs);

      // a sickled cell reaching the narrowing gets stuck
      if (mode === "crisis" && c.type === "sickle" && !c.heal && cooldown <= 0 &&
          c.x > xJam - CS * 0.5 && c.x < xJam + CS && (lodgedCount === 0 || Math.random() < dt * 3)) {
        lodge(c);
      }
    }

    collide();

    // recycle cells that leave on the right, spawn on the left when there is room
    for (i = cells.length - 1; i >= 0; i--) if (cells[i].x > W + CS * 1.5) cells.splice(i, 1);
    var minX = 1e9;
    for (i = 0; i < cells.length; i++) if (cells[i].x < minX) minX = cells[i].x;
    for (var k = 0; k < 2 && cells.length < targetCount && minX > CS * 0.35; k++) {
      cells.push(newCell(-CS * 0.6));
      minX = -CS * 0.6;
    }

    // plasma streaks
    for (i = 0; i < streaks.length; i++) {
      var s = streaks[i];
      var sl = s.x < xJam ? 1 - 0.9 * block : 1 - 0.7 * block;
      s.x += bs * s.k * sl * dt;
      if (s.x - s.len > W) { s.x = -rand(0, 80); s.o = rand(-0.85, 0.85); }
    }
    // background bokeh
    for (i = 0; i < bokeh.length; i++) {
      var b = bokeh[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.r += dt * 0.1;
      if (b.y < -60) b.y = H + 60; if (b.y > H + 60) b.y = -60;
      if (b.x < W * 0.3) b.x = W + 50; if (b.x > W + 60) b.x = W * 0.32;
    }

    // pain-signal rings
    if (block > 0.35) {
      ringTimer += dt;
      if (ringTimer > 1.1) { ringTimer = 0; rings.push({ t: 0 }); }
    }
    for (i = rings.length - 1; i >= 0; i--) { rings[i].t += dt / 1.8; if (rings[i].t >= 1) rings.splice(i, 1); }
    for (i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt / 0.9; if (ripples[i].t >= 1) ripples.splice(i, 1); }

    // panel
    uiTimer += dt;
    if (uiTimer > 0.2) { uiTimer = 0; updatePanel(); }
  }

  function collide() {
    cells.sort(function (a, b) { return a.x - b.x; });
    var n = cells.length, reach = CS * 1.4;
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < n; i++) {
        var a = cells[i];
        if (a.type === "plt") continue;
        for (var j = i + 1; j < n; j++) {
          var b = cells[j];
          if (b.x - a.x > reach) break;
          if (b.type === "plt" || Math.abs(a.z - b.z) > 0.55) continue;
          var dx = b.x - a.x, dy = b.o - a.o, d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          var min = (a.size + b.size) * 0.36;
          if (d >= min) continue;

          // sickled cells stick to an existing blockage
          if (mode === "crisis" && cooldown <= 0) {
            if (b.lodged && a.type === "sickle" && !a.heal && a.x > xJam - CS * 3) lodge(a);
            else if (a.lodged && b.type === "sickle" && !b.heal && b.x > xJam - CS * 3) lodge(b);
          }

          var wa = a.lodged ? 0 : 1, wb = b.lodged ? 0 : 1, sum = wa + wb;
          if (!sum) continue;
          var push = min - d, nx = dx / d, ny = dy / d;
          a.x -= nx * push * wa / sum; a.o -= ny * push * wa / sum;
          b.x += nx * push * wb / sum; b.o += ny * push * wb / sum;
          if (dx > 0 && a.vx > b.vx) a.vx = b.vx + (a.vx - b.vx) * 0.5; // back cell can't overtake
        }
      }
    }
  }

  /* =========================================================
     Rendering
     ========================================================= */
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  function pill(text, x, y, alpha, strong) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "600 13px Inter, 'Segoe UI', system-ui, sans-serif";
    var w = ctx.measureText(text).width + 26, h = 30;
    x = clamp(x, w / 2 + 8, W - w / 2 - 8);
    y = clamp(y, h / 2 + 6, H - h / 2 - 6);
    ctx.shadowColor = "rgba(120,0,30,0.2)";
    ctx.shadowBlur = 14;
    ctx.fillStyle = strong ? "#cc0033" : "rgba(255,255,255,0.95)";
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 15);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = strong ? "#ffffff" : "#a00028";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y + 0.5);
    ctx.restore();
  }

  function drawCell(c) {
    var x = c.x, y = cy(x) + c.o, ang = Math.atan(slope(x));
    var alpha = 0.7 + c.z * 0.3;
    ctx.save();
    ctx.translate(x, y);

    if (c.type === "plt") {
      ctx.rotate(c.rot);
      ctx.globalAlpha = 0.95;
      ctx.drawImage(spr.plt, -c.size / 2, -c.size / 2, c.size, c.size);
      ctx.restore();
      return;
    }

    var h = c.heal > 0 ? c.heal : 0;
    if (c.type === "rbc" || h > 0) {
      var tilt = 0.32 + 0.68 * Math.abs(Math.cos(c.tilt)); // 3-D tumbling
      var sz = c.size * (h > 0 ? 0.6 + 0.4 * h : 1);
      ctx.save();
      ctx.rotate(ang + c.rot);
      ctx.scale(1, tilt);
      ctx.globalAlpha = alpha * (c.type === "rbc" ? 1 : h);
      ctx.drawImage(spr.rbc, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    }
    if (c.type === "sickle") {
      var s = c.size * 1.32;
      ctx.rotate(ang + (c.lodged ? c.lodgeAngle : c.rot * 0.5));
      ctx.scale(c.flip, 1);
      ctx.globalAlpha = alpha * (1 - h);
      ctx.drawImage(spr.sickle[c.variant], -s / 2, -s / 2, s, s);
    }
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // out-of-focus background cells (depth of field)
    for (var i = 0; i < bokeh.length; i++) {
      var b = bokeh[i];
      ctx.save();
      ctx.globalAlpha = b.a;
      ctx.translate(b.x, b.y); ctx.rotate(b.r);
      ctx.drawImage(b.sick ? spr.sickleBlur : spr.rbcBlur, -b.s / 2, -b.s / 2, b.s, b.s);
      ctx.restore();
    }

    ctx.drawImage(vesselLayer, 0, 0, W, H);

    ctx.save();
    ctx.clip(lumenPath);

    // low-oxygen tint downstream of the blockage
    if (block > 0.02) {
      var g = ctx.createLinearGradient(xJam, 0, xJam + W * 0.12, 0);
      g.addColorStop(0, "rgba(105,90,95,0)");
      g.addColorStop(1, "rgba(105,90,95," + (0.34 * block).toFixed(3) + ")");
      ctx.fillStyle = g;
      ctx.fillRect(xJam, 0, W - xJam, H);
    }

    // plasma streaks
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (i = 0; i < streaks.length; i++) {
      var s = streaks[i], sy = cy(s.x) + s.o * rad(s.x);
      ctx.moveTo(s.x, sy);
      ctx.lineTo(s.x - s.len, cy(s.x - s.len) + s.o * rad(s.x - s.len));
    }
    ctx.stroke();

    // cells, back to front
    drawList = cells.slice().sort(function (a, b) { return a.z - b.z; });
    for (i = 0; i < drawList.length; i++) drawCell(drawList[i]);
    ctx.restore();

    var jx = xJam, jy = cy(xJam), jr = rad(xJam);

    // pain signal rings at the blockage
    for (i = 0; i < rings.length; i++) {
      var t = rings[i].t;
      ctx.beginPath();
      ctx.arc(jx, jy, jr * (1 + t * 1.8), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(204,0,51," + ((1 - t) * 0.45 * block).toFixed(3) + ")";
      ctx.lineWidth = 2.5 * (1 - t) + 0.5;
      ctx.stroke();
    }

    // pulsing pain bolt (same motif as the lab logo)
    if (block > 0.25) {
      var pa = smooth(0.25, 0.7, block) * (0.65 + 0.35 * Math.sin(time * 7));
      var bx = jx, by = jy - jr - (mobile ? 30 : 44), k = mobile ? 0.8 : 1.1;
      ctx.save();
      ctx.globalAlpha = pa;
      ctx.translate(bx, by); ctx.scale(k, k);
      ctx.shadowColor = "rgba(204,0,51,0.7)";
      ctx.shadowBlur = 16;
      ctx.strokeStyle = "#cc0033";
      ctx.lineWidth = 3.5;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-30, 0); ctx.lineTo(-13, 0); ctx.lineTo(-7, -11); ctx.lineTo(0, 15); ctx.lineTo(7, -19); ctx.lineTo(13, 0); ctx.lineTo(30, 0);
      ctx.stroke();
      ctx.restore();
    }

    // blockage label
    pill(mobile ? "Blocked flow" : "Vaso-occlusion: blood flow blocked", jx, jy + jr + (mobile ? 26 : 36), smooth(0.5, 0.9, block), true);

    // click ripples
    for (i = 0; i < ripples.length; i++) {
      var rp = ripples[i];
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, 12 + rp.t * (mobile ? 90 : 140), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255," + (1 - rp.t).toFixed(3) + ")";
      ctx.lineWidth = 4 * (1 - rp.t) + 1;
      ctx.stroke();
      ctx.strokeStyle = "rgba(204,0,51," + (0.4 * (1 - rp.t)).toFixed(3) + ")";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // hover label
    hovered = null;
    if (mouse.active) {
      var best = 1e9;
      for (i = 0; i < cells.length; i++) {
        var c = cells[i], d = Math.hypot(c.x - mouse.x, cy(c.x) + c.o - mouse.y);
        if (d < c.size * 0.6 && d < best) { best = d; hovered = c; }
      }
    }
    if (hovered) {
      var hx = hovered.x, hy = cy(hx) + hovered.o;
      ctx.beginPath();
      ctx.arc(hx, hy, hovered.size * 0.62, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(35,31,32,0.55)";
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      var name = hovered.type === "plt" ? "Platelet"
        : hovered.type === "rbc" ? "Healthy red blood cell"
        : hovered.lodged ? "Sickled cell: stuck" : "Sickled red blood cell";
      pill(name, hx, hy - hovered.size * 0.62 - 22, 1, false);
    }
    hero.style.cursor = hovered || nearJam(mouse.x, mouse.y) ? "pointer" : "";
  }

  function nearJam(x, y) {
    return block > 0.2 && Math.hypot(x - xJam, y - cy(xJam)) < rad(xJam) + 70;
  }

  function updatePanel() {
    var target = mode === "healthy" ? 100 : Math.round(100 - 94 * block);
    flowShown += (target - flowShown) * 0.5;
    var v = Math.round(flowShown);
    if (uiValue) uiValue.textContent = v + "%";
    if (uiBar) {
      uiBar.style.width = v + "%";
      uiBar.parentNode.classList.toggle("low", v < 45);
    }
    if (uiHint) {
      var msg = mode === "healthy" ? "Healthy flow · move your cursor quickly to push cells"
        : block > 0.5 ? "Blockage! Click it to clear it and heal the sickled cells"
        : block > 0.1 ? "Sickled cells are getting stuck…"
        : "Hover a cell to identify it · click the blockage to clear it";
      if (uiHint.textContent !== msg) uiHint.textContent = msg;
    }
  }

  /* =========================================================
     Sizing, loop, events
     ========================================================= */
  var lastW = 0, lastH = 0;
  function resize() {
    var w = hero.clientWidth, h = hero.clientHeight;
    if (!w || !h) return;
    var widthChanged = Math.abs(w - lastW) > 40, heightChanged = Math.abs(h - lastH) > 120;
    W = w; H = h;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    mobile = W < 800;
    R0 = mobile ? 58 : clamp(H * 0.17, 72, 125);
    CS = clamp(R0 * 0.34, 18, 40);
    xJam = W * (mobile ? 0.7 : 0.8);
    buildVessel();
    if (!cells.length || widthChanged || heightChanged) {
      populate();
      lastW = w; lastH = h;
    }
    if (!running) draw();
  }

  function frame(t) {
    if (!running) return;
    var dt = Math.min(0.033, Math.max(0.001, (t - lastT) / 1000));
    lastT = t;
    step(dt);
    draw();
    requestAnimationFrame(frame);
  }
  function start() {
    if (running || reduceMotion || !onScreen || document.hidden) return;
    running = true;
    lastT = performance.now();
    requestAnimationFrame(frame);
  }
  function stop() { running = false; }

  function presimulate(steps) {
    for (var i = 0; i < steps; i++) step(1 / 60);
    draw();
  }

  function localPoint(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  hero.addEventListener("pointermove", function (e) {
    var p = localPoint(e);
    var d = Math.hypot(p.x - mouse.lx, p.y - mouse.ly);
    mouse.energy = Math.min(1, mouse.energy + d / 90);
    mouse.x = mouse.lx = p.x;
    mouse.y = mouse.ly = p.y;
    mouse.active = true;
    if (reduceMotion) draw();
  });
  hero.addEventListener("pointerleave", function () { mouse.active = false; hero.style.cursor = ""; if (reduceMotion) draw(); });

  hero.addEventListener("click", function (e) {
    if (e.target.closest("a, button, .flow-panel, h1, p, .eyebrow")) return;
    var p = localPoint(e);
    lastInteract = time;
    ripples.push({ x: p.x, y: p.y, t: 0 });
    clearBlockage(p);
    if (reduceMotion) presimulate(120);
  });

  modeBtns.forEach(function (b) {
    b.addEventListener("click", function () { setMode(b.getAttribute("data-mode")); });
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
      if (onScreen) start(); else stop();
    }, { threshold: 0.02 }).observe(hero);
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });

  if ("ResizeObserver" in window) new ResizeObserver(function () { resize(); }).observe(hero);
  else window.addEventListener("resize", resize);

  /* ---------- Boot ---------- */
  buildSprites();
  resize();
  if (reduceMotion) presimulate(900);
  else { presimulate(90); start(); }

  // Debug/screenshot hook: window.__bloodflow.sim(seconds)
  window.__bloodflow = { sim: function (sec) { presimulate(Math.round(sec * 60)); }, setMode: setMode };
})();

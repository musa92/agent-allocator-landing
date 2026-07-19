/* ═══════════════════════════════════════════════════════════
   Allocator.os — 3D scroll story (Three.js)
   A fixed WebGL particle field behind the page. As you scroll,
   ~5k particles morph through the portfolio-manager narrative:

     CHAPTER 1 · #research — the causal claim graph
       nodes + dependency edges in 3D; red blast-radius pulses
       travel downstream and get contained
     CHAPTER 2 · #system — the capital allocation
       six towers sized by verified marginal value; winners glow
       cyan, profit caps green, the laggard bleeds red
     CHAPTER 3 · #demo — one operating system
       everything converges into a single breathing core

   Scrubbed to scroll via GSAP ScrollTrigger, smoothed in-loop.
═══════════════════════════════════════════════════════════ */
'use strict';

(function scene3d() {
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (REDUCED || typeof THREE === 'undefined') return;
  var canvas = document.getElementById('gl');
  if (!canvas) return;

  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
  } catch (e) { return; }
  renderer.setPixelRatio(DPR);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(50, 1, 1, 800);
  camera.position.set(0, 0, 150);

  var COUNT = window.innerWidth < 760 ? 2600 : 5200;
  var mouse = { x: 0, y: 0 };

  /* soft round sprite */
  function makeSprite() {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    var tex = new THREE.Texture(c); tex.needsUpdate = true;
    return tex;
  }

  var BONE = [0.63, 0.61, 0.56], CYAN = [0.13, 0.83, 0.93], GREEN = [0.13, 0.77, 0.37], RED = [0.94, 0.27, 0.27];

  /* ── formations ─────────────────────────────────────── */
  var FORMS = 3;
  var pos = [], col = [];
  for (var f = 0; f < FORMS; f++) { pos.push(new Float32Array(COUNT * 3)); col.push(new Float32Array(COUNT * 3)); }
  var nodeOf = new Int16Array(COUNT);   // graph: node index (-1 = edge particle)
  var colOf = new Int8Array(COUNT);     // graph: column of particle
  var barOf = new Int8Array(COUNT);     // bars: bar index
  var seed = new Float32Array(COUNT);   // ambient wobble phase

  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 1.1; }
  function setV(arr, i, x, y, z) { arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z; }
  function setC(arr, i, c, k) { arr[i * 3] = c[0] * k; arr[i * 3 + 1] = c[1] * k; arr[i * 3 + 2] = c[2] * k; }

  /* chapter 1 — claim graph */
  var COLS = 5, nodes = [], edges = [];
  (function buildGraphMeta() {
    for (var c = 0; c < COLS; c++) {
      var n = 4 + (c % 2);
      for (var k = 0; k < n; k++) {
        nodes.push({
          col: c,
          x: -72 + c * 36 + (Math.random() - 0.5) * 10,
          y: -46 + (k + 0.5) * (92 / n) + (Math.random() - 0.5) * 12,
          z: (Math.random() - 0.5) * 46
        });
      }
    }
    nodes.forEach(function (a, ai) {
      var next = nodes.map(function (b, bi) { return { b: b, bi: bi }; })
        .filter(function (o) { return o.b.col === a.col + 1; })
        .sort(function (p, q) { return Math.abs(p.b.y - a.y) - Math.abs(q.b.y - a.y); });
      next.slice(0, 2).forEach(function (o) { edges.push([ai, o.bi]); });
    });
  })();

  /* chapter 2 — allocation towers.
     Height IS the number: 20 world-units per $1 of verified value
     produced per $1 spent, so VALUATION (3.3×) towers over MEMO (0.9×). */
  var BARS = 6;
  var BAR_D = [
    { n: 'INGEST',      vpd: 1.3, kind: 'dim'  },
    { n: 'HISTORICALS', vpd: 1.7, kind: 'bone' },
    { n: 'FORECAST',    vpd: 2.9, kind: 'cyan' },
    { n: 'VALUATION',   vpd: 3.3, kind: 'cyan' },
    { n: 'MEMO',        vpd: 0.9, kind: 'red'  },
    { n: 'AUDIT',       vpd: 2.0, kind: 'bone' }
  ];
  var barH = BAR_D.map(function (b) { return b.vpd * 20; });
  var barKind = BAR_D.map(function (b) { return b.kind; });
  var GRAPH_COLS = ['INGEST', 'HISTORICALS', 'FORECAST', 'VALUATION', 'MEMO'];

  for (var i = 0; i < COUNT; i++) {
    seed[i] = Math.random() * Math.PI * 2;

    /* — graph — */
    if (Math.random() < 0.8) {
      var ni = Math.floor(Math.random() * nodes.length);
      var nd = nodes[ni];
      nodeOf[i] = ni; colOf[i] = nd.col;
      setV(pos[0], i, nd.x + gauss() * 3.6, nd.y + gauss() * 3.6, nd.z + gauss() * 3.6);
      setC(col[0], i, Math.random() < 0.12 ? CYAN : BONE, 0.5 + Math.random() * 0.3);
    } else {
      var e = edges[Math.floor(Math.random() * edges.length)];
      var a = nodes[e[0]], b = nodes[e[1]], t = Math.random();
      nodeOf[i] = -1; colOf[i] = a.col;
      setV(pos[0], i, a.x + (b.x - a.x) * t + gauss(), a.y + (b.y - a.y) * t + gauss(), a.z + (b.z - a.z) * t + gauss());
      setC(col[0], i, BONE, 0.22 + Math.random() * 0.15);
    }

    /* — towers — */
    var bi = Math.floor(Math.random() * BARS);
    barOf[i] = bi;
    var h = barH[bi];
    var yf = Math.pow(Math.random(), 0.85);
    var bx = (bi - (BARS - 1) / 2) * 26;
    setV(pos[1], i, bx + (Math.random() - 0.5) * 10, -46 + yf * h, (Math.random() - 0.5) * 10);
    var kind = barKind[bi];
    if (yf > 0.86) setC(col[1], i, GREEN, 0.85);                      // profit caps
    else if (kind === 'cyan') setC(col[1], i, CYAN, 0.4 + yf * 0.45);
    else if (kind === 'red') setC(col[1], i, RED, 0.35 + yf * 0.3);
    else if (kind === 'dim') setC(col[1], i, BONE, 0.25);
    else setC(col[1], i, BONE, 0.45);

    /* — core — */
    var th = Math.acos(2 * Math.random() - 1), ph = Math.random() * Math.PI * 2;
    var rad = 30 * Math.pow(Math.random(), 0.55);
    setV(pos[2], i, rad * Math.sin(th) * Math.cos(ph), rad * Math.sin(th) * Math.sin(ph) * 0.85, rad * Math.cos(th));
    var inner = rad < 14;
    setC(col[2], i, inner ? CYAN : (Math.random() < 0.2 ? GREEN : BONE), inner ? 0.9 : 0.4 + Math.random() * 0.3);
  }

  /* ── geometry ───────────────────────────────────────── */
  var geo = new THREE.BufferGeometry();
  var curPos = new Float32Array(pos[0]);
  var curCol = new Float32Array(col[0]);
  geo.setAttribute('position', new THREE.BufferAttribute(curPos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(curCol, 3).setUsage(THREE.DynamicDrawUsage));
  var mat = new THREE.PointsMaterial({
    size: 2.1, map: makeSprite(), vertexColors: true, transparent: true,
    opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
  });
  var points = new THREE.Points(geo, mat);
  scene.add(points);

  /* ── scroll scrub ───────────────────────────────────── */
  var targetP = 0, smoothP = 0, glOpacity = 0, running = false;

  function ensureLoop() { if (!running && glOpacity > 0.01) { running = true; requestAnimationFrame(loop); } }

  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
    // fade the 3D layer in after the hero, out into the footer
    ScrollTrigger.create({
      trigger: '#research', start: 'top 95%', end: 'top 35%', scrub: true,
      onUpdate: function (self) { glOpacity = self.progress; canvas.style.opacity = glOpacity.toFixed(3); ensureLoop(); }
    });
    ScrollTrigger.create({
      trigger: '#contact', start: 'top 70%', end: 'top 20%', scrub: true,
      onUpdate: function (self) {
        /* hand the stage fully back to the globe for the ending */
        var v = 1 - self.progress;
        canvas.style.opacity = (glOpacity * v).toFixed(3);
      }
    });
    // the story: research → system → demo drives the morph
    ScrollTrigger.create({
      trigger: '#research', start: 'top 60%', endTrigger: '#demo', end: 'bottom 35%', scrub: true,
      onUpdate: function (self) { targetP = self.progress; ensureLoop(); }
    });
  } else {
    glOpacity = 1; canvas.style.opacity = '1';
    window.addEventListener('scroll', function () {
      var d = document.documentElement;
      targetP = Math.min(1, Math.max(0, (window.scrollY - window.innerHeight) / (d.scrollHeight - window.innerHeight * 2)));
      ensureLoop();
    }, { passive: true });
  }

  window.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX / window.innerWidth - 0.5;
    mouse.y = e.clientY / window.innerHeight - 0.5;
  }, { passive: true });

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  var smooth = function (t) { return t * t * (3 - 2 * t); };

  /* ── DOM label layer: numbers projected onto the particle field ── */
  var labelWrap = document.createElement('div');
  labelWrap.id = 'gl-labels';
  labelWrap.setAttribute('aria-hidden', 'true');
  document.body.appendChild(labelWrap);
  function mkLabel(html, cls) {
    var el = document.createElement('div');
    el.className = 'gl-label' + (cls ? ' ' + cls : '');
    el.innerHTML = html;
    labelWrap.appendChild(el);
    return el;
  }
  var graphLabels = GRAPH_COLS.map(function (n) { return mkLabel(n, 'dim'); });
  var graphCap = mkLabel('CLAIM GRAPH — EVERY CLAIM LINKED TO ITS BLAST RADIUS', 'dim');
  var pulseLabel = mkLabel('', 'red');
  var barLabels = BAR_D.map(function (b) {
    return mkLabel('<b>' + b.n + '</b><span>$' + b.vpd.toFixed(2) + ' VERIFIED / $1' +
      (b.kind === 'red' ? ' · ↓ BUDGET CUT' : b.kind === 'cyan' ? ' · ↑ +CAPITAL' : '') + '</span>',
      b.kind === 'red' ? 'red' : b.kind === 'cyan' ? 'cyan' : 'dim');
  });
  var barCap = mkLabel('TOWER HEIGHT = VERIFIED VALUE PER $1 SPENT · GREEN CAP = REALIZED P&amp;L', 'dim');
  var coreCap = mkLabel('<b>ONE OPERATING SYSTEM</b><span>6 AGENTS · $7.58 / VERIFIED RUN · 96.8% VERIFIED</span>', 'cyan');
  var V3 = new THREE.Vector3();
  function placeLabel(el, x, y, z, alpha) {
    if (alpha <= 0.04 || glOpacity <= 0.04) { el.style.opacity = '0'; return; }
    V3.set(x, y, z).applyEuler(points.rotation).multiplyScalar(points.scale.x).project(camera);
    if (V3.z > 1) { el.style.opacity = '0'; return; }
    var sx = (V3.x * 0.5 + 0.5) * window.innerWidth;
    var sy = (-V3.y * 0.5 + 0.5) * window.innerHeight;
    el.style.opacity = (alpha * glOpacity).toFixed(3);
    el.style.transform = 'translate(-50%,-50%) translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px)';
  }

  /* blast-radius pulse state (chapter 1) */
  var pulseCol = 0, pulseNode = 2, pulseT0 = 0;

  function loop(now) {
    if (!running) return;
    if (glOpacity <= 0.01 && smoothP === targetP) { running = false; renderer.render(scene, camera); return; }

    smoothP += (targetP - smoothP) * 0.07;
    var p = smoothP;
    var time = now * 0.001;

    /* which two formations are we between? */
    var fa, fb, t;
    if (p < 0.5) { fa = 0; fb = 1; t = smooth(Math.min(1, Math.max(0, p / 0.5))); }
    else { fa = 1; fb = 2; t = smooth(Math.min(1, Math.max(0, (p - 0.5) / 0.5))); }
    var graphW = p < 0.5 ? 1 - t : 0;
    var coreW = p >= 0.5 ? t : 0;

    /* blast pulse cycles while the graph is on stage */
    if (graphW > 0.35 && time - pulseT0 > 3.2) {
      pulseT0 = time;
      pulseNode = Math.floor(Math.random() * nodes.length);
      pulseCol = nodes[pulseNode].col;
    }
    var pt = time - pulseT0;

    var pa = pos[fa], pb = pos[fb], ca = col[fa], cb = col[fb];
    for (var i = 0; i < COUNT; i++) {
      var i3 = i * 3;
      var wob = Math.sin(time * 0.9 + seed[i]) * 0.7;
      var x = pa[i3] + (pb[i3] - pa[i3]) * t;
      var y = pa[i3 + 1] + (pb[i3 + 1] - pa[i3 + 1]) * t + wob;
      var z = pa[i3 + 2] + (pb[i3 + 2] - pa[i3 + 2]) * t;

      /* towers breathe while on stage */
      if (t > 0 && fb === 1) {
        y += Math.sin(time * 1.4 + barOf[i]) * 0.8 * t;
      } else if (fa === 1 && fb === 2 && t < 1) {
        y += Math.sin(time * 1.4 + barOf[i]) * 0.8 * (1 - t);
      }
      curPos[i3] = x; curPos[i3 + 1] = y; curPos[i3 + 2] = z;

      var r = ca[i3] + (cb[i3] - ca[i3]) * t;
      var g = ca[i3 + 1] + (cb[i3 + 1] - ca[i3 + 1]) * t;
      var b = ca[i3 + 2] + (cb[i3 + 2] - ca[i3 + 2]) * t;

      /* red blast radius travels downstream, then containment (fade back) */
      if (graphW > 0.05 && pt < 2.4) {
        var delay = (colOf[i] - pulseCol) * 0.28;
        var hit = (nodeOf[i] === pulseNode) || (colOf[i] > pulseCol && nodeOf[i] >= 0);
        if (hit && pt > delay) {
          var k = Math.max(0, 1 - (pt - delay) / 1.6) * graphW * (nodeOf[i] === pulseNode ? 1 : 0.45);
          r = r + (RED[0] - r) * k; g = g + (RED[1] - g) * k; b = b + (RED[2] - b) * k;
        }
      }
      curCol[i3] = r; curCol[i3 + 1] = g; curCol[i3 + 2] = b;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;

    /* camera + scene motion */
    points.rotation.y = p * 1.15 + time * (0.015 + coreW * 0.11);
    points.rotation.x = Math.sin(p * Math.PI) * 0.08;
    var pulse = 1 + coreW * Math.sin(time * 2.2) * 0.035;
    points.scale.set(pulse, pulse, pulse);
    camera.position.x += (mouse.x * 14 - camera.position.x) * 0.04;
    camera.position.y += (-mouse.y * 10 - camera.position.y) * 0.04;
    camera.position.z = 150 - coreW * 26;
    camera.lookAt(0, 0, 0);

    /* project the number labels onto the current formation */
    var barW = p < 0.5 ? t : 1 - t;
    for (var gl = 0; gl < GRAPH_COLS.length; gl++) {
      placeLabel(graphLabels[gl], -72 + gl * 36, -56, 0, graphW * 0.8);
    }
    placeLabel(graphCap, 0, -70, 0, graphW * 0.6);
    if (graphW > 0.3 && pt < 2.4) {
      var down = 0;
      for (var dn = 0; dn < nodes.length; dn++) if (nodes[dn].col > pulseCol) down++;
      pulseLabel.innerHTML = 'BLAST RADIUS — ' + down + ' CLAIMS DOWNSTREAM · HALTED';
      placeLabel(pulseLabel, nodes[pulseNode].x, nodes[pulseNode].y + 12, nodes[pulseNode].z, graphW * Math.max(0, 1 - pt / 2.4));
    } else pulseLabel.style.opacity = '0';
    for (var bl = 0; bl < BARS; bl++) {
      placeLabel(barLabels[bl], (bl - (BARS - 1) / 2) * 26, -46 + barH[bl] + 12, 0, barW * 0.9);
    }
    placeLabel(barCap, 0, -60, 0, barW * 0.65);
    placeLabel(coreCap, 0, -46, 0, coreW * 0.85);

    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
})();

/* ═══════════════════════════════════════════════════════════
   Allocator.os — GLOBE HERO (Three.js)
   A real dotted Earth: continents sampled from a topology map
   (graceful fallback to a uniform dot sphere), graticule rings,
   atmosphere glow. Six portfolio agents pinned to real financial
   centers — New York, London, Frankfurt, Tokyo, Singapore,
   San Francisco — trading capital along great-circle arcs with
   live per-agent P&L in their labels.

   Scroll choreography (one fixed canvas, three phases):
     · hero pin      — dive through the surface; inside, the
                       agents talk via chords + message bubbles
     · mid sections  — globe sleeps (opacity 0, no wasted GPU)
     · page end      — the globe returns: camera pulls back out
                       of the workforce to the full planet
═══════════════════════════════════════════════════════════ */
'use strict';

(function globeHero() {
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof THREE === 'undefined') return;
  var canvas = document.getElementById('flow-canvas');
  var msgLayer = document.getElementById('hero-msgs');
  if (!canvas) return;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
  } catch (e) { return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060607, 0.0038);
  var camera = new THREE.PerspectiveCamera(55, 1, 0.5, 700);
  camera.position.set(0, 0, 130);

  var world = new THREE.Group();
  scene.add(world);

  var R = 46;
  var small = window.innerWidth < 760;
  var mouse = { x: 0, y: 0 };
  var heroT = 0, heroP = 0, midT = 0, midF = 0, footT = 0, footP = 0;
  var canvasOp = 1;
  var pnl = 0, pnlShown = 0;
  var pnlEl = document.getElementById('live-pnl');

  function sprite(inner) {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(inner || 0.4, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    var t = new THREE.Texture(c); t.needsUpdate = true; return t;
  }
  var SPRITE = sprite();

  /* ── the planet ─────────────────────────────────────── */
  var DOTS = small ? 2200 : 4400;
  var globeGeo = new THREE.BufferGeometry();
  var globeMat = new THREE.PointsMaterial({
    size: 1.5, map: SPRITE, vertexColors: true, transparent: true, opacity: 0.6,
    depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending
  });

  function fibDir(i, n) {
    var y = 1 - (i / (n - 1)) * 2;
    var rad = Math.sqrt(1 - y * y);
    var th = i * 2.39996323;
    return new THREE.Vector3(Math.cos(th) * rad, y, Math.sin(th) * rad);
  }

  function fillSphere(dirs) {
    var pos = new Float32Array(DOTS * 3), col = new Float32Array(DOTS * 3);
    for (var i = 0; i < DOTS; i++) {
      var d = dirs ? dirs[i % dirs.length] : fibDir(i, DOTS);
      var jitter = dirs ? 0.006 : 0;
      pos[i * 3] = (d.x + (Math.random() - 0.5) * jitter) * R;
      pos[i * 3 + 1] = (d.y + (Math.random() - 0.5) * jitter) * R;
      pos[i * 3 + 2] = (d.z + (Math.random() - 0.5) * jitter) * R;
      var k = 0.5 + Math.random() * 0.5;
      var cyanish = Math.random() < 0.05;
      col[i * 3] = (cyanish ? 0.13 : 0.92) * k;
      col[i * 3 + 1] = (cyanish ? 0.83 : 0.91) * k;
      col[i * 3 + 2] = (cyanish ? 0.93 : 0.88) * k;
    }
    globeGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    globeGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    globeGeo.attributes.position.needsUpdate = true;
    globeGeo.attributes.color.needsUpdate = true;
  }
  fillSphere(null);
  world.add(new THREE.Points(globeGeo, globeMat));

  /* continents: sample a topology map; keep only land dots */
  (function loadContinents() {
    var urls = [
      'https://cdn.jsdelivr.net/npm/three-globe@2.31.1/example/img/earth-topology.png',
      'https://unpkg.com/three-globe@2.31.1/example/img/earth-topology.png'
    ];
    var img = new Image();
    img.crossOrigin = 'anonymous';
    var attempt = 0;
    img.onerror = function () { if (++attempt < urls.length) img.src = urls[attempt]; };
    img.onload = function () {
      try {
        var mc = document.createElement('canvas');
        var mw = 360, mh = 180;
        mc.width = mw; mc.height = mh;
        var mg = mc.getContext('2d');
        mg.drawImage(img, 0, 0, mw, mh);
        var data = mg.getImageData(0, 0, mw, mh).data;
        var land = [];
        var CAND = 26000;
        for (var i = 0; i < CAND && land.length < DOTS; i++) {
          var d = fibDir(i, CAND);
          var lat = Math.asin(d.y) * 180 / Math.PI;
          var lon = Math.atan2(d.z, -d.x) * 180 / Math.PI - 180;
          if (lon < -180) lon += 360;
          var px = Math.floor((lon + 180) / 360 * (mw - 1));
          var py = Math.floor((90 - lat) / 180 * (mh - 1));
          if (data[(py * mw + px) * 4] > 24) land.push(d);
        }
        if (land.length > DOTS * 0.25) fillSphere(land);
      } catch (e) { /* CORS or decode issue — uniform sphere stays */ }
    };
    img.src = urls[0];
  })();

  /* graticule rings */
  (function graticule() {
    var mat = new THREE.LineBasicMaterial({ color: 0xebe8e0, transparent: true, opacity: 0.05 });
    var lat;
    for (lat = -60; lat <= 60; lat += 30) {
      var r = R * Math.cos(lat * Math.PI / 180), y = R * Math.sin(lat * Math.PI / 180);
      var pts = [];
      for (var a = 0; a <= 64; a++) {
        var th = a / 64 * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r));
      }
      world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }
    for (var lon = 0; lon < 180; lon += 45) {
      var pts2 = [];
      for (var b = 0; b <= 64; b++) {
        var ph = b / 64 * Math.PI * 2;
        var v = new THREE.Vector3(Math.cos(ph) * R, Math.sin(ph) * R, 0);
        v.applyAxisAngle(new THREE.Vector3(0, 1, 0), lon * Math.PI / 180);
        pts2.push(v);
      }
      world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), mat));
    }
  })();

  /* atmosphere glow */
  var atmo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sprite(0.25), color: 0x22d3ee, transparent: true, opacity: 0.07,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  atmo.scale.set(R * 4.6, R * 4.6, 1);
  scene.add(atmo);

  /* ── agents at real financial centers ───────────────── */
  var AGENTS = [
    { name: 'VALUATION', city: 'NEW YORK', lat: 40.71, lon: -74.01, roi: 1.7, pnl: 0 },
    { name: 'FORECAST', city: 'LONDON', lat: 51.51, lon: -0.13, roi: 1.6, pnl: 0 },
    { name: 'HISTORICALS', city: 'FRANKFURT', lat: 50.11, lon: 8.68, roi: 1.1, pnl: 0 },
    { name: 'AUDIT', city: 'TOKYO', lat: 35.68, lon: 139.69, roi: 1.2, pnl: 0 },
    { name: 'INGEST', city: 'SINGAPORE', lat: 1.35, lon: 103.82, roi: 0.9, pnl: 0 },
    { name: 'MEMO', city: 'SAN FRANCISCO', lat: 37.77, lon: -122.42, roi: 1.0, pnl: 0 }
  ];
  function ll2v(lat, lon, r) {
    var phi = (90 - lat) * Math.PI / 180, theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
  }
  var agentPts = AGENTS.map(function (a) { return ll2v(a.lat, a.lon, R); });
  agentPts.forEach(function (v, i) {
    var m = new THREE.Sprite(new THREE.SpriteMaterial({
      map: SPRITE, color: i < 2 ? 0x22d3ee : 0xebe8e0,
      transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    m.position.copy(v); m.scale.set(6.5, 6.5, 1);
    world.add(m);
    var ring = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints((function () {
        var pts = [];
        for (var a = 0; a <= 32; a++) {
          var th = a / 32 * Math.PI * 2;
          pts.push(new THREE.Vector3(Math.cos(th) * 2.6, Math.sin(th) * 2.6, 0));
        }
        return pts;
      })()),
      new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.5 })
    );
    ring.position.copy(v.clone().multiplyScalar(1.004));
    ring.lookAt(v.clone().multiplyScalar(2));
    world.add(ring);
  });

  /* arcs (outside) + chords (inside) */
  var PAIRS = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[0,3],[1,4],[0,5]];
  var arcCurves = [], arcLines = [], chordLines = [];
  PAIRS.forEach(function (pr) {
    var a = agentPts[pr[0]], b = agentPts[pr[1]];
    var mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(R * (1.22 + a.distanceTo(b) / R * 0.16));
    var curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    arcCurves.push(curve);
    var line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)),
      new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.2 })
    );
    arcLines.push(line); world.add(line);
    var chord = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([a, b]),
      new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0 })
    );
    chordLines.push(chord); world.add(chord);
  });

  /* packets */
  var PACKETS = 14;
  var packets = [];
  var pGeo = new THREE.BufferGeometry();
  var pPos = new Float32Array(PACKETS * 3);
  var pCol = new Float32Array(PACKETS * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
  world.add(new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 3.2, map: SPRITE, vertexColors: true, transparent: true, opacity: 0.95,
    depthWrite: false, blending: THREE.AdditiveBlending
  })));
  for (var k = 0; k < PACKETS; k++) {
    packets.push({ arc: k % PAIRS.length, t: Math.random(), sp: 0.003 + Math.random() * 0.004, profit: k % 3 === 0 });
  }

  /* ── labels + conversations ─────────────────────────── */
  var labels = [], labelSpans = [];
  if (msgLayer) {
    AGENTS.forEach(function (a) {
      var el = document.createElement('div');
      el.className = 'g-label';
      el.innerHTML = '<b>' + a.name + '</b><span></span>';
      msgLayer.appendChild(el);
      labels.push(el);
      labelSpans.push(el.querySelector('span'));
    });
  }
  var lastLabelTick = 0;
  function tickLabels() {
    for (var i = 0; i < AGENTS.length; i++) {
      var a = AGENTS[i];
      labelSpans[i].textContent = a.city + ' · ' + a.roi.toFixed(1) + '× · $' + Math.round(a.pnl).toLocaleString('en-US');
    }
  }
  tickLabels();

  var CHATS = [
    ['FORECAST → VALUATION', 'rev drivers v2 attached', ''],
    ['INGEST → HISTORICALS', '10-K parsed · 312 tables', ''],
    ['AUDIT → VALUATION', '✓ DCF verified · +$14.20', 'ok'],
    ['VALUATION → AUDIT', 'sensitivity grid for review', ''],
    ['MEMO → AUDIT', 'draft memo — fact-check', ''],
    ['ALLOCATOR → FORECAST', 'budget +$120 · ROI 1.6×', 'ok'],
    ['AUDIT → ALLOCATOR', 'escalate: WACC uncertainty', 'warn'],
    ['HISTORICALS → FORECAST', '✓ ties reconciled', 'ok'],
    ['ALLOCATOR → MEMO', 'autonomy ▲ supervised→trusted', 'ok']
  ];
  var lastChat = 0;
  function spawnChat() {
    if (!msgLayer) return;
    var c = CHATS[Math.floor(Math.random() * CHATS.length)];
    var ai = Math.floor(Math.random() * agentPts.length);
    var sp = toScreen(agentPts[ai]);
    if (!sp) return;
    var el = document.createElement('div');
    el.className = 'g-msg' + (c[2] ? ' ' + c[2] : '');
    el.innerHTML = '<b>' + c[0] + '</b>' + c[1];
    el.style.left = Math.min(Math.max(sp.x, 100), window.innerWidth - 140) + 'px';
    el.style.top = sp.y + 'px';
    msgLayer.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('in'); });
    setTimeout(function () { el.classList.add('out'); }, 2600);
    setTimeout(function () { el.remove(); }, 3300);
  }

  var v3 = new THREE.Vector3();
  function toScreen(vec) {
    v3.copy(vec).applyMatrix4(world.matrixWorld).project(camera);
    if (v3.z > 1) return null;
    return { x: (v3.x * 0.5 + 0.5) * window.innerWidth, y: (-v3.y * 0.5 + 0.5) * window.innerHeight, z: v3.z };
  }

  /* ── scroll choreography ────────────────────────────── */
  var heroInner = document.querySelector('.hero-inner');
  var heroStrip = document.querySelector('.hero-strip');
  if (!REDUCED && typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.create({
      trigger: '#hero', start: 'top top', end: '+=1300',
      pin: true, scrub: true, anticipatePin: 1,
      onUpdate: function (self) { heroT = self.progress; }
    });
    /* globe sleeps through the middle of the page */
    ScrollTrigger.create({
      trigger: '.credo-band', start: 'top 92%', end: 'bottom 45%', scrub: true,
      onUpdate: function (self) { midT = self.progress; }
    });
    /* the ending: zoom back out to the planet */
    ScrollTrigger.create({
      trigger: '#contact', start: 'top 88%', end: 'bottom bottom', scrub: true,
      onUpdate: function (self) { footT = self.progress; }
    });
  }

  function smooth(t) { return t * t * (3 - 2 * t); }
  function clamp01(v) { return Math.min(1, Math.max(0, v)); }

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    small = w < 760;
  }
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX / window.innerWidth - 0.5;
    mouse.y = e.clientY / window.innerHeight - 0.5;
  }, { passive: true });
  resize();

  var GREEN = new THREE.Color(0x22c55e), CYAN = new THREE.Color(0x22d3ee);

  function frame(now) {
    var time = now * 0.001;
    heroP += (heroT - heroP) * 0.07;
    midF += (midT - midF) * 0.09;
    footP += (footT - footP) * 0.07;

    /* phase resolution: hero dive → sleep → ending zoom-out */
    var reentry = footP > 0.02;
    var dive = reentry ? clamp01(1 - footP) : heroP;
    canvasOp = reentry ? clamp01(footP * 1.6) : clamp01(1 - midF);
    canvas.style.opacity = canvasOp.toFixed(3);

    if (canvasOp < 0.01) {
      if (!REDUCED) requestAnimationFrame(frame);
      labels.forEach(function (l) { l.style.opacity = 0; });
      return;
    }

    var dv = smooth(dive);
    var insideW = clamp01((dive - 0.45) / 0.4);

    camera.position.z = 130 - dv * 122;
    camera.position.x += (mouse.x * 12 - camera.position.x) * 0.04;
    camera.position.y += (-mouse.y * 9 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);

    world.rotation.y = time * (0.045 - insideW * 0.028);
    globeMat.opacity = 0.6 - insideW * 0.45;
    atmo.material.opacity = 0.07 * (1 - insideW) * canvasOp;
    arcLines.forEach(function (l) { l.material.opacity = 0.2 * (1 - insideW); });
    chordLines.forEach(function (l, i) {
      l.material.opacity = insideW * (0.15 + 0.2 * Math.abs(Math.sin(time * 1.4 + i)));
    });

    for (var i = 0; i < PACKETS; i++) {
      var pk = packets[i];
      pk.t += pk.sp * (REDUCED ? 0 : 1);
      if (pk.t >= 1) {
        if (pk.profit) {
          var amt = 3 + Math.random() * 14;
          pnl += amt;
          AGENTS[PAIRS[pk.arc][1]].pnl += amt;
        }
        pk.t = 0; pk.arc = Math.floor(Math.random() * PAIRS.length);
        pk.profit = Math.random() < 0.35;
      }
      var pt;
      if (insideW > 0.5) {
        var pr = PAIRS[pk.arc];
        pt = agentPts[pr[0]].clone().lerp(agentPts[pr[1]], pk.t);
      } else {
        pt = arcCurves[pk.arc].getPoint(pk.t);
      }
      pPos[i * 3] = pt.x; pPos[i * 3 + 1] = pt.y; pPos[i * 3 + 2] = pt.z;
      var col = pk.profit ? GREEN : CYAN;
      pCol[i * 3] = col.r; pCol[i * 3 + 1] = col.g; pCol[i * 3 + 2] = col.b;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;

    if (heroInner) heroInner.style.opacity = clamp01(1 - heroP * 2.1).toFixed(3);
    if (heroStrip) heroStrip.style.opacity = clamp01(1 - (heroP - 0.35) * 2.4).toFixed(3);

    /* labels: only meaningful during the hero phase (the pinned viewport) */
    world.updateMatrixWorld();
    var labelPhase = reentry ? 0 : canvasOp;
    if (time - lastLabelTick > 0.8) { lastLabelTick = time; tickLabels(); }
    for (var li = 0; li < labels.length; li++) {
      var sp2 = toScreen(agentPts[li]);
      var el = labels[li];
      if (!sp2 || labelPhase < 0.05) { el.style.opacity = 0; continue; }
      var facing = 1;
      if (insideW < 0.5) {
        v3.copy(agentPts[li]).applyMatrix4(world.matrixWorld).normalize();
        facing = v3.z > 0.12 ? 1 : 0;
      }
      el.style.opacity = (facing * (0.4 + insideW * 0.6) * labelPhase).toFixed(2);
      el.style.left = sp2.x + 'px';
      el.style.top = sp2.y + 'px';
    }

    if (!REDUCED && !reentry && insideW > 0.6 && time - lastChat > 1.1) {
      lastChat = time; spawnChat();
    }

    if (pnlEl) {
      pnlShown += (pnl - pnlShown) * 0.08;
      pnlEl.textContent = '$' + Math.round(pnlShown).toLocaleString('en-US');
    }

    renderer.render(scene, camera);
    if (!REDUCED) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

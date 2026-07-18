/* ═══════════════════════════════════════════════════════════
   Allocator.os — GLOBE HERO (Three.js)
   The swarm is now a planet: ~3,200 dots form a rotating globe,
   six portfolio agents sit on its surface trading capital along
   arcs (cyan out, green verified P&L back — the live counter in
   the hero strip ticks from real packet arrivals).

   Scroll: the hero pins and the camera DIVES THROUGH THE SURFACE.
   Inside the globe you find the workforce talking — chord lines
   pulse between agents and message bubbles float up:
   "FORECAST → VALUATION · rev drivers v2", "AUDIT ✓ +$14.20"…
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
  scene.fog = new THREE.FogExp2(0x060607, 0.0042);
  var camera = new THREE.PerspectiveCamera(55, 1, 0.5, 600);
  camera.position.set(0, 0, 130);

  var world = new THREE.Group();
  scene.add(world);

  var R = 46;
  var small = window.innerWidth < 760;
  var mouse = { x: 0, y: 0 };
  var targetP = 0, p = 0;
  var pnl = 0, pnlShown = 0;
  var pnlEl = document.getElementById('live-pnl');

  function sprite() {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    var t = new THREE.Texture(c); t.needsUpdate = true; return t;
  }
  var SPRITE = sprite();

  /* ── the planet of dots ── */
  var DOTS = small ? 1600 : 3200;
  (function buildPlanet() {
    var pos = new Float32Array(DOTS * 3);
    for (var i = 0; i < DOTS; i++) {
      var y = 1 - (i / (DOTS - 1)) * 2;
      var rad = Math.sqrt(1 - y * y);
      var th = i * 2.39996323;
      pos[i * 3] = Math.cos(th) * rad * R;
      pos[i * 3 + 1] = y * R;
      pos[i * 3 + 2] = Math.sin(th) * rad * R;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    globeMat = new THREE.PointsMaterial({
      size: 1.5, map: SPRITE, color: 0xebe8e0, transparent: true, opacity: 0.55,
      depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending
    });
    world.add(new THREE.Points(g, globeMat));
  })();
  var globeMat;

  /* ── agents on the surface ── */
  var AGENTS = [
    { name: 'INGEST', lat: 20, lon: -40, roi: '0.9×' },
    { name: 'HISTORICALS', lat: 38, lon: 62, roi: '1.1×' },
    { name: 'FORECAST', lat: -12, lon: 128, roi: '1.6×' },
    { name: 'VALUATION', lat: -32, lon: -104, roi: '1.7×' },
    { name: 'MEMO', lat: 52, lon: 172, roi: '1.0×' },
    { name: 'AUDIT', lat: -46, lon: 18, roi: '1.2×' }
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
      map: SPRITE, color: i === 2 || i === 3 ? 0x22d3ee : 0xebe8e0,
      transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    m.position.copy(v);
    m.scale.set(6.5, 6.5, 1);
    world.add(m);
  });

  /* ── arcs (outside) + chords (inside) between agents ── */
  var PAIRS = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[0,3],[1,4]];
  var arcCurves = [], arcLines = [], chordLines = [];
  PAIRS.forEach(function (pr) {
    var a = agentPts[pr[0]], b = agentPts[pr[1]];
    var mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(R * 1.38);
    var curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    arcCurves.push(curve);
    var geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(42));
    var mat = new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.22 });
    var line = new THREE.Line(geo, mat);
    arcLines.push(line); world.add(line);

    var cgeo = new THREE.BufferGeometry().setFromPoints([a, b]);
    var cmat = new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0 });
    var chord = new THREE.Line(cgeo, cmat);
    chordLines.push(chord); world.add(chord);
  });

  /* ── packets riding arcs/chords ── */
  var PACKETS = 12;
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

  /* ── HTML labels + conversation bubbles ── */
  var labels = [];
  if (msgLayer) {
    AGENTS.forEach(function (a) {
      var el = document.createElement('div');
      el.className = 'g-label';
      el.innerHTML = '<b>' + a.name + '</b><span>' + a.roi + '</span>';
      msgLayer.appendChild(el);
      labels.push(el);
    });
  }
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
  function spawnChat(now) {
    if (!msgLayer) return;
    var c = CHATS[Math.floor(Math.random() * CHATS.length)];
    var ai = Math.floor(Math.random() * agentPts.length);
    var el = document.createElement('div');
    el.className = 'g-msg' + (c[2] ? ' ' + c[2] : '');
    el.innerHTML = '<b>' + c[0] + '</b>' + c[1];
    var sp = toScreen(agentPts[ai]);
    if (!sp) return;
    el.style.left = Math.min(Math.max(sp.x, 90), window.innerWidth - 130) + 'px';
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

  /* ── scroll: pin the hero, dive inside ── */
  var heroInner = document.querySelector('.hero-inner');
  var heroStrip = document.querySelector('.hero-strip');
  if (!REDUCED && typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.create({
      trigger: '#hero', start: 'top top', end: '+=1300',
      pin: true, scrub: true, anticipatePin: 1,
      onUpdate: function (self) { targetP = self.progress; }
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
    p += (targetP - p) * 0.07;
    var dive = smooth(p);
    var insideW = clamp01((p - 0.45) / 0.4);

    /* camera dive: 130 → 8 (through the shell at ~R) */
    camera.position.z = 130 - dive * 122;
    camera.position.x += (mouse.x * 12 - camera.position.x) * 0.04;
    camera.position.y += (-mouse.y * 9 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);

    world.rotation.y = time * (0.05 - insideW * 0.03);

    /* shell dissolves as you enter; conversations light up */
    globeMat.opacity = 0.55 - insideW * 0.4;
    arcLines.forEach(function (l) { l.material.opacity = 0.22 * (1 - insideW); });
    chordLines.forEach(function (l, i) {
      l.material.opacity = insideW * (0.16 + 0.22 * Math.abs(Math.sin(time * 1.4 + i)));
    });

    /* packets */
    for (var i = 0; i < PACKETS; i++) {
      var pk = packets[i];
      pk.t += pk.sp * (REDUCED ? 0 : 1);
      if (pk.t >= 1) {
        if (pk.profit) { pnl += 3 + Math.random() * 14; }
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

    /* hero copy fades as you dive; strip lingers a bit longer */
    if (heroInner) heroInner.style.opacity = clamp01(1 - p * 2.1).toFixed(3);
    if (heroStrip) heroStrip.style.opacity = clamp01(1 - (p - 0.35) * 2.4).toFixed(3);

    /* agent labels track their 3D anchors */
    world.updateMatrixWorld();
    for (var li = 0; li < labels.length; li++) {
      var sp2 = toScreen(agentPts[li]);
      var el = labels[li];
      if (!sp2) { el.style.opacity = 0; continue; }
      var facing = 1;
      if (insideW < 0.5) {
        v3.copy(agentPts[li]).applyMatrix4(world.matrixWorld).normalize();
        facing = v3.z > 0.12 ? 1 : 0;
      }
      var vis = facing * (0.35 + insideW * 0.65);
      el.style.opacity = vis.toFixed(2);
      el.style.left = sp2.x + 'px';
      el.style.top = sp2.y + 'px';
    }

    /* conversations while inside */
    if (!REDUCED && insideW > 0.6 && time - lastChat > 1.1) {
      lastChat = time; spawnChat(now);
    }

    /* live P&L */
    if (pnlEl) {
      pnlShown += (pnl - pnlShown) * 0.08;
      pnlEl.textContent = '$' + Math.round(pnlShown).toLocaleString('en-US');
    }

    renderer.render(scene, camera);
    if (!REDUCED) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

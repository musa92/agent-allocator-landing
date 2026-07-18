/* ═══════════════════════════════════════════════════════════
   Allocator.os — THE SHIFT · pinned scroll story
   Token economy → agent economy, in five scrubbed stages:

     S1 PROMPT        one call, one answer
     S2 TOKEN ROUTER  fan-out, routed by $/M tokens (OpenRouter's world)
     S3 WORKFLOWS     chained calls, silent error bleeding downstream
     S4 BG AGENTS     unsupervised swarms, ×100 inference
     S5 AGENT ECONOMY the allocator — routed by verified marginal value

   One particle set morphs through all five formations while the
   section is pinned; stage copy, rail, and captions follow scroll.
═══════════════════════════════════════════════════════════ */
'use strict';

(function shiftStory() {
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canvas = document.getElementById('shift-canvas');
  if (!canvas || REDUCED || typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  var ctx = canvas.getContext('2d');
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0, small = false;
  var MONO = '"Space Mono", monospace';
  var BONE = '235,232,224', CYAN = '34,211,238', GREEN = '34,197,94', RED = '239,68,68';

  var N = window.innerWidth < 760 ? 380 : 640;
  var meta = [];           // per particle, per stage placement meta
  var cur = [];            // current x,y
  var sFloat = 0, target = 0, running = false;

  var stagesEls = Array.prototype.slice.call(document.querySelectorAll('.shift-stage'));
  var railEls = Array.prototype.slice.call(document.querySelectorAll('.sr-item'));
  var railFill = document.getElementById('sr-fill');

  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 1.1; }

  /* geometry anchors, recomputed on resize */
  var G = {};
  function layout() {
    W = canvas.offsetWidth; H = canvas.offsetHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    small = W < 760;
    var vy = small ? 0.32 : 0.46;            // visual band center
    G.promptA = { x: W * (small ? 0.22 : 0.44), y: H * vy };
    G.promptB = { x: W * (small ? 0.78 : 0.74), y: H * vy };
    G.src = { x: W * (small ? 0.18 : 0.42), y: H * vy };
    G.models = [];
    for (var k = 0; k < 6; k++) {
      G.models.push({ x: W * (small ? 0.80 : 0.80), y: H * ((small ? 0.12 : 0.20) + k * (small ? 0.072 : 0.092)) });
    }
    G.chain = [];
    for (var c = 0; c < 5; c++) {
      G.chain.push({ x: W * ((small ? 0.16 : 0.42) + c * (small ? 0.16 : 0.098)), y: H * (vy + Math.sin(c * 1.7) * 0.055) });
    }
    G.swarms = [
      { x: W * (small ? 0.28 : 0.47), y: H * (vy - 0.13) },
      { x: W * (small ? 0.72 : 0.70), y: H * (vy - 0.17) },
      { x: W * (small ? 0.80 : 0.82), y: H * (vy + 0.09) },
      { x: W * (small ? 0.34 : 0.56), y: H * (vy + 0.15) }
    ];
    G.core = { x: W * (small ? 0.5 : 0.63), y: H * (vy - 0.02) };
    G.ringR = Math.min(W, H) * (small ? 0.19 : 0.21);
    build();
  }

  var PRICES = ['$14.60/M', '$6.20/M', '$2.80/M', '$0.90/M', '$3.40/M', '$8.10/M'];
  var CHEAP = 3;

  function build() {
    meta = []; cur = [];
    for (var i = 0; i < N; i++) {
      var m = { seed: Math.random() * Math.PI * 2 };

      /* S1 prompt */
      var r0 = Math.random();
      if (r0 < 0.22) m.s0 = { x: G.promptA.x + gauss() * 9, y: G.promptA.y + gauss() * 9, c: BONE, a: 0.75 };
      else if (r0 < 0.44) m.s0 = { x: G.promptB.x + gauss() * 9, y: G.promptB.y + gauss() * 9, c: CYAN, a: 0.8 };
      else {
        var t0 = Math.random();
        m.s0 = { x: G.promptA.x + (G.promptB.x - G.promptA.x) * t0, y: G.promptA.y + gauss() * 2.2, c: BONE, a: 0.3 };
      }

      /* S2 token router */
      var r1 = Math.random();
      if (r1 < 0.2) m.s1 = { x: G.src.x + gauss() * 10, y: G.src.y + gauss() * 10, c: BONE, a: 0.7 };
      else if (r1 < 0.62) {
        var e = Math.random() < 0.45 ? CHEAP : Math.floor(Math.random() * 6);
        var t1 = Math.random(), md = G.models[e];
        m.s1 = {
          x: G.src.x + (md.x - G.src.x) * t1 + gauss() * 1.6,
          y: G.src.y + (md.y - G.src.y) * t1 + gauss() * 1.6,
          c: e === CHEAP ? CYAN : BONE, a: e === CHEAP ? 0.75 : 0.16
        };
      } else {
        var e2 = Math.random() < 0.4 ? CHEAP : Math.floor(Math.random() * 6);
        var md2 = G.models[e2];
        m.s1 = { x: md2.x + gauss() * 6, y: md2.y + gauss() * 6, c: e2 === CHEAP ? CYAN : BONE, a: e2 === CHEAP ? 0.85 : 0.3 };
      }

      /* S3 workflow chain — node 2 is the silent error */
      var r2 = Math.random();
      var ci = Math.floor(Math.random() * 5);
      if (r2 < 0.6) {
        var poisoned = ci >= 2;
        m.s2 = {
          x: G.chain[ci].x + gauss() * 7, y: G.chain[ci].y + gauss() * 7,
          c: ci === 2 ? RED : poisoned ? RED : BONE,
          a: ci === 2 ? 0.8 : poisoned ? 0.34 : 0.6
        };
      } else {
        var ca = Math.min(3, Math.floor(Math.random() * 4)), cb = ca + 1, t2 = Math.random();
        m.s2 = {
          x: G.chain[ca].x + (G.chain[cb].x - G.chain[ca].x) * t2,
          y: G.chain[ca].y + (G.chain[cb].y - G.chain[ca].y) * t2 + gauss() * 1.6,
          c: ca >= 2 ? RED : BONE, a: ca >= 2 ? 0.2 : 0.26
        };
      }

      /* S4 background swarms — dynamic orbits */
      m.s3 = {
        k: Math.floor(Math.random() * 4),
        rad: 8 + Math.random() * 34,
        sp: (0.25 + Math.random() * 0.7) * (Math.random() < 0.5 ? 1 : -1),
        c: Math.random() < 0.2 ? CYAN : BONE,
        a: 0.2 + Math.random() * 0.4
      };

      /* S5 allocator — core + 6 clusters, dynamic */
      var r4 = Math.random();
      if (r4 < 0.2) {
        m.s4 = { core: true, rad: 4 + Math.random() * 16, sp: 0.4 + Math.random() * 0.5, c: CYAN, a: 0.7 };
      } else {
        var kk = Math.floor(Math.random() * 6);
        m.s4 = {
          core: false, k: kk,
          rad: 5 + Math.random() * 16,
          sp: (0.35 + Math.random() * 0.8) * (Math.random() < 0.5 ? 1 : -1),
          c: Math.random() < 0.14 ? GREEN : (Math.random() < 0.2 ? CYAN : BONE),
          a: 0.3 + Math.random() * 0.45
        };
      }

      meta.push(m);
      cur.push({ x: m.s0.x, y: m.s0.y });
    }
  }

  function stageTarget(s, m, time) {
    if (s === 0) return m.s0;
    if (s === 1) return m.s1;
    if (s === 2) return m.s2;
    if (s === 3) {
      var c = G.swarms[m.s3.k], a3 = m.seed + time * m.s3.sp;
      return { x: c.x + Math.cos(a3) * m.s3.rad, y: c.y + Math.sin(a3) * m.s3.rad * 0.8, c: m.s3.c, a: m.s3.a };
    }
    if (m.s4.core) {
      var a4 = m.seed + time * m.s4.sp;
      return { x: G.core.x + Math.cos(a4) * m.s4.rad, y: G.core.y + Math.sin(a4) * m.s4.rad * 0.85, c: m.s4.c, a: m.s4.a };
    }
    var ang = -Math.PI / 2 + m.s4.k * (Math.PI * 2 / 6) + 0.3;
    var cc = { x: G.core.x + Math.cos(ang) * G.ringR, y: G.core.y + Math.sin(ang) * G.ringR * 0.78 };
    var a5 = m.seed + time * m.s4.sp;
    return { x: cc.x + Math.cos(a5) * m.s4.rad, y: cc.y + Math.sin(a5) * m.s4.rad * 0.8, c: m.s4.c, a: m.s4.a };
  }

  function smooth(t) { return t * t * (3 - 2 * t); }

  /* ── captions & chrome per stage ── */
  function label(text, x, y, rgb, alpha, size, bold, align) {
    if (alpha <= 0.02) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(' + rgb + ',0.85)';
    ctx.font = (bold ? '700 ' : '') + (size || 9) + 'px ' + MONO;
    ctx.textAlign = align || 'center';
    ctx.fillText(text, x, y);
    ctx.globalAlpha = 1;
  }

  function drawOverlay(s, alpha, time) {
    if (alpha <= 0.02) return;
    if (s === 0) {
      label('PROMPT', G.promptA.x, G.promptA.y + 30, BONE, alpha * 0.7, 9, true);
      label('ANSWER', G.promptB.x, G.promptB.y + 30, CYAN, alpha * 0.7, 9, true);
      label('STATELESS · PAY PER CALL', (G.promptA.x + G.promptB.x) / 2, G.promptA.y + 64, BONE, alpha * 0.4, 8.5);
    } else if (s === 1) {
      ctx.globalAlpha = alpha;
      for (var k = 0; k < 6; k++) {
        var md = G.models[k], cheap = k === CHEAP;
        ctx.strokeStyle = cheap ? 'rgba(' + CYAN + ',0.5)' : 'rgba(' + BONE + ',0.08)';
        ctx.lineWidth = cheap ? 1.4 : 1;
        ctx.beginPath(); ctx.moveTo(G.src.x, G.src.y); ctx.lineTo(md.x, md.y); ctx.stroke();
        label('MODEL-' + String.fromCharCode(65 + k) + ' · ' + PRICES[k], md.x + 14, md.y + 3,
          cheap ? CYAN : BONE, alpha * (cheap ? 0.9 : 0.4), 8.5, cheap, 'left');
      }
      ctx.globalAlpha = 1;
      label('REQUEST', G.src.x, G.src.y + 30, BONE, alpha * 0.7, 9, true);
      label('ROUTED BY PRICE — NO MEMORY OF OUTCOMES', G.src.x, G.src.y + 66, BONE, alpha * 0.45, 8.5, false, small ? 'center' : 'left');
      label('← ROUTED', G.models[CHEAP].x - 16, G.models[CHEAP].y - 12, CYAN, alpha * 0.8, 8.5, true, 'right');
    } else if (s === 2) {
      ctx.globalAlpha = alpha;
      for (var c = 0; c < 4; c++) {
        var A = G.chain[c], B = G.chain[c + 1];
        ctx.strokeStyle = c >= 2 ? 'rgba(' + RED + ',0.25)' : 'rgba(' + BONE + ',0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      label('SILENT ERROR', G.chain[2].x, G.chain[2].y - 22, RED, alpha * (0.5 + 0.4 * Math.abs(Math.sin(time * 2.4))), 8.5, true);
      label('…POISONS EVERYTHING DOWNSTREAM', G.chain[3].x, G.chain[4].y + 36, RED, alpha * 0.5, 8.5);
    } else if (s === 3) {
      for (var w = 0; w < 4; w++) {
        label('AGENT-' + (w + 1), G.swarms[w].x, G.swarms[w].y + 52, BONE, alpha * 0.4, 8);
      }
      label('UNSUPERVISED · ×10–100 INFERENCE · VALUE UNMEASURED',
        small ? W / 2 : G.core.x, H * (small ? 0.55 : 0.72), BONE, alpha * 0.5, 8.5);
    } else if (s === 4) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = 'rgba(' + BONE + ',0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(G.core.x, G.core.y, 24, 0, 7); ctx.stroke();
      ctx.strokeStyle = 'rgba(' + CYAN + ',0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(G.core.x, G.core.y, 24, time * 1.3, time * 1.3 + Math.PI * 0.6); ctx.stroke();
      ctx.globalAlpha = 1;
      label('ALLOCATOR', G.core.x, G.core.y + 44, BONE, alpha * 0.75, 9, true);
      var tick = Math.floor(time * 0.9) % 6;
      var angT = -Math.PI / 2 + tick * (Math.PI * 2 / 6) + 0.3;
      var tx = G.core.x + Math.cos(angT) * G.ringR, ty = G.core.y + Math.sin(angT) * G.ringR * 0.78;
      label('+$' + (4 + tick * 3.7).toFixed(2) + ' VERIFIED', tx, ty - 30, GREEN, alpha * 0.85, 8.5, true);
      label('ROUTED BY VERIFIED MARGINAL VALUE', G.core.x, H * (small ? 0.58 : 0.78), CYAN, alpha * 0.6, 8.5, true);
    }
  }

  function frame(now) {
    if (!running) return;
    var time = now * 0.001;
    ctx.clearRect(0, 0, W, H);

    sFloat += (target - sFloat) * 0.08;
    var s = Math.max(0, Math.min(3.999, sFloat));
    var fa = Math.floor(s), fb = Math.min(4, fa + 1);
    var t = smooth(s - fa);

    /* particles */
    for (var i = 0; i < N; i++) {
      var m = meta[i];
      var A = stageTarget(fa, m, time), B = stageTarget(fb, m, time);
      var x = A.x + (B.x - A.x) * t + Math.sin(time + m.seed) * 0.8;
      var y = A.y + (B.y - A.y) * t + Math.cos(time * 0.8 + m.seed) * 0.8;
      cur[i].x = x; cur[i].y = y;
      var col = t < 0.5 ? A.c : B.c;
      var al = (A.a + (B.a - A.a) * t);
      ctx.fillStyle = 'rgba(' + col + ',' + al.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x, y, 1.4, 0, 7); ctx.fill();
    }

    drawOverlay(fa, 1 - t, time);
    drawOverlay(fb, t, time);

    /* stage copy + rail */
    var active = Math.round(s);
    for (var k = 0; k < stagesEls.length; k++) {
      var w = Math.max(0, 1 - Math.abs(s - k) * 1.7);
      stagesEls[k].style.opacity = w.toFixed(3);
      stagesEls[k].style.transform = 'translateY(' + ((1 - w) * 18).toFixed(1) + 'px)';
    }
    railEls.forEach(function (el, k) { el.classList.toggle('on', k === active); });
    if (railFill) railFill.style.width = ((s / 4) * 100).toFixed(2) + '%';

    requestAnimationFrame(frame);
  }

  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.create({
    trigger: '.shift-pin',
    start: 'top top',
    end: '+=' + (window.innerHeight * 4),
    pin: true,
    scrub: true,
    anticipatePin: 1,
    onUpdate: function (self) { target = self.progress * 4; },
    onToggle: function (self) {
      if (self.isActive && !running) { running = true; requestAnimationFrame(frame); }
      else if (!self.isActive) running = false;
    }
  });

  window.addEventListener('resize', layout, { passive: true });
  layout();
  /* render one static frame so the section isn't empty pre-scrub */
  running = true; requestAnimationFrame(function (n) { frame(n); running = false; });
})();

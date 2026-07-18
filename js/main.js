/* ═══════════════════════════════════════════════════════════
   Allocator.os — interactions
   Lenis↔ScrollTrigger · SplitType reveals · magnetic buttons ·
   count-up · vanilla-tilt · CANVAS: agent swarms running a portfolio
═══════════════════════════════════════════════════════════ */
'use strict';

var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var COARSE  = window.matchMedia('(pointer: coarse)').matches;
if (REDUCED) document.body.classList.add('no-motion');

/* ── Preloader ── */
(function preloader() {
  var el = document.getElementById('preloader');
  var fill = el && el.querySelector('.pre-fill');
  if (!el) return;
  var p = 0;
  var t = setInterval(function () {
    p = Math.min(100, p + (8 + (100 - p) * 0.06));
    if (fill) fill.style.width = p + '%';
    if (p >= 99.5) {
      clearInterval(t);
      setTimeout(function () {
        el.classList.add('done');
        document.body.classList.add('loaded');
        window.dispatchEvent(new Event('al:loaded'));
      }, 240);
    }
  }, 70);
})();

/* ── Nav ── */
(function nav() {
  var bar = document.getElementById('nav');
  var burger = document.querySelector('.nav-burger');
  var menu = document.getElementById('mobile-menu');
  function onScroll() { if (bar) bar.classList.toggle('scrolled', window.scrollY > 24); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if (burger && menu) {
    burger.addEventListener('click', function () {
      var open = burger.classList.toggle('open');
      menu.classList.toggle('open');
      burger.setAttribute('aria-expanded', open);
    });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        burger.classList.remove('open'); menu.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }
})();

/* ── Lenis smooth scroll, synced with GSAP ── */
var lenis = null;
(function smooth() {
  if (typeof Lenis === 'undefined' || REDUCED) return;
  lenis = new Lenis({ duration: 1.1, smoothWheel: true });
  lenis.on('scroll', function () { if (window.ScrollTrigger) ScrollTrigger.update(); });
  gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
  gsap.ticker.lagSmoothing(0);
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -70 });
    });
  });
})();

/* ── GSAP reveals ── */
(function reveals() {
  if (typeof gsap === 'undefined') {
    document.querySelectorAll('[data-reveal],[data-split]').forEach(function (el) {
      el.style.opacity = 1; el.style.transform = 'none'; el.classList.add('in');
    });
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  document.querySelectorAll('[data-split]').forEach(function (el) {
    var split = null;
    if (typeof SplitType !== 'undefined' && !REDUCED) {
      split = new SplitType(el, { types: 'lines,words', lineClass: 'line', wordClass: 'word' });
    }
    el.classList.add('in');
    if (!split || !split.words || !split.words.length) return;
    gsap.fromTo(split.words,
      { yPercent: 112 },
      {
        yPercent: 0, duration: 0.9, ease: 'power4.out', stagger: 0.045,
        scrollTrigger: { trigger: el, start: 'top 86%' },
        delay: el.closest('#hero') ? 0.35 : 0
      });
  });

  document.querySelectorAll('[data-reveal]').forEach(function (el, i) {
    if (REDUCED) { el.style.opacity = 1; el.style.transform = 'none'; return; }
    gsap.to(el, {
      opacity: 1, y: 0, duration: 0.85, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%' },
      delay: el.closest('#hero') ? 0.25 + (i % 5) * 0.08 : 0
    });
  });

  var demo = document.querySelector('.demo-panel');
  if (demo) {
    ScrollTrigger.create({
      trigger: demo, start: 'top 78%',
      onEnter: function () { demo.classList.add('in-view'); }
    });
  }

  document.querySelectorAll('[data-count]').forEach(function (el) {
    var end = parseFloat(el.dataset.count);
    var prefix = el.dataset.prefix || '';
    var suffix = el.dataset.suffix || '';
    if (REDUCED) { el.textContent = prefix + end + suffix; return; }
    var obj = { v: 0 };
    gsap.to(obj, {
      v: end, duration: 1.6, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 92%' },
      onUpdate: function () { el.textContent = prefix + Math.round(obj.v) + suffix; },
      onComplete: function () { el.textContent = prefix + end + suffix; }
    });
  });
})();

/* ── vanilla-tilt on cards ── */
(function tilt() {
  if (typeof VanillaTilt === 'undefined' || COARSE || REDUCED) return;
  VanillaTilt.init(document.querySelectorAll('[data-tilt]'), {
    max: 5, speed: 900, perspective: 900, glare: true, 'max-glare': 0.06, gyroscope: false
  });
})();

/* ── magnetic buttons ── */
(function magnetic() {
  if (COARSE || REDUCED || typeof gsap === 'undefined') return;
  document.querySelectorAll('.magnetic').forEach(function (btn) {
    var strength = 18;
    btn.addEventListener('mousemove', function (e) {
      var r = btn.getBoundingClientRect();
      var x = (e.clientX - r.left - r.width / 2) / (r.width / 2);
      var y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
      gsap.to(btn, { x: x * strength, y: y * strength * 0.6, duration: 0.4, ease: 'power2.out' });
    });
    btn.addEventListener('mouseleave', function () {
      gsap.to(btn, { x: 0, y: 0, duration: 0.55, ease: 'elastic.out(1, 0.4)' });
    });
  });
})();

/* ═══════════════════════════════════════════════════════════
   HERO CANVAS — agent swarms running a portfolio.
   An allocator core streams capital (cyan) to six agent swarms;
   swarms boil, work, and return VERIFIED P&L (green). Autonomy
   promotions ring cyan; escaped errors flash red, get contained,
   revalidate amber, recover. Live P&L ticks in the hero strip.
═══════════════════════════════════════════════════════════ */
(function portfolioSwarm() {
  var canvas = document.getElementById('flow-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
  var mouse = { x: 0.5, y: 0.5 };
  var BONE = '235,232,224', CYAN = '34,211,238', GREEN = '34,197,94', RED = '239,68,68', AMBER = '245,158,11';
  var MONO = '"Space Mono", monospace';
  var small = false;

  var pnl = 0, budgetOut = 0;
  var pnlEl = document.getElementById('live-pnl');
  var pnlShown = 0;

  var AGENTS = [
    { name: 'INGEST',      roi: 0.9,  n: 10 },
    { name: 'HISTORICALS', roi: 1.1,  n: 12 },
    { name: 'FORECAST',    roi: 1.55, n: 16 },
    { name: 'VALUATION',   roi: 1.7,  n: 16 },
    { name: 'MEMO',        roi: 1.0,  n: 11 },
    { name: 'AUDIT',       roi: 1.2,  n: 12 }
  ];

  var core = { x: 0, y: 0, spin: 0, pulse: 0 };
  var clusters = [], packets = [], floaters = [];
  var lastAlloc = 0, lastEvent = 0, running = true;

  function resize() {
    W = canvas.offsetWidth; H = canvas.offsetHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    small = W < 820;
    layout();
  }

  function layout() {
    core.x = small ? W * 0.5 : W * 0.64;
    core.y = small ? H * 0.30 : H * 0.40;
    var R = small ? Math.min(W, H) * 0.34 : Math.min(W, H) * 0.335;
    clusters = AGENTS.map(function (a, i) {
      var ang = -Math.PI / 2 + (i / AGENTS.length) * Math.PI * 2 + 0.35;
      var c = {
        name: a.name, roi: a.roi, baseRoi: a.roi,
        ang: ang, dist: R * (0.86 + (i % 3) * 0.11),
        drift: (i % 2 ? 1 : -1) * 0.00003,
        x: 0, y: 0, r: small ? 13 : 17,
        energy: 0, pulse: 0, alert: 0, reval: 0, promote: 0, tier: i === 3 ? 'TRUSTED' : 'SUPERVISED',
        particles: []
      };
      var n = small ? Math.ceil(a.n * 0.6) : a.n;
      for (var k = 0; k < n; k++) {
        c.particles.push({
          a: Math.random() * Math.PI * 2,
          r: c.r * (0.7 + Math.random() * 1.9),
          sp: (0.004 + Math.random() * 0.012) * (Math.random() < 0.5 ? 1 : -1),
          wob: Math.random() * Math.PI * 2,
          size: 0.7 + Math.random() * 1.1
        });
      }
      return c;
    });
    packets = []; floaters = [];
  }

  function clusterPos(c, now) {
    c.ang += c.drift * 16;
    var wob = Math.sin(now * 0.0002 + c.ang * 5) * 6;
    c.x = core.x + Math.cos(c.ang) * (c.dist + wob);
    c.y = core.y + Math.sin(c.ang) * (c.dist * 0.72 + wob);
  }

  function ctrlPoint(ax, ay, bx, by, k) {
    var mx = (ax + bx) / 2, my = (ay + by) / 2;
    var dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    return { x: mx - (dy / len) * k, y: my + (dx / len) * k };
  }
  function quad(ax, ay, cx, cy, bx, by, t) {
    var u = 1 - t;
    return { x: u * u * ax + 2 * u * t * cx + t * t * bx, y: u * u * ay + 2 * u * t * cy + t * t * by };
  }

  function spawnAlloc(now) {
    // capital flows toward verified marginal value — weight by ROI
    var total = clusters.reduce(function (s, c) { return s + Math.max(0.2, c.roi); }, 0);
    var pick = Math.random() * total;
    var target = clusters[0];
    for (var i = 0; i < clusters.length; i++) {
      pick -= Math.max(0.2, clusters[i].roi);
      if (pick <= 0) { target = clusters[i]; break; }
    }
    if (target.alert > 0.3) return; // halted agents get no fresh capital
    var amt = 2 + Math.random() * 9;
    budgetOut += amt;
    packets.push({ kind: 'alloc', c: target, t: 0, speed: 0.010 + Math.random() * 0.008, amt: amt, k: 40 + Math.random() * 60 });
  }

  function spawnProfit(c, amt) {
    packets.push({ kind: 'profit', c: c, t: 0, speed: 0.008 + Math.random() * 0.007, amt: amt, k: -(40 + Math.random() * 60) });
  }

  function floater(x, y, text, rgb, sizePx) {
    floaters.push({ x: x, y: y, text: text, rgb: rgb, life: 1, size: sizePx || 10 });
  }

  function fireEvent(now) {
    var r = Math.random();
    var c = clusters[Math.floor(Math.random() * clusters.length)];
    if (r < 0.42 && c.alert <= 0) {
      // escaped error → containment → revalidation
      c.alert = 1; c.roi = Math.max(0.3, c.roi - 0.5);
      floater(c.x, c.y - c.r - 26, 'HALT — BLAST RADIUS FROZEN', RED, 9.5);
      setTimeout(function () {
        c.reval = 1;
        floater(c.x, c.y - c.r - 26, 'REVALIDATING…', AMBER, 9.5);
      }, 1500);
      setTimeout(function () {
        c.alert = 0; c.reval = 0; c.pulse = 1;
        floater(c.x, c.y - c.r - 26, 'CONTAINED ✓ CLAIMS RESTORED', GREEN, 9.5);
      }, 3400);
    } else if (r < 0.72) {
      c.promote = 1; c.tier = 'AUTONOMOUS';
      floater(c.x, c.y - c.r - 26, '▲ AUTONOMY EARNED', CYAN, 9.5);
      c.roi = c.baseRoi + 0.25;
    } else {
      var weakest = clusters.reduce(function (m, x) { return x.roi < m.roi ? x : m; }, clusters[0]);
      floater(weakest.x, weakest.y - weakest.r - 26, 'BUDGET REBALANCED →', BONE, 9.5);
      weakest.roi = Math.max(0.4, weakest.roi - 0.15);
      var best = clusters.reduce(function (m, x) { return x.roi > m.roi ? x : m; }, clusters[0]);
      best.roi += 0.12;
    }
  }

  function drawCore(now) {
    core.spin += 0.012;
    core.pulse *= 0.95;
    var r0 = small ? 22 : 30;

    // halo
    var g = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, r0 * 5);
    g.addColorStop(0, 'rgba(' + CYAN + ',0.10)');
    g.addColorStop(1, 'rgba(' + CYAN + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(core.x, core.y, r0 * 5, 0, 7); ctx.fill();

    // rings
    ctx.strokeStyle = 'rgba(' + BONE + ',0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(core.x, core.y, r0, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(' + BONE + ',0.12)';
    ctx.beginPath(); ctx.arc(core.x, core.y, r0 * 0.62, 0, 7); ctx.stroke();

    // rotating capital arc
    ctx.strokeStyle = 'rgba(' + CYAN + ',0.95)'; ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(' + CYAN + ',0.7)'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(core.x, core.y, r0, core.spin, core.spin + Math.PI * 0.65); ctx.stroke();
    ctx.shadowBlur = 0;

    // pulse ring on profit arrival
    if (core.pulse > 0.04) {
      ctx.strokeStyle = 'rgba(' + GREEN + ',' + core.pulse * 0.6 + ')';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(core.x, core.y, r0 + (1 - core.pulse) * 26, 0, 7); ctx.stroke();
    }

    ctx.fillStyle = 'rgba(' + CYAN + ',0.95)';
    ctx.beginPath(); ctx.arc(core.x, core.y, 2.6, 0, 7); ctx.fill();

    ctx.fillStyle = 'rgba(' + BONE + ',0.62)';
    ctx.font = '700 ' + (small ? 8.5 : 9.5) + 'px ' + MONO;
    ctx.textAlign = 'center';
    ctx.fillText('ALLOCATOR', core.x, core.y + r0 + 16);
    ctx.fillStyle = 'rgba(' + BONE + ',0.34)';
    ctx.font = (small ? 8 : 8.5) + 'px ' + MONO;
    ctx.fillText('CAPITAL OUT $' + Math.round(budgetOut).toLocaleString('en-US'), core.x, core.y + r0 + 29);
  }

  function drawCluster(c, now) {
    // link to core
    var cp = ctrlPoint(core.x, core.y, c.x, c.y, 36);
    var linkCol = c.alert > 0.3 ? 'rgba(' + RED + ',0.30)' : c.reval > 0.3 ? 'rgba(' + AMBER + ',0.28)' : 'rgba(' + BONE + ',0.075)';
    ctx.strokeStyle = linkCol; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(core.x, core.y);
    ctx.quadraticCurveTo(cp.x, cp.y, c.x, c.y); ctx.stroke();

    c.pulse *= 0.94; c.energy *= 0.985; c.promote *= 0.985;

    // orbit ring
    var ringCol = c.alert > 0.3 ? RED : c.reval > 0.3 ? AMBER : c.promote > 0.15 ? CYAN : BONE;
    var ringAlpha = c.alert > 0.3 || c.reval > 0.3 ? 0.5 : c.promote > 0.15 ? 0.55 * c.promote + 0.12 : 0.13;
    ctx.strokeStyle = 'rgba(' + ringCol + ',' + ringAlpha + ')';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r + 4, 0, 7); ctx.stroke();

    // verification pulse
    if (c.pulse > 0.05) {
      ctx.strokeStyle = 'rgba(' + GREEN + ',' + c.pulse * 0.45 + ')';
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r + 6 + (1 - c.pulse) * 16, 0, 7); ctx.stroke();
    }

    // the swarm — worker particles boiling around the mandate
    var boil = 1 + c.energy * 2.2;
    for (var i = 0; i < c.particles.length; i++) {
      var p = c.particles[i];
      p.a += p.sp * boil * (REDUCED ? 0 : 1);
      p.wob += 0.03;
      var rr = p.r + Math.sin(p.wob) * 3 * boil;
      var px = c.x + Math.cos(p.a) * rr;
      var py = c.y + Math.sin(p.a) * rr * 0.82;
      var pa = c.alert > 0.3 ? 0.20 : 0.28 + c.energy * 0.5;
      var pc = c.alert > 0.3 ? RED : c.energy > 0.35 ? CYAN : BONE;
      ctx.fillStyle = 'rgba(' + pc + ',' + Math.min(0.9, pa) + ')';
      ctx.beginPath(); ctx.arc(px, py, p.size, 0, 7); ctx.fill();
    }

    // nucleus
    ctx.fillStyle = c.alert > 0.3 ? 'rgba(' + RED + ',0.9)' : 'rgba(' + BONE + ',0.75)';
    ctx.beginPath(); ctx.arc(c.x, c.y, 2.4, 0, 7); ctx.fill();

    // label + live ROI
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(' + BONE + ',0.6)';
    ctx.font = '700 ' + (small ? 8 : 9) + 'px ' + MONO;
    ctx.fillText(c.name, c.x, c.y + c.r + 18);
    var roiCol = c.roi >= 1.2 ? GREEN : c.roi < 0.8 ? RED : BONE;
    ctx.fillStyle = 'rgba(' + roiCol + ',0.62)';
    ctx.font = (small ? 7.5 : 8.5) + 'px ' + MONO;
    ctx.fillText(c.roi.toFixed(2) + '× · ' + c.tier, c.x, c.y + c.r + 30);
  }

  function drawPackets() {
    for (var i = packets.length - 1; i >= 0; i--) {
      var p = packets[i];
      p.t += p.speed * (REDUCED ? 0 : 1);
      var from = p.kind === 'alloc' ? core : p.c;
      var to = p.kind === 'alloc' ? p.c : core;
      var cp = ctrlPoint(from.x, from.y, to.x, to.y, p.k);
      if (p.t >= 1) {
        if (p.kind === 'alloc') {
          p.c.energy = Math.min(1, p.c.energy + 0.55);
          // work → verified P&L returns after a beat, scaled by ROI
          (function (c, amt) {
            setTimeout(function () {
              if (!running) return;
              var out = amt * (c.roi * (0.8 + Math.random() * 0.5));
              spawnProfit(c, out);
              c.pulse = 1;
            }, 500 + Math.random() * 1400);
          })(p.c, p.amt);
        } else {
          pnl += p.amt;
          core.pulse = 1;
          floater(core.x + (Math.random() - 0.5) * 40, core.y - 38, '+$' + p.amt.toFixed(2) + ' VERIFIED', GREEN, 9.5);
        }
        packets.splice(i, 1);
        continue;
      }
      var pos = quad(from.x, from.y, cp.x, cp.y, to.x, to.y, p.t);
      var col = p.kind === 'alloc' ? CYAN : GREEN;
      ctx.fillStyle = 'rgba(' + col + ',0.9)';
      ctx.shadowColor = 'rgba(' + col + ',0.8)'; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, p.kind === 'alloc' ? 1.9 : 2.2, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      var tail = quad(from.x, from.y, cp.x, cp.y, to.x, to.y, Math.max(0, p.t - 0.05));
      ctx.strokeStyle = 'rgba(' + col + ',0.3)'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(pos.x, pos.y); ctx.stroke();
    }
  }

  function drawFloaters() {
    ctx.textAlign = 'center';
    for (var i = floaters.length - 1; i >= 0; i--) {
      var f = floaters[i];
      f.life -= 0.008;
      f.y -= 0.35;
      if (f.life <= 0) { floaters.splice(i, 1); continue; }
      var a = f.life > 0.75 ? (1 - f.life) * 4 : f.life / 0.75;
      ctx.fillStyle = 'rgba(' + f.rgb + ',' + (a * 0.9).toFixed(3) + ')';
      ctx.font = '700 ' + f.size + 'px ' + MONO;
      ctx.fillText(f.text, f.x, f.y);
    }
  }

  function updatePnlDom() {
    if (!pnlEl) return;
    pnlShown += (pnl - pnlShown) * 0.08;
    var v = '$' + Math.round(pnlShown).toLocaleString('en-US');
    if (pnlEl.textContent !== v) pnlEl.textContent = v;
  }

  function frame(now) {
    if (!running) return;
    ctx.clearRect(0, 0, W, H);
    var px = (mouse.x - 0.5) * 16, py = (mouse.y - 0.5) * 12;
    ctx.save();
    ctx.translate(px, py);

    clusters.forEach(function (c) { clusterPos(c, now); });

    if (!REDUCED) {
      if (now - lastAlloc > 520 - Math.min(200, pnl * 0.2)) { spawnAlloc(now); lastAlloc = now; }
      if (now - lastEvent > 5200 + Math.random() * 2000) { fireEvent(now); lastEvent = now; }
    }

    clusters.forEach(function (c) { drawCluster(c, now); });
    drawPackets();
    drawCore(now);
    drawFloaters();
    ctx.restore();

    updatePnlDom();
    requestAnimationFrame(frame);
  }

  // pause when hero is offscreen — no wasted GPU below the fold
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      var vis = entries[0].isIntersecting;
      if (vis && !running) { running = true; requestAnimationFrame(frame); }
      else if (!vis) running = false;
    }, { threshold: 0.02 }).observe(canvas);
  }

  window.addEventListener('resize', resize, { passive: true });
  if (!COARSE) {
    window.addEventListener('mousemove', function (e) {
      mouse.x = e.clientX / window.innerWidth;
      mouse.y = e.clientY / window.innerHeight;
    }, { passive: true });
  }
  resize();
  requestAnimationFrame(frame);
})();

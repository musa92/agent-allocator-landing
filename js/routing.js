/* ═══════════════════════════════════════════════════════════
   Allocator.os — routing terminal (pinned scroll-scrub, v2)
   The ALLOC <GO> screen pins while the visitor scrolls through it:
   the order command types out, the task decomposes into six
   risk-scored steps, wires draw from each step to the model tier
   it routes to (frontier / open-source / local), token pulses
   stream along completed wires, model load meters fill, and the
   cost counters settle into the routed-vs-all-frontier verdict.
   Scrubbing backwards rewinds the whole sequence.
═══════════════════════════════════════════════════════════ */
'use strict';

(function routingTerminal() {
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var stage = document.getElementById('rterm-stage');
  if (!stage) return;

  var board = document.getElementById('rt-board');
  var stepsCol = document.getElementById('rt-steps');
  var wiresSvg = document.getElementById('rt-wires');
  var cmdEl = document.getElementById('rt-cmd');
  var orderEl = document.getElementById('rt-order');
  var msgEl = document.getElementById('rt-msg');
  var msgTextEl = document.getElementById('rt-msg-text');
  var tokensEl = document.getElementById('rt-tokens');
  var vAlloc = document.getElementById('cost-alloc');
  var vFront = document.getElementById('cost-frontier');
  var barAlloc = document.getElementById('bar-alloc');
  var barFront = document.getElementById('bar-frontier');
  var note = document.getElementById('df-note');

  var steps = Array.prototype.slice.call(stage.querySelectorAll('.rstep'));
  var models = {};
  Array.prototype.slice.call(stage.querySelectorAll('.rmodel')).forEach(function (m) {
    models[m.dataset.tier] = m;
  });

  var CMD = 'ROUT NVDA US EQUITY <GO>';
  var totAlloc = 0, totFront = 0, totTok = 0;
  var tierSteps = { frontier: 0, open: 0, local: 0 };
  steps.forEach(function (s) {
    totAlloc += parseFloat(s.dataset.cost);
    totFront += parseFloat(s.dataset.fcost);
    totTok += parseFloat(s.dataset.tok);
    tierSteps[s.dataset.tier]++;
  });
  var SAVE = Math.round((1 - totAlloc / totFront) * 100);
  if (note) note.textContent = 'SAME VERIFIED OUTCOME · −' + SAVE + '% SPEND';

  function fmtTok(k) {
    return k >= 1000 ? (k / 1000).toFixed(2) + 'M' : Math.round(k) + 'K';
  }

  /* ── wires + token pulses ── */
  var SVGNS = 'http://www.w3.org/2000/svg';
  var TIER_COLOR = { frontier: '#22d3ee', open: '#22c55e', local: '#8b887c' };
  var PULSES_PER_WIRE = 2;
  var wires = steps.map(function (s) {
    var p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', TIER_COLOR[s.dataset.tier] || '#8b887c');
    p.setAttribute('stroke-width', '1.4');
    p.setAttribute('pathLength', '1');
    p.style.strokeDasharray = '1';
    p.style.strokeDashoffset = '1';
    wiresSvg.appendChild(p);
    return p;
  });
  var pulses = steps.map(function (s, i) {
    var dots = [];
    for (var j = 0; j < PULSES_PER_WIRE; j++) {
      var c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('r', '2.2');
      c.setAttribute('fill', TIER_COLOR[s.dataset.tier] || '#8b887c');
      c.setAttribute('opacity', '0');
      wiresSvg.appendChild(c);
      dots.push(c);
    }
    return dots;
  });

  var lastProg = steps.map(function () { return 0; });

  /* ── the model auction: what the router tries (and rejects) before
     locking each step. Cheap steps walk DOWN the ladder on cost;
     risky steps climb UP it on pass rate. Scrub-deterministic. ── */
  var LOCK = 0.55;
  var EVAL = {
    frontier: [
      ['LLAMA-8B', 'PASS 58% — REJECT'],
      ['QWEN-72B', 'PASS 82% — REJECT'],
      ['SONNET 5', 'PASS 93% — REJECT']
    ],
    open: [
      ['FABLE 5', '30× COST — REJECT'],
      ['SONNET 5', '9× COST — REJECT']
    ],
    local: [
      ['DEEPSEEK-V3.2', '6× COST — REJECT']
    ]
  };
  var prevCounts = {}, rxT = {};
  var chips = steps.map(function (s) { return s.querySelector('.rs-chip'); });
  var chipOrig = chips.map(function (c) { return c.innerHTML; });
  var chipState = steps.map(function () { return 'idle'; });

  /* ── 3D: the terminal starts tilted back, layers fly in from depth,
     the board flattens before wires draw, then mouse parallax moves
     the whole assembly (wires included) as one object ── */
  var THREED = !REDUCED && window.innerWidth >= 900;
  var termEl = stage.querySelector('.rterm');
  var MODEL_ORDER = ['frontier', 'open', 'local'];
  var mx = 0, my = 0, lastP = 0;
  function applyTilt() {
    if (!THREED || !termEl) return;
    var tk = 1 - clamp((lastP - 0.05) / 0.3); // 1 tilted → 0 flat by p≈0.35
    termEl.style.transform =
      'rotateX(' + (tk * 9 + my * 1.5).toFixed(2) + 'deg)' +
      ' rotateY(' + (tk * -7 + mx * 2.2).toFixed(2) + 'deg)' +
      ' translateZ(' + (tk * -70).toFixed(1) + 'px)';
  }
  stage.addEventListener('pointermove', function (e) {
    if (!THREED) return;
    var r = stage.getBoundingClientRect();
    mx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    my = -((e.clientY - r.top) / r.height - 0.5) * 2;
    applyTilt();
  }, { passive: true });
  stage.addEventListener('pointerleave', function () { mx = my = 0; applyTilt(); });

  /* the risk gate — the switch node every wire physically routes through */
  var gateG = document.createElementNS(SVGNS, 'g');
  gateG.setAttribute('opacity', '0');
  var gateRing = document.createElementNS(SVGNS, 'circle');
  gateRing.setAttribute('r', '11');
  gateRing.setAttribute('fill', 'none');
  gateRing.setAttribute('stroke', '#ffb400');
  gateRing.setAttribute('stroke-width', '1');
  gateRing.setAttribute('class', 'rt-gate-ring');
  var gateCore = document.createElementNS(SVGNS, 'rect');
  gateCore.setAttribute('x', '-4.5'); gateCore.setAttribute('y', '-4.5');
  gateCore.setAttribute('width', '9'); gateCore.setAttribute('height', '9');
  gateCore.setAttribute('transform', 'rotate(45)');
  gateCore.setAttribute('fill', '#0d0f14');
  gateCore.setAttribute('stroke', '#ffb400');
  gateCore.setAttribute('stroke-width', '1.2');
  var gateText = document.createElementNS(SVGNS, 'text');
  gateText.setAttribute('y', '26');
  gateText.setAttribute('text-anchor', 'middle');
  gateText.setAttribute('fill', '#c9a24a');
  gateText.setAttribute('style', 'font: 700 7px "Space Mono", monospace; letter-spacing: 0.14em;');
  gateText.textContent = 'RISK GATE';
  gateG.appendChild(gateRing); gateG.appendChild(gateCore); gateG.appendChild(gateText);

  function drawWires(progressByStep) {
    if (getComputedStyle(wiresSvg).display === 'none') return; // mobile: no wires column
    wiresSvg.setAttribute('viewBox', '0 0 ' + board.offsetWidth + ' ' + board.offsetHeight);
    var anyModel = models.frontier || models.open || models.local;
    var gx = (stepsCol.offsetLeft + stepsCol.offsetWidth + anyModel.offsetLeft) / 2;
    var gy = board.offsetHeight * 0.46;
    gateG.setAttribute('transform', 'translate(' + gx + ',' + gy + ')');
    gateG.setAttribute('opacity', String(Math.min(1, Math.max.apply(null, progressByStep) * 2)));
    var fanIdx = { frontier: 0, open: 0, local: 0 };
    var fanCount = { frontier: 0, open: 0, local: 0 };
    steps.forEach(function (s, i) {
      if (progressByStep[i] > 0) fanCount[s.dataset.tier]++;
    });
    steps.forEach(function (s, i) {
      var k = progressByStep[i];
      if (k <= 0) { wires[i].style.strokeDashoffset = '1'; return; }
      var m = models[s.dataset.tier];
      var x1 = stepsCol.offsetLeft + stepsCol.offsetWidth;
      var y1 = s.offsetTop + s.offsetHeight / 2;
      var x2 = m.offsetLeft;
      var y2 = m.offsetTop + m.offsetHeight / 2 +
        (fanIdx[s.dataset.tier]++ - (fanCount[s.dataset.tier] - 1) / 2) * 7;
      var ry = gy + (i - (steps.length - 1) / 2) * 3.2;
      var da = (gx - x1) * 0.55, db = (x2 - gx) * 0.55;
      wires[i].setAttribute('d',
        'M' + x1 + ' ' + y1 +
        ' C' + (x1 + da) + ' ' + y1 + ', ' + (gx - da) + ' ' + ry + ', ' + gx + ' ' + ry +
        ' C' + (gx + db) + ' ' + ry + ', ' + (x2 - db) + ' ' + y2 + ', ' + x2 + ' ' + y2);
      wires[i].style.strokeDashoffset = String(1 - k);
    });
  }
  wiresSvg.appendChild(gateG);

  /* Ambient token flow: dots stream along fully-routed wires while the
     stage is on screen. Runs outside the scrub so the board feels live. */
  var flowing = false, rafId = null;
  function tickPulses(now) {
    if (!flowing) return;
    var anyVisible = false;
    steps.forEach(function (s, i) {
      var routed = lastProg[i] >= 1 && wires[i].getAttribute('d');
      var len = routed ? wires[i].getTotalLength() : 0;
      pulses[i].forEach(function (dot, j) {
        if (!routed || len === 0) { dot.setAttribute('opacity', '0'); return; }
        anyVisible = true;
        // heavier steps pulse faster — token throughput as speed
        var speed = 0.00035 * (0.7 + Math.min(2, parseFloat(s.dataset.tok) / 200));
        var t = ((now * speed) + (j / PULSES_PER_WIRE) + i * 0.37) % 1;
        var pt = wires[i].getPointAtLength(t * len);
        dot.setAttribute('cx', pt.x);
        dot.setAttribute('cy', pt.y);
        dot.setAttribute('opacity', String(0.9 * Math.sin(Math.PI * t)));
      });
    });
    rafId = requestAnimationFrame(tickPulses);
  }
  function setFlowing(on) {
    if (REDUCED) on = false;
    if (on === flowing) return;
    flowing = on;
    if (on) rafId = requestAnimationFrame(tickPulses);
    else {
      if (rafId) cancelAnimationFrame(rafId);
      pulses.forEach(function (dots) {
        dots.forEach(function (d) { d.setAttribute('opacity', '0'); });
      });
    }
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      setFlowing(entries[0].isIntersecting);
    }, { threshold: 0.05 }).observe(stage);
  } else {
    setFlowing(true);
  }

  var clamp = function (v) { return Math.max(0, Math.min(1, v)); };

  /* ── one scrubbed progress value drives every phase ──
     0.00–0.06 command types · 0.065 order card · 0.10–0.35 steps
     reveal · 0.38–0.81 wires route + counters tick · 0.84–1 verdict */
  function update(p) {
    cmdEl.textContent = CMD.slice(0, Math.round(CMD.length * clamp(p / 0.06)));
    orderEl.classList.toggle('on', p > 0.065);

    var counts = { frontier: 0, open: 0, local: 0 };
    var alloc = 0, front = 0, tok = 0, routedDone = 0;
    steps.forEach(function (s, i) {
      var t0 = 0.10 + i * 0.045;
      s.classList.toggle('on', p > t0);
      if (THREED) {
        var kr = clamp((p - t0) / 0.05);
        s.style.opacity = (0.14 + 0.86 * kr).toFixed(3);
        s.style.transform = 'translateZ(' + (-170 * (1 - kr)).toFixed(1) + 'px)' +
          ' rotateX(' + (26 * (1 - kr)).toFixed(2) + 'deg)';
      }
      s.querySelector('.rs-risk i').style.width =
        (parseFloat(s.dataset.risk) * 100 * clamp((p - t0) / 0.03)) + '%';

      var k = clamp((p - (0.38 + i * 0.072)) / 0.06);
      lastProg[i] = k;
      if (k >= 1) routedDone++;
      if (k > LOCK) counts[s.dataset.tier]++;
      s.classList.toggle('active', k > 0 && k < 1);
      s.classList.toggle('routed', k > LOCK);
      alloc += parseFloat(s.dataset.cost) * k;
      front += parseFloat(s.dataset.fcost) * k;
      tok += parseFloat(s.dataset.tok) * k;

      /* the auction: cycle rejected candidates while evaluating, then lock */
      var st = k <= 0 ? 'idle' : k < LOCK ? 'eval' : 'locked';
      if (st === 'eval') {
        var seq = EVAL[s.dataset.tier];
        var idx = Math.min(seq.length - 1, Math.floor(k / LOCK * seq.length));
        if (chipState[i] !== 'e' + idx) {
          chipState[i] = 'e' + idx;
          chips[i].classList.add('eval');
          chips[i].innerHTML = seq[idx][0] + '<em>' + seq[idx][1] + '</em>';
        }
      } else if (chipState[i] !== st) {
        chipState[i] = st;
        chips[i].classList.remove('eval');
        chips[i].innerHTML = chipOrig[i];
      }
    });
    lastP = p;
    applyTilt();
    drawWires(lastProg);

    MODEL_ORDER.forEach(function (tier, j) {
      var el = models[tier];
      if (!el) return;
      if (THREED) {
        var km = clamp((p - (0.22 + j * 0.05)) / 0.07);
        el.style.opacity = (0.15 + 0.85 * km).toFixed(3);
        el.style.transform = 'translateZ(' + (-230 * (1 - km)).toFixed(1) + 'px)' +
          ' rotateY(' + (-20 * (1 - km)).toFixed(2) + 'deg)';
      }
      if (counts[tier] > (prevCounts[tier] || 0)) {
        el.classList.add('rx');
        clearTimeout(rxT[tier]);
        rxT[tier] = setTimeout(function () { el.classList.remove('rx'); }, 450);
      }
      prevCounts[tier] = counts[tier];
      el.classList.toggle('active', counts[tier] > 0);
      el.querySelector('.rm-n').textContent =
        counts[tier] + (counts[tier] === 1 ? ' STEP' : ' STEPS') + (counts[tier] ? ' ROUTED' : '');
      el.querySelector('.rm-load i').style.width =
        (tierSteps[tier] ? counts[tier] / tierSteps[tier] * 100 : 0) + '%';
    });

    vAlloc.textContent = '$' + alloc.toFixed(2);
    vFront.textContent = '$' + front.toFixed(2);
    tokensEl.textContent = tok > 0 ? fmtTok(tok) + ' TOK ROUTED' : '';

    var q = clamp((p - 0.84) / 0.12);
    barFront.style.width = (100 * q) + '%';
    barAlloc.style.width = (totAlloc / totFront * 100 * q) + '%';
    note.style.opacity = q;

    msgEl.classList.remove('done');
    if (p < 0.09) msgTextEl.textContent = 'AWAITING ORDER — SCROLL TO DECOMPOSE ▼';
    else if (p < 0.38) msgTextEl.textContent = 'DECOMPOSING ORDER INTO 6 RISK-SCORED STEPS…';
    else if (p < 0.84) msgTextEl.textContent = 'ROUTING ' + routedDone + '/6 — RISK-WEIGHTED DISPATCH';
    else {
      msgTextEl.textContent = 'ROUTING COMPLETE — ' + SAVE + '% BELOW ALL-FRONTIER · RELIABILITY TARGET MET';
      msgEl.classList.add('done');
    }
  }

  if (REDUCED || typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    update(1);
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  var proxy = { p: 0 };
  gsap.to(proxy, {
    p: 1,
    ease: 'none',
    onUpdate: function () { update(proxy.p); },
    scrollTrigger: {
      trigger: stage,
      pin: true,
      start: 'top top',
      end: '+=2600',
      scrub: 0.5,
      anticipatePin: 1,
      onRefresh: function () { update(proxy.p); }
    }
  });
  update(0);
})();

/* ═══════════════════════════════════════════════════════════
   Security tape — NVDA last price ticks like a terminal feed:
   price colored by last tick direction, change vs prior close,
   live Eastern-time clock. Runs only while the terminal is on
   screen; static under reduced motion.
═══════════════════════════════════════════════════════════ */
(function securityTape() {
  var px = document.getElementById('rt-px');
  var chg = document.getElementById('rt-chg');
  var clock = document.getElementById('rt-clock');
  var stage = document.getElementById('rterm-stage');
  if (!px || !stage) return;
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var CLOSE = 183.56;           // prior close — change is computed against this
  var price = 187.42;

  function paintClock() {
    if (!clock) return;
    var now = new Date();
    var t;
    try {
      t = now.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false });
    } catch (e) {
      t = now.toLocaleTimeString('en-US', { hour12: false });
    }
    clock.textContent = '18-JUL-2026 ' + t + ' ET · DELAYED 15 MIN';
  }

  function tick() {
    var dp = (Math.random() - 0.48) * 0.24;
    price = Math.min(196, Math.max(178, price + dp));
    px.textContent = price.toFixed(2);
    px.classList.toggle('up', dp >= 0);
    px.classList.toggle('dn', dp < 0);
    var c = price - CLOSE, cp = c / CLOSE * 100;
    chg.textContent = (c >= 0 ? '+' : '') + c.toFixed(2) + ' ' + (c >= 0 ? '+' : '') + cp.toFixed(2) + '%';
    chg.className = 'sec-chg ' + (c >= 0 ? 'up' : 'dn');
    paintClock();
  }

  paintClock();
  if (REDUCED) return;

  var timer = null;
  function start() { if (!timer) timer = setInterval(tick, 1500); }
  function stop() { clearInterval(timer); timer = null; }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries[0].isIntersecting ? start() : stop();
    }, { threshold: 0.02 }).observe(stage);
  } else start();
})();

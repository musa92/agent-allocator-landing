/* ═══════════════════════════════════════════════════════════
   Allocator.os — routing terminal (pinned scroll-scrub, v3)
   Three acts on one scrubbed timeline:
   ACT 1 — the terminal is the screen of a laptop on a desk;
   scroll dollies the camera in until the bezel slides past the
   viewport and you're inside the screen.
   ACT 2 — the ALLOC <GO> order types out, decomposes into six
   risk-scored steps, wires route each to a model tier, and the
   cost counters settle into the routed-vs-all-frontier verdict.
   ACT 3 — the screen flips to AGNT WORKFORCE <GO>: every routed
   step is registered as an agent (ID minted with a scramble,
   autonomy grade, metered budget) and the token bill collapses
   through cache/dedup to the billed amount.
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

  var laptop = document.getElementById('laptop');
  var lapFrame = document.getElementById('laptop-frame');
  var lapBase = stage.querySelector('.laptop-base');
  var lapShadow = stage.querySelector('.laptop-shadow');
  var lapCap = document.getElementById('laptop-cap');
  var page2 = document.getElementById('rt-page2');
  var chromeBar = stage.querySelector('.rterm-chrome');
  var cmdBar = stage.querySelector('.rterm-cmd');
  var agents = page2 ? Array.prototype.slice.call(page2.querySelectorAll('.ragent')) : [];
  var rbRaw = document.getElementById('rb-raw');
  var rbSave = document.getElementById('rb-save');
  var rbBilled = document.getElementById('rb-billed');
  var rbBarRaw = document.getElementById('rb-bar-raw');
  var rbBarSave = document.getElementById('rb-bar-save');
  var rbBarBilled = document.getElementById('rb-bar-billed');

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

  /* ── 3D: while inside the screen, mouse parallax sways the whole
     assembly (wires included) as one object. The old scroll-tilt is
     gone — the laptop shell owns the camera during the zoom. ── */
  var THREED = !REDUCED && window.innerWidth >= 900;
  var termEl = stage.querySelector('.rterm');
  var MODEL_ORDER = ['frontier', 'open', 'local'];
  var mx = 0, my = 0, lastP = 0, zNow = 0;
  function applyTilt() {
    if (!THREED || !termEl) return;
    var amp = clamp((zNow - 0.9) / 0.1) * (1 - flipNow); // only while landed inside, not mid-swing
    termEl.style.transform =
      'rotateX(' + (my * 1.4 * amp).toFixed(2) + 'deg)' +
      ' rotateY(' + (mx * 2.1 * amp).toFixed(2) + 'deg)';
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

  /* ═══ ACT 1 — the laptop dolly ═══
     z: 0 = machine on the desk, 1 = inside the screen.
     Transform-only (scale + rotateX on the shell) so the terminal
     ends pixel-exact in its normal layout position; the bezel,
     deck, and shadow just fade away as they slide past the edges. */
  var flipNow = 0; // ACT 4 — how far the screen has swung open
  function renderShell() {
    if (!laptop) return;
    var s = zNow * zNow * (3 - 2 * zNow);      // smoothstep — eases the dolly at both ends
    var f = flipNow * flipNow * (3 - 2 * flipNow);
    var scale = 0.42 + 0.58 * s;
    var rotX = 12 * (1 - s);
    /* zoom pivots on the screen center; the door-swing pivots on the left
       spine. Origin only switches while the transform is identity, so no jump. */
    laptop.style.transformOrigin = f > 0 ? '9% 50%' : '50% 42%';
    laptop.style.transform =
      'scale(' + scale.toFixed(4) + ') rotateX(' + rotX.toFixed(2) + 'deg)' +
      ' rotateY(' + (-86 * f).toFixed(2) + 'deg)';
    laptop.style.opacity = (1 - clamp((flipNow - 0.55) / 0.35)).toFixed(3);
    laptop.style.visibility = flipNow >= 0.98 ? 'hidden' : 'visible';
  }
  function applyZoom(z) {
    zNow = z;
    if (!laptop) return;
    renderShell();
    var chromeK = 1 - clamp((z - 0.78) / 0.2);   // bezel survives until it's past the edges
    var deckK = 1 - clamp((z - 0.5) / 0.4);      // keyboard deck drops away sooner
    if (lapFrame) {
      lapFrame.style.opacity = chromeK.toFixed(3);
      lapFrame.style.visibility = chromeK <= 0 ? 'hidden' : 'visible';
    }
    [lapBase, lapShadow].forEach(function (el) {
      if (!el) return;
      el.style.opacity = deckK.toFixed(3);
      el.style.visibility = deckK <= 0 ? 'hidden' : 'visible';
    });
    if (lapCap) lapCap.style.opacity = (1 - clamp(z / 0.22)).toFixed(3);
    applyTilt();
  }

  /* ═══ ACT 3 — workforce registry + token bill ═══ */
  var CMD2 = 'AGNT WORKFORCE <GO>';
  var HEX = '0123456789ABCDEF';
  var CACHE_SAVE = 0.61; // cache + dedup share of raw token demand
  function scrambleId(target, t) {
    // 'AGT-' stays; the hash settles left-to-right out of hex noise
    var head = target.slice(0, 4), rest = target.slice(4);
    var reveal = Math.floor(t * rest.length), out = head;
    for (var i = 0; i < rest.length; i++) {
      out += (i < reveal || rest[i] === '-') ? rest[i]
        : HEX[(Math.random() * 16) | 0];
    }
    return out;
  }
  function updateRegistry(g) {
    if (!page2) return;
    page2.classList.toggle('on', g > 0.02);
    page2.setAttribute('aria-hidden', g > 0.02 ? 'false' : 'true');
    if (g <= 0) return;

    cmdEl.textContent = CMD2.slice(0, Math.round(CMD2.length * clamp(g / 0.1)));
    orderEl.classList.remove('on');

    var minted = 0;
    agents.forEach(function (r, i) {
      var k = clamp((g - (0.1 + i * 0.075)) / 0.1);
      r.classList.toggle('on', k > 0);
      var idEl = r.querySelector('.ra-id');
      var stEl = r.querySelector('.ra-status');
      if (k <= 0) {
        r.classList.remove('minted');
        idEl.textContent = '····';
        stEl.textContent = '';
      } else if (k < 0.7) {
        r.classList.remove('minted');
        idEl.textContent = scrambleId(r.dataset.id, k / 0.7);
        stEl.textContent = 'MINTING ID…';
      } else {
        r.classList.add('minted');
        idEl.textContent = r.dataset.id;
        stEl.textContent = 'ACTIVE';
        minted++;
      }
    });

    var b = clamp((g - 0.6) / 0.32);
    var rawK = clamp(b * 2.4);
    var saveK = clamp((b - 0.22) / 0.65);
    var raw = totTok * rawK;
    var billed = raw * (1 - CACHE_SAVE * saveK);
    if (rbRaw) rbRaw.textContent = fmtTok(raw) + ' TOK';
    if (rbSave) rbSave.textContent = '−' + Math.round(CACHE_SAVE * 100 * saveK) + '%';
    if (rbBilled) rbBilled.textContent = fmtTok(billed) + ' TOK';
    if (rbBarRaw) rbBarRaw.style.width = (100 * rawK) + '%';
    if (rbBarSave) rbBarSave.style.width = (CACHE_SAVE * 100 * saveK) + '%';
    if (rbBarBilled) rbBarBilled.style.width = (100 * rawK * (1 - CACHE_SAVE * saveK)) + '%';

    msgEl.classList.remove('done');
    if (g < 0.6) {
      msgTextEl.textContent = 'SPAWNING WORKFORCE — MINTING AGENT IDS ' + minted + '/6';
      tokensEl.textContent = '';
    } else if (saveK < 1) {
      msgTextEl.textContent = 'METERING — CACHE + DEDUP COLLAPSING THE TOKEN BILL';
      tokensEl.textContent = fmtTok(billed) + ' TOK BILLED';
    } else {
      msgTextEl.textContent = 'WORKFORCE REGISTERED — 6 IDS MINTED · TOKEN BILL −' +
        Math.round(CACHE_SAVE * 100) + '% · EVERY AGENT ON A METER';
      msgEl.classList.add('done');
      tokensEl.textContent = fmtTok(billed) + ' TOK BILLED';
    }
  }

  /* ═══ ACT 4 — behind the glass: the swarm backplane ═══
     A dependency-free 3D projection on a 2D canvas: the six minted
     agents float in depth around the allocator core, wired to it and
     to each other; pulses run the channels; the camera dollies in as
     the screen swings open. Scrub drives the dolly, time drives life. */
  var depthCanvas = document.getElementById('rt-depth');
  var depthCtx = depthCanvas ? depthCanvas.getContext('2d') : null;
  var depthK = 0, depthOn = false, depthRAF = null;
  var TIER3D = { open: '#22c55e', local: '#8b887c', frontier: '#22d3ee' };
  var NODES3D = [
    { id: 'CORE', role: 'ALLOCATOR', x: 0, y: 0, z: 0, r: 24, c: '#ffb400', hub: true },
    { id: 'AGT-7F2E-01', role: 'INGEST', x: -300, y: -75, z: -60, r: 13, c: TIER3D.open },
    { id: 'AGT-C41A-02', role: 'NORMALIZE', x: -165, y: 125, z: 145, r: 11, c: TIER3D.local },
    { id: 'AGT-9D03-03', role: 'HISTORICALS', x: -35, y: -150, z: 45, r: 12, c: TIER3D.open },
    { id: 'AGT-E88F-04', role: 'RESEARCH', x: 160, y: 95, z: -125, r: 15, c: TIER3D.frontier },
    { id: 'AGT-52B7-05', role: 'VALUATION', x: 305, y: -60, z: 85, r: 15, c: TIER3D.frontier },
    { id: 'AGT-B6C1-06', role: 'MEMO', x: 60, y: 175, z: -40, r: 12, c: TIER3D.open }
  ];
  /* channels: every agent reports to the core; work flows between peers */
  var EDGES3D = [
    [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6],
    [1, 3], [2, 3], [3, 5], [4, 5], [5, 6], [1, 4], [4, 6]
  ];
  var DUST3D = [];
  for (var di = 0; di < 90; di++) {
    var fr = function (n) { var v = Math.sin(n) * 43758.5453; return v - Math.floor(v); };
    DUST3D.push({
      x: (fr(di * 12.9898) - 0.5) * 1300,
      y: (fr(di * 78.233) - 0.5) * 700,
      z: (fr(di * 39.425) - 0.5) * 900
    });
  }
  function sizeDepth() {
    if (!depthCanvas) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = stage.offsetWidth, h = stage.offsetHeight;
    if (depthCanvas.width !== (w * dpr | 0)) {
      depthCanvas.width = w * dpr; depthCanvas.height = h * dpr;
      depthCanvas.style.width = w + 'px'; depthCanvas.style.height = h + 'px';
    }
  }
  function drawDepth(now) {
    if (!depthCtx) return;
    sizeDepth();
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = depthCanvas.width / dpr, h = depthCanvas.height / dpr;
    var g = depthCtx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    var k = depthK;
    var ko = 1 - Math.pow(1 - k, 3); // easeOutCubic — dolly settles softly
    var t = REDUCED ? 0 : now;
    var rotY = t * 0.00012 + 0.85 * (1 - ko);
    var camZ = 820 - 700 * ko;
    /* center in the visible viewport slice, not the (possibly taller) stage */
    var FOCAL = 640, cx = w / 2, cy = Math.min(h, window.innerHeight) / 2 - 14;
    var cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    function proj(p) {
      var x = p.x * cosY + p.z * sinY;
      var z = -p.x * sinY + p.z * cosY;
      var s = FOCAL / (FOCAL + z + camZ);
      if (s <= 0.05) return null;
      return { x: cx + x * s, y: cy + p.y * s, s: s, z: z };
    }

    /* vignette + core glow set the room */
    var vg = g.createRadialGradient(cx, cy, 60, cx, cy, Math.max(w, h) * 0.7);
    vg.addColorStop(0, 'rgba(255,180,0,' + (0.05 * k) + ')');
    vg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);

    /* dust — depth parallax */
    DUST3D.forEach(function (d) {
      var p = proj(d);
      if (!p) return;
      g.fillStyle = 'rgba(235,232,224,' + (0.14 * p.s * k).toFixed(3) + ')';
      g.fillRect(p.x, p.y, 1.4 * p.s + 0.4, 1.4 * p.s + 0.4);
    });

    /* channels + pulses */
    var P = NODES3D.map(proj);
    EDGES3D.forEach(function (e, ei) {
      var a = P[e[0]], b = P[e[1]];
      if (!a || !b) return;
      var na = NODES3D[e[0]], nb = NODES3D[e[1]];
      var depth = (a.s + b.s) / 2;
      var lg = g.createLinearGradient(a.x, a.y, b.x, b.y);
      lg.addColorStop(0, na.c); lg.addColorStop(1, nb.c);
      g.strokeStyle = lg;
      g.globalAlpha = (0.18 + 0.3 * depth) * k;
      g.lineWidth = 1.25 * depth;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      /* two pulses per channel, offset by edge index */
      for (var j = 0; j < 2; j++) {
        var pt = ((t * 0.00022) + j / 2 + ei * 0.173) % 1;
        var px3 = {
          x: na.x + (nb.x - na.x) * pt,
          y: na.y + (nb.y - na.y) * pt,
          z: na.z + (nb.z - na.z) * pt
        };
        var pp = proj(px3);
        if (!pp) continue;
        g.globalAlpha = 0.85 * Math.sin(Math.PI * pt) * k;
        g.fillStyle = nb.c;
        g.beginPath(); g.arc(pp.x, pp.y, 2 * pp.s, 0, 6.2832); g.fill();
      }
    });
    g.globalAlpha = 1;

    /* nodes — glow, core, ring, labels; painter's order back-to-front */
    var order = NODES3D.map(function (n, i) { return i; })
      .sort(function (i, j) { return P[j] && P[i] ? P[j].z - P[i].z : 0; });
    order.forEach(function (i) {
      var n = NODES3D[i], p = P[i];
      if (!p) return;
      var r = n.r * p.s * 1.35;
      var glow = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2);
      glow.addColorStop(0, n.c); glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.16 * k;
      g.fillStyle = glow;
      g.beginPath(); g.arc(p.x, p.y, r * 3.2, 0, 6.2832); g.fill();
      g.globalAlpha = (0.35 + 0.6 * p.s) * k;
      g.fillStyle = '#08090c';
      g.beginPath(); g.arc(p.x, p.y, r, 0, 6.2832); g.fill();
      g.strokeStyle = n.c; g.lineWidth = 1.3;
      g.beginPath(); g.arc(p.x, p.y, r, 0, 6.2832); g.stroke();
      g.fillStyle = n.c;
      g.beginPath(); g.arc(p.x, p.y, Math.max(1.6, r * 0.3), 0, 6.2832); g.fill();
      if (n.hub) { /* breathing outer ring on the core */
        g.globalAlpha = (0.25 + 0.2 * Math.sin(t * 0.002)) * k;
        g.beginPath(); g.arc(p.x, p.y, r * 1.7, 0, 6.2832); g.stroke();
      }
      var la = clamp((k - 0.35) / 0.4) * (0.4 + 0.6 * p.s);
      if (la > 0.02) {
        g.globalAlpha = la;
        g.textAlign = 'center';
        g.fillStyle = n.hub ? '#ffb400' : '#ebe8e0';
        g.font = '700 ' + Math.round(10 * (0.7 + p.s * 0.5)) + 'px "Space Mono", monospace';
        g.fillText(n.id, p.x, p.y + r + 15);
        g.fillStyle = 'rgba(139,136,124,0.9)';
        g.font = Math.round(8.5 * (0.7 + p.s * 0.5)) + 'px "Space Mono", monospace';
        g.fillText(n.role, p.x, p.y + r + 27);
      }
      g.globalAlpha = 1;
    });

    /* HUD */
    var hud = clamp((k - 0.3) / 0.4);
    if (hud > 0.02) {
      g.globalAlpha = hud;
      g.textAlign = 'left';
      g.fillStyle = '#ffb400';
      g.font = '700 11px "Space Mono", monospace';
      g.fillText('BKPL <GO> — SWARM BACKPLANE · LIVE TOPOLOGY', 24, 34);
      g.textAlign = 'right';
      g.fillStyle = '#8b887c';
      g.font = '10px "Space Mono", monospace';
      var rate = 220 + Math.round(40 * Math.sin(t * 0.0011));
      g.fillText('AGENTS 6 · CHANNELS ' + (EDGES3D.length - 6) + ' · CORE LINKS 6 · MSGS ' + rate + '/S', w - 24, 34);
      g.textAlign = 'center';
      g.fillText('BEHIND THE GLASS — AGENTS NEGOTIATE CONTEXT · BUDGET · VERIFICATION OVER THE BACKPLANE',
        cx, Math.min(h, window.innerHeight) - 22);
      g.globalAlpha = 1;
    }
  }
  function tickDepth(now) {
    if (!depthOn) return;
    drawDepth(now);
    depthRAF = requestAnimationFrame(tickDepth);
  }
  function updateDepth(d) {
    if (!depthCanvas || REDUCED) return;
    depthK = d;
    flipNow = d > 0 ? clamp(d / 0.6) : 0; // the door finishes opening by d=0.6
    renderShell();
    applyTilt();
    depthCanvas.style.opacity = clamp(d * 1.8).toFixed(3);
    var on = d > 0.01;
    if (on && !depthOn) { depthOn = true; depthRAF = requestAnimationFrame(tickDepth); }
    else if (!on && depthOn) {
      depthOn = false;
      if (depthRAF) cancelAnimationFrame(depthRAF);
      if (depthCtx) {
        depthCtx.setTransform(1, 0, 0, 1, 0, 0);
        depthCtx.clearRect(0, 0, depthCanvas.width, depthCanvas.height);
      }
    }
  }

  /* page 2 covers everything below the command line */
  function layoutPage2() {
    if (!page2 || !chromeBar || !cmdBar) return;
    page2.style.top = (chromeBar.offsetHeight + cmdBar.offsetHeight) + 'px';
  }

  /* ═══ master timeline — one scrubbed p drives all four acts ═══
     0.00–0.12 laptop dolly · 0.13–0.60 order decomposes & routes ·
     0.62–0.80 registry: IDs mint, token bill collapses ·
     0.82–1.00 the screen swings open — the swarm backplane in 3D */
  function master(p) {
    applyZoom(clamp(p / 0.12));
    update(clamp((p - 0.13) / 0.47));
    updateRegistry(clamp((p - 0.62) / 0.18));
    updateDepth(clamp((p - 0.82) / 0.18));
  }

  layoutPage2();
  window.addEventListener('resize', layoutPage2);

  /* dev hook: ?rtp=0.5 freezes the timeline at that progress and
     isolates the terminal at the top of the page (no scrolling needed) */
  var dbg = /[?&]rtp=([\d.]+)/.exec(location.search);
  if (dbg) {
    document.documentElement.classList.add('rtp-debug');
    master(Math.min(1, parseFloat(dbg[1])));
    return;
  }

  if (REDUCED || typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    master(1);
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  var proxy = { p: 0 };
  gsap.to(proxy, {
    p: 1,
    ease: 'none',
    onUpdate: function () { master(proxy.p); },
    scrollTrigger: {
      trigger: stage,
      pin: true,
      start: 'top top',
      end: '+=5300',
      scrub: 0.5,
      anticipatePin: 1,
      onRefresh: function () { layoutPage2(); master(proxy.p); }
    }
  });
  master(0);
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

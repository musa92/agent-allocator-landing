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
    laptop.style.opacity = (1 - clamp((flipNow - 0.4) / 0.3)).toFixed(3);
    laptop.style.visibility = flipNow >= 0.98 ? 'hidden' : 'visible';
    /* once the door is swinging, let clicks through to the backplane */
    laptop.style.pointerEvents = flipNow > 0.3 ? 'none' : '';
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
  var chipCanvas = document.getElementById('rt-chips');
  var chipCtx = chipCanvas ? chipCanvas.getContext('2d') : null;
  var depthK = 0, depthOn = false, depthRAF = null;
  /* ── the company swarm — every department runs a harness, every
     harness runs a crew of named agents. IDs are minted from the
     agent's name (FNV-1a hash → hex), so names ARE identity. ── */
  function nameHash(name) {
    var h = 2166136261;
    for (var i = 0; i < name.length; i++) {
      h ^= name.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h;
  }
  function nameId(name) {
    return 'AGT-' + ('0000' + nameHash(name).toString(16).toUpperCase()).slice(-4);
  }
  /* per-dept telemetry ranges [latMs min,max · $/task min,max · cache% min,max] */
  var DEPTS3D = [
    { dept: 'COVERAGE DESK', c: '#22d3ee', pos: [330, -55, 70], lat: [1800, 9200], cost: [0.08, 4.1], cache: [58, 84],
      crew: ['SCRIBE', 'JANITOR', 'MASON', 'ORACLE', 'ABACUS-PRIME', 'QUILL'],
      models: ['QWEN-72B', 'DEEPSEEK-V3.2', 'GPT 5.6', 'FABLE 5 + VERIFY'],
      tasks: ['INGESTING 10-K — PAGE 412/600', 'REBUILDING Q3 HISTORICALS', 'DEEP RESEARCH — MOAT & CAPEX',
        'FACT-CHECK MEMO — 88 CLAIMS', 'DCF SENSITIVITY SWEEP'] },
    { dept: 'PAYROLL', c: '#22c55e', pos: [-320, 70, 110], lat: [420, 1900], cost: [0.01, 0.22], cache: [88, 97],
      crew: ['TALLY', 'ESCROW', 'LEDGER', 'STIPEND', 'WITHHOLD'],
      models: ['DEEPSEEK-V3.2 · BATCH', 'LLAMA-8B · LOCAL'],
      tasks: ['RECONCILING 2,412 STUBS', 'ESCROW SWEEP — 14 ACCOUNTS', 'WITHHOLDING AUDIT Q3',
        'OFF-CYCLE RUN — QUEUED'] },
    { dept: 'SECURITY', c: '#ff5f57', pos: [-140, -160, -190], lat: [64, 310], cost: [0.004, 0.03], cache: [91, 99],
      crew: ['SENTRY', 'CIPHER', 'WARDEN', 'TRIPWIRE', 'AEGIS'],
      models: ['LLAMA-8B · ON-PREM'],
      tasks: ['SCANNING 1,204 EGRESS EVENTS/MIN', 'ROTATING 41 CREDENTIALS', 'TRIAGING 3 ANOMALIES',
        'PERIMETER SWEEP 12/12'] },
    { dept: 'LEGAL', c: '#a78bfa', pos: [180, 160, -170], lat: [2400, 11400], cost: [0.3, 2.9], cache: [49, 71],
      crew: ['CLAUSE', 'VERDICT', 'BRIEF', 'REDLINE'],
      models: ['FABLE 5', 'GPT 5.6'],
      tasks: ['REDLINING MSA §7.2', 'CITATION CHECK — 88 CLAIMS', 'NDA TRIAGE — QUEUE 4',
        'PRECEDENT SEARCH — 3 DOCKETS'] },
    { dept: 'SUPPORT', c: '#f7a600', pos: [40, -185, 200], lat: [380, 1450], cost: [0.008, 0.09], cache: [86, 96],
      crew: ['ECHO', 'TRIAGE', 'CONCIERGE', 'PATCH'],
      models: ['QWEN-72B', 'LLAMA-8B · LOCAL'],
      tasks: ['TICKET BACKLOG 12 → 3', 'DRAFTING RMA RESPONSE', 'ESCALATION TRIAGE — P2',
        'KB ARTICLE REFRESH'] },
    { dept: 'TREASURY', c: '#34d399', pos: [-90, 185, -60], lat: [900, 4200], cost: [0.05, 0.9], cache: [72, 90],
      crew: ['BULLION', 'HEDGE', 'FLOAT'],
      models: ['DEEPSEEK-V3.2', 'FABLE 5 + VERIFY'],
      tasks: ['CASH SWEEP FORECAST', 'FX HEDGE ROLL — EUR 2.1M', 'LIQUIDITY LADDER REBUILD'] },
    { dept: 'INFRA OPS', c: '#8b887c', pos: [175, 65, 330], lat: [45, 220], cost: [0.001, 0.01], cache: [94, 99],
      crew: ['SHUTTLE', 'DAEMON', 'SWEEPER', 'MIRROR'],
      models: ['LLAMA-8B · LOCAL'],
      tasks: ['CACHE EVICTION PASS', 'GPU LEASE ROTATION', 'MIRROR SYNC 98.2%', 'LOG COMPACTION — 14GB'] }
  ];
  var AUTOL3D = [['PROBATION', 2], ['SUPERVISED', 3], ['TRUSTED', 4]];
  var NODES3D = [{ id: 'CORE', name: 'ALLOCATOR', x: 0, y: 0, z: 0, r: 24, c: '#ffb400', kind: 'core', ph: 0 }];
  var EDGES3D = [];
  DEPTS3D.forEach(function (d, dj) {
    var dh = nameHash(d.dept);
    var hub = {
      id: nameId(d.dept), name: d.dept, kind: 'hub', c: d.c, r: 15, di: dj,
      x: d.pos[0], y: d.pos[1], z: d.pos[2], ph: dj * 1.7,
      qd: 4 + dh % 18, ld: 46 + (dh >>> 5) % 34, sla: 92 + (dh >>> 9) % 8
    };
    NODES3D.push(hub);
    var hi = NODES3D.length - 1;
    EDGES3D.push([0, hi, 2]); // trunk: core ↔ harness, double pulse
    d.crew.forEach(function (nm, aj) {
      var h = nameHash(nm);
      /* the crew orbits its harness; position + telemetry both derive from the name */
      var az = (aj / d.crew.length) * 6.2832 + (h % 100) / 100;
      var el = ((h >>> 8) % 100) / 100 - 0.5;
      var rad = 88 + (h % 40);
      var lerp = function (a, b, t) { return a + (b - a) * t; };
      var u1 = ((h >>> 4) % 1000) / 1000, u2 = ((h >>> 12) % 1000) / 1000, u3 = ((h >>> 6) % 1000) / 1000;
      NODES3D.push({
        id: nameId(nm), name: nm, kind: 'agent', c: d.c, r: 7.5 + (h % 4), di: dj,
        x: hub.x + Math.cos(az) * rad, y: hub.y + el * 95, z: hub.z + Math.sin(az) * rad,
        /* real orbital motion — each agent circles its harness at a
           name-seeded speed and direction */
        hubX: hub.x, hubZ: hub.z, az0: az, rad: rad,
        spd: (h & 1 ? 1 : -1) * (0.4 + ((h >>> 10) % 60) / 60) * 0.000028,
        ph: dj * 1.7 + aj,
        lat: lerp(d.lat[0], d.lat[1], u1),
        cost: lerp(d.cost[0], d.cost[1], u2),
        cache: lerp(d.cache[0], d.cache[1], u3),
        /* dossier fields — everything a click needs, minted from the name */
        model: d.models[(h >>> 3) % d.models.length],
        task: d.tasks[(h >>> 14) % d.tasks.length],
        autoL: AUTOL3D[(h >>> 18) % 3][0],
        blocks: AUTOL3D[(h >>> 18) % 3][1]
      });
      EDGES3D.push([hi, NODES3D.length - 1, 1]);
    });
  });
  /* cross-desk audit & data channels — the swarm talks sideways too */
  function findNode(nm) {
    for (var i = 0; i < NODES3D.length; i++) if (NODES3D[i].name === nm) return i;
    return 0;
  }
  [['SECURITY', 'PAYROLL'], ['COVERAGE DESK', 'LEGAL'], ['SUPPORT', 'COVERAGE DESK'],
   ['INFRA OPS', 'SECURITY'], ['TREASURY', 'PAYROLL'], ['WARDEN', 'TALLY'],
   ['CIPHER', 'ORACLE'], ['CLAUSE', 'QUILL']].forEach(function (pr) {
    EDGES3D.push([findNode(pr[0]), findNode(pr[1]), 1]);
  });
  var DUST3D = [];
  for (var di = 0; di < 90; di++) {
    var fr = function (n) { var v = Math.sin(n) * 43758.5453; return v - Math.floor(v); };
    DUST3D.push({
      x: (fr(di * 12.9898) - 0.5) * 1300,
      y: (fr(di * 78.233) - 0.5) * 700,
      z: (fr(di * 39.425) - 0.5) * 900
    });
  }
  /* fleet telemetry: real distributions computed from the swarm itself */
  var AGENT_IDX = [];
  NODES3D.forEach(function (n, i) {
    if (n.kind === 'agent') {
      var ah = nameHash(n.name);
      n.tokSave = 35 + (ah >>> 16) % 50;
      var rawT = 40 + (ah >>> 7) % 960; // K tokens today
      n.tokLine = 'TOK TODAY ' + fmtTok(rawT) + ' RAW → ' +
        fmtTok(rawT * (1 - n.tokSave / 100)) + ' BILLED · −' + n.tokSave + '%';
      AGENT_IDX.push(i);
    }
  });
  function pct(arr, q) {
    var s = arr.slice().sort(function (a, b) { return a - b; });
    return s[Math.min(s.length - 1, Math.floor(q * s.length))];
  }
  var LATS = AGENT_IDX.map(function (i) { return NODES3D[i].lat; });
  var COSTS = AGENT_IDX.map(function (i) { return NODES3D[i].cost; });
  var LAT_P = [pct(LATS, 0.5), pct(LATS, 0.95), pct(LATS, 0.99)];
  var COST_P = [pct(COSTS, 0.5), pct(COSTS, 0.95)];
  function fmtMs(ms) {
    return ms < 1000 ? Math.round(ms) + 'MS' : (ms / 1000).toFixed(1) + 'S';
  }
  var POPS = [], popLast = 0, popN = 0;

  /* ── clickable harnesses — hover highlights, click opens a live
     crew inspector pinned to the hub. Hit zones are rebuilt from the
     projected positions every frame, so they track the orbiting world. */
  var hubHits = [], edgeHits = [], hoverNode = -1, selNode = -1, hoverEdge = -1, selEdge = -1;
  function segDist2(px, py, x1, y1, x2, y2) {
    var vx = x2 - x1, vy = y2 - y1;
    var len2 = vx * vx + vy * vy;
    var u = len2 ? Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / len2)) : 0;
    var dx = px - (x1 + vx * u), dy = py - (y1 + vy * u);
    return dx * dx + dy * dy;
  }
  if (depthCanvas && !REDUCED) {
    depthCanvas.addEventListener('pointermove', function (e) {
      var rc = depthCanvas.getBoundingClientRect();
      var mx2 = e.clientX - rc.left, my2 = e.clientY - rc.top;
      hoverNode = -1; hoverEdge = -1;
      var best = Infinity;
      for (var hi2 = 0; hi2 < hubHits.length; hi2++) {
        var hh = hubHits[hi2];
        var dx = mx2 - hh.x, dy = my2 - hh.y;
        var dd = dx * dx + dy * dy, rr = (hh.r + 12) * (hh.r + 12);
        if (dd < rr && dd < best) { best = dd; hoverNode = hh.i; }
      }
      if (hoverNode < 0) { /* nodes win; otherwise try the wires */
        var bestE = 49; // within 7px of the line
        for (var ei2 = 0; ei2 < edgeHits.length; ei2++) {
          var eh = edgeHits[ei2];
          var d2 = segDist2(mx2, my2, eh.x1, eh.y1, eh.x2, eh.y2);
          if (d2 < bestE) { bestE = d2; hoverEdge = eh.ei; }
        }
      }
      depthCanvas.style.cursor = (hoverNode >= 0 || hoverEdge >= 0) ? 'pointer' : '';
    });
    depthCanvas.addEventListener('click', function () {
      if (hoverNode >= 0) {
        selNode = selNode === hoverNode ? -1 : hoverNode;
        selEdge = -1;
      } else if (hoverEdge >= 0) {
        selEdge = selEdge === hoverEdge ? -1 : hoverEdge;
        selNode = -1;
      } else {
        selNode = -1; selEdge = -1;
      }
    });
  }

  /* ── the dive path — camera keyframes over the depth act ──
     wide arrival → into the SECURITY harness → close-up CIPHER →
     whoosh across the backplane → close-up ORACLE (coverage desk)
     → parting pull-back over the desk. Targets are node names. */
  var CAMK = [
    { d: 0.00, n: null, cz: 980 },
    { d: 0.28, n: null, cz: 280 },
    { d: 0.40, n: 'SECURITY', cz: -140 },
    { d: 0.45, n: 'CIPHER', cz: -300 },
    { d: 0.56, n: 'CIPHER', cz: -300 },
    { d: 0.63, n: 'TALLY', cz: -280 },
    { d: 0.73, n: 'TALLY', cz: -300 },
    { d: 0.79, n: 'ORACLE', cz: -270 },
    { d: 0.90, n: 'ORACLE', cz: -300 },
    { d: 1.00, n: null, cz: 440 } // the finale: pull all the way back out to the whole company
  ];
  CAMK.forEach(function (kf) { kf.i = kf.n ? findNode(kf.n) : -1; });
  function camAt(d) {
    var a = CAMK[0], b = CAMK[CAMK.length - 1];
    for (var i = 0; i < CAMK.length - 1; i++) {
      if (d >= CAMK[i].d && d <= CAMK[i + 1].d) { a = CAMK[i]; b = CAMK[i + 1]; break; }
    }
    var u = b.d === a.d ? 0 : (d - a.d) / (b.d - a.d);
    u = u * u * (3 - 2 * u);
    var O = { x: 0, y: 0, z: 0 };
    var pa = a.i >= 0 ? NODES3D[a.i] : O, pb = b.i >= 0 ? NODES3D[b.i] : O;
    return {
      x: pa.x + (pb.x - pa.x) * u,
      y: pa.y + (pb.y - pa.y) * u,
      z: pa.z + (pb.z - pa.z) * u,
      cz: a.cz + (b.cz - a.cz) * u
    };
  }
  /* agent dossiers shown during the close-up holds */
  var CLOSEUPS = [
    { n: 'CIPHER', d0: 0.42, d1: 0.57, dept: 'SECURITY', model: 'LLAMA-8B · ON-PREM',
      task: 'SCANNING 1,204 EGRESS EVENTS / MIN', tok: 'TOK TODAY 412K RAW → 9K BILLED · −98%',
      auto: 'TRUSTED', blocks: 4 },
    { n: 'TALLY', d0: 0.64, d1: 0.74, dept: 'PAYROLL', model: 'DEEPSEEK-V3.2 · BATCH',
      task: 'PAYCYCLE — 2,412 STUBS RECONCILED', tok: 'TOK TODAY 1.8M RAW → 210K BILLED · −88%',
      auto: 'SUPERVISED', blocks: 3 },
    { n: 'ORACLE', d0: 0.80, d1: 0.92, dept: 'COVERAGE DESK', model: 'GPT 5.6 + FABLE 5 VERIFY',
      task: 'DEEP RESEARCH — NVDA MOAT & CAPEX CYCLE', tok: 'TOK TODAY 6.1M RAW → 2.2M BILLED · −64%',
      auto: 'PROBATION', blocks: 2 }
  ];
  CLOSEUPS.forEach(function (cu) { cu.i = findNode(cu.n); });
  /* ── the hand-off: as the door opens, the six registry rows are cut
     off the page and fly as work packets to their agents in the
     harness. Scrub-driven — rewinding sucks them back onto the page. */
  var CHIPS3D = [
    { l: '01 INGEST 10-K/10-Q', s: '312K TOK', c: '#22c55e', tgt: 'SCRIBE' },
    { l: '02 NORMALIZE XBRL', s: '60K TOK', c: '#8b887c', tgt: 'JANITOR' },
    { l: '03 HISTORICALS', s: '140K TOK', c: '#22c55e', tgt: 'MASON' },
    { l: '04 DEEP RESEARCH', s: '1.4M TOK', c: '#22d3ee', tgt: 'ORACLE' },
    { l: '05 DCF & WACC', s: '260K TOK', c: '#22d3ee', tgt: 'ABACUS-PRIME' },
    { l: '06 MEMO + AUDIT', s: '120K TOK', c: '#22c55e', tgt: 'QUILL' }
  ];
  CHIPS3D.forEach(function (c) { c.i = findNode(c.tgt); });
  var COVHUB3D = findNode('COVERAGE DESK');

  /* real traffic riding the wires — a pulse picks a new message each lap */
  var MSGS3D = [
    'REQ VERIFY CLAIM#0124', 'GRANT $0.40 BUDGET', 'CTX 12K TOK', 'ESC → HUMAN DESK',
    'CACHE HIT · 0.1×', 'ID AUTH OK', 'ROUTE → QWEN-72B', 'P&L +$12.40',
    'HALT BLAST-R:6', 'AUDIT PASS 96.8%', 'TOK −58%', 'BUDGET 74% USED',
    'CKPT SAVED t+041', 'REVALIDATE WACC', 'SPAWN SUBAGENT', 'LEASE GPU 40S'
  ];

  function sizeDepth() {
    if (!depthCanvas) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = stage.offsetWidth, h = stage.offsetHeight;
    if (depthCanvas.width !== (w * dpr | 0)) {
      depthCanvas.width = w * dpr; depthCanvas.height = h * dpr;
      depthCanvas.style.width = w + 'px'; depthCanvas.style.height = h + 'px';
    }
    if (chipCanvas && chipCanvas.width !== (w * dpr | 0)) {
      chipCanvas.width = w * dpr; chipCanvas.height = h * dpr;
      chipCanvas.style.width = w + 'px'; chipCanvas.style.height = h + 'px';
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
    var t = REDUCED ? 0 : now;
    hubHits.length = 0; edgeHits.length = 0; // hit zones rebuilt from this frame's projection
    /* step the orbits before the camera samples its target — close-up
       holds then track the moving agent */
    NODES3D.forEach(function (n) {
      if (n.kind !== 'agent') return;
      var az = n.az0 + t * n.spd;
      n.x = n.hubX + Math.cos(az) * n.rad;
      n.z = n.hubZ + Math.sin(az) * n.rad;
    });
    var cam = camAt(k);
    /* the world orbit damps as we get inside a harness — the camera then
       slow-orbits the focal agent instead of spinning the whole room */
    var insideK = clamp((k - 0.3) / 0.14) * (1 - clamp((k - 0.9) / 0.08)); // orbit resumes on the way out
    var arriveK = clamp(k / 0.3);
    arriveK = arriveK * arriveK * (3 - 2 * arriveK);
    var rotY = t * 0.0001 * (1 - 0.72 * insideK) + 0.85 * (1 - arriveK);
    var camZ = cam.cz;
    /* center in the visible viewport slice, not the (possibly taller) stage */
    var FOCAL = 640, cx = w / 2;
    var vh = Math.min(h, window.innerHeight);
    var cy = vh / 2 - 14;
    var cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    function proj(p) {
      /* clusters breathe — each node bobs on its own phase */
      var by = p.ph !== undefined ? Math.sin(t * 0.0006 + p.ph) * 7 : 0;
      var wx = p.x - cam.x, wy = p.y + by - cam.y, wz = p.z - cam.z;
      var x = wx * cosY + wz * sinY;
      var z = -wx * sinY + wz * cosY;
      var s = FOCAL / (FOCAL + z + camZ);
      if (s <= 0.05) return null;
      if (s > 3.4) s = 3.4; // right at the camera plane — keep sizes sane
      return { x: cx + x * s, y: cy + wy * s, s: s, z: z };
    }

    /* vignette + core glow set the room */
    var vg = g.createRadialGradient(cx, cy, 60, cx, cy, Math.max(w, h) * 0.7);
    vg.addColorStop(0, 'rgba(255,180,0,' + (0.05 * k) + ')');
    vg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);

    /* the floor — a faint perspective grid grounds the room in 3D */
    var gk = 0.055 * k * clamp((k - 0.08) / 0.15);
    if (gk > 0.003) {
      g.strokeStyle = '#8b887c';
      g.lineWidth = 0.7;
      for (var gi = -4; gi <= 4; gi++) {
        var q = gi * 200;
        var e1 = proj({ x: -800, y: 268, z: q }), e2 = proj({ x: 800, y: 268, z: q });
        if (e1 && e2) {
          g.globalAlpha = gk * (0.4 + 0.6 * Math.min(e1.s, e2.s));
          g.beginPath(); g.moveTo(e1.x, e1.y); g.lineTo(e2.x, e2.y); g.stroke();
        }
        var f1 = proj({ x: q, y: 268, z: -800 }), f2 = proj({ x: q, y: 268, z: 800 });
        if (f1 && f2) {
          g.globalAlpha = gk * (0.4 + 0.6 * Math.min(f1.s, f2.s));
          g.beginPath(); g.moveTo(f1.x, f1.y); g.lineTo(f2.x, f2.y); g.stroke();
        }
      }
      g.globalAlpha = 1;
    }

    /* dust — depth parallax with a slow twinkle */
    DUST3D.forEach(function (d, di2) {
      var p = proj(d);
      if (!p) return;
      var tw = 0.55 + 0.45 * Math.sin(t * 0.003 + di2 * 1.9);
      g.fillStyle = 'rgba(235,232,224,' + (0.14 * p.s * k * tw).toFixed(3) + ')';
      g.fillRect(p.x, p.y, 1.4 * p.s + 0.4, 1.4 * p.s + 0.4);
    });

    /* orbit rings — every harness wears its crew's orbit in its color */
    NODES3D.forEach(function (n) {
      if (n.kind !== 'hub') return;
      var hp = proj(n);
      if (!hp) return;
      g.strokeStyle = n.c;
      g.lineWidth = 0.8;
      g.beginPath();
      var pr = null;
      for (var si = 0; si <= 30; si++) {
        var ang = si / 30 * 6.2832;
        var rp = proj({ x: n.x + Math.cos(ang) * 108, y: n.y, z: n.z + Math.sin(ang) * 108 });
        if (!rp) { pr = null; continue; }
        if (pr) g.lineTo(rp.x, rp.y); else g.moveTo(rp.x, rp.y);
        pr = rp;
      }
      g.globalAlpha = (0.05 + 0.1 * hp.s) * k;
      g.stroke();
    });
    g.globalAlpha = 1;

    /* channels + pulses — trunks (core↔harness) run heavier and hotter */
    var P = NODES3D.map(proj);
    EDGES3D.forEach(function (e, ei) {
      var a = P[e[0]], b = P[e[1]];
      if (!a || !b) return;
      var na = NODES3D[e[0]], nb = NODES3D[e[1]];
      var trunk = e[2] === 2;
      var depth = (a.s + b.s) / 2;
      edgeHits.push({ ei: ei, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      var lit = ei === hoverEdge || ei === selEdge;
      var lg = g.createLinearGradient(a.x, a.y, b.x, b.y);
      lg.addColorStop(0, na.c); lg.addColorStop(1, nb.c);
      g.strokeStyle = lg;
      g.globalAlpha = ((trunk ? 0.26 : 0.14) + 0.26 * depth + (lit ? 0.4 : 0)) * k;
      g.lineWidth = (trunk ? 1.7 : 1.0) * depth + (lit ? 0.9 : 0);
      if (!trunk) {
        /* secondary channels are marching dotted lines — traffic direction */
        g.setLineDash([2.2 * depth + 0.6, 6.5 * depth + 2.5]);
        g.lineDashOffset = -((t * 0.022) % 1000);
      }
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      g.setLineDash([]);
      var nPulse = trunk ? 3 : 1;
      for (var j = 0; j < nPulse; j++) {
        var cyc = Math.floor((t * 0.00022) + j / nPulse + ei * 0.173);
        var pt = ((t * 0.00022) + j / nPulse + ei * 0.173) % 1;
        var pp = proj({
          x: na.x + (nb.x - na.x) * pt,
          y: na.y + (nb.y - na.y) * pt,
          z: na.z + (nb.z - na.z) * pt
        });
        if (!pp) continue;
        var pa2 = Math.sin(Math.PI * pt) * k;
        /* halo + core — the packet */
        g.globalAlpha = 0.28 * pa2;
        g.fillStyle = nb.c;
        g.beginPath(); g.arc(pp.x, pp.y, (trunk ? 5 : 3.8) * pp.s, 0, 6.2832); g.fill();
        g.globalAlpha = 0.9 * pa2;
        g.beginPath(); g.arc(pp.x, pp.y, (trunk ? 2.4 : 1.8) * pp.s, 0, 6.2832); g.fill();
        /* every packet carries a payload — some are close enough to read.
           Each lap of the wire picks the next message off the queue. */
        if ((ei + j) % 3 === 0 && pp.s > 0.5) {
          g.globalAlpha = 0.8 * pa2;
          g.textAlign = 'left';
          g.font = '7px "Space Mono", monospace';
          g.fillText(MSGS3D[(ei * 3 + j + cyc) % MSGS3D.length], pp.x + 8, pp.y - 5);
        }
      }
    });
    g.globalAlpha = 1;

    /* nodes — glow, core, ring, labels; painter's order back-to-front.
       Hubs always carry name + minted ID; agents earn their label as
       the camera (or the orbit) brings them close. */
    var order = NODES3D.map(function (n, i) { return i; })
      .sort(function (i, j) { return P[j] && P[i] ? P[j].z - P[i].z : 0; });
    order.forEach(function (i) {
      var n = NODES3D[i], p = P[i];
      if (!p) return;
      var r = n.r * p.s * 1.35;
      var glow = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2);
      glow.addColorStop(0, n.c); glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = (n.kind === 'agent' ? 0.12 : 0.18) * k;
      g.fillStyle = glow;
      g.beginPath(); g.arc(p.x, p.y, r * 3.2, 0, 6.2832); g.fill();
      g.globalAlpha = (0.35 + 0.6 * p.s) * k;
      g.fillStyle = '#08090c';
      g.beginPath(); g.arc(p.x, p.y, r, 0, 6.2832); g.fill();
      g.strokeStyle = n.c; g.lineWidth = n.kind === 'agent' ? 1.1 : 1.4;
      g.beginPath(); g.arc(p.x, p.y, r, 0, 6.2832); g.stroke();
      g.fillStyle = n.c;
      g.beginPath(); g.arc(p.x, p.y, Math.max(1.4, r * 0.3), 0, 6.2832); g.fill();
      if (n.kind === 'core') { /* breathing double ring + radar sweep on the core */
        g.globalAlpha = (0.25 + 0.2 * Math.sin(t * 0.002)) * k;
        g.beginPath(); g.arc(p.x, p.y, r * 1.7, 0, 6.2832); g.stroke();
        g.globalAlpha = 0.12 * k;
        g.beginPath(); g.arc(p.x, p.y, r * 2.3, 0, 6.2832); g.stroke();
        var sa = t * 0.0012;
        g.globalAlpha = 0.4 * k;
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(p.x, p.y, r * 2.0, sa, sa + 0.85); g.stroke();
        g.lineWidth = 1.4;
      }
      if (n.kind !== 'core') {
        /* every harness AND every agent dot is a target — small dots
           get an inflated hit radius */
        hubHits.push({ i: i, x: p.x, y: p.y, r: Math.max(r, 9) });
        if (i === hoverNode || i === selNode) {
          g.globalAlpha = (i === selNode ? 0.85 : 0.55) * k;
          g.strokeStyle = n.c; g.lineWidth = 1.6;
          g.beginPath(); g.arc(p.x, p.y, r * 1.55 + 3, 0, 6.2832); g.stroke();
          g.globalAlpha = 0.2 * k;
          g.beginPath(); g.arc(p.x, p.y, r * 2.1 + 5, 0, 6.2832); g.stroke();
        }
      }
      var lk = clamp((k - 0.35) / 0.4);
      if (n.kind === 'agent') {
        /* close agents show their name; the very close also flash the ID */
        var na2 = lk * clamp((p.s - 0.7) / 0.18);
        if (na2 > 0.03) {
          g.globalAlpha = na2 * 0.95;
          g.textAlign = 'center';
          g.fillStyle = '#ebe8e0';
          g.font = '700 ' + Math.round(9 * (0.75 + p.s * 0.4)) + 'px "Space Mono", monospace';
          g.fillText(n.name, p.x, p.y + r + 13);
          var ia = na2 * clamp((p.s - 0.86) / 0.12);
          if (ia > 0.03) {
            g.globalAlpha = ia * 0.8;
            g.fillStyle = n.c;
            g.font = Math.round(7.5 * (0.75 + p.s * 0.4)) + 'px "Space Mono", monospace';
            g.fillText(n.id, p.x, p.y + r + 24);
          }
        }
      } else {
        var la = lk * (0.5 + 0.5 * p.s);
        if (la > 0.02) {
          g.globalAlpha = la;
          g.textAlign = 'center';
          g.fillStyle = n.kind === 'core' ? '#ffb400' : n.c;
          g.font = '700 ' + Math.round(10.5 * (0.7 + p.s * 0.5)) + 'px "Space Mono", monospace';
          g.fillText(n.kind === 'core' ? 'ALLOCATOR CORE' : 'HARNESS · ' + n.name, p.x, p.y + r + 16);
          g.fillStyle = 'rgba(139,136,124,0.9)';
          g.font = Math.round(8.5 * (0.7 + p.s * 0.5)) + 'px "Space Mono", monospace';
          g.fillText(n.kind === 'core' ? 'CAPITAL · VERIFICATION · AUTONOMY' : n.id, p.x, p.y + r + 28);
          if (n.kind === 'hub') {
            /* live desk stats under every harness — load breathes */
            var hl = n.ld + Math.round(6 * Math.sin(t * 0.0009 + n.ph));
            g.globalAlpha = la * 0.85;
            g.fillStyle = n.c;
            g.font = '700 ' + Math.round(7.5 * (0.7 + p.s * 0.5)) + 'px "Space Mono", monospace';
            g.fillText('LOAD ' + hl + '% · Q ' + n.qd + ' · SLA 99.' + n.sla + '%', p.x, p.y + r + 40);
          }
        }
      }
      g.globalAlpha = 1;
    });

    /* work packets — the registry rows peel off the swinging page and
       fly curved paths onto their coverage-desk agents. Source anchors
       track the live DOM rows (mid door-swing), targets track the
       orbiting nodes, so both ends of every flight are alive. */
    if (chipCtx) {
      var gc = chipCtx;
      gc.setTransform(dpr, 0, 0, dpr, 0, 0);
      gc.clearRect(0, 0, w, h);
      if (k > 0.03 && k < 0.48 && agents.length) {
        var cRect = depthCanvas.getBoundingClientRect();
        var doneN = 0, flying = false;
        CHIPS3D.forEach(function (ch, ci2) {
          var u = (k - (0.05 + ci2 * 0.024)) / 0.17;
          var row = agents[ci2];
          /* the source row flashes at the cut, then sits emptied */
          if (row) {
            row.classList.toggle('cutting', u > 0 && u < 0.12);
            row.classList.toggle('cut', u >= 0.12);
          }
          if (u >= 1) doneN++;
          if (u <= 0 || u > 1.3) return;
          flying = true;
          var tp = P[ch.i];
          if (!tp) return;
          var uu = Math.min(1, u);
          var e2 = uu * uu * (3 - 2 * uu);
          var sx = w * 0.3, sy = vh * (0.25 + ci2 * 0.1);
          if (row) {
            var rr2 = row.getBoundingClientRect();
            if (rr2.width) {
              sx = rr2.left + rr2.width * 0.5 - cRect.left;
              sy = rr2.top + rr2.height * 0.5 - cRect.top;
            }
          }
          /* high quadratic arc — the packets fly OVER the swarm, not
             through it, with alternating sweep */
          var mxx = (sx + tp.x) / 2 + ((ci2 % 2) ? 1 : -1) * (110 + ci2 * 28);
          var myy = Math.min(sy, tp.y) - 130 - ci2 * 16;
          function bez(e) {
            var i2 = 1 - e;
            return {
              x: i2 * i2 * sx + 2 * i2 * e * mxx + e * e * tp.x,
              y: i2 * i2 * sy + 2 * i2 * e * myy + e * e * tp.y
            };
          }
          var b = bez(e2), bx = b.x, by = b.y;
          var sc = 1 - 0.62 * e2;
          var al = (uu < 0.06 ? uu / 0.06 : 1) * (uu > 0.9 ? (1 - uu) / 0.1 : 1);
          /* the cut itself — a bright scissor-line across the row */
          if (u < 0.08 && row) {
            gc.globalAlpha = Math.sin(Math.PI * (u / 0.08)) * 0.8;
            gc.strokeStyle = '#ffb400'; gc.lineWidth = 1.5;
            gc.beginPath(); gc.moveTo(sx - 130, sy); gc.lineTo(sx + 130, sy); gc.stroke();
          }
          /* target anticipation — the agent glows as its work approaches */
          if (uu > 0.5) {
            var ant = (uu - 0.5) / 0.5;
            var ag2 = gc.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, 30);
            ag2.addColorStop(0, ch.c); ag2.addColorStop(1, 'rgba(0,0,0,0)');
            gc.globalAlpha = ant * 0.3;
            gc.fillStyle = ag2;
            gc.beginPath(); gc.arc(tp.x, tp.y, 30, 0, 6.2832); gc.fill();
            if (uu < 0.95) {
              gc.globalAlpha = Math.sin(Math.PI * ant) * 0.85;
              gc.textAlign = 'center';
              gc.fillStyle = ch.c;
              gc.font = '700 7px "Space Mono", monospace';
              gc.fillText('RECEIVING…', tp.x, tp.y - 24);
            }
          }
          if (al > 0.02) {
            /* sparkle trail — ghosts of the recent path */
            for (var tj = 1; tj <= 4; tj++) {
              var ue = e2 - tj * 0.05;
              if (ue <= 0) break;
              var tb = bez(ue);
              gc.globalAlpha = al * 0.3 * (1 - tj / 5);
              gc.fillStyle = ch.c;
              gc.beginPath(); gc.arc(tb.x, tb.y, (2.6 - tj * 0.5) * sc, 0, 6.2832); gc.fill();
            }
            /* banking — the chip rotates into its flight tangent */
            var db = bez(Math.min(1, e2 + 0.02));
            var bank = Math.max(-0.22, Math.min(0.22, Math.atan2(db.y - by, db.x - bx) * 0.35));
            var cwp = 150 * sc, chp = 30 * sc;
            gc.save();
            gc.translate(bx, by);
            gc.rotate(bank);
            gc.globalAlpha = al * 0.95;
            gc.fillStyle = 'rgba(8,9,12,0.95)';
            gc.fillRect(-cwp / 2, -chp / 2, cwp, chp);
            gc.strokeStyle = ch.c; gc.lineWidth = 1;
            gc.strokeRect(-cwp / 2 + 0.5, -chp / 2 + 0.5, cwp - 1, chp - 1);
            gc.fillStyle = ch.c;
            gc.fillRect(-cwp / 2, -chp / 2, 2, chp);
            if (sc > 0.48) {
              gc.textAlign = 'left';
              gc.fillStyle = '#ebe8e0';
              gc.font = '700 ' + Math.max(6.5, 9 * sc).toFixed(1) + 'px "Space Mono", monospace';
              gc.fillText(ch.l, -cwp / 2 + 8 * sc, -2 * sc);
              gc.fillStyle = '#8b887c';
              gc.font = Math.max(6, 7.5 * sc).toFixed(1) + 'px "Space Mono", monospace';
              gc.fillText(ch.s, -cwp / 2 + 8 * sc, 9 * sc);
            }
            gc.restore();
          }
          /* landing — flash, TASK ACCEPTED, and a report-in pulse
             running up the wire to the harness */
          if (u > 0.86) {
            var fl = Math.min(1, (u - 0.86) / 0.34);
            gc.globalAlpha = (1 - fl) * 0.85;
            gc.strokeStyle = ch.c; gc.lineWidth = 1.6;
            gc.beginPath(); gc.arc(tp.x, tp.y, 6 + fl * 34, 0, 6.2832); gc.stroke();
            gc.globalAlpha = (1 - fl) * 0.35;
            gc.fillStyle = ch.c;
            gc.beginPath(); gc.arc(tp.x, tp.y, 5 + fl * 12, 0, 6.2832); gc.fill();
          }
          if (u > 1) {
            var pu = Math.min(1, (u - 1) / 0.3);
            gc.globalAlpha = Math.sin(Math.PI * pu) * 0.9;
            gc.textAlign = 'center';
            gc.fillStyle = '#22c55e';
            gc.font = '700 7.5px "Space Mono", monospace';
            gc.fillText('TASK ACCEPTED', tp.x, tp.y - 24);
            var hp4 = P[COVHUB3D];
            if (hp4) { /* the agent reports in to its harness */
              gc.fillStyle = ch.c;
              gc.beginPath();
              gc.arc(tp.x + (hp4.x - tp.x) * pu, tp.y + (hp4.y - tp.y) * pu, 2.4, 0, 6.2832);
              gc.fill();
            }
          }
          gc.globalAlpha = 1;
        });
        /* distribution counter rides top-center through the hand-off */
        if (flying || (doneN > 0 && k < 0.44)) {
          var cAl = doneN === 6 ? 1 - clamp((k - 0.38) / 0.06) : 1;
          if (cAl > 0.02) {
            gc.globalAlpha = cAl;
            gc.textAlign = 'center';
            gc.fillStyle = doneN === 6 ? '#22c55e' : '#ffb400';
            gc.font = '700 10px "Space Mono", monospace';
            gc.fillText(doneN === 6 ? 'ORDER DISTRIBUTED — 6/6 ACCEPTED'
              : 'DISTRIBUTING ORDER — ' + doneN + '/6 DELIVERED', cx, 72);
            gc.globalAlpha = 1;
          }
        }
      } else if (agents.length && k <= 0.03) {
        /* rewound past the cut — restore the rows */
        agents.forEach(function (row) { row.classList.remove('cutting', 'cut'); });
      }
    }

    /* telemetry popups — real per-agent numbers surface and fade,
       like tapping nodes on an ops console. They spawn on the wide
       shot; the close-up dossiers take over once we're inside. */
    if (t > 0 && k > 0.22) {
      if (t - popLast > 540 && k < 0.9) { // quiet on the closing shot
        /* on the wide shot anyone can speak; inside a harness only the
           agents around the camera surface their numbers */
        var cands = [];
        AGENT_IDX.forEach(function (i2) {
          var pi = P[i2];
          if (pi && pi.s > (k < 0.4 ? 0.2 : 0.72) &&
              pi.x > 40 && pi.x < w - 40 && pi.y > 60 && pi.y < vh - 90) cands.push(i2);
        });
        if (cands.length) {
          popLast = t; popN++;
          POPS.push({ i: cands[(popN * 11 + 5) % cands.length], t0: t, m: popN % 4 });
          if (POPS.length > 7) POPS.shift();
        }
      }
      POPS.forEach(function (pop) {
        var lt = (t - pop.t0) / 2100;
        if (lt >= 1) return;
        var n = NODES3D[pop.i], p = P[pop.i];
        if (!p) return;
        var a = Math.sin(Math.PI * lt) * k;
        var r = n.r * p.s * 1.35;
        var ty = p.y - r - 10 - 16 * lt;
        var msg = pop.m === 0 ? 'P95 ' + fmtMs(n.lat)
          : pop.m === 1 ? (n.cost < 0.01 ? '<$0.01' : '$' + n.cost.toFixed(2)) + '/TASK'
          : pop.m === 2 ? 'CACHE ' + Math.round(n.cache) + '%'
          : 'TOK −' + n.tokSave + '%';
        g.globalAlpha = a * 0.5;
        g.strokeStyle = n.c; g.lineWidth = 1;
        g.beginPath(); g.moveTo(p.x, p.y - r - 2); g.lineTo(p.x, ty + 3); g.stroke();
        g.globalAlpha = a;
        g.textAlign = 'center';
        g.fillStyle = n.c;
        g.font = '700 10px "Space Mono", monospace';
        g.fillText(msg, p.x, ty);
        g.globalAlpha = a * 0.75;
        g.fillStyle = '#8b887c';
        g.font = '7.5px "Space Mono", monospace';
        g.fillText(n.name, p.x, ty - 11);
      });
      g.globalAlpha = 1;
    }

    /* dossier renderer — used by the scripted close-ups AND by clicks
       on any agent dot */
    function drawDossier(n, p, a, cfg, ci) {
      var nR = n.r * p.s * 1.35;
      /* sonar ping — the agent under the lens announces itself */
      var ping = (t % 1600) / 1600;
      g.globalAlpha = a * (1 - ping) * 0.5;
      g.strokeStyle = n.c;
      g.lineWidth = 1.2;
      g.beginPath(); g.arc(p.x, p.y, nR + ping * 46 * p.s, 0, 6.2832); g.stroke();
      var cw = 262, chh = 128;
      var x = p.x + nR + 36;
      if (x + cw > w - 16) x = p.x - nR - 36 - cw;
      x = Math.max(16, Math.min(w - cw - 16, x));
      var y = Math.max(52, Math.min(vh - chh - 40, p.y - chh / 2));
      /* leader line node → card */
      g.globalAlpha = a * 0.55;
      g.strokeStyle = n.c; g.lineWidth = 1;
      g.beginPath();
      g.moveTo(p.x + (x > p.x ? nR : -nR), p.y);
      g.lineTo(x > p.x ? x : x + cw, y + chh / 2);
      g.stroke();
      /* the card */
      g.globalAlpha = a * 0.94;
      g.fillStyle = 'rgba(8,9,12,0.94)';
      g.fillRect(x, y, cw, chh);
      g.strokeStyle = n.c; g.lineWidth = 1;
      g.strokeRect(x + 0.5, y + 0.5, cw - 1, chh - 1);
      g.fillStyle = n.c; g.fillRect(x, y, 2, chh);
      g.textAlign = 'left';
      g.fillStyle = '#ebe8e0';
      g.font = '700 11px "Space Mono", monospace';
      g.fillText(n.name + ' · ' + n.id, x + 12, y + 19);
      g.textAlign = 'right';
      g.fillStyle = n.c;
      g.font = '700 8px "Space Mono", monospace';
      g.fillText(cfg.dept, x + cw - 10, y + 19);
      g.textAlign = 'left';
      g.fillStyle = '#8b887c';
      g.font = '9px "Space Mono", monospace';
      g.fillText('MODEL  ' + cfg.model, x + 12, y + 37);
      g.fillStyle = '#ebe8e0';
      g.fillText('TASK   ' + cfg.task, x + 12, y + 52);
      /* live meters — numbers breathe so the card feels wired in */
      var jl = n.lat * (1 + 0.05 * Math.sin(t * 0.0031 + ci * 2));
      var jc = n.cost < 0.01 ? '<$0.01' : '$' + (n.cost * (1 + 0.03 * Math.sin(t * 0.0023))).toFixed(2);
      g.fillStyle = '#8b887c';
      g.fillText('P95 ' + fmtMs(jl) + ' · ' + jc + '/TASK · CACHE ' + Math.round(n.cache) + '%', x + 12, y + 68);
      g.fillStyle = '#22c55e';
      g.fillText(cfg.tok, x + 12, y + 83);
      /* autonomy blocks */
      g.fillStyle = '#8b887c';
      g.fillText('AUTONOMY', x + 12, y + 99);
      for (var bi = 0; bi < 5; bi++) {
        g.fillStyle = bi < cfg.blocks ? n.c : 'rgba(139,136,124,0.25)';
        g.fillRect(x + 76 + bi * 13, y + 92, 9, 7);
      }
      g.fillStyle = n.c;
      g.fillText(cfg.auto, x + 150, y + 99);
      /* live activity bars along the card foot */
      for (var ai = 0; ai < 26; ai++) {
        var bh = 3 + 8 * Math.abs(Math.sin(ai * 1.7 + t * 0.004 + ci * 3));
        g.fillStyle = 'rgba(235,232,224,' + (0.14 + 0.2 * (bh / 11)) + ')';
        g.fillRect(x + 12 + ai * 9, y + chh - 10 - bh, 5, bh);
      }
      g.globalAlpha = 1;
    }

    /* the scripted close-up holds pin their cards to the flight path */
    CLOSEUPS.forEach(function (cu, ci) {
      var a = clamp((k - cu.d0) / 0.04) * (1 - clamp((k - (cu.d1 - 0.04)) / 0.04));
      if (a <= 0.02) return;
      var n = NODES3D[cu.i], p = P[cu.i];
      if (!p) return;
      drawDossier(n, p, a, cu, ci);
    });

    /* clicked agent dot → its dossier, generated from the node itself */
    if (selNode >= 0 && NODES3D[selNode].kind === 'agent') {
      var san = NODES3D[selNode], sap = P[selNode];
      if (sap) {
        drawDossier(san, sap, 1, {
          dept: DEPTS3D[san.di].dept, model: san.model, task: san.task,
          tok: san.tokLine, auto: san.autoL, blocks: san.blocks
        }, san.di);
      }
    }

    /* clicked wire → channel panel: who talks to whom, how hot the
       line runs, and the payload currently in flight */
    if (selEdge >= 0) {
      var se = EDGES3D[selEdge];
      var sa2 = P[se[0]], sb2 = P[se[1]];
      if (sa2 && sb2) {
        var ena = NODES3D[se[0]], enb = NODES3D[se[1]];
        var eTrunk = se[2] === 2;
        var ew = 286, ehh = 78;
        var ex = (sa2.x + sb2.x) / 2 + 18;
        ex = Math.max(16, Math.min(w - ew - 16, ex));
        var ey = Math.max(52, Math.min(vh - ehh - 40, (sa2.y + sb2.y) / 2 - ehh - 14));
        var ehash = nameHash(ena.name + enb.name);
        var erate = 24 + ehash % 160 + Math.round(9 * Math.sin(t * 0.0014 + selEdge));
        var ecyc = Math.floor((t * 0.00022) + selEdge * 0.173);
        g.globalAlpha = 0.95 * k;
        g.fillStyle = 'rgba(8,9,12,0.95)';
        g.fillRect(ex, ey, ew, ehh);
        g.strokeStyle = enb.c; g.lineWidth = 1;
        g.strokeRect(ex + 0.5, ey + 0.5, ew - 1, ehh - 1);
        g.fillStyle = enb.c; g.fillRect(ex, ey, 2, ehh);
        g.textAlign = 'left';
        g.fillStyle = '#ebe8e0';
        g.font = '700 10px "Space Mono", monospace';
        g.fillText('CHANNEL · ' + ena.name + ' ⇄ ' + enb.name, ex + 12, ey + 18);
        g.fillStyle = '#8b887c';
        g.font = '8px "Space Mono", monospace';
        g.fillText(ena.id + ' → ' + enb.id + (eTrunk ? ' · TRUNK LINE' : ' · PEER LINK'), ex + 12, ey + 33);
        g.fillText('RATE ' + erate + ' MSG/S · ENC AES-256-GCM · QOS ' + (eTrunk ? 'P0' : 'P2'), ex + 12, ey + 48);
        g.fillStyle = enb.c;
        g.font = '700 8.5px "Space Mono", monospace';
        g.fillText('IN FLIGHT  ' + MSGS3D[(selEdge * 3 + ecyc) % MSGS3D.length], ex + 12, ey + 64);
        g.globalAlpha = 1;
      }
    }

    /* harness inspector — click a hub, meet the crew */
    if (selNode >= 0 && NODES3D[selNode].kind === 'hub') {
      var hn = NODES3D[selNode], hp3 = P[selNode];
      if (hp3) {
        var crew2 = [];
        NODES3D.forEach(function (n2, i2) {
          if (n2.kind === 'agent' && n2.di === hn.di) crew2.push(n2);
        });
        var pw = 318, phh = 64 + crew2.length * 15;
        var hnR = hn.r * hp3.s * 1.35;
        var px2 = hp3.x + hnR + 40;
        if (px2 + pw > w - 16) px2 = hp3.x - hnR - 40 - pw;
        px2 = Math.max(16, Math.min(w - pw - 16, px2));
        var py2 = Math.max(52, Math.min(vh - phh - 40, hp3.y - phh / 2));
        g.globalAlpha = 0.55 * k;
        g.strokeStyle = hn.c; g.lineWidth = 1;
        g.beginPath();
        g.moveTo(hp3.x + (px2 > hp3.x ? hnR : -hnR), hp3.y);
        g.lineTo(px2 > hp3.x ? px2 : px2 + pw, py2 + phh / 2);
        g.stroke();
        g.globalAlpha = 0.95 * k;
        g.fillStyle = 'rgba(8,9,12,0.95)';
        g.fillRect(px2, py2, pw, phh);
        g.strokeRect(px2 + 0.5, py2 + 0.5, pw - 1, phh - 1);
        g.fillStyle = hn.c; g.fillRect(px2, py2, 2, phh);
        g.textAlign = 'left';
        g.fillStyle = hn.c;
        g.font = '700 11px "Space Mono", monospace';
        g.fillText('HARNESS · ' + hn.name, px2 + 12, py2 + 19);
        g.textAlign = 'right';
        g.fillStyle = '#8b887c';
        g.font = '8px "Space Mono", monospace';
        g.fillText(hn.id + ' · ✕ CLICK TO CLOSE', px2 + pw - 10, py2 + 19);
        g.textAlign = 'left';
        var hl2 = hn.ld + Math.round(6 * Math.sin(t * 0.0009 + hn.ph));
        g.font = '9px "Space Mono", monospace';
        g.fillText('LOAD ' + hl2 + '% · QUEUE ' + hn.qd + ' · SLA 99.' + hn.sla + '% · CREW ' + crew2.length, px2 + 12, py2 + 35);
        g.strokeStyle = 'rgba(139,136,124,0.25)';
        g.beginPath(); g.moveTo(px2 + 12, py2 + 42); g.lineTo(px2 + pw - 12, py2 + 42); g.stroke();
        crew2.forEach(function (cn, ri) {
          var ry2 = py2 + 56 + ri * 15;
          g.fillStyle = '#ebe8e0';
          g.font = '700 9px "Space Mono", monospace';
          g.fillText(cn.name, px2 + 12, ry2);
          g.fillStyle = '#8b887c';
          g.font = '8px "Space Mono", monospace';
          g.fillText(cn.id.slice(4), px2 + 102, ry2);
          g.fillText('P95 ' + fmtMs(cn.lat), px2 + 145, ry2);
          g.fillText(cn.cost < 0.01 ? '<$0.01' : '$' + cn.cost.toFixed(2), px2 + 213, ry2);
          g.fillStyle = cn.cache > 85 ? '#22c55e' : '#8b887c';
          g.fillText('C' + Math.round(cn.cache) + '%', px2 + 268, ry2);
        });
        g.globalAlpha = 1;
      }
    }

    /* HUD — live totals up top, fleet-wide distributions + the token
       bill down below on the wide shot; captions narrate the dive. */
    var hud = clamp((k - 0.3) / 0.4);
    /* fleet boards yield to the dive, then return for the zoom-out finale */
    var fleet = hud * Math.max(1 - clamp((k - 0.32) / 0.1), clamp((k - 0.9) / 0.05));
    if (hud > 0.02) {
      g.globalAlpha = hud;
      g.textAlign = 'left';
      g.fillStyle = '#ffb400';
      g.font = '700 11px "Space Mono", monospace';
      g.fillText('BKPL <GO> — SWARM BACKPLANE · ' + DEPTS3D.length + ' HARNESSES · LIVE TOPOLOGY', 24, 34);
      if (selNode < 0) {
        g.fillStyle = '#8b887c';
        g.font = '8.5px "Space Mono", monospace';
        g.globalAlpha = hud * (0.55 + 0.3 * Math.sin(t * 0.002));
        g.fillText('CLICK A HARNESS FOR ITS CREW · CLICK ANY AGENT DOT FOR ITS DOSSIER', 24, 50);
        g.globalAlpha = hud;
      }
      g.textAlign = 'right';
      g.fillStyle = '#8b887c';
      g.font = '10px "Space Mono", monospace';
      var rate = 1180 + Math.round(160 * Math.sin(t * 0.0011));
      g.fillText('AGENTS ' + AGENT_IDX.length + ' · CHANNELS ' + EDGES3D.length + ' · MSGS ' + rate + '/S', w - 24, 34);
      g.globalAlpha = 1;
    }
    if (fleet > 0.02) {
      g.globalAlpha = fleet;
      /* fleet latency + cost distributions, bottom-left */
      g.textAlign = 'left';
      g.fillStyle = '#8b887c';
      g.font = '9.5px "Space Mono", monospace';
      g.fillText('FLEET LATENCY   P50 ' + fmtMs(LAT_P[0]) + ' · P95 ' + fmtMs(LAT_P[1]) + ' · P99 ' + fmtMs(LAT_P[2]), 24, vh - 52);
      g.fillText('COST / TASK     P50 $' + COST_P[0].toFixed(2) + ' · P95 $' + COST_P[1].toFixed(2), 24, vh - 38);
      g.fillText('AUTONOMY MIX    TRUSTED 38% · SUPERVISED 47% · PROBATION 15%', 24, vh - 24);

      /* the token bill, bottom-right — the whole point of the machine */
      var be = 1 - Math.pow(1 - hud, 3);
      var rawM = 38.2, billedM = rawM - (rawM - 14.9) * be;
      g.textAlign = 'right';
      g.fillStyle = '#8b887c';
      g.fillText('TOKEN BILL TODAY', w - 24, vh - 66);
      g.fillStyle = '#ebe8e0';
      g.font = '700 13px "Space Mono", monospace';
      g.fillText(rawM.toFixed(1) + 'M RAW → ' + billedM.toFixed(1) + 'M BILLED', w - 24, vh - 48);
      g.fillStyle = '#22c55e';
      g.font = '700 10px "Space Mono", monospace';
      g.fillText('−' + Math.round((1 - billedM / rawM) * 100) + '% · CACHE + DEDUP + ROUTING', w - 24, vh - 33);
      g.fillStyle = 'rgba(139,136,124,0.35)';
      g.fillRect(w - 174, vh - 26, 150, 3);
      g.fillStyle = '#22c55e';
      g.fillRect(w - 174, vh - 26, 150 * (billedM / rawM), 3);
      g.globalAlpha = 1;
    }
    if (hud > 0.02) {
      /* the dive narration, bottom-center */
      var cap =
        k < 0.34 ? 'CUTTING THE ORDER — SIX WORK PACKETS FLY TO THEIR AGENTS ON THE COVERAGE DESK'
        : k < 0.42 ? 'ENTERING HARNESS · SECURITY — 5 AGENTS ON WATCH'
        : k < 0.58 ? 'CLOSE-UP — CIPHER · LOCAL MODEL, <$0.01 A TASK, TRUSTED AUTONOMY'
        : k < 0.64 ? 'CROSSING → PAYROLL'
        : k < 0.75 ? 'CLOSE-UP — TALLY · 2,412 STUBS A CYCLE, CACHE DOES THE HEAVY LIFTING'
        : k < 0.80 ? 'CROSSING THE BACKPLANE → COVERAGE DESK'
        : k < 0.9 ? 'CLOSE-UP — ORACLE · FRONTIER SPEND ONLY WHERE THE BLAST RADIUS EARNS IT'
        : 'EVERY DESK, EVERY AGENT — ONE ALLOCATOR';
      g.globalAlpha = hud;
      g.textAlign = 'center';
      g.fillStyle = '#8b887c';
      g.font = '10px "Space Mono", monospace';
      g.fillText(cap, cx, vh - 8);
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
    flipNow = d > 0 ? clamp(d / 0.35) : 0; // a quick, decisive door-swing
    renderShell();
    applyTilt();
    /* fade in on entry, and fade to black at the very end — the act
       closes cleanly instead of leaving the swarm hanging under the
       next section as the pin releases */
    /* fast fade-in so the work packets are visible the moment they
       peel off the opening door */
    depthCanvas.style.opacity =
      (clamp(d * 5) * (1 - clamp((d - 0.95) / 0.05))).toFixed(3);
    depthCanvas.style.pointerEvents = d > 0.22 && d < 0.97 ? 'auto' : 'none';
    /* page2's own pointer-events:auto would re-enable clicks inside the
       flipped laptop and shadow the canvas — park it during the act */
    if (page2) page2.style.pointerEvents = d > 0.2 ? 'none' : '';
    var on = d > 0.01;
    if (on && !depthOn) { depthOn = true; depthRAF = requestAnimationFrame(tickDepth); }
    else if (!on && depthOn) {
      depthOn = false;
      selNode = -1; hoverNode = -1; selEdge = -1; hoverEdge = -1;
      depthCanvas.style.cursor = '';
      agents.forEach(function (row) { row.classList.remove('cutting', 'cut'); });
      if (depthRAF) cancelAnimationFrame(depthRAF);
      if (depthCtx) {
        depthCtx.setTransform(1, 0, 0, 1, 0, 0);
        depthCtx.clearRect(0, 0, depthCanvas.width, depthCanvas.height);
      }
      if (chipCtx) {
        chipCtx.setTransform(1, 0, 0, 1, 0, 0);
        chipCtx.clearRect(0, 0, chipCanvas.width, chipCanvas.height);
      }
    }
  }

  /* page 2 covers everything below the command line */
  function layoutPage2() {
    if (!page2 || !chromeBar || !cmdBar) return;
    page2.style.top = (chromeBar.offsetHeight + cmdBar.offsetHeight) + 'px';
  }

  /* ═══ master timeline — one scrubbed p drives all the acts ═══
     0.00–0.09 laptop dolly · 0.10–0.46 order decomposes & routes ·
     0.48–0.62 registry: IDs mint, token bill collapses ·
     0.64–1.00 behind the glass: wide swarm → into the SECURITY
     harness → CIPHER close-up → across to the coverage desk →
     ORACLE close-up → parting pull-back */
  function master(p) {
    applyZoom(clamp(p / 0.09));
    update(clamp((p - 0.10) / 0.36));
    updateRegistry(clamp((p - 0.48) / 0.14));
    updateDepth(clamp((p - 0.64) / 0.36));
  }

  layoutPage2();
  window.addEventListener('resize', layoutPage2);

  /* dev hook: ?rtp=0.5 freezes the timeline at that progress and
     isolates the terminal at the top of the page (no scrolling needed) */
  var dbg = /[?&]rtp=([\d.]+)/.exec(location.search);
  if (dbg) {
    document.documentElement.classList.add('rtp-debug');
    var dbgSel = /[?&]sel=(\d+)/.exec(location.search);
    if (dbgSel) {
      NODES3D.forEach(function (n, i) {
        if (n.kind === 'hub' && n.di === parseInt(dbgSel[1], 10)) selNode = i;
      });
    }
    var dbgAgent = /[?&]agent=([A-Z0-9-]+)/.exec(location.search);
    if (dbgAgent) {
      NODES3D.forEach(function (n, i) {
        if (n.kind === 'agent' && n.name === dbgAgent[1]) selNode = i;
      });
    }
    var dbgEdge = /[?&]edge=(\d+)/.exec(location.search);
    if (dbgEdge) selEdge = Math.min(EDGES3D.length - 1, parseInt(dbgEdge[1], 10));
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
      end: '+=8200',
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

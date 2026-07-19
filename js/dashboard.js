/* ═══════════════════════════════════════════════════════════
   Allocator.os — ops dashboard (LangSmith-style trace surface)
   Live run feed + clickable traces with span waterfalls.
   Runs stream in every ~2.4s; selecting a run rebuilds the
   waterfall (decompose → route → generate → verify → ledger),
   with halt/revalidate spans appearing on failed runs.
═══════════════════════════════════════════════════════════ */
'use strict';

(function opsDashboard() {
  var rowsEl = document.getElementById('run-rows');
  if (!rowsEl) return;
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var titleEl = document.getElementById('trace-title');
  var idEl = document.getElementById('trace-id');
  var spansEl = document.getElementById('trace-spans');
  var metaEl = document.getElementById('trace-meta');
  var kRuns = document.getElementById('dk-runs');
  var kCost = document.getElementById('dk-cost');
  var kRate = document.getElementById('dk-rate');
  var kEsc = document.getElementById('dk-esc');

  var NAMES = [
    { n: 'ingest.parse_10k', tier: 'open', model: 'qwen-72b', risk: 0.12 },
    { n: 'ingest.market_data', tier: 'local', model: 'llama-8b', risk: 0.08 },
    { n: 'historicals.reconcile', tier: 'open', model: 'deepseek-v4', risk: 0.34 },
    { n: 'forecast.rev_drivers', tier: 'frontier', model: 'gpt-5.6', risk: 0.82 },
    { n: 'forecast.capex_cycle', tier: 'frontier', model: 'gpt-5.6', risk: 0.78 },
    { n: 'valuation.dcf_sensitivity', tier: 'frontier', model: 'fable-5', risk: 0.88 },
    { n: 'valuation.wacc', tier: 'frontier', model: 'fable-5', risk: 0.84 },
    { n: 'memo.draft', tier: 'open', model: 'mixtral-8x22', risk: 0.41 },
    { n: 'memo.fact_check', tier: 'open', model: 'fable-5 audit', risk: 0.44 },
    { n: 'audit.verify_dcf', tier: 'frontier', model: 'fable-5', risk: 0.66 }
  ];

  var runCount = 1284, costToday = 214.6, escCount = 3, okCount = 946, allCount = 978;
  var runSeq = 4210;
  var selected = null, userClicked = 0;

  function mkRun() {
    var d = NAMES[Math.floor(Math.random() * NAMES.length)];
    var r = Math.random();
    var status = r < 0.86 ? 'ok' : r < 0.94 ? 'esc' : 'err';
    var lat = d.tier === 'frontier' ? 4 + Math.random() * 9 : 0.4 + Math.random() * 2.2;
    var cost = d.tier === 'frontier' ? 0.8 + Math.random() * 1.8 : d.tier === 'open' ? 0.04 + Math.random() * 0.2 : 0.01;
    var tokens = Math.round((d.tier === 'frontier' ? 18 : 6) * (0.6 + Math.random()) * 1000);
    return {
      id: 'run-' + (++runSeq), def: d, status: status,
      lat: lat, cost: cost, tokens: tokens, blast: Math.round(d.risk * 8)
    };
  }

  function statusClass(s) { return s === 'ok' ? 'ok' : s === 'err' ? 'err' : 'esc'; }

  function renderRow(run) {
    var b = document.createElement('button');
    b.className = 'drun';
    b.innerHTML =
      '<span class="rn"><i class="' + statusClass(run.status) + '"></i><span>' + run.def.n + '</span></span>' +
      '<span class="rm' + (run.def.tier === 'frontier' ? ' frontier' : '') + '">' + run.def.model + '</span>' +
      '<span class="rl">' + run.lat.toFixed(1) + 's</span>' +
      '<span class="rc">$' + run.cost.toFixed(2) + '</span>';
    b.addEventListener('click', function () {
      userClicked = Date.now();
      select(run, b);
    });
    return b;
  }

  function span(name, cls, left, width, dur, nest) {
    return '<div class="dspan ' + cls + (nest ? ' nest' : '') + '">' +
      '<div class="sl"><span>' + name + '</span><em>' + dur + '</em></div>' +
      '<div class="sb"><i style="left:' + left + '%;width:' + width + '%"></i></div></div>';
  }

  function select(run, rowEl) {
    selected = run;
    Array.prototype.forEach.call(rowsEl.children, function (c) { c.classList.remove('sel'); });
    if (rowEl) rowEl.classList.add('sel');
    titleEl.textContent = 'TRACE — ' + run.def.n;
    idEl.textContent = run.id + ' · ' + run.def.model;

    var total = run.lat;
    function pct(x) { return (x / total * 100); }
    var t0 = total * 0.06, t1 = total * 0.05, t2, t3, t4;
    var html = '';
    html += span('harness.decompose', 't-gen', 0, pct(t0), (t0).toFixed(2) + 's', false);
    html += span('router.select — risk ' + run.def.risk.toFixed(2) + ' → ' + run.def.tier, 't-route', pct(t0), pct(t1), (t1).toFixed(2) + 's', false);
    if (run.status === 'err') {
      t2 = total * 0.42; t3 = total * 0.12; t4 = total * 0.28;
      html += span(run.def.model + '.generate', 't-gen', pct(t0 + t1), pct(t2), t2.toFixed(2) + 's', true);
      html += span('verify.independent — FAIL', 't-halt', pct(t0 + t1 + t2), pct(t3), t3.toFixed(2) + 's', true);
      html += span('halt.blast_radius — ' + run.blast + ' claims frozen', 't-halt', pct(t0 + t1 + t2 + t3), pct(t4), t4.toFixed(2) + 's', false);
      html += span('ledger.revalidate', 't-ledger', pct(total * 0.93), 7, '…', false);
    } else {
      t2 = total * (run.def.tier === 'frontier' ? 0.58 : 0.66);
      t3 = total * (run.status === 'esc' ? 0.14 : 0.2);
      html += span(run.def.model + '.generate — ' + (run.tokens / 1000).toFixed(1) + 'k tok', 't-gen', pct(t0 + t1), pct(t2), t2.toFixed(2) + 's', true);
      if (run.status === 'esc') {
        html += span('escalate.human_desk — uncertainty above tolerance', 't-halt', pct(t0 + t1 + t2), pct(t3), t3.toFixed(2) + 's', true);
      } else {
        html += span('verify.' + (run.def.tier === 'frontier' ? 'independent' : 'spot_check'), 't-verify', pct(t0 + t1 + t2), pct(t3), t3.toFixed(2) + 's', true);
      }
      html += span('ledger.commit — provenance + blast radius', 't-ledger', pct(total * 0.9), 10, (total * 0.1).toFixed(2) + 's', false);
    }
    spansEl.innerHTML = html;

    metaEl.innerHTML =
      '<div class="dm"><b>STATUS</b><span>' + (run.status === 'ok' ? '✓ verified' : run.status === 'esc' ? '△ escalated' : '✕ halted') + '</span></div>' +
      '<div class="dm"><b>RISK / BLAST</b><span>' + run.def.risk.toFixed(2) + ' / ' + run.blast + ' claims</span></div>' +
      '<div class="dm"><b>COST</b><span>$' + run.cost.toFixed(2) + '</span></div>' +
      '<div class="dm"><b>TOKENS</b><span>' + run.tokens.toLocaleString('en-US') + '</span></div>' +
      '<div class="dm"><b>MODEL TIER</b><span>' + run.def.tier + '</span></div>' +
      '<div class="dm"><b>AUTONOMY</b><span>' + (run.def.risk > 0.7 ? 'supervised' : 'trusted') + '</span></div>';
  }

  function addRun(initial) {
    var run = mkRun();
    var row = renderRow(run);
    rowsEl.insertBefore(row, rowsEl.firstChild);
    if (!initial && !REDUCED) row.classList.add('flash');
    while (rowsEl.children.length > 9) rowsEl.removeChild(rowsEl.lastChild);

    runCount++; costToday += run.cost; allCount++;
    if (window.__allocFeed) window.__allocFeed(run);
    if (run.status === 'ok') okCount++;
    if (run.status === 'esc') escCount++;
    if (kRuns) kRuns.textContent = runCount.toLocaleString('en-US');
    if (kCost) kCost.textContent = '$' + costToday.toFixed(2);
    if (kRate) kRate.textContent = (okCount / allCount * 100).toFixed(1) + '%';
    if (kEsc) kEsc.textContent = escCount;

    // auto-follow the feed unless the user recently clicked
    if (!initial && Date.now() - userClicked > 12000) select(run, row);
    return { run: run, row: row };
  }

  /* seed */
  var first = null;
  for (var i = 0; i < 7; i++) { first = addRun(true); }
  select(first.run, first.row);

  if (!REDUCED) {
    var timer = null;
    function start() { if (!timer) timer = setInterval(function () { addRun(false); }, 2400); }
    function stop() { clearInterval(timer); timer = null; }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries[0].isIntersecting ? start() : stop();
      }, { threshold: 0.05 }).observe(rowsEl);
    } else start();
  }
})();

/* ═══════════════════════════════════════════════════════════
   Live ops charts — token throughput by tier (stacked area),
   cumulative spend vs the all-frontier counterfactual, and
   prompt-cache hit rate. Fed by the run stream above via
   window.__allocFeed; ticks once per simulated minute while
   the dashboard is on screen. Hovering a chart scrubs its
   history into the header readout.
═══════════════════════════════════════════════════════════ */
(function opsCharts() {
  var wrap = document.getElementById('dash-charts');
  if (!wrap) return;
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var BONE = '235,232,224', CYAN = '34,211,238', GREEN = '34,197,94', GREY = '139,136,124';
  var MONO = '"Space Mono", monospace';
  var HIST = 90, TICK_MS = 1200;
  var FRONTIER_BLEND = 12; // $/MTok blended — the counterfactual price

  var kTok = document.getElementById('dk-tok');
  var kCache = document.getElementById('dk-cache');

  /* rolling buffers */
  var tokF = [], tokO = [], tokL = [];
  var spendR = [], spendB = [];
  var cache = [];
  var routed = 214.6, base = 512.4, tokToday = 38.2e6;
  var cacheEvent = -999; // tick index of last prefix invalidation
  var tickN = 0;

  var pend = { frontier: 0, open: 0, local: 0, cost: 0, btok: 0 };
  window.__allocFeed = function (run) {
    pend[run.def.tier] += run.tokens;
    pend.cost += run.cost;
    pend.btok += run.tokens;
  };

  function nz(base, amp, phase) {
    return base + amp * Math.sin(tickN * 0.11 + phase) + (Math.random() - 0.5) * amp * 0.9;
  }

  function sample() {
    tickN++;
    /* tok/min by tier — averages sum to ≈270K/min ≈ 390M/day, matching the swarm stage */
    var f = Math.max(8000, nz(62000, 16000, 0) + pend.frontier * 3);
    var o = Math.max(12000, nz(142000, 34000, 2.1) + pend.open * 3);
    var l = Math.max(6000, nz(68000, 18000, 4.2) + pend.local * 3);

    /* cumulative spend: routed pays tier prices; counterfactual pays frontier for every token */
    var minuteTok = f + o + l;
    routed += pend.cost + (f / 1e6) * FRONTIER_BLEND + (o / 1e6) * 0.45 + (l / 1e6) * 0.02;
    base += pend.cost + (minuteTok / 1e6) * FRONTIER_BLEND;
    tokToday += minuteTok;

    /* cache hit rate: stable ~82%, dips hard when a prompt prefix is rebuilt */
    if (tickN - cacheEvent > 40 && Math.random() < 0.02) cacheEvent = tickN;
    var recover = Math.min(1, (tickN - cacheEvent) / 12);
    var hit = (0.82 + 0.05 * Math.sin(tickN * 0.07) + (Math.random() - 0.5) * 0.02) * recover +
              0.52 * (1 - recover);
    hit = Math.max(0.4, Math.min(0.96, hit));

    push(tokF, f); push(tokO, o); push(tokL, l);
    push(spendR, routed); push(spendB, base);
    push(cache, hit);
    pend.frontier = pend.open = pend.local = 0; pend.cost = 0; pend.btok = 0;

    if (kTok) kTok.textContent = fmtTok(tokToday);
    if (kCache) kCache.textContent = (hit * 100).toFixed(1) + '%';
  }
  function push(a, v) { a.push(v); if (a.length > HIST) a.shift(); }
  function fmtTok(t) { return t >= 1e9 ? (t / 1e9).toFixed(2) + 'B' : (t / 1e6).toFixed(1) + 'M'; }
  function fmtK(t) { return t >= 1e6 ? (t / 1e6).toFixed(2) + 'M' : Math.round(t / 1000) + 'K'; }

  /* ── canvas helpers ── */
  function Chart(id) {
    var c = document.getElementById(id);
    var ctx = c.getContext('2d');
    var chart = { el: c, ctx: ctx, w: 0, h: 0, hover: -1 };
    function size() {
      var DPR = Math.min(window.devicePixelRatio || 1, 2);
      chart.w = c.offsetWidth; chart.h = c.offsetHeight;
      c.width = chart.w * DPR; c.height = chart.h * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    size();
    window.addEventListener('resize', function () { size(); drawAll(); }, { passive: true });
    c.addEventListener('pointermove', function (e) {
      var r = c.getBoundingClientRect();
      chart.hover = Math.max(0, Math.min(HIST - 1, Math.round((e.clientX - r.left) / r.width * (HIST - 1))));
      drawAll();
    });
    c.addEventListener('pointerleave', function () { chart.hover = -1; drawAll(); });
    return chart;
  }

  function grid(ch) {
    ch.ctx.clearRect(0, 0, ch.w, ch.h);
    ch.ctx.strokeStyle = 'rgba(' + BONE + ',0.06)';
    ch.ctx.lineWidth = 1;
    for (var g = 1; g <= 3; g++) {
      var y = ch.h * g / 4;
      ch.ctx.beginPath(); ch.ctx.moveTo(0, y); ch.ctx.lineTo(ch.w, y); ch.ctx.stroke();
    }
  }
  function xAt(ch, i, n) { return i / (n - 1) * ch.w; }
  function crosshair(ch, i, n) {
    if (i < 0) return;
    ch.ctx.strokeStyle = 'rgba(' + BONE + ',0.25)';
    ch.ctx.lineWidth = 1;
    ch.ctx.beginPath(); ch.ctx.moveTo(xAt(ch, i, n), 0); ch.ctx.lineTo(xAt(ch, i, n), ch.h); ch.ctx.stroke();
  }
  function dot(ch, x, y, rgb) {
    ch.ctx.fillStyle = 'rgba(' + rgb + ',1)';
    ch.ctx.beginPath(); ch.ctx.arc(x, y, 2.4, 0, 7); ch.ctx.fill();
  }

  var chTok = Chart('ch-tok'), chSpend = Chart('ch-spend'), chCache = Chart('ch-cache');
  var vTok = document.getElementById('ch-tok-val');
  var vSpend = document.getElementById('ch-spend-val');
  var vCache = document.getElementById('ch-cache-val');
  var nProj = document.getElementById('ch-tok-proj');
  var nSave = document.getElementById('ch-spend-save');
  var nCache = document.getElementById('ch-cache-note');

  function drawTok() {
    var n = tokF.length; if (n < 2) return;
    var ch = chTok; grid(ch);
    var max = 0, i;
    for (i = 0; i < n; i++) max = Math.max(max, tokF[i] + tokO[i] + tokL[i]);
    max *= 1.15;
    var layers = [
      { d: tokL, rgb: GREY },
      { d: tokO, rgb: GREEN },
      { d: tokF, rgb: CYAN }
    ];
    var acc = new Array(n).fill(0);
    layers.forEach(function (L) {
      var top = acc.map(function (v, j) { return v + L.d[j]; });
      ch.ctx.beginPath();
      for (i = 0; i < n; i++) {
        var x = xAt(ch, i, n), y = ch.h - top[i] / max * ch.h;
        i ? ch.ctx.lineTo(x, y) : ch.ctx.moveTo(x, y);
      }
      for (i = n - 1; i >= 0; i--) ch.ctx.lineTo(xAt(ch, i, n), ch.h - acc[i] / max * ch.h);
      ch.ctx.closePath();
      ch.ctx.fillStyle = 'rgba(' + L.rgb + ',0.20)';
      ch.ctx.fill();
      ch.ctx.beginPath();
      for (i = 0; i < n; i++) {
        var x2 = xAt(ch, i, n), y2 = ch.h - top[i] / max * ch.h;
        i ? ch.ctx.lineTo(x2, y2) : ch.ctx.moveTo(x2, y2);
      }
      ch.ctx.strokeStyle = 'rgba(' + L.rgb + ',0.9)';
      ch.ctx.lineWidth = 1.5;
      ch.ctx.stroke();
      acc = top;
    });
    dot(ch, ch.w, ch.h - acc[n - 1] / max * ch.h, CYAN);
    crosshair(ch, ch.hover, n);
    var idx = ch.hover >= 0 ? ch.hover : n - 1;
    vTok.textContent = fmtK(tokF[idx] + tokO[idx] + tokL[idx]) + '/MIN · F ' + fmtK(tokF[idx]) + ' · O ' + fmtK(tokO[idx]) + ' · L ' + fmtK(tokL[idx]);
    var avg = 0; for (i = 0; i < n; i++) avg += tokF[i] + tokO[i] + tokL[i];
    avg /= n;
    nProj.textContent = 'PROJ EOD ~' + fmtTok(avg * 1440);
  }

  function drawSpend() {
    var n = spendR.length; if (n < 2) return;
    var ch = chSpend; grid(ch);
    var lo = spendR[0], hi = spendB[n - 1] * 1.05, i;
    function y(v) { return ch.h - (v - lo) / (hi - lo) * (ch.h - 8) - 4; }
    ch.ctx.setLineDash([4, 4]);
    ch.ctx.strokeStyle = 'rgba(' + GREY + ',0.85)';
    ch.ctx.lineWidth = 1.5;
    ch.ctx.beginPath();
    for (i = 0; i < n; i++) { var x = xAt(ch, i, n); i ? ch.ctx.lineTo(x, y(spendB[i])) : ch.ctx.moveTo(x, y(spendB[i])); }
    ch.ctx.stroke();
    ch.ctx.setLineDash([]);
    ch.ctx.beginPath();
    for (i = 0; i < n; i++) { var x2 = xAt(ch, i, n); i ? ch.ctx.lineTo(x2, y(spendR[i])) : ch.ctx.moveTo(x2, y(spendR[i])); }
    ch.ctx.strokeStyle = 'rgba(' + CYAN + ',1)';
    ch.ctx.lineWidth = 2;
    ch.ctx.stroke();
    dot(ch, ch.w, y(spendR[n - 1]), CYAN);
    dot(ch, ch.w, y(spendB[n - 1]), GREY);
    crosshair(ch, ch.hover, n);
    var idx = ch.hover >= 0 ? ch.hover : n - 1;
    vSpend.textContent = 'ROUTED $' + spendR[idx].toFixed(2) + ' · BASE $' + spendB[idx].toFixed(2);
    var saved = spendB[n - 1] - spendR[n - 1];
    nSave.textContent = 'SAVED $' + saved.toFixed(0) + ' TODAY (−' + Math.round(saved / spendB[n - 1] * 100) + '%)';
  }

  function drawCache() {
    var n = cache.length; if (n < 2) return;
    var ch = chCache; grid(ch);
    function y(v) { return ch.h - (v - 0.35) / 0.65 * (ch.h - 8) - 4; }
    var i;
    ch.ctx.beginPath();
    ch.ctx.moveTo(0, ch.h);
    for (i = 0; i < n; i++) ch.ctx.lineTo(xAt(ch, i, n), y(cache[i]));
    ch.ctx.lineTo(ch.w, ch.h);
    ch.ctx.closePath();
    ch.ctx.fillStyle = 'rgba(' + GREEN + ',0.14)';
    ch.ctx.fill();
    ch.ctx.beginPath();
    for (i = 0; i < n; i++) { var x = xAt(ch, i, n); i ? ch.ctx.lineTo(x, y(cache[i])) : ch.ctx.moveTo(x, y(cache[i])); }
    ch.ctx.strokeStyle = 'rgba(' + GREEN + ',0.95)';
    ch.ctx.lineWidth = 2;
    ch.ctx.stroke();
    dot(ch, ch.w, y(cache[n - 1]), GREEN);
    crosshair(ch, ch.hover, n);
    var idx = ch.hover >= 0 ? ch.hover : n - 1;
    vCache.textContent = (cache[idx] * 100).toFixed(1) + '%';
    nCache.textContent = tickN - cacheEvent < 12 ? 'PREFIX REBUILT — REWARMING' : '1H TTL · STABLE';
    nCache.style.color = tickN - cacheEvent < 12 ? '#f59e0b' : '';
  }

  function drawAll() { drawTok(); drawSpend(); drawCache(); }

  /* seed a full window of history so the charts open alive */
  for (var s = 0; s < HIST; s++) sample();
  drawAll();

  if (!REDUCED) {
    var timer = null;
    function start() { if (!timer) timer = setInterval(function () { sample(); drawAll(); }, TICK_MS); }
    function stop() { clearInterval(timer); timer = null; }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries[0].isIntersecting ? start() : stop();
      }, { threshold: 0.05 }).observe(wrap);
    } else start();
  }
})();

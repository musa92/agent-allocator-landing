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

/* ═══════════════════════════════════════════════════════════
   Allocator.os — decomposition & routing animation
   A router scanline walks the decomposed task: per step it fills
   the risk meter, stamps the routed model chip (open-source /
   local / frontier), and ticks two cost counters — the all-frontier
   baseline vs the risk-allocated spend. Loops while in view.
═══════════════════════════════════════════════════════════ */
'use strict';

(function routingDemo() {
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var panel = document.querySelector('.decomp');
  if (!panel) return;

  var steps = Array.prototype.slice.call(panel.querySelectorAll('.dstep'));
  var scan = document.getElementById('scanline');
  var vAlloc = document.getElementById('cost-alloc');
  var vFront = document.getElementById('cost-frontier');
  var barAlloc = document.getElementById('bar-alloc');
  var barFront = document.getElementById('bar-frontier');
  var note = document.getElementById('df-note');

  var totAlloc = 0, totFront = 0;
  steps.forEach(function (s) {
    totAlloc += parseFloat(s.dataset.cost);
    totFront += parseFloat(s.dataset.fcost);
  });
  var save = Math.round((1 - totAlloc / totFront) * 100);
  if (note) note.textContent = 'SAME VERIFIED OUTCOME · −' + save + '% SPEND';

  function finalState() {
    steps.forEach(function (s) {
      s.classList.add('on');
      s.querySelector('.ds-risk i').style.width = (parseFloat(s.dataset.risk) * 100) + '%';
      var chip = s.querySelector('.ds-chip');
      chip.style.opacity = 1; chip.style.transform = 'none';
    });
    if (vAlloc) vAlloc.textContent = '$' + totAlloc.toFixed(2);
    if (vFront) vFront.textContent = '$' + totFront.toFixed(2);
    if (barFront) barFront.style.width = '100%';
    if (barAlloc) barAlloc.style.width = (totAlloc / totFront * 100) + '%';
    if (note) note.style.opacity = 1;
  }

  if (REDUCED || typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    finalState();
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  var counters = { a: 0, f: 0 };
  function paintCounters() {
    vAlloc.textContent = '$' + counters.a.toFixed(2);
    vFront.textContent = '$' + counters.f.toFixed(2);
  }

  function buildTimeline() {
    var tl = gsap.timeline({ repeat: -1, repeatDelay: 3.2 });

    // reset pass
    tl.add(function () {
      counters.a = 0; counters.f = 0; paintCounters();
      steps.forEach(function (s) {
        s.classList.remove('on');
        s.querySelector('.ds-risk i').style.width = '0%';
      });
    });
    tl.set(steps.map(function (s) { return s.querySelector('.ds-chip'); }), { opacity: 0, y: 8 });
    tl.set([barAlloc, barFront], { width: 0 });
    tl.set(note, { opacity: 0 });
    tl.set(scan, { opacity: 0, top: 0 });

    steps.forEach(function (s) {
      var risk = parseFloat(s.dataset.risk);
      var cost = parseFloat(s.dataset.cost);
      var fcost = parseFloat(s.dataset.fcost);
      var chip = s.querySelector('.ds-chip');
      var riskFill = s.querySelector('.ds-risk i');

      tl.to(scan, {
        opacity: 1,
        top: s.offsetTop + s.offsetHeight / 2,
        duration: 0.4, ease: 'power2.inOut'
      });
      tl.add(function () { s.classList.add('on'); });
      tl.to(riskFill, { width: (risk * 100) + '%', duration: 0.35, ease: 'power2.out' }, '<0.05');
      tl.to(chip, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, '<0.15');
      tl.to(counters, {
        a: '+=' + cost, f: '+=' + fcost,
        duration: 0.4, ease: 'power1.out', onUpdate: paintCounters
      }, '<');
    });

    // verdict
    tl.to(scan, { opacity: 0, duration: 0.3 });
    tl.to(barFront, { width: '100%', duration: 0.7, ease: 'power3.out' });
    tl.to(barAlloc, { width: (totAlloc / totFront * 100) + '%', duration: 0.7, ease: 'power3.out' }, '<0.1');
    tl.to(note, { opacity: 1, duration: 0.4 }, '<0.3');
    tl.to({}, { duration: 0.01 }); // breathing room marker

    return tl;
  }

  var tl = null;
  ScrollTrigger.create({
    trigger: panel,
    start: 'top 78%',
    onEnter: function () { if (!tl) tl = buildTimeline(); else tl.play(); },
    onLeave: function () { if (tl) tl.pause(); },
    onEnterBack: function () { if (tl) tl.play(); },
    onLeaveBack: function () { if (tl) tl.pause(); }
  });
})();

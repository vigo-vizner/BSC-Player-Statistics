/* ── Interactive guide ───────────────────────────────────────────────────────
 * Config comes from the server as window._tour (see src/tour.js).
 * Dims the page, spotlights one element at a time and shows a tooltip card.
 * Auto-starts once per page type (localStorage); the header "?" button replays it.
 */
(function initTour() {
  const cfg = window._tour;
  if (!cfg) return;

  const KEY = 'bsc_tour_done_' + cfg.page;
  const PAD = 6;

  let steps = [];        // available steps for this run
  let index = 0;
  let active = false;
  let openedPid = null;  // player row expanded by the tour (collapsed again at the end)
  let backdrop, spot, card, elTitle, elText, elProgress, btnBack, btnNext, btnSkip;

  function visible(sel) {
    if (!sel) return null;
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
    return null;
  }

  function isAvailable(step) {
    if (!step.sel) return true;
    if (visible(step.sel)) return true;
    if (step.alt && visible(step.alt)) return true;
    return !!(step.alt && step.click && document.querySelector(step.click));
  }

  function resolve(step) {
    if (!step.sel) return null;
    let el = visible(step.sel);
    if (!el && step.alt) {
      el = visible(step.alt);
      if (!el && step.click) {
        const trigger = document.querySelector(step.click);
        if (trigger) {
          trigger.click();
          if (window._accordionOpen) openedPid = window._accordionOpen();
          el = visible(step.alt);
        }
      }
    }
    return el;
  }

  function build() {
    backdrop = document.createElement('div');
    backdrop.className = 'tour-backdrop';

    spot = document.createElement('div');
    spot.className = 'tour-spot';

    card = document.createElement('div');
    card.className = 'tour-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-live', 'polite');

    elTitle = document.createElement('h3');
    elTitle.className = 'tour-title';
    elText = document.createElement('p');
    elText.className = 'tour-text';

    const footer = document.createElement('div');
    footer.className = 'tour-footer';
    elProgress = document.createElement('span');
    elProgress.className = 'tour-progress';
    btnSkip = document.createElement('button');
    btnSkip.className = 'tour-skip';
    btnSkip.textContent = cfg.ui.skip;
    btnBack = document.createElement('button');
    btnBack.className = 'btn btn-sm btn-outline';
    btnBack.textContent = cfg.ui.back;
    btnNext = document.createElement('button');
    btnNext.className = 'btn btn-sm btn-primary';

    const actions = document.createElement('div');
    actions.className = 'tour-actions';
    actions.append(btnBack, btnNext);
    footer.append(elProgress, btnSkip, actions);
    card.append(elTitle, elText, footer);

    btnNext.addEventListener('click', next);
    btnBack.addEventListener('click', back);
    btnSkip.addEventListener('click', () => end(true));

    document.body.append(backdrop, spot, card);
  }

  function place(el) {
    if (!el) {
      backdrop.classList.add('tour-backdrop--dim');
      spot.style.display = 'none';
      card.style.left = Math.max(12, (window.innerWidth - card.offsetWidth) / 2) + 'px';
      card.style.top  = Math.max(12, (window.innerHeight - card.offsetHeight) / 2) + 'px';
      return;
    }
    backdrop.classList.remove('tour-backdrop--dim');
    const r = el.getBoundingClientRect();
    spot.style.display = 'block';
    spot.style.left   = (r.left - PAD) + 'px';
    spot.style.top    = (r.top - PAD) + 'px';
    spot.style.width  = (r.width + PAD * 2) + 'px';
    spot.style.height = (r.height + PAD * 2) + 'px';

    const vw = window.innerWidth, vh = window.innerHeight;
    const cw = card.offsetWidth, ch = card.offsetHeight;
    const gap = 14;
    let top;
    if (vh - r.bottom - PAD >= ch + gap)      top = r.bottom + PAD + gap;   // below
    else if (r.top - PAD >= ch + gap)         top = r.top - PAD - gap - ch; // above
    else                                      top = vh - ch - 12;           // pinned to bottom
    const left = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), vw - cw - 12);
    card.style.top  = Math.max(12, top) + 'px';
    card.style.left = left + 'px';
  }

  let currentEl = null;
  function reposition() { if (active) place(currentEl); }

  function show() {
    const step = steps[index];
    currentEl = resolve(step);

    elTitle.textContent = step.title;
    elText.textContent = step.text;
    elProgress.textContent = (index + 1) + ' / ' + steps.length;
    btnBack.style.visibility = index === 0 ? 'hidden' : 'visible';
    btnNext.textContent = index === steps.length - 1 ? cfg.ui.done : cfg.ui.next;

    if (currentEl) currentEl.scrollIntoView({ block: 'center', inline: 'center' });
    place(currentEl);
    // Layout may shift after scroll / accordion expand — re-measure next frame
    requestAnimationFrame(() => { if (active) place(currentEl); });
    btnNext.focus({ preventScroll: true });
  }

  function next() {
    if (index >= steps.length - 1) return end(true);
    index++; show();
  }
  function back() {
    if (index > 0) { index--; show(); }
  }

  function onKey(e) {
    if (!active) return;
    if (e.key === 'Escape')      { e.preventDefault(); end(true); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); back(); }
  }

  function end(markDone) {
    if (!active) return;
    active = false;
    if (markDone) { try { localStorage.setItem(KEY, '1'); } catch (_) {} }
    if (openedPid !== null && window._accordionOpen && window._accordionOpen() === openedPid) {
      window._accordionClose(openedPid);
    }
    openedPid = null;
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove(); spot.remove(); card.remove();
  }

  function start() {
    if (active) return;
    steps = cfg.steps.filter(isAvailable);
    if (!steps.length) return;
    index = 0;
    active = true;
    build();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    document.addEventListener('keydown', onKey, true);
    show();
  }

  const helpBtn = document.getElementById('tour-btn');
  if (helpBtn) helpBtn.addEventListener('click', start);

  let seen = false;
  try { seen = !!localStorage.getItem(KEY); } catch (_) {}
  if (!seen) setTimeout(start, 500);
})();

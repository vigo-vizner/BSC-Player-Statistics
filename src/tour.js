// ── Interactive guide definitions ─────────────────────────────────────────────
// Each step: id (→ i18n keys tour_<id>_t / tour_<id>_d), optional CSS selector `sel`
// of the element to highlight. Steps without `sel` are shown centred.
// Steps whose element is not on the page (or not visible) are skipped by the client.
//   alt   — selector to highlight when `sel` is not visible (e.g. on phones)
//   click — selector to click first to reveal `alt` (e.g. expand a player row)

const TOURS = {
  dashboard: [
    { id: 'dash_welcome' },
    { id: 'dash_tabs',    sel: '.cat-tabs' },
    { id: 'dash_season',  sel: '.season-block .season-header .btn' },
    { id: 'dash_live',    sel: '.season-block .td-actions a:first-child' },
    { id: 'dash_summary', sel: '.season-block .td-actions a:nth-child(2)' },
    { id: 'dash_admin',   sel: 'header nav a[href="/admin"]' },
    { id: 'dash_lang',    sel: '.lang-toggle' },
  ],
  admin: [
    { id: 'admin_welcome' },
    { id: 'admin_tabs',       sel: '#admin-tabs' },
    { id: 'admin_add',        sel: '.admin-panel.active .section-header .btn' },
    { id: 'admin_addmatch',   sel: '.admin-panel.active .season-header .btn-primary' },
    { id: 'admin_closematch', sel: '.admin-panel.active td .btn-warning' },
  ],
  match: [
    { id: 'm_welcome' },
    { id: 'm_score',   sel: '.scoreboard' },
    { id: 'm_player',  sel: '.player-main-row .player-name-expand' },
    { id: 'm_pin',     sel: '.player-main-row .pin-btn' },
    { id: 'm_stats',   sel: '.player-main-row .stat-btn', alt: '.accord-row:not(.hidden) .accord-normal', click: '.player-name-expand' },
    { id: 'm_pts',     sel: '.live-table th.pts-col' },
    { id: 'm_undo',    sel: '#undo-bar' },
    { id: 'm_edit',    sel: '#edit-mode-btn' },
    { id: 'm_sync',    sel: '#sync-dot' },
    { id: 'm_close',   sel: 'form[action$="/close"]' },
    { id: 'm_summary', sel: '.match-actions a[href$="/summary"]' },
    { id: 'm_share',   sel: '.match-actions a[href^="/share/"]' },
  ],
};

/** Returns the JSON-serialisable tour config for a page, or null if none exists. */
function buildTour(page, t) {
  const steps = TOURS[page];
  if (!steps) return null;
  return {
    page,
    ui: { next: t('tour_next'), back: t('tour_back'), skip: t('tour_skip'), done: t('tour_done') },
    steps: steps.map(s => ({
      sel:   s.sel   || null,
      alt:   s.alt   || null,
      click: s.click || null,
      title: t(`tour_${s.id}_t`),
      text:  t(`tour_${s.id}_d`),
    })),
  };
}

module.exports = { buildTour };

/**
 * Minimal server-side HTML templating helpers.
 * Returns complete HTML strings — no template engine dependency.
 */

const { clientStrings } = require('../i18n');
const { esc } = require('../util');

function layout(title, body, { activePage = '', lang = 'sk', t = (k) => k, tour = null } = {}) {
  const nav = [
    { href: '/dashboard', label: t('nav_dashboard'), key: 'dashboard' },
    { href: '/players',   label: t('nav_players'),   key: 'players' },
    { href: '/admin',     label: t('nav_admin'),     key: 'admin' },
  ].map(({ href, label, key }) =>
    `<a href="${href}" class="${activePage === key ? 'active' : ''}">${label}</a>`
  ).join('');

  const otherLang = lang === 'en' ? 'sk' : 'en';
  const langToggle = `<a href="/lang/${otherLang}" class="lang-toggle" title="${esc(t('switch_language'))}">${otherLang.toUpperCase()}</a>`;
  const tourBtn = tour
    ? `<button type="button" id="tour-btn" class="tour-btn" title="${t('tour_help')}" aria-label="${t('tour_help')}">?</button>`
    : '';
  // Escape "<" so config text can never close the script tag
  const tourScript = tour
    ? `<script>window._tour = ${JSON.stringify(tour).replace(/</g, '\\u003c')};</script>\n  <script src="/js/tour.js"></script>`
    : '';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — BSC Bratislava</title>
  <link rel="manifest" href="/manifest.webmanifest">
  <meta name="theme-color" content="#0030ae">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="BSC Stats">
  <link rel="apple-touch-icon" href="/img/icon-192.png">
  <link rel="stylesheet" href="/fonts/fonts.css">
  <link rel="stylesheet" href="/css/app.css">
</head>
<body>
  <header>
    <div class="header-inner">
      <a href="/dashboard" class="header-logo-link">
        <img src="/img/BSC_logo.jpg" alt="BSC Bratislava" class="logo-img">
        <div class="logo-text">${t('app_name')}<span>${t('app_subtitle')}</span></div>
      </a>
      <nav>${nav}</nav>
      <div class="header-right">
        ${tourBtn}
        ${langToggle}
        <a href="/logout" class="logout-btn">${t('logout')}</a>
      </div>
    </div>
  </header>
  <main>${body}</main>
  <script>window._i18n = ${JSON.stringify(clientStrings(t)).replace(/</g, '\\u003c')};</script>
  <script src="/js/app.js"></script>
  <script src="/js/live.js"></script>
  ${tourScript}
</body>
</html>`;
}

module.exports = { layout };

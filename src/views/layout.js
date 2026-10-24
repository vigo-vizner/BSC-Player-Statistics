/**
 * Minimal server-side HTML templating helpers.
 * Returns complete HTML strings — no template engine dependency.
 */

function layout(title, body, { activePage = '', lang = 'en', t = (k) => k } = {}) {
  const nav = [
    { href: '/dashboard', label: t('nav_dashboard'), key: 'dashboard' },
    { href: '/admin',     label: t('nav_admin'),     key: 'admin' },
  ].map(({ href, label, key }) =>
    `<a href="${href}" class="${activePage === key ? 'active' : ''}">${label}</a>`
  ).join('');

  const otherLang = lang === 'en' ? 'sk' : 'en';
  const langToggle = `<a href="/lang/${otherLang}" class="lang-toggle" title="Switch language">${otherLang.toUpperCase()}</a>`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — BSC Bratislava</title>
  <link rel="stylesheet" href="/css/app.css">
</head>
<body>
  <header>
    <div class="header-inner">
      <a href="/dashboard" style="display:flex;align-items:center;gap:.6rem;text-decoration:none;">
        <img src="/img/BSC_logo.jpg" alt="BSC Bratislava" class="logo-img">
        <div class="logo-text">${t('app_name')}<span>${t('app_subtitle')}</span></div>
      </a>
      <nav>${nav}</nav>
      ${langToggle}
      <a href="/logout" class="logout-btn">${t('logout')}</a>
    </div>
  </header>
  <main>${body}</main>
  <script src="/js/app.js"></script>
</body>
</html>`;
}

module.exports = { layout };

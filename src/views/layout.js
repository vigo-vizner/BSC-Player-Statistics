/**
 * Minimal server-side HTML templating helpers.
 * Returns complete HTML strings — no template engine dependency.
 */

function layout(title, body, { activePage = '' } = {}) {
  const nav = [
    { href: '/dashboard', label: 'Dashboard', key: 'dashboard' },
    { href: '/admin',     label: 'Admin',     key: 'admin' },
  ].map(({ href, label, key }) =>
    `<a href="${href}" class="${activePage === key ? 'active' : ''}">${label}</a>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
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
        <div class="logo-text">BSC Bratislava<span>Player Statistics</span></div>
      </a>
      <nav>${nav}</nav>
      <a href="/logout" class="logout-btn">Logout</a>
    </div>
  </header>
  <main>${body}</main>
  <script src="/js/app.js"></script>
</body>
</html>`;
}

module.exports = { layout };

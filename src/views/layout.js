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
  <title>${title} — BSC Stats</title>
  <link rel="stylesheet" href="/css/app.css">
</head>
<body>
  <header>
    <div class="header-inner">
      <span class="logo">🏀 BSC Stats</span>
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

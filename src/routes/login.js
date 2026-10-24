const express    = require('express');
const router     = express.Router();
const { getT }   = require('../i18n');

// GET /login
router.get('/', (req, res) => {
  if (req.session && req.session.authenticated) return res.redirect('/dashboard');
  const lang = req.session.lang || 'en';
  const t    = getT(lang);
  const otherLang = lang === 'en' ? 'sk' : 'en';
  const err  = req.query.err ? `<p class="error">${t('invalid_password')}</p>` : '';
  res.send(`<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Login — BSC Bratislava</title>
  <link rel="stylesheet" href="/css/app.css">
</head>
<body class="login-page">
  <div class="login-box">
    <img src="/img/BSC_logo.jpg" alt="BSC Bratislava" class="login-logo">
    <div class="login-club">${t('app_name')}<span>${t('app_subtitle')}</span></div>
    ${err}
    <form method="POST" action="/login">
      <label for="password">${t('admin_password')}</label>
      <input id="password" type="password" name="password" autofocus autocomplete="current-password" required>
      <button type="submit" class="btn btn-primary">${t('sign_in')}</button>
    </form>
    <a href="/lang/${otherLang}" class="lang-toggle" style="margin-top:.5rem;align-self:center;">${otherLang.toUpperCase()}</a>
  </div>
</body>
</html>`);
});

// POST /login
router.post('/', (req, res) => {
  const password = process.env.ADMIN_PASSWORD || 'admin';
  if (req.body.password === password) {
    req.session.authenticated = true;
    return res.redirect('/dashboard');
  }
  res.redirect('/login?err=1');
});

module.exports = router;

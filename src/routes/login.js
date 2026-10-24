const express    = require('express');
const router     = express.Router();
const { getT }   = require('../i18n');

const DISCLAIMER = {
  en: {
    title: 'Welcome to BSC Bratislava Player Statistics',
    body: `
      <p>This app is an unofficial hobby project created by a parent, for parents. It is not affiliated with BSC Bratislava club or the Slovak Basketball Association in any way.</p>
      <p>The stats you see here are only as accurate as what has been entered by the people using the app. Anyone with access can add, edit or remove data — so please be fair and accurate when recording or correcting stats.</p>
      <p>Player data stored in the app is limited to first name and jersey number. No other personal information is collected. The app is password-protected but is a shared tool — treat it accordingly.</p>
      <p>This app runs on hobby-grade hosting and data is not guaranteed to be permanent. It should not be used as an official record.</p>
      <p>Have fun and enjoy the game! 🏀</p>`,
    accept: 'I understand — take me to the app',
  },
  sk: {
    title: 'Vitajte v BSC Bratislava štatistikách hráčov',
    body: `
      <p>Táto aplikácia je neoficiálny hobby projekt vytvorený rodičom pre rodičov. Nie je nijako prepojená s klubom BSC Bratislava ani so Slovenskou basketbalovou asociáciou.</p>
      <p>Štatistiky sú také presné, ako ich zadajú ľudia, ktorí aplikáciu používajú. Každý s prístupom môže dáta pridávať, upravovať alebo odstraňovať — preto prosíme, buďte féroví a zadávajte štatistiky čestne.</p>
      <p>O hráčoch sú uložené iba meno a číslo dresu. Žiadne iné osobné údaje sa nezbierajú. Aplikácia je chránená heslom, no ide o zdieľaný nástroj — správajte sa k nej zodpovedne.</p>
      <p>Aplikácia beží na hobby hostingu a trvalosť dát nie je zaručená. Nemala by sa používať ako oficiálny záznam.</p>
      <p>Užite si hru! 🏀</p>`,
    accept: 'Rozumiem — prejsť do aplikácie',
  },
};

// GET /login
router.get('/', (req, res) => {
  if (req.session && req.session.authenticated) return res.redirect('/dashboard');
  const lang      = req.session.lang || 'sk';   // default Slovak
  const t         = getT(lang);
  const otherLang = lang === 'en' ? 'sk' : 'en';
  const err       = req.query.err ? `<p class="error">${t('invalid_password')}</p>` : '';
  const d         = DISCLAIMER[lang] || DISCLAIMER.sk;

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
    <a href="/lang/${otherLang}?next=/login" class="lang-toggle lang-toggle--login">${otherLang.toUpperCase()}</a>
  </div>

  <!-- ── Disclaimer modal ── -->
  <div class="disclaimer-overlay hidden" id="disclaimer-overlay">
    <div class="disclaimer-box">
      <h2>${d.title}</h2>
      <div class="disclaimer-body">${d.body}</div>
      <!-- Language toggle inside modal so user can switch before accepting -->
      <a href="/lang/${otherLang}?next=/login" class="lang-toggle lang-toggle--login"
         style="align-self:flex-start">${otherLang.toUpperCase()}</a>
      <button class="disclaimer-accept" onclick="acceptDisclaimer()">${d.accept}</button>
    </div>
  </div>

  <script>
    // Always show the disclaimer — user must accept per session
    document.getElementById('disclaimer-overlay').classList.remove('hidden');
    function acceptDisclaimer() {
      document.getElementById('disclaimer-overlay').classList.add('hidden');
    }
  </script>
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

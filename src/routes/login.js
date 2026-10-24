const express = require('express');
const router  = express.Router();

// GET /login
router.get('/', (req, res) => {
  if (req.session && req.session.authenticated) return res.redirect('/dashboard');
  const err = req.query.err ? '<p class="error">Invalid password. Try again.</p>' : '';
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Login — BSC Stats</title>
  <link rel="stylesheet" href="/css/app.css">
</head>
<body class="login-page">
  <div class="login-box">
    <h1>🏀 BSC Stats</h1>
    <p class="subtitle">Basketball Player Statistics</p>
    ${err}
    <form method="POST" action="/login">
      <label for="password">Admin Password</label>
      <input id="password" type="password" name="password" autofocus autocomplete="current-password" required>
      <button type="submit">Sign In</button>
    </form>
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

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  // Script requests (fetch via apiFetch in app.js) get JSON instead of a redirect to the login HTML
  if (req.get('x-requested-with') === 'fetch') {
    return res.status(401).json({ ok: false, error: 'session_expired' });
  }
  res.redirect('/login');
}

module.exports = { requireAuth };

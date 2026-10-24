require('dotenv').config({ path: '.env.local' }); // local dev only; Railway uses env vars
const express      = require('express');
const session      = require('express-session');
const path         = require('path');
const fs           = require('fs');
const SQLiteStore  = require('connect-sqlite3')(session);

const { requireAuth } = require('./middleware/auth');
const { getT }        = require('./i18n');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Session store path ────────────────────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  store: new SQLiteStore({ dir: DATA_DIR, db: 'sessions.db' }),
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12 }, // 12 h
}));

// ── i18n: attach t() to every request ────────────────────────────────────────
app.use((req, res, next) => {
  const lang = req.session.lang || 'en';
  req.lang = lang;
  req.t    = getT(lang);
  next();
});

// ── Language toggle ───────────────────────────────────────────────────────────
app.get('/lang/:code', (req, res) => {
  const code = req.params.code;
  if (['en', 'sk'].includes(code)) req.session.lang = code;
  const back = req.headers.referer || '/dashboard';
  res.redirect(back);
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/login',    require('./routes/login'));
app.use('/logout',   (req, res) => { req.session.destroy(); res.redirect('/login'); });

// Public routes — no auth required
app.use('/share',    require('./routes/share'));

// Everything below requires auth
app.use(requireAuth);

app.use('/dashboard', require('./routes/dashboard'));
app.use('/admin',     require('./routes/admin'));
app.use('/match',     require('./routes/match'));
app.use('/',          require('./routes/summary'));   // /match/:id/summary, /season/:id/summary

// Root → dashboard
app.get('/', (req, res) => res.redirect('/dashboard'));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`BSC Stats running on http://localhost:${PORT}`);
});

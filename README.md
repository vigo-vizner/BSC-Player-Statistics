# BSC Player Statistics

Basketball player statistics capture app. Built with Node.js + Express + SQLite.

## Local development

```bash
npm install
# Create .env.local with your settings (see below)
npm run dev
```

Open http://localhost:3000 — log in with your `ADMIN_PASSWORD`.

### .env.local (local only, never committed)

```
ADMIN_PASSWORD=your-secret-password
SESSION_SECRET=a-long-random-string
DATA_DIR=./data
```

---

## Deploy to Railway

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 2. Create Railway project

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Select your repository

### 3. Add a Volume (persistent SQLite storage)

1. In your Railway service → **Volumes** tab → **Add Volume**
2. Mount path: `/app/data`
3. This keeps the database across deploys

### 4. Set environment variables

In Railway → your service → **Variables** tab, add:

| Variable         | Value                            |
|------------------|----------------------------------|
| `ADMIN_PASSWORD` | your chosen admin password       |
| `SESSION_SECRET` | a long random string (32+ chars) |
| `DATA_DIR`       | `/app/data`                      |
| `PORT`           | *(Railway sets this automatically)* |

### 5. Deploy

Railway will auto-deploy on every push to `main`. The app will be available at the Railway-provided URL (e.g. `https://bsc-stats-xxxx.railway.app`).

---

## App structure

```
src/
  server.js          — Express entry point
  db.js              — SQLite database + all queries
  middleware/
    auth.js          — Session auth guard
  routes/
    login.js         — Login / logout
    dashboard.js     — Seasons & matches overview
    admin.js         — Player / season / match CRUD
    match.js         — Live stat entry (AJAX)
    summary.js       — Match & season summaries + CSV export
  views/
    layout.js        — Shared HTML layout
  public/
    css/app.css      — Styles
    js/app.js        — Client-side interactions
data/                — SQLite DB files (created at runtime)
```

## Stats tracked per player per match

| Button | Meaning              |
|--------|----------------------|
| 1PT    | 1-point free throw   |
| 2PT    | 2-point field goal   |
| 3PT    | 3-point shot         |
| OReb   | Offensive rebound    |
| DReb   | Defensive rebound    |
| AST    | Assist               |
| TO     | Turnover             |
| BLK    | Block                |
| STL    | Steal                |
| PF     | Personal foul        |

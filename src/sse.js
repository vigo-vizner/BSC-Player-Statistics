/**
 * Server-Sent Events broadcast hub.
 *
 * One SSE connection per browser tab on the live match page.
 * When a stat is recorded or undone, all tabs watching that match
 * receive a JSON event and update their UI immediately.
 *
 * Public share pages are "watchers": they never receive stat data, only a bare
 * `changed` signal after which they re-fetch the (token protected) share data.
 */

// matchId (string) → Set of response objects
const clients = new Map();
const watchers = new Map();

// Events that change what the share page shows
const WATCH_EVENTS = new Set(['stat', 'undo', 'score', 'closed', 'reopened', 'roster']);
// Public endpoint: cap open connections per match so it can't be used to exhaust the server
const MAX_WATCHERS_PER_MATCH = 200;

/**
 * Register a new SSE client for a given match.
 * Call this from GET /match/:id/events.
 */
function addClient(matchId, res) {
  const key = String(matchId);
  if (!clients.has(key)) clients.set(key, new Set());
  clients.get(key).add(res);
}

/**
 * Remove a client (called when the connection closes).
 */
function removeClient(matchId, res) {
  const key = String(matchId);
  const set = clients.get(key);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(key);
}

/**
 * Register a public share-page watcher. Returns false when the per-match cap is reached.
 */
function addWatcher(matchId, res) {
  const key = String(matchId);
  if (!watchers.has(key)) watchers.set(key, new Set());
  const set = watchers.get(key);
  if (set.size >= MAX_WATCHERS_PER_MATCH) return false;
  set.add(res);
  return true;
}

function removeWatcher(matchId, res) {
  const key = String(matchId);
  const set = watchers.get(key);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) watchers.delete(key);
}

/**
 * Broadcast a JSON payload to every client watching matchId.
 * Share-page watchers only get a data-less `changed` signal.
 */
function broadcast(matchId, eventName, data) {
  const key = String(matchId);

  const set = clients.get(key);
  if (set && set.size > 0) {
    const msg = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of set) {
      try { res.write(msg); } catch (_) { set.delete(res); }
    }
  }

  const watching = watchers.get(key);
  if (watching && watching.size > 0 && WATCH_EVENTS.has(eventName)) {
    const msg = 'event: changed\ndata: {}\n\n';
    for (const res of watching) {
      try { res.write(msg); } catch (_) { watching.delete(res); }
    }
  }
}

module.exports = { addClient, removeClient, addWatcher, removeWatcher, broadcast };

/**
 * Server-Sent Events broadcast hub.
 *
 * One SSE connection per browser tab on the live match page.
 * When a stat is recorded or undone, all tabs watching that match
 * receive a JSON event and update their UI immediately.
 */

// matchId (string) → Set of response objects
const clients = new Map();

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
 * Broadcast a JSON payload to every client watching matchId.
 */
function broadcast(matchId, eventName, data) {
  const key = String(matchId);
  const set = clients.get(key);
  if (!set || set.size === 0) return;
  const msg = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try { res.write(msg); } catch (_) { set.delete(res); }
  }
}

module.exports = { addClient, removeClient, broadcast };

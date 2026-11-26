/**
 * In-memory Call Session Store for Exotel IVR
 * Maintains state across multi-applet call flows (Crop -> Quantity -> Location -> Dynamic Audio).
 * Self-cleaning with TTL to avoid memory leaks.
 */

const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL

class IvrSessionStore {
  constructor() {
    this.sessions = new Map();
    // Periodic sweep every 5 minutes
    this.cleanupTimer = setInterval(() => this.sweepExpired(), 5 * 60 * 1000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  get(callSid) {
    if (!callSid) return null;
    const session = this.sessions.get(callSid);
    if (!session) return null;
    if (Date.now() - session.updatedAt > SESSION_TTL_MS) {
      this.sessions.delete(callSid);
      return null;
    }
    return session;
  }

  set(callSid, data) {
    if (!callSid) return null;
    const existing = this.sessions.get(callSid) || {
      callSid,
      createdAt: Date.now()
    };
    const updated = {
      ...existing,
      ...data,
      updatedAt: Date.now()
    };
    this.sessions.set(callSid, updated);
    return updated;
  }

  delete(callSid) {
    if (!callSid) return false;
    return this.sessions.delete(callSid);
  }

  sweepExpired() {
    const now = Date.now();
    for (const [sid, session] of this.sessions.entries()) {
      if (now - session.updatedAt > SESSION_TTL_MS) {
        this.sessions.delete(sid);
      }
    }
  }

  clear() {
    this.sessions.clear();
  }
}

module.exports = new IvrSessionStore();

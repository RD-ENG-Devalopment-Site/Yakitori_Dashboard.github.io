(function () {
  'use strict';

  const STORAGE_KEY = 'yakitori-recording-session-v1';
  const RETURN_KEY = 'yakitori-recording-return-url';
  const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
  const ACCESS_PASSWORD = 'Apex2026';
  const WINDOW_NAME_PREFIX = 'yakitori-recording-session:';

  function readWindowSession() {
    if (!window.name.startsWith(WINDOW_NAME_PREFIX)) return null;
    try {
      return JSON.parse(window.name.slice(WINDOW_NAME_PREFIX.length));
    } catch (error) {
      window.name = '';
      return null;
    }
  }

  function readSession() {
    try {
      const session = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || readWindowSession();
      if (!session || !session.expiresAt || Date.now() >= session.expiresAt) {
        localStorage.removeItem(STORAGE_KEY);
        if (window.name.startsWith(WINDOW_NAME_PREFIX)) window.name = '';
        return null;
      }
      return session;
    } catch (error) {
      const session = readWindowSession();
      if (session && Date.now() < session.expiresAt) return session;
      return null;
    }
  }

  function createSession(password) {
    if (String(password || '').trim() !== ACCESS_PASSWORD) return false;

    const session = {
      token: (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random()}`,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_DURATION_MS
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    window.name = `${WINDOW_NAME_PREFIX}${JSON.stringify(session)}`;
    return true;
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
    if (window.name.startsWith(WINDOW_NAME_PREFIX)) window.name = '';
    sessionStorage.removeItem('yakitori-data-record-auth');
    sessionStorage.removeItem('yakitori-breakdown-auth');
    sessionStorage.removeItem('apex-block-tracker-access');
  }

  function rememberReturnUrl() {
    const current = `${location.pathname.split('/').pop() || ''}${location.search || ''}${location.hash || ''}`;
    if (current && !current.startsWith('DataRecordingHub.html')) {
      sessionStorage.setItem(RETURN_KEY, current);
    }
  }

  function requireSession() {
    if (readSession()) return true;
    rememberReturnUrl();
    location.replace('DataRecordingHub.html?reason=session');
    return false;
  }

  function consumeReturnUrl() {
    const url = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return url || '';
  }

  function mountSessionControls() {
    if (document.getElementById('yakitoriSessionControls')) return;
    const controls = document.createElement('div');
    controls.id = 'yakitoriSessionControls';
    controls.setAttribute('aria-label', 'Data Recording session controls');
    controls.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:45;display:flex;gap:8px;padding:8px;border:1px solid #323248;border-radius:12px;background:rgba(30,30,45,.96);box-shadow:0 12px 32px rgba(0,0,0,.28);backdrop-filter:blur(10px)';
    controls.innerHTML = '<a href="DataRecordingHub.html" style="padding:8px 12px;border-radius:8px;color:#fff;font:600 13px Sarabun,sans-serif;text-decoration:none;background:#2b2b40">Recording Hub</a><button type="button" style="padding:8px 12px;border:1px solid rgba(241,65,108,.35);border-radius:8px;color:#ff8eaa;font:700 13px Sarabun,sans-serif;background:rgba(241,65,108,.1);cursor:pointer">Logout</button>';
    controls.querySelector('button').addEventListener('click', () => {
      clearSession();
      location.replace('DataRecordingHub.html?reason=logout');
    });
    document.body.appendChild(controls);
    const expiryTimer = setInterval(() => {
      if (readSession()) return;
      clearInterval(expiryTimer);
      rememberReturnUrl();
      location.replace('DataRecordingHub.html?reason=expired');
    }, 30000);
  }

  window.YakitoriAuth = {
    login: createSession,
    logout: clearSession,
    getSession: readSession,
    isAuthenticated: () => Boolean(readSession()),
    requireSession,
    mountSessionControls,
    consumeReturnUrl,
    getRemainingMs: () => Math.max(0, (readSession()?.expiresAt || 0) - Date.now())
  };
})();

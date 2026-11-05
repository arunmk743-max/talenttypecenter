import { login, logout, getUser, handleAuthCallback, acceptInvite, updateUser, requestPasswordRecovery, onAuthChange } from '@netlify/identity';

let cache = {};
let revisions = {};
let account = null;
let pendingCallback = null;
let refreshing = null;
let changingAdminPassword = false;
const status = (text, failed = false) => {
  const el = document.getElementById('databaseStatus');
  if (el) { el.textContent = text; el.className = failed ? 'px-4 py-2 text-xs bg-rose-100 text-rose-900 text-center' : 'px-4 py-2 text-xs bg-emerald-50 text-emerald-900 text-center'; }
};
async function request(path, options = {}) {
  await getUser(); // Refresh the Identity cookie before accessing protected functions.
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
  let body;
  try { body = await response.json(); } catch { throw new Error('The central service is unavailable. Please try again.'); }
  if (!response.ok) throw new Error(body.error || 'The operation could not be completed.');
  return body;
}
async function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const result = await request('/api/data');
      cache = result.data; revisions = result.revisions; account = result.account;
      status('Connected to the central institute database');
      return account;
    } catch (error) { status(error.message, true); throw error; }
    finally { refreshing = null; }
  })();
  return refreshing;
}
window.centralStore = {
  refresh,
  get account() { return account; },
  getItem(key) { return Object.hasOwn(cache, key) ? JSON.stringify(cache[key]) : null; },
  async setItem(key, json) {
    status('Saving to the central database…');
    try {
      const value = JSON.parse(json);
      const result = await request('/api/data', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value, revision: revisions[key] ?? 0 }) });
      cache[key] = value; revisions[key] = result.revision;
      status('Saved to the central database');
    } catch (error) { status(error.message, true); throw error; }
  },
  async attendance() {
    await request('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'attendance' }) });
    await refresh();
  },
  async report(report) {
    await request('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'report', report }) });
    if (account?.admin) await refresh();
  },
  async logo(file) {
    const options = file ? { method: 'PUT', headers: { 'Content-Type': file.type }, body: file } : { method: 'DELETE' };
    await request('/api/logo', options);
  },
  async importLegacy() {
    if (!account?.admin) throw new Error('Administrator access is required.');
    if (!confirm('Import browser records into the central database? Existing central records with the same phone number or ID are kept. Initial public defaults are replaced with your previous settings. Students sign in with their registered phone number and DOB (DDMMYYYY).')) return;
    await refresh();
    const settings = localStorage.getItem('ttc_settings');
    if (settings && (revisions.ttc_settings ?? 0) <= 1) await this.setItem('ttc_settings', settings);
    for (const key of ['ttc_students', 'ttc_attendance', 'ttc_outbox_reports', 'ttc_batches', 'ttc_courses', 'ttc_passages']) {
      const raw = localStorage.getItem(key); // Read-only migration of data from the previous website.
      if (!raw) continue;
      const legacy = JSON.parse(raw);
      if (!Array.isArray(legacy)) continue;
      const initialPublic = ['ttc_batches', 'ttc_courses', 'ttc_passages'].includes(key) && (revisions[key] ?? 0) <= 1;
      const merged = initialPublic ? [] : structuredClone(cache[key] || []);
      const id = row => key === 'ttc_students' ? row.phone : key === 'ttc_attendance' ? `${row.phone}:${row.date}` : row.id;
      for (const row of legacy) if (!merged.some(item => id(item) === id(row))) merged.push(row);
      await this.setItem(key, JSON.stringify(merged));
    }
    const logo = localStorage.getItem('ttc_custom_logo');
    if (logo && /^data:image\/(png|jpeg|webp|gif);base64,/.test(logo) && confirm('Also import the institute logo saved in this browser?')) {
      const response = await fetch(logo);
      await this.logo(await response.blob());
    }
    alert('Browser records imported. Students can sign in with their phone number and DOB (DDMMYYYY). Existing browser records were kept as a backup.');
    await window.refreshInstituteData();
  },
};
window.instituteAuth = {
  async login(identifier, password, role) {
    // Email is used only for the explicitly selected private admin setup route.
    if (role === 'admin' && identifier.includes('@')) {
      await request('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
      await login(identifier, password);
    } else {
      await request('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', identifier, password, role }) });
    }
    const info = await refresh();
    if (role === 'admin' ? !info?.admin : !info?.student) {
      await this.logout();
      throw new Error(role === 'admin' ? 'This account needs the admin role.' : 'No enrolled student record matches this login.');
    }
    return info;
  },
  async logout() {
    await request('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
    await logout(); cache = {}; revisions = {}; account = null; await refresh();
  },
  async changePassword(currentPassword, password) {
    if (!account?.admin) throw new Error('Sign in as administrator before changing the password.');
    if (account.authMethod === 'identity') await login(account.email, currentPassword);
    await request('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'password', currentPassword, password }) });
    // Clear the bootstrap Identity session; the new ADMIN session remains in its own cookie.
    changingAdminPassword = true;
    try { await logout(); } finally { changingAdminPassword = false; }
    await refresh();
  },
  async recover(email) {
    if (!email.includes('@')) throw new Error('Select Administrator setup / recovery and enter your invited administrator email.');
    await requestPasswordRecovery(email);
    alert('Check your email for a password reset link.');
  },
  async finishCallback(password) {
    if (!pendingCallback) throw new Error('Open the link in your invitation or password recovery email.');
    if (pendingCallback.type === 'invite') await acceptInvite(pendingCallback.token, password);
    else await updateUser({ password });
    pendingCallback = null;
    document.getElementById('accountSetupModal').classList.add('hidden');
    await logout();
    alert('Account password saved. Use Administrator setup / recovery to sign in with your email, then set the ADMIN password in Settings.');
    await refresh();
  },
};
window.addEventListener('unhandledrejection', event => {
  event.preventDefault();
  status(event.reason?.message || 'The operation failed. Please try again.', true);
  alert(event.reason?.message || 'The operation failed. Please try again.');
});
onAuthChange((event) => {
  if (event === 'logout' && !changingAdminPassword) {
    cache = {}; revisions = {}; account = null;
    window.clearInstituteSession?.();
  }
});
window.centralReady = (async () => {
  try {
    const callback = await handleAuthCallback();
    if (callback?.type === 'invite' || callback?.type === 'recovery') {
      pendingCallback = callback;
      document.getElementById('accountSetupModal').classList.remove('hidden');
    }
    await refresh();
    return true;
  } catch (error) { status(error.message, true); return false; }
})();

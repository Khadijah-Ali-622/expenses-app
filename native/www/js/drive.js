/* Hisab Google Drive backup.
   Does nothing (no init network, no GIS load) when HISAB_GOOGLE_DRIVE_CONFIG
   has an empty webClientId. Uses Google Identity Services in the browser and
   the Capacitor Google Auth plugin inside the Android WebView. */
(function (global) {
  'use strict';

  var SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  var GIS_SRC = 'https://accounts.google.com/gsi/client';
  var DRIVE_API = 'https://www.googleapis.com/drive/v3';
  var DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  var META_KEY = 'hisab-drive-meta';
  var FORMAT = 'expenses-drive-backup-v1';
  var MAX_BACKUPS = 14;
  var NAME_RE = /^expenses-backup-\d{8}-\d{4}\.json$/;

  var hooks = { onChange: null };
  var started = false;
  var accessToken = '';
  var tokenExpiry = 0;
  var account = null; // { email: string } or { label: 'Signed in to Google' }
  var tokenClient = null;
  var gisLoading = null;
  var nativeReady = false;
  var backupList = [];
  var listLoading = false;
  var busy = false;
  var lastError = '';

  function config() {
    return global.HISAB_GOOGLE_DRIVE_CONFIG || {};
  }

  function isConfigured() {
    var c = config();
    return !!(c && String(c.webClientId || '').trim());
  }

  function webClientId() {
    return String((config().webClientId || '')).trim();
  }

  function isNative() {
    var cap = global.Capacitor;
    return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  }

  function nativePlugin() {
    var cap = global.Capacitor;
    if (!cap) return null;
    if (cap.Plugins && cap.Plugins.GoogleAuth) return cap.Plugins.GoogleAuth;
    return null;
  }

  function DriveError(code, message) {
    var err = new Error(message || 'Something went wrong.');
    err.code = code;
    return err;
  }

  function friendlyError(err) {
    if (!err) return 'Something went wrong.';
    var code = err.code || '';
    if (code === 'not-configured') return "Google Drive backup isn't set up yet.";
    if (code === 'not-signed-in') return 'Sign in with Google to back up.';
    if (code === 'offline') return 'You appear to be offline. Try again when you have a connection.';
    if (code === 'cancelled') return 'Sign-in was cancelled.';
    if (code === 'api') return err.message || 'Could not reach Google Drive. Try again in a moment.';
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return 'You appear to be offline. Try again when you have a connection.';
    }
    var msg = String(err.message || err);
    if (/failed to fetch|networkerror|network request failed|err_internet|offline/i.test(msg)) {
      return 'You appear to be offline. Try again when you have a connection.';
    }
    if (/popup_closed|popup closed|user canceled|user cancelled|access_denied/i.test(msg)) {
      return 'Sign-in was cancelled.';
    }
    return msg || 'Could not reach Google Drive. Try again in a moment.';
  }

  function offlineErr() {
    return DriveError('offline', 'You appear to be offline. Try again when you have a connection.');
  }

  function ensureOnline() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw offlineErr();
  }

  function loadMeta() {
    try {
      var raw = global.localStorage.getItem(META_KEY);
      if (!raw) return { schedule: 'off', lastBackupAt: 0, email: '' };
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return { schedule: 'off', lastBackupAt: 0, email: '' };
      if (data.schedule !== 'daily' && data.schedule !== 'weekly') data.schedule = 'off';
      data.lastBackupAt = Number(data.lastBackupAt || 0);
      data.email = data.email || '';
      return data;
    } catch (e) {
      return { schedule: 'off', lastBackupAt: 0, email: '' };
    }
  }

  function saveMeta(patch) {
    var meta = loadMeta();
    Object.keys(patch || {}).forEach(function (k) { meta[k] = patch[k]; });
    try { global.localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* quota */ }
    return meta;
  }

  function notify() {
    if (hooks.onChange) {
      try { hooks.onChange(getStatus()); } catch (e) { /* ignore */ }
    }
  }

  function isSignedIn() {
    return !!(accessToken && tokenExpiry > Date.now());
  }

  function getStatus() {
    var meta = loadMeta();
    return {
      configured: isConfigured(),
      signedIn: isSignedIn(),
      account: account,
      email: (account && account.email) || meta.email || '',
      schedule: meta.schedule || 'off',
      lastBackupAt: meta.lastBackupAt || 0,
      backups: backupList.slice(),
      listLoading: listLoading,
      busy: busy,
      error: lastError
    };
  }

  function collectSnapshot() {
    var keys = {};
    var store = global.localStorage;
    if (!store) return { format: FORMAT, exportedAt: new Date().toISOString(), keys: keys };
    for (var i = 0; i < store.length; i++) {
      var k = store.key(i);
      if (!k) continue;
      if (k === 'hisab-v1' || k.indexOf('hisab-') === 0) {
        keys[k] = store.getItem(k);
      }
    }
    return { format: FORMAT, exportedAt: new Date().toISOString(), keys: keys };
  }

  function validateSnapshot(data) {
    if (!data || typeof data !== 'object') return null;
    if (data.format === FORMAT && data.keys && typeof data.keys === 'object') {
      var raw = data.keys['hisab-v1'];
      if (!raw) return null;
      try {
        var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!parsed || !Array.isArray(parsed.accounts) || !Array.isArray(parsed.transactions)) return null;
      } catch (e) { return null; }
      return data;
    }
    // Accept a raw Hisab state file (same shape as the local JSON export).
    if (Array.isArray(data.accounts) && Array.isArray(data.transactions)) {
      return {
        format: FORMAT,
        exportedAt: new Date().toISOString(),
        keys: { 'hisab-v1': JSON.stringify(data) }
      };
    }
    return null;
  }

  function applySnapshot(data) {
    var snap = validateSnapshot(data);
    if (!snap) throw DriveError('api', 'That file does not look like an Expenses backup.');
    var store = global.localStorage;
    var keepMeta = loadMeta();
    Object.keys(snap.keys).forEach(function (k) {
      var v = snap.keys[k];
      if (v == null) return;
      store.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    });
    // Keep the current Drive schedule / last-backup time so a restore does
    // not forget that this device is signed in to Drive.
    saveMeta({
      schedule: keepMeta.schedule,
      lastBackupAt: keepMeta.lastBackupAt,
      email: keepMeta.email
    });
  }

  function backupFileName(date) {
    var d = date || new Date();
    function p(n) { return n < 10 ? '0' + n : String(n); }
    return 'expenses-backup-' +
      d.getFullYear() +
      p(d.getMonth() + 1) +
      p(d.getDate()) +
      '-' +
      p(d.getHours()) +
      p(d.getMinutes()) +
      '.json';
  }

  function loadGis() {
    if (global.google && google.accounts && google.accounts.oauth2) {
      return Promise.resolve();
    }
    if (gisLoading) return gisLoading;
    ensureOnline();
    gisLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = GIS_SRC;
      s.async = true;
      s.onload = function () {
        if (global.google && google.accounts && google.accounts.oauth2) resolve();
        else reject(DriveError('api', 'Could not load Google sign-in.'));
      };
      s.onerror = function () {
        gisLoading = null;
        reject(typeof navigator !== 'undefined' && navigator.onLine === false
          ? offlineErr()
          : DriveError('api', 'Could not load Google sign-in. Check your connection and try again.'));
      };
      document.head.appendChild(s);
    });
    return gisLoading;
  }

  function requestGisToken(prompt) {
    return loadGis().then(function () {
      return new Promise(function (resolve, reject) {
        try {
          if (!tokenClient) {
            tokenClient = google.accounts.oauth2.initTokenClient({
              client_id: webClientId(),
              scope: SCOPE,
              callback: function () {}
            });
          }
          tokenClient.callback = function (resp) {
            if (!resp || resp.error) {
              var errCode = (resp && resp.error) || '';
              if (errCode === 'popup_closed_by_user' || errCode === 'access_denied') {
                reject(DriveError('cancelled', 'Sign-in was cancelled.'));
              } else {
                reject(DriveError('api', (resp && (resp.error_description || resp.error)) || 'Google sign-in failed.'));
              }
              return;
            }
            accessToken = resp.access_token;
            var seconds = Number(resp.expires_in || 3600);
            tokenExpiry = Date.now() + Math.max(60, seconds - 60) * 1000;
            resolve(accessToken);
          };
          if (typeof tokenClient.error_callback !== 'undefined') {
            tokenClient.error_callback = function (err) {
              var type = (err && err.type) || '';
              if (type === 'popup_closed' || type === 'popup_failed_to_open') {
                reject(DriveError('cancelled', 'Sign-in was cancelled.'));
              } else {
                reject(DriveError('api', (err && (err.message || err.type)) || 'Google sign-in failed.'));
              }
            };
          }
          tokenClient.requestAccessToken({ prompt: prompt || '' });
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  function initNative() {
    if (nativeReady) return Promise.resolve(nativePlugin());
    var plugin = nativePlugin();
    if (!plugin) return Promise.resolve(null);
    var args = {
      clientId: webClientId(),
      scopes: SCOPE,
      grantOfflineAccess: false
    };
    var p = typeof plugin.initialize === 'function' ? plugin.initialize(args) : Promise.resolve();
    return Promise.resolve(p).then(function () {
      nativeReady = true;
      return plugin;
    }).catch(function (err) {
      // Still try signIn; some versions initialise themselves.
      nativeReady = true;
      return plugin;
    });
  }

  function tokenFromNativeUser(user) {
    if (!user) return '';
    var auth = user.authentication || user;
    return (auth && (auth.accessToken || auth.access_token)) || user.accessToken || '';
  }

  function emailFromNativeUser(user) {
    if (!user) return '';
    return user.email || (user.authentication && user.authentication.email) || '';
  }

  function requestNativeToken(opts) {
    opts = opts || {};
    return initNative().then(function (plugin) {
      if (!plugin) throw DriveError('api', 'Google sign-in is not available in this build.');
      ensureOnline();
      var method = opts.silent && typeof plugin.refresh === 'function' ? 'refresh' : 'signIn';
      if (typeof plugin[method] !== 'function') method = 'signIn';
      return plugin[method]();
    }).then(function (user) {
      var token = tokenFromNativeUser(user);
      if (!token) throw DriveError('api', 'Google sign-in did not return an access token.');
      accessToken = token;
      tokenExpiry = Date.now() + 50 * 60 * 1000;
      var email = emailFromNativeUser(user);
      account = email ? { email: email } : { email: '', label: 'Signed in to Google' };
      if (email) saveMeta({ email: email });
      return accessToken;
    }).catch(function (err) {
      var msg = String((err && (err.message || err.error || err)) || '');
      if (/cancel|denied|closed/i.test(msg)) throw DriveError('cancelled', 'Sign-in was cancelled.');
      throw err;
    });
  }

  function useNativeAuth() {
    return isNative() && !!nativePlugin();
  }

  function obtainToken(opts) {
    opts = opts || {};
    if (isSignedIn() && !opts.force) return Promise.resolve(accessToken);
    if (!isConfigured()) return Promise.reject(DriveError('not-configured', "Google Drive backup isn't set up yet."));
    ensureOnline();
    if (useNativeAuth()) return requestNativeToken(opts);
    return requestGisToken(opts.silent ? '' : (opts.force ? 'consent' : 'consent')).then(function (token) {
      account = account || { email: loadMeta().email || '', label: 'Signed in to Google' };
      return token;
    });
  }

  function authHeaders() {
    if (!isSignedIn()) throw DriveError('not-signed-in', 'Sign in with Google to back up.');
    return { Authorization: 'Bearer ' + accessToken };
  }

  function parseDriveError(res, body) {
    var msg = 'Could not reach Google Drive. Try again in a moment.';
    try {
      var j = typeof body === 'string' ? JSON.parse(body) : body;
      if (j && j.error && j.error.message) msg = j.error.message;
    } catch (e) { /* keep default */ }
    if (res && (res.status === 401 || res.status === 403)) {
      accessToken = '';
      tokenExpiry = 0;
      return DriveError('not-signed-in', 'Sign in with Google to back up.');
    }
    return DriveError('api', msg);
  }

  function driveFetch(url, init) {
    ensureOnline();
    init = init || {};
    init.headers = Object.assign({}, authHeaders(), init.headers || {});
    return fetch(url, init).then(function (res) {
      if (res.status === 204) return { res: res, body: '' };
      return res.text().then(function (body) { return { res: res, body: body }; });
    }).catch(function (err) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw offlineErr();
      var msg = String(err && err.message || err || '');
      if (/failed to fetch|networkerror|network request failed/i.test(msg)) throw offlineErr();
      throw DriveError('api', 'Could not reach Google Drive. Try again in a moment.');
    }).then(function (pair) {
      if (!pair.res.ok) throw parseDriveError(pair.res, pair.body);
      if (!pair.body) return {};
      try { return JSON.parse(pair.body); } catch (e) { return pair.body; }
    });
  }

  function listRemote() {
    var q = encodeURIComponent("name contains 'expenses-backup-'");
    var fields = encodeURIComponent('files(id,name,createdTime,modifiedTime,size)');
    var url = DRIVE_API + '/files?spaces=appDataFolder&pageSize=50&orderBy=createdTime%20desc&fields=' + fields + '&q=' + q;
    return driveFetch(url).then(function (data) {
      var files = (data && data.files) || [];
      files = files.filter(function (f) { return f && f.name && NAME_RE.test(f.name); });
      files.sort(function (a, b) {
        return String(b.createdTime || b.modifiedTime || '').localeCompare(String(a.createdTime || a.modifiedTime || ''));
      });
      backupList = files;
      return files;
    });
  }

  function pruneOld(files) {
    var extra = (files || []).slice(MAX_BACKUPS);
    var chain = Promise.resolve();
    extra.forEach(function (f) {
      chain = chain.then(function () {
        return driveFetch(DRIVE_API + '/files/' + encodeURIComponent(f.id), { method: 'DELETE' }).catch(function () { /* keep going */ });
      });
    });
    return chain.then(function () { return files.slice(0, MAX_BACKUPS); });
  }

  function uploadBackup() {
    var name = backupFileName(new Date());
    var payload = JSON.stringify(collectSnapshot());
    var meta = JSON.stringify({
      name: name,
      parents: ['appDataFolder'],
      mimeType: 'application/json'
    });
    var boundary = 'hisab_' + Math.random().toString(36).slice(2);
    var body =
      '--' + boundary + '\r\n' +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      meta + '\r\n' +
      '--' + boundary + '\r\n' +
      'Content-Type: application/json\r\n\r\n' +
      payload + '\r\n' +
      '--' + boundary + '--';
    return driveFetch(DRIVE_UPLOAD + '?uploadType=multipart&fields=id,name,createdTime,size', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body: body
    }).then(function (file) {
      saveMeta({ lastBackupAt: Date.now() });
      return file;
    });
  }

  function downloadBackup(fileId) {
    return driveFetch(DRIVE_API + '/files/' + encodeURIComponent(fileId) + '?alt=media').then(function (data) {
      var snap = validateSnapshot(data);
      if (!snap) throw DriveError('api', 'That file does not look like an Expenses backup.');
      return snap;
    });
  }

  function signIn() {
    if (!isConfigured()) return Promise.reject(DriveError('not-configured', "Google Drive backup isn't set up yet."));
    lastError = '';
    busy = true;
    notify();
    return obtainToken({ force: true }).then(function () {
      return listRemote().catch(function (err) {
        // Signed in, but listing failed — still count as signed in.
        lastError = friendlyError(err);
        return [];
      });
    }).then(function () {
      busy = false;
      notify();
      return getStatus();
    }).catch(function (err) {
      busy = false;
      lastError = friendlyError(err);
      notify();
      throw err;
    });
  }

  function signOut() {
    var finish = function () {
      accessToken = '';
      tokenExpiry = 0;
      account = null;
      backupList = [];
      lastError = '';
      saveMeta({ email: '' });
      busy = false;
      notify();
    };
    busy = true;
    notify();
    var chain = Promise.resolve();
    if (accessToken && global.google && google.accounts && google.accounts.oauth2 && google.accounts.oauth2.revoke) {
      chain = new Promise(function (resolve) {
        try {
          google.accounts.oauth2.revoke(accessToken, function () { resolve(); });
          setTimeout(resolve, 2000);
        } catch (e) { resolve(); }
      });
    }
    if (useNativeAuth()) {
      chain = chain.then(function () {
        var plugin = nativePlugin();
        if (plugin && typeof plugin.signOut === 'function') return plugin.signOut();
      }).catch(function () { /* still clear local session */ });
    }
    return chain.then(finish, finish);
  }

  function backupNow() {
    if (!isConfigured()) return Promise.reject(DriveError('not-configured', "Google Drive backup isn't set up yet."));
    lastError = '';
    busy = true;
    notify();
    return obtainToken({ silent: isSignedIn() }).then(function () {
      return uploadBackup();
    }).then(function () {
      return listRemote();
    }).then(function (files) {
      return pruneOld(files);
    }).then(function (files) {
      backupList = files;
      busy = false;
      lastError = '';
      notify();
      return getStatus();
    }).catch(function (err) {
      busy = false;
      lastError = friendlyError(err);
      notify();
      throw err;
    });
  }

  function refreshList() {
    if (!isSignedIn()) return Promise.resolve([]);
    listLoading = true;
    notify();
    return listRemote().then(function (files) {
      listLoading = false;
      notify();
      return files;
    }).catch(function (err) {
      listLoading = false;
      lastError = friendlyError(err);
      notify();
      throw err;
    });
  }

  function restore(fileId) {
    if (!fileId) return Promise.reject(DriveError('api', 'Choose a backup to restore.'));
    lastError = '';
    busy = true;
    notify();
    return obtainToken({ silent: isSignedIn() }).then(function () {
      return downloadBackup(fileId);
    }).then(function (snap) {
      applySnapshot(snap);
      busy = false;
      notify();
      return snap;
    }).catch(function (err) {
      busy = false;
      lastError = friendlyError(err);
      notify();
      throw err;
    });
  }

  function setSchedule(value) {
    if (value !== 'daily' && value !== 'weekly') value = 'off';
    saveMeta({ schedule: value });
    notify();
    return value;
  }

  function maybeAutoBackup() {
    if (!isConfigured()) return Promise.resolve(null);
    var meta = loadMeta();
    if (meta.schedule !== 'daily' && meta.schedule !== 'weekly') return Promise.resolve(null);
    var interval = meta.schedule === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    if (meta.lastBackupAt && (Date.now() - meta.lastBackupAt) < interval) return Promise.resolve(null);
    return obtainToken({ silent: true }).then(function () {
      return backupNow();
    }).catch(function (err) {
      // Silent failure on open: keep the last error for Settings, do not throw.
      lastError = friendlyError(err);
      notify();
      return null;
    });
  }

  function init(opts) {
    if (opts && typeof opts === 'object') hooks = Object.assign(hooks, opts);
    if (started) { notify(); return; }
    started = true;
    if (!isConfigured()) { notify(); return; }
    // Do not load GIS or contact Google until the user signs in or an
    // automatic backup needs a token.
    var meta = loadMeta();
    if (meta.email) account = { email: meta.email };
    notify();
  }

  global.HisabDrive = {
    isConfigured: isConfigured,
    isSignedIn: isSignedIn,
    init: init,
    signIn: signIn,
    signOut: signOut,
    backupNow: backupNow,
    maybeAutoBackup: maybeAutoBackup,
    listBackups: refreshList,
    restore: restore,
    setSchedule: setSchedule,
    getSchedule: function () { return loadMeta().schedule; },
    lastBackupAt: function () { return loadMeta().lastBackupAt || 0; },
    getStatus: getStatus,
    account: function () { return account; },
    friendlyError: friendlyError,
    collectSnapshot: collectSnapshot
  };
})(window);

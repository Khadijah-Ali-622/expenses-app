/* Hisab backup to a file the user saves themselves (for example via
   Android's share sheet → Save to Drive). The app never signs in to
   Google and never calls the Drive API. */
(function (global) {
  'use strict';

  var META_KEY = 'hisab-drive-meta';
  var FORMAT = 'expenses-drive-backup-v1';
  var APP_VERSION = '1.3.0';
  var HELPER_TEXT = 'Choose Save to Drive, then your Gmail account.';

  var hooks = { onChange: null };
  var started = false;
  var busy = false;
  var lastError = '';
  var reminderDismissed = false;

  function DriveError(code, message) {
    var err = new Error(message || 'Something went wrong.');
    err.code = code;
    return err;
  }

  function friendlyError(err) {
    if (!err) return 'Something went wrong.';
    var code = err.code || '';
    if (code === 'cancelled') return 'Share was cancelled.';
    if (code === 'api') return err.message || 'Could not finish the backup.';
    var msg = String(err.message || err);
    if (/abort|cancel/i.test(msg)) return 'Share was cancelled.';
    return msg || 'Could not finish the backup.';
  }

  function loadMeta() {
    try {
      var raw = global.localStorage.getItem(META_KEY);
      if (!raw) return { schedule: 'off', lastBackupAt: 0 };
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return { schedule: 'off', lastBackupAt: 0 };
      if (data.schedule === 'daily') data.schedule = 'weekly';
      if (data.schedule !== 'weekly' && data.schedule !== 'monthly') data.schedule = 'off';
      data.lastBackupAt = Number(data.lastBackupAt || 0);
      return { schedule: data.schedule, lastBackupAt: data.lastBackupAt };
    } catch (e) {
      return { schedule: 'off', lastBackupAt: 0 };
    }
  }

  function saveMeta(patch) {
    var meta = loadMeta();
    Object.keys(patch || {}).forEach(function (k) { meta[k] = patch[k]; });
    if (meta.schedule === 'daily') meta.schedule = 'weekly';
    if (meta.schedule !== 'weekly' && meta.schedule !== 'monthly') meta.schedule = 'off';
    meta.lastBackupAt = Number(meta.lastBackupAt || 0);
    try { global.localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* quota */ }
    return meta;
  }

  function notify() {
    if (hooks.onChange) {
      try { hooks.onChange(getStatus()); } catch (e) { /* ignore */ }
    }
  }

  function getStatus() {
    var meta = loadMeta();
    return {
      schedule: meta.schedule || 'off',
      lastBackupAt: meta.lastBackupAt || 0,
      busy: busy,
      error: lastError,
      reminder: shouldRemind() && !reminderDismissed,
      helperText: HELPER_TEXT
    };
  }

  function collectSnapshot() {
    var keys = {};
    var store = global.localStorage;
    if (!store) {
      return { format: FORMAT, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), keys: keys };
    }
    for (var i = 0; i < store.length; i++) {
      var k = store.key(i);
      if (!k) continue;
      if (k === 'hisab-v1' || k.indexOf('hisab-') === 0) {
        keys[k] = store.getItem(k);
      }
    }
    return { format: FORMAT, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), keys: keys };
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
        appVersion: APP_VERSION,
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
    // Keep this device's reminder setting and last-backup time.
    saveMeta({
      schedule: keepMeta.schedule,
      lastBackupAt: keepMeta.lastBackupAt
    });
  }

  function backupFileName(date) {
    var d = date || new Date();
    function p(n) { return n < 10 ? '0' + n : String(n); }
    return 'expenses-backup-' +
      d.getFullYear() + '-' +
      p(d.getMonth() + 1) + '-' +
      p(d.getDate()) + '-' +
      p(d.getHours()) +
      p(d.getMinutes()) +
      '.json';
  }

  function isNative() {
    var cap = global.Capacitor;
    return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  }

  function capPlugin(name) {
    var cap = global.Capacitor;
    if (!cap || !cap.Plugins) return null;
    return cap.Plugins[name] || null;
  }

  function downloadFallback(filename, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
    return { method: 'download', filename: filename };
  }

  function shareOnNative(filename, json) {
    var FS = capPlugin('Filesystem');
    var Share = capPlugin('Share');
    if (!FS || !Share) {
      return Promise.resolve(downloadFallback(filename, json));
    }
    return FS.writeFile({
      path: filename,
      data: json,
      directory: 'CACHE',
      encoding: 'utf8',
      recursive: true
    }).then(function () {
      return FS.getUri({ path: filename, directory: 'CACHE' });
    }).then(function (res) {
      var uri = res && (res.uri || res.fileUri);
      if (!uri) throw DriveError('api', 'Could not create the backup file.');
      var payload = {
        title: 'Expenses backup',
        text: HELPER_TEXT,
        files: [uri],
        dialogTitle: 'Back up to Google Drive'
      };
      return Promise.resolve(Share.share(payload)).catch(function (err) {
        // Older Share versions accept a single url instead of files.
        var msg = String((err && (err.message || err)) || '');
        if (/files|not implemented|unsupported/i.test(msg) && typeof Share.share === 'function') {
          return Share.share({
            title: 'Expenses backup',
            text: HELPER_TEXT,
            url: uri,
            dialogTitle: 'Back up to Google Drive'
          });
        }
        throw err;
      }).then(function () {
        return { method: 'share', filename: filename };
      });
    });
  }

  function shareOnWeb(filename, json) {
    try {
      if (typeof File === 'function' && navigator.share) {
        var file = new File([json], filename, { type: 'application/json' });
        var can = !navigator.canShare || navigator.canShare({ files: [file] });
        if (can) {
          return navigator.share({
            files: [file],
            title: 'Expenses backup',
            text: HELPER_TEXT
          }).then(function () {
            return { method: 'share', filename: filename };
          }).catch(function (err) {
            var name = err && err.name;
            var msg = String((err && err.message) || '');
            if (name === 'AbortError' || /abort|cancel/i.test(msg)) {
              throw DriveError('cancelled', 'Share was cancelled.');
            }
            return downloadFallback(filename, json);
          });
        }
      }
    } catch (e) {
      // Fall through to a plain download.
    }
    return Promise.resolve(downloadFallback(filename, json));
  }

  function backupNow() {
    if (busy) return Promise.resolve(null);
    busy = true;
    lastError = '';
    notify();
    var snap = collectSnapshot();
    var json = JSON.stringify(snap, null, 2);
    var filename = backupFileName(new Date());
    var task = isNative() ? shareOnNative(filename, json) : shareOnWeb(filename, json);
    return task.then(function (result) {
      saveMeta({ lastBackupAt: Date.now() });
      lastError = '';
      return result || { method: 'share', filename: filename };
    }).catch(function (err) {
      if ((err && err.code) === 'cancelled' || /abort|cancel/i.test(String((err && err.message) || ''))) {
        lastError = '';
        throw DriveError('cancelled', 'Share was cancelled.');
      }
      lastError = friendlyError(err);
      throw err;
    }).finally(function () {
      busy = false;
      notify();
    });
  }

  function readBackupFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file) {
        reject(DriveError('api', 'Choose a backup file to restore.'));
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(String(reader.result));
          var snap = validateSnapshot(data);
          if (!snap) {
            reject(DriveError('api', 'That file does not look like an Expenses backup.'));
            return;
          }
          resolve(snap);
        } catch (e) {
          reject(DriveError('api', 'Could not read that file.'));
        }
      };
      reader.onerror = function () {
        reject(DriveError('api', 'Could not read that file.'));
      };
      reader.readAsText(file);
    });
  }

  function restore(snapOrData) {
    applySnapshot(snapOrData);
  }

  function setSchedule(value) {
    var next = value === 'weekly' || value === 'monthly' ? value : 'off';
    saveMeta({ schedule: next });
    notify();
    return next;
  }

  function shouldRemind() {
    var meta = loadMeta();
    if (meta.schedule !== 'weekly' && meta.schedule !== 'monthly') return false;
    var days = meta.schedule === 'weekly' ? 7 : 30;
    if (!meta.lastBackupAt) return true;
    return (Date.now() - meta.lastBackupAt) >= days * 24 * 60 * 60 * 1000;
  }

  function dismissReminder() {
    reminderDismissed = true;
    notify();
  }

  function reminderMessage() {
    var meta = loadMeta();
    if (!meta.lastBackupAt) return "You haven't backed up yet. Save a copy to Google Drive from Settings.";
    if (meta.schedule === 'monthly') return 'Your last backup is more than a month old. Save a new copy to Google Drive?';
    return 'Your last backup is more than a week old. Save a new copy to Google Drive?';
  }

  function init(opts) {
    if (opts && typeof opts === 'object') hooks = Object.assign(hooks, opts);
    if (started) { notify(); return; }
    started = true;
    // Migrate an older daily/weekly auto-upload setting to a reminder.
    var meta = loadMeta();
    saveMeta(meta);
    notify();
  }

  global.HisabDrive = {
    init: init,
    backupNow: backupNow,
    readBackupFile: readBackupFile,
    restore: restore,
    applySnapshot: applySnapshot,
    validateSnapshot: validateSnapshot,
    collectSnapshot: collectSnapshot,
    backupFileName: backupFileName,
    setSchedule: setSchedule,
    getSchedule: function () { return loadMeta().schedule; },
    lastBackupAt: function () { return loadMeta().lastBackupAt || 0; },
    getStatus: getStatus,
    shouldRemind: shouldRemind,
    dismissReminder: dismissReminder,
    reminderMessage: reminderMessage,
    friendlyError: friendlyError,
    helperText: HELPER_TEXT,
    format: FORMAT,
    appVersion: APP_VERSION
  };
})(window);

/* Hisab cloud layer: Firebase Auth + Firestore sync.
   Does nothing (no init, no network) when HISAB_FIREBASE_CONFIG is empty. */
(function (global) {
  'use strict';

  var COLLECTIONS = ['accounts', 'categories', 'transactions', 'budgets', 'recurring_rules'];
  var INIT_KEY_PREFIX = 'hisab-cloud-init:';

  var hooks = null;
  var fb = null;
  var app = null;
  var auth = null;
  var db = null;
  var currentUser = null;
  var unsubAuth = null;
  var unsubs = [];
  var pushTimer = 0;
  var syncing = false;
  var pendingPush = false;
  var ignoreSnapshots = 0;
  var status = { kind: 'local', label: 'Local only', error: '' };
  var listeners = [];
  var lastSyncAt = 0;
  var started = false;

  function config() {
    return global.HISAB_FIREBASE_CONFIG || {};
  }

  function isConfigured() {
    var c = config();
    return !!(c && String(c.apiKey || '').trim() && String(c.projectId || '').trim());
  }

  function emulator() {
    return global.HISAB_FIREBASE_EMULATOR || null;
  }

  function friendlyAuthError(err) {
    var code = (err && err.code) || '';
    var map = {
      'auth/invalid-email': 'That email address does not look valid.',
      'auth/user-disabled': 'This account has been disabled.',
      'auth/user-not-found': 'No account exists with that email.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/invalid-credential': 'Incorrect email or password.',
      'auth/email-already-in-use': 'An account with that email already exists. Try signing in.',
      'auth/weak-password': 'Use a password of at least 6 characters.',
      'auth/missing-password': 'Enter a password.',
      'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
      'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
      'auth/popup-blocked': 'The sign-in popup was blocked. Allow popups, or use email and password.',
      'auth/operation-not-allowed': 'That sign-in method is not enabled in the Firebase Console.',
      'auth/network-request-failed': 'Network error. Check your connection and try again.',
      'auth/unauthorized-domain': 'This site is not an authorised domain in the Firebase Console.'
    };
    return map[code] || (err && err.message) || 'Something went wrong.';
  }

  function setStatus(kind, error) {
    var labels = {
      local: 'Local only',
      signedout: 'Not signed in',
      syncing: 'Syncing…',
      synced: 'Synced',
      offline: 'Offline',
      error: 'Sync error'
    };
    status = { kind: kind, label: labels[kind] || kind, error: error || '', at: Date.now() };
    if (kind === 'synced') lastSyncAt = Date.now();
    listeners.forEach(function (fn) {
      try { fn(status); } catch (e) { /* ignore */ }
    });
    if (hooks && hooks.onStatus) hooks.onStatus(status);
  }

  function serialize(item) {
    var out = {};
    Object.keys(item || {}).forEach(function (k) {
      var v = item[k];
      if (v === undefined) return;
      out[k] = v;
    });
    if (!out.id) return null;
    out.updated_at = Number(out.updated_at) || 0;
    out.deleted = !!out.deleted;
    return out;
  }

  function hasMeaningfulLocal(state) {
    if (!state) return false;
    function active(list) {
      return (list || []).filter(function (x) { return x && !x.deleted; });
    }
    if (active(state.transactions).length) return true;
    if (active(state.budgets).length) return true;
    if (active(state.recurring_rules).length) return true;
    if (active(state.accounts).some(function (a) { return (a.opening_balance || 0) !== 0; })) return true;
    if (active(state.categories).some(function (c) { return !c.is_default; })) return true;
    return false;
  }

  function mergeLists(local, remote) {
    var map = {};
    (local || []).forEach(function (item) {
      if (item && item.id) map[item.id] = item;
    });
    (remote || []).forEach(function (item) {
      if (!item || !item.id) return;
      var cur = map[item.id];
      if (!cur || (Number(item.updated_at) || 0) > (Number(cur.updated_at) || 0)) {
        map[item.id] = item;
      }
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function colRef(name) {
    return fb.collection(db, 'users', currentUser.uid, name);
  }

  function docRef(name, id) {
    return fb.doc(db, 'users', currentUser.uid, name, id);
  }

  async function fetchCollection(name) {
    var snap = await fb.getDocs(colRef(name));
    return snap.docs.map(function (d) { return d.data(); });
  }

  async function fetchAllRemote() {
    var out = {};
    for (var i = 0; i < COLLECTIONS.length; i++) {
      out[COLLECTIONS[i]] = await fetchCollection(COLLECTIONS[i]);
    }
    return out;
  }

  function remoteHasDocs(remote) {
    return COLLECTIONS.some(function (n) { return (remote[n] || []).length > 0; });
  }

  function remoteHasMeaningful(remote) {
    return hasMeaningfulLocal(remote);
  }

  async function batchWrite(writes) {
    var i = 0;
    while (i < writes.length) {
      var batch = fb.writeBatch(db);
      var chunk = writes.slice(i, i + 400);
      chunk.forEach(function (w) { batch.set(w.ref, w.data); });
      await batch.commit();
      i += 400;
    }
  }

  async function uploadLocalReplaceCloud() {
    if (!currentUser) return;
    var state = hooks.getState();
    var remote = await fetchAllRemote();
    var writes = [];
    var now = Date.now();
    COLLECTIONS.forEach(function (name) {
      var local = state[name] || [];
      var ids = {};
      local.forEach(function (item) {
        var data = serialize(item);
        if (!data) return;
        ids[data.id] = true;
        writes.push({ ref: docRef(name, data.id), data: data });
      });
      (remote[name] || []).forEach(function (item) {
        if (!item || !item.id || ids[item.id]) return;
        var tomb = serialize(item);
        tomb.deleted = true;
        tomb.updated_at = now;
        writes.push({ ref: docRef(name, tomb.id), data: tomb });
      });
    });
    ignoreSnapshots++;
    try {
      await batchWrite(writes);
    } finally {
      setTimeout(function () { ignoreSnapshots = Math.max(0, ignoreSnapshots - 1); }, 1500);
    }
  }

  function applyRemoteCollections(remote) {
    hooks.replaceCollections(remote);
  }

  async function chooseFirstSync() {
    var state = hooks.getState();
    var remote = await fetchAllRemote();
    var key = INIT_KEY_PREFIX + currentUser.uid;
    if (localStorage.getItem(key) === 'done') {
      var merged = {};
      COLLECTIONS.forEach(function (n) {
        merged[n] = mergeLists(state[n], remote[n]);
      });
      hooks.replaceCollections(merged);
      await pushMerged(merged, remote);
      return;
    }
    var localM = hasMeaningfulLocal(state);
    var cloudM = remoteHasMeaningful(remote);
    var cloudAny = remoteHasDocs(remote);

    if (localM && cloudM) {
      var choice = await hooks.chooseFirstSync();
      if (choice === 'upload') {
        await uploadLocalReplaceCloud();
      } else {
        applyRemoteCollections(remote);
      }
    } else if (localM) {
      await uploadLocalReplaceCloud();
    } else if (cloudAny) {
      applyRemoteCollections(remote);
    } else {
      await uploadLocalReplaceCloud();
    }
    localStorage.setItem(key, 'done');
  }

  async function pushMerged(merged, remote) {
    var writes = [];
    COLLECTIONS.forEach(function (name) {
      var rmap = {};
      (remote[name] || []).forEach(function (item) {
        if (item && item.id) rmap[item.id] = item;
      });
      (merged[name] || []).forEach(function (item) {
        var data = serialize(item);
        if (!data) return;
        var r = rmap[data.id];
        if (!r || (data.updated_at || 0) > (Number(r.updated_at) || 0)) {
          writes.push({ ref: docRef(name, data.id), data: data });
        }
      });
    });
    if (!writes.length) return;
    ignoreSnapshots++;
    try {
      await batchWrite(writes);
    } finally {
      setTimeout(function () { ignoreSnapshots = Math.max(0, ignoreSnapshots - 1); }, 1500);
    }
  }

  async function reconcile() {
    if (!isConfigured() || !currentUser || !db) return;
    if (syncing) { pendingPush = true; return; }
    syncing = true;
    pendingPush = false;
    if (!navigator.onLine) setStatus('offline');
    else setStatus('syncing');
    try {
      var state = hooks.getState();
      var remote = await fetchAllRemote();
      var merged = {};
      COLLECTIONS.forEach(function (n) {
        merged[n] = mergeLists(state[n], remote[n]);
      });
      hooks.replaceCollections(merged);
      await pushMerged(merged, remote);
      setStatus(navigator.onLine ? 'synced' : 'offline');
    } catch (err) {
      if (!navigator.onLine) setStatus('offline');
      else setStatus('error', (err && err.message) || 'Sync failed');
      if (hooks && hooks.onError) hooks.onError(err);
    } finally {
      syncing = false;
      if (pendingPush) {
        pendingPush = false;
        schedulePush();
      }
    }
  }

  function schedulePush() {
    if (!isConfigured() || !currentUser) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { reconcile(); }, 700);
  }

  function detachSnapshots() {
    unsubs.forEach(function (u) { try { u(); } catch (e) { /* ignore */ } });
    unsubs = [];
  }

  function attachSnapshots() {
    detachSnapshots();
    if (!currentUser || !db) return;
    COLLECTIONS.forEach(function (name) {
      var unsub = fb.onSnapshot(colRef(name), function (snap) {
        if (ignoreSnapshots) return;
        if (snap.metadata && snap.metadata.hasPendingWrites) return;
        var remote = snap.docs.map(function (d) { return d.data(); });
        var state = hooks.getState();
        var merged = mergeLists(state[name], remote);
        var changed = JSON.stringify(merged) !== JSON.stringify(state[name] || []);
        if (changed) {
          var patch = {};
          patch[name] = merged;
          hooks.replaceCollections(patch);
        }
      }, function (err) {
        setStatus('error', (err && err.message) || 'Live sync failed');
      });
      unsubs.push(unsub);
    });
  }

  function waitUntilReady() {
    return new Promise(function (resolve) {
      function tick() {
        if (!hooks || typeof hooks.isAppReady !== 'function' || hooks.isAppReady()) resolve();
        else setTimeout(tick, 120);
      }
      tick();
    });
  }

  async function afterLogin() {
    setStatus('syncing');
    try {
      await waitUntilReady();
      if (!currentUser) return;
      await chooseFirstSync();
      attachSnapshots();
      setStatus(navigator.onLine ? 'synced' : 'offline');
    } catch (err) {
      setStatus('error', (err && err.message) || 'Could not sync');
      throw err;
    }
  }

  function onUser(user) {
    currentUser = user || null;
    detachSnapshots();
    if (!user) {
      setStatus(isConfigured() ? 'signedout' : 'local');
      if (hooks && hooks.onAuth) hooks.onAuth(null);
      return;
    }
    if (hooks && hooks.onAuth) hooks.onAuth(userInfo());
    afterLogin().catch(function (err) {
      if (hooks && hooks.onError) hooks.onError(err);
    });
  }

  function userInfo() {
    if (!currentUser) return null;
    return {
      uid: currentUser.uid,
      email: currentUser.email || '',
      displayName: currentUser.displayName || '',
      provider: (currentUser.providerData && currentUser.providerData[0] && currentUser.providerData[0].providerId) || 'password'
    };
  }

  function startFirebase() {
    if (started || !isConfigured()) return;
    fb = global.HisabFirebase;
    if (!fb || !fb.initializeApp) {
      setStatus('error', 'Firebase library failed to load.');
      return;
    }
    started = true;
    app = fb.initializeApp(config());
    var emu = emulator();
    try {
      auth = fb.initializeAuth(app, { persistence: fb.indexedDBLocalPersistence });
    } catch (e) {
      auth = fb.getAuth(app);
    }
    try {
      db = fb.initializeFirestore(app, {
        localCache: fb.persistentLocalCache({
          tabManager: fb.persistentMultipleTabManager()
        })
      });
    } catch (e) {
      db = fb.getFirestore(app);
    }
    if (emu) {
      if (emu.authHost) fb.connectAuthEmulator(auth, emu.authHost, { disableWarnings: true });
      if (emu.firestoreHost) fb.connectFirestoreEmulator(db, emu.firestoreHost, emu.firestorePort || 8080);
    }
    unsubAuth = fb.onAuthStateChanged(auth, onUser);
    global.addEventListener('online', function () {
      if (currentUser) {
        setStatus('syncing');
        if (fb.enableNetwork) fb.enableNetwork(db).catch(function () {});
        schedulePush();
      }
    });
    global.addEventListener('offline', function () {
      if (currentUser) setStatus('offline');
    });
  }

  function init(appHooks) {
    hooks = appHooks || hooks;
    if (!isConfigured()) {
      setStatus('local');
      return;
    }
    setStatus('signedout');
    startFirebase();
  }

  function requireConfigured() {
    if (!isConfigured()) throw new Error('Cloud sync is not configured yet.');
    if (!auth) throw new Error('Cloud is still starting. Try again in a moment.');
  }

  async function signInEmail(email, password) {
    requireConfigured();
    await fb.signInWithEmailAndPassword(auth, email, password);
  }

  async function signUpEmail(email, password) {
    requireConfigured();
    await fb.createUserWithEmailAndPassword(auth, email, password);
  }

  async function resetPassword(email) {
    requireConfigured();
    await fb.sendPasswordResetEmail(auth, email);
  }

  async function signInGoogle() {
    requireConfigured();
    var provider = new fb.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await fb.signInWithPopup(auth, provider);
  }

  async function signOutUser() {
    detachSnapshots();
    currentUser = null;
    if (auth) await fb.signOut(auth);
    setStatus(isConfigured() ? 'signedout' : 'local');
  }

  async function deleteCloudData() {
    requireConfigured();
    if (!currentUser) throw new Error('Sign in first.');
    var remote = await fetchAllRemote();
    var now = Date.now();
    var writes = [];
    COLLECTIONS.forEach(function (name) {
      (remote[name] || []).forEach(function (item) {
        if (!item || !item.id) return;
        var tomb = serialize(item);
        tomb.deleted = true;
        tomb.updated_at = now;
        writes.push({ ref: docRef(name, tomb.id), data: tomb });
      });
    });
    await batchWrite(writes);
    localStorage.removeItem(INIT_KEY_PREFIX + currentUser.uid);
  }

  global.HisabCloud = {
    COLLECTIONS: COLLECTIONS,
    isConfigured: isConfigured,
    isSignedIn: function () { return !!currentUser; },
    user: userInfo,
    getStatus: function () { return status; },
    lastSyncAt: function () { return lastSyncAt; },
    onStatus: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; },
    init: init,
    schedulePush: schedulePush,
    syncNow: function () { return reconcile(); },
    signInEmail: signInEmail,
    signUpEmail: signUpEmail,
    resetPassword: resetPassword,
    signInGoogle: signInGoogle,
    signOut: signOutUser,
    deleteCloudData: deleteCloudData,
    friendlyAuthError: friendlyAuthError
  };
})(window);

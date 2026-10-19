// Couche réseau Firebase : connexion Google, profils, rooms et réplication des positions.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getDatabase, ref, get, set, update, remove, onValue, onDisconnect, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans O/0/I/1 pour éviter les confusions
export const MAX_PLAYERS = 5;

function randomCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

function cleanName(name) {
  return (name || 'Joueur').split(' ')[0].replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 10) || 'Joueur';
}

export function createFirebaseNet(config) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getDatabase(app);

  let user = null;
  let profile = null;
  let roomCode = null;
  let isHost = false;
  let unsubs = [];
  let disconnects = []; // actions onDisconnect à annuler si on quitte proprement

  async function ensureProfile(u) {
    const r = ref(db, `users/${u.uid}`);
    const snap = await get(r);
    if (snap.exists()) return snap.val();
    // Création du compte : niveau 1, 0 exp, 0 or (les règles de sécurité imposent ces valeurs)
    const p = { name: cleanName(u.displayName), level: 1, xp: 0, gold: 0, createdAt: serverTimestamp() };
    await set(r, p);
    return { ...p, createdAt: Date.now() };
  }

  function clearWatchers() {
    unsubs.forEach((f) => f());
    unsubs = [];
  }

  return {
    mode: 'firebase',
    get uid() { return user?.uid; },
    get profile() { return profile; },
    get roomCode() { return roomCode; },

    onAuth(cb) {
      onAuthStateChanged(auth, async (u) => {
        user = u;
        if (!u) { profile = null; cb(null); return; }
        try {
          profile = await ensureProfile(u);
          cb(profile);
        } catch (e) {
          console.error(e);
          cb(null, e);
        }
      });
    },

    signIn() {
      return signInWithPopup(auth, new GoogleAuthProvider());
    },

    signOut() {
      return signOut(auth);
    },

    async createRoom() {
      for (let i = 0; i < 10; i++) {
        const code = randomCode();
        const r = ref(db, `rooms/${code}`);
        if ((await get(r)).exists()) continue;
        await set(r, {
          host: user.uid,
          seed: Math.floor(Math.random() * 2 ** 31),
          status: 'lobby',
          createdAt: serverTimestamp(),
          players: { [user.uid]: { name: profile.name, level: profile.level, joinedAt: serverTimestamp() } },
        });
        // Si l'hôte ferme son onglet, la room disparaît
        const d = onDisconnect(r);
        await d.remove();
        disconnects.push(d);
        roomCode = code;
        isHost = true;
        return code;
      }
      throw new Error('Impossible de créer une room, réessaie.');
    },

    async joinRoom(code) {
      code = code.toUpperCase();
      const snap = await get(ref(db, `rooms/${code}`));
      if (!snap.exists()) throw new Error('Room introuvable');
      const room = snap.val();
      const players = room.players || {};
      if (!players[user.uid] && Object.keys(players).length >= MAX_PLAYERS) throw new Error('Room pleine');
      const me = ref(db, `rooms/${code}/players/${user.uid}`);
      await set(me, { name: profile.name, level: profile.level, joinedAt: serverTimestamp() });
      for (const target of [me, ref(db, `rooms/${code}/pos/${user.uid}`)]) {
        const d = onDisconnect(target);
        await d.remove();
        disconnects.push(d);
      }
      roomCode = code;
      isHost = room.host === user.uid;
      return code;
    },

    // cb({ code, host, seed, status, players: [{uid,name,level,joinedAt}] }) ou cb({ closed: true })
    watchRoom(cb) {
      const code = roomCode;
      let meta = null, players = {};
      const emit = () => {
        if (!meta) return;
        const list = Object.entries(players)
          .map(([uid, p]) => ({ uid, ...p }))
          .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || a.uid.localeCompare(b.uid));
        cb({ code, host: meta.host, seed: meta.seed, status: meta.status, players: list });
      };
      unsubs.push(onValue(ref(db, `rooms/${code}/status`), async (s) => {
        if (!s.exists()) { cb({ closed: true }); return; }
        if (!meta) {
          const [h, sd] = await Promise.all([get(ref(db, `rooms/${code}/host`)), get(ref(db, `rooms/${code}/seed`))]);
          meta = { host: h.val(), seed: sd.val() };
        }
        meta.status = s.val();
        emit();
      }));
      unsubs.push(onValue(ref(db, `rooms/${code}/players`), (s) => {
        players = s.val() || {};
        emit();
      }));
    },

    startGame() {
      return update(ref(db, `rooms/${roomCode}`), { status: 'playing' });
    },

    sendPos(x, y, d) {
      if (!roomCode) return;
      set(ref(db, `rooms/${roomCode}/pos/${user.uid}`), { x, y, d }).catch((e) => console.warn(e));
    },

    // cb({ uid: {x,y,d} }) à chaque déplacement d'un joueur ; renvoie une fonction d'arrêt
    watchPositions(cb) {
      const off = onValue(ref(db, `rooms/${roomCode}/pos`), (s) => cb(s.val() || {}));
      unsubs.push(off);
      return off;
    },

    async leaveRoom() {
      clearWatchers();
      if (!roomCode) return;
      const code = roomCode;
      roomCode = null;
      disconnects.forEach((d) => d.cancel().catch(() => {}));
      disconnects = [];
      try {
        if (isHost) {
          await remove(ref(db, `rooms/${code}`));
        } else {
          await remove(ref(db, `rooms/${code}/pos/${user.uid}`));
          await remove(ref(db, `rooms/${code}/players/${user.uid}`));
        }
      } catch (e) {
        console.warn(e);
      }
      isHost = false;
    },
  };
}

// Mode démo : même interface que net-firebase.js, mais tout en local avec 2 bots.
// Utile pour tester le jeu avant d'avoir configuré Firebase (ou via ?demo dans l'URL).
import { World } from './world.js';

const BOTS = [{ uid: 'bot-1', name: 'Pixel', level: 3 }, { uid: 'bot-2', name: 'Byte', level: 2 }];
const DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };

export function createDemoNet() {
  const me = { uid: 'demo-player', name: 'Toi', level: 1, xp: 0, gold: 0 };
  let authCb = null;
  let signedIn = false;
  let room = null;
  let roomCb = null;
  let posCb = null;
  let timers = [];
  const pos = {};

  const emitRoom = () => roomCb && room && roomCb({ ...room, players: [...room.players] });
  const emitPos = () => posCb && posCb({ ...pos });

  function startBots() {
    const world = new World(room.seed);
    room.players.forEach((p, i) => {
      if (!p.uid.startsWith('bot')) return;
      const s = world.spawnFor(i);
      pos[p.uid] = { x: s.x, y: s.y, d: 'd' };
      let dir = 'd';
      let pause = 0;
      timers.push(setInterval(() => {
        if (pause-- > 0) return;
        if (Math.random() < 0.08) { pause = 6; return; }
        if (Math.random() < 0.25) dir = 'udlr'[Math.floor(Math.random() * 4)];
        const [dx, dy] = DIRS[dir];
        const cur = pos[p.uid];
        if (world.walkable(cur.x + dx, cur.y + dy)) pos[p.uid] = { x: cur.x + dx, y: cur.y + dy, d: dir };
        else { dir = 'udlr'[Math.floor(Math.random() * 4)]; pos[p.uid] = { ...cur, d: dir }; }
        emitPos();
      }, 170));
    });
    emitPos();
  }

  return {
    mode: 'demo',
    get uid() { return me.uid; },
    get profile() { return me; },
    get roomCode() { return room?.code; },

    onAuth(cb) { authCb = cb; setTimeout(() => cb(signedIn ? me : null), 50); },
    async signIn() { signedIn = true; authCb?.(me); },
    async signOut() { signedIn = false; authCb?.(null); },

    async createRoom() {
      room = {
        code: 'DEMO', host: me.uid, seed: Math.floor(Math.random() * 2 ** 31), status: 'lobby',
        players: [{ uid: me.uid, name: me.name, level: 1, joinedAt: 1 }],
      };
      // Les bots rejoignent le salon un par un
      BOTS.forEach((b, i) => timers.push(setTimeout(() => {
        room.players.push({ ...b, joinedAt: 2 + i });
        emitRoom();
      }, 700 * (i + 1))));
      return room.code;
    },
    async joinRoom() { throw new Error('En mode démo, crée une room'); },
    watchRoom(cb) { roomCb = cb; emitRoom(); },
    async startGame() { room.status = 'playing'; emitRoom(); startBots(); },
    sendPos(x, y, d) { pos[me.uid] = { x, y, d }; emitPos(); },
    watchPositions(cb) { posCb = cb; emitPos(); return () => { posCb = null; }; },
    async leaveRoom() {
      timers.forEach((t) => { clearInterval(t); clearTimeout(t); });
      timers = [];
      room = null; roomCb = null; posCb = null;
      for (const k of Object.keys(pos)) delete pos[k];
    },
  };
}

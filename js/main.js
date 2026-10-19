import { firebaseConfig } from './config.js';
import { Game } from './game.js';
import { avatarURL, brickPatternURL } from './sprites.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const isDemo = params.has('demo') || /^(REMPLACER|VOTRE)/.test(String(firebaseConfig.apiKey));

let net = null;
let game = null;
let watching = false;
let pendingRoom = (params.get('room') || '').toUpperCase().slice(0, 4);

/* ───────── Écrans & messages ───────── */

function show(name) {
  document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== `screen-${name}`; });
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

function busy(btn, on) {
  btn.disabled = on;
}

/* ───────── Menu principal ───────── */

function showMenu(profile) {
  $('p-name').textContent = profile.name;
  $('p-level').textContent = profile.level;
  $('p-xp').textContent = profile.xp;
  $('p-gold').textContent = profile.gold;
  $('menu-avatar').src = avatarURL(0);
  show('menu');
}

async function createRoom(btn) {
  busy(btn, true);
  try {
    const code = await net.createRoom();
    enterRoom(code);
  } catch (e) {
    toast(e.message || 'Erreur');
  } finally {
    busy(btn, false);
  }
}

async function joinRoom(code, btn) {
  code = code.trim().toUpperCase();
  if (code.length !== 4) { toast('Le code fait 4 caractères'); return; }
  if (btn) busy(btn, true);
  try {
    await net.joinRoom(code);
    enterRoom(code);
  } catch (e) {
    toast(e.message || 'Erreur');
  } finally {
    if (btn) busy(btn, false);
  }
}

/* ───────── Salon (lobby) ───────── */

function enterRoom(code) {
  $('lobby-code').textContent = code;
  $('game-code').textContent = `ROOM ${code}`;
  history.replaceState(null, '', `?room=${code}${isDemo && params.has('demo') ? '&demo' : ''}`);
  show('lobby');
  watching = true;
  net.watchRoom(onRoom);
}

function onRoom(room) {
  if (!watching) return;
  if (room.closed) {
    leave('La room a été fermée par l’hôte');
    return;
  }
  const isHost = room.host === net.uid;
  renderLobby(room, isHost);
  if (room.status === 'playing') {
    if (!game) startGame(room);
    else game.setPlayers(room.players, room.host);
  }
}

function renderLobby(room, isHost) {
  const ul = $('lobby-players');
  ul.innerHTML = '';
  room.players.forEach((p, i) => {
    const li = document.createElement('li');
    if (p.uid === net.uid) li.classList.add('me');
    li.innerHTML = `<img alt="" src="${avatarURL(i)}"><div><p class="pname"></p><p class="plevel">NV ${p.level ?? 1}${p.uid === room.host ? ' <span class="host">★ HÔTE</span>' : ''}</p></div>`;
    li.querySelector('.pname').textContent = p.name;
    ul.appendChild(li);
  });
  for (let i = room.players.length; i < 5; i++) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.innerHTML = '<div class="slot"></div><p>— LIBRE —</p>';
    ul.appendChild(li);
  }
  $('lobby-count').textContent = room.players.length;
  $('btn-start').hidden = !isHost;
  $('lobby-wait').hidden = isHost;
}

/* ───────── Partie ───────── */

function startGame(room) {
  show('game');
  game = new Game({
    canvas: $('game-canvas'),
    view: $('game-view'),
    minimap: $('minimap'),
    partyEl: $('game-party'),
    dpad: $('dpad'),
    net,
    room,
  });
}

async function leave(message) {
  watching = false;
  game?.destroy();
  game = null;
  await net.leaveRoom();
  history.replaceState(null, '', isDemo && params.has('demo') ? '?demo' : location.pathname);
  if (message) toast(message);
  if (net.profile) showMenu(net.profile); else show('login');
}

/* ───────── Démarrage ───────── */

async function boot() {
  document.body.style.setProperty('--bricks', `url(${brickPatternURL()})`);
  $('title-party').innerHTML = [0, 1, 2, 3, 4].map((i) => `<img alt="" src="${avatarURL(i)}">`).join('');
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) document.body.classList.add('touch');

  if (isDemo) {
    $('demo-banner').hidden = false;
    net = (await import('./net-demo.js')).createDemoNet();
  } else {
    net = (await import('./net-firebase.js')).createFirebaseNet(firebaseConfig);
  }

  net.onAuth((profile, err) => {
    if (err) toast('Erreur de profil : vérifie les règles de la base');
    if (!profile) { if (!game) show('login'); return; }
    if (game || watching) return;
    if (pendingRoom) {
      const code = pendingRoom;
      pendingRoom = '';
      showMenu(profile);
      joinRoom(code);
    } else {
      showMenu(profile);
    }
  });

  $('btn-google').onclick = async (e) => {
    busy(e.currentTarget, true);
    try {
      await net.signIn();
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/unauthorized-domain') {
        toast('Domaine non autorisé : ajoute-le dans Firebase > Authentication > Paramètres');
      } else if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        toast('Connexion impossible');
      }
    } finally {
      busy(e.currentTarget, false);
    }
  };
  $('btn-logout').onclick = () => net.signOut();
  $('btn-create').onclick = (e) => createRoom(e.currentTarget);
  $('btn-join').onclick = (e) => joinRoom($('join-code').value, e.currentTarget);
  $('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(e.target.value, $('btn-join')); });
  $('join-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('btn-start').onclick = (e) => { busy(e.currentTarget, true); net.startGame().finally(() => busy(e.currentTarget, false)); };
  $('btn-leave').onclick = () => leave();
  $('btn-quit').onclick = () => leave();
  $('btn-copy').onclick = async () => {
    const url = `${location.origin}${location.pathname}?room=${net.roomCode}`;
    try { await navigator.clipboard.writeText(url); toast('Lien copié !'); } catch { toast(url); }
  };
}

boot();

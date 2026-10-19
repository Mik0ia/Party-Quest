import { World, T, isWater } from './world.js';
import { buildTiles, playerSprite, avatarURL, MINIMAP_COLORS } from './sprites.js';
import { NES, PLAYER_COLORS } from './palette.js';

const BASE_W = 256, BASE_H = 224, TS = 16; // résolution de référence NES, tuiles 16x16
const MOVE_MS = 160;                   // durée d'un pas d'une tuile
const DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
// e.code = position physique de la touche : WASD en QWERTY = ZQSD en AZERTY
const KEYS = {
  ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd',
  ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r',
};
const MINI = 64; // la minimap couvre 64x64 tuiles

export class Game {
  constructor({ canvas, view, minimap, partyEl, dpad, net, room }) {
    this.canvas = canvas;
    this.view = view;
    this.ctx = canvas.getContext('2d');
    this.minimap = minimap;
    this.miniCtx = minimap.getContext('2d');
    this.partyEl = partyEl;
    this.net = net;
    this.myUid = net.uid;
    this.world = new World(room.seed);
    this.tiles = buildTiles();
    this.ents = new Map();
    this.meta = new Map();
    this.held = [];
    this.lastMini = 0;
    this.scale = 1;

    this.setPlayers(room.players, room.host);

    // Apparition : chaque joueur a une place autour du point de départ commun
    const idx = Math.max(0, room.players.findIndex((p) => p.uid === this.myUid));
    const sp = this.world.spawnFor(idx);
    this.me = this.ensureEnt(this.myUid);
    this.place(this.me, sp.x, sp.y, 'd');
    this.net.sendPos(sp.x, sp.y, 'd');

    this.stopWatch = this.net.watchPositions((all) => this.onPositions(all));

    this.onKeyDown = (e) => {
      const d = KEYS[e.code];
      if (!d) return;
      e.preventDefault();
      if (!this.held.includes(d)) this.held.push(d);
    };
    this.onKeyUp = (e) => {
      const d = KEYS[e.code];
      if (d) this.held = this.held.filter((h) => h !== d);
    };
    this.onBlur = () => { this.held = []; };
    this.onResize = () => this.resize();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.onResize);
    this.bindDpad(dpad);
    this.resize();

    this.frame = (now) => {
      this.update(now);
      this.render(now);
      this.raf = requestAnimationFrame(this.frame);
    };
    this.raf = requestAnimationFrame(this.frame);
  }

  /* ───────── Joueurs ───────── */

  setPlayers(list, host) {
    this.host = host ?? this.host;
    this.meta.clear();
    list.forEach((p, i) => this.meta.set(p.uid, { ...p, color: i % PLAYER_COLORS.length }));
    this.renderParty();
  }

  ensureEnt(uid) {
    let e = this.ents.get(uid);
    if (!e) {
      e = { uid, x: 0, y: 0, tx: 0, ty: 0, fx: 0, fy: 0, t0: 0, dur: MOVE_MS, dir: 'd', moving: false, stopAt: 0, placed: false };
      this.ents.set(uid, e);
    }
    return e;
  }

  place(e, x, y, d) {
    Object.assign(e, { x, y, tx: x, ty: y, fx: x, fy: y, dir: d || e.dir, moving: false, placed: true });
  }

  onPositions(all) {
    const now = performance.now();
    for (const [uid, p] of Object.entries(all)) {
      if (uid === this.myUid) continue;
      const e = this.ensureEnt(uid);
      if (!e.placed) { this.place(e, p.x, p.y, p.d); continue; }
      e.dir = p.d;
      if (p.x !== e.tx || p.y !== e.ty) {
        const dist = Math.abs(p.x - e.x) + Math.abs(p.y - e.y);
        if (dist > 4) { this.place(e, p.x, p.y, p.d); continue; } // trop loin : téléportation
        Object.assign(e, { fx: e.x, fy: e.y, tx: p.x, ty: p.y, t0: now, dur: MOVE_MS * Math.max(1, dist) * 0.95, moving: true });
      }
    }
    for (const uid of [...this.ents.keys()]) {
      if (uid !== this.myUid && !(uid in all)) this.ents.delete(uid);
    }
  }

  /* ───────── Déplacement ───────── */

  tryStep(d, t0) {
    const m = this.me;
    const [dx, dy] = DIRS[d];
    const nx = m.tx + dx, ny = m.ty + dy;
    const turned = m.dir !== d;
    m.dir = d;
    if (this.world.walkable(nx, ny)) {
      Object.assign(m, { fx: m.tx, fy: m.ty, tx: nx, ty: ny, t0, moving: true });
      this.net.sendPos(nx, ny, d);
      return true;
    }
    if (turned) this.net.sendPos(m.tx, m.ty, d); // on se tourne face à l'eau
    return false;
  }

  update(now) {
    const m = this.me;
    const want = this.held[this.held.length - 1];
    if (m.moving && now - m.t0 >= MOVE_MS) {
      const end = m.t0 + MOVE_MS;
      m.x = m.tx; m.y = m.ty; m.moving = false; m.stopAt = now;
      // Enchaîner le pas suivant sans à-coup si une direction est toujours tenue
      if (want) this.tryStep(want, now - end < MOVE_MS ? end : now);
    } else if (!m.moving && want) {
      this.tryStep(want, now);
    }
    if (m.moving) {
      const p = Math.min(1, (now - m.t0) / MOVE_MS);
      m.x = m.fx + (m.tx - m.fx) * p;
      m.y = m.fy + (m.ty - m.fy) * p;
    }

    for (const e of this.ents.values()) {
      if (e === m || !e.moving) continue;
      const p = Math.min(1, (now - e.t0) / e.dur);
      e.x = e.fx + (e.tx - e.fx) * p;
      e.y = e.fy + (e.ty - e.fy) * p;
      if (p >= 1) { e.moving = false; e.stopAt = now; }
    }
  }

  /* ───────── Rendu ───────── */

  resize() {
    // Échelle entière (pixels nets), puis on élargit la vue pour remplir tout l'espace
    const r = this.view.getBoundingClientRect();
    const zoom = Math.max(r.width >= 280 ? 2 : 1, Math.floor(Math.min(r.width / BASE_W, r.height / BASE_H) + 0.35));
    this.vw = Math.ceil(r.width / zoom);
    this.vh = Math.ceil(r.height / zoom);
    this.canvas.style.width = `${this.vw * zoom}px`;
    this.canvas.style.height = `${this.vh * zoom}px`;
    this.scale = Math.max(1, Math.round(zoom * (window.devicePixelRatio || 1)));
    this.canvas.width = this.vw * this.scale;
    this.canvas.height = this.vh * this.scale;
  }

  render(now) {
    const g = this.ctx;
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    g.imageSmoothingEnabled = false;
    const m = this.me;
    const VW = this.vw, VH = this.vh;
    const cx = Math.round(m.x * TS + TS / 2 - VW / 2);
    const cy = Math.round(m.y * TS + TS / 2 - VH / 2);
    const wf = Math.floor(now / 450) & 1;

    // Terrain
    const x0 = Math.floor(cx / TS), y0 = Math.floor(cy / TS);
    for (let ty = y0; ty <= y0 + Math.ceil(VH / TS) + 1; ty++) {
      for (let tx = x0; tx <= x0 + Math.ceil(VW / TS) + 1; tx++) {
        const t = this.world.tile(tx, ty);
        const sx = tx * TS - cx, sy = ty * TS - cy;
        g.drawImage(this.tiles.get(t, wf), sx, sy);
        if (isWater(t)) this.drawShore(g, tx, ty, sx, sy, wf);
      }
    }

    // Personnages, triés de haut en bas pour la profondeur
    const ents = [...this.ents.values()].filter((e) => e.placed).sort((a, b) => a.y - b.y);
    g.font = '8px "Press Start 2P", monospace';
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    for (const e of ents) {
      const meta = this.meta.get(e.uid);
      const color = meta?.color ?? 0;
      const walking = e.moving || now - e.stopAt < 60;
      const frame = walking ? 1 + (Math.floor(now / MOVE_MS) & 1) : 0;
      const sx = Math.round(e.x * TS - cx), sy = Math.round(e.y * TS - cy);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(sx + 4, sy + 15, 8, 1);
      g.drawImage(playerSprite(color, e.dir, frame), sx, sy - 1);
      if (meta && e !== m) this.drawName(g, meta.name, sx + 8, sy - 2, PLAYER_COLORS[color].tunic);
    }

    if (now - this.lastMini > 200) { this.lastMini = now; this.renderMinimap(); }
  }

  drawShore(g, tx, ty, sx, sy, wf) {
    // Écume blanche le long des berges, qui ondule d'une frame à l'autre
    // Écume tramée (1 pixel sur 2) le long des berges, qui ondule d'une frame à l'autre
    const land = (x, y) => !isWater(this.world.tile(x, y));
    const edges = [
      [land(tx, ty - 1), (i) => [sx + i, sy], (i) => [sx + i, sy + 1]],
      [land(tx, ty + 1), (i) => [sx + i, sy + 15], (i) => [sx + i, sy + 14]],
      [land(tx - 1, ty), (i) => [sx, sy + i], (i) => [sx + 1, sy + i]],
      [land(tx + 1, ty), (i) => [sx + 15, sy + i], (i) => [sx + 14, sy + i]],
    ];
    for (const [isLand, outer, inner] of edges) {
      if (!isLand) continue;
      for (let i = 0; i < 16; i++) {
        g.fillStyle = (i + wf) & 1 ? NES.white : NES.sky;
        g.fillRect(...outer(i), 1, 1);
        if (((i + wf) & 3) === 0) { g.fillStyle = NES.white; g.fillRect(...inner(i), 1, 1); }
      }
    }
  }

  drawName(g, name, x, y, color) {
    g.fillStyle = NES.black;
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.fillText(name, x + ox, y + oy);
    g.fillStyle = color;
    g.fillText(name, x, y);
  }

  renderMinimap() {
    const g = this.miniCtx;
    const ox = this.me.tx - MINI / 2, oy = this.me.ty - MINI / 2;
    const img = g.createImageData(MINI, MINI);
    const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const cache = {};
    for (let y = 0; y < MINI; y++) {
      for (let x = 0; x < MINI; x++) {
        const t = this.world.tile(ox + x, oy + y);
        const c = cache[t] || (cache[t] = hex(MINIMAP_COLORS[t]));
        const i = (y * MINI + x) * 4;
        img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    for (const e of this.ents.values()) {
      const col = PLAYER_COLORS[this.meta.get(e.uid)?.color ?? 0].tunic;
      const px = e.tx - ox, py = e.ty - oy;
      if (px < 0 || py < 0 || px >= MINI || py >= MINI) continue;
      g.fillStyle = NES.black;
      g.fillRect(px - 2, py - 2, 5, 5);
      g.fillStyle = col;
      g.fillRect(px - 1, py - 1, 3, 3);
    }
  }

  renderParty() {
    if (!this.partyEl) return;
    this.partyEl.innerHTML = '';
    for (const p of this.meta.values()) {
      const li = document.createElement('li');
      if (p.uid === this.myUid) li.classList.add('me');
      li.innerHTML = `<img alt="" src="${avatarURL(p.color)}"><div><p class="pname"></p><p class="plevel">NV ${p.level ?? 1}${p.uid === this.host ? ' <span class="host">★ HÔTE</span>' : ''}</p></div>`;
      li.querySelector('.pname').textContent = p.name;
      this.partyEl.appendChild(li);
    }
  }

  bindDpad(dpad) {
    if (!dpad) return;
    this.dpadHandlers = [];
    dpad.querySelectorAll('[data-dir]').forEach((btn) => {
      const d = btn.dataset.dir;
      const down = (e) => { e.preventDefault(); if (!this.held.includes(d)) this.held.push(d); };
      const up = (e) => { e.preventDefault(); this.held = this.held.filter((h) => h !== d); };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('pointercancel', up);
      this.dpadHandlers.push([btn, down, up]);
    });
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.stopWatch?.();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);
    for (const [btn, down, up] of this.dpadHandlers || []) {
      btn.removeEventListener('pointerdown', down);
      btn.removeEventListener('pointerup', up);
      btn.removeEventListener('pointerleave', up);
      btn.removeEventListener('pointercancel', up);
    }
  }
}

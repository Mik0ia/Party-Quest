import { World, T, isWater, isCliff, isFace, cliffLevel } from './world.js';
import { buildTiles, playerSprite, avatarURL, MINIMAP_COLORS } from './sprites.js';
import { C, PLAYER_COLORS, playerTint } from './palette.js';

const TS = 16;                                // tuiles 16x16
const VIEW_W = 21 * TS, VIEW_H = 15 * TS;     // taille de vue visée : 21 x 15 tuiles
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
    // Vue d'environ 21 x 15 tuiles ; le canvas est rendu à une échelle entière ≥ au zoom
    // puis réduit légèrement par le navigateur, ce qui garde des pixels nets.
    const r = this.view.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    let zoom = Math.min(r.width / VIEW_W, r.height / VIEW_H);
    zoom = Math.max(zoom, r.width < 500 ? 1.5 : 1);
    this.vw = Math.ceil(r.width / zoom);
    this.vh = Math.ceil(r.height / zoom);
    this.scale = Math.max(1, Math.ceil(zoom * dpr - 0.01));
    this.canvas.width = this.vw * this.scale;
    this.canvas.height = this.vh * this.scale;
    this.canvas.style.width = `${this.vw * zoom}px`;
    this.canvas.style.height = `${this.vh * zoom}px`;
    this.canvas.style.imageRendering = Math.abs(this.scale - zoom * dpr) < 0.02 ? 'pixelated' : 'auto';
  }

  render(now) {
    const g = this.ctx;
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    g.imageSmoothingEnabled = false;
    const m = this.me;
    const VW = this.vw, VH = this.vh;
    const cx = Math.round(m.x * TS + TS / 2 - VW / 2);
    const cy = Math.round(m.y * TS - VH / 2);
    const wf = Math.floor(now / 260) & 3;
    const W = this.world;

    // 1. Sol
    const x0 = Math.floor(cx / TS), y0 = Math.floor(cy / TS);
    const x1 = x0 + Math.ceil(VW / TS) + 1, y1 = y0 + Math.ceil(VH / TS) + 2;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = W.tile(tx, ty);
        const sx = tx * TS - cx, sy = ty * TS - cy;
        if (isFace(t)) {
          // paroi : rebord seulement en haut d'une falaise, pied seulement en bas
          const top = !isFace(W.tile(tx, ty - 1)), bottom = !isFace(W.tile(tx, ty + 1));
          g.drawImage(this.tiles.face(cliffLevel(t), tx, top, bottom), sx, sy);
        } else g.drawImage(this.tiles.get(t, wf, tx, ty), sx, sy);
        if (isWater(t)) this.drawShore(g, tx, ty, sx, sy);
        else if (t === T.PATH) this.drawPathEdge(g, tx, ty, sx, sy);
        if (isCliff(t)) this.drawCliffEdges(g, t, tx, ty, sx, sy);
        else if (isFace(W.tile(tx, ty - 1))) this.drawCliffShadow(g, sx, sy);
      }
    }

    // 2. Sapins visibles (2x2 tuiles, un par colonne paire et par ligne de départ)
    const trees = [];
    for (let ay = y0 - 1; ay <= y1; ay++) {
      for (let ax = W.colOf(x0 - 1); ax <= x1; ax += 2) {
        if (W.treeAt(ax, ay)) trees.push({ ax, ay });
        const kind = W.tentAt(ax, ay);
        if (kind) trees.push({ ax, ay, tent: kind });
      }
    }
    // 3. Arbres et personnages triés par leur base : on passe derrière les feuillages
    const drawables = [];
    for (const tr of trees) drawables.push({ base: tr.ay + 1.5, tree: tr });
    for (const e of this.ents.values()) if (e.placed) drawables.push({ base: e.y + 0.5, ent: e });
    drawables.sort((a, b) => a.base - b.base);

    for (const d of drawables) {
      if (d.tree) {
        g.drawImage(d.tree.tent ? this.tiles.tent(d.tree.tent) : this.tiles.tree(), d.tree.ax * TS - cx, d.tree.ay * TS - cy);
        continue;
      }
      const e = d.ent;
      const color = this.meta.get(e.uid)?.color ?? 0;
      const walking = e.moving || now - e.stopAt < 60;
      const frame = walking ? 1 + (Math.floor(now / MOVE_MS) & 1) : 0;
      const sx = Math.round(e.x * TS - cx), sy = Math.round(e.y * TS - cy);
      g.fillStyle = 'rgba(30, 90, 70, 0.45)';
      g.fillRect(sx + 4, sy + 13, 8, 3);
      g.fillRect(sx + 3, sy + 14, 10, 1);
      g.drawImage(playerSprite(color, e.dir, frame), sx, sy - 16);
    }

    // 4. Noms au-dessus des têtes (toujours visibles, même derrière un arbre)
    g.font = '8px "Pixelify Sans", monospace';
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    for (const e of this.ents.values()) {
      if (!e.placed || e === m) continue;
      const meta = this.meta.get(e.uid);
      if (!meta) continue;
      const sx = Math.round(e.x * TS - cx), sy = Math.round(e.y * TS - cy);
      this.drawName(g, meta.name, sx + 8, sy - 7, playerTint(meta.color));
    }

    if (now - this.lastMini > 200) { this.lastMini = now; this.renderMinimap(); }
  }

  // Bords arrondis entre deux types de sol : pour chaque côté qui touche "l'extérieur",
  // une bande de couleurs ; les coins extérieurs sont arrondis avec la couleur voisine.
  edgeBand(g, sx, sy, sides, colors, cornerFill) {
    const [n, sdir, w, e] = sides;
    colors.forEach((col, i) => {
      g.fillStyle = col;
      if (n) g.fillRect(sx, sy + i, 16, 1);
      if (sdir) g.fillRect(sx, sy + 15 - i, 16, 1);
      if (w) g.fillRect(sx + i, sy, 1, 16);
      if (e) g.fillRect(sx + 15 - i, sy, 1, 16);
    });
    // Coins arrondis : quart de cercle de 3 px rempli avec le sol voisin
    const R = [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2], [1, 1]];
    const corner = (on, fx, fy) => {
      if (!on) return;
      g.fillStyle = cornerFill;
      for (const [x, y] of R) g.fillRect(sx + (fx ? 15 - x : x), sy + (fy ? 15 - y : y), 1, 1);
      g.fillStyle = colors[0];
      for (const [x, y] of [[3, 0], [2, 1], [1, 2], [0, 3]]) g.fillRect(sx + (fx ? 15 - x : x), sy + (fy ? 15 - y : y), 1, 1);
    };
    corner(n && w, false, false); corner(n && e, true, false);
    corner(sdir && w, false, true); corner(sdir && e, true, true);
  }

  // L'eau est en contrebas : talus de terre visible sur la berge nord (face à la caméra),
  // talus plus fin sur les côtés, simple rebord d'herbe au sud, ombre portée sur l'eau.
  drawShore(g, tx, ty, sx, sy) {
    const land = (x, y) => !isWater(this.world.tile(x, y));
    const n = land(tx, ty - 1), s = land(tx, ty + 1), w = land(tx - 1, ty), e = land(tx + 1, ty);
    const nw = land(tx - 1, ty - 1), ne = land(tx + 1, ty - 1);
    if (!(n || s || w || e || nw || ne)) return;
    const [dk, md, lt, hi] = C.bank;
    const shadow = C.water[1];
    const p = (x, y, col) => { g.fillStyle = col; g.fillRect(sx + x, sy + y, 1, 1); };
    const face = (x, y, h) => {
      // colonne de talus : stries verticales claires/sombres, base plus sombre
      for (let i = 0; i < h; i++) {
        const k = (x + tx * 16) & 3;
        p(x, y + i, i === 0 ? hi : i === h - 1 ? dk : k === 0 ? md : k === 2 ? hi : lt);
      }
    };
    const FACE = 6;

    if (n) {
      for (let x = 0; x < 16; x++) {
        p(x, 0, C.grass[1]);
        face(x, 1, FACE);
        p(x, FACE + 1, shadow);
        if ((x + tx) & 1) p(x, FACE + 2, shadow);
      }
    }
    const top = n ? FACE + 1 : 0;
    if (w) {
      for (let y = top; y < 16; y++) {
        p(0, y, C.grass[1]); p(1, y, md); p(2, y, dk); p(3, y, shadow);
      }
    }
    if (e) {
      for (let y = top; y < 16; y++) {
        p(15, y, C.grass[1]); p(14, y, lt); p(13, y, dk);
      }
    }
    if (s) {
      for (let x = 0; x < 16; x++) {
        p(x, 15, C.grass[1]); p(x, 14, dk); if ((x + tx) & 1) p(x, 13, C.water[3]);
      }
    }
    // Coins extérieurs : la berge nord continue en diagonale
    if (!n && !w && nw) for (let x = 0; x < 3; x++) { face(x, 0, FACE - x); p(x, FACE - x, shadow); }
    if (!n && !e && ne) for (let x = 13; x < 16; x++) { face(x, 0, FACE - (15 - x)); }
    // Coins intérieurs arrondis (herbe qui mord sur l'eau)
    if (n && w) { p(0, 1, C.grass[1]); p(1, 1, C.grass[1]); p(0, 2, C.grass[1]); }
    if (n && e) { p(15, 1, C.grass[1]); p(14, 1, C.grass[1]); p(15, 2, C.grass[1]); }
    if (s && w) { p(0, 14, C.grass[1]); p(1, 14, C.grass[1]); p(0, 13, C.grass[1]); }
    if (s && e) { p(15, 14, C.grass[1]); p(14, 14, C.grass[1]); p(15, 13, C.grass[1]); }
  }

  // Rebords des formations rocheuses (style GBA) : pierres arrondies sur les côtés et en haut
  // de chaque plateau, quelques rochers posés dessus.
  drawCliffEdges(g, t, tx, ty, sx, sy) {
    const W = this.world;
    const lvl = cliffLevel(t);
    const face = isFace(t);
    const h = (x, y) => cliffLevel(W.tile(x, y));
    const p = (x, y, w, hh, col) => { g.fillStyle = col; g.fillRect(sx + x, sy + y, w, hh); };
    const ramp = C.cliffFace[lvl - 1];
    const lowW = h(tx - 1, ty) < lvl, lowE = h(tx + 1, ty) < lvl;

    if (face) {
      // Bords de paroi : arête bien dessinée et coin assombri (dégradé vers le contour)
      if (lowW) { p(0, 0, 1, 16, C.outline); p(1, 0, 1, 16, ramp[0]); p(2, 0, 1, 16, ramp[1]); }
      if (lowE) { p(15, 0, 1, 16, C.outline); p(14, 0, 1, 16, ramp[0]); p(13, 0, 1, 16, ramp[1]); }
      // Coin : paroi qui continue sous un voisin plus bas → joint sombre en diagonale
      const topEdge = !isFace(W.tile(tx, ty - 1));
      if (topEdge && lowW) { p(0, 0, 3, 3, C.outline); p(3, 1, 1, 2, ramp[0]); }
      if (topEdge && lowE) { p(13, 0, 3, 3, C.outline); p(12, 1, 1, 2, ramp[0]); }
      return;
    }

    const lowN = h(tx, ty - 1) < lvl;
    if (lowN) g.drawImage(this.tiles.cliffRim(lvl), sx, sy);
    if (lowW) g.drawImage(this.tiles.cliffSide(lvl, false), sx, sy);
    if (lowE) g.drawImage(this.tiles.cliffSide(lvl, true), sx + 11, sy);
    // Coins du plateau assombris pour bien marquer l'angle
    if (lowN && lowW) { p(0, 0, 4, 2, C.outline); p(0, 0, 2, 5, C.outline); p(2, 2, 2, 2, ramp[0]); }
    if (lowN && lowE) { p(12, 0, 4, 2, C.outline); p(14, 0, 2, 5, C.outline); p(12, 2, 2, 2, ramp[0]); }
    // Angle rentrant : un voisin en diagonale plus bas alors que les côtés sont au même niveau
    if (!lowN && !lowW && h(tx - 1, ty - 1) < lvl) { p(0, 0, 3, 3, ramp[0]); p(0, 0, 2, 2, C.outline); }
    if (!lowN && !lowE && h(tx + 1, ty - 1) < lvl) { p(13, 0, 3, 3, ramp[0]); p(14, 0, 2, 2, C.outline); }
    // Pied d'une paroi située juste en dessous : la tuile de plateau du dessus garde son bord
    if (!lowN && !lowW && !lowE && ((tx * 73856093) ^ (ty * 19349663)) % 13 === 0) {
      g.drawImage(this.tiles.boulder(lvl), sx, sy);
    }
  }

  // Ombre portée au pied d'une falaise
  drawCliffShadow(g, sx, sy) {
    g.fillStyle = 'rgba(10, 20, 10, 0.32)';
    g.fillRect(sx, sy, 16, 2);
    g.fillStyle = 'rgba(10, 20, 10, 0.18)';
    for (let x = 0; x < 16; x += 2) g.fillRect(sx + x, sy + 2, 1, 1);
  }

  drawPathEdge(g, tx, ty, sx, sy) {
    const other = (x, y) => {
      const t = this.world.tile(x, y);
      return t !== T.PATH && !isWater(t);
    };
    const sides = [other(tx, ty - 1), other(tx, ty + 1), other(tx - 1, ty), other(tx + 1, ty)];
    if (!sides.some(Boolean)) return;
    this.edgeBand(g, sx, sy, sides, [C.pathEdge[0], C.pathEdge[1]], C.grass[2]);
  }

  drawName(g, name, x, y, color) {
    g.fillStyle = C.outline;
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) g.fillText(name, x + ox, y + oy);
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
      const px = e.tx - ox, py = e.ty - oy;
      if (px < 0 || py < 0 || px >= MINI || py >= MINI) continue;
      g.fillStyle = C.white;
      g.fillRect(px - 2, py - 2, 5, 5);
      g.fillStyle = playerTint(this.meta.get(e.uid)?.color ?? 0);
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

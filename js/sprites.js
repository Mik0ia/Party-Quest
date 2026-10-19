import { C, PLAYER_COLORS } from './palette.js';
import { T } from './world.js';

// Tileset original façon GBA, entièrement généré en code :
// tuiles 16x16, sapins 32x32, personnages 16x32 (hitbox d'une case, visuel sur deux).
// Volumes ombrés avec une lumière venant d'en haut à gauche, trame de Bayer, contours colorés.

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function px(g, x, y, col) {
  g.fillStyle = col;
  g.fillRect(x, y, 1, 1);
}

const BAYER = [[0, 2], [3, 1]];
const dither = (x, y) => (BAYER[y & 1][x & 1] - 1.5) / 4; // [-0.375, 0.375]
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* Masque générique : grille d'indices de teinte (-1 = vide),
   dessinée ensuite avec une rampe et un contour automatique. */
function makeMask(w, h) {
  return { w, h, v: new Int8Array(w * h).fill(-1) };
}
function drawMask(g, m, ramp, outline, ox = 0, oy = 0) {
  const { w, h, v } = m;
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? v[y * w + x] : -1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = v[y * w + x];
      if (s >= 0) { px(g, ox + x, oy + y, ramp[s]); continue; }
      if (outline && (at(x - 1, y) >= 0 || at(x + 1, y) >= 0 || at(x, y - 1) >= 0 || at(x, y + 1) >= 0)) {
        px(g, ox + x, oy + y, outline);
      }
    }
  }
}

// Sphère/ellipse ombrée (buissons, rochers)
function blob(m, cx, cy, rx, ry, levels, bias = 0) {
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      const l = -0.5 * dx - 0.65 * dy + 0.6 * nz + bias;
      m.v[y * m.w + x] = clamp(Math.floor((l * 0.85 + 0.25) * levels + dither(x, y)), 0, levels - 1);
    }
  }
}

/* ───────────────────────── PERSONNAGES (16x32) ─────────────────────────
   Héros original : cheveux bruns en épis, bandeau et veste aux couleurs du joueur,
   t-shirt blanc, pantalon sombre. Lettres :
   O contour · 1-4 dégradé joueur · a b c d cheveux · S s h peau · E yeux
   W w t-shirt · P p q pantalon · B k chaussures */

const half = (rows) => rows.map((r) => r + [...r].reverse().join(''));

const FRONT_HEAD = half([
  '.....O.O', '....OcOd', '...Ocdcd', '..Obccdc', '..O44444', '.Ob33333',
  '.ObaS3SS', '.OaSSSSS', '.OaSESSS', '.OaSEhSS', '..OsSSSS', '...OOsss',
]);
const BACK_HEAD = half([
  '.....O.O', '....OcOd', '...Ocdcd', '..Obccdc', '..O44444', '.Ob33333',
  '.Obbcccc', '.Oabbccc', '.Oaabbcc', '.Oaaabbb', '..Oaaabb', '...OOsss',
]);
const FRONT_BODY = half([
  '...OO3Ww', '..O432WW', '.O3O32WW', '.O3O22Ww', '.OSO2222', '..OOPPPP',
]);
const BACK_BODY = half([
  '...OO333', '..O43333', '.O3O3333', '.O3O3222', '.OSO2222', '..OOPPPP',
]);
const FRONT_LEGS = half(['...OqPPp', '...OPPpO', '...OBBkO', '...OOOOO']);

const SIDE_HEAD = [
  '......O.O.......',
  '.....OcOdO......',
  '....OcdcdcO.....',
  '...ObccdcdcO....',
  '..O4444444cO....',
  '..O33333334bO...',
  '.OS3SSSSbb43bO..',
  '.OSSSSSSabbbbO..',
  'OSESSSSSaabbaO..',
  '.OEhSSSsSaaaO...',
  '..OsSSSsOaaO....',
  '...OOssOOOO.....',
];
const SIDE_BODY = [
  '....O3WW33O.....',
  '....O4O3332O....',
  '....O3O3322O....',
  '....O3O2222O....',
  '....OSO2222O....',
  '....OOPPPPPO....',
];
const SIDE_LEGS = [
  ['.....OPPPpO.....', '.....OPPPpO.....', '....OBBBkkO.....', '....OOOOOOO.....'],
  ['....OPPOOPpO....', '...OPPO.OPpO....', '..OBBkO..OBkO...', '..OOOOO..OOOO...'],
];

// Pas de marche vu de face/dos : une jambe remonte d'un pixel
function stepLegs(legs, side) {
  const rows = legs.map((r) => r.split(''));
  const [a, b] = side === 'L' ? [0, 8] : [8, 16];
  for (let y = 0; y < rows.length; y++) {
    for (let x = a; x < b; x++) rows[y][x] = y + 1 < legs.length ? legs[y + 1][x] : '.';
  }
  return rows.map((r) => r.join(''));
}

const EMPTY = '................';

function charRows(dir, frame) {
  let head, body, legs;
  if (dir === 'l' || dir === 'r') {
    head = SIDE_HEAD; body = SIDE_BODY; legs = SIDE_LEGS[frame === 1 ? 1 : 0];
  } else {
    head = dir === 'u' ? BACK_HEAD : FRONT_HEAD;
    body = dir === 'u' ? BACK_BODY : FRONT_BODY;
    legs = frame === 1 ? stepLegs(FRONT_LEGS, 'L') : frame === 2 ? stepLegs(FRONT_LEGS, 'R') : FRONT_LEGS;
  }
  const bob = frame ? 1 : 0; // le haut du corps descend d'un pixel pendant les pas
  const upper = [...head, ...body];
  const rows = Array(32).fill(EMPTY);
  const legTop = 31 - legs.length;
  legs.forEach((r, i) => { rows[legTop + i] = r; });
  upper.forEach((r, i) => { rows[legTop - upper.length + bob + i] = r; });
  return rows;
}

const spriteCache = new Map();

// dir: 'u' | 'd' | 'l' | 'r'   frame: 0 repos, 1 et 2 marche
export function playerSprite(colorIdx, dir, frame) {
  const key = `${colorIdx}|${dir}|${frame}`;
  let c = spriteCache.get(key);
  if (c) return c;
  const ramp = PLAYER_COLORS[colorIdx % PLAYER_COLORS.length].ramp;
  const map = {
    O: C.outline, 1: ramp[0], 2: ramp[1], 3: ramp[2], 4: ramp[3],
    a: C.hair[0], b: C.hair[1], c: C.hair[2], d: C.hair[3],
    S: C.skin[1], s: C.skin[0], h: C.skin[2], E: C.eye,
    W: C.shirt[1], w: C.shirt[0],
    P: C.pants[1], p: C.pants[0], q: C.pants[2], B: C.shoes[1], k: C.shoes[0],
  };
  const rows = charRows(dir, frame);
  const mirror = dir === 'r';
  c = canvas(16, 32);
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < 16; x++) {
      const col = map[row[mirror ? 15 - x : x]];
      if (col) px(g, x, y, col);
    }
  });
  spriteCache.set(key, c);
  return c;
}

export function avatarURL(colorIdx, scale = 3) {
  const src = playerSprite(colorIdx, 'd', 0);
  const c = canvas(16 * scale, 24 * scale);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 8, 16, 24, 0, 0, 16 * scale, 24 * scale);
  return c.toDataURL();
}

/* ───────────────────────── TUILES DE SOL (16x16) ───────────────────────── */

function tile(fn) {
  const c = canvas(16, 16);
  fn(c.getContext('2d'));
  return c;
}

// Touffe d'herbe claire avec un pied plus sombre
function tuft(g, x, y) {
  const [, dark, , light, pale] = C.grass;
  px(g, x, y, light); px(g, x + 2, y, light);
  px(g, x + 1, y + 1, pale); px(g, x, y + 1, dark); px(g, x + 2, y + 1, dark);
  px(g, x + 4, y + 1, light); px(g, x + 4, y + 2, dark); px(g, x + 3, y + 2, dark);
}

function grass(variant) {
  return tile((g) => {
    g.fillStyle = C.grass[2];
    g.fillRect(0, 0, 16, 16);
    const spots = [[[2, 3], [9, 10]], [[9, 2], [2, 11]], [[5, 6]]][variant];
    for (const [x, y] of spots) tuft(g, x, y);
  });
}

function path() {
  return tile((g) => {
    g.fillStyle = C.path[2];
    g.fillRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if ((x * 7 + y * 11) % 23 === 0) px(g, x, y, C.path[0]);
      else if ((x * 5 + y * 3) % 17 === 0) px(g, x, y, C.path[1]);
      else if ((x * 3 + y * 13) % 19 === 0) px(g, x, y, C.path[3]);
    }
  });
}

// Eau claire : reflets ondulés sur 4 frames
function water(deep, frame) {
  return tile((g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const w = Math.round(1.5 * Math.sin(((x + frame * 4) / 16) * Math.PI * 2));
      const k = (((y + w) % 8) + 8) % 8;
      let col = deep ? C.deep[1] : C.water[2];
      if (k === 0) col = deep ? C.deep[2] : C.water[3];
      else if (k === 4) col = deep ? C.deep[0] : C.water[1];
      else if (!deep && k === 1 && ((x + frame * 3) % 6) === 0) col = C.water[4];
      px(g, x, y, col);
    }
  });
}

// Fleurs : deux corolles avec feuilles
function flowers(colors) {
  const c = grass(2);
  const g = c.getContext('2d');
  const [dk, md, lt] = colors;
  for (const [x, y] of [[4, 4], [11, 10]]) {
    px(g, x - 2, y + 3, C.tall[2]); px(g, x - 1, y + 3, C.tall[3]); px(g, x + 1, y + 3, C.tall[2]); px(g, x + 2, y + 3, C.tall[1]);
    px(g, x - 2, y + 4, C.tall[1]); px(g, x + 2, y + 4, C.tall[1]);
    const petals = [[-1, -1, lt], [0, -1, lt], [1, -1, md], [-1, 0, lt], [1, 0, md], [-1, 1, md], [0, 1, md], [1, 1, dk],
      [-2, 0, md], [2, 0, dk], [0, -2, lt], [0, 2, dk]];
    for (const [dx, dy, col] of petals) px(g, x + dx, y + dy, col);
    px(g, x, y, C.flowerHeart);
  }
  return c;
}

// Feuilles en éventail : chaque feuille est un fuseau ombré
function leaves(m, list, levels) {
  for (const [bx, by, ang, len, wid] of list) {
    const ux = Math.cos(ang), uy = Math.sin(ang);
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const rx = x + 0.5 - bx, ry = y + 0.5 - by;
        const u = rx * ux + ry * uy, v = -rx * uy + ry * ux;
        if (u < 0 || u > len) continue;
        const t = u / len;
        const hw = wid * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.8);
        if (Math.abs(v) > hw) continue;
        const l = 0.35 + t * 0.5 + (v < 0 ? 0.2 : -0.15) + dither(x, y);
        m.v[y * m.w + x] = clamp(Math.floor(l * levels), 0, levels - 1);
      }
    }
  }
}

function tallGrass() {
  const c = grass(1);
  const g = c.getContext('2d');
  g.fillStyle = C.grass[0];
  g.fillRect(3, 14, 10, 1);
  const m = makeMask(16, 16);
  const P = Math.PI;
  leaves(m, [
    [8, 14, -P * 0.92, 7, 2.2], [8, 14, -P * 0.08, 7, 2.2],
    [8, 14, -P * 0.72, 9, 2.4], [8, 14, -P * 0.28, 9, 2.4],
    [8, 14, -P * 0.5, 10, 2.6],
  ], 4);
  drawMask(g, m, C.tall.slice(1), C.tall[0]);
  return c;
}

function bush() {
  const c = grass(0);
  const g = c.getContext('2d');
  g.fillStyle = C.grass[0];
  g.fillRect(2, 13, 12, 2);
  const m = makeMask(16, 15);
  blob(m, 8, 9, 6.5, 5.5, 4);
  const top = makeMask(16, 15);
  blob(top, 5.5, 6.5, 3.8, 3.4, 4, 0.15); blob(top, 10.5, 6.5, 3.8, 3.4, 4, 0.05); blob(top, 8, 4.5, 3.4, 3, 4, 0.2);
  for (let i = 0; i < m.v.length; i++) if (top.v[i] >= 0) m.v[i] = top.v[i];
  drawMask(g, m, C.tall.slice(1), C.tall[0]);
  return c;
}

function rock() {
  const c = grass(2);
  const g = c.getContext('2d');
  g.fillStyle = C.grass[0];
  g.fillRect(2, 13, 12, 2);
  const m = makeMask(16, 15);
  blob(m, 8, 9, 6.2, 5.2, 4);
  drawMask(g, m, C.rock.slice(1), C.rock[0]);
  px(g, 9, 8, C.rock[1]); px(g, 10, 9, C.rock[1]); px(g, 10, 10, C.rock[2]);
  px(g, 5, 6, C.rock[4]); px(g, 6, 6, C.rock[4]);
  return c;
}

/* ───────────────────────── SAPIN (32x32 = 2x2 tuiles) ─────────────────────────
   Cône à trois étages arrondis, éclairé en haut à gauche, contour vert sombre. */

function pineTree() {
  const c = canvas(32, 32);
  const g = c.getContext('2d');
  // Ombre au sol
  g.fillStyle = C.grass[0];
  for (let y = 27; y <= 31; y++) {
    const hw = Math.round(12 * Math.sqrt(Math.max(0, 1 - ((y - 29) / 3) ** 2)));
    g.fillRect(16 - hw, y, hw * 2, 1);
  }
  // Tronc
  for (let y = 25; y <= 29; y++) {
    px(g, 13, y, C.outline);
    for (let x = 14; x <= 17; x++) px(g, x, y, x === 14 ? C.bark[2] : x === 17 ? C.bark[0] : C.bark[1]);
    px(g, 18, y, C.outline);
  }
  for (let x = 13; x <= 18; x++) px(g, x, 30, C.outline);

  const m = makeMask(32, 28);
  const tiers = [[1, 11, 6.5], [6, 19, 10.5], [12, 26, 14]]; // haut, bas, demi-largeur
  for (const [top, bot, hw] of tiers) {
    for (let y = top; y <= bot; y++) {
      const t = (y - top) / (bot - top);
      // profil arrondi : s'élargit vite puis se referme en bas de l'étage
      const w = hw * Math.sin(Math.min(1, t * 1.25) * Math.PI / 2) * (t > 0.85 ? 1 - (t - 0.85) * 1.4 : 1);
      for (let x = 0; x < 32; x++) {
        const dx = (x + 0.5 - 16) / Math.max(1, w);
        if (Math.abs(dx) > 1) continue;
        let l = 0.72 - 0.36 * dx - 0.38 * t + (t < 0.3 ? 0.12 : 0) + dither(x, y) * 0.45;
        if (t > 0.86) l -= 0.3; // ombre sous l'étage
        m.v[y * 32 + x] = clamp(Math.floor(l * 5), 0, 4);
      }
    }
  }
  drawMask(g, m, C.pine.slice(1), C.pine[0]);
  return c;
}

/* ───────────────────────── API ───────────────────────── */

export function buildTiles() {
  const frames = [0, 1, 2, 3].map((f) => ({ [T.DEEP]: water(true, f), [T.WATER]: water(false, f) }));
  const g0 = grass(0), g1 = grass(1);
  const fixed = {
    [T.PATH]: path(),
    [T.GRASS]: g0,
    [T.GRASS2]: g1,
    [T.FLOWERS]: flowers(C.flowerRed),
    [T.TALL]: tallGrass(),
    [T.BUSH]: bush(),
    [T.ROCK]: rock(),
    [T.TREE_TOP]: g0,
    [T.TREE_BOT]: g1,
  };
  const orange = flowers(C.flowerOrange);
  const pine = pineTree();
  return {
    get(type, frame, x = 0, y = 0) {
      if (type === T.FLOWERS && ((x * 7 + y * 3) & 3) === 0) return orange;
      return fixed[type] || frames[frame & 3][type];
    },
    tree() { return pine; },
  };
}

// Couleurs de la minimap
export const MINIMAP_COLORS = {
  [T.DEEP]: C.deep[1], [T.WATER]: C.water[2], [T.PATH]: C.path[2],
  [T.GRASS]: C.grass[2], [T.GRASS2]: C.grass[2], [T.FLOWERS]: C.flowerRed[1],
  [T.TALL]: C.tall[2], [T.BUSH]: C.tall[1], [T.ROCK]: C.rock[2],
  [T.TREE_TOP]: C.pine[3], [T.TREE_BOT]: C.pine[2],
};

// Fond de page : la tuile d'herbe en motif
export function backgroundPatternURL() {
  return grass(0).toDataURL();
}

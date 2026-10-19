import { C, PLAYER_COLORS } from './palette.js';
import { T, TREE_ROUND, TREE_PINE } from './world.js';

// Pixel art 16-bit généré en code : tuiles 16x16, arbres 32x32, personnages 16x32.
// Les volumes (buissons, feuillages) sont ombrés à partir d'une lumière venant d'en haut à gauche,
// quantifiés sur une palette courte avec une trame de Bayer, puis détourés : le rendu typique GBA.

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
const LIGHT = (() => { const l = [-0.55, -0.7, 0.45]; const n = Math.hypot(...l); return l.map((v) => v / n); })();

/* Volumes ombrés : union de disques, chaque pixel prend la teinte de la sphère qui le recouvre.
   ramp = [contour sombre, ..., reflet] ; renvoie une grille d'indices (-1 = vide). */
function shadeBlobs(w, h, blobs, levels) {
  const owner = new Int8Array(w * h).fill(-1);
  const shade = new Int8Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let i = blobs.length - 1; i >= 0; i--) {
        const [cx, cy, r] = blobs[i];
        const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        const nz = Math.sqrt(1 - d2);
        let l = dx * LIGHT[0] + dy * LIGHT[1] + nz * LIGHT[2];
        l = Math.max(0, Math.min(0.999, l * 0.9 + 0.12));
        const v = l * levels + (BAYER[y & 1][x & 1] - 1.5) * 0.28;
        owner[y * w + x] = i;
        shade[y * w + x] = Math.max(0, Math.min(levels - 1, Math.floor(v)));
        break;
      }
    }
  }
  // Ombre portée d'une touffe sur celle de derrière (donne le relief des feuillages)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = owner[y * w + x];
      if (o < 0) continue;
      const below = y + 1 < h ? owner[(y + 1) * w + x] : -1;
      const right = x + 1 < w ? owner[y * w + x + 1] : -1;
      if ((below > o) || (right > o && (x + y) & 1)) shade[y * w + x] = 0;
    }
  }
  return { owner, shade };
}

function drawShaded(g, ox, oy, w, h, res, ramp, outline) {
  const { owner, shade } = res;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (owner[i] >= 0) { px(g, ox + x, oy + y, ramp[shade[i] + 1]); continue; }
      // Contour : pixel vide qui touche le volume
      const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && owner[yy * w + xx] >= 0;
      if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) px(g, ox + x, oy + y, outline);
    }
  }
}

/* ───────────────────────── PERSONNAGES (16x32) ─────────────────────────
   Lettres : O contour · 1-4 dégradé du joueur (sombre → clair) · S/s/h peau
   E yeux · W blanc · P/p pantalon · B/b bottes · L ceinture (cuir).
   Les vues de face et de dos sont décrites sur une demi-largeur puis symétrisées. */

const half = (rows) => rows.map((r) => r + [...r].reverse().join(''));

const HEAD_DOWN = half([
  '......OO', '....OO34', '...O3444', '..O34444', '.O234444', '.O233333',
  'O2233O33', 'O2O3S3SS', 'O2OSSSSS', 'O1OSWESS', 'O1OSWESS', '.OOhSSSS',
  '..OsSSSS', '...OOsss',
]);
const HEAD_UP = half([
  '......OO', '....OO34', '...O3444', '..O34444', '.O234444', '.O233333',
  'O2233333', 'O2223333', 'O1222333', 'O1122233', 'O1112222', '.O111122',
  '..OO1111', '...OOsss',
]);
const BODY_DOWN = half([
  '..OO44OS', '.O3O4433', '.O3O3343', '.O2O3333', '.OSO2333', '..OOLLLL',
]);
const BODY_UP = half([
  '..OO33OS', '.O3O3333', '.O3O3333', '.O2O2333', '.OSO2223', '..OOLLLL',
]);
const LEGS_FRONT = half([
  '...OPPPP', '...OPPpO', '...OPPpO', '...OBBbO', '...OBBbO', '...OOOOO',
]);

const HEAD_SIDE = [
  '......OOOO......',
  '....OO3444OO....',
  '...O34444443O...',
  '..O3344444443O..',
  '..O33344444333O.',
  '.O333333333332O.',
  '.O3O3S33333322O.',
  '.OSSSSO3332221O.',
  '.OSWESSO322221O.',
  'OhSWESSSO22211O.',
  '.OSSSSSSO1111O..',
  '..OhSSSSO111O...',
  '...OOsSSsOOO....',
  '.....OOssO......',
];
const BODY_SIDE = [
  '....O443333O....',
  '....O43O3333O...',
  '....O33O3332O...',
  '....O33O3322O...',
  '....OSSO3222O...',
  '....OOOLLLLLO...',
];
const LEGS_SIDE = [
  ['.....OPPPPO.....', '.....OPPPpO.....', '.....OPPPpO.....', '.....OBBBbO.....', '....OBBBBbO.....', '....OOOOOOO.....'],
  ['....OPPPPPO.....', '...OPPOOpPPO....', '..OPPO..OpPO....', '..OBbO...OBbO...', '.OBBbO...OBbO...', '.OOOOO...OOOO...'],
];

const PAD = '................';

function liftHalf(rows, side) {
  // Décale une jambe d'un pixel vers le haut (pas de marche)
  const out = rows.map((r) => r.split(''));
  const xs = side === 'L' ? [0, 8] : [8, 16];
  for (let y = 0; y < rows.length; y++) {
    for (let x = xs[0]; x < xs[1]; x++) out[y][x] = y + 1 < rows.length ? rows[y + 1][x] : '.';
  }
  return out.map((r) => r.join(''));
}

function charRows(dir, frame) {
  if (dir === 'l' || dir === 'r') {
    const legs = LEGS_SIDE[frame === 1 ? 1 : 0];
    const bob = frame === 1 ? 1 : 0;
    return [...Array(6 + bob).fill(PAD), ...HEAD_SIDE, ...BODY_SIDE, ...legs].slice(0, 32);
  }
  const head = dir === 'u' ? HEAD_UP : HEAD_DOWN;
  const body = dir === 'u' ? BODY_UP : BODY_DOWN;
  let legs = LEGS_FRONT;
  if (frame === 1) legs = liftHalf(LEGS_FRONT, 'L');
  if (frame === 2) legs = liftHalf(LEGS_FRONT, 'R');
  const bob = frame ? 1 : 0;
  return [...Array(6 + bob).fill(PAD), ...head, ...body, ...legs].slice(0, 32);
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
    S: C.skin[1], s: C.skin[0], h: C.skin[2], E: C.eye, W: C.white,
    P: C.pants[1], p: C.pants[0], B: C.boots[1], b: C.boots[0], L: C.bark[1],
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
  g.drawImage(src, 0, 6, 16, 24, 0, 0, 16 * scale, 24 * scale);
  return c.toDataURL();
}

/* ───────────────────────── TUILES DE SOL (16x16) ───────────────────────── */

function tile(fn) {
  const c = canvas(16, 16);
  fn(c.getContext('2d'));
  return c;
}

// Petite touffe d'herbe en "v", comme dans les RPG 16-bit
function tuft(g, x, y, light = true) {
  const [dark, , , hi] = C.grass;
  px(g, x, y + 1, dark); px(g, x + 1, y + 2, dark); px(g, x + 3, y + 1, dark); px(g, x + 2, y + 2, dark);
  if (light) { px(g, x, y, hi); px(g, x + 3, y, hi); }
}

function grass(variant) {
  return tile((g) => {
    g.fillStyle = C.grass[2];
    g.fillRect(0, 0, 16, 16);
    // Légère trame de teinte pour éviter l'aplat
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (((x * 5 + y * 3 + variant * 7) % 17) === 0) px(g, x, y, C.grass[1]);
      else if (((x * 3 + y * 7 + variant * 5) % 23) === 0) px(g, x, y, C.grass[3]);
    }
    const tufts = variant === 0 ? [[2, 3], [9, 9]] : variant === 1 ? [[10, 2], [3, 11]] : [[6, 6]];
    for (const [x, y] of tufts) tuft(g, x, y);
  });
}

function flowers() {
  const c = grass(2);
  const g = c.getContext('2d');
  const [dark, mid, light, heart] = C.flower;
  for (const [x, y] of [[4, 3], [10, 9]]) {
    // feuilles
    px(g, x - 2, y + 3, C.leaf[2]); px(g, x - 1, y + 4, C.leaf[2]); px(g, x + 2, y + 3, C.leaf[2]); px(g, x + 1, y + 4, C.leaf[1]);
    // pétales
    for (const [dx, dy, col] of [[0, -1, light], [-1, 0, mid], [1, 0, mid], [0, 1, dark], [-1, -1, light], [1, 1, dark], [-1, 1, dark], [1, -1, mid]]) px(g, x + dx, y + dy, col);
    px(g, x, y, heart);
    px(g, x, y + 2, C.outline);
  }
  return c;
}

function sand() {
  return tile((g) => {
    g.fillStyle = C.sand[2];
    g.fillRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if ((x * 7 + y * 11) % 19 === 0) px(g, x, y, C.sand[0]);
      else if ((x * 5 + y * 3) % 13 === 0) px(g, x, y, C.sand[1]);
      else if ((x * 3 + y * 13) % 17 === 0) px(g, x, y, C.sand[3]);
    }
  });
}

// Eau : lignes de vagues sinusoïdales qui bouclent sur 16 px et défilent sur 4 frames
function water(deep, frame) {
  const pal = deep ? C.deep : C.water;
  return tile((g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const w = Math.round(1.6 * Math.sin(((x + frame * 4) / 16) * Math.PI * 2));
      const k = (((y + w) % 8) + 8) % 8;
      let col = deep ? pal[0] : pal[1];
      if (k === 0) col = deep ? pal[2] : pal[3];
      else if (k === 1) col = deep ? pal[1] : pal[2];
      else if (!deep && k === 5 && ((x + frame) & 3) === 0) col = pal[4];
      px(g, x, y, col);
    }
  });
}

function bush() {
  const c = grass(1);
  const g = c.getContext('2d');
  // ombre au sol
  g.fillStyle = C.grass[0];
  g.fillRect(2, 13, 12, 2);
  const res = shadeBlobs(14, 14, [[7, 8, 6.3], [5, 6, 4.2], [9.5, 6.2, 4]], 4);
  drawShaded(g, 1, 0, 14, 14, res, C.bush, C.outline);
  return c;
}

/* ───────────────────────── ARBRES (32x32, 2x2 tuiles) ───────────────────────── */

function trunk(g, top, bottom) {
  const [d, m, l, hi] = C.bark;
  for (let y = top; y <= bottom; y++) {
    const w = y > bottom - 3 ? 1 : 0; // racines qui s'évasent
    for (let x = 12 - w; x <= 19 + w; x++) {
      let col = x <= 13 - w ? l : x >= 18 + w ? d : m;
      if (x === 14 && y % 3 === 0) col = hi;
      if (x === 17 && y % 4 === 1) col = d;
      px(g, x, y, col);
    }
    px(g, 11 - w, y, C.outline); px(g, 20 + w, y, C.outline);
  }
  for (let x = 11; x <= 20; x++) px(g, x, bottom + 1, C.outline);
}

function roundTree() {
  const c = canvas(32, 32);
  const g = c.getContext('2d');
  trunk(g, 20, 29);
  const blobs = [
    [16, 14, 9.5], [9, 13, 6.5], [23, 13, 6.5], [16, 8, 8], [10, 8.5, 5], [22, 8.5, 5], [16, 5, 4.8],
  ];
  const res = shadeBlobs(32, 26, blobs, 5);
  drawShaded(g, 0, 0, 32, 26, res, ['', ...C.leaf], C.outline);
  return c;
}

function pineTree() {
  const c = canvas(32, 32);
  const g = c.getContext('2d');
  trunk(g, 23, 29);
  // Étages triangulaires, ombrés gauche → droite, avec bord inférieur festonné
  const tiers = [[2, 10, 6], [7, 17, 10], [13, 25, 14]]; // [haut, bas, demi-largeur max]
  const ramp = C.pine;
  const filled = new Set();
  tiers.forEach(([top, bot, hw]) => {
    for (let y = top; y <= bot; y++) {
      const t = (y - top) / (bot - top);
      const half = Math.max(1, Math.round(hw * t + 0.5));
      for (let x = 16 - half; x < 16 + half; x++) {
        const rel = (x - (16 - half)) / (2 * half);       // 0 = gauche (éclairé) → 1 = droite
        let v = 4 - rel * 3.6 - t * 0.8 + (BAYER[y & 1][x & 1] - 1.5) * 0.35;
        if (y === bot && (x & 1)) continue;                // feston
        if (y >= bot - 1) v -= 1.2;                        // ombre sous chaque étage
        px(g, x, y, ramp[Math.max(0, Math.min(4, Math.round(v)))]);
        filled.add(y * 32 + x);
      }
    }
  });
  // Contour
  const img = new Set(filled);
  for (const k of img) {
    const x = k % 32, y = Math.floor(k / 32);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = (y + dy) * 32 + x + dx;
      if (!img.has(n) && x + dx >= 0 && x + dx < 32 && y + dy >= 0) px(g, x + dx, y + dy, C.outline);
    }
  }
  return c;
}

/* ───────────────────────── API ───────────────────────── */

export function buildTiles() {
  const frames = [0, 1, 2, 3].map((f) => ({ [T.DEEP]: water(true, f), [T.WATER]: water(false, f) }));
  const grasses = [grass(0), grass(1)];
  const fixed = {
    [T.SAND]: sand(),
    [T.GRASS]: grasses[0],
    [T.GRASS2]: grasses[1],
    [T.FLOWERS]: flowers(),
    [T.BUSH]: bush(),
    [T.TREE_TOP]: grasses[0],
    [T.TREE_BOT]: grasses[1],
  };
  const trees = { [TREE_ROUND]: roundTree(), [TREE_PINE]: pineTree() };
  return {
    get(type, frame) { return fixed[type] || frames[frame & 3][type]; },
    tree(kind) { return trees[kind]; },
  };
}

// Couleurs de la minimap
export const MINIMAP_COLORS = {
  [T.DEEP]: C.deep[1], [T.WATER]: C.water[2], [T.SAND]: C.sand[2],
  [T.GRASS]: C.grass[2], [T.GRASS2]: C.grass[2], [T.FLOWERS]: C.flower[1],
  [T.BUSH]: C.bush[2], [T.TREE_TOP]: C.leaf[2], [T.TREE_BOT]: C.leaf[1],
};

// Fond de page : la tuile d'herbe en motif
export function backgroundPatternURL() {
  return grass(0).toDataURL();
}

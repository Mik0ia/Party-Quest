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
   Petit aventurier médiéval original, tête nue : cheveux bruns en mèches, tabard et cape
   aux couleurs du joueur, ceinture à boucle dorée, chausses et bottes de cuir. Lettres :
   O contour · 1-4 dégradé joueur · a b c d cheveux · S s h peau · E yeux
   L ceinture · Y boucle dorée · P p chausses · B k bottes */

const half = (rows) => rows.map((r) => r + [...r].reverse().join(''));

const HAIR_TOP = ['......OO', '....OOcc', '...Ocdcc', '..Obccdc', '..Obcccc', '.Obbcbcc'];
const FRONT_HEAD = half([
  ...HAIR_TOP,
  '.ObbcSbS', '.ObSSSSS', '.OaSESSS', '.OaSEhSS', '..OsSSSS', '...OOsss',
]);
const BACK_HEAD = half([
  ...HAIR_TOP,
  '.Obbcccc', '.Oabbccc', '.Oaabbcc', '.Oaaabbb', '..Oaaabb', '...OOsss',
]);
const FRONT_BODY = half([
  '..OO2332', '.O2O3443', '.O2O3443', '.O1SLLLY', '.O1O3333', '..O1O22O',
]);
const BACK_BODY = half([
  '..OO2332', '.O2O1222', '.O2O2232', '.O1S2232', '.O1O1222', '..O1O111',
]);
const FRONT_LEGS = half(['...OPPpO', '...OBBkO', '...OOOOO']);

const SIDE_HEAD = [
  '.....OOOOO......',
  '....OccdddO.....',
  '...OccddccbO....',
  '..OccccccbbbO...',
  '..OcScccbbbbO...',
  '.OSSSScbbbbaO...',
  '.OSESSSSbbbaO...',
  'OSSESSSSSbbaO...',
  '.OhSSSSSsbaO....',
  '..OsSSSSOaO.....',
  '...OOssOOO......',
];
const SIDE_BODY = [
  '....O2332O2O....',
  '....O34436O21O..',
  '....O3SS43O21O..',
  '....OLLYLLO11O..',
  '....O33333O11O..',
  '.....O22O2O1O...',
];
const SIDE_LEGS = [
  ['.....OPPpO......', '....OBBBkO......', '....OOOOOO......'],
  ['....OPPOpPO.....', '...OBBkOOBkO....', '...OOOO.OOOO....'],
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
    L: C.leather[0], Y: C.gold,
    P: C.leather[1], p: C.leather[0], B: C.shoes[1], k: C.shoes[0],
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

/* ───────────────────────── DÉCOR MÉDIÉVAL ───────────────────────── */

// Panneau indicateur en bois
function sign() {
  const c = grass(1);
  const g = c.getContext('2d');
  const [dk, md, lt, hi] = C.wood;
  g.fillStyle = C.grass[0];
  g.fillRect(5, 14, 6, 1);
  // poteau
  for (let y = 8; y <= 14; y++) { px(g, 6, y, C.outline); px(g, 7, y, lt); px(g, 8, y, md); px(g, 9, y, C.outline); }
  // planche
  for (let y = 2; y <= 8; y++) {
    for (let x = 1; x <= 14; x++) {
      const edge = y === 2 || y === 8 || x === 1 || x === 14;
      px(g, x, y, edge ? C.outline : y === 3 ? hi : y === 7 ? md : lt);
    }
  }
  // inscriptions gravées
  for (const [x0, x1, y] of [[3, 9, 4], [3, 11, 6]]) for (let x = x0; x <= x1; x += (x % 3 === 2 ? 2 : 1)) px(g, x, y, dk);
  return c;
}

// Tonneau cerclé de fer
function barrel() {
  const c = grass(2);
  const g = c.getContext('2d');
  const [dk, md, lt, hi] = C.wood;
  g.fillStyle = C.grass[0];
  g.fillRect(3, 14, 10, 2);
  for (let y = 3; y <= 14; y++) {
    const bulge = y > 4 && y < 13 ? 1 : 0;
    const x0 = 3 - bulge, x1 = 12 + bulge;
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / (x1 - x0);
      let col = t < 0.25 ? hi : t < 0.55 ? lt : t < 0.8 ? md : dk;
      if (y === 5 || y === 11) col = t < 0.4 ? C.steel[2] : C.steel[1];
      if (x === x0 || x === x1 || y === 14) col = C.outline;
      px(g, x, y, col);
    }
  }
  // couvercle
  for (let x = 4; x <= 11; x++) { px(g, x, 2, C.outline); px(g, x, 3, x < 7 ? hi : lt); }
  px(g, 3, 3, C.outline); px(g, 12, 3, C.outline);
  return c;
}

// Tente de campement conique (32x32) à bandes, comme un bivouac d'aventuriers
const TENT_COLORS = {
  1: ['#7A1E24', '#C03838', '#E86858'],   // rouge
  2: ['#1E3A80', '#3460C0', '#5A8CE8'],   // bleue
};
function tent(kind) {
  const c = canvas(32, 32);
  const g = c.getContext('2d');
  const stripe = TENT_COLORS[kind];
  const cloth = C.canvas;
  // ombre au sol
  g.fillStyle = C.grass[0];
  for (let y = 27; y <= 31; y++) {
    const hw = Math.round(14 * Math.sqrt(Math.max(0, 1 - ((y - 29) / 3) ** 2)));
    g.fillRect(16 - hw, y, hw * 2, 1);
  }
  const m = makeMask(32, 30);
  const ramp = [];
  const top = 4, bot = 28;
  for (let y = top; y <= bot; y++) {
    const t = (y - top) / (bot - top);
    const hw = 1 + t * 13 + (t > 0.9 ? 1 : 0);
    for (let x = 0; x < 32; x++) {
      const u = (x + 0.5 - 16) / hw;               // -1 (gauche) → 1 (droite)
      if (Math.abs(u) > 1) continue;
      const band = Math.floor((u + 1) * 3.5) & 1;  // bandes qui convergent vers le sommet
      const light = clamp(Math.floor(1.6 - u * 1.1 + dither(x, y) * 0.8), 0, 2);
      m.v[y * 32 + x] = band * 3 + light;
    }
  }
  ramp.push(...cloth, ...stripe);
  drawMask(g, m, ramp, C.outline);
  // entrée : rabat ouvert sombre
  for (let y = 18; y <= 28; y++) {
    const hw = Math.round((y - 18) * 0.42);
    for (let x = 16 - hw; x <= 16 + hw; x++) px(g, x, y, y > 26 ? '#1E1410' : '#3A2418');
    px(g, 16 - hw - 1, y, cloth[2]); px(g, 16 + hw + 1, y, cloth[0]);
  }
  // perches croisées au sommet
  for (let i = 0; i < 4; i++) { px(g, 14 + i, 3 - i, C.wood[1]); px(g, 18 - i, 3 - i, C.wood[2]); }
  px(g, 13, 4, C.outline); px(g, 19, 4, C.outline);
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
    [T.SIGN]: sign(),
    [T.BARREL]: barrel(),
    [T.TENT_TOP]: g0,
    [T.TENT_BOT]: g1,
  };
  const tents = { 1: tent(1), 2: tent(2) };
  const orange = flowers(C.flowerOrange);
  const pine = pineTree();
  return {
    get(type, frame, x = 0, y = 0) {
      if (type === T.FLOWERS && ((x * 7 + y * 3) & 3) === 0) return orange;
      return fixed[type] || frames[frame & 3][type];
    },
    tree() { return pine; },
    tent(kind) { return tents[kind]; },
  };
}

// Couleurs de la minimap
export const MINIMAP_COLORS = {
  [T.DEEP]: C.deep[1], [T.WATER]: C.water[2], [T.PATH]: C.path[2],
  [T.GRASS]: C.grass[2], [T.GRASS2]: C.grass[2], [T.FLOWERS]: C.flowerRed[1],
  [T.TALL]: C.tall[2], [T.BUSH]: C.tall[1], [T.ROCK]: C.rock[2],
  [T.TREE_TOP]: C.pine[3], [T.TREE_BOT]: C.pine[2],
  [T.SIGN]: C.wood[2], [T.BARREL]: C.wood[1], [T.TENT_TOP]: '#E86858', [T.TENT_BOT]: '#C03838',
};

// Fond de page : la tuile d'herbe en motif
export function backgroundPatternURL() {
  return grass(0).toDataURL();
}

import { NES, PLAYER_COLORS } from './palette.js';
import { T } from './world.js';

// Tout le pixel art est dessiné ici, pixel par pixel, à partir de grilles de caractères.
// Une lettre = une couleur de la palette NES, '.' = transparent.
// Contraintes NES respectées : 3 couleurs par sprite (+ transparent),
// 3 couleurs + couleur de fond commune par tuile, ombres en trame (dithering).

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function paint(target, grid, map, mirror = false) {
  const g = target.getContext('2d');
  grid.forEach((row, y) => {
    if (row.length !== 16) console.warn('Ligne de sprite invalide', y, row);
    for (let x = 0; x < 16; x++) {
      const col = map[row[mirror ? 15 - x : x]];
      if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
    }
  });
  return target;
}

// Remplit une tuile pixel par pixel selon une fonction (x, y) -> couleur
function pattern(fn) {
  const c = canvas(16, 16);
  const g = c.getContext('2d');
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      g.fillStyle = fn(x, y);
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

/* ───────────────────────── PERSONNAGES ─────────────────────────
   3 couleurs comme sur NES : contour noir, peau, couleur du joueur
   (cheveux et vêtements partagent la même couleur, comme Kyte). */

const BODY = {
  d: [
    '................',
    '....KKKKKKKK....',
    '...KCCCCCCCCK...',
    '..KCCKCCCCKCCK..',
    '..KCCCCCCCCCCK..',
    '..KCKSSSSSSKCK..',
    '..KCSKSSSSKSCK..',
    '..KKSSSSSSSSKK..',
    '...KKSSKKSSKK...',
    '...KCCKSSKCCK...',
    '..KSKCCCCCCKSK..',
    '..KSKCKCCKCKSK..',
    '...KKCCCCCCKK...',
  ],
  u: [
    '................',
    '....KKKKKKKK....',
    '...KCCCCCCCCK...',
    '..KCCCCKCCCCCK..',
    '..KCCCCCCCKCCK..',
    '..KCCKCCCCCCCK..',
    '..KCCCCCCKCCCK..',
    '..KKCCCCCCCCKK..',
    '...KKCCCCCCKK...',
    '...KCCCCCCCCK...',
    '..KSKCCCCCCKSK..',
    '..KSKCCCCCCKSK..',
    '...KKCCCCCCKK...',
  ],
  l: [
    '................',
    '....KKKKKKK.....',
    '...KCCCCCCCK....',
    '..KCCCCKCCCCK...',
    '..KCCCCCCCCCCK..',
    '..KSSCCCCCKCCK..',
    '..KKSSCCCCCCCK..',
    '..KSSSSKCCCCK...',
    '...KKSSSSKKK....',
    '....KCCCCCCK....',
    '....KCCSSCCK....',
    '....KCKSSKCK....',
    '....KCCCCCCK....',
  ],
};

const LEGS = {
  front: [
    ['....KCCKKCCK....', '....KKKKKKKK....', '................'], // repos
    ['....KCCKKCCK....', '....KKKKKCCK....', '........KKKK....'], // pas A
    ['....KCCKKCCK....', '....KCCKKKKK....', '....KKKK........'], // pas B
  ],
  side: [
    ['.....KCCCCK.....', '.....KKKKKK.....', '................'],
    ['....KCCKKCCK....', '...KKKK..KKKK...', '................'],
    ['.....KCCCCK.....', '.....KKKKKK.....', '................'],
  ],
};

const spriteCache = new Map();

// dir: 'u' | 'd' | 'l' | 'r'   frame: 0 repos, 1 et 2 marche
export function playerSprite(colorIdx, dir, frame) {
  const key = `${colorIdx}|${dir}|${frame}`;
  let c = spriteCache.get(key);
  if (c) return c;
  const pal = PLAYER_COLORS[colorIdx % PLAYER_COLORS.length];
  const map = { K: NES.black, S: NES.cream, C: pal.tunic };
  const side = dir === 'l' || dir === 'r';
  const body = BODY[side ? 'l' : dir];
  const legs = LEGS[side ? 'side' : 'front'][frame];
  // Petit rebond pendant la marche : le corps descend d'un pixel sur les frames de pas
  const rows = frame ? ['................', ...body, ...legs].slice(0, 16) : [...body, ...legs];
  c = paint(canvas(16, 16), rows, map, dir === 'r');
  spriteCache.set(key, c);
  return c;
}

export function avatarURL(colorIdx, scale = 4) {
  const src = playerSprite(colorIdx, 'd', 0);
  const c = canvas(16 * scale, 16 * scale);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, 16 * scale, 16 * scale);
  return c.toDataURL();
}

/* ───────────────────────── TUILES ───────────────────────── */

// Herbe : motif répétitif de touffes, typique des overworlds NES
const GRASS_A = [
  'GGGGGGGGGGGGGGGG',
  'GGDGGGGGGGGGGGGG',
  'GDLDGGGGGGDGGGGG',
  'GGGGGGGGGDLDGGGG',
  'GGGGGGGGGGGGGGGG',
  'GGGGGGDGGGGGGGGG',
  'GGGGGDLDGGGGGGDG',
  'GGGGGGGGGGGGGDLD',
  'GGDGGGGGGGGGGGGG',
  'GDLDGGGGGGGDGGGG',
  'GGGGGGGGGGDLDGGG',
  'GGGGGGDGGGGGGGGG',
  'GGGGGDLDGGGGGGGG',
  'GGGGGGGGGGGGGGDG',
  'GGGGGGGGGGGGGDLD',
  'GGGGGGGGGGGGGGGG',
];

const GRASS_B = [
  'GGGGGGGGGGGGGGGG',
  'GGGGGGGGDGGGGGGG',
  'GGGGGGGDLDGGGGGG',
  'GGDGGGGGGGGGGGGG',
  'GDLDGGGGGGGGGDGG',
  'GGGGGGGGGGGGDLDG',
  'GGGGGGGGGGGGGGGG',
  'GGGGGGDGGGGGGGGG',
  'GGGGGDLDGGGGGGGG',
  'GGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGDGGGG',
  'GGDGGGGGGGDLDGGG',
  'GDLDGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGGG',
  'GGGGGGGGDGGGGGGG',
  'GGGGGGGDLDGGGGGG',
];

const GRASS_MAP = { G: NES.green, D: NES.forest, L: NES.lime };

// Sapin à étages, contour noir comme les décors NES
const PINE = [
  '.......KK.......',
  '......KLDK......',
  '.....KLGDDK.....',
  '....KLGGGDDK....',
  '.....KKGDKK.....',
  '....KLGGGDDK....',
  '...KLGGGGDDDK...',
  '..KLGGGGGGDDDK..',
  '...KKKGGDDKKK...',
  '..KLGGGGGGDDDK..',
  '.KLGGGGGGGGDDDK.',
  'KLGGGGGGGGGGDDDK',
  '.KKKKKKNNKKKKKK.',
  '......KNNK......',
  '......KNNK......',
  '.......KK.......',
];

const BUSH = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.......KKK......',
  '.....KKLGDK.....',
  '....KLGGGDDK....',
  '...KLGLGGGDDK...',
  '...KGGGGGDDDK...',
  '...KGGGDGDDDK...',
  '....KDDDDDDK....',
  '.....KKKKKK.....',
  '................',
  '................',
];

const PLANT_MAP = { K: NES.black, D: NES.forest, G: NES.green, L: NES.lime, N: NES.wood };

function grass(grid) {
  return pattern((x, y) => GRASS_MAP[grid[y][x]]);
}

// Sol de forêt : trame (damier) vert / vert sombre, l'ombre façon NES
function forestFloor() {
  return pattern((x, y) => ((x + y) & 1 ? NES.forest : NES.green));
}

function flowers() {
  const c = grass(GRASS_B);
  const g = c.getContext('2d');
  for (const [x, y, col] of [[4, 4, NES.white], [11, 7, NES.red], [6, 11, NES.white], [13, 13, NES.red]]) {
    g.fillStyle = col;
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) g.fillRect(x + dx, y + dy, 1, 1);
    g.fillStyle = NES.sand;
    g.fillRect(x, y, 1, 1);
  }
  return c;
}

// Sable : trame régulière de grains clairs et foncés
function sand() {
  return pattern((x, y) => {
    if ((x * 3 + y * 5) % 11 === 0) return NES.wood;
    if ((x * 7 + y * 3) % 13 === 0) return NES.cream;
    return NES.sand;
  });
}

// Eau profonde : quadrillage en losanges, comme le sol du screen de référence
function deepWater(frame) {
  return pattern((x, y) => {
    const a = (x + y + frame * 2) & 7, b = (x - y + 16 + frame * 2) & 7;
    if (a === 0 || b === 0) return NES.blue;
    return NES.navy;
  });
}

// Eau peu profonde : vaguelettes claires qui se décalent à chaque frame
function shallowWater(frame) {
  const c = pattern(() => NES.blue);
  const g = c.getContext('2d');
  const waves = [[2, 3], [10, 3], [6, 8], [14, 8], [2, 13], [10, 13]];
  for (const [wx, wy] of waves) {
    const x = (wx + frame * 2) & 15;
    g.fillStyle = NES.sky;
    g.fillRect(x, wy, 3, 1);
    g.fillRect((x + 15) & 15, wy + 1, 1, 1);
    g.fillRect((x + 3) & 15, wy + 1, 1, 1);
  }
  // Légère trame pour casser l'aplat
  g.fillStyle = NES.navy;
  for (let y = 0; y < 16; y += 4) for (let x = (y & 4) ? 2 : 0; x < 16; x += 4) g.fillRect(x, y + 1, 1, 1);
  return c;
}

function onTop(base, grid) {
  return paint(base, grid, PLANT_MAP);
}

export function buildTiles() {
  const frames = [0, 1].map((f) => ({
    [T.DEEP]: deepWater(f),
    [T.WATER]: shallowWater(f),
  }));
  const fixed = {
    [T.SAND]: sand(),
    [T.GRASS]: grass(GRASS_A),
    [T.GRASS2]: grass(GRASS_B),
    [T.FLOWERS]: flowers(),
    [T.BUSH]: onTop(grass(GRASS_A), BUSH),
    [T.TREE]: onTop(forestFloor(), PINE),
  };
  return {
    get(type, frame) {
      return fixed[type] || frames[frame & 1][type];
    },
  };
}

// Couleurs de la minimap (une couleur par type de tuile)
export const MINIMAP_COLORS = {
  [T.DEEP]: NES.navy, [T.WATER]: NES.blue, [T.SAND]: NES.sand,
  [T.GRASS]: NES.green, [T.GRASS2]: NES.green, [T.FLOWERS]: NES.green,
  [T.BUSH]: NES.leaf, [T.TREE]: NES.forest,
};

// Motif de briques violettes façon écran NES, utilisé en fond de page
export function brickPatternURL() {
  const c = canvas(16, 8);
  const g = c.getContext('2d');
  g.fillStyle = NES.plum;
  g.fillRect(0, 0, 16, 8);
  g.fillStyle = NES.black;
  g.fillRect(0, 3, 16, 1);
  g.fillRect(0, 7, 16, 1);
  g.fillRect(7, 0, 1, 3);
  g.fillRect(15, 4, 1, 3);
  g.fillStyle = '#D800CC';
  g.fillRect(0, 0, 7, 1);
  g.fillRect(8, 4, 7, 1);
  return c.toDataURL();
}

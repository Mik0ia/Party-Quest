import { Perlin, hash2 } from './noise.js';

export const T = {
  DEEP: 0, WATER: 1, PATH: 2, GRASS: 3, GRASS2: 4, FLOWERS: 5,
  TALL: 6,      // herbes hautes : décor traversable
  BUSH: 7,      // buisson : bloquant
  ROCK: 8,      // rocher : bloquant
  TREE_TOP: 9,  // rangée haute d'un sapin 2x2 : on passe derrière le feuillage
  TREE_BOT: 10, // rangée basse (tronc) : bloquante. Un sapin placé juste en dessous
                // pose sa rangée haute sur ce tronc : les colonnes de sapins sont étanches.
  SIGN: 11,     // panneau de bois au bord des chemins : bloquant
  BARREL: 12,   // tonneau : bloquant
  TENT_TOP: 13, // haut d'une tente de campement 2x2 : on passe derrière
  TENT_BOT: 14, // bas de la tente : bloquant
  // Formations rocheuses (falaises) : 3 couches selon la hauteur du relief
  TOP1: 15, TOP2: 16, TOP3: 17,     // dessus d'un plateau rocheux de couche 1, 2 ou 3
  FACE1: 18, FACE2: 19, FACE3: 20,  // paroi de falaise sous un plateau de couche 1, 2 ou 3
};

// Seuils de hauteur du bruit de Perlin (valeurs de -0.7 à 0.7 environ) :
//   < -0.24 eau profonde · < -0.12 eau · sol · > 0.19 roche · > 0.26 2e couche · > 0.33 3e couche
export const ELEV = { DEEP: -0.24, WATER: -0.12, ROCK: [0.19, 0.26, 0.33] };

const BLOCKING = new Set([
  T.DEEP, T.WATER, T.BUSH, T.ROCK, T.TREE_BOT, T.SIGN, T.BARREL, T.TENT_BOT,
  T.TOP1, T.TOP2, T.TOP3, T.FACE1, T.FACE2, T.FACE3,
]);

export const isWater = (t) => t === T.DEEP || t === T.WATER;
export const isCliff = (t) => t >= T.TOP1 && t <= T.FACE3;
export const isFace = (t) => t >= T.FACE1 && t <= T.FACE3;
// Couche rocheuse visible d'une tuile (0 = sol)
export const cliffLevel = (t) => (t >= T.TOP1 && t <= T.TOP3 ? t - T.TOP1 + 1 : t >= T.FACE1 ? t - T.FACE1 + 1 : 0);

// Overworld infini généré à la volée : chaque tuile ne dépend que de (x, y, seed)
export class World {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.elev = new Perlin(this.seed);
    this.veg = new Perlin((this.seed ^ 0x9e3779b9) >>> 0);
    this.paths = new Perlin((this.seed ^ 0x51ed270b) >>> 0);
    this.patch = new Perlin((this.seed ^ 0x2545f491) >>> 0);
    this.cache = new Map();
    this.anchors = new Map();
    this._spawn = null;
  }

  // Hauteur du relief en (x, y)
  height(x, y) {
    return this.elev.fbm(x / 26, y / 26, 4);
  }

  // Couche rocheuse brute (0 = sol, 1 à 3 = roche) d'après les seuils de hauteur
  level(x, y) {
    const e = this.height(x, y);
    let l = 0;
    for (const th of ELEV.ROCK) if (e > th) l++;
    return l;
  }

  // Terrain sans les arbres
  base(x, y) {
    const e = this.height(x, y);
    if (e < ELEV.DEEP) return T.DEEP;
    if (e < ELEV.WATER) return T.WATER;
    // Falaises : si la case au-dessus est plus haute, on voit sa paroi ici
    const l = this.level(x, y), up = this.level(x, y - 1);
    if (up > l) return T.FACE1 + up - 1;
    if (l > 0) return T.TOP1 + l - 1;
    // Chemins de sable : le long des "crêtes" d'un bruit basse fréquence → tracés sinueux
    if (this.isPath(x, y)) return T.PATH;
    const r = hash2(x, y, this.seed);
    // Panneaux indicateurs plantés le long des chemins
    if (r < 0.05 && (this.isPath(x + 1, y) || this.isPath(x - 1, y)) && hash2(x, y, this.seed ^ 0x5151) < 0.3) return T.SIGN;
    if (r > 0.996) return T.BARREL;
    if (this.patch.fbm(x / 9, y / 9, 2) > 0.22) return T.TALL;
    if (r < 0.008) return T.ROCK;
    if (r < 0.03) return T.BUSH;
    if (r < 0.07) return T.FLOWERS;
    return r < 0.55 ? T.GRASS : T.GRASS2;
  }

  isPath(x, y) {
    return Math.abs(this.paths.fbm(x / 34, y / 34, 2)) < 0.032;
  }

  // Tentes de campement 2x2 dans les clairières (grille de 2x2, donc jamais superposées)
  tentAt(ax, ay) {
    if ((ax & 1) || (ay & 1)) return 0;
    if (hash2(ax, ay, this.seed ^ 0x7e47) > 0.012) return 0;
    if (this.veg.fbm(ax / 12, ay / 12, 3) > -0.02) return 0;
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const b = this.base(ax + dx, ay + dy);
        if (![T.GRASS, T.GRASS2, T.FLOWERS, T.TALL].includes(b)) return 0; // jamais sur la roche
      }
    // Couleur de la tente : 1 rouge, 2 bleue
    return 1 + (hash2(ax, ay, this.seed ^ 0x99) < 0.5 ? 0 : 1);
  }

  tentOf(x, y) {
    const ax = this.colOf(x), ay = y - (((y % 2) + 2) % 2);
    const k = this.tentAt(ax, ay);
    return k ? { ax, ay, kind: k } : null;
  }

  // Sapins de 2x2 tuiles : colonnes alignées tous les 2 x, mais un sapin peut démarrer
  // sur n'importe quelle ligne, donc chevaucher le sapin du dessus (comme dans Pokémon).
  treeAt(ax, ay) {
    const key = ax * 100003 + ay;
    let k = this.anchors.get(key);
    if (k !== undefined) return k;
    k = 0;
    const v = this.veg.fbm(ax / 12, ay / 12, 3);
    const r = hash2(ax, ay, this.seed ^ 0x77);
    if (v > 0.07 || (v > 0.01 && r < 0.3) || r < 0.006) {
      k = 1;
      for (let dy = 0; dy < 2 && k; dy++)
        for (let dx = 0; dx < 2 && k; dx++) {
          const b = this.base(ax + dx, ay + dy);
          if (isWater(b) || isCliff(b) || b === T.PATH || this.tentOf(ax + dx, ay + dy)) k = 0;
        }
    }
    this.anchors.set(key, k);
    return k;
  }

  // Colonne de sapins (x pair) qui contient la tuile x
  colOf(x) {
    return x - (((x % 2) + 2) % 2);
  }

  tile(x, y) {
    const key = x * 100003 + y;
    let t = this.cache.get(key);
    if (t === undefined) {
      const ax = this.colOf(x);
      const tent = this.tentOf(x, y);
      if (tent) t = y === tent.ay ? T.TENT_TOP : T.TENT_BOT;
      else if (this.treeAt(ax, y - 1)) t = T.TREE_BOT;       // tronc d'un sapin qui démarre au-dessus
      else if (this.treeAt(ax, y)) t = T.TREE_TOP;      // haut d'un sapin
      else t = this.base(x, y);
      if (this.cache.size > 200000) { this.cache.clear(); this.anchors.clear(); }
      this.cache.set(key, t);
    }
    return t;
  }

  walkable(x, y) {
    return !BLOCKING.has(this.tile(x, y));
  }

  // Point d'apparition commun : une clairière dégagée proche de l'origine
  spawn() {
    if (this._spawn) return this._spawn;
    const ok = (cx, cy) => {
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          if (!this.walkable(cx + dx, cy + dy)) return false;
      return true;
    };
    for (let r = 0; r < 300; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (ok(dx, dy)) return (this._spawn = { x: dx, y: dy });
        }
      }
    }
    return (this._spawn = { x: 0, y: 0 });
  }

  spawnFor(index) {
    const s = this.spawn();
    const offsets = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
    const [dx, dy] = offsets[index % offsets.length];
    return { x: s.x + dx, y: s.y + dy };
  }
}

import { Perlin, hash2 } from './noise.js';

export const T = {
  DEEP: 0, WATER: 1, PATH: 2, GRASS: 3, GRASS2: 4, FLOWERS: 5,
  TALL: 6,      // herbes hautes : décor traversable
  BUSH: 7,      // buisson : bloquant
  ROCK: 8,      // rocher : bloquant
  TREE_TOP: 9,  // moitié haute d'un sapin 2x2 : on passe derrière le feuillage
  TREE_BOT: 10, // moitié basse (tronc) : bloquante
};
const BLOCKING = new Set([T.DEEP, T.WATER, T.BUSH, T.ROCK, T.TREE_BOT]);

export const isWater = (t) => t === T.DEEP || t === T.WATER;

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

  // Terrain sans les arbres
  base(x, y) {
    const e = this.elev.fbm(x / 26, y / 26, 4);
    if (e < -0.24) return T.DEEP;
    if (e < -0.12) return T.WATER;
    // Chemins de sable : le long des "crêtes" d'un bruit basse fréquence → tracés sinueux
    if (Math.abs(this.paths.fbm(x / 34, y / 34, 2)) < 0.032) return T.PATH;
    const r = hash2(x, y, this.seed);
    if (this.patch.fbm(x / 9, y / 9, 2) > 0.22) return T.TALL;
    if (r < 0.012) return T.ROCK;
    if (r < 0.03) return T.BUSH;
    if (r < 0.07) return T.FLOWERS;
    return r < 0.55 ? T.GRASS : T.GRASS2;
  }

  // Sapins de 2x2 tuiles, alignés en rangées comme dans les forêts des RPG GBA
  treeAt(ax, ay) {
    const key = ax * 100003 + ay;
    let k = this.anchors.get(key);
    if (k !== undefined) return k;
    k = 0;
    const v = this.veg.fbm(ax / 12, ay / 12, 3);
    const r = hash2(ax, ay, this.seed ^ 0x77);
    if (v > 0.07 || (v > 0.01 && r < 0.4) || r < 0.012) {
      k = 1;
      for (let dy = 0; dy < 2 && k; dy++)
        for (let dx = 0; dx < 2 && k; dx++) {
          const b = this.base(ax + dx, ay + dy);
          if (isWater(b) || b === T.PATH) k = 0;
        }
    }
    this.anchors.set(key, k);
    return k;
  }

  tree(x, y) {
    const ax = x - (((x % 2) + 2) % 2);
    const ay = y - (((y % 2) + 2) % 2);
    return this.treeAt(ax, ay) ? { ax, ay } : null;
  }

  tile(x, y) {
    const key = x * 100003 + y;
    let t = this.cache.get(key);
    if (t === undefined) {
      const tr = this.tree(x, y);
      t = tr ? (y === tr.ay ? T.TREE_TOP : T.TREE_BOT) : this.base(x, y);
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

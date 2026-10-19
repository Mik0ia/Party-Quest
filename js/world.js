import { Perlin, hash2 } from './noise.js';

export const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, GRASS2: 4, FLOWERS: 5, BUSH: 6, TREE: 7 };
const BLOCKING = new Set([T.DEEP, T.WATER]);

export const isWater = (t) => t === T.DEEP || t === T.WATER;

// Overworld infini généré à la volée : chaque tuile ne dépend que de (x, y, seed)
export class World {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.elev = new Perlin(this.seed);
    this.veg = new Perlin((this.seed ^ 0x9e3779b9) >>> 0);
    this.cache = new Map();
    this._spawn = null;
  }

  tile(x, y) {
    const key = x * 100003 + y;
    let t = this.cache.get(key);
    if (t === undefined) {
      t = this.compute(x, y);
      if (this.cache.size > 200000) this.cache.clear();
      this.cache.set(key, t);
    }
    return t;
  }

  compute(x, y) {
    // Relief : détermine l'eau (lacs, rivières) et les berges de sable
    const e = this.elev.fbm(x / 26, y / 26, 4);
    if (e < -0.24) return T.DEEP;
    if (e < -0.13) return T.WATER;
    if (e < -0.09) return T.SAND;

    // Végétation : un second bruit dessine les zones de forêt dense
    const v = this.veg.fbm(x / 11, y / 11, 3);
    const r = hash2(x, y, this.seed);
    if (v > 0.10) return r < 0.88 ? T.TREE : T.BUSH;
    if (v > 0.02 && r < 0.35) return T.TREE;
    if (r < 0.05) return T.BUSH;
    if (r < 0.09) return T.FLOWERS;
    return r < 0.5 ? T.GRASS : T.GRASS2;
  }

  walkable(x, y) {
    return !BLOCKING.has(this.tile(x, y));
  }

  // Point d'apparition commun : une clairière de terre ferme proche de l'origine
  spawn() {
    if (this._spawn) return this._spawn;
    const ok = (cx, cy) => {
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          if (!this.walkable(cx + dx, cy + dy)) return false;
      return true;
    };
    for (let r = 0; r < 300; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (const dy of [-r, r]) {
          if (ok(dx, dy)) return (this._spawn = { x: dx, y: dy });
        }
      }
      for (let dy = -r + 1; dy <= r - 1; dy++) {
        for (const dx of [-r, r]) {
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

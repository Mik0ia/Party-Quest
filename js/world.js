import { Perlin, hash2 } from './noise.js';

export const T = {
  DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, GRASS2: 4, FLOWERS: 5, BUSH: 6,
  TREE_TOP: 7,  // moitié haute d'un arbre 2x2 : on passe derrière le feuillage
  TREE_BOT: 8,  // moitié basse (tronc) : bloquante
};
const BLOCKING = new Set([T.DEEP, T.WATER, T.BUSH, T.TREE_BOT]);

export const isWater = (t) => t === T.DEEP || t === T.WATER;
export const TREE_ROUND = 1, TREE_PINE = 2;

// Overworld infini généré à la volée : chaque tuile ne dépend que de (x, y, seed)
export class World {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.elev = new Perlin(this.seed);
    this.veg = new Perlin((this.seed ^ 0x9e3779b9) >>> 0);
    this.kind = new Perlin((this.seed ^ 0x51ed270b) >>> 0);
    this.cache = new Map();
    this.anchors = new Map();
    this._spawn = null;
  }

  // Terrain sans les arbres : eau, sable, herbe, fleurs, buissons
  base(x, y) {
    const e = this.elev.fbm(x / 26, y / 26, 4);
    if (e < -0.24) return T.DEEP;
    if (e < -0.13) return T.WATER;
    if (e < -0.09) return T.SAND;
    const r = hash2(x, y, this.seed);
    const v = this.veg.fbm(x / 11, y / 11, 3);
    if (v > -0.02 && v < 0.06 && r < 0.06) return T.BUSH;
    if (r < 0.05) return T.FLOWERS;
    return r < 0.55 ? T.GRASS : T.GRASS2;
  }

  // Les arbres occupent 2x2 tuiles, posés sur une grille en quinconce
  // (comme les forêts des RPG 16-bit). Renvoie 0, TREE_ROUND ou TREE_PINE.
  treeAt(ax, ay) {
    const key = ax * 100003 + ay;
    let k = this.anchors.get(key);
    if (k !== undefined) return k;
    k = 0;
    const v = this.veg.fbm(ax / 11, ay / 11, 3);
    const r = hash2(ax, ay, this.seed ^ 0x77);
    if (v > 0.06 || (v > 0.0 && r < 0.45) || r < 0.015) {
      let ok = true;
      for (let dy = 0; dy < 2 && ok; dy++)
        for (let dx = 0; dx < 2 && ok; dx++) {
          const b = this.base(ax + dx, ay + dy);
          if (isWater(b) || b === T.SAND) ok = false;
        }
      if (ok) k = this.kind.fbm(ax / 40, ay / 40, 2) > 0.05 ? TREE_PINE : TREE_ROUND;
    }
    this.anchors.set(key, k);
    return k;
  }

  // Coin haut-gauche de l'emplacement d'arbre qui contient (x, y)
  anchorOf(x, y) {
    const ay = y - (((y % 2) + 2) % 2);
    const off = (((ay / 2) % 2) + 2) % 2;
    const ax = x - (((x - off) % 2) + 2) % 2;
    return [ax, ay];
  }

  tree(x, y) {
    const [ax, ay] = this.anchorOf(x, y);
    const kind = this.treeAt(ax, ay);
    return kind ? { ax, ay, kind } : null;
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

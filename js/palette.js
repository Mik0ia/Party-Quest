// Palette 16-bit (style GBA) : couleurs vives, dégradés de 3 à 5 teintes par matière.
export const C = {
  outline: '#282038',
  white: '#F8F8F8',
  black: '#101018',

  grass: ['#4FA65A', '#6CC46A', '#88DA7E', '#B4F0A0'],   // sombre → clair
  bush: ['#1E5A34', '#2E8A40', '#4AAE4C', '#7CD062', '#B6EE88'],
  leaf: ['#1C4E32', '#286E3A', '#3C9444', '#5CB852', '#94DC74'],
  pine: ['#163E38', '#1F5E46', '#2E8052', '#4AA460', '#80CC7C'],
  bark: ['#4E2C1C', '#74442A', '#9A623C', '#C28A58'],
  water: ['#2F64C8', '#4888E8', '#62A6F8', '#8CC8FF', '#C8E8FF'],
  deep: ['#1E44A0', '#2C5CC0', '#3E76D8'],
  sand: ['#C8A060', '#E2C27C', '#F2DA98', '#FFF0C0'],
  shore: ['#5A3428', '#8A5440', '#B47A5C', '#D8A27C'],
  flower: ['#B82838', '#E84848', '#F88870', '#F8D048'],
  skin: ['#C88068', '#F0B090', '#FFD8B8'],
  pants: ['#2C3048', '#404868', '#58628A'],
  boots: ['#3C2418', '#6A4028', '#946038'],
  eye: '#283048',
};

// Chaque joueur a une palette imposée (dégradé de 4 teintes, de la plus sombre à la plus claire).
export const PLAYER_COLORS = [
  { name: 'ROUGE',  ramp: ['#7A1424', '#B82838', '#E8504C', '#FF9480'] },
  { name: 'BLEU',   ramp: ['#16348C', '#2858C8', '#4890F0', '#90CCFF'] },
  { name: 'VERT',   ramp: ['#145A2C', '#22903C', '#44C056', '#9CEC88'] },
  { name: 'VIOLET', ramp: ['#3C1C80', '#6838BC', '#9464EC', '#C8A4FF'] },
  { name: 'OR',     ramp: ['#8A4410', '#D0721C', '#F4A834', '#FFDC70'] },
];

// Couleur "signature" d'un joueur (minimap, nom au-dessus de la tête)
export const playerTint = (i) => PLAYER_COLORS[i % PLAYER_COLORS.length].ramp[2];

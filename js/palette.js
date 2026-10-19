// Palette GBA : tons vifs mais doux, qui se fondent entre eux (herbe menthe, sable pâle, eau claire).
export const C = {
  outline: '#383048',
  white: '#F8F8F8',

  grass: ['#3E9070', '#56AE88', '#72C8A2', '#9EE0BE', '#C4F0D8'],      // sombre → clair
  path: ['#C8A868', '#D8C07C', '#E8D896', '#F6EAB4'],
  pathEdge: ['#A8D8A0', '#C4E0A0'],                                   // fondu herbe → sable
  water: ['#3868A8', '#4E88E0', '#68A8F8', '#90C8FF', '#D0ECFF'],
  deep: ['#4278D8', '#5490EA', '#68A6F4'],
  bank: ['#5A3428', '#8A5A40', '#B07A58', '#D4A07C'],                // talus de terre des berges
  pine: ['#1E4A30', '#2E7444', '#46A050', '#68C058', '#98DC6C', '#C8F094'],
  tall: ['#1E5034', '#2C7848', '#3E9850', '#5AB860', '#88D470'],
  rock: ['#4A2C28', '#7A4C40', '#A87060', '#D09A84', '#F0C8B0'],
  bark: ['#4A2C20', '#70442C', '#946038'],
  flowerRed: ['#B82830', '#F05040', '#F89078'],
  flowerOrange: ['#D06018', '#F8A038', '#F8D070'],
  flowerHeart: '#F8D840',

  // Personnages
  skin: ['#C88068', '#F0B090', '#FFD8B8'],
  hair: ['#4E2C1C', '#7E4A2A', '#B07040', '#D89A60'],
  shirt: ['#B8B8D0', '#F8F8F8'],
  pants: ['#283048', '#3C4868', '#566488'],
  shoes: ['#3A2418', '#6A4028'],
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

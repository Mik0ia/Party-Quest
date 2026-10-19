// Palette GBA : tons vifs mais doux, qui se fondent entre eux (herbe menthe, sable pâle, eau claire).
export const C = {
  outline: '#201828',
  white: '#F8F8F8',

  grass: ['#3A7A2E', '#4E963A', '#68B04C', '#88C864', '#ACDE84'],      // sombre → clair
  path: ['#A07840', '#BA9454', '#D0AC6C', '#E4C68A'],
  pathEdge: ['#3E7E30', '#9C8048'],                                   // liseré herbe sombre → sable
  water: ['#22346C', '#3E66C0', '#5486DA', '#78A8EE', '#B8D6F6'],
  deep: ['#34569E', '#4068B8', '#527CCA'],
  bank: ['#2E1C16', '#5C3A28', '#80553A', '#A47452'],                // talus de terre des berges
  pine: ['#0E2414', '#183E22', '#24582C', '#357438', '#4C9244', '#72B05A'],
  tall: ['#142E18', '#204C24', '#2E6A2E', '#448838', '#64A84C'],
  rock: ['#2C1C1C', '#5E3E36', '#86604E', '#AE8670', '#D0AE94'],
  bark: ['#2E1C14', '#553620', '#7A5030'],
  flowerRed: ['#982030', '#D83C38', '#F07860'],
  flowerOrange: ['#B85010', '#E88A28', '#F4C060'],
  flowerHeart: '#F8D840',

  // Personnages
  skin: ['#C88068', '#F0B090', '#FFD8B8'],
  hair: ['#3A2014', '#623A1E', '#8C5A2C', '#B47E44'],
  steel: ['#4A5068', '#7C86A0', '#B4BED0', '#EEF2FF'],
  leather: ['#4A3020', '#6E4C30'],
  gold: '#F8C840',
  shoes: ['#3A2418', '#6A4028'],
  // Décor médiéval
  canvas: ['#B8A07C', '#E0CCA4', '#F8ECCC'],                        // toile de tente
  wood: ['#4A2C1C', '#7A4C2C', '#A8703C', '#D09A5C'],
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

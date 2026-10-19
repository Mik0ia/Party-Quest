// Palette NES (sous-ensemble cohérent de la palette 2C02)
export const NES = {
  black: '#000000', gray: '#7C7C7C', silver: '#BCBCBC', white: '#F8F8F8',
  navy: '#0000BC', blue: '#0058F8', sky: '#3CBCFC', ice: '#A4E4FC',
  forest: '#005800', green: '#00A800', leaf: '#58D854', lime: '#B8F818',
  bark: '#503000', wood: '#AC7C00', sand: '#F8D878', cream: '#FCE0A8',
  maroon: '#A81000', red: '#F83800', orange: '#FCA044', rust: '#C84C0C',
  plum: '#940084', pink: '#F878F8', violet: '#6844FC', indigo: '#4428BC',
};

// 5 joueurs max : chaque joueur reçoit une variante de palette (cheveux + tunique)
export const PLAYER_COLORS = [
  { hair: NES.bark,   tunic: NES.red,    dark: NES.maroon },
  { hair: NES.navy,   tunic: NES.sky,    dark: NES.blue },
  { hair: NES.sand,   tunic: NES.violet, dark: NES.indigo },
  { hair: NES.rust,   tunic: NES.pink,   dark: NES.plum },
  { hair: NES.rust,   tunic: NES.orange, dark: NES.rust },
];

// Shared design tokens carried over from the v1 Tailwind palette.
// https://coolors.co/f1eee4-1c0f13-f7a1c4-f5d491-1985a1
//
// Token semantics:
//   primary    pink — accents, hover, highlights
//   secondary  mustard — warn / experimental / heads-up
//   dark.400   deep — card surfaces sitting one notch below body bg
//   dark.500   the body background; ink on light surfaces
//   dark.600   image wells (pure black, behind transparent images)
//   light      cream — body text and subtle UI
//   success    sage — confirmation tints; harmonised with secondary
//   danger     brick — warnings/errors; tuned to sit next to the other
//              accents instead of a vibrant alarm-red

export const colors = {
  primary: {
    400: '#f9bdd5',
    500: '#f7a1c4',
  },
  secondary: {
    500: '#f5d491',
  },
  dark: {
    400: '#0e0709',
    500: '#1c0f13',
    600: '#000000',
  },
  light: {
    500: '#f1eee4',
    600: '#d8d6cd',
    700: '#c0beb6',
  },
  success: {
    500: '#a8c69b',
  },
  danger: {
    500: '#c75d5d',
  },
} as const

export type ColorKey = keyof typeof colors

// Shared design tokens carried over from the v1 Tailwind palette.
// https://coolors.co/f1eee4-1c0f13-f7a1c4-f5d491-1985a1

export const colors = {
  primary: {
    400: '#f9bdd5',
    500: '#f7a1c4',
  },
  secondary: {
    500: '#f5d491',
  },
  dark: {
    500: '#1c0f13',
  },
  light: {
    500: '#f1eee4',
    600: '#d8d6cd',
    700: '#c0beb6',
  },
} as const

export type ColorKey = keyof typeof colors

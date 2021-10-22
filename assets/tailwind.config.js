module.exports = {
  mode:  'jit',
  purge: [
    './js/**/*.js',
    '../lib/*_web/**/*.*ex',
  ],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        'primary': {
          400: '#BD82A9',
          DEFAULT: '#D291BC',
          600: '#DBA7C9',
          700: 'white',
        },
        'secondary': {
          400: '#86709B',
          DEFAULT: '#957DAD',
          600: '#AA97BD',
          700: 'white',
        },
        'dark': {
          DEFAULT: 'black',
        },
        'light': {
          DEFAULT: 'white',
        },
        'backdrop': {
          DEFAULT: '#FFFAF9',
        },
        'error': {
          DEFAULT: '#E06666',
          600: '#E68484',
        }
      }
    },
  },
  variants: {
    extend: {},
  },
  plugins: [],
}

import animate from 'tailwindcss-animate';
import type { Config } from 'tailwindcss';

// Tokens from CLAUDE.md → UI guidelines. Keep in sync.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ground: '#F5F6FA',
        surface: '#FFFFFF',
        line: '#E3E6EE',
        ink: '#12172B',
        muted: '#4B5365',
        accent: { DEFAULT: '#4338CA', soft: '#EEF0FF' },
        success: { DEFAULT: '#15803D', soft: '#E8F6EC' },
        warning: { DEFAULT: '#92400E', soft: '#FEF3C7' },
        danger: { DEFAULT: '#B42318', soft: '#FEE4E2' },
        info: { DEFAULT: '#5B21B6', soft: '#EDE9FE' },
        owner: { DEFAULT: '#9A3412', soft: '#FFEDD5' },
      },
      fontFamily: {
        heading: ['Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      width: { sidebar: '232px' },
      spacing: { sidebar: '232px', touch: '44px' },
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
    },
  },
  plugins: [animate],
} satisfies Config;

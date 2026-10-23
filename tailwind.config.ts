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
      keyframes: {
        // Tab click: the panel you jumped to glows for a moment so the eye finds it.
        'section-flash': {
          '0%': {
            backgroundColor: 'rgba(67,56,202,0.16)',
            boxShadow: '0 0 0 3px rgba(67,56,202,0.55)',
          },
          '100%': {
            backgroundColor: 'rgba(67,56,202,0)',
            boxShadow: '0 0 0 3px rgba(67,56,202,0)',
          },
        },
      },
      animation: { 'section-flash': 'section-flash 1.8s ease-out 0.45s both' },
      width: { sidebar: '232px' },
      spacing: { sidebar: '232px', touch: '44px' },
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
    },
  },
  plugins: [animate],
} satisfies Config;

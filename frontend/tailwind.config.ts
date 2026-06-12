import type { Config } from 'tailwindcss';

/**
 * NIVARAN DESIGN SYSTEM — "Civic Control Room"
 * Calm, authoritative operations desk for a city. Warm paper base, ink-black
 * chrome, mono for system data, and reserved status colors that carry meaning.
 * Boldness is spent in exactly one place: the live map + escalation moment.
 * Tokens are defined ONCE here and reused everywhere — no one-off hex values.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Base ink — near-black slate for text and dark chrome.
        ink: {
          DEFAULT: '#0B1120',
          950: '#070B14',
          900: '#0B1120',
          800: '#141C2E',
          700: '#202B42',
          600: '#33415B',
          500: '#5A6A85',
          400: '#8593AE',
          300: '#B6C0D4',
        },
        // Warm paper surfaces — the calm reading/working ground.
        paper: {
          DEFAULT: '#F4F2EC', // page background
          card: '#FFFFFF',
          sunken: '#EBE8DF', // wells, table headers
        },
        // Warm hairline dividers.
        line: {
          DEFAULT: '#E3DFD4',
          strong: '#CFC9BA',
        },
        // Single interactive accent (civic blue) — links, focus, "live". NOT a status.
        signal: {
          DEFAULT: '#1D70B8',
          600: '#1D70B8',
          700: '#15578F',
          100: '#D6E6F3',
          50: '#EBF3FA',
        },
        // Status palette — RESERVED for status only, never decorative chrome.
        status: {
          new: '#5A6A85', // neutral
          routed: '#3C5B7D', // neutral steel — "in the system"
          progress: '#B45309', // amber — being worked
          breached: '#DC2626', // deliberate red
          escalated: '#EA580C', // red-orange — moving up the chain
          resolved: '#15803D', // considered green
        },
        // Dark "tactical" surface for the live map and its chrome.
        control: {
          bg: '#0A0F1C',
          panel: '#0F1626',
          line: '#1F2A40',
          text: '#C8D2E4',
          muted: '#6B7A96',
        },
      },
      fontFamily: {
        heading: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // Deliberate scale with real jumps.
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
        xs: ['0.75rem', { lineHeight: '1.1rem' }],
        sm: ['0.875rem', { lineHeight: '1.35rem' }],
        base: ['1rem', { lineHeight: '1.6rem' }],
        lg: ['1.125rem', { lineHeight: '1.6rem' }],
        xl: ['1.375rem', { lineHeight: '1.7rem' }],
        '2xl': ['1.75rem', { lineHeight: '2rem', letterSpacing: '-0.01em' }],
        '3xl': ['2.25rem', { lineHeight: '2.4rem', letterSpacing: '-0.02em' }],
        '4xl': ['3rem', { lineHeight: '3.1rem', letterSpacing: '-0.025em' }],
        '5xl': ['3.75rem', { lineHeight: '3.8rem', letterSpacing: '-0.03em' }],
      },
      borderRadius: {
        // Precise, not bubbly. Override large stops so nothing reads as a balloon.
        none: '0',
        sm: '2px',
        DEFAULT: '4px',
        md: '5px',
        lg: '6px',
        xl: '7px',
        '2xl': '9px',
        '3xl': '11px',
        full: '9999px',
      },
      boxShadow: {
        card: '0 1px 0 rgba(11,17,32,0.03), 0 1px 2px rgba(11,17,32,0.06)',
        panel: '0 1px 3px rgba(11,17,32,0.08), 0 1px 0 rgba(11,17,32,0.03)',
        pop: '0 12px 40px rgba(11,17,32,0.18)',
        'control': '0 8px 40px rgba(0,0,0,0.45)',
      },
      keyframes: {
        // The signature escalation pulse — a breach ring radiating from a pin.
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(220,38,38,0.55)' },
          '70%': { boxShadow: '0 0 0 16px rgba(220,38,38,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(220,38,38,0)' },
        },
        'live-dot': {
          '0%,100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.4', transform: 'scale(0.82)' },
        },
        rise: {
          '0%': { transform: 'translateY(6px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'sweep': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.4,0,0.6,1) infinite',
        'live-dot': 'live-dot 1.6s ease-in-out infinite',
        rise: 'rise 0.25s ease-out both',
        sweep: 'sweep 1.4s ease-in-out infinite',
      },
      zIndex: { '10': '10', '20': '20', '30': '30', '40': '40', '50': '50' },
    },
  },
  plugins: [],
};

export default config;

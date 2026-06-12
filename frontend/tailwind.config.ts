import type { Config } from 'tailwindcss';

// Design system: "Accessible & Ethical" (UI/UX Pro Max) — high-contrast navy +
// civic blue, WCAG-AA focused, for a trustworthy government product.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#020617', // text
          900: '#0F172A', // primary navy
          700: '#334155', // secondary slate
          500: '#475569',
        },
        brand: {
          DEFAULT: '#0369A1', // CTA blue
          600: '#0369A1',
          700: '#075985',
          50: '#F0F9FF',
          100: '#E0F2FE',
        },
        canvas: '#F8FAFC', // background
        // Civic status palette (color is never the only signal — paired with labels/icons).
        status: {
          new: '#64748B',
          routed: '#0369A1',
          progress: '#7C3AED',
          breached: '#DC2626',
          escalated: '#EA580C',
          resolved: '#16A34A',
        },
      },
      fontFamily: {
        heading: ['var(--font-lexend)', 'system-ui', 'sans-serif'],
        body: ['var(--font-source-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(2,6,23,0.04), 0 8px 24px rgba(2,6,23,0.06)',
      },
      zIndex: {
        '10': '10',
        '20': '20',
        '30': '30',
        '50': '50',
      },
    },
  },
  plugins: [],
};

export default config;

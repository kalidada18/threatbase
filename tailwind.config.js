/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './pages/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Cold-luxury grotesk: one refined family across display + body, mono for data.
        sans: ['"Manrope"', '"Inter Tight"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Manrope"', '"Inter Tight"', 'ui-sans-serif', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        // Tinted, layered elevation — never pure-black drop shadows.
        glass: '0 1px 0 0 rgba(255,255,255,0.05) inset, 0 24px 60px -32px rgba(0,0,0,0.85)',
        // Premium platinum-edged glass: inset top sheen + cool depth.
        'glass-lux': '0 1px 0 0 rgba(199,204,214,0.10) inset, 0 1px 0 0 rgba(0,0,0,0.40), 0 30px 70px -34px rgba(0,0,0,0.9)',
        'glow-red': '0 0 0 1px rgba(207,23,51,0.20), 0 12px 40px -12px rgba(207,23,51,0.40)',
        'glow-ruby': '0 0 0 1px rgba(207,23,51,0.22), 0 16px 50px -16px rgba(207,23,51,0.45)',
      },
      animation: {
        first: "moveVertical 30s ease infinite",
        second: "moveInCircle 20s reverse infinite",
        third: "moveInCircle 40s linear infinite",
        fourth: "moveHorizontal 40s ease infinite",
        fifth: "moveInCircle 20s ease infinite",
        shimmer: "shimmer 2s linear infinite",
        "pulse-ring": "pulseRing 2.4s cubic-bezier(0.4,0,0.6,1) infinite",
        "loader-fill": "loaderFill 4s ease-out infinite",
        "blink": "blink 1.5s infinite",
      },
      keyframes: {
        pulseRing: {
          "0%": { transform: "scale(0.9)", opacity: "0.5" },
          "70%, 100%": { transform: "scale(1.8)", opacity: "0" },
        },
        moveHorizontal: {
          "0%": {
            transform: "translateX(-50%) translateY(-10%)",
          },
          "50%": {
            transform: "translateX(50%) translateY(10%)",
          },
          "100%": {
            transform: "translateX(-50%) translateY(-10%)",
          },
        },
        moveInCircle: {
          "0%": {
            transform: "rotate(0deg)",
          },
          "50%": {
            transform: "rotate(180deg)",
          },
          "100%": {
            transform: "rotate(360deg)",
          },
        },
        moveVertical: {
          "0%": {
            transform: "translateY(-50%)",
          },
          "50%": {
            transform: "translateY(50%)",
          },
          "100%": {
            transform: "translateY(-50%)",
          },
        },
        shimmer: {
          from: {
            transform: "translateX(-100%)",
          },
          to: {
            transform: "translateX(100%)",
          },
        },
        loaderFill: {
          "0%": { width: "0" },
          "80%": { width: "100%" },
          "100%": { width: "100%" },
        },
        blink: {
          "0%, 100%": { opacity: "0" },
          "50%": { opacity: "1" },
        },
      },
      colors: {
        // Ruby-crimson ramp — overrides Tailwind's default `red` so every existing
        // `red-*` utility across the app reads as deep luxury ruby, not alert-red.
        red: {
          50: '#fdf2f4',
          100: '#fce0e4',
          200: '#f7c2ca',
          300: '#ee94a2',
          400: '#e2566c',
          500: '#cf1733',
          600: '#b3122b',
          700: '#8f1023',
          800: '#73111f',
          900: '#5d121e',
          950: '#34060d',
        },
        // Cold metallic detailing — platinum / silver. Used sparingly for hairlines,
        // small-caps labels, and wordmark sheen. Never as a CTA colour.
        platinum: {
          100: '#f2f4f8',
          200: '#e3e7ee',
          300: '#cdd3de',
          400: '#aeb6c4',
          500: '#8f98a8',
          600: '#6f7889',
        },
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      }
    }
  },
  plugins: [require("tailwindcss-animate")],
}

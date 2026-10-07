/**
 * Colours are the web's design tokens (frontend/src/app/globals.css), generated
 * into src/global.css by scripts/gen-theme.mjs (npm run theme). `<alpha-value>` keeps opacity
 * modifiers (bg-primary/10) working. Light/dark follow the device setting.
 */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: token('background'),
        foreground: token('foreground'),
        card: { DEFAULT: token('card'), foreground: token('card-foreground') },
        primary: { DEFAULT: token('primary'), foreground: token('primary-foreground') },
        secondary: token('secondary'),
        muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
        accent: { DEFAULT: token('accent'), foreground: token('accent-foreground') },
        border: token('border'),
        input: token('input'),
        ring: token('ring'),
        destructive: { DEFAULT: token('destructive'), foreground: token('destructive-foreground'), soft: token('destructive-soft') },
        success: { DEFAULT: token('success'), foreground: token('success-foreground'), soft: token('success-soft') },
        warning: { DEFAULT: token('warning'), foreground: token('warning-foreground'), soft: token('warning-soft'), ink: token('warning-ink') },
        info: { DEFAULT: token('info'), foreground: token('info-foreground'), soft: token('info-soft') },
        chart: { 1: token('chart-1') },
      },
      borderRadius: {
        // Web --radius is 0.625rem; touch targets read better a step rounder.
        lg: '10px',
        xl: '14px',
        '2xl': '18px',
      },
    },
  },
  plugins: [],
};

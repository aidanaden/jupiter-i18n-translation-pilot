import iconifyPlugin from "@iconify/tailwind4";

const oklchVar = (variable) => `oklch(from var(${variable}) l c h / <alpha-value>)`;

export default {
  theme: {
    extend: {
      screens: {
        xs: "390px",
      },
      colors: {
        background: "rgb(var(--background-rgb) / <alpha-value>)",
        foreground: oklchVar("--foreground"),
        card: oklchVar("--card"),
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: oklchVar("--secondary-foreground"),
        },
        muted: {
          DEFAULT: oklchVar("--muted"),
          foreground: oklchVar("--muted-foreground"),
        },
        border: oklchVar("--border"),
        info: oklchVar("--info"),
        warning: oklchVar("--warning"),
        "big-input": oklchVar("--big-input"),
        "border-strong": oklchVar("--border-strong"),
        "mid-foreground": oklchVar("--mid-foreground"),
        "faint-foreground": oklchVar("--faint-foreground"),
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
          200: "var(--primary-200)",
        },
        neutral: {
          100: "var(--neutral-100)",
          200: "var(--neutral-200)",
          300: "var(--neutral-300)",
          400: "var(--neutral-400)",
          500: "var(--neutral-500)",
          600: "var(--neutral-600)",
          700: "var(--neutral-700)",
          800: "var(--neutral-800)",
          900: "var(--neutral-900)",
          950: "var(--neutral-950)",
        },
      },
      fontSize: {
        xxs: ["0.625rem", "1rem"],
      },
    },
  },
  plugins: [iconifyPlugin({ prefixes: ["ph"] })],
};

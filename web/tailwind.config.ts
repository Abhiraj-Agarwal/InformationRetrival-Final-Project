import type { Config } from "tailwindcss";

// Design tokens follow the team's Clothing Search Engine UI (ui_theme.py): warm paper surfaces,
// sage for every "selected / on / relevant" state, Fraunces headings and Plus Jakarta Sans body text.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f5f4ef",
        shell: "#ecebe3",
        surface: "#fffefa",
        ink: { DEFAULT: "#1e211b", soft: "#5e6257", faint: "#7c8073" },
        line: "rgba(30, 33, 27, 0.08)",
        "line-strong": "rgba(30, 33, 27, 0.17)",
        sage: { DEFAULT: "#46703f", deep: "#2f4f2c", bg: "#e9f1e3", ink: "#2d4a2a", chart: "#3f7a34" },
        warn: { bg: "#f8ece7", ink: "#8a3d2f" },
        info: { bg: "#e9eef6", ink: "#3a5a8a" },
        amber: { bg: "#f7f0dc", ink: "#7a5a12" },
        mute: "#8f9384",
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ['"Fraunces"', "ui-serif", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: { xl2: "1.75rem", lg2: "1.2rem", md2: "0.85rem" },
      boxShadow: {
        soft: "0 1px 2px rgba(30,33,27,0.04), 0 14px 30px -18px rgba(30,33,27,0.22)",
        inset: "inset 0 1px 2px rgba(30,33,27,0.06)",
        ring: "0 0 0 3px rgba(70,112,63,0.2)",
      },
      transitionTimingFunction: { soft: "cubic-bezier(0.32, 0.72, 0, 1)" },
      keyframes: {
        fadeUp: { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "none" } },
        shimmer: { "0%": { backgroundPosition: "-400px 0" }, "100%": { backgroundPosition: "400px 0" } },
      },
      animation: {
        "fade-up": "fadeUp 550ms cubic-bezier(0.32, 0.72, 0, 1) both",
        shimmer: "shimmer 1.4s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;

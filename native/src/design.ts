export type StarTheme = {
  bg: string;
  surface: string;
  surfaceStrong: string;
  text: string;
  muted: string;
  line: string;
  accent: string;
  accent2: string;
  onAccent: string;
  wash: string;
  shadow: string;
  blurTint: "dark" | "light";
};
export const themes: { night: StarTheme; day: StarTheme } = {
  night: {
    bg: "#17181D",
    surface: "rgba(43,44,53,.80)",
    surfaceStrong: "rgba(40,41,48,.90)",
    text: "#F8F6F2",
    muted: "#AAA7B0",
    line: "rgba(255,255,255,.14)",
    accent: "#E08AAE",
    accent2: "#A99AFF",
    onAccent: "#17181D",
    wash: "#342D47",
    shadow: "rgba(0,0,0,.30)",
    blurTint: "dark",
  },
  day: {
    bg: "#F5F4F1",
    surface: "rgba(255,255,255,.78)",
    surfaceStrong: "rgba(255,255,255,.92)",
    text: "#26242B",
    muted: "#686470",
    line: "rgba(50,45,62,.12)",
    accent: "#A74673",
    accent2: "#6757BB",
    onAccent: "#FFFFFF",
    wash: "#EAE5FF",
    shadow: "rgba(69,58,93,.13)",
    blurTint: "light",
  },
};
export const space = { xs: 6, sm: 10, md: 16, lg: 22, xl: 30, xxl: 40 };
export const radius = { sm: 14, md: 20, lg: 28, pill: 999 };
export const motion = { micro: 160, standard: 280, major: 460 };

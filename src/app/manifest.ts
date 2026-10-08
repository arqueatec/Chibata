import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ArqueaTec Desempenho",
    short_name: "ArqueaTec",
    start_url: "/checkin",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#2e3d44",
    lang: "pt-BR",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}

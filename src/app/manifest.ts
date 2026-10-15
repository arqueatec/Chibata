import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SistemArquea · ArqueaTec",
    short_name: "SistemArquea",
    start_url: "/checkin",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#2e3d44",
    lang: "pt-BR",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}

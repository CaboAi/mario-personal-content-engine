import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mario Polanco Content Engine",
    short_name: "Mario Content",
    description: "Private content operating system for @mario_polancojr",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f0e9",
    theme_color: "#242725",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}

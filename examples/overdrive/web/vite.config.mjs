import { defineConfig } from "vite";
import { artifactureMdx } from "artifacture/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ mode }) => ({
  plugins: [
    ...artifactureMdx(),
    ...(mode === "standalone" ? [viteSingleFile()] : []),
  ],
  base: "./",
  resolve: { dedupe: ["react", "react-dom"] },
}));

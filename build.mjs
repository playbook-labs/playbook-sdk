// Minimal build: transform src/playbook-sdk.js into readable + minified dist
// bundles. No framework/toolchain — just injects the version and minifies.
import { readFileSync } from "node:fs";
import esbuild from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url)));
const version = pkg.version;

const define = { __PB_VERSION__: JSON.stringify(version) };
const bannerFor = (name) => ({
  js: `/*! ${name} v${version} | MIT License | https://github.com/playbook-labs/playbook-sdk */`,
});

// Each source file builds to its own readable + minified UMD bundle.
const bundles = [
  { src: "src/playbook-sdk.js", out: "dist/playbook-sdk", name: "Playbook Gallery SDK" },
  { src: "src/playbook-uploader.js", out: "dist/playbook-uploader", name: "Playbook Uploader SDK" },
  { src: "src/playbook-viewer.js", out: "dist/playbook-viewer", name: "Playbook Viewer SDK" },
];

for (const { src, out, name } of bundles) {
  const shared = {
    entryPoints: [src],
    define,
    banner: bannerFor(name),
    bundle: false,
    logLevel: "info",
  };
  await esbuild.build({ ...shared, outfile: `${out}.js`, minify: false });
  await esbuild.build({ ...shared, outfile: `${out}.min.js`, minify: true });
}

console.log(`Build complete: v${version}`);

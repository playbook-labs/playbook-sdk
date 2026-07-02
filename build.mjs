// Minimal build: transform src/playbook-sdk.js into readable + minified dist
// bundles. No framework/toolchain — just injects the version and minifies.
import { readFileSync } from "node:fs";
import esbuild from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url)));
const version = pkg.version;

const define = { __PB_VERSION__: JSON.stringify(version) };
const entryPoints = ["src/playbook-sdk.js"];
const banner = {
  js: `/*! Playbook Gallery SDK v${version} | MIT License | https://github.com/playbook-labs/playbook-sdk */`,
};

const shared = { entryPoints, define, banner, bundle: false, logLevel: "info" };

await esbuild.build({
  ...shared,
  outfile: "dist/playbook-sdk.js",
  minify: false,
});

await esbuild.build({
  ...shared,
  outfile: "dist/playbook-sdk.min.js",
  minify: true,
});

console.log(`Build complete: v${version}`);

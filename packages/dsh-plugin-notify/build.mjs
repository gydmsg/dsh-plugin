/**
 * 构建脚本：把 src/client.tsx 打包为 lib/client.js（DSH 客户端插件标准格式）。
 * 与 workspace-files 插件同款构建管线（esbuild + ModuleLoader 外壳）。
 */
async function loadEsbuild() {
  try {
    return await import("esbuild");
  } catch {
    // 服务器开发机兜底路径
    return await import("/var/lib/dsh-gateway/workspaces/dsh/tools/node_modules/esbuild/lib/main.js");
  }
}
const { build } = await loadEsbuild();
import { writeFileSync } from "node:fs";

const ID = "@dsh/plugin-notify";

await build({
  entryPoints: ["src/client.tsx"],
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: ["es2020"],
  external: ["react"],
  jsx: "transform",
  jsxFactory: "React.createElement",
  treeShaking: false,
  minify: false,
  logLevel: "info",
  outfile: "lib/client.js",
  banner: {
    js: `window.__ModuleLoader__.load({\n\tid: ${JSON.stringify(ID)},\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;`
  },
  footer: {
    js: `exports.apply = globalThis.__pluginNotify.apply;\nexports.inject = globalThis.__pluginNotify.inject;\nexports.name = "notify-client";\nreturn module.exports;\n\t}\n});`
  }
});

writeFileSync("lib/.build-info.json", JSON.stringify({ id: ID, builtAt: new Date().toISOString() }, null, 2));
console.log("built lib/client.js");

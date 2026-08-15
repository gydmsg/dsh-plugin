/**
 * 构建脚本：把 src/client.tsx 打包为 lib/client.js（DSH 客户端插件标准格式）。
 * 产物形态与官方插件一致：window.__ModuleLoader__.load({ id, factory: (require) => {...} })，
 * 工厂内部为 CJS 主体，结尾挂 exports.apply / exports.inject / exports.name 并 return module.exports。
 *
 * 关键决策：
 * - external: react —— React 由 DSH 客户端模块图共享提供（官方插件同款做法）；
 * - JSX 经典转换（React.createElement），避免依赖 react/jsx-runtime 子路径解析；
 * - treeShaking: false —— 入口无 export 语句，防止把 apply/inject 摇掉（构建脚本在
 *   工厂外壳里统一引用这两个标识符）。
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

const ID = "@dsh/plugin-workspace-files";

await build({
  entryPoints: ["src/client.tsx"],
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: ["es2020"],
  nodePaths: ["/var/lib/dsh-gateway/workspaces/dsh/tools/node_modules"],
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
    js: `exports.apply = globalThis.__pluginWorkspaceFiles.apply;\nexports.inject = globalThis.__pluginWorkspaceFiles.inject;\nexports.name = "workspace-files-client";\nreturn module.exports;\n\t}\n});`
  }
});

// 记录构建指纹（与 T2 一致的轻量校验）
writeFileSync("lib/.build-info.json", JSON.stringify({ id: ID, builtAt: new Date().toISOString() }, null, 2));
console.log("built lib/client.js");

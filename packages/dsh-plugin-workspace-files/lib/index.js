/**
 * @dsh/plugin-workspace-files host 半：「空间」工作区文件浏览 API（v0.1）。
 *
 * REST 接口（全部经网关同源访问，信任边界与其余 /api 一致）：
 *   GET  /api/wf/list?sessionId=&path=      列出目录（dirs 在前，名称排序）
 *   GET  /api/wf/preview?sessionId=&path=   文本预览（≤512KB）/ 图片标记 / 二进制标记
 *   GET  /api/wf/download?sessionId=&path=  流式下载（Content-Disposition attachment）
 *   POST /api/wf/delete {sessionId, paths[]} 删除（目录递归），逐项返回结果
 *
 * 安全模型（本插件最重要的不变量）：
 *   - 工作区根由「会话记录」在服务端解析（ctx.sessions.get(sessionId).header.cwd），
 *     客户端只能传工作区内的相对路径，没有任何途径指定工作区外的绝对路径；
 *   - 每个路径经 resolve 规范化 + realpath 包含校验：拒绝绝对路径、.. 逃逸、
 *     以及指向工作区外的符号链接（悬空符号链接仅允许在工作区内被删除）。
 *
 * 零第三方运行时依赖（仅 node: 内置模块）；依赖 DSH 官方服务接口
 * webServer（路由注册）与 sessions（会话解析）。
 * @module @dsh/plugin-workspace-files
 */
import { createReadStream } from "node:fs";
import { lstat, readdir, readFile, realpath, rm, stat } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";

export const name = "workspace-files";
export const inject = ["webServer", "sessions", "workspaceRegistry"];

/** 文本预览大小上限（超出只允许下载）。 */
const PREVIEW_MAX_BYTES = 512 * 1024;

const TEXT_EXTS = new Set([
  "txt", "md", "markdown", "json", "jsonl", "yml", "yaml", "js", "mjs", "cjs",
  "ts", "tsx", "jsx", "css", "scss", "less", "html", "htm", "xml", "csv", "log",
  "ini", "conf", "env", "sh", "bash", "zsh", "py", "rb", "java", "go", "rs",
  "c", "h", "cpp", "hpp", "sql", "toml", "vue", "svelte", "gitignore", "lock", "svg"
]);

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "avif"]);

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(payload));
}

/** 业务错误：status + 稳定业务码。 */
class WfError extends Error {
  constructor(status, code, message) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

function extOf(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** 会话 → 工作区根（服务端权威解析，双通道）。 */
function workspaceRootOf(ctx, sessionId) {
  if (typeof sessionId !== "string" || sessionId === "") throw new WfError(404, "session-not-found");
  // ① 活跃会话（本进程已打开的会话）：header.cwd
  const sessions = ctx.get("sessions");
  const session = sessions?.get(sessionId);
  const cwd = session?.header?.cwd;
  if (typeof cwd === "string" && cwd !== "") return cwd;
  // ② 兜底：工作区域的持久映射（冷会话 / 重启后重新接入的会话）
  const registry = ctx.get("workspaceRegistry");
  if (registry !== undefined) {
    for (const ws of registry.list()) {
      const record = ws.record ?? ws;
      if (Array.isArray(record?.sessionIds) && record.sessionIds.includes(sessionId)) {
        const path = record?.path;
        if (typeof path === "string" && path !== "") return path;
      }
    }
  }
  throw new WfError(404, "session-not-found");
}

/**
 * 把「工作区内相对路径」解析为经校验的绝对路径。
 * @param {string} root - 工作区根（已解析）。
 * @param {string|null} relPath - 客户端给的相对路径（"." 或空 = 根）。
 * @param {{ mustExist?: boolean }} [opts] - mustExist=false 时允许悬空符号链接（删除场景）。
 */
export async function inside(root, relPath, opts = {}) {
  const mustExist = opts.mustExist !== false;
  if (typeof relPath !== "string" || relPath === "") relPath = ".";
  if (relPath.includes("\0")) throw new WfError(400, "bad-path");
  if (relPath.startsWith("/") || relPath.startsWith("\\") || /^[a-zA-Z]:/.test(relPath)) {
    throw new WfError(400, "absolute-path");
  }
  const abs = resolve(root, relPath);
  const rel = relative(root, abs);
  if (rel === ".." || rel.startsWith(`..${sep}`)) throw new WfError(400, "outside-workspace");

  const realRoot = await realpath(root);
  let realAbs;
  try {
    realAbs = await realpath(abs);
  } catch (cause) {
    // 目标不存在：仅允许「工作区内的悬空符号链接」（删除它本身是安全的）。
    if (mustExist || cause?.code !== "ENOENT") throw new WfError(404, "not-found");
    let link = false;
    try {
      link = (await lstat(abs)).isSymbolicLink();
    } catch { /* 继续走 not-found */ }
    if (!link) throw new WfError(404, "not-found");
    const parentReal = await realpath(join(abs, ".."));
    const relParent = relative(realRoot, parentReal);
    if (relParent === ".." || relParent.startsWith(`..${sep}`)) throw new WfError(403, "outside-workspace");
    return { abs, realAbs: abs, rel: rel === "" ? "." : rel };
  }
  const relReal = relative(realRoot, realAbs);
  if (relReal === ".." || relReal.startsWith(`..${sep}`)) throw new WfError(403, "outside-workspace");
  return { abs, realAbs, rel: rel === "" ? "." : rel };
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 64 * 1024) throw new WfError(413, "body-too-large");
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new WfError(400, "bad-json");
  }
}

function guard(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (res.headersSent) return void res.destroy();
      if (err instanceof WfError) return json(res, err.status, { ok: false, error: { code: err.code, message: err.message } });
      json(res, 500, { ok: false, error: { code: "internal", message: String(err?.message ?? err) } });
    }
  };
}

function downloadHeaders(name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return {
    "content-type": "application/octet-stream",
    "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "cache-control": "no-store"
  };
}

/** GET /api/wf/list */
function listHandler(ctx) {
  return guard(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://wf.local");
    const root = workspaceRootOf(ctx, u.searchParams.get("sessionId"));
    const relPath = u.searchParams.get("path");
    const { abs } = await inside(root, relPath);
    const st = await stat(abs);
    if (!st.isDirectory()) throw new WfError(400, "not-a-directory");
    const names = await readdir(abs, { withFileTypes: true });
    const entries = [];
    for (const d of names) {
      try {
        const s = await stat(join(abs, d.name));
        entries.push({
          name: d.name,
          kind: d.isDirectory() ? "dir" : "file",
          size: s.isFile() ? s.size : null,
          mtimeMs: s.mtimeMs
        });
      } catch { /* 读取竞态：跳过瞬间消失的项 */ }
    }
    entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, "zh-Hans-CN") : a.kind === "dir" ? -1 : 1));
    json(res, 200, { ok: true, path: relPath ?? ".", entries });
  });
}

/** GET /api/wf/preview */
function previewHandler(ctx, previewMaxBytes) {
  return guard(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://wf.local");
    const root = workspaceRootOf(ctx, u.searchParams.get("sessionId"));
    const { abs } = await inside(root, u.searchParams.get("path"));
    const st = await stat(abs);
    if (!st.isFile()) throw new WfError(400, "not-a-file");
    const name = basename(abs);
    const ext = extOf(name);
    const markdown = ext === "md" || ext === "markdown";
    if (TEXT_EXTS.has(ext)) {
      if (st.size > previewMaxBytes) return json(res, 200, { ok: true, kind: "text-too-large", name, size: st.size });
      const text = await readFile(abs, "utf8");
      return json(res, 200, { ok: true, kind: markdown ? "markdown" : "text", name, text, size: st.size });
    }
    if (IMAGE_EXTS.has(ext)) return json(res, 200, { ok: true, kind: "image", name, size: st.size });
    return json(res, 200, { ok: true, kind: "binary", name, size: st.size });
  });
}

/** GET /api/wf/download */
function downloadHandler(ctx) {
  return guard(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://wf.local");
    const root = workspaceRootOf(ctx, u.searchParams.get("sessionId"));
    const { abs } = await inside(root, u.searchParams.get("path"));
    const st = await stat(abs);
    if (!st.isFile()) throw new WfError(400, "not-a-file");
    res.writeHead(200, downloadHeaders(basename(abs)));
    const stream = createReadStream(abs);
    stream.on("error", () => res.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  });
}

/** POST /api/wf/delete {sessionId, paths[]} */
function deleteHandler(ctx) {
  return guard(async (req, res) => {
    const body = await readJsonBody(req);
    // sessionId 兼容两种携带方式：JSON body（客户端新写法）与 query 参数（客户端旧写法/调试）
    const u = new URL(req.url ?? "/", "http://wf.local");
    const sid = typeof body.sessionId === "string" && body.sessionId !== "" ? body.sessionId : u.searchParams.get("sessionId");
    const root = workspaceRootOf(ctx, sid);
    const paths = Array.isArray(body.paths) ? body.paths : [];
    if (paths.length === 0) return json(res, 200, { ok: true, results: [] });
    const results = [];
    for (const p of paths) {
      try {
        const { abs } = await inside(root, p, { mustExist: false });
        await rm(abs, { recursive: true });
        results.push({ path: p, ok: true });
      } catch (err) {
        results.push({ path: p, ok: false, error: { code: err instanceof WfError ? err.code : "internal" } });
      }
    }
    json(res, 200, { ok: true, results });
  });
}

export function apply(ctx, config = {}) {
  const previewMaxBytes = Number.isFinite(config?.previewMaxBytes) && config.previewMaxBytes > 0
    ? config.previewMaxBytes
    : PREVIEW_MAX_BYTES;
  const routes = [
    { kind: "exact", path: "/api/wf/list", handler: listHandler(ctx) },
    { kind: "exact", path: "/api/wf/preview", handler: previewHandler(ctx, previewMaxBytes) },
    { kind: "exact", path: "/api/wf/download", handler: downloadHandler(ctx) },
    { kind: "exact", path: "/api/wf/delete", handler: deleteHandler(ctx) }
  ];
  ctx.effect(() => {
    const disposers = routes.map((route) => ctx.webServer.register(route));
    return () => { for (const dispose of disposers) dispose?.(); };
  }, "workspace-files: /api/wf routes");
}

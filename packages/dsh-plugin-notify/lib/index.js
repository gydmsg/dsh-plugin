/**
 * @dsh/plugin-notify host 半：提供 /api/notify/config 读写（enabled 开关持久化）。
 * 「设置 → 插件 → 插件配置」的卡片由 client 半注册（settings.plugin.item 槽），
 * 开关值经本路由持久化到 DSH_HOME/plugin-notify.json；client 半启动时读取、
 * 切换时写入。全部业务逻辑（Notification API）在 client 半。
 * @module @dsh/plugin-notify
 */
import { mkdirSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const name = "notify-host";
export const inject = ["webServer"];

/** DSH_HOME 下的持久化位置（与 settings.yaml 同级）。 */
const CONFIG_PATH = fileURLToPath(new URL("../plugin-notify.json", import.meta.url));

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(payload));
}

async function loadConfig() {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return { enabled: parsed.enabled !== false };
  } catch {
    return { enabled: true }; // 缺省开启
  }
}

async function saveConfig(enabled) {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  const tmp = `${CONFIG_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify({ enabled: enabled !== false }, null, 2));
  await rename(tmp, CONFIG_PATH);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return {};
  }
}

export function apply(ctx) {
  ctx.effect(() => {
    const route = ctx.webServer.register({
      kind: "exact",
      path: "/api/notify/config",
      handler: async (req, res) => {
        if (req.method === "GET") {
          return json(res, 200, { ok: true, config: await loadConfig() });
        }
        if (req.method === "POST") {
          const body = await readJsonBody(req);
          const enabled = body.enabled !== false;
          await saveConfig(enabled);
          return json(res, 200, { ok: true, config: { enabled } });
        }
        return json(res, 405, { ok: false, error: { code: "method-not-allowed" } });
      }
    });
    return () => route?.();
  }, "notify: /api/notify/config route");
}

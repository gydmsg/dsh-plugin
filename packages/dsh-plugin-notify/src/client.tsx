/**
 * @dsh/plugin-notify client 半（源文件，经 esbuild 打包为 lib/client.js）。
 *
 * Windows 桌面通知：标准 Web Notification API（Chrome/Edge → 系统通知中心）。
 * - 开关卡片：注册到官方「设置 → 插件 → 插件配置」页（settings.plugin.item 槽），
 *   与「终端 / Agent 循环 / 网页搜索」卡片同机制；开关值经宿主 /api/notify/config 持久化。
 * - 触发事件：question/requested（需要用户回答）、turn/end（回答完成）；同类型 5 秒去重；
 *   点击通知 → 聚焦回 DSH 页面。
 * - 权限：打开开关的点击本身就是用户手势，若未授权则同步发起浏览器授权请求。
 *
 * 只依赖公开客户端接口：slots（卡片槽位）、locale、connection（信封订阅）。
 * 注意：本文件刻意不写 export 语句，由构建脚本在 ModuleLoader 外壳里挂 exports。
 */
import * as React from "react";

const { useState, useEffect, useCallback } = React;

const NS = "notify";

const zh = {
  "card.name": "桌面通知",
  "card.desc": "需要回答或回答完成时，向 Windows 通知中心发送通知。",
  "card.enabled": "启用桌面通知",
  "card.permission": "浏览器通知权限",
  "card.permitted": "浏览器通知权限",
  "card.grant": "点击授权",
  "card.hint": "浏览器权限被拒绝或未授权：点击「点击授权」并允许；若弹窗不再出现，请在地址栏左侧站点设置中手动允许「通知」后刷新页面。",
  "notify.question.title": "DSH 需要你的回答",
  "notify.done.title": "DSH 已完成回答"
};

const en = {
  "card.name": "Desktop notifications",
  "card.desc": "Send Windows notification-center toasts when DSH needs your answer or finishes.",
  "card.enabled": "Enable notifications",
  "card.permission": "Notification permission",
  "card.permitted": "Notification permission",
  "card.grant": "Grant permission",
  "card.hint": "Permission was denied or not granted: click \"Grant permission\" and allow; if the prompt no longer appears, allow \"Notifications\" manually in the site settings and refresh.",
  "notify.question.title": "DSH needs your answer",
  "notify.done.title": "DSH finished answering"
};

/** 模块级开关（由配置卡片与启动读取共同维护）。 */
let notifyEnabled = true;

/** 提取问询事件里第一问的文本（防御式）。 */
function questionText(ev) {
  try {
    const qs = ev?.data?.questions;
    const q = Array.isArray(qs) ? qs[0] : qs;
    if (typeof q === "string") return q;
    if (q && typeof q === "object") {
      for (const k of ["question", "text", "title", "content", "label"]) {
        const v = q[k];
        if (typeof v === "string" && v !== "") return v;
      }
    }
  } catch { /* 忽略 */ }
  return "";
}

function firstLine(text, max = 80) {
  const line = String(text ?? "").split("\n")[0].trim();
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

/** 「插件配置」页卡片：可展开头部 + 启用开关。 */
function NotifyCard({ t }) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(null); // null = 读取中
  const [hint, setHint] = useState(false);
  const [perm, setPerm] = useState(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );

  useEffect(() => {
    let alive = true;
    fetch("/api/notify/config")
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d?.ok) return;
        notifyEnabled = d.config.enabled;
        setEnabled(d.config.enabled);
      })
      .catch(() => { if (alive) { setEnabled(true); setHint(true); } });
    return () => { alive = false; };
  }, []);

  /** 显式授权按钮：浏览器要求用户手势，点按钮正是手势。 */
  const onGrant = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "granted") { setPerm("granted"); setHint(false); return; }
    try {
      const result = await Notification.requestPermission();
      setPerm(result);
      setHint(result !== "granted");
    } catch { setPerm("denied"); setHint(true); }
  }, []);

  const onToggle = useCallback(async () => {
    const next = !(enabled ?? true);
    setEnabled(next);
    notifyEnabled = next;
    try {
      await fetch("/api/notify/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next })
      });
    } catch { /* 持久化失败不影响本次会话状态 */ }
  }, [enabled]);

  // 官方卡片样式（与 ui-settings-plugins 的 PluginCard 逐项对齐）
  const cardStyle = {
    border: "1px solid var(--dsw-alias-border-l2)",
    background: open ? "var(--dsw-alias-bg-layer-2)" : "var(--dsw-alias-bg-layer-3)",
    borderColor: open ? "var(--dsw-alias-label-dimmed)" : undefined,
    borderRadius: 12, listStyle: "none", marginBottom: 8
  };
  const headerStyle = {
    appearance: "none", width: "100%", font: "inherit", color: "inherit", textAlign: "left",
    cursor: "pointer", background: "none", border: 0, borderRadius: 12,
    alignItems: "center", gap: 12, padding: "14px 16px", display: "flex"
  };
  const headTextStyle = { flexDirection: "column", flex: 1, gap: 4, minWidth: 0, display: "flex" };
  const nameStyle = { color: "var(--dsw-alias-label-primary)", fontSize: 15, fontWeight: 600, lineHeight: 1.4 };
  const descStyle = { color: "var(--dsw-alias-label-tertiary)", fontSize: 13, lineHeight: 1.5 };
  const chevronStyle = {
    color: "var(--dsw-alias-label-tertiary)", flex: "none",
    transition: "transform .16s", transform: open ? "rotate(180deg)" : "none"
  };
  const bodyStyle = { borderTop: "1px solid var(--dsw-alias-border-l2)", margin: "0 16px", paddingBottom: 8 };
  const rowStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 0" };
  const hintStyle = { color: "var(--dsw-alias-label-tertiary)", margin: "8px 0 4px", fontSize: 12, lineHeight: 1.5 };

  const CHEVRON_D = "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z";

  return React.createElement("li", {
    style: cardStyle,
    "aria-expanded": open
  },
    React.createElement("button", { type: "button", style: headerStyle, onClick: () => setOpen(!open) },
      React.createElement("span", { style: headTextStyle },
        React.createElement("span", { style: nameStyle }, t("card.name")),
        React.createElement("span", { style: descStyle }, t("card.desc"))
      ),
      React.createElement("svg", { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", style: chevronStyle },
        React.createElement("path", { d: CHEVRON_D, fill: "currentColor" })
      )
    ),
    open && React.createElement("div", { style: bodyStyle },
      React.createElement("label", { style: rowStyle },
        React.createElement("span", { style: { fontSize: 13 } }, t("card.enabled")),
        React.createElement("input", {
          type: "checkbox",
          checked: enabled === true,
          disabled: enabled === null,
          onChange: () => void onToggle()
        })
      ),
      React.createElement("div", { style: rowStyle },
        React.createElement("span", { style: { fontSize: 13 } },
          perm === "granted" ? t("card.permitted") : perm === "denied" ? t("card.permission") : t("card.permission")
        ),
        perm === "granted"
          ? React.createElement("span", { style: { fontSize: 13, color: "var(--dsw-alias-state-success-primary, var(--dsw-alias-label-secondary))" } }, "✓")
          : React.createElement("button", {
              type: "button",
              onClick: () => void onGrant(),
              disabled: perm === "unsupported",
              style: {
                background: "var(--dsw-alias-interactive-bg-hover)", border: "none", borderRadius: 8,
                cursor: "pointer", fontSize: 13, padding: "6px 14px",
                color: "var(--dsw-alias-label-primary)"
              }
            }, t("card.grant"))
      ),
      (hint || perm === "denied") && React.createElement("div", { style: hintStyle }, t("card.hint"))
    )
  );
}

const inject = ["slots", "locale", "connection", "conversationEvents"];

function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "notify: dictionaries");
  const t = ctx.locale.bind(NS);

  // 启动读取持久化开关（卡片也会读；这里双保险维护模块级开关）
  if (typeof window !== "undefined") {
    fetch("/api/notify/config")
      .then((r) => r.json())
      .then((d) => { if (d?.ok) notifyEnabled = d.config.enabled; })
      .catch(() => {});
  }

  // 桌面通知主体：双通道订阅。
  // ① 问询/审批 = 连接信封（envelope.payload.type，runtime pending 机制），经 connection.api.subscribeEnvelopes。
  // ② 回答完成 = 会话事件（turn/end），经官方 conversationEvents 注册（轨迹插件同机制）。
  const lastAt = new Map();
  const notify = (key, title, body) => {
    if (!notifyEnabled) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const now = Date.now();
    if (now - (lastAt.get(key) ?? 0) < 5000) return;
    lastAt.set(key, now);
    try {
      // tag 带时间戳：同 tag 会被 Windows 视为「更新」而不再弹横幅，唯一 tag 保证每次都弹
      const n = new Notification(title, { body, tag: `dsh-${key}-${Date.now()}`, icon: "/favicon.svg" });
      n.onclick = () => {
        window.focus();
        try { n.close(); } catch { /* 忽略 */ }
      };
    } catch { /* 通知失败不影响主流程 */ }
  };

  // ① 信封通道：question/requested（问询）
  ctx.effect(() => {
    const handle = ctx.connection ?? ctx.get?.("connection");
    const api = handle?.api;
    if (api === undefined || typeof api.subscribeEnvelopes !== "function") return;
    const off = api.subscribeEnvelopes((batch) => {
      if (!Array.isArray(batch)) return;
      for (const envelope of batch) {
        const frame = envelope?.payload;
        const type = frame?.type;
        if (type !== "question/requested") continue;
        const q = questionText({ data: frame });
        notify("question", t("notify.question.title"), q === "" ? "DSH 有新的问题等待回答" : firstLine(q));
      }
    });
    return off;
  }, "notify: envelopes");

  // ② 会话事件通道：turn/end（回答完成）
  const events = ctx.conversationEvents ?? ctx.get?.("conversationEvents");
  if (events !== undefined) {
    events.register({
      kind: "notify-turn-end",
      match: (event) => {
        if (event?.type !== "turn/end") return null;
        return { id: String(event.seq ?? "") };
      },
      start: () => {
        notify("done", t("notify.done.title"), "回到 DSH 查看结果");
        return {};
      }
    });
  }

  // 配置卡片（官方插件配置页）
  ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
    name: "settings.plugin.item",
    id: "notify",
    order: 30,
    locale: NS,
    inject: () => ({ t })
  }, NotifyCard));
}

globalThis.__pluginNotify = { apply, inject };

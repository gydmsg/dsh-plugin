window.__ModuleLoader__.load({
	id: "@dsh/plugin-notify",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/client.tsx
var React = __toESM(require("react"), 1);
var { useState, useEffect, useCallback } = React;
var NS = "notify";
var zh = {
  "card.name": "\u684C\u9762\u901A\u77E5",
  "card.desc": "\u9700\u8981\u56DE\u7B54\u6216\u56DE\u7B54\u5B8C\u6210\u65F6\uFF0C\u5411 Windows \u901A\u77E5\u4E2D\u5FC3\u53D1\u9001\u901A\u77E5\u3002",
  "card.enabled": "\u542F\u7528\u684C\u9762\u901A\u77E5",
  "card.permission": "\u6D4F\u89C8\u5668\u901A\u77E5\u6743\u9650",
  "card.permitted": "\u6D4F\u89C8\u5668\u901A\u77E5\u6743\u9650",
  "card.grant": "\u70B9\u51FB\u6388\u6743",
  "card.hint": "\u6D4F\u89C8\u5668\u6743\u9650\u88AB\u62D2\u7EDD\u6216\u672A\u6388\u6743\uFF1A\u70B9\u51FB\u300C\u70B9\u51FB\u6388\u6743\u300D\u5E76\u5141\u8BB8\uFF1B\u82E5\u5F39\u7A97\u4E0D\u518D\u51FA\u73B0\uFF0C\u8BF7\u5728\u5730\u5740\u680F\u5DE6\u4FA7\u7AD9\u70B9\u8BBE\u7F6E\u4E2D\u624B\u52A8\u5141\u8BB8\u300C\u901A\u77E5\u300D\u540E\u5237\u65B0\u9875\u9762\u3002",
  "notify.question.title": "DSH \u9700\u8981\u4F60\u7684\u56DE\u7B54",
  "notify.done.title": "DSH \u5DF2\u5B8C\u6210\u56DE\u7B54"
};
var en = {
  "card.name": "Desktop notifications",
  "card.desc": "Send Windows notification-center toasts when DSH needs your answer or finishes.",
  "card.enabled": "Enable notifications",
  "card.permission": "Notification permission",
  "card.permitted": "Notification permission",
  "card.grant": "Grant permission",
  "card.hint": 'Permission was denied or not granted: click "Grant permission" and allow; if the prompt no longer appears, allow "Notifications" manually in the site settings and refresh.',
  "notify.question.title": "DSH needs your answer",
  "notify.done.title": "DSH finished answering"
};
var notifyEnabled = true;
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
  } catch {
  }
  return "";
}
function firstLine(text, max = 80) {
  const line = String(text ?? "").split("\n")[0].trim();
  return line.length > max ? `${line.slice(0, max)}\u2026` : line;
}
function NotifyCard({ t }) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(null);
  const [hint, setHint] = useState(false);
  const [perm, setPerm] = useState(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );
  useEffect(() => {
    let alive = true;
    fetch("/api/notify/config").then((r) => r.json()).then((d) => {
      if (!alive || !d?.ok) return;
      notifyEnabled = d.config.enabled;
      setEnabled(d.config.enabled);
    }).catch(() => {
      if (alive) {
        setEnabled(true);
        setHint(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  const onGrant = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "granted") {
      setPerm("granted");
      setHint(false);
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPerm(result);
      setHint(result !== "granted");
    } catch {
      setPerm("denied");
      setHint(true);
    }
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
    } catch {
    }
  }, [enabled]);
  const cardStyle = {
    border: "1px solid var(--dsw-alias-border-l2)",
    background: open ? "var(--dsw-alias-bg-layer-2)" : "var(--dsw-alias-bg-layer-3)",
    borderColor: open ? "var(--dsw-alias-label-dimmed)" : void 0,
    borderRadius: 12,
    listStyle: "none",
    marginBottom: 8
  };
  const headerStyle = {
    appearance: "none",
    width: "100%",
    font: "inherit",
    color: "inherit",
    textAlign: "left",
    cursor: "pointer",
    background: "none",
    border: 0,
    borderRadius: 12,
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    display: "flex"
  };
  const headTextStyle = { flexDirection: "column", flex: 1, gap: 4, minWidth: 0, display: "flex" };
  const nameStyle = { color: "var(--dsw-alias-label-primary)", fontSize: 15, fontWeight: 600, lineHeight: 1.4 };
  const descStyle = { color: "var(--dsw-alias-label-tertiary)", fontSize: 13, lineHeight: 1.5 };
  const chevronStyle = {
    color: "var(--dsw-alias-label-tertiary)",
    flex: "none",
    transition: "transform .16s",
    transform: open ? "rotate(180deg)" : "none"
  };
  const bodyStyle = { borderTop: "1px solid var(--dsw-alias-border-l2)", margin: "0 16px", paddingBottom: 8 };
  const rowStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 0" };
  const hintStyle = { color: "var(--dsw-alias-label-tertiary)", margin: "8px 0 4px", fontSize: 12, lineHeight: 1.5 };
  const CHEVRON_D = "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z";
  return React.createElement(
    "li",
    {
      style: cardStyle,
      "aria-expanded": open
    },
    React.createElement(
      "button",
      { type: "button", style: headerStyle, onClick: () => setOpen(!open) },
      React.createElement(
        "span",
        { style: headTextStyle },
        React.createElement("span", { style: nameStyle }, t("card.name")),
        React.createElement("span", { style: descStyle }, t("card.desc"))
      ),
      React.createElement(
        "svg",
        { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", style: chevronStyle },
        React.createElement("path", { d: CHEVRON_D, fill: "currentColor" })
      )
    ),
    open && React.createElement(
      "div",
      { style: bodyStyle },
      React.createElement(
        "label",
        { style: rowStyle },
        React.createElement("span", { style: { fontSize: 13 } }, t("card.enabled")),
        React.createElement("input", {
          type: "checkbox",
          checked: enabled === true,
          disabled: enabled === null,
          onChange: () => void onToggle()
        })
      ),
      React.createElement(
        "div",
        { style: rowStyle },
        React.createElement(
          "span",
          { style: { fontSize: 13 } },
          perm === "granted" ? t("card.permitted") : perm === "denied" ? t("card.permission") : t("card.permission")
        ),
        perm === "granted" ? React.createElement("span", { style: { fontSize: 13, color: "var(--dsw-alias-state-success-primary, var(--dsw-alias-label-secondary))" } }, "\u2713") : React.createElement("button", {
          type: "button",
          onClick: () => void onGrant(),
          disabled: perm === "unsupported",
          style: {
            background: "var(--dsw-alias-interactive-bg-hover)",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 13,
            padding: "6px 14px",
            color: "var(--dsw-alias-label-primary)"
          }
        }, t("card.grant"))
      ),
      (hint || perm === "denied") && React.createElement("div", { style: hintStyle }, t("card.hint"))
    )
  );
}
var inject = ["slots", "locale", "connection", "conversationEvents"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "notify: dictionaries");
  const t = ctx.locale.bind(NS);
  if (typeof window !== "undefined") {
    fetch("/api/notify/config").then((r) => r.json()).then((d) => {
      if (d?.ok) notifyEnabled = d.config.enabled;
    }).catch(() => {
    });
  }
  const lastAt = /* @__PURE__ */ new Map();
  const notify = (key, title, body) => {
    if (!notifyEnabled) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const now = Date.now();
    if (now - (lastAt.get(key) ?? 0) < 5e3) return;
    lastAt.set(key, now);
    try {
      const n = new Notification(title, { body, tag: `dsh-${key}-${Date.now()}`, icon: "/favicon.svg" });
      n.onclick = () => {
        window.focus();
        try {
          n.close();
        } catch {
        }
      };
    } catch {
    }
  };
  ctx.effect(() => {
    const handle = ctx.connection ?? ctx.get?.("connection");
    const api = handle?.api;
    if (api === void 0 || typeof api.subscribeEnvelopes !== "function") return;
    const off = api.subscribeEnvelopes((batch) => {
      if (!Array.isArray(batch)) return;
      for (const envelope of batch) {
        const frame = envelope?.payload;
        const type = frame?.type;
        if (type !== "question/requested") continue;
        const q = questionText({ data: frame });
        notify("question", t("notify.question.title"), q === "" ? "DSH \u6709\u65B0\u7684\u95EE\u9898\u7B49\u5F85\u56DE\u7B54" : firstLine(q));
      }
    });
    return off;
  }, "notify: envelopes");
  const events = ctx.conversationEvents ?? ctx.get?.("conversationEvents");
  if (events !== void 0) {
    events.register({
      kind: "notify-turn-end",
      match: (event) => {
        if (event?.type !== "turn/end") return null;
        return { id: String(event.seq ?? "") };
      },
      start: () => {
        notify("done", t("notify.done.title"), "\u56DE\u5230 DSH \u67E5\u770B\u7ED3\u679C");
        return {};
      }
    });
  }
  ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
    name: "settings.plugin.item",
    id: "notify",
    order: 30,
    locale: NS,
    inject: () => ({ t })
  }, NotifyCard));
}
globalThis.__pluginNotify = { apply, inject };
exports.apply = globalThis.__pluginNotify.apply;
exports.inject = globalThis.__pluginNotify.inject;
exports.name = "notify-client";
return module.exports;
	}
});

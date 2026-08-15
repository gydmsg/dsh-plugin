/**
 * @dsh/plugin-workspace-files client 半（源文件，经 esbuild 打包为 lib/client.js）。
 *
 * 「空间」视图：注册到 conversation.view 槽位（order 20，轨迹右侧）。
 * 只依赖公开客户端接口：slots（槽位）、locale（字典）、React。
 * 所有文件操作经宿主 /api/wf/* REST 接口，客户端只传工作区内相对路径。
 *
 * 注意：本文件刻意不写 export 语句 —— esbuild 打包后由构建脚本在
 * ModuleLoader 工厂外壳里统一挂 exports.apply / exports.inject。
 */
import * as React from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

const { useState, useEffect, useCallback } = React;

/** Markdown 渲染：marked 解析 + DOMPurify 消毒（防文件内嵌恶意 HTML/脚本）。 */
function renderMarkdown(text) {
  try {
    const html = marked.parse(String(text ?? ""));
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  } catch {
    return String(text ?? "");
  }
}

/** 注入「空间」Markdown 预览排版样式（一次；复用 DSH 设计变量）。 */
function ensurePreviewStyles() {
  if (typeof document === "undefined" || document.getElementById("wf-md-style")) return;
  const style = document.createElement("style");
  style.id = "wf-md-style";
  style.setAttribute("data-plugin", "@dsh/plugin-workspace-files");
  style.textContent = [
    ".wf-md { font-size: 13.5px; line-height: 1.7; color: var(--dsw-alias-label-primary); word-break: break-word; }",
    ".wf-md h1,.wf-md h2,.wf-md h3,.wf-md h4 { margin: 16px 0 8px; font-weight: 600; line-height: 1.4; }",
    ".wf-md h1 { font-size: 20px; border-bottom: 1px solid var(--dsw-alias-border-l2); padding-bottom: 6px; }",
    ".wf-md h2 { font-size: 17px; }",
    ".wf-md h3 { font-size: 15px; }",
    ".wf-md p { margin: 8px 0; }",
    ".wf-md ul,.wf-md ol { margin: 8px 0; padding-left: 22px; }",
    ".wf-md li { margin: 3px 0; }",
    ".wf-md code { font-family: var(--ds-font-family-code, monospace); font-size: 12.5px; background: var(--dsw-alias-interactive-bg-hover); border-radius: 4px; padding: 1px 5px; }",
    ".wf-md pre { background: var(--dsw-alias-markdown-code-block, var(--dsw-alias-interactive-bg-hover)); border-radius: 10px; padding: 12px 14px; overflow-x: auto; margin: 10px 0; }",
    ".wf-md pre code { background: none; padding: 0; }",
    ".wf-md blockquote { margin: 10px 0; padding: 2px 12px; border-left: 3px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); }",
    ".wf-md table { border-collapse: collapse; margin: 10px 0; display: block; overflow-x: auto; }",
    ".wf-md th,.wf-md td { border: 1px solid var(--dsw-alias-border-l2); padding: 5px 10px; font-size: 12.5px; }",
    ".wf-md a { color: var(--dsw-alias-state-business-primary); text-decoration: none; }",
    ".wf-md img { max-width: 100%; border-radius: 8px; }",
    ".wf-md hr { border: none; border-top: 1px solid var(--dsw-alias-border-l2); margin: 14px 0; }"
  ].join("\n");
  document.head.appendChild(style);
}

const NS = "space";

const zh = {
  "view.space": "空间",
  "toolbar.up": "上级",
  "toolbar.refresh": "刷新",
  "toolbar.download": "下载",
  "toolbar.delete": "删除",
  "toolbar.preview": "预览",
  "toolbar.close": "关闭",
  "col.name": "名称",
  "col.size": "大小",
  "col.modified": "修改时间",
  "col.actions": "操作",
  "empty.dir": "空目录",
  "empty.noWorkspace": "当前会话没有绑定工作区",
  "loading": "加载中…",
  "error.load": "加载失败",
  "preview.tooLarge": "文件过大（{size}），不支持在线预览，请下载查看",
  "preview.binary": "此文件类型不支持预览，请下载查看",
  "confirm.delete": "确定删除「{name}」吗？",
  "confirm.delete.dir": "确定删除目录「{name}」及其全部内容吗？此操作不可恢复。",
  "deleted": "已删除",
  "delete.failed": "删除失败"
};

const en = {
  "view.space": "Space",
  "toolbar.up": "Up",
  "toolbar.refresh": "Refresh",
  "toolbar.download": "Download",
  "toolbar.delete": "Delete",
  "toolbar.preview": "Preview",
  "toolbar.close": "Close",
  "col.name": "Name",
  "col.size": "Size",
  "col.modified": "Modified",
  "col.actions": "Actions",
  "empty.dir": "Empty directory",
  "empty.noWorkspace": "No workspace bound to this session",
  "loading": "Loading…",
  "error.load": "Failed to load",
  "preview.tooLarge": "File too large ({size}) for inline preview — download instead",
  "preview.binary": "Preview not available for this type — download instead",
  "confirm.delete": "Delete \"{name}\"?",
  "confirm.delete.dir": "Delete folder \"{name}\" and everything inside? This cannot be undone.",
  "deleted": "Deleted",
  "delete.failed": "Delete failed"
};

/** 宿主 REST 接口封装：只传工作区内相对路径。 */
function wfUrl(sessionId, op, relPath) {
  const u = new URL(`/api/wf/${op}`, window.location.origin);
  u.searchParams.set("sessionId", String(sessionId ?? ""));
  if (relPath !== undefined) u.searchParams.set("path", relPath);
  return u.toString();
}

async function wfJson(url, init) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const code = data?.error?.code ?? `http-${res.status}`;
    throw new Error(code);
  }
  return data;
}

function fmtSize(n) {
  if (n === null || n === undefined) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n;
  let i = -1;
  do { v /= 1024; i++; } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(1)} ${units[i]}`;
}

function fmtTime(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function joinPath(dir, name) {
  return dir === "." ? name : `${dir}/${name}`;
}

const ICONS = { dir: "📁", file: "📄", image: "🖼️" };

const styles = {
  root: {
    // flex:1 填满父面板（viewArea 是 flex 列），高度确定 → 内部滚动可靠
    display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0,
    position: "relative", overflow: "hidden",
    background: "var(--dsw-alias-bg-base)", color: "var(--dsw-alias-label-primary)"
  },
  toolbar: {
    display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
    borderBottom: "1px solid var(--dsw-alias-border-l2)", flex: "none"
  },
  toolBtn: {
    background: "none", border: "none", borderRadius: 8, cursor: "pointer",
    color: "var(--dsw-alias-label-secondary)", fontSize: 13, padding: "4px 10px"
  },
  crumbs: {
    display: "flex", alignItems: "center", gap: 2, fontSize: 13, minWidth: 0,
    overflow: "hidden", color: "var(--dsw-alias-label-tertiary)", whiteSpace: "nowrap"
  },
  crumb: {
    background: "none", border: "none", cursor: "pointer", padding: "4px 6px",
    borderRadius: 6, color: "inherit", fontSize: 13
  },
  crumbCurrent: { color: "var(--dsw-alias-label-primary)", fontWeight: 500 },
  listWrap: { flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 8px 48px" },
  rowHead: {
    display: "grid", gridTemplateColumns: "minmax(0,1fr) 90px 150px 150px",
    gap: 8, padding: "6px 10px", fontSize: 12,
    color: "var(--dsw-alias-label-tertiary)", borderBottom: "1px solid var(--dsw-alias-border-l2)"
  },
  row: {
    display: "grid", gridTemplateColumns: "minmax(0,1fr) 90px 150px 150px",
    gap: 8, alignItems: "center", padding: "6px 10px", borderRadius: 8,
    cursor: "pointer", fontSize: 13
  },
  rowHover: { background: "var(--dsw-alias-interactive-bg-hover)" },
  name: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 },
  nameText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  muted: { color: "var(--dsw-alias-label-tertiary)", fontSize: 12 },
  actions: { display: "flex", gap: 4, justifyContent: "flex-end" },
  actBtn: {
    background: "none", border: "none", borderRadius: 6, cursor: "pointer",
    fontSize: 12, padding: "3px 8px", color: "var(--dsw-alias-label-secondary)"
  },
  actBtnDanger: { color: "var(--dsw-alias-state-error-primary)" },
  center: { display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--dsw-alias-label-tertiary)", fontSize: 13 },
  previewPanel: {
    width: "42%", minWidth: 280, maxWidth: 560, minHeight: 0, maxHeight: "100%",
    borderLeft: "1px solid var(--dsw-alias-border-l2)",
    display: "flex", flexDirection: "column", background: "var(--dsw-alias-bg-base)"
  },
  previewHead: {
    display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
    borderBottom: "1px solid var(--dsw-alias-border-l2)", flex: "none"
  },
  previewTitle: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: 500 },
  previewBody: { flex: 1, minHeight: 0, overflow: "auto", padding: "12px 12px 48px" },
  pre: {
    margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word",
    fontFamily: "var(--ds-font-family-code, monospace)", fontSize: 12.5, lineHeight: "20px"
  },
  img: { maxWidth: "100%", borderRadius: 8 }
};

function SpaceView({ sessionId, t }) {
  const [dir, setDir] = useState(".");
  const [entries, setEntries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(null);

  const load = useCallback(async (target) => {
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const data = await wfJson(wfUrl(sessionId, "list", target));
      setEntries(data.entries ?? []);
      setDir(data.path ?? target);
    } catch (err) {
      setError(String(err?.message ?? err));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) void load(".");
  }, [sessionId, load]);

  const openEntry = async (entry) => {
    const rel = joinPath(dir, entry.name);
    if (entry.kind === "dir") return void load(rel);
    try {
      const data = await wfJson(wfUrl(sessionId, "preview", rel));
      if (data.kind === "text" || data.kind === "markdown" || data.kind === "image") {
        setPreview({ ...data, rel });
      } else {
        window.location.assign(wfUrl(sessionId, "download", rel));
      }
    } catch {
      window.location.assign(wfUrl(sessionId, "download", rel));
    }
  };

  const doDelete = async (entry, event) => {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    const msg = entry.kind === "dir"
      ? t("confirm.delete.dir", { name: entry.name })
      : t("confirm.delete", { name: entry.name });
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      await wfJson(wfUrl(sessionId, "delete"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, paths: [joinPath(dir, entry.name)] })
      });
      await load(dir);
    } catch {
      window.alert(t("delete.failed"));
    } finally {
      setBusy(false);
    }
  };

  const download = (rel, event) => {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    window.location.assign(wfUrl(sessionId, "download", rel));
  };

  const crumbs = dir === "." ? [] : dir.split("/");
  const rootLabel = "工作区";

  const rowHoverStyle = (name) => (hover === name ? { ...styles.row, ...styles.rowHover } : styles.row);

  return React.createElement("div", { style: styles.root },
    React.createElement("div", { style: styles.toolbar },
      React.createElement("button", { style: styles.toolBtn, title: t("toolbar.up"), disabled: dir === "." || loading,
        onClick: () => { const parts = dir === "." ? [] : dir.split("/"); parts.pop(); load(parts.length === 0 ? "." : parts.join("/")); } }, "↑"),
      React.createElement("button", { style: styles.toolBtn, title: t("toolbar.refresh"), disabled: loading,
        onClick: () => load(dir) }, "⟳"),
      React.createElement("span", { style: { ...styles.muted, marginLeft: "auto", flex: "none" } },
        entries === null ? "" : `${entries.length} 项`),
      React.createElement("div", { style: styles.crumbs },
        React.createElement("button", { style: { ...styles.crumb, ...(dir === "." ? styles.crumbCurrent : {}) },
          onClick: () => load(".") }, rootLabel),
        crumbs.map((seg, i) => {
          const target = crumbs.slice(0, i + 1).join("/");
          const isLast = i === crumbs.length - 1;
          return React.createElement(React.Fragment, { key: target },
            React.createElement("span", { style: styles.muted }, "/"),
            React.createElement("button", {
              style: { ...styles.crumb, ...(isLast ? styles.crumbCurrent : {}) },
              onClick: () => load(target)
            }, seg));
        })
      )
    ),
    React.createElement("div", { style: { display: "flex", flex: 1, minHeight: 0 } },
      React.createElement("div", { style: { flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" } },
        React.createElement("div", { style: styles.rowHead },
          React.createElement("span", null, t("col.name")),
          React.createElement("span", null, t("col.size")),
          React.createElement("span", null, t("col.modified")),
          React.createElement("span", null, t("col.actions"))
        ),
        React.createElement("div", { style: styles.listWrap, onMouseLeave: () => setHover(null) },
          !sessionId ? React.createElement("div", { style: styles.center }, t("empty.noWorkspace"))
          : loading && entries === null ? React.createElement("div", { style: styles.center }, t("loading"))
          : error ? React.createElement("div", { style: styles.center }, `${t("error.load")}: ${error}`)
          : entries.length === 0 ? React.createElement("div", { style: styles.center }, t("empty.dir"))
          : entries.map((entry) => {
              const isImage = entry.kind === "file" && /\.(png|jpe?g|gif|webp|ico|bmp|avif|svg)$/i.test(entry.name);
              const icon = entry.kind === "dir" ? ICONS.dir : isImage ? ICONS.image : ICONS.file;
              return React.createElement("div", {
                key: entry.name,
                style: rowHoverStyle(entry.name),
                onMouseEnter: () => setHover(entry.name),
                onClick: () => openEntry(entry)
              },
                React.createElement("div", { style: styles.name },
                  React.createElement("span", null, icon),
                  React.createElement("span", { style: styles.nameText, title: entry.name }, entry.name)
                ),
                React.createElement("span", { style: styles.muted }, fmtSize(entry.size)),
                React.createElement("span", { style: styles.muted }, fmtTime(entry.mtimeMs)),
                React.createElement("div", { style: styles.actions },
                  entry.kind === "file" && React.createElement("button", {
                    style: styles.actBtn,
                    onClick: (e) => { e.stopPropagation(); openEntry(entry); }
                  }, t("toolbar.preview")),
                  entry.kind === "file" && React.createElement("button", {
                    style: styles.actBtn,
                    onClick: (e) => download(joinPath(dir, entry.name), e)
                  }, t("toolbar.download")),
                  React.createElement("button", {
                    style: { ...styles.actBtn, ...styles.actBtnDanger },
                    disabled: busy,
                    onClick: (e) => doDelete(entry, e)
                  }, t("toolbar.delete"))
                )
              );
            })
        )
      ),
      preview !== null && React.createElement("div", { style: styles.previewPanel },
        React.createElement("div", { style: styles.previewHead },
          React.createElement("span", { style: styles.previewTitle }, preview.name),
          React.createElement("button", { style: styles.actBtn, onClick: (e) => download(preview.rel, e) }, t("toolbar.download")),
          React.createElement("button", { style: styles.actBtn, onClick: () => setPreview(null) }, t("toolbar.close"))
        ),
        React.createElement("div", { style: styles.previewBody },
          preview.kind === "markdown"
            ? React.createElement("div", {
                className: "wf-md",
                dangerouslySetInnerHTML: { __html: renderMarkdown(preview.text) }
              })
            : preview.kind === "text"
              ? React.createElement("pre", { style: styles.pre }, preview.text)
              : React.createElement("img", { style: styles.img, src: wfUrl(sessionId, "download", preview.rel), alt: preview.name })
        )
      ),
      // 底部虚化渐变（与对话/轨迹一致的视觉语言）：提示内容向下延伸且滚动条直达面板底部
      React.createElement("div", {
        style: {
          position: "absolute", left: 0, right: 0, bottom: 0, height: 44, zIndex: 3,
          pointerEvents: "none",
          background: "linear-gradient(180deg, transparent 0%, var(--dsw-alias-bg-base) 100%)"
        }
      })
    )
  );
}

const inject = ["slots", "locale"];

function apply(ctx) {
  ensurePreviewStyles();
  // 字典注册（locale 服务）
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "workspace-files: dictionaries");
  const t = ctx.locale.bind(NS);

  // 槽位注册：conversation.view（与轨迹同机制，order 20 排在轨迹右侧）
  ctx.slots.inject("conversation.view", () => ctx.slots.register({
    name: "conversation.view",
    id: "workspace",
    order: 20,
    locale: NS,
    label: () => t("view.space"),
    inject: (sessionId) => ({ sessionId, t })
  }, SpaceView));
}

// 保活引用：防止打包器把无 export 的 apply/inject 摇掉；构建脚本依赖这两个标识符。
globalThis.__pluginWorkspaceFiles = { apply, inject, SpaceView };

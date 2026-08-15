# dsh-plugin —— DeepSeek Harness (DSH) 树外插件集合库

> 一个仓库收纳**所有开发完成、可发布的 DSH Web UI 树外双面插件**。
> 全部为零侵入插件（host 半 + client 半），可安装进任意 DSH profile，不修改 DSH 源码。
> 兼容 DSH **0.1.0-rc.6**（本库插件均在其上开发并验收通过）。

## 📦 插件目录（点击跳转，可单独取用）

| 插件 | 目录 | 一句话介绍 |
|---|---|---|
| **「空间」工作区文件管理器** | [`packages/dsh-plugin-workspace-files/`](./packages/dsh-plugin-workspace-files) | 轨迹旁新增「空间」tab：浏览/预览（.md 排版）/下载/删除当前会话工作区文件，服务端强制安全边界 |
| **Windows 桌面通知** | [`packages/dsh-plugin-notify/`](./packages/dsh-plugin-notify) | 需要回答/回答完成时向 Windows 通知中心弹通知；官方插件配置卡片开关 |

> 每个插件目录内都有独立的 `README.md`（功能 / API / 安装 / 配置 / 开发 / 路线图），单独下载某个插件只需取对应目录。

## 🚀 安装（任意 DSH 部署通用）

以两个插件都装为例：

1. 把插件目录放入目标 profile 的 `node_modules/@dsh/` 下
2. 在 profile `package.json` 的 `dsh.profile.bundles` 中追加包名（`@deepseek-ai/dsh-web-app` 之后）：

```jsonc
"dsh": { "profile": { "bundles": [
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "@dsh/plugin-workspace-files",
  "@dsh/plugin-notify"
] } }
```

3. 重启 `dsh-web`；验证 `dsh --profile web --dump-config` 看到插件行且无警告
4. 浏览器硬刷新验收

## 🧱 插件结构与开发约定

- **双面插件**：host 半 `lib/index.js`（纯 Node 内置模块，零第三方运行时依赖）+ client 半 `lib/client.js`（`window.__ModuleLoader__.load` 官方格式，构建源 `src/*.tsx`）
- 宿主扩展面：`ctx.webServer.register`（REST 路由）、`ctx.sessions` / `ctx.workspaceRegistry`（会话→工作区根解析）
- 客户端扩展面：`ctx.slots`（tab 槽 `conversation.view`、配置卡片槽 `settings.plugin.item`）、`ctx.locale`、`ctx.connection.api.subscribeEnvelopes`、`ctx.conversationEvents`
- 构建：`npm i esbuild && node build.mjs`
- **踩坑（务必遵守）**：构建 footer 导出必须经 `globalThis.__pluginXxx` 锚点——直接引用裸 `apply` 会被第三方库（如 marked）非严格模式的同名变量污染，导致「Function.prototype.apply was called on [object Object]」
- 安全类插件（文件操作）的边界逻辑集中在 host 半并配套 `node --test` 测试

## 🧪 测试

```sh
cd packages/dsh-plugin-workspace-files && node --test test/*.test.mjs   # 9 项安全边界测试
```

## 📦 npm 发布（路线图，未实施）

目标形态：`dsh plugin --profile web add @dsh/plugin-workspace-files` 一键安装。
计划：为每个包补齐 `dsh.bundle` 声明与版本发布流水线（npm publish）后，走 DSH 官方
`dsh plugin add` 通道安装；在此之前请按上文「安装」方式手工放入 profile。

## 🗺 路线图

- 空间 v0.2：重命名/新建文件夹/多选/Ctrl+C/V/X/Delete 快捷键
- 空间 v0.3：拖拽移动、「…」菜单、系统拖入上传
- 通知 v0.2：后台任务/子代理/目标完成事件、去重、设置开关
- 打磨：目录树/排序/搜索/zip；通知 action 按钮/免打扰

## License

MIT

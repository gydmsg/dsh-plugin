# @dsh/plugin-notify —— Windows 桌面通知

> DeepSeek Harness (DSH) Web UI 树外双面插件：DSH **需要你回答**或**回答完成**时，
> 向 Windows 通知中心发送通知（W3C Web Notification API，Chrome/Edge）。
> 零侵入，兼容 DSH 0.1.0-rc.6。

## 功能（v0.1）

- 触发事件：`question/requested`（需要你回答，含问题摘要）与 `turn/end`（回答完成）
- **官方「设置 → 插件 → 插件配置」卡片**（与官方卡片同款样式）：启用开关 + 「点击授权」按钮 + 权限状态提示
- 开关持久化（`DSH_HOME/plugin-notify.json`，缺省开启）；5 秒防轰炸；**唯一 tag 保证每次弹横幅**；点击通知聚焦回 DSH
- 双通道事件订阅（两种事件机制不同，缺一不可）：
  - 问询 = 连接信封：`ctx.connection.api.subscribeEnvelopes`，帧在 `envelope.payload.type`
  - 回答完成 = 会话事件：`ctx.conversationEvents.register`（官方注册表，轨迹插件同机制）

## 安装

1. 把本包目录放入目标 profile 的 `node_modules/@dsh/` 下
2. profile `package.json` 的 `dsh.profile.bundles` 追加 `"@dsh/plugin-notify"`
3. 重启 `dsh-web`；`dsh --profile web --dump-config` 应看到插件行且无警告
4. 硬刷新 → 设置 → 插件 → 插件配置 → 展开「桌面通知」→ 点「点击授权」→ 允许

## 宿主 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/notify/config` | 读取开关（缺省 `{enabled:true}`） |
| POST | `/api/notify/config` `{enabled}` | 持久化开关（原子写 `plugin-notify.json`） |

## 限制与说明

- 依赖浏览器能力：仅桌面版 Chrome/Edge 支持系统通知；iPad/iPhone Safari 会显示卡片但无法弹通知（苹果平台限制，非本插件问题）
- 浏览器需处于运行状态（DSH 页面可在后台标签）；完全关闭浏览器时无法发送——若要突破需原生 Windows 程序（远期可另立项）

## 开发

- 宿主半 `lib/index.js`：仅 node 内置模块（配置读写路由）
- 客户端半 `src/client.tsx`：React + 官方接口（`slots` 配置卡片 / `locale` / `connection` / `conversationEvents`）
- 构建：`npm i esbuild && node build.mjs`；**导出经 `globalThis.__pluginNotify` 锚点**（防同名变量污染，见根 README 踩坑）

## 路线图

- v0.2：后台任务 / 子代理 / 目标完成事件、通知合并去重、更多设置项
- v0.3：通知 action 按钮、免打扰时段

## License

MIT（见仓库根目录 LICENSE）

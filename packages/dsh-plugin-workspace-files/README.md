# @dsh/plugin-workspace-files ——「空间」工作区文件管理器

> DeepSeek Harness (DSH) Web UI 树外双面插件：在主界面「轨迹」旁新增「空间」tab，
> 浏览与操作**当前会话工作区**的文件。零侵入（不修改 DSH 源码），兼容 DSH 0.1.0-rc.6。

## 功能（v0.1）

- 面包屑导航、目录列表（图标 / 名称 / 大小 / 修改时间）、目录进入 / 上级 / 刷新、「N 项」计数
- 文本（≤512KB）与图片在线预览；**Markdown 网页排版渲染**（marked + DOMPurify 防 XSS）
- 流式下载（`Content-Disposition: attachment`，中文文件名安全编码）
- 删除：文件 / 目录（递归），操作前确认框
- 面板占满可用高度、列表与预览独立滚动、底部渐变（与官方视图一致的视觉语言）

## 安全模型（本插件最重要的设计）

- 工作区根由**服务端**按会话解析（`ctx.sessions` 优先 → `ctx.workspaceRegistry` 持久映射兜底，冷会话可用），客户端永远只能传**工作区内相对路径**
- 每个路径经 `resolve` 规范化 + `realpath` 包含校验：绝对路径、`..` 逃逸、指向工作区外的符号链接**全部拒绝**；悬空符号链接仅允许在工作区内被删除
- 边界逻辑集中在 `lib/index.js` 的 `inside()`（已导出，配套 9 项安全测试，`node --test test/*.test.mjs`）

## 宿主 API（REST，经认证网关同源访问）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/wf/list?sessionId=&path=` | 列目录（dirs 在前、名称排序） |
| GET | `/api/wf/preview?sessionId=&path=` | 文本（>512KB 拒绝并提示下载）/ 图片 / 二进制标记 |
| GET | `/api/wf/download?sessionId=&path=` | 流式下载 |
| POST | `/api/wf/delete` `{sessionId, paths[]}` | 删除（目录递归），逐项返回结果 |

错误均为 JSON：`{ok:false, error:{code,message}}`；业务码含 `session-not-found` / `outside-workspace` / `absolute-path` / `not-found`。

## 安装

1. 把本包目录放入目标 profile 的 `node_modules/@dsh/` 下
2. profile `package.json` 的 `dsh.profile.bundles` 追加 `"@dsh/plugin-workspace-files"`
3. 重启 `dsh-web`；`dsh --profile web --dump-config` 应看到插件行且无警告
4. 浏览器硬刷新后，「空间」tab 出现在「轨迹」右侧

## 配置

本插件 v0.1 无可配置项（预览上限等参数在 `lib/index.js` 常量区，v0.2 会迁入插件 config）。

## 开发

- 宿主半 `lib/index.js`：纯 Node 内置模块，零第三方运行时依赖
- 客户端半 `src/client.tsx`：React（模块图共享）+ 官方接口（`slots` / `locale`）
- 构建：`npm i esbuild && node build.mjs` → 产物 `lib/client.js`（`window.__ModuleLoader__.load` 官方格式）
- **导出必须经 `globalThis.__pluginWorkspaceFiles` 锚点**——直接引用裸 `apply` 会被 marked 等库的非严格模式同名变量污染（历史踩坑）

## 路线图

- v0.2：重命名、新建文件夹、多选（Ctrl/Shift/Ctrl+A）、Ctrl+C/V/X/Delete 快捷键（API rename/mkdir/move/copy）
- v0.3：拖拽移动、「…」菜单、系统拖入上传
- v0.4：目录树、排序/搜索、批量下载 zip

## License

MIT（见仓库根目录 LICENSE）

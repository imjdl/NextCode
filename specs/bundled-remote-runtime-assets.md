# Spec：远程 workspace 使用随包本地资源（不依赖官方 CDN）

## 背景

连接 SSH/WSL 远程 workspace 时，桌面端需要把「远端运行时资源」上传到远端：
`server-bundle`、`node-runtime`、`node-pty`、`glm`、`bfs`、`ripgrep`、`ugrep`。

现状（`packages/server/src/remote/`）：
- 资源清单与制品默认从官方 CDN 取：`https://cdn-zcode.z.ai/zcode/electron/releases/<版本>/manifest-<platform>-<arch>.json`。
- 若存在本地 `mockCdnDir`（`<dir>/releases/<版本>/`）且**该平台的组件文件齐全**，则直接用本地文件部署，不下载（`deploy.ts` 的 `getReleaseDir`）。
- `mockCdnDir` 只在开发态解析到仓库内 `packages/desktop/mock-cdn`；**打包态没有这个目录**，于是只能走 CDN。

定制版必然失败：官方 CDN 只有官方发布过的版本（如 3.16.0），我们自增到 3.16.2 后
`manifest-linux-x64.json` 在 CDN 上不存在 → `manifest not found for linux-x64`，远程连接无法建立。

**目标**：把远端运行时资源随安装包分发，打包态按"本地优先"使用；这样连接远程不再依赖互联网，也不再受官方 CDN 是否有该版本影响。

## 行为规则

1. **打包态资源根**：`process.resourcesPath/remote-assets` 作为 mock CDN 根（布局与仓库 `mock-cdn` 一致：`releases/<version>/manifest-<platform>-<arch>.json` + 各组件目录）。开发态继续用仓库内 `packages/desktop/mock-cdn`。
2. **随包平台范围**：默认只打包 `linux-x64`（SSH/WSL 常见目标；每平台约 158MB 未压缩，含 116MB Node 运行时）。可通过环境变量 `ZCODE_BUNDLED_REMOTE_PLATFORMS`（逗号分隔，如 `linux-x64,linux-arm64`）扩展。
3. **完整性判定沿用既有逻辑**：组件不齐时仍回退 CDN/cache（例如连的是未打包的平台）——这是既有语义，不新增兜底分支。用户侧表现为该平台仍需要 CDN（而定制版 CDN 上大概率没有，因此文档要写明"只支持随包平台"）。
4. **不改协议、不改远端部署算法**；只改变"本地资源从哪来"。

## 状态所有者与边界

- 资源内容来源：`mock-cdn`（由 `prepare:remote-assets` 准备）→ 打包脚本裁剪 → `resources/remote-assets` → electron-builder `extraResources` → `resourcesPath/remote-assets`。
- 解析所有者：`desktopRuntimeEnv.ts` 的 `resolveAvailableDevelopmentMockCdnDir()`（唯一决定传给 Host/远程链路的值）。
- 版本一致性：资源目录按 `ZCODE_VERSION` 命名，与 CDN 路径同源；版本号改动后必须重跑 prepare 才能产出对应目录。

## 验收场景

1. 打包产物内存在 `resources/remote-assets/releases/<version>/manifest-linux-x64.json` 与 `server/`、`node/linux-x64/`、`node-pty/linux-x64/`、`glm/linux-x64/`、`tools/linux-x64/`。
2. 打包应用连接 linux-x64 远程：日志出现 `mockCdnDir: <resources>/remote-assets` 且**不出现** CDN 下载；部署成功。
3. 开发态（仓库内运行）行为不变：仍用 `packages/desktop/mock-cdn`。
4. 连接未打包平台（如 darwin-arm64）：按既有语义回退 CDN，并在日志给出 `mock-cdn incomplete` 警告（明确可诊断，不静默失败）。
5. 安装包体积增量 ≈ 该平台资源压缩后大小（需在 BUILD.md 记录实际值）。

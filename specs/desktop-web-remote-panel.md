# Spec：桌面端内置 Web 远控面板（手机扫码访问）

## 背景与目标

局域网 Web 访问已验证可用（`packages/server` 提供 HTTP + `/ws` 通道、token 鉴权、静态托管 Web 产物），但需要手工起进程、手工拼 URL、手工生成二维码。本功能把它做进桌面应用：

用户名旁手机图标 → 控制面板 → 一键开启 Web 服务 → 展示二维码 → 手机扫码访问；并允许指定内网 IP。

## 行为规则

1. **入口**：桌面端（`isDesktop`）在侧栏 footer 用户名旁显示手机图标按钮，点击打开控制面板；Web/手机端不显示（没有可管理的本地服务）。
2. **控制面板**：
   - 开关：开启/关闭 Web 服务（关闭即终止子进程）。
   - IP 选择：列出本机 IPv4（标注虚拟网卡），默认选第一张非虚拟网卡；提供"所有网卡(0.0.0.0)"选项。
   - 端口：默认 3030，开启前可改；端口被占用时给出明确错误，不启动。
   - 开启后展示：二维码（内容为带 token 的 URL）、URL 文本、token、"复制链接"按钮。
   - 风险提示：该链接等于本机全权访问（可读写文件、执行命令），仅限可信局域网，用完关闭。
3. **鉴权**：每次开启生成新的随机 token（`crypto.randomBytes(24).toString("base64url")`）；服务端以 `authRequired` + token 保护 `/ws*` 与 `/api/*`（与 `packages/server` 既有实现一致）。
4. **服务进程**：以 `electron.utilityProcess.fork` 运行桌面构建产物中的 web-remote 入口（`out/web-remote/server.js`），独立于 main 与 Host，退出/崩溃只影响该服务；关闭面板不停止服务，只有关闭开关才停止。
5. **静态资源**：服务托管 Web 产物。解析顺序：`ZCODE_WEB_REMOTE_STATIC_ROOT` 环境变量 → 打包态 `resources/web-remote-web` → 开发态仓库内 `packages/web/dist`。全部缺失时面板显示明确错误（提示先构建 Web 产物）。
6. **状态**：服务状态（running/host/port/token/url/错误）由 main 持有；renderer 通过 `executeDesktopCommand` 读取与操作，不新增 renderer store 事实源。

## 状态所有者与事件顺序

- 服务生命周期唯一所有者：main 的 `webRemoteControl` 模块（fork/kill + 状态），子进程只负责监听与托管。
- renderer 只调用命令并展示结果；面板内的临时选择（IP/端口）是 UI 局部草稿，不落盘。
- 事件顺序：`start` → 校验端口可用 → fork 子进程（带 PORT/HOST/TOKEN/STATIC_ROOT 环境变量）→ 子进程监听成功后回发 ready → main 置 running 并把 url 返回给 renderer。子进程 exit（无论原因）→ main 置 stopped 并记录 lastError。

## 已知取舍（记录在案）

- 该服务在**独立运行时**里跑（与"手机远控 attach 桌面已有 Host"的上游设计不同）：手机侧拥有自己的一套 local services，与桌面窗口共享 `~/.zcode` 数据（任务/会话可读）。把它改成 attach 桌面 Host 需要移植上游的 attachment/owner-lease 链路，属于后续工作。
- 不启用任何外网 relay/隧道：只监听用户选择的局域网地址。

## 验收场景

1. 桌面端打开面板 → 默认 IP 为真实内网网卡 → 点开启 → 出现二维码与 URL；手机扫码能打开并正常使用（同一局域网）。
2. 端口被占用时开启：面板显示错误且状态保持 stopped。
3. 关闭开关：子进程退出、`3030` 端口释放、二维码收起。
4. Web/手机端（非 desktop）：用户名旁不出现该图标。
5. 桌面窗口在宽视口下的既有布局与交互不受影响。

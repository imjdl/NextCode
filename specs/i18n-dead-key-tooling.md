# Spec：i18n 死键检查与可证明安全的清理

## 目标

`packages/ui` 的文案表（zh-CN / en-US 各 5500+ 键）长期只增不减：功能删除后文案残留，
既误导阅读者与 AI 判断"能力是否还在"，也让后续新增语言白做翻译。本任务提供
（一）可复用的死键检查工具，（二）一次只删除**可证明安全**的死键。

## 为什么不能"未使用就删"

1. **id 没有类型保护**：`IntlProvider.tsx` 里 `formatMessage(descriptor: { id: string })`，
   locale 是 `Record<string, string>`，`messages[id] ?? id`。删掉仍在使用的键
   **不会**让 `pnpm typecheck` 失败，只会在运行时把键名原样显示。因此 typecheck 不能作为删除依据。
2. **动态拼键无法穷举**：代码里存在 `` id: `prefix.${x}` ``、`"prefix." + x` 之类写法，
   静态"没搜到键字面量"不等于"没被使用"。

## 判定规则（工具实现）

采集：只扫 `packages/ apps/ scripts/ config/` 下的源码文件，
按目录名剪枝（`node_modules`/`dist`/`bundled-agents`/`resources`/`mock-cdn` 等），
**不跟随符号链接**（`node_modules/@zcode/ui` 是指向 `packages/ui` 的链接，跟进会把 locale
文件当成"引用来源"，让结果恒为 0 死键），并排除 locale 文件自身与检查脚本自身。

判定按**家族**（点分前缀）而非单键：

- `mentioned`：源码里存在等于该前缀或以 `前缀.` 开头的 token ⇒ 子树被引用。
- `dynamicPrefix`：该前缀自身是动态拼键前缀。
- `dynamicAncestor`：存在更浅的动态前缀 P 使 `前缀.startsWith(P + ".")` ⇒ 可能被拼出来。
- `safe`：以上三条都不成立 ⇒ 动态拼键必须把前缀写成文本，"前缀从未出现"即可证明该
  子树无法被构造，**整族可删**。

报告的 `deletable` 仅包含最小 `safe` 家族下的键。其余未使用键归入 `blockedFamilies`
（只报告不删），例如 `settings.modelProvider.codingPlan.purchase` 家族里既有已删除功能的
残留键，也有仍在使用的 `purchase.individualsSectionTitle`，因此整族被正确挡住。

## 工具与用法

| 命令                                             | 作用                                       |
| ------------------------------------------------ | ------------------------------------------ |
| `pnpm i18n:dead-keys`                            | 报告：键总数、可删家族、被挡家族、双语一致性 |
| `pnpm i18n:dead-keys -- --json`                  | 机器可读输出                               |
| `pnpm i18n:dead-keys -- --why <key>`             | 单键诊断：命中文件、各祖先家族判定         |
| `pnpm i18n:dead-keys -- --self-test`             | 自检采集与判定逻辑（结构性断言）           |
| `pnpm i18n:prune-dead-keys`                      | 删除的 **dry-run**（打印将删数量）         |
| `pnpm i18n:prune-dead-keys -- --write`           | 实际删除（只删 `deletable`）               |

## 本次清理结果

- 删除：两个语言文件各 **410 个键**（93 个最小安全家族，纯删除 920 行），
  如 `chat.promptEnhance.*`（上游增强功能 UI 已不存在）、`carousel.*`、`debugInfo.*`、
  `automations.form.*`、`chat.planUsage.*` 等。
- 复验：用 ripgrep 对抽验家族独立确认无源码引用（`carousel` 唯一命中是
  `packages/ui/package.json` 的依赖名 `embla-carousel`）。
- 删除后 `deletable` 归零（幂等），`pnpm typecheck`、`pnpm lint` 通过。
- 保留：1730+ 个"未使用但被挡住"的键不删——其家族仍在源码中被引用，需人工逐个确认。

## 已知遗留

- `en-US` 有 1 个键 `settings.memory.viewer.disabled` 在 `zh-CN` 缺失（工具会报键集不一致）。
  该键当前无人使用，故未补翻译；后续若启用该状态需先补齐中文。
- 检查脚本自身列入排除项：脚本内的键名字面量不得算作"引用"。

## 验收场景

1. `pnpm i18n:dead-keys -- --self-test` 通过，且"可删集合"里不含任何仍被引用的键（反向断言）。
2. `pnpm i18n:dead-keys` 同时报告双语键集一致性。
3. `pnpm i18n:prune-dead-keys` 为 dry-run；加 `--write` 后键数减少量等于判定量，否则中止并报错。
4. 清理后 `pnpm typecheck`、`pnpm lint`、`pnpm architecture:check --changed` 通过。

#!/usr/bin/env node

/**
 * i18n 死键检查：列出在 locale 文件里定义、但源码中从未以字面量使用的文案键。
 *
 * 背景：zh-CN/en-US 各 5500+ 个键，没有校验机制；功能删除后文案容易残留。
 * 死键会误导阅读者与 AI 判断"能力是否还在"，也会让新语言翻译白做。
 *
 * 为什么需要两级判定：intl 的 id 类型是普通 string（`formatMessage({ id: string })`，
 * locale 是 Record<string, string>），删掉仍在使用的键不会让 typecheck 失败，
 * 只会在运行时把键名原样显示出来。而动态拼键（`id: \`prefix.${x}\``）无法静态穷举。
 * 因此本脚本把候选分为两类：
 *   - 严格死键：键的根前缀（前两段）在源码文本里从未出现。动态拼键必须把前缀写成
 *     文本，所以"前缀从未出现"可证明该子树无法被拼出来，删除安全。
 *   - 不确定：子树在源码里被提到过（可能存在更深的动态拼接），只报告不删。
 *
 * 用法：
 *   node scripts/check-i18n-dead-keys.mjs                 # 报告（默认）
 *   node scripts/check-i18n-dead-keys.mjs --json          # 输出 JSON
 *   node scripts/check-i18n-dead-keys.mjs --why <key>     # 打印某键的命中情况
 *   node scripts/check-i18n-dead-keys.mjs --strict-keys   # 只打印严格死键（供删除脚本使用）
 *   node scripts/check-i18n-dead-keys.mjs --self-test     # 自检采集与判定逻辑
 */
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localeFiles = [
  join(repoRoot, "packages/ui/src/i18n/locales/zh-CN.ts"),
  join(repoRoot, "packages/ui/src/i18n/locales/en-US.ts"),
];
/** 只在这些目录里找引用；node_modules/dist 等构建产物不算。 */
const sourceRoots = ["packages", "apps", "scripts", "config"].map((p) => join(repoRoot, p));
/**
 * 目录名级剪枝。必须按"名字"判断而不是按完整路径正则：node_modules 里存在
 * 指向 workspace 包的符号链接（如 node_modules/@zcode/ui -> packages/ui），
 * 一旦跟进，packages/ui/src 会被重复采集，语言文件也会被当成引用来源，
 * 结果恒为 0 死键。
 */
const SKIP_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "dist-types",
  "out",
  "build",
  "coverage",
  "release",
  "mock-cdn",
  "bundled-agents",
  "resources",
  ".turbo",
  ".cache",
  ".git",
]);
const isSkippedDir = (name) => SKIP_DIR_NAMES.has(name) || name.startsWith(".e2e");
const SOURCE_FILE_PATTERN = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
/** locale 文件本身不能算引用：否则每个键都能在定义处命中。 */
const isLocalePath = (full) => /(^|[\\/])i18n[\\/]locales[\\/]/.test(full);

function collectSourceFiles(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    // 只处理真实目录/文件，符号链接（含 Windows junction）一律不跟进，
    // 否则会顺着依赖链接重复采集同一份源码。
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (isSkippedDir(entry.name)) continue;
      collectSourceFiles(full, acc);
    } else if (SOURCE_FILE_PATTERN.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function readLocaleKeys(file) {
  const content = readFileSync(file, "utf8");
  const keys = [];
  const pattern = /^\s*"([^"]+)":/gm;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    keys.push(match[1]);
  }
  return keys;
}

const sourceFiles = sourceRoots.flatMap((root) => {
  try {
    return lstatSync(root).isDirectory() ? collectSourceFiles(root) : [];
  } catch {
    return [];
  }
});

/**
 * 检查脚本自身也不能算引用来源：它会在输出/自检里写出键名字面量，
 * 一旦计入就会给死键"做保"（把待删的键写成永不被判死）。
 */
const SELF_PATH = resolve(fileURLToPath(import.meta.url));
const usageFiles = sourceFiles.filter(
  (file) => !isLocalePath(file) && resolve(file) !== SELF_PATH,
);
const usageText = usageFiles.map((file) => readFileSync(file, "utf8")).join("\n");

/**
 * 一次扫描把所有引号字面量收进 Set。不要对每个键去 includes 全文：
 * 单次 includes 要扫 ~90MB，5500 个键就是百亿字节级扫描（会跑到分钟级）。
 */
const literalTokens = new Set();
for (const match of usageText.matchAll(/["'`]([A-Za-z0-9_$.-]{2,})["'`]/g)) {
  literalTokens.add(match[1]);
}

/**
 * 所有点分标识符（不限引号）的前缀集合，用于"根前缀是否在源码里出现过"。
 * 动态拼键只能把前缀写成文本，所以前缀从未出现 ⇒ 该子树拼不出来。
 */
const mentionedPrefixes = new Set();
for (const match of usageText.matchAll(/[A-Za-z0-9_$-]+(?:\.[A-Za-z0-9_$-]+)+/g)) {
  const parts = match[0].split(".");
  for (let i = 1; i <= parts.length; i += 1) mentionedPrefixes.add(parts.slice(0, i).join("."));
}

/** 动态拼键族（`前缀.${变量}` 或 `"前缀." + 变量`）保守跳过。 */
function findDynamicPrefixes(text) {
  const prefixes = new Set();
  for (const match of text.matchAll(
    /["'`]([A-Za-z0-9_.-]{3,})\.\$\{|["'`]([A-Za-z0-9_.-]{3,})\.["'`]?\s*\+/g,
  )) {
    const prefix = match[1] ?? match[2];
    if (prefix) prefixes.add(prefix);
  }
  return prefixes;
}

const dynamicPrefixes = findDynamicPrefixes(usageText);

const isKeyUsed = (key) => literalTokens.has(key);
const parentPrefixOf = (key) => (key.includes(".") ? key.slice(0, key.lastIndexOf(".")) : key);
/** 键的所有真前缀（不含自身）。 */
function ancestorPrefixesOf(key) {
  const parts = key.split(".");
  const prefixes = [];
  for (let i = 1; i < parts.length; i += 1) prefixes.push(parts.slice(0, i).join("."));
  return prefixes;
}

/**
 * 家族级判定：一个前缀 F 下的所有键能否整体删除，取决于三条可证明条件：
 *   1. 源码里没有任何 token 等于 F 或以 "F." 开头 —— 子树根本没被提到；
 *   2. F 自身不是动态拼键前缀；
 *   3. 没有更浅的动态前缀 P 能满足 F.startsWith(P + ".") —— 否则 F 可能被
 *      `\`P.${x}...\`` 之类拼出来（变量在中间的情况也归到这里）。
 */
function familyStatus(prefix) {
  if (mentionedPrefixes.has(prefix)) return "mentioned";
  if (dynamicPrefixes.has(prefix)) return "dynamicPrefix";
  for (const dynamic of dynamicPrefixes) {
    if (prefix.startsWith(`${dynamic}.`)) return "dynamicAncestor";
  }
  return "safe";
}

function analyze() {
  return localeFiles.map((localeFile) => {
    const keys = readLocaleKeys(localeFile);
    const unused = keys.filter((key) => !isKeyUsed(key));
    // 候选家族 = 未使用键的所有真前缀
    const families = new Set();
    for (const key of unused) for (const prefix of ancestorPrefixesOf(key)) families.add(prefix);
    const safeFamilies = [];
    const blockedFamilies = [];
    for (const family of families) {
      const status = familyStatus(family);
      if (status === "safe") safeFamilies.push(family);
      else {
        const under = unused.filter((key) => key.startsWith(`${family}.`)).length;
        blockedFamilies.push({ family, status, unusedKeys: under });
      }
    }
    // 只保留最小安全家族：其所有祖先家族都不安全，避免嵌套重复计数
    const safeSet = new Set(safeFamilies);
    const minimalSafe = safeFamilies.filter(
      (family) => !ancestorPrefixesOf(family).some((prefix) => safeSet.has(prefix)),
    );
    const deletable = new Set();
    for (const key of unused) {
      if (minimalSafe.some((family) => key.startsWith(`${family}.`))) deletable.add(key);
    }
    return {
      file: relative(repoRoot, localeFile),
      total: keys.length,
      unusedKeys: unused.length,
      deletable: [...deletable].sort(),
      minimalSafeFamilies: minimalSafe.sort(),
      blockedFamilies: blockedFamilies.sort(
        (a, b) => b.unusedKeys - a.unusedKeys || a.family.localeCompare(b.family),
      ),
    };
  });
}

function printWhy(key) {
  const hits = [];
  for (const file of usageFiles) {
    if (readFileSync(file, "utf8").includes(key)) hits.push(relative(repoRoot, file));
  }
  console.log(`键: ${key}`);
  console.log(`  locale 中定义: ${localeFiles.some((f) => readLocaleKeys(f).includes(key))}`);
  console.log(`  引号字面量命中: ${isKeyUsed(key)}；源码文本命中 ${hits.length} 处`);
  for (const hit of hits.slice(0, 20)) console.log(`    ${hit}`);
  const ancestors = ancestorPrefixesOf(key);
  console.log("  祖先家族判定（从浅到深）:");
  for (const prefix of ancestors) console.log(`    ${familyStatus(prefix).padEnd(16)} ${prefix}`);
  console.log(`  所在家族是否可整体删除: ${familyStatus(parentPrefixOf(key)) === "safe"}`);
  console.log(`  采集文件: ${sourceFiles.length}（引用用源码 ${usageFiles.length}）`);
}

/** 自检：确保采集没有重复/漏采集，且判定逻辑对已知用例给出正确结论。 */
function selfTest() {
  const problems = [];
  if (usageFiles.length === 0) problems.push("引用用源码文件数为 0，采集失败");
  const aliasDuplicates = sourceFiles.filter((f) => /[\\/]node_modules[\\/]/.test(f));
  if (aliasDuplicates.length > 0) {
    problems.push(`采集到 ${aliasDuplicates.length} 个 node_modules 内文件（符号链接未剪枝）`);
  }
  if (localeFiles.some((f) => usageFiles.some((u) => resolve(u) === resolve(f)))) {
    problems.push("locale 文件被计入引用来源");
  }
  if (usageFiles.some((u) => resolve(u) === SELF_PATH)) {
    problems.push("检查脚本自身被计入引用来源");
  }
  // 结构性断言：不绑定具体业务键，避免键改名后自检失效。
  const checked = analyze();
  const total = checked.reduce((sum, entry) => sum + entry.total, 0);
  const unused = checked.reduce((sum, entry) => sum + entry.unusedKeys, 0);
  const deletable = checked.reduce((sum, entry) => sum + entry.deletable.length, 0);
  const families = checked.reduce((sum, entry) => sum + entry.minimalSafeFamilies.length, 0);
  if (total === 0) problems.push("locale 里没有解析到任何键，解析器失效");
  if (unused === 0 && total > 0) problems.push("没有解析出任何未使用键，采集可能把 locale 当成了引用");
  if (families === 0 && deletable > 0) problems.push("有可删键但没有安全家族，家族判定逻辑不一致");
  if (total > 0 && deletable / total > 0.5) {
    problems.push(`可删键占比 ${((deletable / total) * 100).toFixed(1)}% 过高，可能有引用未被采集`);
  }
  // 反向断言 1：不存在的键必须判为未被引用。
  if (isKeyUsed("__zcode_self_test_missing_key__")) problems.push("不存在的键被判为被引用");
  // 反向断言 2：被引用的键绝不能出现在可删集合里（防止条件写反）。
  for (const entry of checked) {
    const wrong = entry.deletable.filter((key) => isKeyUsed(key));
    if (wrong.length > 0) problems.push(`可删集合里出现仍在使用的键: ${wrong.slice(0, 3).join(", ")}`);
  }
  for (const problem of problems) console.log(`✗ ${problem}`);
  if (problems.length === 0) {
    console.log(
      `✓ 自检通过（采集 ${sourceFiles.length} 个源文件 / 引用用 ${usageFiles.length} 个；` +
        `解析 ${total} 个键：未使用 ${unused}，家族级可安全删除 ${deletable}（${families} 个最小家族））`,
    );
  }
  return problems.length === 0;
}

const argv = process.argv.slice(2);
if (argv.includes("--self-test")) {
  process.exitCode = selfTest() ? 0 : 1;
} else if (argv.includes("--why")) {
  printWhy(argv[argv.indexOf("--why") + 1] ?? "");
} else if (argv.includes("--json")) {
  console.log(JSON.stringify(analyze(), null, 2));
} else if (argv.includes("--strict-keys")) {
  const keys = new Set();
  for (const entry of analyze()) for (const key of entry.deletable) keys.add(key);
  console.log([...keys].sort().join("\n"));
} else {
  const results = analyze();
  for (const entry of results) {
    console.log(`\n=== ${entry.file} ===`);
    console.log(
      `  键总数: ${entry.total} | 未使用: ${entry.unusedKeys} | 家族级可安全删除: ${entry.deletable.length} | 被挡住: ${entry.unusedKeys - entry.deletable.length}`,
    );
    console.log(`  -- 可安全删除的最小家族（${entry.minimalSafeFamilies.length} 个）--`);
    for (const family of entry.minimalSafeFamilies.slice(0, 40)) {
      console.log(`    ${family}`);
    }
    console.log("  -- 被挡住、需人工确认的家族（未使用键数 Top 20）--");
    for (const blocked of entry.blockedFamilies.slice(0, 20)) {
      console.log(`    ${String(blocked.unusedKeys).padStart(4)}  ${blocked.family}   [${blocked.status}]`);
    }
  }
  // 双语键集必须一致：缺失会让对应语言直接显示键名本身。
  const [first, second] = results.map((entry) => new Set(readLocaleKeys(join(repoRoot, entry.file))));
  const onlyFirst = [...first].filter((key) => !second.has(key));
  const onlySecond = [...second].filter((key) => !first.has(key));
  console.log("\n=== 键集一致性 ===");
  if (onlyFirst.length === 0 && onlySecond.length === 0) {
    console.log(`  ✓ 两语言键集一致（各 ${first.size} 个键）`);
  } else {
    console.log(`  ✗ ${results[0].file} 独有 ${onlyFirst.length} 个: ${onlyFirst.slice(0, 5).join(", ")}`);
    console.log(`  ✗ ${results[1].file} 独有 ${onlySecond.length} 个: ${onlySecond.slice(0, 5).join(", ")}`);
  }
  console.log(
    "\n说明：可安全删除 = 该家族未被源码任何 token 提到、且不可能被动态拼键构造；" +
      "被挡住的家族（mentioned/dynamicPrefix/dynamicAncestor）删除前必须用 rg 逐个确认。",
  );
}

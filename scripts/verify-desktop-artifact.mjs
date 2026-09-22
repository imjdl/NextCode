/**
 * 桌面安装包产物核验（打包后运行，用于 BUILD.md「验证产物」这一步）。
 *
 * 为什么需要脚本：身份改名、CSP、品牌字形、文案清理这些改动都"藏在" asar 里，
 * 只看安装包存在与否无法发现"某处还是旧名字/旧图标/旧文案"（本项目已发生过多次）。
 * 这里用版本号推导路径，逐项断言；失败时列出未通过项并以非零码退出。
 *
 * 用法：node scripts/verify-desktop-artifact.mjs [--platform win] [--arch x64]
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import asar from "@electron/asar";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version;
const argv = process.argv.slice(2);
const readArg = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const platform = readArg("platform", "win");
const arch = readArg("arch", "x64");
const productName = "NextCode";

const dist = join(repoRoot, "packages/desktop/dist");
const unpacked = join(dist, "win-unpacked");
const asarPath = join(unpacked, "resources/app.asar");
const installerName = `${productName}-${version}-${platform}-${arch}.exe`;

const problems = [];
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? `（${extra}）` : ""}`);
  if (!ok) problems.push(label);
};

check(`安装包存在：${installerName}`, existsSync(join(dist, installerName)));
const latestPath = join(dist, "latest.yml");
if (existsSync(latestPath)) {
  const latest = readFileSync(latestPath, "utf8");
  check(`latest.yml 版本为 ${version}`, new RegExp(`^version: ${version.replaceAll(".", "\\.")}$`, "m").test(latest));
  check("latest.yml 指向本次安装包", latest.includes(installerName));
} else {
  check("latest.yml 存在", false);
}

check(`打包后可执行名为 ${productName}.exe`, existsSync(join(unpacked, `${productName}.exe`)));

if (!existsSync(asarPath)) {
  check("app.asar 存在", false);
} else {
  const entries = asar.listPackage(asarPath);
  const armsEntries = entries.filter((entry) => /@arms/i.test(entry));
  check("asar 内不含遥测 SDK（@arms）", armsEntries.length === 0, `${armsEntries.length} 条`);

  const bytes = readFileSync(asarPath).toString("latin1");
  const has = (needle) => bytes.includes(needle);
  check("CSP：frame-ancestors 'none'", has("frame-ancestors 'none'"));
  check("CSP：允许 WebAssembly 编译", has("'wasm-unsafe-eval'"));
  check("CSP：connect-src 允许同源 WS", has("connect-src 'self' ws: wss:"));
  check("安全头：Referrer-Policy", has("Referrer-Policy"));
  check("身份：产品名已改", has(productName));

  // 品牌字形：新 N 在、旧 Z 不在（旧字形路径来自原型 Z，改名后不应再出现）
  check("含新 N 字形路径", has("M43.52 0 H85.52"));
  check("不含旧 Z 字形路径", !has("M134.4 0.130152"));

  const utf8 = readFileSync(asarPath, "utf8");
  check("手机端访问文案含「不支持公网访问」", utf8.includes("不支持公网访问"));
  check("已清理的死键不再出现（chat.promptEnhance.title）", !utf8.includes("chat.promptEnhance.title"));
  check("已移除的官方渠道文案不再出现（产品文档）", !utf8.includes("产品文档"));
}

const releasesDir = join(unpacked, "resources/remote-assets/releases");
if (existsSync(releasesDir)) {
  const releases = readdirSync(releasesDir);
  check(`随包远端资源为 ${version}`, releases.includes(version), releases.join(","));
} else {
  check("随包远端资源目录存在", false);
}

const webHtmlPath = join(unpacked, "resources/web-remote-web/index.html");
if (existsSync(webHtmlPath)) {
  const webHtml = readFileSync(webHtmlPath, "utf8");
  check(`随包 Web 产物标题为 ${productName}`, webHtml.includes(`<title>${productName}</title>`));
} else {
  check("随包 Web 远控产物存在", false);
}

if (problems.length > 0) {
  console.log(`\n未通过 ${problems.length} 项：\n - ${problems.join("\n - ")}`);
  process.exitCode = 1;
} else {
  console.log(`\n全部核验通过（version=${version} platform=${platform} arch=${arch}）`);
}

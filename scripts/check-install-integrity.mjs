/**
 * 安装完整性自检：扫描安装目录里"大小正常但内容全为零字节"的文件。
 *
 * 背景（2026-09-22 实测）：3.18.0 安装后打开任意会话都报
 * `Failed to resume persisted session ...: Unexpected token '\u0000', "\u0000\u0000\u0000..." is not valid JSON`。
 * 排查结论：安装包内嵌载荷完好（同样 2517 个小文本文件零填充 0 个），但安装到磁盘后有 2336 个变成零填充
 * —— "大小正确、内容全零"是数据块未落盘的典型形态（安装期间断电/强制重启，或杀软等过滤驱动干扰），
 * 与代码和打包无关；重装即恢复。
 *
 * 用法：
 *   node scripts/check-install-integrity.mjs                     # 默认扫描常见安装位置
 *   node scripts/check-install-integrity.mjs "D:/apps/ncode/NextCode"
 *   node scripts/check-install-integrity.mjs --max-size 1048576   # 调整扫描体积上限
 *
 * 退出码：发现零填充文件时为 1（提示重装），否则为 0。
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { openSync, closeSync, readSync } from "node:fs";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const maxSizeIndex = argv.indexOf("--max-size");
const maxSize = maxSizeIndex >= 0 ? Number(argv[maxSizeIndex + 1]) || 512 * 1024 : 512 * 1024;
const explicit = argv.find((value) => !value.startsWith("--") && value !== String(maxSize));

const defaultRoots = [
  "C:/Users/imell/AppData/Local/Programs/NextCode",
  "C:/Program Files/NextCode",
  "D:/apps/ncode/NextCode",
];
const roots = explicit ? [explicit] : defaultRoots.filter((root) => existsSync(root));

if (roots.length === 0) {
  console.log(
    "未找到安装目录，请显式传入路径：node scripts/check-install-integrity.mjs <安装目录>",
  );
  process.exit(0);
}

const TEXT_FILE = /\.(json|txt|js|cjs|mjs|html|css|yml|yaml|md|node)$/i;

function scan(root) {
  let scanned = 0;
  let zeroed = 0;
  const samples = [];
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      // 只查小文本文件：大二进制（asar/dll/exe）即使损坏也另有表现，且读取成本高
      if (!TEXT_FILE.test(entry.name) && !entry.name.startsWith(".")) continue;
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.size === 0 || stat.size > maxSize) continue;
      scanned += 1;
      let fd;
      try {
        fd = openSync(full, "r");
        const head = Buffer.alloc(1);
        readSync(fd, head, 0, 1, 0);
        if (head[0] === 0) {
          zeroed += 1;
          if (samples.length < 10) samples.push(full.slice(root.length));
        }
      } catch {
        // 读失败按损坏处理
        zeroed += 1;
        if (samples.length < 10) samples.push(`${full.slice(root.length)}（读取失败）`);
      } finally {
        if (fd !== undefined) {
          try {
            closeSync(fd);
          } catch {
            // 关闭失败无需处理
          }
        }
      }
    }
  };
  walk(root, 0);
  return { scanned, zeroed, samples };
}

let failed = false;
for (const root of roots) {
  const result = scan(resolve(root));
  const ratio = result.scanned === 0 ? 0 : (result.zeroed / result.scanned) * 100;
  console.log(`\n${root}`);
  console.log(
    `  扫描小文本文件 ${result.scanned} 个，零填充 ${result.zeroed} 个（${ratio.toFixed(1)}%）`,
  );
  for (const sample of result.samples) console.log(`   - ${sample}`);
  if (result.zeroed > 0) {
    failed = true;
    console.log(
      "  ⇒ 安装不完整：请用同一个安装包重装（覆盖安装即可）。若反复出现，检查磁盘/杀软并查系统事件日志是否异常关机。",
    );
  } else {
    console.log("  ⇒ 安装完整");
  }
}

process.exitCode = failed ? 1 : 0;

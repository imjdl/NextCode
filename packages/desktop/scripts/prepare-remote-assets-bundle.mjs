#!/usr/bin/env node

/**
 * 把远端运行时资源裁剪进桌面包。
 *
 * 背景：连接 SSH/WSL 远程时，桌面端默认从官方 CDN 取 `manifest-<platform>-<arch>.json`
 * 与各组件制品；定制版自增版本号后官方 CDN 上必然没有该版本（实测报
 * `manifest not found for linux-x64`），远程连接直接失败。
 *
 * 这里把仓库 mock-cdn 里**当前版本**的资源裁出指定平台，落到 `resources/remote-assets`，
 * 由 electron-builder 以 extraResources 打进包；打包态 desktopRuntimeEnv 会把它当成
 * mock CDN 根（本地优先），组件齐全时部署完全不走网络。
 *
 * 平台清单由 ZCODE_BUNDLED_REMOTE_PLATFORMS 控制（默认 linux-x64：SSH/WSL 最常见目标；
 * 每个平台约 158MB 未压缩，其中 Node 运行时 116MB）。
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(desktopRoot, "../..");
const version = JSON.parse(readFileSync(join(workspaceRoot, "package.json"), "utf8")).version;
const mockReleaseDir = join(desktopRoot, "mock-cdn", "releases", version);
const targetReleaseDir = join(desktopRoot, "resources", "remote-assets", "releases", version);

const DEFAULT_PLATFORMS = ["linux-x64"];
const platforms = (process.env.ZCODE_BUNDLED_REMOTE_PLATFORMS?.trim() || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const bundledPlatforms = platforms.length > 0 ? platforms : DEFAULT_PLATFORMS;

if (!existsSync(mockReleaseDir)) {
  throw new Error(
    `[prepare-remote-assets-bundle] 缺少 mock-cdn 版本目录: ${mockReleaseDir}\n` +
      `请先运行 pnpm --filter @zcode/desktop prepare:remote-assets（会按当前版本号准备资源）`,
  );
}

// 每次全量重建：删掉旧版本目录，避免安装包里堆积历史版本资源。
rmSync(join(desktopRoot, "resources", "remote-assets"), { recursive: true, force: true });
mkdirSync(targetReleaseDir, { recursive: true });

const copied = [];
function copyIfExists(from, to) {
  if (!existsSync(from)) {
    return;
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  copied.push(to.slice(targetReleaseDir.length + 1));
}

// 清单：只带随包平台的 manifest，未打包平台仍按既有语义回退 CDN。
for (const platform of bundledPlatforms) {
  copyIfExists(
    join(mockReleaseDir, `manifest-${platform}.json`),
    join(targetReleaseDir, `manifest-${platform}.json`),
  );
}

// 组件：server 是单文件（跨平台共用），其余按平台子目录。
copyIfExists(join(mockReleaseDir, "server"), join(targetReleaseDir, "server"));
for (const component of ["node", "node-pty", "glm", "tools"]) {
  for (const platform of bundledPlatforms) {
    copyIfExists(
      join(mockReleaseDir, component, platform),
      join(targetReleaseDir, component, platform),
    );
  }
}

function dirSizeBytes(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    total += entry.isDirectory() ? dirSizeBytes(full) : statSync(full).size;
  }
  return total;
}

if (copied.length === 0) {
  throw new Error(
    `[prepare-remote-assets-bundle] 未复制任何资源，请检查 mock-cdn 是否为 ${version} 且包含 ${bundledPlatforms.join(",")}`,
  );
}

const sizeMb = (dirSizeBytes(join(desktopRoot, "resources", "remote-assets")) / 1024 / 1024).toFixed(
  1,
);
console.log(
  `[prepare-remote-assets-bundle] 已打包远端资源 version=${version} platforms=${bundledPlatforms.join(",")} size=${sizeMb}MB entries=${copied.length}`,
);

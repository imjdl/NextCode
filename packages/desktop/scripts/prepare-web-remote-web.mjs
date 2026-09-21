#!/usr/bin/env node

/**
 * 准备 Web 远控服务要托管的 Web 产物。
 *
 * 桌面端的 Web 远控（用户名旁手机图标 → 开启服务 → 手机扫码）需要把 Web 客户端
 * 随包分发：electron-builder 从这里复制 resources/web-remote-web 到 process.resourcesPath。
 * 构建失败时保持原目录不动，避免产出半份产物让面板展示出坏页面。
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand } from "../../../scripts/spawn-command.mjs";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(desktopRoot, "../..");
const webDistDir = resolve(workspaceRoot, "packages/web/dist");
const targetDir = resolve(desktopRoot, "resources/web-remote-web");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

runCommand(pnpmCommand, ["--filter", "@zcode/web", "build"], {
  cwd: workspaceRoot,
  env: process.env,
});

if (!existsSync(resolve(webDistDir, "index.html"))) {
  throw new Error(`[prepare-web-remote-web] Web 产物缺失: ${webDistDir}/index.html`);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });
cpSync(webDistDir, targetDir, { recursive: true });
console.log(`[prepare-web-remote-web] 已复制 Web 产物 -> ${targetDir}`);

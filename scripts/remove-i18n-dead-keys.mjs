#!/usr/bin/env node

/**
 * 按 check-i18n-dead-keys.mjs 的"家族级可安全删除"结论，从 locale 文件中移除死键。
 *
 * 为什么用脚本而不是手删：locale 里存在跨行值（键与值分行），手删容易漏掉续行造成
 * 语法错误；同时删除范围必须与检查脚本的判定完全一致，避免"检查说安全、删除却多删"。
 *
 * 判定来源：脚本调用 `check-i18n-dead-keys.mjs --json`，只删除其中 deletable 的键。
 *
 * 用法：
 *   node scripts/remove-i18n-dead-keys.mjs           # dry-run，只打印将要删除的数量
 *   node scripts/remove-i18n-dead-keys.mjs --write   # 实际写入
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checker = join(repoRoot, "scripts/check-i18n-dead-keys.mjs");
const write = process.argv.includes("--write");

const report = JSON.parse(execFileSync(process.execPath, [checker, "--json"], { encoding: "utf8" }));

/** 每个条目的起点都是行首两个空格的键。 */
const ENTRY_START = /^ {2}"([^"]+)":/gm;

function splitLocale(content) {
  const matches = [...content.matchAll(ENTRY_START)];
  if (matches.length === 0) throw new Error("没有解析到任何键条目");
  const header = content.slice(0, matches[0].index);
  const closeIndex = content.lastIndexOf("\n};");
  if (closeIndex < matches.at(-1).index) throw new Error("未找到 locale 对象结尾，文件结构可能已变");
  const tail = content.slice(closeIndex);
  const entries = matches.map((match, index) => ({
    key: match[1],
    text: content.slice(match.index, matches[index + 1]?.index ?? closeIndex),
  }));
  return { header, tail, entries };
}

for (const entry of report) {
  const file = join(repoRoot, entry.file);
  const content = readFileSync(file, "utf8");
  const { header, tail, entries } = splitLocale(content);
  const deletable = new Set(entry.deletable);
  const kept = [];
  const removed = [];
  for (const item of entries) {
    if (deletable.has(item.key)) removed.push(item.key);
    else kept.push(item);
  }
  const unexpected = removed.filter((key) => !deletable.has(key));
  if (unexpected.length > 0) throw new Error(`删除了不在可删集合中的键: ${unexpected.join(", ")}`);
  if (removed.length !== deletable.size) {
    throw new Error(
      `${entry.file}: 删除数 ${removed.length} 与判定数 ${deletable.size} 不一致，已中止`,
    );
  }
  const next = header + kept.map((item) => item.text).join("") + tail;
  // 结构自检：键数 = 原键数 - 删除数，且首尾结构保持不变
  const nextKeyCount = [...next.matchAll(ENTRY_START)].length;
  if (nextKeyCount !== entries.length - removed.length) {
    throw new Error(`${entry.file}: 写入后键数校验失败（${nextKeyCount}）`);
  }
  if (!next.startsWith(header) || !next.endsWith(tail)) {
    throw new Error(`${entry.file}: 写入后首尾结构变化，已中止`);
  }
  console.log(
    `${entry.file}: ${entries.length} -> ${nextKeyCount} 键（删除 ${removed.length} 个${write ? "" : "，dry-run"}）`,
  );
  if (write) writeFileSync(file, next, "utf8");
}

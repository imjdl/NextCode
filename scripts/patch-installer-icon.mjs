/**
 * 安装器图标改造：把 3D 盒子正面的 Z 换成 N（NSIS 安装/卸载/标题图标用这套）。
 *
 * 原图是美术渲染的立体盒子，重画难以等质，因此这里**保留盒子本身**，只替换正面字形：
 *   1. 从 git 取原始 icon_installer.png（脚本可重复运行，不会"补丁套补丁"）；
 *   2. 用实测出的字形包围盒，按面色的对角渐变把旧字形盖住（面色实测 9~21，极暗，过渡自然）；
 *   3. 在同一包围盒内居中绘制新 N（路径来自 scripts/generate-brand-assets.mjs 的同一份几何）。
 *
 * 用法：node scripts/patch-installer-icon.mjs
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { buildNPaths } from "./generate-brand-assets.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const originalRef = process.env["INSTALLER_ICON_SOURCE_REF"] ?? "HEAD";
const originalPath = "packages/desktop/build/icon_installer.png";
const originalPng = execFileSync("git", ["show", `${originalRef}:${originalPath}`], {
  cwd: repoRoot,
  maxBuffer: 32 * 1024 * 1024,
});
const N_PATHS = buildNPaths();
const chromiumPath =
  process.env["VERIFY_CHROME"] ??
  "C:/Users/imell/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe";

const browser = await chromium.launch({ executablePath: chromiumPath });
const page = await browser.newPage();
const pngBase64 = originalPng.toString("base64");

const result = await page.evaluate(
  async ({ pngBase64, nPaths }) => {
    const img = await new Promise((resolveImage, rejectImage) => {
      const image = new Image();
      image.onload = () => resolveImage(image);
      image.onerror = () => rejectImage(new Error("original installer icon failed to load"));
      image.src = `data:image/png;base64,${pngBase64}`;
    });
    const size = img.naturalWidth;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    // 1) 找旧字形（亮色像素）的包围盒
    const { data } = ctx.getImageData(0, 0, size, size);
    let minX = size;
    let minY = size;
    let maxX = 0;
    let maxY = 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 4;
        if (data[i + 3] > 200 && data[i] > 190 && data[i + 1] > 190 && data[i + 2] > 190) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    const pad = 6;
    const boxX = Math.max(0, minX - pad);
    const boxY = Math.max(0, minY - pad);
    const boxW = Math.min(size - boxX, maxX - minX + pad * 2);
    const boxH = Math.min(size - boxY, maxY - minY + pad * 2);

    // 2) 用盒子面的对角渐变覆盖旧字形（面色从左上偏亮到右下偏暗）
    const sample = (x, y) => {
      const i = (y * size + x) * 4;
      return `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`;
    };
    const gradient = ctx.createLinearGradient(boxX, boxY, boxX + boxW, boxY + boxH);
    gradient.addColorStop(0, sample(Math.max(0, boxX - 30), Math.max(0, boxY - 30)));
    gradient.addColorStop(1, sample(Math.min(size - 1, boxX + boxW + 30), Math.min(size - 1, boxY + boxH + 30)));
    ctx.fillStyle = gradient;
    ctx.fillRect(boxX, boxY, boxW, boxH);

    // 3) 同一包围盒内居中绘制新 N（保持与原字形同一字重比例）
    const nViewBox = { width: 256, height: 217.6 };
    const scale = Math.min(boxW / nViewBox.width, boxH / nViewBox.height) * 0.98;
    const offsetX = boxX + (boxW - nViewBox.width * scale) / 2;
    const offsetY = boxY + (boxH - nViewBox.height * scale) / 2;
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    ctx.fillStyle = "white";
    for (const d of nPaths) ctx.fill(new Path2D(d));
    ctx.restore();

    return {
      size,
      glyphBox: { minX, minY, maxX, maxY },
      dataUrl: canvas.toDataURL("image/png"),
    };
  },
  { pngBase64, nPaths: N_PATHS },
);

const png = Buffer.from(result.dataUrl.split(",")[1], "base64");
writeFileSync(resolve(repoRoot, originalPath), png);
console.log(`已重绘 ${originalPath}（原字形包围盒 ${JSON.stringify(result.glyphBox)}）`);

// 256 的单尺寸 ICO（与改造前一致：ICONDIR + 一条目录项 + PNG 负载）
const icon256 = await (async () => {
  const canvasPage = await browser.newPage();
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  await canvasPage.setViewportSize({ width: 256, height: 256 });
  await canvasPage.setContent(
    `<style>html,body{margin:0;padding:0}</style><img src="${dataUrl}" style="width:256px;height:256px;display:block">`,
  );
  await canvasPage.waitForTimeout(150);
  const buffer = await canvasPage.screenshot({ omitBackground: true });
  await canvasPage.close();
  return buffer;
})();

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0); // 256 → 0
entry.writeUInt8(0, 1);
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(icon256.length, 8);
entry.writeUInt32LE(22, 12);
writeFileSync(resolve(repoRoot, "packages/desktop/build/icon_installer.ico"), Buffer.concat([header, entry, icon256]));
console.log("已重绘 packages/desktop/build/icon_installer.ico（256 单尺寸）");

await browser.close();

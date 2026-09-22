/**
 * NextCode 品牌图形生成器。
 *
 * 原品牌标记是「粗斜体 Z（两横旗 + 一条重对角线）」。本脚本在同一风格下把 Z 换成 N：
 * 沿用同一套笔重比例（以 256×218 字形盒为基准）、相同的圆角交界过渡与斜度，
 * 并据此重新生成全部品牌图片（UI 矢量资产 + 应用图标 PNG/ICO）。
 *
 * 为什么用脚本而不是手工改图：图标有 9 个尺寸 + 两种布局（mac 留白版 / Windows 满幅版）+
 * ICO 多尺寸打包，手改必然出现尺寸或风格漂移；参数化后改一处即可全部重生成。
 *
 * 用法：node scripts/generate-brand-assets.mjs [--check]
 *   --check  只渲染到临时目录做对比，不写回仓库资产
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
const previewDir = resolve(repoRoot, ".brand-preview");

/* ------------------------------------------------------------------ 几何 */

/** 原型 Z 的比例（以 256×218 字形盒为基准）。 */
const METRICS = { boxWidth: 256, glyphHeight: 217.6 };
/** N 的参数：字重贴近原型 Z 的视觉重量，斜度贴近字标里的斜体。 */
const N_PARAMS = { slant: 0.2, stemWidth: 42, diagonalWeight: 42, fillet: 16 };

const round = (value) => Math.round(value * 100) / 100;
const normalize = ({ x, y }) => {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
};

/** 在凹口顶点处生成圆角填角：顶点 → 边1 切点 → 二次贝塞尔（控制点取顶点）→ 边2 切点。 */
function filletPath(vertex, dir1, dir2, radius) {
  const p1 = { x: vertex.x + dir1.x * radius, y: vertex.y + dir1.y * radius };
  const p2 = { x: vertex.x + dir2.x * radius, y: vertex.y + dir2.y * radius };
  return `M${vertex.x} ${vertex.y} L${round(p1.x)} ${round(p1.y)} Q${vertex.x} ${vertex.y} ${round(p2.x)} ${round(p2.y)} Z`;
}

/** 生成 N 的字形路径（256×218 盒内，可缩放）。 */
export function buildNPaths({ slant, stemWidth, diagonalWeight, fillet } = N_PARAMS) {
  const W = METRICS.boxWidth;
  const H = METRICS.glyphHeight;
  const S = round(slant * H);
  const w = stemWidth;
  const bottomRight = round(W - S);
  const xTopStemRight = round(S + w);
  const xBottomStemRight = round(bottomRight - w);
  const diagonalRun = xBottomStemRight - xTopStemRight;
  const diagonalCut = (diagonalWeight * Math.hypot(diagonalRun, H)) / H;

  const topFillet = filletPath(
    { x: xTopStemRight, y: 0 },
    normalize({ x: -S, y: H }),
    normalize({ x: diagonalRun, y: H }),
    fillet,
  );
  const bottomFillet = filletPath(
    { x: xBottomStemRight, y: H },
    normalize({ x: -diagonalRun, y: -H }),
    normalize({ x: -S, y: -H }),
    fillet,
  );

  return [
    `M${round(xTopStemRight - w)} 0 H${round(xTopStemRight)} L${round(xTopStemRight - S)} ${H} H${round(xTopStemRight - w - S)} Z`,
    `M${round(xTopStemRight)} 0 H${round(xTopStemRight + diagonalCut)} L${round(xBottomStemRight)} ${H} H${round(xBottomStemRight - diagonalCut)} Z`,
    `M${round(xBottomStemRight)} 0 H${round(bottomRight)} L${round(bottomRight - S)} ${H} H${round(xBottomStemRight - S)} Z`,
    topFillet,
    bottomFillet,
  ];
}

const N_PATHS = buildNPaths();

/** 把 256×218 盒内的字形路径缩放到目标盒子。缩放比必须保留足够精度（徽标里只有 ~0.045）。 */
function glyphGroup({ box, scale, fill, opacity = 1 }) {
  const scaleText = String(Number(scale.toFixed(5)));
  return N_PATHS.map(
    (d) =>
      `  <path d="${d}" fill="${fill}"${opacity === 1 ? "" : ` fill-opacity="${opacity}"`} transform="translate(${round(box.x)} ${round(box.y)}) scale(${scaleText})" />`,
  ).join("\n");
}

/* --------------------------------------------------- 矢量资产（写回仓库） */

/** 18×18 徽标：沿用原 logo-zai.svg 的圆角方底 + 描边 + 字形盒（x2.979 y3.863 11.542×9.811）。 */
function badgeSvg() {
  const box = { x: 2.979, y: 3.863 };
  const scale = 11.542 / METRICS.boxWidth;
  return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path
    d="M2.91528 17.32C1.40918 17.32 0.183716 16.0946 0.183716 14.5885V2.91906C0.183716 1.41296 1.40918 0.1875 2.91528 0.1875H14.5847C16.0908 0.1875 17.3163 1.41296 17.3163 2.91906V14.5885C17.3163 16.0946 16.0908 17.32 14.5847 17.32H2.91528Z"
    fill="url(#nextcode-badge-bg)" />
  <path
    d="M14.5847 0.367454C15.9918 0.367454 17.1325 1.50817 17.1325 2.91529V14.5847C17.1325 15.9918 15.9918 17.1325 14.5847 17.1325H2.91529C1.50817 17.1325 0.367454 15.9918 0.367454 14.5847V2.91529C0.367454 1.50817 1.50817 0.367454 2.91529 0.367454H14.5847ZM14.5847 0H2.91529C2.13652 0 1.40459 0.303149 0.853871 0.853871C0.303149 1.40459 0 2.13652 0 2.91529V14.5847C0 15.3635 0.303149 16.0954 0.853871 16.6461C1.40459 17.1969 2.13652 17.5 2.91529 17.5H14.5847C15.3635 17.5 16.0954 17.1969 16.6461 16.6461C17.1969 16.0954 17.5 15.3635 17.5 14.5847V2.91529C17.5 2.13652 17.1969 1.40459 16.6461 0.853871C16.0954 0.303149 15.3635 0 14.5847 0Z"
    fill="#B7BCBF" />
${glyphGroup({ box, scale, fill: "white" })}
  <defs>
    <linearGradient id="nextcode-badge-bg" x1="8.74999" y1="17.32" x2="8.74999" y2="0.187504" gradientUnits="userSpaceOnUse">
      <stop stop-color="black" />
      <stop offset="1" stop-color="#151718" />
    </linearGradient>
  </defs>
</svg>
`;
}

/**
 * 草稿空态的水印字形（替换原 assets/Z.svg）：同一 436×360 盒、同一套渐变描边 + 模糊底影，
 * 只有字形换成 N。低透明度，仅作背景装饰。
 */
function watermarkSvg() {
  const box = { x: 19, y: 20 };
  const scale = 398 / METRICS.boxWidth;
  const gradient = `<linearGradient id="paint0_linear_nextcode" x1="217.97" y1="20.5" x2="217.97" y2="340.5" gradientUnits="userSpaceOnUse">
      <stop stop-color="#444444" stop-opacity="0.6"/>
      <stop offset="0.5" stop-color="#2A2A2A" stop-opacity="0.3"/>
      <stop offset="1" stop-color="#1A1A1A" stop-opacity="0.1"/>
    </linearGradient>`;
  return `<svg width="436" height="360" viewBox="0 0 436 360" fill="none" xmlns="http://www.w3.org/2000/svg">
<g opacity="0.15" filter="url(#filter0_f_nextcode)">
${glyphGroup({ box, scale, fill: "url(#paint0_linear_nextcode)" })}
</g>
${glyphGroup({ box, scale, fill: "none" }).replaceAll('fill="none"', 'stroke="url(#paint0_linear_nextcode)"')}
<defs>
<filter id="filter0_f_nextcode" x="16.6" y="18.6" width="402.74" height="323.8" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
<feGaussianBlur stdDeviation="1.2" result="effect1_foregroundBlur_nextcode"/>
</filter>
${gradient}
</defs>
</svg>
`;
}

/* --------------------------------------------- 图标（栅格化用 SVG 源） */

/**
 * 应用图标源：圆角方底 + 竖向渐变 + 白色 N。
 * 与原图标实测一致：mac 留白版艺术区占 830/1024、圆角 178/830；Windows 满幅版占满、圆角 129/1022。
 */
function appIconSvg({ inset, radiusRatio, size = 1024 }) {
  const art = size - inset * 2;
  const radius = art * radiusRatio;
  const glyphScale = (art * 0.66) / METRICS.glyphHeight;
  const glyphWidth = METRICS.boxWidth * glyphScale;
  const box = { x: inset + (art - glyphWidth) / 2, y: inset + (art - METRICS.glyphHeight * glyphScale) / 2 };
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="${inset}" y="${inset}" width="${art}" height="${art}" rx="${round(radius)}" fill="url(#nextcode-icon-bg)" />
${glyphGroup({ box, scale: glyphScale, fill: "white" })}
  <defs>
    <linearGradient id="nextcode-icon-bg" x1="${size / 2}" y1="${inset}" x2="${size / 2}" y2="${size - inset}" gradientUnits="userSpaceOnUse">
      <stop stop-color="#151718" />
      <stop offset="1" stop-color="#010101" />
    </linearGradient>
  </defs>
</svg>
`;
}

/* --------------------------------------------------------- ICO 打包 */

/** 组装 PNG-in-ICO（Vista+ 支持）：ICONDIR + 每个尺寸一条目录项 + PNG 负载。 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const directory = [];
  const payloads = [];
  for (const { size, buffer } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    directory.push(entry);
    payloads.push(buffer);
    offset += buffer.length;
  }
  return Buffer.concat([header, ...directory, ...payloads]);
}

/**
 * 原型 Z 字形的路径片段。它们只应出现在本文件的"源码内联位置"清单里；
 * 源码别处再出现就说明又有地方漏换（3.18.0 首轮就漏了启动徽标、两个 HTML 外壳与关于窗口）。
 */
const LEGACY_Z_FRAGMENTS = [
  "M134.4 0.130152L116.48 25.6022C113.665 29.5699 109.054 32.0019 104.064 32.0019H6.3999V0C6.3999 0.130149 134.4 0.130152 134.4 0.130152Z",
  "M256 0.130127L102.401 217.732H0L153.599 0.130127H256Z",
  "M121.601 217.732L139.65 192.134C142.465 188.166 147.076 185.734 152.067 185.734H249.604V217.736H121.601V217.732Z",
];

/** 扫描源码，确认没有遗留的原型 Z 字形（发现即报错，避免再出现"改了 logo 但某处还是 Z"）。 */
function assertNoLegacyGlyph() {
  const skipDirs = new Set([
    "node_modules",
    "dist",
    "dist-types",
    "out",
    "resources",
    "bundled-agents",
    "mock-cdn",
    ".turbo",
  ]);
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name) || entry.name.startsWith(".")) continue;
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx|js|jsx|mjs|cjs|html|svg)$/.test(entry.name)) continue;
      if (full.endsWith("generate-brand-assets.mjs")) continue;
      const text = readFileSync(full, "utf8");
      for (const fragment of LEGACY_Z_FRAGMENTS) {
        if (text.includes(fragment)) {
          found.push(relative(repoRoot, full).replaceAll("\\", "/"));
          break;
        }
      }
    }
  };
  for (const root of ["packages", "apps", "scripts", "config"]) walk(resolve(repoRoot, root));
  if (found.length > 0) {
    throw new Error(
      `发现未替换的原型 Z 字形，请换成 N（字形见 packages/ui/src/assets/brand-mark-paths.ts）：\n - ${found.join("\n - ")}`,
    );
  }
}

/* ------------------------------------------------------------- 执行 */

const chromiumPath = process.env["VERIFY_CHROME"] ??
  "C:/Users/imell/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe";

async function renderSvg(page, svg, size, background = null) {
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:${background ?? "transparent"}}img{display:block;width:${size}px;height:${size}px}</style><img src="${dataUrl}">`,
  );
  await page.waitForTimeout(120);
  return page.screenshot({ omitBackground: background === null });
}

async function main() {
  assertNoLegacyGlyph();
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: chromiumPath });
  const page = await browser.newPage();
  const written = [];

  // 1) 矢量资产
  const assets = [
    ["packages/ui/src/assets/app-badge.svg", badgeSvg()],
    ["packages/ui/src/assets/N.svg", watermarkSvg()],
    // 组件内联标记直接引用这份路径，避免"SVG 与组件各画一份"再次漂移。
    [
      "packages/ui/src/assets/brand-mark-paths.ts",
      `/**
 * NextCode 字形路径（${METRICS.boxWidth}×${METRICS.glyphHeight} 视图盒），由
 * \`scripts/generate-brand-assets.mjs\` 生成，勿手改；改字形请改脚本里的 N_PARAMS 后重跑。
 */
export const NEXTCODE_MARK_VIEW_BOX = "0 0 ${METRICS.boxWidth} ${METRICS.glyphHeight}";

export const NEXTCODE_MARK_PATHS: readonly string[] = [
${N_PATHS.map((d) => `  ${JSON.stringify(d)},`).join("\n")}
];
`,
    ],
  ];
  for (const [relPath, content] of assets) {
    if (!checkOnly) writeFileSync(resolve(repoRoot, relPath), content, "utf8");
    written.push(relPath);
  }

  // 2) 应用图标（mac 留白版 / Windows 满幅版）
  const macSvg = appIconSvg({ inset: 96, radiusRatio: 178 / 830 });
  const winSvg = appIconSvg({ inset: 0, radiusRatio: 129 / 1022 });
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
  const rendered = {};
  for (const size of sizes) {
    rendered[`mac-${size}`] = await renderSvg(page, macSvg, size);
    rendered[`win-${size}`] = await renderSvg(page, winSvg, size);
  }

  if (!checkOnly) {
    writeFileSync(resolve(repoRoot, "packages/desktop/build/icon.png"), rendered["mac-1024"]);
    writeFileSync(resolve(repoRoot, "packages/desktop/build/icon_windows.png"), rendered["win-1024"]);
    writeFileSync(resolve(repoRoot, "packages/desktop/build/icons/1024x1024.png"), rendered["win-1024"]);
    for (const size of sizes.filter((value) => value !== 1024)) {
      writeFileSync(resolve(repoRoot, `packages/desktop/build/icons/${size}x${size}.png`), rendered[`win-${size}`]);
    }
    const ico = buildIco(sizes.filter((size) => size <= 256).map((size) => ({ size, buffer: rendered[`win-${size}`] })));
    writeFileSync(resolve(repoRoot, "packages/desktop/build/icon.ico"), ico);
    writeFileSync(resolve(repoRoot, "packages/web/public/favicon.ico"), ico);
    written.push("packages/desktop/build/icon.png", "packages/desktop/build/icon_windows.png", "packages/desktop/build/icons/*", "packages/desktop/build/icon.ico", "packages/web/public/favicon.ico");
  }

  // 3) 预览图（供人工核对风格）
  mkdirSync(previewDir, { recursive: true });
  await page.setViewportSize({ width: 1200, height: 720 });
  const badgeData = `data:image/svg+xml;base64,${Buffer.from(badgeSvg(), "utf8").toString("base64")}`;
  await page.setContent(`<!doctype html><style>
    body{margin:0;padding:24px;background:#161616;display:flex;gap:24px;align-items:center;font-family:sans-serif;color:#999}
    .col{text-align:center}.stack{display:flex;align-items:flex-end;gap:10px;margin-top:8px}
    img{display:block;background:#0d0d0d;border-radius:6px}
  </style>
  <div class="col"><img src="${badgeData}" width="180"><div>app-badge.svg</div>
    <div class="stack"><img src="${badgeData}" width="32"><img src="${badgeData}" width="24"><img src="${badgeData}" width="18"></div></div>
  <div class="col"><img src="${rendered["mac-1024"].toString("base64").replace(/^/, "data:image/png;base64,")}" width="200"><div>icon.png（mac 留白版）</div></div>
  <div class="col"><img src="${rendered["win-1024"].toString("base64").replace(/^/, "data:image/png;base64,")}" width="200"><div>icon_windows.png（满幅版）</div></div>
  <div class="col"><div class="stack">${[256, 64, 48, 32, 24, 16].map((size) => `<img src="${rendered[`win-${size}`].toString("base64").replace(/^/, "data:image/png;base64,")}" width="${size}">`).join("")}</div><div>ICO 各尺寸</div></div>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(previewDir, "icons.png") });

  await browser.close();
  console.log(checkOnly ? "已生成预览（未写回仓库资产）" : `已写入：\n - ${written.join("\n - ")}`);
  console.log(`预览图：${resolve(previewDir, "icons.png")}`);
}

// 只在直接执行时生成资产；被 import 时（例如其他脚本取几何参数）不产生副作用。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

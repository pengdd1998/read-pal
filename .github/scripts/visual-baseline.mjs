#!/usr/bin/env node
// D3 · 视觉回归基线（评审建议 #18：防"幽灵标题"类回归复发）
//
//   node scripts/visual-baseline.mjs            # 首跑：采集基线
//   node scripts/visual-baseline.mjs --check    # 对比基线，超阈值退出 1
//
// 基线存 test-results/visual/baseline/。注意：视觉 diff 需要稳定渲染环境
// （固定视口/主题/字体就绪/动画禁用）；本脚本在采集与对比时统一注入
// reduced-motion，dev 字体闪烁由 waitForTimeout 缓冲。阈值 2% 像素容差。

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB = process.env.VISUAL_WEB || 'http://localhost:3000';
const API = process.env.VISUAL_API || 'http://localhost:8000';
const OUT = join(process.cwd(), 'test-results', 'visual');
const BASE = join(OUT, 'baseline');
const CHECK = process.argv.includes('--check');
const TOLERANCE = 0.02;
const PAGES = ['dashboard', 'library', 'search', 'stats', 'settings', 'synthesis', 'memory-books', 'knowledge'];
const VIEWPORT = { width: 1440, height: 900 };
const THEME = process.env.VISUAL_THEME || 'dark';

async function auth() {
  const email = `bt-visual-${Date.now()}@readpal-tests.example.com`;
  const r = await fetch(API + '/api/v1/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'BrowserTest123!', name: 'Visual' }),
  });
  return (await r.json())?.data?.token;
}

async function capture(browser, token) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'auth_token', value: token, url: WEB }]);
  await ctx.addInitScript((t, theme) => {
    localStorage.setItem('auth_token', t);
    localStorage.setItem('read-pal-tour-complete', '1');
    localStorage.setItem('read-pal-onboarding-complete', '1');
    localStorage.setItem('theme', theme);
  }, token, THEME);
  const page = await ctx.newPage();
  const shots = {};
  for (const pg of PAGES) {
    await page.goto(`${WEB}/en/${pg}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    shots[pg] = await page.screenshot();
  }
  await ctx.close();
  return shots;
}

function diffPercent(aBuf, bBuf) {
  // 像素级粗 diff：PNG 解码用 playwright 的 chromium 离屏画布（避免引入 pngjs）
  return null; // placeholder — 见下方 compare()（用画布实现）
}

let browser;
try {
  const token = await auth();
  if (!token) throw new Error('注册失败');
  browser = await chromium.launch();
  const shots = await capture(browser, token);
  mkdirSync(BASE, { recursive: true });

  if (!CHECK) {
    for (const [pg, buf] of Object.entries(shots)) writeFileSync(join(BASE, `${pg}.png`), buf);
    writeFileSync(join(OUT, 'baseline-meta.json'), JSON.stringify({
      capturedAt: new Date().toISOString(), viewport: VIEWPORT, theme: THEME, pages: PAGES,
    }, null, 2));
    console.log(`基线已采集：${Object.keys(shots).length} 页 → ${BASE}`);
  } else {
    if (!existsSync(join(BASE, `${PAGES[0]}.png`))) {
      console.error('无基线。先不带 --check 跑一次采集。');
      process.exitCode = 1;
    } else {
      // 用 chromium 离屏页做像素 diff（避免额外依赖）
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const regressions = [];
      for (const pg of PAGES) {
        const baseP = join(BASE, `${pg}.png`);
        if (!existsSync(baseP)) { regressions.push([pg, '基线缺失', 1]); continue; }
        const b64a = readFileSync(baseP).toString('base64');
        const b64b = shots[pg].toString('base64');
        const pct = await page.evaluate(async ([a, b]) => {
          const load = (d) => new Promise((res) => {
            const img = new Image();
            img.onload = () => res(img);
            img.src = 'data:image/png;base64,' + d;
          });
          const [ia, ib] = await Promise.all([load(a), load(b)]);
          if (ia.width !== ib.width || ia.height !== ib.height) return 1;
          const cv = document.createElement('canvas');
          cv.width = ia.width; cv.height = ia.height;
          const cx = cv.getContext('2d');
          cx.drawImage(ia, 0, 0);
          const da = cx.getImageData(0, 0, cv.width, cv.height).data;
          cx.clearRect(0, 0, cv.width, cv.height);
          cx.drawImage(ib, 0, 0);
          const db = cx.getImageData(0, 0, cv.width, cv.height).data;
          let diff = 0;
          for (let i = 0; i < da.length; i += 4) {
            if (Math.abs(da[i] - db[i]) > 16 || Math.abs(da[i + 1] - db[i + 1]) > 16 || Math.abs(da[i + 2] - db[i + 2]) > 16) diff++;
          }
          return diff / (da.length / 4);
        }, [b64a, b64b]);
        console.log(`  ${pg}: ${(pct * 100).toFixed(2)}% 像素差异`);
        if (pct > TOLERANCE) regressions.push([pg, `${(pct * 100).toFixed(2)}%`, pct]);
      }
      await ctx.close();
      writeFileSync(join(OUT, 'check-result.json'), JSON.stringify({ at: new Date().toISOString(), regressions }, null, 2));
      if (regressions.length) {
        console.error(`\n❌ 视觉回归 ${regressions.length} 页超 ${(TOLERANCE * 100).toFixed(0)}% 容差`);
        process.exitCode = 1;
      } else {
        console.log(`\n✅ 无视觉回归（容差 ${(TOLERANCE * 100).toFixed(0)}%）`);
      }
    }
  }
} catch (err) {
  console.error('中断：', err.message);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
}

// Captures en lecture seule du portail V6 (aucun formulaire soumis, aucune connexion).
// Usage : node capture.mjs   (Playwright + Chromium préinstallés)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');

const BASE = 'https://wilayamascara.dz/v6/index.php';
const OUT = new URL('./captures/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const note = (s) => appendFileSync(OUT + 'notes.md', `- ${s}\n`);

const pages = [
  ['01-accueil', '/fr', '/ar'],
  ['02-actualites', '/fr/news', '/ar/news'],
  ['03-collectivites', '/fr/collectivites', null],
  ['04-secteurs', '/fr/secteurs', null],
  ['05-histoire', '/fr/histoire-et-presentation', null],
  ['06-recherche', '/fr/recherche?q=wali', null],
];
const external = [
  ['07-chakawi', 'https://chakawi.wilayamascara.dz'],
  ['08-chakawi-admin-connexion', 'https://chakwaadmin.wilayamascara.dz'],
  ['09-permis-construire', 'https://wilayamascara.dz/pconst/'],
];
const devices = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

async function shoot(ctx, url, name) {
  const page = await ctx.newPage();
  try {
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    if (!res || res.status() >= 400) throw new Error(`HTTP ${res ? res.status() : '?'}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(8000); // carrousel, météo, lazy images
    await page.screenshot({ path: `${OUT}${name}.png` });
    await page.screenshot({ path: `${OUT}${name}-pleine-page.png`, fullPage: true });
    console.log('ok', name);
    return page;
  } catch (e) {
    note(`${name} (${url}) : non capturé, ${e.message}`);
    console.log('ÉCHEC', name, e.message);
    await page.close();
    return null;
  }
}

const browser = await chromium.launch();
for (const [dev, opts] of Object.entries(devices)) {
  const ctx = await browser.newContext({ ...opts, locale: 'fr-FR' });
  for (const [name, fr, ar] of pages) {
    for (const [lang, path] of [['fr', fr], ['ar', ar]]) {
      if (!path) continue;
      const p = await shoot(ctx, BASE + path, `${name}-${lang}-${dev}`);
      if (p) await p.close();
    }
  }
  for (const [name, url] of external) {
    const p = await shoot(ctx, url, `${name}-${dev}`);
    if (p) await p.close();
  }
  await ctx.close();
}

// Charte : couleurs et polices réellement utilisées sur l'accueil.
const ctx = await browser.newContext(devices.desktop);
const page = await ctx.newPage();
try {
  await page.goto(BASE + '/fr', { waitUntil: 'networkidle', timeout: 60000 });
  const charte = await page.evaluate(() => {
    const colors = {}, fonts = {};
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      for (const c of [cs.color, cs.backgroundColor]) if (c && !c.endsWith(', 0)')) colors[c] = (colors[c] || 0) + 1;
      fonts[cs.fontFamily] = (fonts[cs.fontFamily] || 0) + 1;
    }
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 15);
    return { colors: top(colors), fonts: top(fonts), emblems: [...document.images].map((i) => i.src).filter((s) => /emblem|logo/i.test(s)) };
  });
  writeFileSync(OUT + 'charte-relevee.json', JSON.stringify(charte, null, 2));
  for (const src of charte.emblems) {
    const r = await ctx.request.get(src);
    if (r.ok()) writeFileSync(OUT + 'emblem-' + src.split('/').pop(), await r.body());
  }
} catch (e) {
  note(`charte : non relevée, ${e.message}`);
}
await browser.close();

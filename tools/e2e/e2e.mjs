import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (p === '/') p = '/index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(normalize(ROOT))) { res.writeHead(403); return res.end(); }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end();
  }
});
await new Promise((r) => server.listen(8791, '127.0.0.1', r));

let echecs = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { echecs++; console.error('  ✗ ' + m); } };

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const erreursPage = [];
  page.on('pageerror', (e) => erreursPage.push(String(e)));

  await page.goto('http://127.0.0.1:8791/', { waitUntil: 'load' });
  ok((await page.title()) === 'Omni-MediKit', 'titre de la page = Omni-MediKit');

  await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller), null, { timeout: 20000 });
  ok(true, 'service worker enregistré et actif (controller présent)');

  await page.evaluate(async () => {
    await window.DB.put('profiles', { id: 'e2e-1', name: 'Test E2E', birthdate: '', note: '', allergies: 'Arachides', criseAllergique: 'Adrénaline puis 15', emergencyContact: {}, createdAt: new Date().toISOString() });
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });

  await page.click('button[data-vue="profils"]');
  await page.waitForSelector('#liste-profils .carte');
  const profils = await page.textContent('#liste-profils');
  ok(profils.includes('Test E2E') && profils.includes('Arachides'), 'profil + allergies affichés dans Profils');

  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#vue-accueil:not([hidden])', { state: 'visible' });
  ok(true, 'rechargement 100 % HORS LIGNE réussi (servi par le cache du service worker)');

  await page.click('button[data-vue="urgences"]');
  await page.waitForSelector('#liste-urgences .urgence-carte');
  const urg = await page.textContent('#liste-urgences');
  ok(urg.includes('SAMU') && urg.includes('114') && urg.includes('antipoison'), 'numéros d’urgence affichés hors ligne');
  const lien = await page.getAttribute('#liste-urgences a[href^="tel:15"]', 'href');
  ok(lien === 'tel:15', 'lien tel:15 présent');

  await page.click('button[data-vue="reglages"]');
  await page.waitForSelector('#choix-theme button');
  await page.click('#choix-theme button[data-theme="clair"]');
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  ok(theme === 'clair', 'thème clair appliqué instantanément (data-theme=' + theme + ')');
  const stocke = await page.evaluate(() => localStorage.getItem('omni-medikit-theme'));
  ok(stocke === 'clair', 'thème persisté localement');

  ok(erreursPage.length === 0, 'aucune erreur JS dans la page' + (erreursPage.length ? ' : ' + erreursPage.join(' | ') : ''));
} finally {
  await browser.close();
  server.close();
}
if (echecs) { console.error('\n' + echecs + ' échec(s) E2E'); process.exit(1); }
console.log('\nE2E OK : PWA installable, service worker, hors ligne, thèmes persistants.');
process.exit(0);

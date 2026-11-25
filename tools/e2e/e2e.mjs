import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    for (const dir of (process.env.NODE_PATH || '').split(delimiter).filter(Boolean)) {
      const candidate = join(dir, 'playwright', 'index.mjs');
      if (existsSync(candidate)) {
        return await import(pathToFileURL(candidate).href);
      }
    }
    const req = createRequire(import.meta.url);
    return await import(pathToFileURL(req.resolve('playwright')).href);
  }
}

const { chromium } = await loadPlaywright();

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (p === '/') p = '/index.html';
    const file = resolve(ROOT, '.' + p);
    if (file !== ROOT && !file.startsWith(ROOT + sep)) {
      res.writeHead(403);
      return res.end();
    }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let echecs = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { echecs++; console.error('  ✗ ' + m); } };

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const erreursPage = [];
  const consoleErrors = [];
  const externalRequests = [];
  let ignore503ConsoleError = false;

  page.on('pageerror', (e) => erreursPage.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      if (ignore503ConsoleError && txt.includes('503')) return;
      consoleErrors.push(txt);
    }
  });
  page.on('request', (req) => {
    const url = req.url();
    if (!url.startsWith(BASE) && !url.startsWith('data:') && !url.startsWith('blob:')) {
      externalRequests.push(url);
    }
  });

  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations.push({
        violatedDirective: e.violatedDirective,
        effectiveDirective: e.effectiveDirective,
        blockedURI: e.blockedURI
      });
    });
    document.addEventListener('DOMContentLoaded', () => {
      window.__prePaint = {
        theme: document.documentElement.dataset.theme || '',
        taille: document.documentElement.dataset.taille || ''
      };
    });
  });

  await page.goto(BASE + '/', { waitUntil: 'load' });
  ok((await page.title()) === 'Omni-MediKit', 'titre de la page = Omni-MediKit');

  const staticChecks = await page.evaluate(() => {
    const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') || '';
    const inlineScripts = document.querySelectorAll('script:not([src])').length;
    const inlineStyles = document.querySelectorAll('[style]').length;
    const h1s = Array.from(document.querySelectorAll('h1'));
    const h1Ok = h1s.length >= 1 && h1s.some((h) => h.textContent.trim().length > 0);
    const bodyText = document.body.innerText || '';
    const hasVouvoiement = /\b(?<!rendez-)vous\b|\bvotre\b|\bvos\b|\b(ouvrez|entrez|gérez|configurez|choisissez|exportez|réimportez|activez|protégez|touchez|appelez|scannez|autorisez|utilisez|complétez|créez)\b/i.test(bodyText);
    const aPropos = document.querySelector('#a-propos')?.textContent || '';
    const pied = document.querySelector('footer.pied')?.textContent || '';
    return { csp, inlineScripts, inlineStyles, h1Ok, hasVouvoiement, aPropos, pied };
  });

  ok(staticChecks.csp.includes("default-src 'self'") && staticChecks.csp.includes("img-src 'self' data:"), 'CSP stricte présente avec img-src self data:');
  ok(staticChecks.inlineScripts === 0, 'zéro script inline dans le DOM');
  ok(staticChecks.inlineStyles === 0, 'zéro attribut [style] initial dans le DOM');
  ok(staticChecks.h1Ok, 'balise <h1> structurante visible avec contenu');
  ok(!staticChecks.hasVouvoiement, 'tutoiement respecté dans le texte affiché');
  ok(
    staticChecks.aPropos.includes('CC BY-NC-ND 4.0') &&
    staticChecks.aPropos.includes('Ferrus Dantioch') &&
    staticChecks.aPropos.includes('omni-systeme.choking513@passmail.net'),
    'mentions licence + Ferrus Dantioch + contact dans #a-propos'
  );
  ok(
    staticChecks.pied.includes('CC BY-NC-ND 4.0') &&
    staticChecks.pied.includes('Ferrus Dantioch') &&
    staticChecks.pied.includes('omni-systeme.choking513@passmail.net'),
    'mentions licence + Ferrus Dantioch + contact dans footer.pied'
  );

  // Manifeste & icônes HTTP 200
  const assetCheck = await page.evaluate(async () => {
    const res = await fetch('/manifest.json');
    const man = await res.json();
    const urls = new Set([
      ...man.icons.map((i) => '/' + i.src),
      ...(man.shortcuts || []).flatMap((s) => (s.icons || []).map((i) => '/' + i.src)),
      '/icons/apple-touch-icon.png',
      '/icons/favicon.ico'
    ]);
    const results = [];
    for (const u of urls) {
      const r = await fetch(u);
      const b = await r.arrayBuffer();
      results.push({ url: u, status: r.status, bytes: b.byteLength });
    }
    return { status: res.status, man, results };
  });
  ok(assetCheck.status === 200 && assetCheck.man.id === '/omni-medikit/' && assetCheck.man.version === '1.3.0', 'manifest.json v1.3.0 avec id /omni-medikit/');
  ok(assetCheck.man.icons.some((i) => i.src === 'icons/icon-maskable-192.png' && i.purpose === 'maskable'), 'icon-maskable-192.png présente dans manifest.json');
  ok(assetCheck.results.every((r) => r.status === 200 && r.bytes > 0), 'toutes les icônes (dont apple-touch-icon et favicon.ico) répondent HTTP 200 non vides');

  // Service worker actif + pré-cache omni-medikit-1.3.0
  await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller), null, { timeout: 20000 });
  ok(true, 'service worker enregistré et actif (controller présent)');

  const swCache = await page.evaluate(async () => {
    const keys = await caches.keys();
    const hasCache = keys.includes('omni-medikit-1.3.0');
    const c = await caches.open('omni-medikit-1.3.0');
    const reqs = await c.keys();
    const urls = reqs.map((r) => new URL(r.url).pathname);
    return { hasCache, urls };
  });
  ok(
    swCache.hasCache &&
    swCache.urls.some((u) => u.endsWith('/js/theme-init.js')) &&
    swCache.urls.some((u) => u.endsWith('/icons/icon-maskable-192.png')) &&
    swCache.urls.some((u) => u.endsWith('/icons/apple-touch-icon.png')) &&
    swCache.urls.some((u) => u.endsWith('/index.html')) &&
    swCache.urls.some((u) => u.endsWith('/manifest.json')),
    'pré-cache omni-medikit-1.3.0 contient tous les assets requis'
  );

  // Données de test + navigation des 8 vues sans [style]
  await page.evaluate(async () => {
    await window.DB.put('profiles', { id: 'e2e-1', name: 'Test E2E', birthdate: '', note: '', allergies: 'Arachides', criseAllergique: 'Adrénaline puis 15', emergencyContact: { name: 'Contact', phone: '0612345678', mode: 'appel' }, createdAt: new Date().toISOString() });
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });

  for (const vue of ['accueil', 'traitements', 'vaccins', 'contacts', 'urgences', 'constantes', 'profils', 'reglages']) {
    await page.click(`button[data-vue="${vue}"]`);
    const styleCount = await page.evaluate(() => document.querySelectorAll('[style]').length);
    ok(styleCount === 0, `zéro attribut [style] sur la vue ${vue}`);
  }
  ok((await page.textContent('#version-app')) === 'v1.3.0', 'version affichée = v1.3.0 dans Réglages');

  // QR code sous CSP stricte
  await page.click('#btn-qr-export');
  await page.waitForSelector('#qr-cadre img[src^="data:image/png"], #qr-cadre canvas', { timeout: 10000 });
  const qrTexte = await page.textContent('#qr-compteur');
  ok(qrTexte.startsWith('Image 1 /'), 'export QR généré sous CSP stricte (' + qrTexte + ')');
  await page.click('#modal-annuler');

  await page.click('button[data-vue="profils"]');
  await page.waitForSelector('#liste-profils .carte');
  const profils = await page.textContent('#liste-profils');
  ok(profils.includes('Test E2E') && profils.includes('Arachides'), 'profil + allergies affichés dans Profils');

  // Thème & taille de texte persistés avant paint via js/theme-init.js
  await page.click('button[data-vue="reglages"]');
  await page.waitForSelector('#choix-theme button');
  await page.click('#choix-theme button[data-theme="clair"]');
  await page.click('#choix-taille button[data-taille="grand"]');
  const stockeTheme = await page.evaluate(() => localStorage.getItem('omni-medikit-theme'));
  const stockeTaille = await page.evaluate(() => localStorage.getItem('omni-medikit-taille'));
  ok(stockeTheme === 'clair' && stockeTaille === 'grand', 'thème clair et taille grand persistés dans localStorage');

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
  const prePaint = await page.evaluate(() => window.__prePaint);
  ok(prePaint.theme === 'clair' && prePaint.taille === 'grand', 'theme-init.js restaure thème et taille avant le rendu initial');

  // Revenir sur Accueil (#accueil) avant le test de rechargement hors ligne
  await page.click('button[data-vue="accueil"]');
  await page.waitForSelector('#vue-accueil:not([hidden])', { state: 'visible' });

  // Mode hors ligne
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

  // Cache exact vérifié AVANT fallback navigate -> index.html
  const manOffline = await page.goto(BASE + '/manifest.json', { waitUntil: 'load' });
  const manOfflineJson = await manOffline.json().catch(() => null);
  ok(manOffline.status() === 200 && manOfflineJson && manOfflineJson.name === 'Omni-MediKit' && manOfflineJson.version === '1.3.0', 'navigation hors ligne vers /manifest.json sert le cache exact (JSON 200)');

  // Sonde 503 hors ligne pour ressource non mise en cache
  await page.goto(BASE + '/', { waitUntil: 'load' });
  ignore503ConsoleError = true;
  const probeStatus = await page.evaluate(() => fetch('/uncached-offline-probe.json').then((r) => r.status));
  ignore503ConsoleError = false;
  ok(probeStatus === 503, 'ressource absente du cache hors ligne retourne HTTP 503 (reçu ' + probeStatus + ')');

  const cspViolations = await page.evaluate(() => window.__cspViolations || []);
  ok(externalRequests.length === 0, 'zéro requête réseau externe (' + externalRequests.join(', ') + ')');
  ok(cspViolations.length === 0, 'zéro violation CSP (' + JSON.stringify(cspViolations) + ')');
  ok(erreursPage.length === 0, 'aucune erreur JS dans la page' + (erreursPage.length ? ' : ' + erreursPage.join(' | ') : ''));
  ok(consoleErrors.length === 0, 'aucune erreur console' + (consoleErrors.length ? ' : ' + consoleErrors.join(' | ') : ''));
} finally {
  await browser.close();
  server.close();
}
if (echecs) { console.error('\n' + echecs + ' échec(s) E2E'); process.exit(1); }
console.log('\nE2E OK : 0 requête externe, CSP stricte, SW 1.3.0 isolé + 503, QR, thèmes pré-paint.');
process.exit(0);

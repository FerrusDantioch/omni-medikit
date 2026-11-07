#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function Req(result) { this.result = result; }
Object.defineProperty(Req.prototype, 'onsuccess', {
  set(f) { queueMicrotask(() => f({ target: this })); },
  get() { return null; }
});
Object.defineProperty(Req.prototype, 'onerror', {
  set(f) { queueMicrotask(() => f({ target: this, error: new Error('idb') })); },
  get() { return null; }
});

const memoire = {};
function storeData(nom) { return memoire[nom] || (memoire[nom] = new Map()); }
const dbStub = {
  objectStoreNames: { contains: () => false },
  createObjectStore: () => {},
  transaction(nom) {
    const data = storeData(nom);
    const os = {
      indexNames: { contains: () => false },
      getAll: () => new Req(Array.from(data.values())),
      get: (id) => new Req(data.get(id)),
      put: (o) => { data.set(o.id, o); return new Req(o.id); },
      delete: (id) => { data.delete(id); return new Req(undefined); },
      clear: () => { data.clear(); return new Req(undefined); },
      index: () => os
    };
    return { objectStore: () => os };
  }
};
globalThis.indexedDB = { open: () => { const r = new Req(dbStub); queueMicrotask(() => { if (r.onupgradeneeded) r.onupgradeneeded({ target: r }); }); return r; } };

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
const sections = [...html.matchAll(/<section class="vue" id="(vue-[a-z]+)"/g)].map((m) => m[1]);
const navVues = [...html.matchAll(/<button type="button" data-vue="([a-z]+)"/g)].map((m) => m[1]);

function makeEl(id) {
  const el = {
    id: id || '',
    innerHTML: '', textContent: '', value: '', hidden: false, className: '',
    dataset: {}, style: {}, attrs: {},
    children: [],
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    remove() {}, focus() {}, click() {},
    closest() { return null; },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    showModal() {}, close() {},
    elements: {}
  };
  return el;
}
const elMap = {};
for (const id of ids) elMap[id] = makeEl(id);
const themeBtns = ['charte', 'sombre', 'clair'].map((t) => { const b = makeEl(); b.dataset.theme = t; b.textContent = t; return b; });
const navBtns = navVues.map((v) => { const b = makeEl(); b.dataset.vue = v; return b; });
const sectionEls = sections.map((id) => elMap[id] || (elMap[id] = makeEl(id)));

globalThis.window = globalThis;
globalThis.document = {
  documentElement: { dataset: {}, setAttribute() {} },
  body: makeEl('body'),
  addEventListener() {},
  createElement: () => makeEl(),
  querySelector(sel) {
    if (sel.startsWith('#')) return elMap[sel.slice(1)] || (elMap[sel.slice(1)] = makeEl(sel.slice(1)));
    return makeEl();
  },
  querySelectorAll(sel) {
    if (sel === '.vue') return sectionEls;
    if (sel === '.nav button') return navBtns;
    if (sel === '#choix-theme button') return themeBtns;
    return [];
  }
};
globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] || null; }, setItem(k, v) { this._m[k] = String(v); } };
const swRegStub = { addEventListener() {}, update: () => Promise.resolve(), waiting: null, installing: null };
Object.defineProperty(globalThis, 'navigator', {
  value: {
    serviceWorker: {
      controller: null,
      addEventListener() {},
      register: () => Promise.resolve(swRegStub)
    }
  },
  configurable: true
});
globalThis.scrollTo = () => {};
window.scrollTo = () => {};

require(path.join(ROOT, 'js/logique.js'));
const DB = require(path.join(ROOT, 'js/db.js'));

(async () => {
  await DB.put('profiles', { id: 'p1', name: 'Léa', birthdate: '2015-04-02', note: 'Allergique aux arachides', emergencyContact: { name: 'Maman', phone: '06 12 34 56 78', mode: 'sms', smsText: 'Urgence {prenom} !' }, createdAt: '2026-01-01T00:00:00.000Z' });
  await DB.put('profiles', { id: 'p2', name: 'Marc', birthdate: '', note: '', emergencyContact: { name: 'Épouse', phone: '0698765432', mode: 'appel', smsText: '' }, createdAt: '2026-01-01T00:00:00.000Z' });
  const today = globalThis.Logique.aujourdhui();
  await DB.put('treatments', { id: 't1', profileId: 'p1', name: 'Doliprane', dosage: '1 comprimé', startDate: today, endDate: globalThis.Logique.ajouterJours(today, 5), lifetime: false, frequency: { type: 'fois', foisParJour: 2 }, note: '', createdAt: today });
  await DB.put('treatments', { id: 't2', profileId: 'p1', name: 'Levothyrox', dosage: '50 µg', startDate: '2025-01-01', endDate: '', lifetime: true, frequency: { type: 'quotidien' }, note: '', createdAt: '2025-01-01' });
  await DB.put('treatments', { id: 't3', profileId: 'p2', name: 'Ventoline', dosage: '', startDate: today, endDate: globalThis.Logique.ajouterJours(today, 20), lifetime: false, frequency: { type: 'jours', jours: [1, 3, 5] }, note: '', createdAt: today });
  await DB.put('doses', { id: 'd1', treatmentId: 't1', profileId: 'p1', date: today, time: '08:00', takenAt: new Date().toISOString(), note: '' });
  await DB.put('vaccines', { id: 'v1', profileId: 'p1', name: 'ROR', lastDate: '2025-06-01', reminderDate: globalThis.Logique.ajouterJours(today, 10), note: '' });
  await DB.put('contacts', { id: 'c1', profileId: '', name: 'Dr Martin', specialty: 'Médecin traitant', phone: '01 23 45 67 89', address: '12 rue de la Santé', note: '' });
  await DB.put('contacts', { id: 'c2', profileId: 'p1', name: 'Dr Petit', specialty: 'Pédiatre', phone: '0611223344', address: '', note: '' });
  await DB.setSetting('theme', 'charte');
  await DB.setSetting('profilActif', 'p1');
  await DB.setSetting('duo', { mode: 'duo', a: 'p1', b: 'p2' });

  require(path.join(ROOT, 'js/app.js'));
  await new Promise((r) => setTimeout(r, 300));

  const $ = (id) => elMap[id];
  let echecs = 0;
  const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { echecs++; console.error('  ✗ ' + m); } };

  ok(document.documentElement.dataset.theme === 'charte', 'thème appliqué: ' + document.documentElement.dataset.theme);
  ok($('date-du-jour').textContent.length > 5, 'date du jour affichée: "' + $('date-du-jour').textContent + '"');
  const duo = $('panels-duo').innerHTML;
  ok(duo.includes('Léa') && duo.includes('Marc'), 'mode duo: deux panneaux rendus');
  ok(duo.includes('Doliprane') && duo.includes('Levothyrox'), 'traitements de Léa rendus');
  ok(duo.includes('Ventoline'), 'traitement de Marc rendu');
  ok(duo.includes('Pris ✓'), 'bouton Pris présent');
  ok(duo.includes('1/2'), 'compteur de prises 1/2 affiché');
  ok(duo.includes('ROR'), 'rappel vaccin affiché dans le panneau');
  ok(duo.includes('sms:0612345678'), 'lien SMS du contact d’urgence (Léa)');
  ok($('liste-profils').innerHTML.includes('Allergique aux arachides'), 'page profils: note affichée');
  ok($('liste-traitements').innerHTML.includes('Historique des prises'), 'page traitements: bouton historique');
  ok($('liste-traitements').innerHTML.includes('À vie'), 'statut À vie rendu');
  ok($('liste-vaccins').innerHTML.includes('ROR'), 'page vaccins: ROR listé');
  ok($('liste-contacts').innerHTML.includes('Dr Martin') && $('liste-contacts').innerHTML.includes('tel:0123456789'), 'contacts: globaux listés avec tel:');
  const urg = $('liste-urgences').innerHTML;
  for (const n of ['tel:15', 'tel:17', 'tel:18', 'tel:112', 'tel:114', 'sms:114']) ok(urg.includes(n), 'urgence ' + n + ' présente');
  ok($('contacts-urgence').innerHTML.includes('Appeler') || $('contacts-urgence').innerHTML.includes('SMS'), 'contacts d’urgence par personne rendus');
  ok($('info-donnees').textContent.includes('2 profil(s)'), 'compteurs réglages: ' + $('info-donnees').textContent);
  ok($('panels').hidden === true && $('panels-duo').hidden === false, 'bascule solo/duo cohérente');
  ok(sectionEls.find((s) => s.id === 'vue-accueil').hidden === false, 'vue accueil visible');
  ok($('toast') !== undefined, 'toast présent');
  ok($('bandeau-mise-a-jour').hidden === true, 'bandeau mise à jour caché sans nouvelle version');
  ok($('version-app').textContent === 'v1.0.1', 'version affichée: ' + $('version-app').textContent);
  ok(html.includes('btn-mise-a-jour') && html.includes('btn-verifier-maj'), 'boutons « Mettre à jour » présents (bandeau + réglages)');
  const posAccueil = html.indexOf('id="vue-accueil"');
  const posBandeau = html.indexOf('id="bandeau-mise-a-jour"');
  const posFinAccueil = html.indexOf('id="vue-traitements"');
  ok(posAccueil !== -1 && posBandeau > posAccueil && posBandeau < posFinAccueil, 'bandeau « Mettre à jour » placé dans la vue Accueil uniquement');

  if (echecs) { console.error('\n' + echecs + ' échec(s)'); process.exit(1); }
  console.log('\nTest UI (rendu complet avec données) : tous les contrôles passent.');
})().catch((e) => { console.error(e); process.exit(1); });

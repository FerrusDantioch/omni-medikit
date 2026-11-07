(function (root) {
  'use strict';

  const DB_NOM = 'omni-medikit';
  const DB_VERSION = 2;
  const STORES = ['profiles', 'treatments', 'doses', 'vaccines', 'contacts', 'settings'];
  const INDEXES = {
    treatments: [['byProfile', 'profileId']],
    doses: [['byProfile', 'profileId'], ['byTreatment', 'treatmentId'], ['byDate', 'date']],
    vaccines: [['byProfile', 'profileId']],
    contacts: [['byProfile', 'profileId']]
  };

  let dbPromise = null;

  function ouvrir() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NOM, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        const tx = req.transaction;
        for (const nom of STORES) {
          const s = db.objectStoreNames.contains(nom) ? tx.objectStore(nom) : db.createObjectStore(nom, { keyPath: 'id' });
          for (const [indexNom, cle] of (INDEXES[nom] || [])) {
            if (!s.indexNames.contains(indexNom)) s.createIndex(indexNom, cle, { unique: false });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function store(nom, mode) {
    return ouvrir().then((db) => db.transaction(nom, mode).objectStore(nom));
  }

  function reqVersPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function tout(nom) {
    const s = await store(nom, 'readonly');
    return reqVersPromise(s.getAll());
  }

  async function obtenir(nom, id) {
    const s = await store(nom, 'readonly');
    return reqVersPromise(s.get(id));
  }

  async function put(nom, objet) {
    const s = await store(nom, 'readwrite');
    return reqVersPromise(s.put(objet));
  }

  async function supprimer(nom, id) {
    const s = await store(nom, 'readwrite');
    return reqVersPromise(s.delete(id));
  }

  async function supprimerTout(nom) {
    const s = await store(nom, 'readwrite');
    return reqVersPromise(s.clear());
  }

  async function parIndex(nom, indexNom, valeur) {
    const s = await store(nom, 'readonly');
    if (!s.indexNames.contains(indexNom)) return tout(nom);
    return reqVersPromise(s.index(indexNom).getAll(valeur));
  }

    async function getSetting(cle, defaut) {
    const s = await store('settings', 'readonly');
    const r = await reqVersPromise(s.get(cle));
    return r ? r.value : defaut;
  }

  async function setSetting(cle, value) {
    const s = await store('settings', 'readwrite');
    return reqVersPromise(s.put({ id: cle, value }));
  }

    async function supprimerProfilCascade(id) {
    await supprimer('profiles', id);
    for (const nom of ['treatments', 'vaccines', 'contacts', 'doses']) {
      for (const o of await parIndex(nom, 'byProfile', id)) await supprimer(nom, o.id);
    }
  }

    async function supprimerTraitementCascade(id) {
    await supprimer('treatments', id);
    for (const d of await parIndex('doses', 'byTreatment', id)) await supprimer('doses', d.id);
  }

  async function exporterTout() {
    const data = {};
    for (const nom of STORES) data[nom] = await tout(nom);
    return {
      app: 'Omni-MediKit',
      format: 1,
      exporteLe: new Date().toISOString(),
      data
    };
  }

  async function importerTout(json) {
    if (!json || json.app !== 'Omni-MediKit' || !json.data) {
      throw new Error('Fichier invalide : ce n\'est pas une exportation Omni-MediKit.');
    }
    for (const nom of STORES) {
      if (!Array.isArray(json.data[nom])) throw new Error('Fichier invalide : la section « ' + nom + ' » est absente.');
    }
    for (const nom of STORES) await supprimerTout(nom);
    for (const nom of STORES) {
      for (const objet of json.data[nom]) {
        if (!objet || typeof objet.id !== 'string') throw new Error('Fichier invalide : enregistrement sans identifiant dans « ' + nom + ' ».');
        await put(nom, objet);
      }
    }
  }

  const DB = {
    STORES, ouvrir, tout, obtenir, put, supprimer, supprimerTout, parIndex,
    getSetting, setSetting, supprimerProfilCascade, supprimerTraitementCascade,
    exporterTout, importerTout
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = DB;
  root.DB = DB;
})(typeof window !== 'undefined' ? window : globalThis);

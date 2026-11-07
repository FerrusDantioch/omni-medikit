(function () {
  'use strict';

  const L = window.Logique;
  const DB = window.DB;

  const URGENCES = [
    { nom: 'SAMU', num: '15', desc: 'Urgences médicales, dans toute la France.', liens: [{ label: 'Appeler le 15', href: 'tel:15' }] },
    { nom: 'Police secours', num: '17', desc: 'Danger immédiat pour les personnes ou les biens.', liens: [{ label: 'Appeler le 17', href: 'tel:17' }] },
    { nom: 'Pompiers', num: '18', desc: 'Incendie, accident, secours à personne.', liens: [{ label: 'Appeler le 18', href: 'tel:18' }] },
    { nom: 'Numéro d’urgence européen', num: '112', desc: 'Depuis un mobile, en France comme dans toute l’UE.', liens: [{ label: 'Appeler le 112', href: 'tel:112' }] },
    { nom: 'Sourds et malentendants', num: '114', desc: 'Accessible par SMS, fax, visiophonie ou appel.', liens: [{ label: 'Appeler le 114', href: 'tel:114' }, { label: 'SMS 114', href: 'sms:114?&body=' }] },
    { nom: 'Centre antipoison', num: '15', desc: 'Intoxication : appelez le 15 ou le 112, le SAMU oriente vers le centre antipoison régional.', liens: [{ label: 'Appeler le 15', href: 'tel:15' }] }
  ];

  const SMS_DEFAUT = 'Urgence : {prenom} a besoin d’aide immédiate. Merci d’appeler les secours (15).';

  const etat = {
    vue: 'accueil',
    profiles: [],
    treatments: [],
    doses: [],
    vaccines: [],
    contacts: [],
    constantes: [],
    profilActif: null,
    duo: { mode: 'solo', a: null, b: null },
    filtreTraitements: '',
    filtreVaccins: '',
    filtreContacts: '',
    rechercheTraitements: '',
    rechercheContacts: '',
    rappels: false,
    lock: null,
    tailleTexte: 'normal',
    filtreConstantes: '',
    theme: 'charte'
  };

  const VUES = ['accueil', 'traitements', 'vaccins', 'contacts', 'urgences', 'constantes', 'profils', 'reglages'];

  const TYPES_CONSTANTES = {
    tension: 'Tension (ex. 12/8)',
    poids: 'Poids (kg)',
    temperature: 'Température (°C)',
    glycemie: 'Glycémie (g/L)'
  };

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const esc = (s) => L.escapeHtml(s);

  function heureActuelle() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  let toastTimer = null;
  function toast(msg, estErreur) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'visible' + (estErreur ? ' erreur' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 4200);
  }

  function profil(id) { return etat.profiles.find((p) => p.id === id); }
  function nomProfil(id) {
    const p = profil(id);
    return p ? p.name : 'Profil supprimé';
  }

  async function chargerDonnees() {
    const [profiles, treatments, doses, vaccines, contacts, constantes] = await Promise.all([
      DB.tout('profiles'), DB.tout('treatments'), DB.tout('doses'),
      DB.tout('vaccines'), DB.tout('contacts'), DB.tout('constantes')
    ]);
    etat.profiles = profiles.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    etat.treatments = treatments;
    etat.doses = doses;
    etat.vaccines = vaccines;
    etat.contacts = contacts;
    etat.constantes = constantes;
    etat.profilActif = await DB.getSetting('profilActif', null);
    if (!etat.profilActif || !profil(etat.profilActif)) etat.profilActif = etat.profiles[0] ? etat.profiles[0].id : null;
    etat.duo = await DB.getSetting('duo', { mode: 'solo', a: etat.profilActif, b: null });
    if (etat.duo.a && !profil(etat.duo.a)) etat.duo.a = etat.profilActif;
    if (etat.duo.b && !profil(etat.duo.b)) etat.duo.b = null;
    etat.theme = await DB.getSetting('theme', 'charte');
    etat.rappels = await DB.getSetting('rappels', false);
    etat.lock = await DB.getSetting('lock', null);
    etat.tailleTexte = await DB.getSetting('tailleTexte', 'normal');
  }

  async function sauvegarderCle(cle, valeur) { await DB.setSetting(cle, valeur); }

  function appliquerTheme(t) {
    etat.theme = t;
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('omni-medikit-theme', t); } catch (e) { /* mode privé */ }
    const meta = $('meta[name="theme-color"]');
    const couleurs = { charte: '#a777ff', sombre: '#b79bff', clair: '#6a3fd4' };
    if (meta && couleurs[t]) meta.setAttribute('content', couleurs[t]);
    $$('#choix-theme button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.theme === t));
    });
  }

  function showVue(vue) {
    etat.vue = vue;
    $$('.vue').forEach((s) => { s.hidden = s.id !== 'vue-' + vue; });
    $$('.nav button').forEach((b) => {
      if (b.dataset.vue === vue) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0 });
    try { history.replaceState(null, '', '#' + vue); } catch (e) {}
  }

  function optionsProfils(select, valeur, avecToutes) {
    let html = '';
    if (avecToutes) html += '<option value="">Toutes les personnes</option>';
    for (const p of etat.profiles) {
      html += '<option value="' + esc(p.id) + '"' + (p.id === valeur ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }
    select.innerHTML = html;
  }

  function statutPill(t, ref) {
    const s = L.statutTraitement(t, ref);
    const libelles = {
      'en-cours': ['En cours', ''],
      'bientot-termine': ['Bientôt terminé', 'avert'],
      'a-vie': ['À vie', ''],
      'a-venir': ['À venir', 'neutre'],
      'termine': ['Terminé', 'neutre']
    };
    const [lib, cls] = libelles[s] || [s, 'neutre'];
    return '<span class="statut ' + cls + '">' + lib + '</span>';
  }

  function dosesAujourdhui(treatmentId, today) {
    return etat.doses.filter((d) => d.treatmentId === treatmentId && d.date === today);
  }

  function stockRestant(t) {
    if (t.stockInitial === null || t.stockInitial === undefined || t.stockInitial === '') return null;
    const pris = etat.doses.filter((d) => d.treatmentId === t.id).length;
    return Math.max(0, Number(t.stockInitial) - pris);
  }

  function stockHtml(t) {
    const s = stockRestant(t);
    if (s === null) return '';
    const unite = t.stockUnite ? ' ' + esc(t.stockUnite) : '';
    return ' · stock : <strong>' + s + unite + '</strong>' + (s <= 3 ? ' <span class="statut avert">stock bas</span>' : '');
  }

  function actionPriseHTML(t, today) {
    const prevu = L.dosesPrévuesParJour(t.frequency, today);
    const prises = dosesAujourdhui(t.id, today).length;
    if (prises >= prevu && prevu > 0) {
      return '<span class="statut succes">✓ ' + prises + '/' + prevu + ' pris</span>' +
        ' <button type="button" class="petit-bouton" data-action="annuler-prise" data-id="' + esc(t.id) + '">Annuler la dernière</button>';
    }
    return '<button type="button" class="petit-bouton pris" data-action="pris" data-id="' + esc(t.id) + '">Pris ✓</button>' +
      ' <span class="meta">' + prises + '/' + prevu + '</span>';
  }

  function ligneMed(t, today, avecBouton) {
    const fin = t.lifetime ? 'traitement à vie' : 'fin le ' + L.formaterDateCourte(t.endDate);
    return '<div class="med">' +
      '<div><div class="nom">' + esc(t.name) + (t.dosage ? ' — ' + esc(t.dosage) : '') + '</div>' +
      '<div class="detail">' + esc(L.decrireFrequence(t.frequency)) + ' · début ' + L.formaterDateCourte(t.startDate) + (t.reminderTime ? ' · rappel à ' + esc(t.reminderTime) : '') + stockHtml(t) + ' · ' + fin + '</div></div>' +
      (avecBouton ? actionPriseHTML(t, today) : '') + '</div>';
  }

  function panelProfilHTML(id) {
    const p = profil(id);
    if (!p) return '';
    const today = L.aujourdhui();
    const trs = etat.treatments.filter((t) => t.profileId === id);
    const actifs = trs.filter((t) => ['en-cours', 'bientot-termine', 'a-vie'].includes(L.statutTraitement(t, today)));
    const duJour = actifs.filter((t) => L.estProgrammeLe(t.frequency, today));
    const idsDuJour = new Set(duJour.map((t) => t.id));
    const enCours = trs.filter((t) => L.statutTraitement(t, today) === 'en-cours' && !idsDuJour.has(t.id));
    const bientot = trs.filter((t) => L.statutTraitement(t, today) === 'bientot-termine' && !idsDuJour.has(t.id));
    const aVie = trs.filter((t) => L.statutTraitement(t, today) === 'a-vie' && !idsDuJour.has(t.id));
    const rappels = etat.vaccines
      .filter((v) => v.profileId === id && v.reminderDate && ['en-retard', 'bientot'].includes(L.statutRappel(v.reminderDate, today)))
      .sort((a, b) => a.reminderDate.localeCompare(b.reminderDate));

    const age = p.birthdate ? L.ageEnAnnees(p.birthdate, today) : null;
    let html = '<article class="panel-profil" aria-label="Suivi de ' + esc(p.name) + '">' +
      '<h3>' + esc(p.name) + (age !== null ? ' <span class="statut neutre">' + age + ' ans</span>' : '') + '</h3>';
    if (p.allergies || p.criseAllergique) {
      html += '<div class="alerte-sante">' +
        (p.allergies ? '<p><strong>⚠ Allergies :</strong> ' + esc(p.allergies) + '</p>' : '') +
        (p.criseAllergique ? '<p><strong>En cas de crise allergique :</strong> ' + esc(p.criseAllergique) + '</p>' : '') +
        '</div>';
    }
    const obs7 = L.observance(trs, etat.doses.filter((d) => d.profileId === id), today, 7);
    if (obs7 !== null) html += '<p class="meta">Observance sur 7 jours : <strong>' + obs7 + ' %</strong></p>';

    html += '<div class="groupe-suivi"><span class="etiquette">Aujourd’hui (' + L.formaterDateCourte(today) + ')</span>';
    if (duJour.length) html += duJour.map((t) => ligneMed(t, today, true)).join('');
    else html += '<p class="vide">Aucun médicament prévu aujourd’hui.</p>';
    html += '</div>';

    html += '<div class="groupe-suivi"><span class="etiquette">En cours</span>';
    if (enCours.length) html += enCours.map((t) => ligneMed(t, today, true)).join('');
    else html += '<p class="vide">Aucun traitement en cours.</p>';
    html += '</div>';

    html += '<div class="groupe-suivi"><span class="etiquette">Bientôt terminés (7 jours)</span>';
    if (bientot.length) html += bientot.map((t) => ligneMed(t, today, false)).join('');
    else html += '<p class="vide">Rien à signaler.</p>';
    html += '</div>';

    html += '<div class="groupe-suivi"><span class="etiquette">Traitements à vie</span>';
    if (aVie.length) html += aVie.map((t) => ligneMed(t, today, true)).join('');
    else html += '<p class="vide">Aucun traitement à vie.</p>';
    html += '</div>';

    if (rappels.length) {
      html += '<div class="groupe-suivi"><span class="etiquette">Rappels de vaccins</span>';
      for (const v of rappels) {
        const s = L.statutRappel(v.reminderDate, today);
        html += '<div class="med"><div><div class="nom">' + esc(v.name) + '</div>' +
          '<div class="detail">rappel le ' + L.formaterDateCourte(v.reminderDate) + '</div></div>' +
          '<span class="statut ' + (s === 'en-retard' ? 'danger' : 'avert') + '">' +
          (s === 'en-retard' ? 'En retard' : 'À venir') + '</span></div>';
      }
      html += '</div>';
    }

    const ec = p.emergencyContact;
    if (ec && ec.phone) {
      const href = ec.mode === 'sms'
        ? L.lienSms(ec.phone, (ec.smsText || SMS_DEFAUT).replaceAll('{prenom}', p.name))
        : L.lienTel(ec.phone);
      html += '<div class="groupe-suivi"><span class="etiquette">Contact d’urgence</span>' +
        '<div class="med"><div><div class="nom">' + esc(ec.name || 'Contact d’urgence') + '</div>' +
        '<div class="detail">' + esc(ec.phone) + ' · ' + (ec.mode === 'sms' ? 'SMS pré-rédigé' : 'appel direct') + '</div></div>' +
        '<a class="petit-bouton urgence" href="' + esc(href) + '">' + (ec.mode === 'sms' ? 'Envoyer le SMS' : 'Appeler') + '</a></div></div>';
    }

    html += '</article>';
    return html;
  }

  function renderAccueil() {
    const today = L.aujourdhui();
    const d = L.parseDate(today);
    $('#date-du-jour').textContent = (L.nomJour(today).charAt(0).toUpperCase() + L.nomJour(today).slice(1)) + ' ' + L.formaterDate(today);

    const sel = $('#sel-profil');
    optionsProfils(sel, etat.profilActif, false);

    const duo = etat.duo.mode === 'duo';
    $('#mode-solo').setAttribute('aria-pressed', String(!duo));
    $('#mode-duo').setAttribute('aria-pressed', String(duo));
    $('#selecteurs-duo').hidden = !duo;
    $('#panels').hidden = duo;
    $('#panels-duo').hidden = !duo;

    if (!etat.profiles.length) {
      $('#panels').innerHTML = '<div class="encart"><p>Aucun profil pour l’instant. Créez un premier profil dans l’onglet <strong>Profils</strong> pour commencer le suivi.</p></div>';
      $('#panels-duo').innerHTML = '';
      return;
    }

    if (!duo) {
      $('#panels').innerHTML = panelProfilHTML(etat.profilActif);
    } else {
      optionsProfils($('#sel-duo-a'), etat.duo.a, false);
      optionsProfils($('#sel-duo-b'), etat.duo.b, false);
      $('#panels-duo').innerHTML = panelProfilHTML(etat.duo.a) + panelProfilHTML(etat.duo.b);
    }
  }

  function renderProfils() {
    const el = $('#liste-profils');
    if (!etat.profiles.length) {
      el.innerHTML = '<div class="encart"><p>Aucun profil. Créez-en un pour suivre une personne.</p></div>';
      return;
    }
    el.innerHTML = etat.profiles.map((p) => {
      const age = p.birthdate ? L.ageEnAnnees(p.birthdate) : null;
      const ec = p.emergencyContact;
      return '<article class="carte">' +
        '<div class="carte-tete" style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">' +
        '<h3>' + esc(p.name) + '</h3>' +
        (age !== null ? '<span class="statut neutre">' + age + ' ans</span>' : '') + '</div>' +
        (p.birthdate ? '<p>Né(e) le ' + L.formaterDate(p.birthdate) + '</p>' : '') +
        (p.note ? '<p>' + esc(p.note) + '</p>' : '') +
        (p.allergies ? '<p><span class="statut danger">⚠ Allergies : ' + esc(p.allergies) + '</span></p>' : '') +
        (p.criseAllergique ? '<p><strong>Crise allergique :</strong> ' + esc(p.criseAllergique) + '</p>' : '') +
        (() => { const o = L.observance(etat.treatments.filter((t) => t.profileId === p.id), etat.doses.filter((d) => d.profileId === p.id), L.aujourdhui(), 30); return o === null ? '' : '<p class="meta">Observance 30 jours : ' + o + ' %</p>'; })() +
        (ec && (ec.name || ec.phone) ? '<p>Contact d’urgence : <strong>' + esc(ec.name || '—') + '</strong> ' + esc(ec.phone || '') +
          ' (' + (ec.mode === 'sms' ? 'SMS' : 'appel') + ')</p>' : '<p class="vide">Aucun contact d’urgence configuré.</p>') +
        '<div class="ligne" style="display:flex;gap:10px;flex-wrap:wrap">' +
        '<button type="button" class="petit-bouton" data-action="edit-profil" data-id="' + esc(p.id) + '">Modifier</button>' +
        '<button type="button" class="petit-bouton" style="color:var(--danger);border-color:var(--danger)" data-action="del-profil" data-id="' + esc(p.id) + '">Supprimer</button>' +
        '</div></article>';
    }).join('');
  }

  function renderTraitements() {
    optionsProfils($('#filtre-traitements'), etat.filtreTraitements, true);
    const el = $('#liste-traitements');
    let liste = etat.treatments.slice();
    if (etat.filtreTraitements) liste = liste.filter((t) => t.profileId === etat.filtreTraitements);
    if (etat.rechercheTraitements) liste = liste.filter((t) => (t.name + ' ' + (t.dosage || '') + ' ' + (t.note || '')).toLowerCase().includes(etat.rechercheTraitements));
    const today = L.aujourdhui();
    const ordre = { 'en-cours': 0, 'bientot-termine': 1, 'a-vie': 2, 'a-venir': 3, 'termine': 4 };
    liste.sort((a, b) => {
      const s = L.statutTraitement(a, today) , s2 = L.statutTraitement(b, today);
      return (ordre[s] - ordre[s2]) || a.name.localeCompare(b.name, 'fr');
    });
    if (!liste.length) {
      el.innerHTML = '<div class="encart"><p>Aucun traitement' + (etat.filtreTraitements ? ' pour cette personne' : '') + '.</p></div>';
      return;
    }
    el.innerHTML = liste.map((t) => {
      const actif = ['en-cours', 'bientot-termine', 'a-vie'].includes(L.statutTraitement(t, today));
      const programme = actif && L.estProgrammeLe(t.frequency, today);
      return '<article class="ligne-carte">' +
        '<div class="titre"><h3>' + esc(t.name) + (t.dosage ? ' <span class="meta">· ' + esc(t.dosage) + '</span>' : '') + '</h3>' + statutPill(t, today) + '</div>' +
        '<p class="meta">' + esc(nomProfil(t.profileId)) + ' · ' + esc(L.decrireFrequence(t.frequency)) + (t.reminderTime ? ' · rappel à ' + esc(t.reminderTime) : '') + stockHtml(t) + ' · début ' + L.formaterDateCourte(t.startDate) +
        (t.lifetime ? ' · <strong>à vie</strong>' : ' · fin ' + L.formaterDateCourte(t.endDate)) + '</p>' +
        (t.note ? '<p class="meta">' + esc(t.note) + '</p>' : '') +
        '<div class="actions">' +
        (programme ? actionPriseHTML(t, today) : '') +
        '<button type="button" class="petit-bouton" data-action="hist-traitement" data-id="' + esc(t.id) + '">Historique des prises</button>' +
        '<button type="button" class="petit-bouton" data-action="edit-traitement" data-id="' + esc(t.id) + '">Modifier</button>' +
        '<button type="button" class="petit-bouton" style="color:var(--danger);border-color:var(--danger)" data-action="del-traitement" data-id="' + esc(t.id) + '">Supprimer</button>' +
        '</div></article>';
    }).join('');
  }

  function renderVaccins() {
    optionsProfils($('#filtre-vaccins'), etat.filtreVaccins, true);
    const el = $('#liste-vaccins');
    let liste = etat.vaccines.slice();
    if (etat.filtreVaccins) liste = liste.filter((v) => v.profileId === etat.filtreVaccins);
    liste.sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || ''));
    if (!liste.length) {
      el.innerHTML = '<div class="encart"><p>Aucun vaccin enregistré.</p></div>';
      return;
    }
    const today = L.aujourdhui();
    el.innerHTML = liste.map((v) => {
      const s = L.statutRappel(v.reminderDate, today);
      return '<article class="ligne-carte">' +
        '<div class="titre"><h3>' + esc(v.name) + '</h3>' +
        (s === 'en-retard' ? '<span class="statut danger">Rappel en retard</span>' : s === 'bientot' ? '<span class="statut avert">Rappel à venir</span>' : s === 'ok' ? '<span class="statut succes">Rappel programmé</span>' : '<span class="statut neutre">Pas de rappel</span>') +
        '</div>' +
        '<p class="meta">' + esc(nomProfil(v.profileId)) +
        (v.lastDate ? ' · dernière injection le ' + L.formaterDate(v.lastDate) : '') +
        (v.reminderDate ? ' · prochain rappel le ' + L.formaterDate(v.reminderDate) : '') + '</p>' +
        (v.note ? '<p class="meta">' + esc(v.note) + '</p>' : '') +
        '<div class="actions">' +
        '<button type="button" class="petit-bouton" data-action="edit-vaccin" data-id="' + esc(v.id) + '">Modifier</button>' +
        '<button type="button" class="petit-bouton" style="color:var(--danger);border-color:var(--danger)" data-action="del-vaccin" data-id="' + esc(v.id) + '">Supprimer</button>' +
        '</div></article>';
    }).join('');
  }

  function renderContacts() {
    optionsProfils($('#filtre-contacts'), etat.filtreContacts, true);
    const el = $('#liste-contacts');
    let liste = etat.contacts.slice();
    if (etat.filtreContacts) liste = liste.filter((c) => !c.profileId || c.profileId === etat.filtreContacts);
    if (etat.rechercheContacts) liste = liste.filter((c) => (c.name + ' ' + (c.specialty || '') + ' ' + (c.address || '')).toLowerCase().includes(etat.rechercheContacts));
    liste.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    if (!liste.length) {
      el.innerHTML = '<div class="encart"><p>Aucun contact médical enregistré.</p></div>';
      return;
    }
    el.innerHTML = liste.map((c) => {
      const portee = c.profileId ? esc(nomProfil(c.profileId)) : 'Global (toutes les personnes)';
      return '<article class="ligne-carte">' +
        '<div class="titre"><h3>' + esc(c.name) + '</h3>' + (c.specialty ? '<span class="statut">' + esc(c.specialty) + '</span>' : '') + '</div>' +
        '<p class="meta">' + portee + '</p>' +
        (c.phone ? '<p class="meta"><a href="' + esc(L.lienTel(c.phone)) + '">' + esc(c.phone) + '</a></p>' : '') +
        (c.address ? '<p class="meta">' + esc(c.address) + '</p>' : '') +
        (c.note ? '<p class="meta">' + esc(c.note) + '</p>' : '') +
        '<div class="actions">' +
        (c.phone ? '<a class="petit-bouton" href="' + esc(L.lienTel(c.phone)) + '">Appeler</a>' : '') +
        '<button type="button" class="petit-bouton" data-action="edit-contact" data-id="' + esc(c.id) + '">Modifier</button>' +
        '<button type="button" class="petit-bouton" style="color:var(--danger);border-color:var(--danger)" data-action="del-contact" data-id="' + esc(c.id) + '">Supprimer</button>' +
        '</div></article>';
    }).join('');
  }

  function renderConstantes() {
    optionsProfils($('#filtre-constantes'), etat.filtreConstantes, true);
    const el = $('#liste-constantes');
    let liste = etat.constantes.slice();
    if (etat.filtreConstantes) liste = liste.filter((c) => c.profileId === etat.filtreConstantes);
    liste.sort((a, b) => (b.date + (b.heure || '')).localeCompare(a.date + (a.heure || '')));
    if (!liste.length) {
      el.innerHTML = '<div class="encart"><p>Aucune mesure enregistrée.</p></div>';
      return;
    }
    el.innerHTML = '<table class="table"><thead><tr><th>Date</th><th>Personne</th><th>Mesure</th><th>Valeur</th><th>Note</th><th></th></tr></thead><tbody>' +
      liste.map((c) => '<tr>' +
        '<td>' + L.formaterDateCourte(c.date) + (c.heure ? ' ' + esc(c.heure) : '') + '</td>' +
        '<td>' + esc(nomProfil(c.profileId)) + '</td>' +
        '<td>' + esc(TYPES_CONSTANTES[c.type] || c.type) + '</td>' +
        '<td><strong class="mono">' + esc(c.valeur) + '</strong></td>' +
        '<td>' + esc(c.note || '') + '</td>' +
        '<td><button type="button" class="petit-bouton" data-action="edit-constante" data-id="' + esc(c.id) + '">Modifier</button> ' +
        '<button type="button" class="petit-bouton" style="color:var(--danger);border-color:var(--danger)" data-action="del-constante" data-id="' + esc(c.id) + '">Supprimer</button></td>' +
        '</tr>').join('') + '</tbody></table>';
  }

  function formConstanteHTML(c) {
    let options = '<option value="">— choisir —</option>';
    for (const p of etat.profiles) options += '<option value="' + esc(p.id) + '"' + (c.profileId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    const types = Object.entries(TYPES_CONSTANTES).map(([k, v]) => '<option value="' + k + '"' + (c.type === k ? ' selected' : '') + '>' + esc(v) + '</option>').join('');
    return '<div class="champ" data-cle="profileId"><span>Personne</span><select name="profileId" required>' + options + '</select><span class="erreur" data-erreur="profileId"></span></div>' +
      '<div class="champ" data-cle="type"><span>Mesure</span><select name="type" required>' + types + '</select><span class="erreur" data-erreur="type"></span></div>' +
      '<div class="champ" data-cle="valeur"><span>Valeur</span><input type="text" name="valeur" required maxlength="40" placeholder="ex. 12/8, 72, 37,2, 0,95" value="' + esc(c.valeur || '') + '"><span class="erreur" data-erreur="valeur"></span></div>' +
      '<div class="champ" data-cle="date"><span>Date</span><input type="date" name="date" required value="' + esc(c.date || L.aujourdhui()) + '"><span class="erreur" data-erreur="date"></span></div>' +
      champ('Heure (facultative)', '<input type="time" name="heure" value="' + esc(c.heure || '') + '">') +
      champ('Note', '<textarea name="note">' + esc(c.note || '') + '</textarea>');
  }

  async function enregistrerConstante() {
    const f = modalForm;
    const c = {
      id: f.dataset.id || L.uuid(),
      profileId: lireValeur(f, 'profileId'),
      type: lireValeur(f, 'type'),
      valeur: lireValeur(f, 'valeur').trim(),
      date: lireValeur(f, 'date'),
      heure: lireValeur(f, 'heure') || '',
      note: lireValeur(f, 'note').trim()
    };
    const erreurs = {};
    if (!c.profileId) erreurs.profileId = 'Choisissez une personne.';
    if (!c.type) erreurs.type = 'Choisissez une mesure.';
    if (!c.valeur) erreurs.valeur = 'La valeur est obligatoire.';
    if (!c.date || !L.estDateValide(c.date)) erreurs.date = 'Date invalide.';
    if (Object.keys(erreurs).length) { afficherErreurs(erreurs); return; }
    await DB.put('constantes', c);
    await chargerDonnees();
    renderTout();
    fermerModal();
    toast('Mesure enregistrée.');
  }

  function renderUrgences() {
    $('#liste-urgences').innerHTML = URGENCES.map((u) =>
      '<article class="urgence-carte"><span class="etiquette">' + esc(u.nom) + '</span>' +
      '<span class="num">' + esc(u.num) + '</span><p>' + esc(u.desc) + '</p>' +
      '<div class="ligne" style="display:flex;gap:8px;flex-wrap:wrap">' +
      u.liens.map((l) => '<a class="petit-bouton urgence" href="' + esc(l.href) + '">' + esc(l.label) + '</a>').join('') +
      '</div></article>'
    ).join('');

    const el = $('#contacts-urgence');
    if (!etat.profiles.length) {
      el.innerHTML = '<p class="vide">Aucun profil — à créer dans l’onglet Profils.</p>';
      return;
    }
    el.innerHTML = etat.profiles.map((p) => {
      const ec = p.emergencyContact || {};
      let html = '<div class="ligne-carte"><h3 style="font-size:1.05rem">' + esc(p.name) + '</h3>';
      if (p.allergies || p.criseAllergique) {
        html += '<div class="alerte-sante">' +
          (p.allergies ? '<p><strong>⚠ Allergies :</strong> ' + esc(p.allergies) + '</p>' : '') +
          (p.criseAllergique ? '<p><strong>En cas de crise allergique :</strong> ' + esc(p.criseAllergique) + '</p>' : '') +
          '</div>';
      }
      if (ec.phone) {
        const href = ec.mode === 'sms'
          ? L.lienSms(ec.phone, (ec.smsText || SMS_DEFAUT).replaceAll('{prenom}', p.name))
          : L.lienTel(ec.phone);
        html += '<div class="med"><div><div class="nom">' + esc(ec.name || 'Contact d’urgence') + '</div>' +
          '<div class="detail">' + esc(ec.phone) + ' · ' + (ec.mode === 'sms' ? 'SMS pré-rédigé : « ' + esc(ec.smsText || SMS_DEFAUT) + ' »' : 'appel direct') + '</div></div>' +
          '<a class="petit-bouton urgence" href="' + esc(href) + '">' + (ec.mode === 'sms' ? 'Envoyer le SMS' : 'Appeler') + '</a></div>';
      } else {
        html += '<p class="vide">Aucun contact d’urgence configuré — à définir dans l’onglet Profils.</p>';
      }
      return html + '</div>';
    }).join('');
  }

  function renderReglages() {
    appliquerTheme(etat.theme);
    const total = etat.profiles.length + etat.treatments.length + etat.doses.length +
      etat.vaccines.length + etat.contacts.length;
    $('#info-donnees').textContent = etat.profiles.length + ' profil(s), ' + etat.treatments.length +
      ' traitement(s), ' + etat.doses.length + ' prise(s), ' + etat.vaccines.length + ' vaccin(s), ' +
      etat.contacts.length + ' contact(s) — ' + total + ' enregistrement(s) au total, stockés localement.';
    const verrouActif = !!(etat.lock && etat.lock.enabled);
    $('#info-verrou').textContent = verrouActif ? 'Verrouillage actif : un code est demandé à l’ouverture.' : 'Verrouillage inactif.';
    $('#btn-verrou').textContent = verrouActif ? 'Modifier le code' : 'Activer le verrouillage';
    $('#btn-desactiver-verrou').hidden = !verrouActif;
    $('#opt-rappels').checked = !!etat.rappels;
    let infoRappels = etat.rappels ? 'Rappels actifs.' : 'Rappels désactivés.';
    if (etat.rappels) {
      infoRappels += ('Notification' in window && Notification.permission === 'granted')
        ? ' Notifications autorisées par le navigateur.'
        : ' Notifications non autorisées : seuls des messages internes seront affichés.';
    }
    $('#info-rappels').textContent = infoRappels;
    $$('#choix-taille button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.taille === etat.tailleTexte)));
    $('#btn-suppr-demo').hidden = !etat.profiles.some((p) => p.demo);
    renderSnapshots();
  }

  async function renderSnapshots() {
    const el = $('#liste-snapshots');
    if (!el) return;
    const liste = await DB.listerSnapshots();
    if (!liste.length) { el.innerHTML = '<p class="vide">Aucun snapshot pour l’instant.</p>'; return; }
    el.innerHTML = liste.map((s) => '<div class="med"><div><div class="nom">' + L.formaterDateHeure(s.date) + '</div></div>' +
      '<button type="button" class="petit-bouton" data-action="restaurer-snapshot" data-id="' + esc(s.id) + '">Restaurer</button></div>').join('');
  }

  function appliquerTaille(t) {
    etat.tailleTexte = t;
    document.documentElement.dataset.taille = t;
    try { localStorage.setItem('omni-medikit-taille', t); } catch (e) {}
    $$('#choix-taille button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.taille === t)));
  }

  function renderTout() {
    renderAccueil();
    renderProfils();
    renderTraitements();
    renderVaccins();
    renderContacts();
    renderConstantes();
    renderUrgences();
    renderReglages();
    planifierRappels();
  }

  const modal = $('#modal');
  const modalForm = $('#modal-form');
  const modalTitre = $('#modal-titre');
  const modalCorps = $('#modal-corps');
  let onValider = null;

  function ouvrirModal(titre, htmlCorps, valider) {
    modalTitre.textContent = titre;
    modalCorps.innerHTML = htmlCorps;
    onValider = valider;
    modal.showModal();
    const premier = modalCorps.querySelector('input, select, textarea, button');
    if (premier) premier.focus();
  }

  function fermerModal() { modal.close(); onValider = null; }

  function champ(label, inputHtml, aide) {
    return '<div class="champ"><span>' + label + '</span>' + inputHtml +
      (aide ? '<span class="aide">' + aide + '</span>' : '') +
      '<span class="erreur" data-erreur=""></span></div>';
  }

  function afficherErreurs(erreurs) {
    $$('#modal-corps [data-erreur]').forEach((el) => {
      el.textContent = el.dataset.erreur && erreurs[el.dataset.erreur] ? erreurs[el.dataset.erreur] : '';
    });
  }

  function lireValeur(form, nom) {
    const el = form.elements[nom];
    if (!el) return '';
    if (el.type === 'checkbox') return el.checked;
    return el.value;
  }

  function selectProfilsHtml(nom, valeur, requis) {
    if (!etat.profiles.length) {
      return '<p class="vide">Créez d’abord un profil dans l’onglet Profils.</p>';
    }
    let html = '<select name="' + nom + '"' + (requis ? ' required' : '') + '><option value="">— choisir —</option>';
    for (const p of etat.profiles) {
      html += '<option value="' + esc(p.id) + '"' + (p.id === valeur ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }
    return html + '</select>';
  }

  function joursSemaineHtml() {
    return '<fieldset><legend>Jours de prise</legend><div class="checks">' +
      L.JOURS.map((j, i) => '<label><input type="checkbox" name="jour-' + (i + 1) + '" value="' + (i + 1) + '"> ' + j + '</label>').join('') +
      '</div><span class="erreur" data-erreur="frequence"></span></fieldset>';
  }

  function formProfilHTML(p) {
    const ec = p.emergencyContact || {};
    return '<div class="champ" data-cle="name"><span>Prénom ou nom</span><input type="text" name="name" required maxlength="80" value="' + esc(p.name || '') + '"><span class="aide">Obligatoire.</span><span class="erreur" data-erreur="name"></span></div>' +
      '<div class="champ" data-cle="birthdate"><span>Date de naissance (facultative)</span><input type="date" name="birthdate" value="' + esc(p.birthdate || '') + '"><span class="erreur" data-erreur="birthdate"></span></div>' +
      champ('Note libre', '<textarea name="note">' + esc(p.note || '') + '</textarea>', 'Groupe sanguin, remarques…') +
      champ('Allergies', '<textarea name="allergies" placeholder="ex. arachides, pénicilline…">' + esc(p.allergies || '') + '</textarea>', 'Champ dédié, affiché en évidence sur l’accueil, dans Urgences, à l’impression et en cas de verrouillage.') +
      champ('Traitement en cas de crise allergique', '<textarea name="criseAllergique" placeholder="ex. adrénaline (auto-injecteur), puis appeler le 15">' + esc(p.criseAllergique || '') + '</textarea>', 'Médicament d’urgence (adrénaline, antihistaminique) et conduite à tenir.') +
      '<fieldset><legend>Contact d’urgence (facultatif)</legend>' +
      champ('Nom du contact', '<input type="text" name="ecName" maxlength="80" value="' + esc(ec.name || '') + '">') +
      '<div class="champ" data-cle="ecPhone"><span>Téléphone</span><input type="tel" name="ecPhone" value="' + esc(ec.phone || '') + '"><span class="erreur" data-erreur="ecPhone"></span></div>' +
      '<div class="radios" role="radiogroup" aria-label="Action en cas d’urgence">' +
      '<label><input type="radio" name="ecMode" value="appel"' + (ec.mode !== 'sms' ? ' checked' : '') + '> Appel direct (tel:)</label>' +
      '<label><input type="radio" name="ecMode" value="sms"' + (ec.mode === 'sms' ? ' checked' : '') + '> SMS pré-rédigé (sms:)</label></div>' +
      '<div class="champ" id="champ-sms"><span>Texte du SMS (modifiable)</span><textarea name="ecSms" rows="3">' + esc(ec.smsText || SMS_DEFAUT) + '</textarea>' +
      '<span class="aide">« {prenom} » est remplacé par le prénom du profil.</span></div>' +
      '</fieldset>';
  }

  function apresFormProfil() {
    const champSms = $('#champ-sms');
    const maj = () => { champSms.style.display = modalForm.elements['ecMode'].value === 'sms' ? '' : 'none'; };
    $$('#modal-corps input[name="ecMode"]').forEach((r) => r.addEventListener('change', maj));
    maj();
  }

  async function enregistrerProfil() {
    const f = modalForm;
    const p = {
      id: f.dataset.id || L.uuid(),
      name: lireValeur(f, 'name').trim(),
      birthdate: lireValeur(f, 'birthdate') || '',
      note: lireValeur(f, 'note').trim(),
      allergies: lireValeur(f, 'allergies').trim(),
      criseAllergique: lireValeur(f, 'criseAllergique').trim(),
      emergencyContact: {
        name: lireValeur(f, 'ecName').trim(),
        phone: lireValeur(f, 'ecPhone').trim(),
        mode: f.elements['ecMode'].value,
        smsText: lireValeur(f, 'ecSms').trim() || SMS_DEFAUT
      },
      createdAt: f.dataset.created || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const v = L.validerProfil(p);
    if (!v.ok) { afficherErreurs(v.erreurs); return; }
    await DB.put('profiles', p);
    await chargerDonnees();
    renderTout();
    fermerModal();
    toast('Profil enregistré : ' + p.name);
  }

  function formTraitementHTML(t) {
    const f = t.frequency || { type: 'quotidien' };
    const jours = Array.isArray(f.jours) ? f.jours : [];
    return '<div class="champ" data-cle="profileId"><span>Personne</span>' + selectProfilsHtml('profileId', t.profileId || etat.profilActif, true) + '<span class="erreur" data-erreur="profileId"></span></div>' +
      '<div class="champ" data-cle="name"><span>Nom du médicament</span><input type="text" name="name" required maxlength="120" value="' + esc(t.name || '') + '"><span class="erreur" data-erreur="name"></span></div>' +
      champ('Dosage (facultatif)', '<input type="text" name="dosage" maxlength="80" placeholder="ex. 1 comprimé, 5 ml…" value="' + esc(t.dosage || '') + '">') +
      '<div class="champ" data-cle="startDate"><span>Date de début</span><input type="date" name="startDate" required value="' + esc(t.startDate || L.aujourdhui()) + '"><span class="erreur" data-erreur="startDate"></span></div>' +
      '<div class="checks"><label><input type="checkbox" name="lifetime"' + (t.lifetime ? ' checked' : '') + '> Traitement à vie (pas de date de fin, rappel permanent)</label></div>' +
      '<div class="champ" data-cle="endDate" id="champ-fin"><span>Date de fin</span><input type="date" name="endDate" value="' + esc(t.endDate || '') + '"><span class="erreur" data-erreur="endDate"></span></div>' +
      champ('Durée en jours (facultatif, calcule la date de fin)', '<input type="number" name="dureeJours" min="1" max="36500" placeholder="ex. 10">', 'La date de fin = début + durée − 1. Vous pouvez aussi saisir la date de fin directement.') +
      champ('Heure de rappel (facultative)', '<input type="time" name="reminderTime" value="' + esc(t.reminderTime || '') + '">', 'Notification envoyée à cette heure, les jours de prise.') +
      champ('Stock initial (facultatif)', '<input type="number" name="stockInitial" min="0" max="100000" placeholder="ex. 30" value="' + (t.stockInitial ?? '') + '">', 'Nombre d’unités au départ : décompté automatiquement à chaque prise.') +
      champ('Unité du stock', '<input type="text" name="stockUnite" maxlength="30" placeholder="comprimés, ml…" value="' + esc(t.stockUnite || '') + '">') +
      '<fieldset><legend>Fréquence</legend>' +
      '<div class="radios" role="radiogroup" aria-label="Type de fréquence">' +
      '<label><input type="radio" name="freqType" value="quotidien"' + (f.type === 'quotidien' ? ' checked' : '') + '> Quotidienne (1 fois/jour)</label>' +
      '<label><input type="radio" name="freqType" value="fois"' + (f.type === 'fois' ? ' checked' : '') + '> <input type="number" name="foisParJour" min="2" max="24" value="' + (f.foisParJour || 2) + '" style="width:5em;min-height:40px"> fois par jour</label>' +
      '<label><input type="radio" name="freqType" value="jours"' + (f.type === 'jours' ? ' checked' : '') + '> Jours précis de la semaine</label>' +
      '</div>' +
      '<div id="bloc-jours"' + (f.type === 'jours' ? '' : ' hidden') + '><div class="checks">' +
      L.JOURS.map((j, i) => '<label><input type="checkbox" name="jour-' + (i + 1) + '" value="' + (i + 1) + '"' + (jours.includes(i + 1) ? ' checked' : '') + '> ' + j + '</label>').join('') +
      '</div></div><span class="erreur" data-erreur="frequence"></span></fieldset>' +
      champ('Note', '<textarea name="note">' + esc(t.note || '') + '</textarea>');
  }

  function apresFormTraitement() {
    const f = modalForm;
    const majFin = () => { $('#champ-fin').style.display = f.elements['lifetime'].checked ? 'none' : ''; };
    f.elements['lifetime'].addEventListener('change', majFin);
    majFin();
    const majJours = () => { $('#bloc-jours').hidden = f.elements['freqType'].value !== 'jours'; };
    $$('#modal-corps input[name="freqType"]').forEach((r) => r.addEventListener('change', majJours));
    f.elements['dureeJours'].addEventListener('change', () => {
      const debut = f.elements['startDate'].value;
      const duree = Number(f.elements['dureeJours'].value);
      if (L.estDateValide(debut) && Number.isInteger(duree) && duree >= 1) {
        f.elements['endDate'].value = L.ajouterJours(debut, duree - 1) || '';
      }
    });
  }

  async function enregistrerTraitement() {
    const f = modalForm;
    const freqType = f.elements['freqType'].value;
    const frequency = { type: freqType };
    if (freqType === 'fois') frequency.foisParJour = Number(f.elements['foisParJour'].value);
    if (freqType === 'jours') {
      frequency.jours = $$('#modal-corps input[name^="jour-"]:checked').map((c) => Number(c.value));
    }
    const lifetime = f.elements['lifetime'].checked;
    const t = {
      id: f.dataset.id || L.uuid(),
      profileId: lireValeur(f, 'profileId'),
      name: lireValeur(f, 'name').trim(),
      dosage: lireValeur(f, 'dosage').trim(),
      startDate: lireValeur(f, 'startDate'),
      endDate: lifetime ? '' : lireValeur(f, 'endDate'),
      lifetime: lifetime,
      frequency: frequency,
      reminderTime: lireValeur(f, 'reminderTime') || '',
      stockInitial: lireValeur(f, 'stockInitial') === '' ? null : Number(lireValeur(f, 'stockInitial')),
      stockUnite: lireValeur(f, 'stockUnite').trim(),
      note: lireValeur(f, 'note').trim(),
      createdAt: f.dataset.created || new Date().toISOString()
    };
    const v = L.validerTraitement(t);
    if (!t.profileId) v.ok = false, v.erreurs.profileId = 'Choisissez une personne.';
    if (!v.ok) { afficherErreurs(v.erreurs); return; }
    await DB.put('treatments', t);
    await chargerDonnees();
    renderTout();
    fermerModal();
    toast('Traitement enregistré : ' + t.name);
  }

  function formVaccinHTML(v) {
    return '<div class="champ" data-cle="profileId"><span>Personne</span>' + selectProfilsHtml('profileId', v.profileId || etat.profilActif, true) + '<span class="erreur" data-erreur="profileId"></span></div>' +
      '<div class="champ" data-cle="name"><span>Nom du vaccin</span><input type="text" name="name" required maxlength="120" value="' + esc(v.name || '') + '"><span class="erreur" data-erreur="name"></span></div>' +
      '<div class="champ" data-cle="lastDate"><span>Date de la dernière injection</span><input type="date" name="lastDate" value="' + esc(v.lastDate || '') + '"><span class="erreur" data-erreur="lastDate"></span></div>' +
      '<div class="champ" data-cle="reminderDate"><span>Date du prochain rappel (facultative)</span><input type="date" name="reminderDate" value="' + esc(v.reminderDate || '') + '"><span class="erreur" data-erreur="reminderDate"></span></div>' +
      champ('Note', '<textarea name="note">' + esc(v.note || '') + '</textarea>');
  }

  async function enregistrerVaccin() {
    const f = modalForm;
    const v = {
      id: f.dataset.id || L.uuid(),
      profileId: lireValeur(f, 'profileId'),
      name: lireValeur(f, 'name').trim(),
      lastDate: lireValeur(f, 'lastDate') || '',
      reminderDate: lireValeur(f, 'reminderDate') || '',
      note: lireValeur(f, 'note').trim()
    };
    const val = L.validerVaccin(v);
    if (!v.profileId) val.ok = false, val.erreurs.profileId = 'Choisissez une personne.';
    if (!val.ok) { afficherErreurs(val.erreurs); return; }
    await DB.put('vaccines', v);
    await chargerDonnees();
    renderTout();
    fermerModal();
    toast('Vaccin enregistré : ' + v.name);
  }

  function formContactHTML(c) {
    let options = '<option value="">Global (toutes les personnes)</option>';
    for (const p of etat.profiles) {
      options += '<option value="' + esc(p.id) + '"' + (c.profileId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }
    return '<div class="champ" data-cle="profileId"><span>Portée</span><select name="profileId">' + options + '</select></div>' +
      '<div class="champ" data-cle="name"><span>Nom</span><input type="text" name="name" required maxlength="120" value="' + esc(c.name || '') + '"><span class="erreur" data-erreur="name"></span></div>' +
      champ('Spécialité', '<input type="text" name="specialty" maxlength="80" placeholder="ex. médecin traitant, cardiologue…" value="' + esc(c.specialty || '') + '">') +
      '<div class="champ" data-cle="phone"><span>Téléphone</span><input type="tel" name="phone" value="' + esc(c.phone || '') + '"><span class="erreur" data-erreur="phone"></span></div>' +
      champ('Adresse (facultative)', '<textarea name="address">' + esc(c.address || '') + '</textarea>') +
      champ('Note', '<textarea name="note">' + esc(c.note || '') + '</textarea>');
  }

  async function enregistrerContact() {
    const f = modalForm;
    const c = {
      id: f.dataset.id || L.uuid(),
      profileId: lireValeur(f, 'profileId') || '',
      name: lireValeur(f, 'name').trim(),
      specialty: lireValeur(f, 'specialty').trim(),
      phone: lireValeur(f, 'phone').trim(),
      address: lireValeur(f, 'address').trim(),
      note: lireValeur(f, 'note').trim()
    };
    const v = L.validerContact(c);
    if (!v.ok) { afficherErreurs(v.erreurs); return; }
    await DB.put('contacts', c);
    await chargerDonnees();
    renderTout();
    fermerModal();
    toast('Contact enregistré : ' + c.name);
  }

  function confirmerSuppression(titre, texte, action) {
    ouvrirModal(titre,
      '<p>' + texte + '</p>' +
      '<div class="ligne" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end">' +
      '<button type="button" class="bouton secondaire" id="conf-annuler">Annuler</button>' +
      '<button type="button" class="bouton danger" id="conf-ok">Supprimer</button></div>',
      null);
    $('#conf-annuler').addEventListener('click', fermerModal);
    $('#conf-ok').addEventListener('click', async () => {
      await action();
      fermerModal();
    });
  }

  function modalHistorique(t) {
    const doses = etat.doses
      .filter((d) => d.treatmentId === t.id)
      .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
    let html = '<p class="meta">' + esc(t.name) + ' — ' + esc(nomProfil(t.profileId)) + '</p>';
    if (!doses.length) html += '<p class="vide">Aucune prise enregistrée pour ce traitement.</p>';
    else {
      html += '<div class="liste">' + doses.map((d) =>
        '<div class="med"><div><div class="nom">' + L.formaterDate(d.date) + ' à ' + esc(d.time || '') + '</div>' +
        (d.note ? '<div class="detail">' + esc(d.note) + '</div>' : '') + '</div>' +
        '<button type="button" class="petit-bouton" style="color:var(--danger);border-color:var(--danger)" data-action="del-dose" data-id="' + esc(d.id) + '">Supprimer</button></div>'
      ).join('') + '</div>';
    }
    ouvrirModal('Historique — ' + t.name, html, null);
    $('#modal-valider').style.display = 'none';
    modalForm.addEventListener('close', () => { $('#modal-valider').style.display = ''; }, { once: true });
  }

  async function prendreDose(id) {
    const t = etat.treatments.find((x) => x.id === id);
    if (!t) return;
    const today = L.aujourdhui();
    const prevu = L.dosesPrévuesParJour(t.frequency, today);
    const prises = dosesAujourdhui(id, today).length;
    if (prises >= prevu && prevu > 0) { toast('Toutes les prises du jour sont déjà enregistrées.', true); return; }
    await DB.put('doses', {
      id: L.uuid(), treatmentId: id, profileId: t.profileId,
      date: today, time: heureActuelle(), takenAt: new Date().toISOString(), note: ''
    });
    await chargerDonnees();
    renderTout();
    toast('Prise enregistrée : ' + t.name + ' (' + (prises + 1) + '/' + prevu + ')');
  }

  async function annulerDernierePrise(id) {
    const today = L.aujourdhui();
    const liste = dosesAujourdhui(id, today).sort((a, b) => (b.takenAt || '').localeCompare(a.takenAt || ''));
    if (!liste.length) return;
    await DB.supprimer('doses', liste[0].id);
    await chargerDonnees();
    renderTout();
    toast('Dernière prise annulée.');
  }

  async function exporterDonnees() {
    const data = await DB.exporterTout();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    a.href = URL.createObjectURL(blob);
    a.download = 'omni-medikit-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('Export JSON téléchargé.');
  }

  function validerImport(json) {
    const errs = [];
    const d = (json && json.data) || {};
    const dateOk = (v) => !v || L.estDateValide(v);
    for (const p of d.profiles || []) {
      if (!p || typeof p.id !== 'string' || !p.name || !String(p.name).trim()) errs.push('profil sans nom valide');
      else if (p.birthdate && !dateOk(p.birthdate)) errs.push('date de naissance invalide (profil « ' + p.name + ' »)');
    }
    for (const t of d.treatments || []) {
      const v = L.validerTraitement(t || {});
      if (!v.ok) errs.push('traitement « ' + ((t && t.name) || '?') + ' » : ' + Object.values(v.erreurs).join(' '));
    }
    for (const v of d.vaccines || []) {
      const r = L.validerVaccin(v || {});
      if (!r.ok) errs.push('vaccin « ' + ((v && v.name) || '?') + ' » : ' + Object.values(r.erreurs).join(' '));
    }
    for (const c of d.contacts || []) {
      const r = L.validerContact(c || {});
      if (!r.ok) errs.push('contact « ' + ((c && c.name) || '?') + ' » invalide');
    }
    for (const dose of d.doses || []) {
      if (!dose || typeof dose.id !== 'string' || !dateOk(dose.date)) errs.push('prise invalide (' + (dose && dose.id) + ')');
    }
    for (const s of d.settings || []) {
      if (!s || typeof s.id !== 'string') errs.push('réglage invalide');
    }
    return errs;
  }

  async function importerDepuisTexte(texte, nomFichier) {
    let json;
    try {
      json = JSON.parse(texte);
    } catch (e) {
      toast('Import impossible : le fichier n’est pas un JSON valide.', true);
      return;
    }
    if (!json || json.app !== 'Omni-MediKit' || !json.data) {
      toast('Import impossible : ce n’est pas une exportation Omni-MediKit.', true);
      return;
    }
    const errs = validerImport(json);
    if (errs.length) {
      toast('Import refusé (' + errs.length + ' erreur(s)) : ' + errs.slice(0, 3).join(' | '), true);
      return;
    }
    confirmerSuppression(
      'Importer une sauvegarde',
      'L’import <strong>remplace toutes les données actuelles</strong> de l’application (' + etat.profiles.length + ' profil(s), ' +
      etat.treatments.length + ' traitement(s), ' + etat.doses.length + ' prise(s), ' + etat.vaccines.length + ' vaccin(s), ' +
      etat.contacts.length + ' contact(s)) par le contenu de « ' + esc(nomFichier) + ' ». Continuer ?',
      async () => {
        try {
          await DB.creerSnapshot();
          await DB.importerTout(json);
          await chargerDonnees();
          renderTout();
          toast('Import réussi : données restaurées.');
        } catch (e) {
          toast('Import impossible : ' + e.message, true);
        }
      });
  }

  document.addEventListener('click', async (e) => {
    const cible = e.target.closest('[data-action]');
    if (!cible) return;
    const action = cible.dataset.action;
    const id = cible.dataset.id;
    try {
      if (action === 'imprimer') { window.print(); }
      else if (action === 'pris') await prendreDose(id);
      else if (action === 'annuler-prise') await annulerDernierePrise(id);
      else if (action === 'del-dose') {
        await DB.supprimer('doses', id);
        await chargerDonnees();
        renderTout();
        toast('Prise supprimée.');
      }
      else if (action === 'creer-snapshot') {
        await DB.creerSnapshot();
        await renderSnapshots();
        toast('Snapshot créé.');
      }
      else if (action === 'restaurer-snapshot') {
        confirmerSuppression('Restaurer un snapshot',
          'Remplacer les données actuelles par celles de ce snapshot ? Un snapshot de sécurité des données actuelles est d’abord créé.',
          async () => {
            await DB.creerSnapshot();
            await DB.restaurerSnapshot(id);
            await chargerDonnees();
            renderTout();
            toast('Snapshot restauré.');
          });
      }
      else if (action === 'del-constante') {
        confirmerSuppression('Supprimer la mesure', 'Supprimer cette mesure ?',
          async () => { await DB.supprimer('constantes', id); await chargerDonnees(); renderTout(); toast('Mesure supprimée.'); });
      }
      else if (action === 'edit-constante') {
        const c = etat.constantes.find((x) => x.id === id);
        modalForm.dataset.id = c.id;
        modalForm.removeAttribute('data-created');
        ouvrirModal('Modifier la mesure', formConstanteHTML(c), enregistrerConstante);
      }
      else if (action === 'hist-traitement') {
        const t = etat.treatments.find((x) => x.id === id);
        if (t) modalHistorique(t);
      }
      else if (action === 'edit-profil') {
        const p = profil(id);
        modalForm.dataset.id = p.id;
        modalForm.dataset.created = p.createdAt || '';
        ouvrirModal('Modifier le profil', formProfilHTML(p), enregistrerProfil);
        apresFormProfil();
      }
      else if (action === 'del-profil') {
        const p = profil(id);
        confirmerSuppression('Supprimer le profil',
          'Supprimer <strong>' + esc(p.name) + '</strong> et <strong>toutes ses données</strong> (traitements, prises, vaccins, contacts) ? Cette action est irréversible — pensez à exporter vos données en JSON avant.',
          async () => {
            await DB.creerSnapshot();
            await DB.supprimerProfilCascade(id);
            await chargerDonnees();
            renderTout();
            toast('Profil supprimé.');
          });
      }
      else if (action === 'edit-traitement') {
        const t = etat.treatments.find((x) => x.id === id);
        modalForm.dataset.id = t.id;
        modalForm.dataset.created = t.createdAt || '';
        ouvrirModal('Modifier le traitement', formTraitementHTML(t), enregistrerTraitement);
        apresFormTraitement();
      }
      else if (action === 'del-traitement') {
        const t = etat.treatments.find((x) => x.id === id);
        confirmerSuppression('Supprimer le traitement',
          'Supprimer <strong>' + esc(t.name) + '</strong> et tout son historique de prises ?',
          async () => {
            await DB.creerSnapshot();
            await DB.supprimerTraitementCascade(id);
            await chargerDonnees();
            renderTout();
            toast('Traitement supprimé.');
          });
      }
      else if (action === 'edit-vaccin') {
        const v = etat.vaccines.find((x) => x.id === id);
        modalForm.dataset.id = v.id;
        modalForm.removeAttribute('data-created');
        ouvrirModal('Modifier le vaccin', formVaccinHTML(v), enregistrerVaccin);
      }
      else if (action === 'del-vaccin') {
        const v = etat.vaccines.find((x) => x.id === id);
        confirmerSuppression('Supprimer le vaccin', 'Supprimer <strong>' + esc(v.name) + '</strong> ?',
          async () => { await DB.supprimer('vaccines', id); await chargerDonnees(); renderTout(); toast('Vaccin supprimé.'); });
      }
      else if (action === 'edit-contact') {
        const c = etat.contacts.find((x) => x.id === id);
        modalForm.dataset.id = c.id;
        modalForm.removeAttribute('data-created');
        ouvrirModal('Modifier le contact', formContactHTML(c), enregistrerContact);
      }
      else if (action === 'del-contact') {
        const c = etat.contacts.find((x) => x.id === id);
        confirmerSuppression('Supprimer le contact', 'Supprimer <strong>' + esc(c.name) + '</strong> ?',
          async () => { await DB.supprimer('contacts', id); await chargerDonnees(); renderTout(); toast('Contact supprimé.'); });
      }
    } catch (err) {
      console.error(err);
      toast('Erreur : ' + err.message, true);
    }
  });

  modalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (onValider) onValider();
  });
  $('#modal-annuler').addEventListener('click', fermerModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) fermerModal(); });

  $$('.nav button').forEach((b) => b.addEventListener('click', () => showVue(b.dataset.vue)));
  $('#marque').addEventListener('click', (e) => { e.preventDefault(); showVue('accueil'); });

  $('#sel-profil').addEventListener('change', async (e) => {
    etat.profilActif = e.target.value || null;
    await sauvegarderCle('profilActif', etat.profilActif);
    renderAccueil();
  });

  function basculerMode(mode) {
    etat.duo.mode = mode;
    if (mode === 'solo') etat.duo.a = etat.profilActif;
    else {
      if (!etat.duo.a) etat.duo.a = etat.profilActif;
      if (!etat.duo.b) etat.duo.b = etat.profiles.find((p) => p.id !== etat.duo.a) ? etat.profiles.find((p) => p.id !== etat.duo.a).id : etat.duo.a;
    }
    sauvegarderCle('duo', etat.duo).then(renderAccueil);
  }
  $('#mode-solo').addEventListener('click', () => basculerMode('solo'));
  $('#mode-duo').addEventListener('click', () => basculerMode('duo'));

  $('#sel-duo-a').addEventListener('change', async (e) => { etat.duo.a = e.target.value; await sauvegarderCle('duo', etat.duo); renderAccueil(); });
  $('#sel-duo-b').addEventListener('change', async (e) => { etat.duo.b = e.target.value; await sauvegarderCle('duo', etat.duo); renderAccueil(); });

  $('#filtre-traitements').addEventListener('change', (e) => { etat.filtreTraitements = e.target.value; renderTraitements(); });
  $('#filtre-vaccins').addEventListener('change', (e) => { etat.filtreVaccins = e.target.value; renderVaccins(); });
  $('#filtre-contacts').addEventListener('change', (e) => { etat.filtreContacts = e.target.value; renderContacts(); });
  $('#filtre-constantes').addEventListener('change', (e) => { etat.filtreConstantes = e.target.value; renderConstantes(); });

  $('#btn-ajout-profil').addEventListener('click', () => {
    modalForm.removeAttribute('data-id');
    modalForm.removeAttribute('data-created');
    ouvrirModal('Nouveau profil', formProfilHTML({}), enregistrerProfil);
    apresFormProfil();
  });
  $('#btn-ajout-traitement').addEventListener('click', () => {
    if (!etat.profiles.length) { toast('Créez d’abord un profil.', true); showVue('profils'); return; }
    modalForm.removeAttribute('data-id');
    modalForm.removeAttribute('data-created');
    ouvrirModal('Nouveau traitement', formTraitementHTML({ frequency: { type: 'quotidien' } }), enregistrerTraitement);
    apresFormTraitement();
  });
  $('#btn-ajout-vaccin').addEventListener('click', () => {
    if (!etat.profiles.length) { toast('Créez d’abord un profil.', true); showVue('profils'); return; }
    modalForm.removeAttribute('data-id');
    ouvrirModal('Nouveau vaccin', formVaccinHTML({}), enregistrerVaccin);
  });
  $('#btn-ajout-contact').addEventListener('click', () => {
    modalForm.removeAttribute('data-id');
    ouvrirModal('Nouveau contact médical', formContactHTML({}), enregistrerContact);
  });
  $('#btn-ajout-constante').addEventListener('click', () => {
    if (!etat.profiles.length) { toast('Créez d’abord un profil.', true); showVue('profils'); return; }
    modalForm.removeAttribute('data-id');
    ouvrirModal('Nouvelle mesure', formConstanteHTML({}), enregistrerConstante);
  });

  $$('#choix-theme button').forEach((b) => b.addEventListener('click', async () => {
    appliquerTheme(b.dataset.theme);
    await sauvegarderCle('theme', b.dataset.theme);
    toast('Thème « ' + b.textContent.trim() + ' » appliqué.');
  }));

  $$('#choix-taille button').forEach((b) => b.addEventListener('click', async () => {
    appliquerTaille(b.dataset.taille);
    await sauvegarderCle('tailleTexte', b.dataset.taille);
    toast('Taille du texte : ' + b.textContent.trim());
  }));

  $('#btn-pdf').addEventListener('click', () => {
    remplirFicheImpression();
    document.body.classList.add('impression-fiche');
    window.print();
  });
  window.addEventListener('afterprint', () => document.body.classList.remove('impression-fiche'));

  $('#btn-demo').addEventListener('click', () => confirmerSuppression('Données de démonstration',
    'Ajouter un profil de démonstration (Léa : allergie, traitement de crise, traitements, vaccin, contact, constante) ? Un snapshot est d’abord créé.',
    ajouterDonneesDemo));
  $('#btn-suppr-demo').addEventListener('click', () => confirmerSuppression('Supprimer les données de démonstration',
    'Supprimer le(s) profil(s) de démonstration et toutes leurs données ? Un snapshot est d’abord créé.',
    supprimerDonneesDemo));

  $('#btn-qr-export').addEventListener('click', () => { ouvrirExportQR().catch((e) => toast('QR impossible : ' + e.message, true)); });
  $('#btn-qr-import').addEventListener('click', () => { ouvrirImportQR().catch((e) => toast('Scan impossible : ' + e.message, true)); });

  $('#verrou-urgence').addEventListener('click', () => { ouvrirUrgenceVerrou().catch(() => {}); });
  $('#urgence-verrou-fermer').addEventListener('click', () => { $('#urgence-verrou').hidden = true; });

  $('#btn-exporter').addEventListener('click', () => { exporterDonnees().catch((e) => toast('Export impossible : ' + e.message, true)); });
  $('#input-import').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) f.text().then((t) => importerDepuisTexte(t, f.name));
    e.target.value = '';
  });

  $('#recherche-traitements').addEventListener('input', (e) => {
    etat.rechercheTraitements = e.target.value.trim().toLowerCase();
    renderTraitements();
  });
  $('#recherche-contacts').addEventListener('input', (e) => {
    etat.rechercheContacts = e.target.value.trim().toLowerCase();
    renderContacts();
  });

  $('#opt-rappels').addEventListener('change', async (e) => {
    etat.rappels = e.target.checked;
    await sauvegarderCle('rappels', etat.rappels);
    if (etat.rappels && 'Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch (err) {}
    }
    renderReglages();
    planifierRappels();
  });

  $('#btn-verrou').addEventListener('click', () => ouvrirModalVerrou(false));
  $('#btn-desactiver-verrou').addEventListener('click', () => ouvrirModalVerrou(true));

  const VERSION_APP = '1.2.0';
  let inscriptionSw = null;
  let miseAJourDemandee = false;
  let minuteurRappel = null;

  function montrerMiseAJour() {
    const prete = !!(inscriptionSw && inscriptionSw.waiting && navigator.serviceWorker.controller);
    const bandeau = $('#bandeau-mise-a-jour');
    if (bandeau) bandeau.hidden = !prete;
  }

  function surveillerMisesAJour(inscription) {
    inscriptionSw = inscription;
    montrerMiseAJour();
    inscription.addEventListener('updatefound', () => {
      const nouveau = inscription.installing;
      if (!nouveau) return;
      nouveau.addEventListener('statechange', () => {
        if (nouveau.state === 'installed') montrerMiseAJour();
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && inscriptionSw) {
        inscriptionSw.update().catch(() => {});
      }
    });
  }

  async function appliquerMiseAJour(bouton) {
    if (!inscriptionSw) { toast('Le mode hors ligne n’est pas disponible sur ce navigateur.', true); return; }
    if (inscriptionSw.waiting) {
      miseAJourDemandee = true;
      if (bouton) { bouton.disabled = true; bouton.textContent = 'Mise à jour…'; }
      inscriptionSw.waiting.postMessage({ type: 'activer' });
      return;
    }
    if (bouton) bouton.disabled = true;
    const info = $('#info-maj');
    if (info) info.textContent = 'Recherche de mises à jour…';
    try {
      await inscriptionSw.update();
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      if (info) info.textContent = '';
      if (bouton) bouton.disabled = false;
      toast('Hors ligne : impossible de vérifier les mises à jour pour l’instant.', true);
      return;
    }
    if (inscriptionSw.waiting) {
      montrerMiseAJour();
      await appliquerMiseAJour(bouton);
      return;
    }
    if (info) info.textContent = 'Vous utilisez déjà la dernière version (v' + VERSION_APP + ').';
    toast('Omni-MediKit est à jour (v' + VERSION_APP + ').');
    if (bouton) bouton.disabled = false;
  }

  $('#btn-mise-a-jour').addEventListener('click', (e) => appliquerMiseAJour(e.currentTarget));
  $('#btn-verifier-maj').addEventListener('click', (e) => appliquerMiseAJour(e.currentTarget));

  async function hashPin(pin) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('omni-medikit:' + pin));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function gererVerrouillage() {
    const lock = await DB.getSetting('lock', null);
    if (!lock || !lock.enabled) return;
    if (!crypto.subtle) { toast('Verrouillage indisponible sur ce navigateur (contexte non sécurisé).', true); return; }
    const el = $('#verrou');
    el.hidden = false;
    await new Promise((resolve) => {
      const input = $('#verrou-code');
      const btn = $('#verrou-ok');
      const err = $('#verrou-erreur');
      const verifier = async () => {
        const pin = input.value.trim();
        if (!/^\d{4,6}$/.test(pin)) { err.textContent = 'Code à 4 chiffres minimum.'; return; }
        const h = await hashPin(pin);
        if (h === lock.pinHash) { el.hidden = true; resolve(); }
        else { err.textContent = 'Code incorrect.'; input.value = ''; input.focus(); }
      };
      btn.addEventListener('click', verifier);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') verifier(); });
      input.focus();
    });
  }

  function ouvrirModalVerrou(desactiver) {
    if (!crypto.subtle) { toast('Verrouillage indisponible sur ce navigateur (contexte non sécurisé).', true); return; }
    const actif = !!(etat.lock && etat.lock.enabled);
    let html;
    if (desactiver && actif) {
      html = '<p>Entrez le code actuel pour désactiver le verrouillage.</p>' +
        '<div class="champ" data-cle="pinActuel"><span>Code actuel</span><input type="password" name="pinActuel" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="off"><span class="erreur" data-erreur="pinActuel"></span></div>';
    } else if (actif) {
      html = '<p>Code actuel, puis nouveau code (laisser le nouveau vide pour conserver l’actuel).</p>' +
        '<div class="champ" data-cle="pinActuel"><span>Code actuel</span><input type="password" name="pinActuel" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="off"><span class="erreur" data-erreur="pinActuel"></span></div>' +
        '<div class="champ" data-cle="pin1"><span>Nouveau code (4 à 6 chiffres, facultatif)</span><input type="password" name="pin1" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="off"><span class="erreur" data-erreur="pin1"></span></div>';
    } else {
      html = '<p>Choisissez un code à 4 chiffres (jusqu’à 6). Il sera demandé à chaque ouverture de l’application sur cet appareil.</p>' +
        '<div class="champ" data-cle="pin1"><span>Code</span><input type="password" name="pin1" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="off"><span class="erreur" data-erreur="pin1"></span></div>' +
        '<div class="champ" data-cle="pin2"><span>Confirmer le code</span><input type="password" name="pin2" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="off"><span class="erreur" data-erreur="pin2"></span></div>';
    }
    ouvrirModal(
      desactiver && actif ? 'Désactiver le verrouillage' : (actif ? 'Modifier le code de verrouillage' : 'Activer le verrouillage'),
      html,
      async () => {
        const f = modalForm;
        const pinActuel = lireValeur(f, 'pinActuel').trim();
        const pin1 = lireValeur(f, 'pin1').trim();
        const pin2 = lireValeur(f, 'pin2').trim();
        const erreurs = {};
        if (actif && (!/^\d{4,6}$/.test(pinActuel) || (await hashPin(pinActuel)) !== etat.lock.pinHash)) {
          erreurs.pinActuel = 'Code actuel incorrect.';
        }
        if (desactiver && actif) {
          if (Object.keys(erreurs).length) { afficherErreurs(erreurs); return; }
          etat.lock = { enabled: false };
          await DB.setSetting('lock', etat.lock);
          renderReglages();
          fermerModal();
          toast('Verrouillage désactivé.');
          return;
        }
        if (!actif) {
          if (!/^\d{4,6}$/.test(pin1)) erreurs.pin1 = 'Code à 4 chiffres minimum.';
          else if (pin1 !== pin2) erreurs.pin2 = 'Les deux codes ne correspondent pas.';
        } else if (pin1 && !/^\d{4,6}$/.test(pin1)) {
          erreurs.pin1 = 'Nouveau code à 4 chiffres minimum.';
        }
        if (Object.keys(erreurs).length) { afficherErreurs(erreurs); return; }
        etat.lock = { enabled: true, pinHash: pin1 ? await hashPin(pin1) : etat.lock.pinHash };
        await DB.setSetting('lock', etat.lock);
        renderReglages();
        fermerModal();
        toast(actif ? 'Code modifié.' : 'Verrouillage activé : un code sera demandé à l’ouverture.');
      });
  }

  const rappelsVaccinsEnvoyes = new Set();

  function prochaineEcheanceRappel() {
    const today = L.aujourdhui();
    const now = new Date();
    let best = null;
    for (const t of etat.treatments) {
      if (!t.reminderTime) continue;
      if (!['en-cours', 'bientot-termine', 'a-vie'].includes(L.statutTraitement(t, today))) continue;
      if (!L.estProgrammeLe(t.frequency, today)) continue;
      const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t.reminderTime);
      if (!m) continue;
      const d = new Date();
      d.setHours(Number(m[1]), Number(m[2]), 0, 0);
      if (d > now && (!best || d < best.date)) best = { date: d, kind: 'prise', t: t };
    }
    for (const v of etat.vaccines) {
      if (!v.reminderDate || !L.estDateValide(v.reminderDate)) continue;
      if (rappelsVaccinsEnvoyes.has(v.id)) continue;
      const d = new Date();
      const [y, mo, da] = v.reminderDate.split('-').map(Number);
      d.setFullYear(y, mo - 1, da);
      d.setHours(9, 0, 0, 0);
      if (d > now && (!best || d < best.date)) best = { date: d, kind: 'vaccin', v: v };
      else if (v.reminderDate <= today) best = best && best.date < now ? best : { date: new Date(now.getTime() + 5000), kind: 'vaccin', v: v };
    }
    return best;
  }

  function planifierRappels() {
    clearTimeout(minuteurRappel);
    minuteurRappel = null;
    if (!etat.rappels) return;
    const next = prochaineEcheanceRappel();
    if (!next) return;
    minuteurRappel = setTimeout(() => {
      const today = L.aujourdhui();
      if (next.kind === 'vaccin') {
        rappelsVaccinsEnvoyes.add(next.v.id);
        const corps = 'Rappel de vaccin : ' + next.v.name + ' — ' + nomProfil(next.v.profileId);
        if ('Notification' in window && Notification.permission === 'granted') {
          try { new Notification('Rappel de vaccin — Omni-MediKit', { body: corps, tag: 'vaccin-' + next.v.id }); } catch (e) {}
        }
        toast(corps);
      } else {
        const prises = dosesAujourdhui(next.t.id, today).length;
        const prevu = L.dosesPrévuesParJour(next.t.frequency, today);
        if (prises < prevu) {
          const corps = next.t.name + (next.t.dosage ? ' (' + next.t.dosage + ')' : '') + ' — ' + nomProfil(next.t.profileId);
          if ('Notification' in window && Notification.permission === 'granted') {
            try { new Notification('Rappel de prise — Omni-MediKit', { body: corps, tag: next.t.id }); } catch (e) {}
          }
          toast('Rappel de prise : ' + corps);
        }
      }
      planifierRappels();
    }, Math.max(1000, next.date.getTime() - Date.now()));
  }

  function remplirFicheImpression() {
    const today = L.aujourdhui();
    let html = '<h1>Omni-MediKit — fiche médicale</h1><p>Imprimée le ' + L.formaterDate(today) + '. Données locales de l’appareil.</p>';
    for (const p of etat.profiles) {
      const age = p.birthdate ? L.ageEnAnnees(p.birthdate, today) : null;
      html += '<h2>' + esc(p.name) + (age !== null ? ' (' + age + ' ans)' : '') + '</h2>';
      if (p.allergies || p.criseAllergique) {
        html += '<div class="alerte-sante">' +
          (p.allergies ? '<p><strong>Allergies :</strong> ' + esc(p.allergies) + '</p>' : '') +
          (p.criseAllergique ? '<p><strong>En cas de crise allergique :</strong> ' + esc(p.criseAllergique) + '</p>' : '') +
          '</div>';
      }
      const ec = p.emergencyContact || {};
      if (ec.phone) html += '<p><strong>Contact d’urgence :</strong> ' + esc(ec.name || '—') + ' — ' + esc(ec.phone) + ' (' + (ec.mode === 'sms' ? 'SMS pré-rédigé' : 'appel direct') + ')</p>';
      const trs = etat.treatments.filter((t) => t.profileId === p.id);
      if (trs.length) {
        html += '<h3>Traitements</h3><table><thead><tr><th>Médicament</th><th>Dosage</th><th>Fréquence</th><th>Début</th><th>Fin</th><th>Statut</th><th>Stock</th></tr></thead><tbody>';
        for (const t of trs) {
          const s = stockRestant(t);
          html += '<tr><td>' + esc(t.name) + '</td><td>' + esc(t.dosage || '') + '</td><td>' + esc(L.decrireFrequence(t.frequency)) + (t.reminderTime ? ' (rappel ' + esc(t.reminderTime) + ')' : '') + '</td><td>' + L.formaterDateCourte(t.startDate) + '</td><td>' + (t.lifetime ? 'à vie' : L.formaterDateCourte(t.endDate)) + '</td><td>' + esc(L.statutTraitement(t, today)) + '</td><td>' + (s === null ? '—' : s + (t.stockUnite ? ' ' + esc(t.stockUnite) : '')) + '</td></tr>';
        }
        html += '</tbody></table>';
      }
      const vacs = etat.vaccines.filter((v) => v.profileId === p.id);
      if (vacs.length) {
        html += '<h3>Vaccins</h3><table><thead><tr><th>Vaccin</th><th>Dernière injection</th><th>Prochain rappel</th></tr></thead><tbody>' +
          vacs.map((v) => '<tr><td>' + esc(v.name) + '</td><td>' + (v.lastDate ? L.formaterDateCourte(v.lastDate) : '—') + '</td><td>' + (v.reminderDate ? L.formaterDateCourte(v.reminderDate) : '—') + '</td></tr>').join('') + '</tbody></table>';
      }
      const consts = etat.constantes.filter((c) => c.profileId === p.id).slice(0, 10);
      if (consts.length) {
        html += '<h3>Dernières constantes</h3><table><thead><tr><th>Date</th><th>Mesure</th><th>Valeur</th></tr></thead><tbody>' +
          consts.map((c) => '<tr><td>' + L.formaterDateCourte(c.date) + (c.heure ? ' ' + esc(c.heure) : '') + '</td><td>' + esc(TYPES_CONSTANTES[c.type] || c.type) + '</td><td>' + esc(c.valeur) + '</td></tr>').join('') + '</tbody></table>';
      }
    }
    const globaux = etat.contacts.filter((c) => !c.profileId);
    if (globaux.length) {
      html += '<h2>Contacts médicaux (globaux)</h2><table><thead><tr><th>Nom</th><th>Spécialité</th><th>Téléphone</th><th>Adresse</th></tr></thead><tbody>' +
        globaux.map((c) => '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.specialty || '') + '</td><td>' + esc(c.phone || '') + '</td><td>' + esc(c.address || '') + '</td></tr>').join('') + '</tbody></table>';
    }
    html += '<p style="margin-top:12px;font-size:.85rem">En cas d’urgence vitale : 15 (SAMU), 18 (pompiers), 112 (Europe), 114 (sourds et malentendants). Omni-MediKit est un outil de suivi personnel, pas un dispositif médical.</p>';
    $('#fiche-impression').innerHTML = html;
  }

  async function ajouterDonneesDemo() {
    await DB.creerSnapshot();
    const today = L.aujourdhui();
    await DB.put('profiles', {
      id: 'demo-lea', demo: true, name: 'Léa (démo)', birthdate: '2015-04-02', note: 'Profil de démonstration.',
      allergies: 'Arachides', criseAllergique: 'Adrénaline (auto-injecteur), puis appeler le 15.',
      emergencyContact: { name: 'Maman', phone: '0600000000', mode: 'sms', smsText: 'Urgence : {prenom} fait une crise allergique, adrénaline injectée. Merci d’appeler le 15.' },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    await DB.put('treatments', { id: 'demo-t1', profileId: 'demo-lea', name: 'Doliprane', dosage: '1 comprimé', startDate: today, endDate: L.ajouterJours(today, 5), lifetime: false, frequency: { type: 'fois', foisParJour: 2 }, reminderTime: '08:00', stockInitial: 20, stockUnite: 'comprimés', note: '', createdAt: today });
    await DB.put('treatments', { id: 'demo-t2', profileId: 'demo-lea', name: 'Levothyrox', dosage: '50 µg', startDate: '2025-01-01', endDate: '', lifetime: true, frequency: { type: 'quotidien' }, reminderTime: '08:00', stockInitial: null, stockUnite: '', note: '', createdAt: '2025-01-01' });
    await DB.put('vaccines', { id: 'demo-v1', profileId: 'demo-lea', name: 'ROR', lastDate: '2025-06-01', reminderDate: L.ajouterJours(today, 10), note: '' });
    await DB.put('contacts', { id: 'demo-c1', profileId: '', name: 'Dr Martin (démo)', specialty: 'Médecin traitant', phone: '01 23 45 67 89', address: '12 rue de la Santé', note: '' });
    await DB.put('constantes', { id: 'demo-k1', profileId: 'demo-lea', type: 'tension', valeur: '11/7', date: today, heure: '08:30', note: '' });
    await chargerDonnees();
    renderTout();
    toast('Données de démonstration ajoutées (profil « Léa (démo) »).');
  }

  async function supprimerDonneesDemo() {
    await DB.creerSnapshot();
    for (const p of etat.profiles.filter((x) => x.demo)) await DB.supprimerProfilCascade(p.id);
    await chargerDonnees();
    renderTout();
    toast('Données de démonstration supprimées.');
  }

  async function ouvrirExportQR() {
    if (typeof QRCode === 'undefined') { toast('Génération de QR indisponible.', true); return; }
    const data = await DB.exporterTout();
    const texte = JSON.stringify(data);
    const CHUNK = 900;
    const frames = [];
    for (let i = 0; i < texte.length; i += CHUNK) frames.push(texte.slice(i, i + CHUNK));
    const payloads = frames.map((f, i) => JSON.stringify({ app: 'OMK-QR', i: i, n: frames.length, data: f }));
    ouvrirModal('Transfert QR — ' + payloads.length + ' image(s)',
      '<p>Sur l’autre appareil : Omni-MediKit → Réglages → « Recevoir un transfert », puis scannez chaque image.</p>' +
      '<div class="qr-zone"><div id="qr-cadre"></div><p class="aide" id="qr-compteur"></p>' +
      '<div class="ligne"><button type="button" class="petit-bouton" id="qr-prec">◀ Précédent</button><button type="button" class="petit-bouton" id="qr-suiv">Suivant ▶</button></div></div>',
      null);
    $('#modal-valider').style.display = 'none';
    modalForm.addEventListener('close', () => { $('#modal-valider').style.display = ''; }, { once: true });
    let idx = 0;
    const montrer = () => {
      const cadre = $('#qr-cadre');
      cadre.innerHTML = '';
      new QRCode(cadre, { text: payloads[idx], width: 240, height: 240, correctLevel: QRCode.CorrectLevel.M });
      $('#qr-compteur').textContent = 'Image ' + (idx + 1) + ' / ' + payloads.length;
    };
    $('#qr-prec').addEventListener('click', () => { idx = (idx - 1 + payloads.length) % payloads.length; montrer(); });
    $('#qr-suiv').addEventListener('click', () => { idx = (idx + 1) % payloads.length; montrer(); });
    montrer();
  }

  async function ouvrirImportQR() {
    if (!('BarcodeDetector' in window)) {
      toast('Scan QR indisponible sur ce navigateur : utilisez « Importer un JSON » ou ouvrez le fichier .json depuis le gestionnaire de fichiers.', true);
      return;
    }
    ouvrirModal('Recevoir un transfert QR',
      '<p>Autorisez la caméra, puis présentez chaque image du transfert (dans n’importe quel ordre).</p>' +
      '<video id="qr-video" autoplay playsinline muted></video><p class="aide" id="qr-etat">En attente de caméra…</p>', null);
    $('#modal-valider').style.display = 'none';
    let stream = null;
    const fermer = () => { if (stream) stream.getTracks().forEach((t) => t.stop()); };
    modalForm.addEventListener('close', fermer, { once: true });
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch (e) {
      const etatEl = $('#qr-etat');
      if (etatEl) etatEl.textContent = 'Caméra indisponible (' + e.message + '). Utilisez « Importer un JSON ».';
      return;
    }
    const video = $('#qr-video');
    video.srcObject = stream;
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const morceaux = new Map();
    let total = 0;
    const timer = setInterval(async () => {
      try {
        const codes = await detector.detect(video);
        for (const code of codes) {
          try {
            const p = JSON.parse(code.rawValue);
            if (p && p.app === 'OMK-QR' && Number.isInteger(p.i) && Number.isInteger(p.n) && typeof p.data === 'string') {
              morceaux.set(p.i, p.data);
              total = p.n;
              const etatEl = $('#qr-etat');
              if (etatEl) etatEl.textContent = 'Reçu ' + morceaux.size + ' / ' + total + ' image(s)…';
              if (morceaux.size === total) {
                clearInterval(timer);
                fermer();
                const texte = Array.from({ length: total }, (_, i) => morceaux.get(i) || '').join('');
                fermerModal();
                importerDepuisTexte(texte, 'transfert-qr.json');
              }
            }
          } catch (e) {}
        }
      } catch (e) {}
    }, 400);
  }

  async function ouvrirUrgenceVerrou() {
    const profiles = (await DB.tout('profiles')).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const treatments = await DB.tout('treatments');
    let html = '';
    for (const p of profiles) {
      const aVie = treatments.filter((t) => t.profileId === p.id && t.lifetime).map((t) => t.name);
      const ec = p.emergencyContact || {};
      html += '<article class="ligne-carte"><h3 style="font-size:1.05rem">' + esc(p.name) + '</h3>' +
        (p.allergies ? '<p><span class="statut danger">⚠ Allergies : ' + esc(p.allergies) + '</span></p>' : '') +
        (p.criseAllergique ? '<p><strong>Crise allergique :</strong> ' + esc(p.criseAllergique) + '</p>' : '') +
        (aVie.length ? '<p>Traitements à vie : ' + aVie.map(esc).join(', ') + '</p>' : '') +
        (ec.phone
          ? '<p>Contact d’urgence : <strong>' + esc(ec.name || '—') + '</strong> ' + esc(ec.phone) + ' ' +
            (ec.mode === 'sms'
              ? '<a class="petit-bouton urgence" href="' + esc(L.lienSms(ec.phone, (ec.smsText || SMS_DEFAUT).replaceAll('{prenom}', p.name))) + '">Envoyer le SMS</a>'
              : '<a class="petit-bouton urgence" href="' + esc(L.lienTel(ec.phone)) + '">Appeler</a>') + '</p>'
          : '') +
        '</article>';
    }
    if (!html) html = '<p class="vide">Aucun profil.</p>';
    $('#urgence-verrou-corps').innerHTML = html;
    $('#urgence-verrou').hidden = false;
  }

  async function init() {
    await gererVerrouillage();
    await chargerDonnees();
    appliquerTheme(etat.theme);
    appliquerTaille(etat.tailleTexte);
    const dernierSnapshot = await DB.getSetting('dernierSnapshot', '');
    if (dernierSnapshot !== L.aujourdhui()) {
      await DB.creerSnapshot().catch(() => {});
      await DB.setSetting('dernierSnapshot', L.aujourdhui());
    }
    renderTout();
    const h = (location.hash || '').replace('#', '');
    showVue(VUES.includes(h) ? h : 'accueil');
    window.addEventListener('hashchange', () => {
      const x = (location.hash || '').replace('#', '');
      if (VUES.includes(x)) showVue(x);
    });
    const v = $('#version-app');
    if (v) v.textContent = 'v' + VERSION_APP;
    try {
      const params = new URLSearchParams(location.search);
      const textePartage = (params.get('text') || params.get('title') || '').trim();
      if (textePartage) {
        history.replaceState(null, '', location.pathname + location.hash);
        if (etat.profiles.length) {
          modalForm.removeAttribute('data-id');
          modalForm.removeAttribute('data-created');
          ouvrirModal('Nouveau traitement', formTraitementHTML({ name: textePartage.slice(0, 120), frequency: { type: 'quotidien' } }), enregistrerTraitement);
          apresFormTraitement();
          toast('Texte reçu : complétez le traitement.');
        } else {
          toast('Texte reçu — créez d’abord un profil pour l’utiliser.', true);
        }
      }
    } catch (e) {}
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (miseAJourDemandee) location.reload();
      });
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'fichier-json' && typeof e.data.texte === 'string') {
          importerDepuisTexte(e.data.texte, e.data.name || 'partage.json');
        }
      });
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
        .then((inscription) => {
          surveillerMisesAJour(inscription);
          return navigator.serviceWorker.ready;
        })
        .then((inscription) => {
          if (inscription && inscription.active) inscription.active.postMessage({ type: 'demander-fichier' });
        })
        .catch((err) => console.warn('Service worker non enregistré :', err));
    }
  }

  init().catch((err) => {
    console.error(err);
    toast('Erreur au démarrage : ' + err.message, true);
  });
})();

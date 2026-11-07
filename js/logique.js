(function (root) {
  'use strict';

  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
    'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

  function pad2(n) { return String(n).padStart(2, '0'); }

    function aujourdhui(d) {
    const dt = d ? new Date(d) : new Date();
    return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
  }

    function estDateValide(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  function parseDate(s) {
    if (!estDateValide(s)) return null;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function ajouterJours(s, n) {
    const dt = parseDate(s);
    if (!dt) return null;
    dt.setDate(dt.getDate() + n);
    return aujourdhui(dt);
  }

    function diffJours(a, b) {
    const da = parseDate(a), db = parseDate(b);
    if (!da || !db) return null;
    return Math.round((db - da) / 86400000);
  }

    function jourSemaine(s) {
    const dt = parseDate(s);
    if (!dt) return null;
    return ((dt.getDay() + 6) % 7) + 1;
  }

  function formaterDate(s) {
    const dt = parseDate(s);
    if (!dt) return s || '';
    return dt.getDate() + ' ' + MOIS[dt.getMonth()] + ' ' + dt.getFullYear();
  }

  function formaterDateCourte(s) {
    if (!estDateValide(s)) return s || '';
    return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
  }

  function formaterDateHeure(iso) {
    const dt = new Date(iso);
    if (isNaN(dt)) return iso;
    return formaterDateCourte(aujourdhui(dt)) + ' à ' + pad2(dt.getHours()) + 'h' + pad2(dt.getMinutes());
  }

  function nomJour(s) {
    const j = jourSemaine(s);
    return j ? JOURS[j - 1] : '';
  }

  function ageEnAnnees(naissance, ref) {
    const dn = parseDate(naissance), dr = parseDate(ref || aujourdhui());
    if (!dn || !dr) return null;
    let age = dr.getFullYear() - dn.getFullYear();
    const m = dr.getMonth() - dn.getMonth();
    if (m < 0 || (m === 0 && dr.getDate() < dn.getDate())) age--;
    return age;
  }

    function estProgrammeLe(frequence, dateISO) {
    if (!frequence) return false;
    if (frequence.type === 'quotidien') return true;
    if (frequence.type === 'fois') return true;
    if (frequence.type === 'jours') {
      const j = jourSemaine(dateISO);
      return Array.isArray(frequence.jours) && frequence.jours.includes(j);
    }
    return false;
  }

  function dosesPrévuesParJour(frequence, dateISO) {
    if (!estProgrammeLe(frequence, dateISO)) return 0;
    if (frequence.type === 'fois') {
      const n = Number(frequence.foisParJour);
      return Number.isInteger(n) && n >= 1 && n <= 24 ? n : 1;
    }
    return 1;
  }

  function decrireFrequence(f) {
    if (!f) return '';
    if (f.type === 'quotidien') return '1 fois par jour, tous les jours';
    if (f.type === 'fois') return (f.foisParJour || 1) + ' fois par jour';
    if (f.type === 'jours' && Array.isArray(f.jours) && f.jours.length) {
      return 'Le ' + f.jours.slice().sort((a, b) => a - b).map(j => JOURS[j - 1]).join(', le ');
    }
    return 'Fréquence personnalisée';
  }

    function statutTraitement(t, ref) {
    const today = ref || aujourdhui();
    if (!t) return 'termine';
    if (t.startDate && t.startDate > today) return 'a-venir';
    if (t.lifetime) return 'a-vie';
    if (t.endDate && t.endDate < today) return 'termine';
    if (t.endDate && diffJours(today, t.endDate) <= 7) return 'bientot-termine';
    return 'en-cours';
  }

  function statutRappel(reminderDate, ref) {
    if (!reminderDate || !estDateValide(reminderDate)) return null;
    const today = ref || aujourdhui();
    const d = diffJours(today, reminderDate);
    if (d < 0) return 'en-retard';
    if (d <= 30) return 'bientot';
    return 'ok';
  }

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function normaliserTel(t) {
    return String(t || '').replace(/[^\d+]/g, '');
  }

  function lienTel(t) { return 'tel:' + normaliserTel(t); }

  function lienSms(t, texte) {
    return 'sms:' + normaliserTel(t) + '?&body=' + encodeURIComponent(texte || '');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

    function validerProfil(p) {
    const erreurs = {};
    if (!p.name || !String(p.name).trim()) erreurs.name = 'Le prénom est obligatoire.';
    if (p.birthdate && !estDateValide(p.birthdate)) erreurs.birthdate = 'Date de naissance invalide.';
    if (p.birthdate && estDateValide(p.birthdate) && p.birthdate > aujourdhui())
      erreurs.birthdate = 'La date de naissance doit être dans le passé.';
    const ec = p.emergencyContact || {};
    if (ec.phone && !normaliserTel(ec.phone)) erreurs.ecPhone = 'Numéro de téléphone invalide.';
    return { ok: Object.keys(erreurs).length === 0, erreurs };
  }

  function validerTraitement(t) {
    const erreurs = {};
    if (!t.name || !String(t.name).trim()) erreurs.name = 'Le nom du médicament est obligatoire.';
    if (!t.startDate || !estDateValide(t.startDate)) erreurs.startDate = 'Date de début invalide ou manquante.';
    if (t.startDate && estDateValide(t.startDate) && t.startDate > aujourdhui() + 3650)
      erreurs.startDate = 'Date de début trop éloignée.';
    if (!t.lifetime) {
      if (!t.endDate || !estDateValide(t.endDate)) erreurs.endDate = 'Date de fin invalide (ou cochez « traitement à vie »).';
      else if (t.startDate && estDateValide(t.startDate) && t.endDate < t.startDate)
        erreurs.endDate = 'La date de fin doit être postérieure ou égale à la date de début.';
    }
    const f = t.frequency || {};
    if (f.type === 'fois') {
      const n = Number(f.foisParJour);
      if (!Number.isInteger(n) || n < 1 || n > 24) erreurs.frequence = 'Indiquez entre 1 et 24 prises par jour.';
    }
    if (f.type === 'jours' && (!Array.isArray(f.jours) || !f.jours.length))
      erreurs.frequence = 'Cochez au moins un jour de la semaine.';
    if (t.reminderTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.reminderTime))
      erreurs.reminderTime = 'Heure de rappel invalide (format HH:MM).';
    return { ok: Object.keys(erreurs).length === 0, erreurs };
  }

  function validerVaccin(v) {
    const erreurs = {};
    if (!v.name || !String(v.name).trim()) erreurs.name = 'Le nom du vaccin est obligatoire.';
    if (v.lastDate && !estDateValide(v.lastDate)) erreurs.lastDate = 'Date de dernière injection invalide.';
    if (v.reminderDate && !estDateValide(v.reminderDate)) erreurs.reminderDate = 'Date de rappel invalide.';
    if (v.lastDate && v.reminderDate && estDateValide(v.lastDate) && estDateValide(v.reminderDate) &&
        v.reminderDate < v.lastDate)
      erreurs.reminderDate = 'Le rappel doit être postérieur à la dernière injection.';
    return { ok: Object.keys(erreurs).length === 0, erreurs };
  }

  function validerContact(c) {
    const erreurs = {};
    if (!c.name || !String(c.name).trim()) erreurs.name = 'Le nom est obligatoire.';
    if (c.phone && !normaliserTel(c.phone)) erreurs.phone = 'Numéro de téléphone invalide.';
    return { ok: Object.keys(erreurs).length === 0, erreurs };
  }

  const Logique = {
    MOIS, JOURS,
    aujourdhui, estDateValide, parseDate, ajouterJours, diffJours, jourSemaine,
    formaterDate, formaterDateCourte, formaterDateHeure, nomJour, ageEnAnnees,
    estProgrammeLe, dosesPrévuesParJour, decrireFrequence,
    statutTraitement, statutRappel, uuid, normaliserTel, lienTel, lienSms,
    escapeHtml, validerProfil, validerTraitement, validerVaccin, validerContact
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Logique;
  root.Logique = Logique;
})(typeof window !== 'undefined' ? window : globalThis);

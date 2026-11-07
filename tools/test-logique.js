#!/usr/bin/env node
'use strict';
const L = require('../js/logique.js');

let echecs = 0;
function ok(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { echecs++; console.error('  ✗ ÉCHEC : ' + msg); }
}

console.log('Dates :');
ok(L.estDateValide('2026-02-28'), '2026-02-28 valide');
ok(!L.estDateValide('2026-02-30'), '2026-02-30 invalide (rejetée)');
ok(!L.estDateValide('30/02/2026'), 'format JJ/MM/AAAA rejeté');
ok(!L.estDateValide('2026-13-01'), 'mois 13 rejeté');
ok(L.estDateValide('2024-02-29'), '2024-02-29 valide (bissextile)');
ok(!L.estDateValide('2023-02-29'), '2023-02-29 invalide');
ok(L.ajouterJours('2026-01-31', 1) === '2026-02-01', 'ajout de jours à cheval sur le mois');
ok(L.diffJours('2026-01-01', '2026-01-08') === 7, 'diffJours = 7');
ok(L.jourSemaine('2026-01-05') === 1, '2026-01-05 est un lundi (ISO 1)');
ok(L.jourSemaine('2026-01-11') === 7, '2026-01-11 est un dimanche (ISO 7)');
ok(L.formaterDate('2026-03-08') === '8 mars 2026', 'formatage long');
ok(L.formaterDateCourte('2026-03-08') === '08/03/2026', 'formatage court');
ok(L.ageEnAnnees('2010-06-15', '2026-03-01') === 15, 'âge 15 ans');
ok(L.ageEnAnnees('2010-06-15', '2026-06-14') === 15, 'âge pas encore 16');
ok(L.ageEnAnnees('2010-06-15', '2026-06-15') === 16, 'âge 16 le jour anniversaire');

console.log('Fréquences :');
ok(L.estProgrammeLe({ type: 'quotidien' }, '2026-03-08'), 'quotidien : programmé tous les jours');
ok(L.dosesPrévuesParJour({ type: 'fois', foisParJour: 3 }, '2026-03-08') === 3, '3 fois/jour → 3 doses');
ok(L.estProgrammeLe({ type: 'jours', jours: [1, 3] }, '2026-03-09'), 'jours [lun,mer] : lundi 2026-03-09 OK');
ok(!L.estProgrammeLe({ type: 'jours', jours: [1, 3] }, '2026-03-10'), 'jours [lun,mer] : mardi non');
ok(L.dosesPrévuesParJour({ type: 'jours', jours: [7] }, '2026-03-10') === 0, 'mardi hors jours [dim] → 0');
ok(L.decrireFrequence({ type: 'jours', jours: [6, 1] }).includes('lundi') && L.decrireFrequence({ type: 'jours', jours: [6, 1] }).includes('samedi'), 'description jours triés');

console.log('Statuts de traitement (réf. 2026-03-10, mardi) :');
const ref = '2026-03-10';
ok(L.statutTraitement({ startDate: '2026-03-01', endDate: '2026-03-20', lifetime: false }, ref) === 'en-cours', 'en cours');
ok(L.statutTraitement({ startDate: '2026-03-01', endDate: '2026-03-12', lifetime: false }, ref) === 'bientot-termine', 'fin dans 2 j → bientôt terminé');
ok(L.statutTraitement({ startDate: '2026-03-01', endDate: '2026-03-17', lifetime: false }, ref) === 'bientot-termine', 'fin dans exactement 7 j → bientôt terminé');
ok(L.statutTraitement({ startDate: '2026-03-01', endDate: '2026-03-18', lifetime: false }, ref) === 'en-cours', 'fin dans 8 j → encore en cours');
ok(L.statutTraitement({ startDate: '2026-03-01', endDate: '2026-03-09', lifetime: false }, ref) === 'termine', 'terminé');
ok(L.statutTraitement({ startDate: '2026-03-01', lifetime: true }, ref) === 'a-vie', 'à vie');
ok(L.statutTraitement({ startDate: '2026-03-15', endDate: '2026-04-01', lifetime: false }, ref) === 'a-venir', 'à venir');
ok(L.statutTraitement({ startDate: '2026-03-10', endDate: '2026-03-10', lifetime: false }, ref) === 'bientot-termine', 'début=fin=aujourd’hui → actif, bientôt terminé');

console.log('Rappels de vaccins :');
ok(L.statutRappel('2026-03-01', ref) === 'en-retard', 'rappel passé → en retard');
ok(L.statutRappel('2026-03-20', ref) === 'bientot', 'rappel dans 10 j → bientôt');
ok(L.statutRappel('2026-06-01', ref) === 'ok', 'rappel dans 3 mois → ok');
ok(L.statutRappel('', ref) === null, 'pas de rappel → null');

console.log('Validations :');
let v = L.validerTraitement({ name: '', startDate: '2026-03-01', endDate: '2026-03-10', lifetime: false, frequency: { type: 'quotidien' } });
ok(!v.ok && v.erreurs.name, 'traitement sans nom → erreur name');
v = L.validerTraitement({ name: 'Doliprane', startDate: '2026-03-10', endDate: '2026-03-01', lifetime: false, frequency: { type: 'quotidien' } });
ok(!v.ok && v.erreurs.endDate, 'fin avant début → erreur endDate');
v = L.validerTraitement({ name: 'Doliprane', startDate: '2026-03-01', endDate: '', lifetime: false, frequency: { type: 'quotidien' } });
ok(!v.ok && v.erreurs.endDate, 'sans date de fin et pas à vie → erreur endDate');
v = L.validerTraitement({ name: 'Doliprane', startDate: '2026-03-01', endDate: '', lifetime: true, frequency: { type: 'quotidien' } });
ok(v.ok, 'traitement à vie sans date de fin → ok');
v = L.validerTraitement({ name: 'X', startDate: '2026-03-01', endDate: '2026-03-10', lifetime: false, frequency: { type: 'fois', foisParJour: 99 } });
ok(!v.ok && v.erreurs.frequence, '99 fois/jour → erreur fréquence');
v = L.validerTraitement({ name: 'X', startDate: '2026-03-01', endDate: '2026-03-10', lifetime: false, frequency: { type: 'jours', jours: [] } });
ok(!v.ok && v.erreurs.frequence, 'jours vides → erreur fréquence');
v = L.validerProfil({ name: '  ', birthdate: '' });
ok(!v.ok && v.erreurs.name, 'profil sans prénom → erreur');
v = L.validerProfil({ name: 'Léa', birthdate: '2030-01-01' });
ok(!v.ok && v.erreurs.birthdate, 'naissance dans le futur → erreur');
v = L.validerVaccin({ name: 'ROR', lastDate: '2026-03-01', reminderDate: '2026-02-01' });
ok(!v.ok && v.erreurs.reminderDate, 'rappel avant injection → erreur');
v = L.validerContact({ name: 'Dr Martin', phone: '' });
ok(v.ok, 'contact sans téléphone → ok (téléphone facultatif)');

console.log('Liens natifs :');
ok(L.lienTel('01 23 45 67 89') === 'tel:+0123456789'.replace('+0', '0') || L.lienTel('01 23 45 67 89') === 'tel:0123456789', 'tel: nettoyé → ' + L.lienTel('01 23 45 67 89'));
ok(L.lienSms('0612345678', 'Bonjour é').startsWith('sms:0612345678?&body='), 'sms: avec body encodé');
ok(decodeURIComponent(L.lienSms('06', 'a b&c').split('body=')[1]) === 'a b&c', 'body correctement décodable');

console.log('Activité et observance :');
ok(L.estActifLe({ startDate: '2026-03-01', endDate: '2026-03-10' }, '2026-03-10'), 'actif le jour de la fin (inclus)');
ok(!L.estActifLe({ startDate: '2026-03-01', endDate: '2026-03-10' }, '2026-03-11'), 'inactif après la fin');
ok(!L.estActifLe({ startDate: '2026-03-05', endDate: '' }, '2026-03-04'), 'inactif avant le début');
ok(L.estActifLe({ startDate: '2025-01-01', lifetime: true }, '2026-03-10'), 'à vie = actif pour toujours');
const trs = [
  { startDate: '2026-03-08', endDate: '2026-03-10', frequency: { type: 'quotidien' } },
  { startDate: '2026-03-09', endDate: '', lifetime: true, frequency: { type: 'fois', foisParJour: 2 } }
];
const doses = [
  { date: '2026-03-08' }, { date: '2026-03-09' }, { date: '2026-03-09' }, { date: '2026-03-10' }
];
ok(L.observance(trs, doses, '2026-03-10', 3) === 57, 'observance 3 j : 4 prises / 7 prévues (t1: 3 j × 1, t2 actif à partir du 09 : 2 j × 2) = 57 %, got ' + L.observance(trs, doses, '2026-03-10', 3));
ok(L.observance(trs, [], '2026-03-10', 30) === 0, 'aucune prise → 0 %');
ok(L.observance([], [], '2026-03-10', 7) === null, 'rien de prévu → null');

console.log('Échappement HTML :');
ok(L.escapeHtml('<script>alert("x")</script>') === '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;', 'escapeHtml neutralise le HTML');

if (echecs) { console.error('\n' + echecs + ' échec(s)'); process.exit(1); }
console.log('\nTous les tests passent.');

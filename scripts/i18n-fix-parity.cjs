#!/usr/bin/env node
/**
 * Fix i18n parity gaps found by i18n-audit.cjs
 *
 * 1. Add 15 keys missing from en.json (English authored, terminology consistent with siblings)
 * 2. Add 4 keys missing from ht.json (reuses existing ht values where available)
 * 3. Add 18 keys missing from fr.json (reuses existing fr values where available)
 *
 * Idempotent: only writes keys that don't exist yet.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const enAdd = {
  'auth.noAccount': "Don't have an account?",
  'meetup.closeTitle': "You're close!",
  'meetup.enterCodeMsg': 'Please enter the 4-digit code shown in the buyer app.',
  'meetup.imHere': "I'm here",
  'paymentReturn.fewMinutes': "This can take a few minutes. Please don't close the app.",
  'settings.nameVisibleHidden': 'Your name is currently hidden',
  'signin.couldNotSignIn': "Couldn't sign you in",
  'signin.passkeyUnavailable': 'Passkeys are not yet available on this device',
  'signup.aboutYou': 'About you',
  'signup.birthdayTitle': 'What is your birthday?',
  'signup.emailInvalid': "That doesn't look like a complete email address",
  'signup.emailTitle': 'What is your email address?',
  'signup.joinHaiti': "Join Haiti's marketplace",
  'signup.nameError': 'First and last name help sellers know who they are talking to',
  'signup.whatsName': 'What is your name?',
};

const htAdd = {
  'auth.noAccount': 'Ou pa gen kont?',
  'feedback.offerUnavailable': 'Ofè a pa disponib',
  'meetup.paymentReleasedMsg': 'Vandè a peye. Mèsi!',
  'settings.nameVisibleHidden': 'Non ou kache kounye a',
};

const frAdd = {
  'auth.noAccount': "Vous n'avez pas de compte ?",
  'auth.signUp': 'Inscrivez-vous',
  'checkout.trustHeld': 'Votre argent est conservé en sécurité jusqu’à confirmation de la livraison ou du rendez-vous.',
  'common.justNow': "À l'instant",
  'common.today': "Aujourd'hui",
  'feedback.offerUnavailable': 'Offre indisponible',
  'meetup.checkinFailed': "Échec de l'enregistrement",
  'meetup.closeSellerMsg': 'Vous êtes à portée. Demandez le code de livraison à l’acheteur.',
  'meetup.closeTitle': 'Vous y êtes presque !',
  'meetup.codeHintSeller': "Demandez à l'acheteur le code à 4 chiffres affiché dans son application.",
  'meetup.confirmExchange': "Confirmer l'échange",
  'meetup.disputeDescEmergency': "Sortie d'urgence demandée pendant le rendez-vous. Veuillez geler cette transaction pour examen.",
  'meetup.disputeDescItemIssue': "L'acheteur n'a pas confirmé la réception de l'article en bon état.",
  'meetup.disputeOpenedMsg': 'Le support examinera cette commande. Votre paiement est conservé en sécurité.',
  'meetup.enterCodeMsg': "Veuillez saisir le code à 4 chiffres affiché dans l'application de l'acheteur.",
  'meetup.exchangeConfirmedMsg': "L'acheteur sera invité à confirmer la réception.",
  'orderDetail.buyerProposedLocation': "L'acheteur a proposé un lieu de rendez-vous",
  'settings.nameVisibleHidden': 'Votre nom est actuellement masqué',
};

function applyFix(file, additions) {
  const full = path.join(ROOT, file);
  const data = JSON.parse(fs.readFileSync(full, 'utf8'));
  let added = 0;
  for (const [k, v] of Object.entries(additions)) {
    if (!(k in data)) {
      data[k] = v;
      added++;
    }
  }
  const sorted = Object.fromEntries(
    Object.entries(data).sort(([a], [b]) => a.localeCompare(b))
  );
  fs.writeFileSync(full, JSON.stringify(sorted, null, 2) + '\n');
  return added;
}

const n1 = applyFix('messages/en.json', enAdd);
const n2 = applyFix('messages/ht.json', htAdd);
const n3 = applyFix('messages/fr.json', frAdd);
console.log(`en.json: +${n1} | ht.json: +${n2} | fr.json: +${n3}`);

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

const htAdd2 = {
  'verification.failCardTitle': 'Pa t kapab li ID ou klè',
  'verification.failDetailsTitle': 'Detay ID ou pa matche',
  'verification.failDetailsDetail': 'Non, nimewo, oswa dat sou CIN ou pa matche ak pwofil ou. Verifye kat la oswa enfòmasyon pwofil ou.',
  'verification.failFaceTitle': 'N pa t kapab matche selfi ou',
  'verification.failFaceDetail': 'Foto ID ou yo byen — se sou konparezon figi a. Eseye ankò nan limyè klè, menm.',
  'verification.infoDesc': 'Vandè Verifye jwenn yon badge fyans ak komisyon pi ba. N ap verifye CIN ayisyen ou ak yon selfi — pifò moun fini anba yon minit.',
  'verification.cameraDisabledTitle': 'Kamera verifikasyon dezaktive',
  'verification.cameraDisabledDesc': 'Verifikasyon ak kamera pa disponib kounye a.',
  'verification.webviewUnavailable': 'WebView pa disponib',
  'verification.useCameraInstead': 'Tanpri sèvi ak verifikasyon kamera olye.',
  'verification.useCameraBtn': 'Sèvi ak Kamera',
  'verification.diditUnavailable': 'Didit pa disponib',
  'verification.req1': 'Ou pral konfime chak foto anvan li itilize',
  'verification.req2': 'N ap di ou egzakteman kisa pou korije si yon bagay echwe',
  'verification.verifiedTitle': 'Ou Verified',
  'verification.verifiedDesc': 'ID ou ak selfi ou matche. Ou se kounye a yon Vandè Verified ak badj konfyans ak komisyon pi ba.',
  'verification.reviewDesc': 'Gen yon bagay ki pa bon? Repann sa a sèlman — ou pa bezwen repete rès la.',

  // OrderDetailScreen batch
  'cart.viewCart': 'Wè Panie a',
  'dispute.itemNotReceived': 'Atik la pa rive',
  'dispute.itemNotAsDescribed': 'Atik la pa janm dekri a',
  'dispute.itemArrivedDamaged': 'Atik la rive ki domaje',
  'dispute.wrongItemReceived': 'Atik pa bon ki rive',
  'dispute.other': 'Lòt bagay',
  'orderDetail.added': 'Ajoute',
  'orderDetail.claimed': 'Reklame',
  'orderDetail.disputeDescriptionOptional': 'Dekri pwoblèm nan (opsyonèl)',
  'orderDetail.goToMeetup': 'Ale nan Randevou a',
  'orderDetail.itemsAddedToCart': '{count} atik ajoute nan panie ou.',
  'orderDetail.itemsNoLongerAvailable': 'Atik nan kòmand sa a pa disponib ankò.',
  'orderDetail.maurmaketFee': 'Frè MaurMaket ({rate}%)',
  'orderDetail.moncashFee': 'Frè MonCash (~7.9%)',
  'orderDetail.orderCancelledBanner': 'Kòmand sa a anile',
  'orderDetail.productN': 'Pwodwi',
  'orderDetail.reportSubmitted': 'Rapò soumèt',
  'orderDetail.reportReviewMsg': 'N ap revize ka ou epi n ap reponn ou.',
  'orderDetail.reviewPlaceholder': 'Di lòt moun kijan eksperyans ou te ye (opsyonèl)',
  'orderDetail.sellerN': 'Vandè {n}',
  'orderDetail.sellerReceives': 'Vandè a resevwa',
  'orderDetail.sellerStatus': 'Estati Vandè',
  'orderDetail.thanks': 'Mèsi!',
  'orderDetail.unavailable': 'Pa disponib',
  'orderDetail.yesCancel': 'Wi, anile',
  'orderDetail.yesDecline': 'Wi, refize',

  // SecuritySettingsScreen batch
  'security.title': 'Sekirite',
  'security.accountSecure': 'Kont ou an sekirite',
  'security.checksPassed': '{passed}/{total} tès pase',
  'security.allChecksPassing': 'Tout tès sekirite yo pase',
  'security.completeStepsBelow': 'Ranpli etap yo anba a pou sekirize kont ou',
  'security.accountProtection': 'Pwoteksyon kont',
  'security.keepAccountSafe': 'Kenbe kont ou an sekirite',
  'security.updatePasswordRegularly': 'Chanje modpas ou regilyèman',
  'security.twoStepVerification': 'Verifikasyon an de etap',
  'security.twoFactorAuthApp': 'Aktive — app otantifikasyon',
  'security.addExtraLayer': 'Ajoute yon kouch sekirite anplis',
  'security.current': 'Aktyèl',
  'security.added': 'Ajoute',
  'security.remove': 'Retire',
  'security.deviceRemovalSoon': 'Retire aparèy bientòt',
  'security.signInMethods': 'Mwayen koneksyon',
  'security.howYouSignIn': 'Kijan ou konekte nan kont ou',
  'security.securityActivity': 'Aktivite sekirite',
  'security.recentSignInActivity': 'Aktivite koneksyon resan',
  'security.passkeysWebOnly': 'Passkeys disponib sèlman sou vèsyon web la',
  'security.passkeyRegistered': 'Passkey anrejistre avèk siksè',
  'security.passkeyRegisterFailed': 'Echwe nan anrejistreman passkey',
  'security.twoFactorEnabled': 'De-faktè aktive',
  'security.twoFactorDisabled': 'De-faktè dezaktive',
  'security.twoFactorUpdateFailed': 'Echwe nan mete ajou de-faktè',
  'security.twoHoursAgo': '2 èdtan de sa',
};

const frAdd2 = {
  'verification.failCardTitle': "Impossible de lire votre pièce d'identité clairement",
  'verification.failDetailsTitle': "Les détails de votre pièce ne correspondent pas",
  'verification.failDetailsDetail': "Le nom, le numéro ou la date sur votre CIN ne correspond pas à votre profil. Vérifiez la carte ou les informations de votre profil.",
  'verification.failFaceTitle': "Nous n'avons pas pu associer votre selfie",
  'verification.failFaceDetail': "Vos photos d'identité sont bonnes — le problème vient de la comparaison du visage. Réessayez dans un éclairage plus lumineux et uniforme.",
  'verification.infoDesc': "Les vendeurs vérifiés obtiennent un badge de confiance et une commission réduite. Nous vérifions votre CIN haïtien et un selfie — la plupart des gens ont fini en moins d'une minute.",
  'verification.cameraDisabledTitle': 'Caméra de vérification désactivée',
  'verification.cameraDisabledDesc': "La vérification par caméra est actuellement indisponible.",
  'verification.webviewUnavailable': 'WebView non disponible',
  'verification.useCameraInstead': 'Veuillez utiliser la vérification par caméra à la place.',
  'verification.useCameraBtn': 'Utiliser la caméra',
  'verification.diditUnavailable': 'Didit indisponible',
  'verification.req1': "Vous confirmez chaque photo avant son utilisation",
  'verification.req2': "Nous vous disons exactement quoi corriger en cas d'échec",
  'verification.reviewDesc': "Quelque chose ne va pas ? Reprenez seulement celle-ci — pas besoin de refaire le reste.",
  'verification.verifiedDesc': "Votre pièce d'identité et votre selfie correspondent. Vous êtes maintenant un Vendeur Vérifié avec un badge de confiance et une commission réduite.",
  'verification.verifiedTitle': 'Vous êtes vérifié',

  // OrderDetailScreen batch
  'cart.viewCart': 'Voir le panier',
  'dispute.itemNotReceived': "Article non reçu",
  'dispute.itemNotAsDescribed': "Article différent de la description",
  'dispute.itemArrivedDamaged': "Article arrivé endommagé",
  'dispute.wrongItemReceived': "Mauvais article reçu",
  'dispute.other': 'Autre',
  'orderDetail.added': 'Ajouté',
  'orderDetail.claimed': 'Réclamé',
  'orderDetail.disputeDescriptionOptional': "Décrivez le problème (facultatif)",
  'orderDetail.goToMeetup': 'Aller au rendez-vous',
  'orderDetail.itemsAddedToCart': '{count} article(s) ajouté(s) à votre panier.',
  'orderDetail.itemsNoLongerAvailable': "Les articles de cette commande ne sont plus disponibles.",
  'orderDetail.maurmaketFee': 'Frais MaurMaket ({rate}%)',
  'orderDetail.moncashFee': 'Frais MonCash (~7,9 %)',
  'orderDetail.orderCancelledBanner': 'Cette commande a été annulée',
  'orderDetail.productN': 'Produit',
  'orderDetail.reportSubmitted': 'Signalement envoyé',
  'orderDetail.reportReviewMsg': "Nous examinerons votre dossier et reviendrons vers vous.",
  'orderDetail.reviewPlaceholder': "Partagez votre expérience avec les autres (facultatif)",
  'orderDetail.sellerN': 'Vendeur {n}',
  'orderDetail.sellerReceives': 'Le vendeur reçoit',
  'orderDetail.sellerStatus': 'Statut du vendeur',
  'orderDetail.thanks': 'Merci !',
  'orderDetail.unavailable': 'Indisponible',
  'orderDetail.yesCancel': 'Oui, annuler',
  'orderDetail.yesDecline': 'Oui, refuser',

  // SecuritySettingsScreen batch
  'security.title': 'Sécurité',
  'security.accountSecure': 'Votre compte est sécurisé',
  'security.checksPassed': '{passed}/{total} vérifications réussies',
  'security.allChecksPassing': 'Toutes les vérifications de sécurité sont au vert',
  'security.completeStepsBelow': "Complétez les étapes ci-dessous pour sécuriser votre compte",
  'security.accountProtection': 'Protection du compte',
  'security.keepAccountSafe': 'Gardez votre compte en sécurité',
  'security.updatePasswordRegularly': 'Mettez à jour votre mot de passe régulièrement',
  'security.twoStepVerification': 'Vérification en deux étapes',
  'security.twoFactorAuthApp': 'Activé — application d\'authentification',
  'security.addExtraLayer': "Ajoutez une couche de sécurité supplémentaire",
  'security.current': 'Actuel',
  'security.added': 'Ajouté',
  'security.remove': 'Retirer',
  'security.deviceRemovalSoon': 'Suppression d\'appareil bientôt disponible',
  'security.signInMethods': 'Méthodes de connexion',
  'security.howYouSignIn': 'Comment vous connectez à votre compte',
  'security.securityActivity': 'Activité de sécurité',
  'security.recentSignInActivity': "Activité de connexion récente",
  'security.passkeysWebOnly': "Les clés d'accès sont uniquement disponibles sur la version web",
  'security.passkeyRegistered': "Clé d'accès enregistrée avec succès",
  'security.passkeyRegisterFailed': "Échec de l'enregistrement de la clé d'accès",
  'security.twoFactorEnabled': 'Authentification à deux facteurs activée',
  'security.twoFactorDisabled': 'Authentification à deux facteurs désactivée',
  'security.twoFactorUpdateFailed': "Échec de la mise à jour de l'authentification à deux facteurs",
  'security.twoHoursAgo': 'Il y a 2 heures',
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

const enAdd2 = {
  'verification.failCardTitle': "Couldn't read your ID clearly",
  'verification.failDetailsTitle': "Your ID details didn't match",
  'verification.failDetailsDetail': "The name, number, or date on your CIN doesn't match your profile. Double-check the card or your profile info.",
  'verification.failFaceTitle': "We couldn't match your selfie",
  'verification.failFaceDetail': "Your ID photos read fine — this is about the face comparison. Try again in brighter, even lighting.",
  'verification.infoDesc': "Verified Sellers get a trust badge and lower commission. We'll check your Haitian CIN and a selfie — most people are done in under a minute.",
  'verification.cameraDisabledTitle': 'Verification camera disabled',
  'verification.cameraDisabledDesc': 'Camera-based verification is currently unavailable.',
  'verification.webviewUnavailable': 'WebView not available',
  'verification.useCameraInstead': 'Please use camera verification instead.',
  'verification.useCameraBtn': 'Use Camera',
  'verification.diditUnavailable': 'Didit unavailable',
  'verification.req1': "You'll confirm each photo before it's used",
  'verification.req2': "We'll tell you exactly what to fix if something fails",
  'verification.reviewDesc': "Anything look off? Retake just that one — you don't need to redo the rest.",
  'verification.verifiedTitle': "You're verified",
  'verification.verifiedDesc': "Your ID and selfie matched. You're now a Verified Seller with a trust badge and lower commission.",

  // OrderDetailScreen batch
  'cart.viewCart': 'View Cart',
  'dispute.itemNotReceived': 'Item not received',
  'dispute.itemNotAsDescribed': 'Item not as described',
  'dispute.itemArrivedDamaged': 'Item arrived damaged',
  'dispute.wrongItemReceived': 'Wrong item received',
  'dispute.other': 'Other',
  'orderDetail.added': 'Added',
  'orderDetail.claimed': 'Claimed',
  'orderDetail.disputeDescriptionOptional': 'Describe the issue (optional)',
  'orderDetail.goToMeetup': 'Go to Meetup',
  'orderDetail.itemsAddedToCart': '{count} item(s) added to your cart.',
  'orderDetail.itemsNoLongerAvailable': 'Items from this order are no longer available.',
  'orderDetail.maurmaketFee': 'MaurMaket fee ({rate}%)',
  'orderDetail.moncashFee': 'MonCash fee (~7.9%)',
  'orderDetail.orderCancelledBanner': 'This order has been cancelled',
  'orderDetail.productN': 'Product',
  'orderDetail.reportSubmitted': 'Report submitted',
  'orderDetail.reportReviewMsg': 'We will review your case and get back to you.',
  'orderDetail.reviewPlaceholder': 'Tell others about your experience (optional)',
  'orderDetail.sellerN': 'Seller {n}',
  'orderDetail.sellerReceives': 'Seller receives',
  'orderDetail.sellerStatus': 'Seller Status',
  'orderDetail.thanks': 'Thanks!',
  'orderDetail.unavailable': 'Unavailable',
  'orderDetail.yesCancel': 'Yes, cancel',
  'orderDetail.yesDecline': 'Yes, decline',

  // SecuritySettingsScreen batch
  'security.title': 'Security',
  'security.accountSecure': 'Your account is secure',
  'security.checksPassed': '{passed}/{total} checks passed',
  'security.allChecksPassing': 'All security checks are passing',
  'security.completeStepsBelow': 'Complete the steps below to secure your account',
  'security.accountProtection': 'Account protection',
  'security.keepAccountSafe': 'Keep your account safe',
  'security.updatePasswordRegularly': 'Update your password regularly',
  'security.twoStepVerification': 'Two-step verification',
  'security.twoFactorAuthApp': 'Enabled — authenticator app',
  'security.addExtraLayer': 'Add an extra layer of security',
  'security.current': 'Current',
  'security.added': 'Added',
  'security.remove': 'Remove',
  'security.deviceRemovalSoon': 'Device removal coming soon',
  'security.signInMethods': 'Sign-in methods',
  'security.howYouSignIn': 'How you sign into your account',
  'security.securityActivity': 'Security activity',
  'security.recentSignInActivity': 'Recent sign-in activity',
  'security.passkeysWebOnly': 'Passkeys are only available on the web version',
  'security.passkeyRegistered': 'Passkey registered successfully',
  'security.passkeyRegisterFailed': 'Failed to register passkey',
  'security.twoFactorEnabled': 'Two-factor enabled',
  'security.twoFactorDisabled': 'Two-factor disabled',
  'security.twoFactorUpdateFailed': 'Failed to update two-factor',
  'security.twoHoursAgo': '2 hours ago',
};

const n1 = applyFix('messages/en.json', { ...enAdd, ...enAdd2 });
const n2 = applyFix('messages/ht.json', { ...htAdd, ...htAdd2 });
const n3 = applyFix('messages/fr.json', { ...frAdd, ...frAdd2 });
console.log(`en.json: +${n1} | ht.json: +${n2} | fr.json: +${n3}`);

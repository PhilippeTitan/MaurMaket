import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';

export type Language = 'en' | 'ht' | 'fr';

const STORAGE_KEY = 'mm_lang';

const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return localStorage.getItem(key);
    const SecureStore = require('expo-secure-store');
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') { localStorage.setItem(key, value); return; }
    const SecureStore = require('expo-secure-store');
    return SecureStore.setItemAsync(key, value);
  },
};

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Feed
    'feed.follow': 'Follow',
    'feed.cart': '+ Cart',
    'feed.buyNow': 'Buy Now',
    'feed.soldOut': 'Sold out',
    'feed.available': 'Available',
    'feed.noProducts': 'No products yet',
    'feed.checkBack': 'Check back soon for new listings',

    // Checkout
    'checkout.title': 'Checkout',
    'checkout.delivery': 'Delivery',
    'checkout.meetup': 'Meetup',
    'checkout.deliveryInfo': 'Delivery info',
    'checkout.fullName': 'Full name',
    'checkout.phone': 'Phone',
    'checkout.address': 'Address',
    'checkout.city': 'City',
    'checkout.note': 'Note (optional)',
    'checkout.meetupInfo': 'A meetup location will be chosen after the order. You can discuss the location with the seller in messages.',
    'checkout.promoCode': 'Promo Code',
    'checkout.enterPromo': 'Enter promo code',
    'checkout.payment': 'Payment',
    'checkout.moncashNote': 'Pay via MonCash · auto-redirected after confirm',
    'checkout.confirmPay': 'Confirm & Pay via MonCash →',
    'checkout.missingInfo': 'Missing info',
    'checkout.fillRequired': 'Please fill in all required fields.',
    'checkout.paymentRedirect': 'You will be redirected to MonCash to complete payment.',
    'checkout.orderCreated': 'Order created',
    'checkout.payLater': 'You can pay later from your orders.',

    // Add Listing
    'addListing.title': 'Add a product',
    'addListing.tapPhoto': 'Tap to add a photo',
    'addListing.productName': 'Product name',
    'addListing.description': 'Description',
    'addListing.price': 'Price (Rs)',
    'addListing.quantity': 'Quantity',
    'addListing.category': 'Category',
    'addListing.publish': 'Publish Product',
    'addListing.permission': 'Permission',
    'addListing.allowPhotos': 'Please allow access to your photos.',
    'addListing.missingInfo': 'Missing info',
    'addListing.fillFields': 'Please fill in the product name and price.',
    'addListing.success': 'Success!',
    'addListing.created': 'Product created!',

    // Settings
    'settings.title': 'Settings',
    'settings.editProfile': 'Edit Profile',
    'settings.fullName': 'Full Name',
    'settings.email': 'Email',
    'settings.phone': 'Phone',
    'settings.bio': 'Bio',
    'settings.saveProfile': 'Save Profile',
    'settings.changePassword': 'Change Password',
    'settings.currentPassword': 'Current password',
    'settings.newPassword': 'New password',
    'settings.storeSettings': 'Store Settings',
    'settings.storeName': 'Store name (optional)',
    'settings.saveStoreName': 'Save Store Name',
    'settings.changeLogo': 'Change store logo',
    'settings.addLogo': 'Add store logo',
    'settings.identityVerified': 'Identity verified',
    'settings.verificationPending': 'Verification pending',
    'settings.notVerified': 'Not verified',
    'settings.uploadId': 'Upload Government ID',
    'settings.logout': 'Logout',
    'settings.logoutConfirm': 'Are you sure you want to log out?',
    'settings.cancel': 'Cancel',
    'settings.language': 'Language',
    'settings.success': 'Success',
    'settings.profileUpdated': 'Profile updated.',
    'settings.error': 'Error',
    'settings.failed': 'Failed',
    'settings.fillPasswords': 'Please fill in all password fields.',
    'settings.passwordChanged': 'Password changed.',
    'settings.storeNameUpdated': 'Store name updated.',
    'settings.idSubmitted': 'ID submitted for verification.',
    'settings.changePhoto': 'Change profile photo',
    'settings.uploading': 'Uploading...',

    // Payments
    'payments.title': 'Payments & Payouts',
    'payments.availableBalance': 'Available Balance',
    'payments.totalEarned': 'Total Earned',
    'payments.totalPaidOut': 'Total Paid Out',
    'payments.requestPayout': 'Request Payout',
    'payments.payoutHistory': 'Payout History',
    'payments.noPayouts': 'No payouts yet',
    'payments.amount': 'Amount (min Rs 50)',
    'payments.minimum': 'Minimum',
    'payments.minWithdrawal': 'Minimum withdrawal is Rs 50.',
    'payments.insufficient': 'Insufficient balance.',
    'payments.success': 'Success!',
    'payments.requestSubmitted': 'Withdrawal request submitted!',
    'payments.notSeller': 'You are not a seller yet',
    'payments.loading': 'Loading...',

    // Orders
    'orders.title': 'Orders',
    'orders.buying': 'Buying',
    'orders.selling': 'Selling',
    'orders.noOrders': 'No orders yet',
    'orders.pullRefresh': 'Pull to refresh',

    // Common
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.save': 'Save',
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.success': 'Success',
    'common.back': 'Back',
    'common.followers': 'Followers',
    'common.following': 'Following',
    'common.reviews': 'Reviews',
    'common.products': 'Products',
    'common.orders': 'Orders',
  },

  ht: {
    // Feed
    'feed.follow': 'Abone',
    'feed.cart': '+ Panyen',
    'feed.buyNow': 'Achte kounye a',
    'feed.soldOut': 'Vann',
    'feed.available': 'Disponib',
    'feed.noProducts': 'Pa gen pwodwi ankò',
    'feed.checkBack': 'Tounen biento pou nouvo lis',

    // Checkout
    'checkout.title': 'Kòmand',
    'checkout.delivery': 'Livrezon',
    'checkout.meetup': 'Randevou',
    'checkout.deliveryInfo': 'Enfòmasyon livrezon',
    'checkout.fullName': 'Non konplè',
    'checkout.phone': 'Telefòn',
    'checkout.address': 'Adrès',
    'checkout.city': 'Vil',
    'checkout.note': 'Nòt (opsyonèl)',
    'checkout.meetupInfo': 'Yon kote randevou pral chwazi apre kòmand la. Ou ka diskite kote a ak vandè a nan mesaj yo.',
    'checkout.promoCode': 'Kòd Promo',
    'checkout.enterPromo': 'Antre kòd promo a',
    'checkout.payment': 'Peman',
    'checkout.moncashNote': 'Peye via MonCash · redirije otomatikman apre konfimasyon',
    'checkout.confirmPay': 'Konfime & Peye via MonCash →',
    'checkout.missingInfo': 'Enfòmasyon manke',
    'checkout.fillRequired': 'Tanpri ranpli tout chan obligatwa yo.',
    'checkout.paymentRedirect': 'Ou pral redirije nan MonCash pou konplete peman an.',
    'checkout.orderCreated': 'Kòmand kreye',
    'checkout.payLater': 'Ou ka peye pi tar nan kòmand ou yo.',

    // Add Listing
    'addListing.title': 'Ajoute yon pwodwi',
    'addListing.tapPhoto': 'Tape pou ajoute yon foto',
    'addListing.productName': 'Non pwodwi',
    'addListing.description': 'Deskripsyon',
    'addListing.price': 'Pri (Rs)',
    'addListing.quantity': 'Kantite',
    'addListing.category': 'Kategori',
    'addListing.publish': 'Pibliye pwodwi a',
    'addListing.permission': 'Pèmisyon',
    'addListing.allowPhotos': 'Tanpri pèmèt aksè a foto yo.',
    'addListing.missingInfo': 'Enfòmasyon manke',
    'addListing.fillFields': 'Tanpri ranpli non ak pri pwodwi a.',
    'addListing.success': 'Bravo!',
    'addListing.created': 'Pwodwi a kreye!',

    // Settings
    'settings.title': 'Paramèt',
    'settings.editProfile': '_modify profi',
    'settings.fullName': 'Non konplè',
    'settings.email': 'Imèl',
    'settings.phone': 'Telefòn',
    'settings.bio': 'Bio',
    'settings.saveProfile': 'Sove Profil',
    'settings.changePassword': 'Chanje Modpas',
    'settings.currentPassword': 'Modpas aktuel',
    'settings.newPassword': 'Nouvo modpas',
    'settings.storeSettings': 'Paramèt Boutik',
    'settings.storeName': 'Non boutik (opsyonèl)',
    'settings.saveStoreName': 'Sove Non Boutik',
    'settings.changeLogo': 'Chanje logo boutik',
    'settings.addLogo': 'Ajoute logo boutik',
    'settings.identityVerified': 'Idantite verifye',
    'settings.verificationPending': 'Verifikasyon an atant',
    'settings.notVerified': 'Pa verifye',
    'settings.uploadId': 'Téléchaje ID Gouvènman',
    'settings.logout': 'Dekonekte',
    'settings.logoutConfirm': 'Ou soti nan kont ou?',
    'settings.cancel': 'Anile',
    'settings.language': 'Lang',
    'settings.success': 'Siksè',
    'settings.profileUpdated': 'Profil ou ajoue.',
    'settings.error': 'Erè',
    'settings.failed': 'Echwe',
    'settings.fillPasswords': 'Tanpri ranpli tout chan modpas yo.',
    'settings.passwordChanged': 'Modpas ou chanje.',
    'settings.storeNameUpdated': 'Non boutik la ajoue.',
    'settings.idSubmitted': 'ID ou voye pou verifikasyon.',
    'settings.changePhoto': 'Chanje foto profil',
    'settings.uploading': 'Ap téléchaje...',

    // Payments
    'payments.title': 'Peman & retrè',
    'payments.availableBalance': 'Balans disponib',
    'payments.totalEarned': 'Total ganye',
    'payments.totalPaidOut': 'Total retire',
    'payments.requestPayout': 'Mande retrè',
    'payments.payoutHistory': 'Istorik retrè',
    'payments.noPayouts': 'Pa gen retrè ankò',
    'payments.amount': 'Kantite (min Rs 50)',
    'payments.minimum': 'Minimòm',
    'payments.minWithdrawal': 'Minimòm retrè a se Rs 50.',
    'payments.insufficient': 'Ou pa gen ase balans.',
    'payments.success': 'Bravo!',
    'payments.requestSubmitted': 'Demann retrè a voye!',
    'payments.notSeller': 'Ou pa yon vendè ankò',
    'payments.loading': 'Tanpri...',

    // Orders
    'orders.title': 'Kòmand',
    'orders.buying': 'Achte',
    'orders.selling': 'Vann',
    'orders.noOrders': 'Pa gen kòmand ankò',
    'orders.pullRefresh': 'Tire pou refreshe',

    // Common
    'common.cancel': 'Anile',
    'common.delete': 'Efase',
    'common.save': 'Sove',
    'common.loading': 'Tanpri...',
    'common.error': 'Erè',
    'common.success': 'Siksè',
    'common.back': 'Retounen',
    'common.followers': 'Abone',
    'common.following': 'Ap suiv',
    'common.reviews': 'Revi',
    'common.products': 'Pwodwi',
    'common.orders': 'Kòmand',
  },

  fr: {
    // Feed
    'feed.follow': 'Suivre',
    'feed.cart': '+ Panier',
    'feed.buyNow': 'Acheter',
    'feed.soldOut': 'Épuisé',
    'feed.available': 'Disponible',
    'feed.noProducts': 'Aucun produit',
    'feed.checkBack': 'Revenez bientôt pour de nouvelles annonces',

    // Checkout
    'checkout.title': 'Paiement',
    'checkout.delivery': 'Livraison',
    'checkout.meetup': 'Rendez-vous',
    'checkout.deliveryInfo': 'Informations de livraison',
    'checkout.fullName': 'Nom complet',
    'checkout.phone': 'Téléphone',
    'checkout.address': 'Adresse',
    'checkout.city': 'Ville',
    'checkout.note': 'Note (optionnel)',
    'checkout.meetupInfo': 'Un lieu de rendez-vous sera choisi après la commande. Vous pouvez discuter du lieu avec le vendeur dans les messages.',
    'checkout.promoCode': 'Code Promo',
    'checkout.enterPromo': 'Entrez le code promo',
    'checkout.payment': 'Paiement',
    'checkout.moncashNote': 'Payer via MonCash · redirection automatique après confirmation',
    'checkout.confirmPay': 'Confirmer & Payer via MonCash →',
    'checkout.missingInfo': 'Informations manquantes',
    'checkout.fillRequired': 'Veuillez remplir tous les champs obligatoires.',
    'checkout.paymentRedirect': 'Vous serez redirigé vers MonCash pour finaliser le paiement.',
    'checkout.orderCreated': 'Commande créée',
    'checkout.payLater': 'Vous pouvez payer plus tard depuis vos commandes.',

    // Add Listing
    'addListing.title': 'Ajouter un produit',
    'addListing.tapPhoto': 'Appuyez pour ajouter une photo',
    'addListing.productName': 'Nom du produit',
    'addListing.description': 'Description',
    'addListing.price': 'Prix (Rs)',
    'addListing.quantity': 'Quantité',
    'addListing.category': 'Catégorie',
    'addListing.publish': 'Publier le produit',
    'addListing.permission': 'Permission',
    'addListing.allowPhotos': 'Veuillez autoriser l\'accès à vos photos.',
    'addListing.missingInfo': 'Informations manquantes',
    'addListing.fillFields': 'Veuillez remplir le nom et le prix du produit.',
    'addListing.success': 'Succès!',
    'addListing.created': 'Produit créé!',

    // Settings
    'settings.title': 'Paramètres',
    'settings.editProfile': 'Modifier le profil',
    'settings.fullName': 'Nom complet',
    'settings.email': 'Email',
    'settings.phone': 'Téléphone',
    'settings.bio': 'Bio',
    'settings.saveProfile': 'Enregistrer le profil',
    'settings.changePassword': 'Changer le mot de passe',
    'settings.currentPassword': 'Mot de passe actuel',
    'settings.newPassword': 'Nouveau mot de passe',
    'settings.storeSettings': 'Paramètres de la boutique',
    'settings.storeName': 'Nom de la boutique (optionnel)',
    'settings.saveStoreName': 'Enregistrer le nom',
    'settings.changeLogo': 'Changer le logo',
    'settings.addLogo': 'Ajouter un logo',
    'settings.identityVerified': 'Identité vérifiée',
    'settings.verificationPending': 'Vérification en cours',
    'settings.notVerified': 'Non vérifié',
    'settings.uploadId': 'Télécharger une pièce d\'identité',
    'settings.logout': 'Déconnexion',
    'settings.logoutConfirm': 'Êtes-vous sûr de vouloir vous déconnecter?',
    'settings.cancel': 'Annuler',
    'settings.language': 'Langue',
    'settings.success': 'Succès',
    'settings.profileUpdated': 'Profil mis à jour.',
    'settings.error': 'Erreur',
    'settings.failed': 'Échoué',
    'settings.fillPasswords': 'Veuillez remplir tous les champs de mot de passe.',
    'settings.passwordChanged': 'Mot de passe changé.',
    'settings.storeNameUpdated': 'Nom de la boutique mis à jour.',
    'settings.idSubmitted': 'Pièce d\'identité soumise pour vérification.',
    'settings.changePhoto': 'Changer la photo de profil',
    'settings.uploading': 'Téléchargement...',

    // Payments
    'payments.title': 'Paiements & Retraits',
    'payments.availableBalance': 'Solde disponible',
    'payments.totalEarned': 'Total gagné',
    'payments.totalPaidOut': 'Total retiré',
    'payments.requestPayout': 'Demander un retrait',
    'payments.payoutHistory': 'Historique des retraits',
    'payments.noPayouts': 'Aucun retrait pour le moment',
    'payments.amount': 'Montant (min Rs 50)',
    'payments.minimum': 'Minimum',
    'payments.minWithdrawal': 'Le retrait minimum est de Rs 50.',
    'payments.insufficient': 'Solde insuffisant.',
    'payments.success': 'Succès!',
    'payments.requestSubmitted': 'Demande de retrait soumise!',
    'payments.notSeller': 'Vous n\'êtes pas encore vendeur',
    'payments.loading': 'Chargement...',

    // Orders
    'orders.title': 'Commandes',
    'orders.buying': 'Achats',
    'orders.selling': 'Ventes',
    'orders.noOrders': 'Aucune commande',
    'orders.pullRefresh': 'Tirer pour actualiser',

    // Common
    'common.cancel': 'Annuler',
    'common.delete': 'Supprimer',
    'common.save': 'Enregistrer',
    'common.loading': 'Chargement...',
    'common.error': 'Erreur',
    'common.success': 'Succès',
    'common.back': 'Retour',
    'common.followers': 'Abonnés',
    'common.following': 'Abonnements',
    'common.reviews': 'Avis',
    'common.products': 'Produits',
    'common.orders': 'Commandes',
  },
};

let currentLang: Language = 'en';
let listeners: Array<() => void> = [];

export const i18n = {
  get language() { return currentLang; },

  async init() {
    const saved = await storage.getItem(STORAGE_KEY);
    if (saved && (saved === 'en' || saved === 'ht' || saved === 'fr')) {
      currentLang = saved as Language;
    }
  },

  async setLanguage(lang: Language) {
    currentLang = lang;
    await storage.setItem(STORAGE_KEY, lang);
    listeners.forEach(fn => fn());
  },

  t(key: string): string {
    return translations[currentLang]?.[key] || translations.en[key] || key;
  },

  onChange(fn: () => void) {
    listeners.push(fn);
    return () => { listeners = listeners.filter(l => l !== fn); };
  },
};

export function useTranslation() {
  const [, setTick] = useState(0);

  useEffect(() => {
    return i18n.onChange(() => setTick(t => t + 1));
  }, []);

  const t = useCallback((key: string) => i18n.t(key), [currentLang]);

  return { t, language: i18n.language };
}

/**
 * Embedded database of Haitian areas for meetup location search.
 * Each area has: name, aliases (for fuzzy search), lat/lng center, radius in meters.
 *
 * Organized: cities → neighborhoods → sub-areas → landmarks.
 * Progressive narrowing: "Delmas" matches all Delmas areas,
 * "Delmas 33" narrows to just that sub-area.
 */

export interface HaitiArea {
  id: string;
  name: string;
  /** Searchable aliases — lowercase, accentless */
  aliases: string[];
  lat: number;
  lng: number;
  /** Approximate radius in meters for the blue circle */
  radius: number;
  /** Parent area ID (for progressive narrowing) */
  parent?: string;
  /** City this area belongs to */
  city: string;
}

const AREAS: HaitiArea[] = [
  // ═══════════════════════════════════════════
  // PORT-AU-PRINCE
  // ═══════════════════════════════════════════

  // --- Delmas ---
  { id: 'delmas', name: 'Delmas', aliases: ['delmas', 'delma'], lat: 18.5447, lng: -72.3028, radius: 2200, city: 'Port-au-Prince' },
  { id: 'delmas-2', name: 'Delmas 2', aliases: ['delmas 2', 'delmas 02', 'delma 2'], lat: 18.5545, lng: -72.3070, radius: 400, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-3', name: 'Delmas 3', aliases: ['delmas 3', 'delmas 03', 'delma 3'], lat: 18.5510, lng: -72.3050, radius: 400, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-4', name: 'Delmas 4', aliases: ['delmas 4', 'delmas 04', 'delma 4'], lat: 18.5490, lng: -72.3040, radius: 400, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-6', name: 'Delmas 6', aliases: ['delmas 6', 'delmas 06', 'delma 6'], lat: 18.5465, lng: -72.3030, radius: 400, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-15', name: 'Delmas 15', aliases: ['delmas 15', 'delma 15'], lat: 18.5430, lng: -72.3015, radius: 400, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-19', name: 'Delmas 19', aliases: ['delmas 19', 'delma 19'], lat: 18.5415, lng: -72.3005, radius: 400, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-24', name: 'Delmas 24', aliases: ['delmas 24', 'delma 24'], lat: 18.5395, lng: -72.2995, radius: 400, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-28', name: 'Delmas 28', aliases: ['delmas 28', 'delma 28'], lat: 18.5375, lng: -72.2985, radius: 400, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-30', name: 'Delmas 30', aliases: ['delmas 30', 'delma 30'], lat: 18.5360, lng: -72.2975, radius: 400, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-31', name: 'Delmas 31', aliases: ['delmas 31', 'delma 31'], lat: 18.5350, lng: -72.2970, radius: 350, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-32', name: 'Delmas 32', aliases: ['delmas 32', 'delma 32'], lat: 18.5340, lng: -72.2965, radius: 350, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-33', name: 'Delmas 33', aliases: ['delmas 33', 'delma 33'], lat: 18.5330, lng: -72.2960, radius: 350, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-35', name: 'Delmas 35', aliases: ['delmas 35', 'delma 35'], lat: 18.5315, lng: -72.2950, radius: 350, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-40', name: 'Delmas 40', aliases: ['delmas 40', 'delma 40'], lat: 18.5295, lng: -72.2940, radius: 350, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-45', name: 'Delmas 45', aliases: ['delmas 45', 'delma 45'], lat: 18.5275, lng: -72.2930, radius: 350, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-50', name: 'Delmas 50', aliases: ['delmas 50', 'delma 50', 'delmas 5'], lat: 18.5255, lng: -72.2920, radius: 350, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-56', name: 'Delmas 56', aliases: ['delmas 56', 'delma 56'], lat: 18.5235, lng: -72.2910, radius: 350, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-75', name: 'Delmas 75', aliases: ['delmas 75', 'delma 75'], lat: 18.5200, lng: -72.2895, radius: 350, parent: 'delmas', city: 'Port-au-Prince' },

  // --- Pétion-Ville ---
  { id: 'pétionville', name: 'Pétion-Ville', aliases: ['pétionville', 'pétion-ville', 'petionville', 'petion', 'peyi'], lat: 18.5118, lng: -72.2853, radius: 1800, city: 'Port-au-Prince' },
  { id: 'pétionville-bas', name: 'Pétion-Ville Bas', aliases: ['pétionville bas', 'petionville bas', 'petion bas'], lat: 18.5095, lng: -72.2840, radius: 400, parent: 'pétionville', city: 'Port-au-Prince' },
  { id: 'pétionville-haut', name: 'Pétion-Ville Haut', aliases: ['pétionville haut', 'petionville haut', 'petion haut'], lat: 18.5145, lng: -72.2865, radius: 400, parent: 'pétionville', city: 'Port-au-Prince' },
  { id: 'pétionville-plaza', name: 'Pétion-Ville Plaza', aliases: ['plaza', 'plaza nicolas', 'nicolas'], lat: 18.5125, lng: -72.2850, radius: 200, parent: 'pétionville', city: 'Port-au-Prince' },
  { id: 'umboye', name: 'Umboye', aliases: ['umboye', 'umboye', 'omboye'], lat: 18.5100, lng: -72.2830, radius: 400, parent: 'pétionville', city: 'Port-au-Prince' },
  { id: 'juventas', name: 'Juventas', aliases: ['juventas', 'juvénat'], lat: 18.5135, lng: -72.2860, radius: 300, parent: 'pétionville', city: 'Port-au-Prince' },
  { id: 'thomazeau', name: 'Thomazeau', aliases: ['thomazeau', 'tomezo'], lat: 18.5080, lng: -72.2820, radius: 400, parent: 'pétionville', city: 'Port-au-Prince' },

  // --- Carrefour ---
  { id: 'carrefour', name: 'Carrefour', aliases: ['carrefour', 'karrefou', 'carrefour-feuilles'], lat: 18.4833, lng: -72.2750, radius: 2000, city: 'Port-au-Prince' },
  { id: 'carrefour-feuilles', name: 'Carrefour Feuilles', aliases: ['carrefour feuilles', 'feuilles'], lat: 18.4870, lng: -72.2730, radius: 500, parent: 'carrefour', city: 'Port-au-Prince' },
  { id: 'carrefour-aeroport', name: 'Carrefour Aéroport', aliases: ['carrefour aeroport', 'aeroport', 'airport'], lat: 18.4800, lng: -72.2770, radius: 500, parent: 'carrefour', city: 'Port-au-Prince' },
  { id: 'kafou-bay', name: 'Kafou Bay', aliases: ['kafou bay', 'carrefour bay'], lat: 18.4815, lng: -72.2760, radius: 400, parent: 'carrefour', city: 'Port-au-Prince' },

  // --- Other PAP areas ---
  { id: 'bellevue', name: 'Bellevue', aliases: ['bellevue', 'belleville'], lat: 18.5310, lng: -72.2950, radius: 600, city: 'Port-au-Prince' },
  { id: 'turgeau', name: 'Turgeau', aliases: ['turgeau', 'turgeau'], lat: 18.5240, lng: -72.2900, radius: 500, city: 'Port-au-Prince' },
  { id: 'champ-de-mars', name: 'Champ de Mars', aliases: ['champ de mars', 'champdemars', 'marché'], lat: 18.5450, lng: -72.3360, radius: 400, city: 'Port-au-Prince' },
  { id: 'tout-puissant', name: 'Tout Puissant', aliases: ['tout puissant', 'tp'], lat: 18.5200, lng: -72.3100, radius: 500, city: 'Port-au-Prince' },
  { id: 'lafitte', name: 'Lafitte', aliases: ['lafitte', 'la fitte'], lat: 18.5350, lng: -72.3150, radius: 400, city: 'Port-au-Prince' },
  { id: 'rivière-froide', name: 'Rivière Froide', aliases: ['riviere froide', 'rivière froide', 'river froide'], lat: 18.4700, lng: -72.3400, radius: 600, city: 'Port-au-Prince' },
  { id: 'cités-unies', name: 'Cités Unies', aliases: ['cites unies', 'cités unies', 'cites'], lat: 18.5150, lng: -72.3000, radius: 400, city: 'Port-au-Prince' },
  { id: 'nerette', name: 'Nérette', aliases: ['nerette', 'nérette'], lat: 18.5280, lng: -72.2980, radius: 400, city: 'Port-au-Prince' },
  { id: 'bassin-tilleul', name: 'Bassin Tilleul', aliases: ['bassin tilleul', 'bassin'], lat: 18.5180, lng: -72.2880, radius: 400, city: 'Port-au-Prince' },

  // ═══════════════════════════════════════════
  // OTHER CITIES
  // ═══════════════════════════════════════════

  // Cap-Haïtien
  { id: 'cap-haitien', name: 'Cap-Haïtien', aliases: ['cap-haitien', 'cap', 'okap', 'kap'], lat: 19.7578, lng: -72.2044, radius: 3000, city: 'Cap-Haïtien' },
  { id: 'basin-bleu', name: 'Bassin Bleu', aliases: ['bassin bleu', 'bason bleu'], lat: 19.7700, lng: -72.1900, radius: 500, parent: 'cap-haitien', city: 'Cap-Haïtien' },
  { id: 'grande-rivière', name: 'Grande Rivière', aliases: ['grande rivière', 'grande riviere'], lat: 19.7650, lng: -72.1950, radius: 500, parent: 'cap-haitien', city: 'Cap-Haïtien' },
  { id: 'courdimanche-cap', name: 'Courdimanche', aliases: ['courdimanche', 'koudimanse'], lat: 19.7500, lng: -72.2100, radius: 500, parent: 'cap-haitien', city: 'Cap-Haïtien' },
  { id: 'sukle', name: 'Sukle', aliases: ['sukle', 'sucle'], lat: 19.7520, lng: -72.2000, radius: 400, parent: 'cap-haitien', city: 'Cap-Haïtien' },

  // Les Cayes
  { id: 'les-cayes', name: 'Les Cayes', aliases: ['les cayes', 'cayes', 'okay'], lat: 18.1933, lng: -73.7483, radius: 2500, city: 'Les Cayes' },
  { id: 'torbeck', name: 'Torbeck', aliases: ['torbeck', 'torbek'], lat: 18.1650, lng: -73.7850, radius: 800, city: 'Les Cayes' },
  { id: 'port-salut', name: 'Port-Salut', aliases: ['port-salut', 'port salut', 'salit'], lat: 18.0833, lng: -73.8167, radius: 600, city: 'Les Cayes' },

  // Gonaïves
  { id: 'gonaïves', name: 'Gonaïves', aliases: ['gonaïves', 'gonaives', 'gonayiv'], lat: 19.4433, lng: -72.6850, radius: 2000, city: 'Gonaïves' },

  // Jacmel
  { id: 'jacmel', name: 'Jacmel', aliases: ['jacmel', 'jackmel'], lat: 18.2340, lng: -72.5320, radius: 1500, city: 'Jacmel' },
  { id: 'jacmel-ville', name: 'Jacmel Ville', aliases: ['jacmel ville', 'jacmel center'], lat: 18.2340, lng: -72.5320, radius: 600, parent: 'jacmel', city: 'Jacmel' },

  // Hinche
  { id: 'hinche', name: 'Hinche', aliases: ['hinche', 'hinch'], lat: 19.1500, lng: -72.0167, radius: 1500, city: 'Hinche' },

  // Jérémie
  { id: 'jérémie', name: 'Jérémie', aliases: ['jérémie', 'jeremie', 'jere'], lat: 18.6500, lng: -74.1167, radius: 1500, city: 'Jérémie' },

  // Saint-Marc
  { id: 'saint-marc', name: 'Saint-Marc', aliases: ['saint-marc', 'saint marc', 'san mak'], lat: 19.1083, lng: -72.6900, radius: 1500, city: 'Saint-Marc' },

  // ═══════════════════════════════════════════
  // POPULAR MEETUP SPOTS / LANDMARKS
  // ═══════════════════════════════════════════

  { id: 'marche-en-fer', name: 'Marché en Fer', aliases: ['marche en fer', 'marché en fer', 'iron market', 'marché'], lat: 18.5458, lng: -72.3380, radius: 200, city: 'Port-au-Prince' },
  { id: 'marche-peyrou', name: 'Marché Peyrou', aliases: ['marche peyrou', 'marché peyrou', 'peyrou'], lat: 18.5440, lng: -72.3350, radius: 200, city: 'Port-au-Prince' },
  { id: 'carrieres-hautes', name: 'Carrières Hautes', aliases: ['carrieres hautes', 'carrières hautes', 'kare ot'], lat: 18.5030, lng: -72.2800, radius: 300, city: 'Port-au-Prince' },
  { id: 'village-de-dieu', name: 'Village de Dieu', aliases: ['village de dieu', 'village'], lat: 18.4750, lng: -72.2900, radius: 300, city: 'Port-au-Prince' },
  { id: 'sun-supermarket', name: 'Sun Supermarket', aliases: ['sun', 'supermarket', 'sun supermarket'], lat: 18.5130, lng: -72.2850, radius: 150, city: 'Port-au-Prince' },
  { id: 'magdoos', name: 'Magdoos', aliases: ['magdoos', 'magdo'], lat: 18.5115, lng: -72.2845, radius: 150, city: 'Port-au-Prince' },
  { id: 'quan-ajan', name: 'Quan Ajan', aliases: ['quan ajan', 'kwad ajan'], lat: 18.5090, lng: -72.2835, radius: 150, city: 'Port-au-Prince' },
  { id: 'boulevard-15', name: 'Boulevard 15 Août', aliases: ['boulevard', 'blvd', '15 aout', '15 août'], lat: 18.5380, lng: -72.3080, radius: 300, city: 'Port-au-Prince' },
  { id: 'university-haiti', name: 'Université d\'État d\'Haïti', aliases: ['university', 'université', 'ueh', 'university haiti'], lat: 18.5460, lng: -72.3370, radius: 200, city: 'Port-au-Prince' },
  { id: 'airport-pap', name: 'Aéroport Toussaint Louverture', aliases: ['airport', 'aéroport', 'aeroport', 'toussaint'], lat: 18.5790, lng: -72.2920, radius: 500, city: 'Port-au-Prince' },
];

/**
 * Search areas by query string.
 * Matches against name and aliases.
 * Returns results sorted alphabetically, with exact matches first.
 */
export function searchAreas(query: string): HaitiArea[] {
  if (!query || query.length < 1) return [];

  const q = query
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .trim();

  const scored: Array<{ area: HaitiArea; score: number }> = [];

  for (const area of AREAS) {
    const nameNorm = area.name
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Exact name match → score 3
    if (nameNorm === q) { scored.push({ area, score: 3 }); continue; }

    // Name starts with query → score 2
    if (nameNorm.startsWith(q)) { scored.push({ area, score: 2 }); continue; }

    // Name contains query → score 1
    if (nameNorm.includes(q)) { scored.push({ area, score: 1 }); continue; }

    // Alias match
    for (const alias of area.aliases) {
      if (alias === q || alias.startsWith(q) || alias.includes(q)) {
        scored.push({ area, score: alias === q ? 2.5 : 0.5 });
        break;
      }
    }
  }

  // Sort: highest score first, then alphabetically
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.area.name.localeCompare(b.area.name);
  });

  return scored.map(s => s.area);
}

/**
 * Get a specific area by ID.
 */
export function getAreaById(id: string): HaitiArea | undefined {
  return AREAS.find(a => a.id === id);
}

/**
 * Get all sub-areas of a parent.
 */
export function getSubAreas(parentId: string): HaitiArea[] {
  return AREAS.filter(a => a.parent === parentId);
}

/**
 * Get all areas for progressive narrowing.
 * e.g. searchFor("delmas") returns all Delmas areas.
 */
export function getRelatedAreas(area: HaitiArea): HaitiArea[] {
  if (area.parent) {
    // This is a sub-area — return siblings + parent
    const parent = AREAS.find(a => a.id === area.parent);
    const siblings = AREAS.filter(a => a.parent === area.parent && a.id !== area.id);
    return parent ? [parent, ...siblings] : siblings;
  }
  // This is a parent — return all children
  return AREAS.filter(a => a.parent === area.id);
}

export default AREAS;

/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Hybrid area search: embedded fast-lookup for common areas,
 * Nominatim API fallback for anything not in the DB.
 *
 * Flow:
 * 1. User types → search embedded JSON first (instant, offline-capable)
 * 2. If <3 results → also query Nominatim for broader coverage
 * 3. Merge + deduplicate + sort alphabetically
 */

export interface HaitiArea {
  id: string;
  name: string;
  aliases: string[];
  lat: number;
  lng: number;
  radius: number;
  parent?: string;
  city: string;
}

// ═══════════════════════════════════════════
// EMBEDDED HOT AREAS (fast offline lookup)
// ═══════════════════════════════════════════

const HOT_AREAS: HaitiArea[] = [
  // Delmas
  { id: 'delmas', name: 'Delmas', aliases: ['delmas', 'delma'], lat: 18.5447, lng: -72.3028, radius: 2200, city: 'Port-au-Prince' },
  { id: 'delmas-2', name: 'Delmas 2', aliases: ['delmas 2', 'delmas 02'], lat: 18.5545, lng: -72.3070, radius: 400, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-3', name: 'Delmas 3', aliases: ['delmas 3', 'delmas 03'], lat: 18.5510, lng: -72.3050, radius: 400, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-4', name: 'Delmas 4', aliases: ['delmas 4', 'delmas 04'], lat: 18.5490, lng: -72.3040, radius: 400, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-6', name: 'Delmas 6', aliases: ['delmas 6'], lat: 18.5465, lng: -72.3030, radius: 400, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-15', name: 'Delmas 15', aliases: ['delmas 15'], lat: 18.5430, lng: -72.3015, radius: 400, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-19', name: 'Delmas 19', aliases: ['delmas 19'], lat: 18.5415, lng: -72.3005, radius: 400, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-24', name: 'Delmas 24', aliases: ['delmas 24'], lat: 18.5395, lng: -72.2995, radius: 400, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-28', name: 'Delmas 28', aliases: ['delmas 28'], lat: 18.5375, lng: -72.2985, radius: 400, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-30', name: 'Delmas 30', aliases: ['delmas 30'], lat: 18.5360, lng: -72.2975, radius: 400, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-31', name: 'Delmas 31', aliases: ['delmas 31'], lat: 18.5350, lng: -72.2970, radius: 350, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-32', name: 'Delmas 32', aliases: ['delmas 32'], lat: 18.5340, lng: -72.2965, radius: 350, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-33', name: 'Delmas 33', aliases: ['delmas 33'], lat: 18.5330, lng: -72.2960, radius: 350, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-35', name: 'Delmas 35', aliases: ['delmas 35'], lat: 18.5315, lng: -72.2950, radius: 350, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-40', name: 'Delmas 40', aliases: ['delmas 40'], lat: 18.5295, lng: -72.2940, radius: 350, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-45', name: 'Delmas 45', aliases: ['delmas 45'], lat: 18.5275, lng: -72.2930, radius: 350, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-50', name: 'Delmas 50', aliases: ['delmas 50', 'delmas 5'], lat: 18.5255, lng: -72.2920, radius: 350, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-56', name: 'Delmas 56', aliases: ['delmas 56'], lat: 18.5235, lng: -72.2910, radius: 350, parent: 'delmas', city: 'Port-au-Prince' },
  { id: 'delmas-75', name: 'Delmas 75', aliases: ['delmas 75'], lat: 18.5200, lng: -72.2895, radius: 350, parent: 'delmas', city: 'Port-au-Prince' },

  // Pétion-Ville
  { id: 'pétionville', name: 'Pétion-Ville', aliases: ['pétionville', 'pétion-ville', 'petionville', 'petion'], lat: 18.5118, lng: -72.2853, radius: 1800, city: 'Port-au-Prince' },
  { id: 'umboye', name: 'Umboye', aliases: ['umboye', 'omboye'], lat: 18.5100, lng: -72.2830, radius: 400, parent: 'pétionville', city: 'Port-au-Prince' },
  { id: 'juventas', name: 'Juventas', aliases: ['juventas', 'juvénat'], lat: 18.5135, lng: -72.2860, radius: 300, parent: 'pétionville', city: 'Port-au-Prince' },
  { id: 'thomazeau', name: 'Thomazeau', aliases: ['thomazeau', 'tomezo'], lat: 18.5080, lng: -72.2820, radius: 400, parent: 'pétionville', city: 'Port-au-Prince' },

  // Carrefour
  { id: 'carrefour', name: 'Carrefour', aliases: ['carrefour', 'karrefou'], lat: 18.4833, lng: -72.2750, radius: 2000, city: 'Port-au-Prince' },
  { id: 'carrefour-feuilles', name: 'Carrefour Feuilles', aliases: ['carrefour feuilles', 'feuilles'], lat: 18.4870, lng: -72.2730, radius: 500, parent: 'carrefour', city: 'Port-au-Prince' },

  // Other PAP
  { id: 'bellevue', name: 'Bellevue', aliases: ['bellevue', 'belleville'], lat: 18.5310, lng: -72.2950, radius: 600, city: 'Port-au-Prince' },
  { id: 'turgeau', name: 'Turgeau', aliases: ['turgeau'], lat: 18.5240, lng: -72.2900, radius: 500, city: 'Port-au-Prince' },
  { id: 'champ-de-mars', name: 'Champ de Mars', aliases: ['champ de mars', 'champdemars'], lat: 18.5450, lng: -72.3360, radius: 400, city: 'Port-au-Prince' },
  { id: 'tout-puissant', name: 'Tout Puissant', aliases: ['tout puissant', 'tp'], lat: 18.5200, lng: -72.3100, radius: 500, city: 'Port-au-Prince' },
  { id: 'lafitte', name: 'Lafitte', aliases: ['lafitte', 'la fitte'], lat: 18.5350, lng: -72.3150, radius: 400, city: 'Port-au-Prince' },
  { id: 'rivière-froide', name: 'Rivière Froide', aliases: ['riviere froide', 'rivière froide'], lat: 18.4700, lng: -72.3400, radius: 600, city: 'Port-au-Prince' },
  { id: 'cités-unies', name: 'Cités Unies', aliases: ['cites unies', 'cités unies'], lat: 18.5150, lng: -72.3000, radius: 400, city: 'Port-au-Prince' },
  { id: 'nerette', name: 'Nérette', aliases: ['nerette', 'nérette'], lat: 18.5280, lng: -72.2980, radius: 400, city: 'Port-au-Prince' },
  { id: 'bassin-tilleul', name: 'Bassin Tilleul', aliases: ['bassin tilleul', 'bassin'], lat: 18.5180, lng: -72.2880, radius: 400, city: 'Port-au-Prince' },

  // Other cities
  { id: 'cap-haitien', name: 'Cap-Haïtien', aliases: ['cap-haitien', 'cap', 'okap', 'kap'], lat: 19.7578, lng: -72.2044, radius: 3000, city: 'Cap-Haïtien' },
  { id: 'les-cayes', name: 'Les Cayes', aliases: ['les cayes', 'cayes', 'okay'], lat: 18.1933, lng: -73.7483, radius: 2500, city: 'Les Cayes' },
  { id: 'gonaïves', name: 'Gonaïves', aliases: ['gonaïves', 'gonaives', 'gonayiv'], lat: 19.4433, lng: -72.6850, radius: 2000, city: 'Gonaïves' },
  { id: 'jacmel', name: 'Jacmel', aliases: ['jacmel', 'jackmel'], lat: 18.2340, lng: -72.5320, radius: 1500, city: 'Jacmel' },
  { id: 'hinche', name: 'Hinche', aliases: ['hinche', 'hinch'], lat: 19.1500, lng: -72.0167, radius: 1500, city: 'Hinche' },
  { id: 'jérémie', name: 'Jérémie', aliases: ['jérémie', 'jeremie'], lat: 18.6500, lng: -74.1167, radius: 1500, city: 'Jérémie' },
  { id: 'saint-marc', name: 'Saint-Marc', aliases: ['saint-marc', 'saint marc', 'san mak'], lat: 19.1083, lng: -72.6900, radius: 1500, city: 'Saint-Marc' },
  { id: 'port-salut', name: 'Port-Salut', aliases: ['port-salut', 'port salut'], lat: 18.0833, lng: -73.8167, radius: 600, city: 'Les Cayes' },
  { id: 'torbeck', name: 'Torbeck', aliases: ['torbeck', 'torbek'], lat: 18.1650, lng: -73.7850, radius: 800, city: 'Les Cayes' },

  // Landmarks
  { id: 'marche-en-fer', name: 'Marché en Fer', aliases: ['marche en fer', 'marché en fer', 'iron market'], lat: 18.5458, lng: -72.3380, radius: 200, city: 'Port-au-Prince' },
  { id: 'sun-supermarket', name: 'Sun Supermarket', aliases: ['sun', 'supermarket'], lat: 18.5130, lng: -72.2850, radius: 150, city: 'Port-au-Prince' },
  { id: 'magdoos', name: 'Magdoos', aliases: ['magdoos', 'magdo'], lat: 18.5115, lng: -72.2845, radius: 150, city: 'Port-au-Prince' },
  { id: 'airport-pap', name: 'Aéroport Toussaint Louverture', aliases: ['airport', 'aéroport', 'aeroport'], lat: 18.5790, lng: -72.2920, radius: 500, city: 'Port-au-Prince' },
  { id: 'boulevard-15', name: 'Boulevard 15 Août', aliases: ['boulevard', '15 aout'], lat: 18.5380, lng: -72.3080, radius: 300, city: 'Port-au-Prince' },
];

// ═══════════════════════════════════════════
// NOMINATIM LIVE SEARCH (expanded coverage)
// ═══════════════════════════════════════════

let nominatimAbort: AbortController | null = null;

/**
 * Query Nominatim for Haitian places matching the query.
 * Bounded to Haiti's bbox for relevance.
 * Returns at most 10 results.
 */
async function searchNominatim(query: string): Promise<HaitiArea[]> {
  // Cancel previous request
  nominatimAbort?.abort();
  nominatimAbort = new AbortController();

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ' Haiti')}&format=json&limit=10&addressdetails=1&extratags=1&bounded=1&viewbox=-74.5,17.5,-71.5,20.5`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'MaurMaket/2.0' },
      signal: nominatimAbort.signal,
    });
    const data = await res.json();

    return data.map((r: any, i: number) => {
      const addr = r.address || {};
      const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
      // Estimate radius from boundingbox if available
      let radius = 800;
      if (r.boundingbox) {
        const [south, north, west, east] = r.boundingbox.map(Number);
        const latSpan = (north - south) * 111_000; // meters
        const lngSpan = (east - west) * 111_000 * Math.cos(r.lat * Math.PI / 180);
        radius = Math.round(Math.max(latSpan, lngSpan) / 2);
        radius = Math.max(200, Math.min(radius, 5000)); // clamp
      }

      return {
        id: `nominatim-${r.osm_type}-${r.osm_id}`,
        name: r.display_name?.split(',')[0] || r.name || query,
        aliases: [],
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        radius,
        city: city || 'Haiti',
      };
    });
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════

/**
 * Search areas by query string.
 * 1. Search embedded JSON first (instant)
 * 2. If ≤2 results → also query Nominatim for broader coverage
 * 3. Merge + deduplicate + sort
 */
export async function searchAreasHybrid(query: string): Promise<HaitiArea[]> {
  if (!query || query.length < 1) return [];

  const q = query
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();

  // 1. Embedded search (instant)
  const embedded = searchEmbedded(q);

  // 2. If few results, query Nominatim
  if (embedded.length <= 2 && q.length >= 2) {
    const online = await searchNominatim(query);
    // Merge: embedded first, then online (deduplicate by name proximity)
    const merged = [...embedded];
    for (const area of online) {
      const isDupe = merged.some(m =>
        Math.abs(m.lat - area.lat) < 0.005 && Math.abs(m.lng - area.lng) < 0.005
      );
      if (!isDupe) merged.push(area);
    }
    return merged.slice(0, 10);
  }

  return embedded.slice(0, 10);
}

/** Synchronous embedded search — for offline/fast path */
function searchEmbedded(q: string): HaitiArea[] {
  const scored: Array<{ area: HaitiArea; score: number }> = [];

  for (const area of HOT_AREAS) {
    const nameNorm = area.name
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (nameNorm === q) { scored.push({ area, score: 3 }); continue; }
    if (nameNorm.startsWith(q)) { scored.push({ area, score: 2 }); continue; }
    if (nameNorm.includes(q)) { scored.push({ area, score: 1 }); continue; }

    for (const alias of area.aliases) {
      if (alias === q || alias.startsWith(q) || alias.includes(q)) {
        scored.push({ area, score: alias === q ? 2.5 : 0.5 });
        break;
      }
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.area.name.localeCompare(b.area.name);
  });

  return scored.map(s => s.area);
}

/** Get area by ID */
export function getAreaById(id: string): HaitiArea | undefined {
  return HOT_AREAS.find(a => a.id === id);
}

/** Cancel any pending Nominatim request */
export function cancelSearch(): void {
  nominatimAbort?.abort();
}

/** Legacy export for backward compat */
export const searchAreas = searchEmbedded;



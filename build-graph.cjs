const fs = require('fs');
const path = require('path');

const ARCHIVE_DIR = path.join('C:', 'MAURINEX', 'MAURINEX NOTES', 'MaurMaket', 'sessions', 'archive');
const OUTPUT = path.join('C:', 'MAURINEX', 'MAURINEX NOTES', 'MaurMaket', 'sessions', 'graph.json');

// Known screens, features, decisions to extract
const KNOWN_SCREENS = [
  'FeedScreen', 'ExploreScreen', 'ProductDetailScreen', 'CartScreen', 'CheckoutScreen',
  'OrdersScreen', 'OrderDetailScreen', 'ChatScreen', 'MessagesScreen', 'MeScreen',
  'SettingsScreen', 'SettingsEditScreen', 'AddListingScreen', 'EditListingScreen',
  'StorefrontScreen', 'SellerOnboardingScreen', 'MapScreen', 'NearbyMarketScreen',
  'SearchScreen', 'SignUpScreen', 'LoginScreen', 'VerificationScreen',
  'SaleSection', 'BuyRow', 'ScreenHeader', 'TierRing',
  'EditProfileScreen', 'LocationSettingsScreen', 'SellerToolsSettingsScreen',
  'PrivacySettingsScreen', 'UsernameSettingsScreen', 'AnalyticsScreen'
];

const KNOWN_FEATURES = [
  'MonCash', 'Escrow', 'FeedAlgorithm', 'ChatSystem', 'ImageUpload', 'IDVerification',
  'FaceVerification', 'SellerTierSystem', 'FollowSystem', 'WishlistSystem', 'OfferSystem',
  'PushNotifications', 'i18n', 'Accessibility', 'DarkMode', 'SafeArea', 'BackButton',
  'LocationSystem', 'GPSMap', 'PriceCap', 'SaleSection', 'PromoCode', 'QRCode',
  'ProfileRevamp', 'Username', 'ShowRealName', 'GraphRAG', 'MCPMemory'
];

const KNOWN_AUDITS = [
  'Performance', 'Security', 'Reliability', 'BuyerSellerFlow', 'DesignUI',
  'ChatMessaging', 'OrderCheckoutPayment', 'Accessibility', 'Backend'
];

// Date-indexed sessions for fast lookup
const dateIndex = {};

function getAllFiles(dir) {
  const results = [];
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const full = path.join(dir, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        results.push(...getAllFiles(full));
      } else if (item.endsWith('.md')) {
        results.push(full);
      }
    }
  } catch (e) {}
  return results;
}

function extractDateFromPath(filePath) {
  const match = filePath.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : 'unknown';
}

function extractSessionId(filePath) {
  const match = filePath.match(/ses_([a-f0-9]+)/);
  return match ? `ses_${match[1]}` : null;
}

function extractType(filePath) {
  if (filePath.includes('_main_')) return 'main';
  if (filePath.includes('_explore_')) return 'explore';
  if (filePath.includes('_general_')) return 'general';
  return 'unknown';
}

function extractTitle(filePath) {
  const base = path.basename(filePath, '.md');
  const match = base.match(/(?:main|explore|general)_ses_[a-f0-9]+_(.+)$/);
  return match ? match[1].replace(/_/g, ' ') : base;
}

function findMentions(text, keywords) {
  const found = [];
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) {
      found.push(kw);
    }
  }
  return [...new Set(found)];
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) fm[key.trim()] = rest.join(':').trim();
  }
  return fm;
}

// Build entities and relations
const entities = [];
const relations = [];
const entityMap = new Set();

function addEntity(name, type, observations) {
  const key = `${type}:${name}`;
  if (entityMap.has(key)) {
    // Merge observations
    const existing = entities.find(e => e.name === name && e.entityType === type);
    if (existing) {
      existing.observations = [...new Set([...existing.observations, ...observations])];
    }
    return;
  }
  entityMap.add(key);
  entities.push({ name, entityType: type, observations: [...new Set(observations)] });
}

function addRelation(from, to, type) {
  const key = `${from}->${to}:${type}`;
  if (!relations.find(r => r.from === from && r.to === to && r.relationType === type)) {
    relations.push({ from, to, relationType: type });
  }
}

// Add project entity
addEntity('MaurMaket', 'project', [
  'Haitian marketplace React Native/Expo + Express.js',
  'The Amazon of Haiti',
  'Last commit: 52de73e',
  'Frontend IP: 10.55.244.105:3001',
  'Production: maurmaket.onrender.com',
  'Database: Neon primary, Supabase fallback',
  '233 sessions archived'
]);

// Add known screens
for (const screen of KNOWN_SCREENS) {
  addEntity(screen, 'screen', []);
}

// Add known features
for (const feature of KNOWN_FEATURES) {
  addEntity(feature, 'feature', []);
}

// Add known audits
for (const audit of KNOWN_AUDITS) {
  addEntity(`Audit_${audit}`, 'milestone', []);
}

// Process all archive files
const allFiles = getAllFiles(ARCHIVE_DIR);
console.log(`Found ${allFiles.length} archive files`);

let processedCount = 0;
for (const file of allFiles) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const date = extractDateFromPath(file);
    const sessionId = extractSessionId(file);
    const type = extractType(file);
    const title = extractTitle(file);

    // Create session entity
    const sessionName = sessionId || `Session_${path.basename(file, '.md').substring(0, 30)}`;
    const observations = [
      `Date: ${date}`,
      `Type: ${type}`,
      `Title: ${title}`
    ];

    // Extract commits from content
    const commitMatches = content.match(/Commit[s]?:?\s*`?([a-f0-9]{7,})`?/gi);
    if (commitMatches) {
      for (const cm of commitMatches) {
        const hash = cm.match(/([a-f0-9]{7,})/);
        if (hash) observations.push(`Commit: ${hash[1]}`);
      }
    }

    addEntity(sessionName, 'session', observations);
    addRelation(sessionName, 'MaurMaket', 'belongs_to');

    // Date entity
    if (date !== 'unknown') {
      const dateEntity = `Date_${date}`;
      addEntity(dateEntity, 'date', [`Sessions on ${date}`]);
      addRelation(sessionName, dateEntity, 'occurred_on');
      
      // Track sessions per date for grouping
      if (!dateIndex[date]) dateIndex[date] = [];
      dateIndex[date].push(sessionName);
    }

    // Find mentions of screens
    const screensFound = findMentions(content, KNOWN_SCREENS);
    for (const screen of screensFound) {
      addRelation(sessionName, screen, 'modified');
    }

    // Find mentions of features
    const featuresFound = findMentions(content, KNOWN_FEATURES);
    for (const feature of featuresFound) {
      addRelation(sessionName, feature, 'worked_on');
    }

    // Find mentions of audits
    const auditsFound = findMentions(content, KNOWN_AUDITS);
    for (const audit of auditsFound) {
      addRelation(sessionName, `Audit_${audit}`, 'part_of');
    }

    // Extract bug mentions
    const bugPatterns = content.match(/(?:bug|fix|error|crash|broken|issue)[^\n]{0,100}/gi);
    if (bugPatterns && type === 'main') {
      for (const bug of bugPatterns.slice(0, 5)) {
        const cleanBug = bug.replace(/[^\w\s-]/g, '').trim().substring(0, 80);
        if (cleanBug.length > 10) {
          addEntity(`Bug_${cleanBug.substring(0, 40).replace(/\s+/g, '_')}`, 'bugfix', [
            `Mentioned in ${sessionName} on ${date}`
          ]);
        }
      }
    }

    processedCount++;
  } catch (e) {
    // Skip unreadable files
  }
}

// Add milestone entities for major phases
const milestones = [
  { name: 'Phase_1_Core_Build', obs: ['March-April 2026: Initial backend + frontend build'] },
  { name: 'Phase_2_Marketplace_Features', obs: ['June 2026: Products, cart, checkout, payments'] },
  { name: 'Phase_3_Social_Features', obs: ['June-July 2026: Chat, follow, feed algorithm'] },
  { name: 'Phase_4_Map_GPS', obs: ['July 2026: NearbyMarket, MapScreen, GPS'] },
  { name: 'Phase_5_Seller_System', obs: ['June-July 2026: Tiers, verification, storefronts'] },
  { name: 'Phase_6_UI_Revamp', obs: ['July 2026: Instagram-style, Pinterest redesign'] },
  { name: 'Phase_7_Audits', obs: ['July 2026: Comprehensive audits across all domains'] },
  { name: 'Phase_8_Memory_System', obs: ['July 2026: Graph-RAG MCP memory integration'] },
];

for (const m of milestones) {
  addEntity(m.name, 'milestone', m.obs);
}
addRelation('MaurMaket', 'Phase_1_Core_Build', 'has_phase');
addRelation('MaurMaket', 'Phase_2_Marketplace_Features', 'has_phase');
addRelation('MaurMaket', 'Phase_3_Social_Features', 'has_phase');
addRelation('MaurMaket', 'Phase_4_Map_GPS', 'has_phase');
addRelation('MaurMaket', 'Phase_5_Seller_System', 'has_phase');
addRelation('MaurMaket', 'Phase_6_UI_Revamp', 'has_phase');
addRelation('MaurMaket', 'Phase_7_Audits', 'has_phase');
addRelation('MaurMaket', 'Phase_8_Memory_System', 'has_phase');

// Add key decisions
const decisions = [
  { name: 'Decision_DualDB', obs: ['Neon primary + Supabase fallback', 'Session 019'] },
  { name: 'Decision_ImgBB', obs: ['Image upload via ImgBB API', 'Expiry-based cleanup'] },
  { name: 'Decision_MonCashConnect', obs: ['Payment via MonCashConnect MCP', 'Sandbox testing'] },
  { name: 'Decision_Tareef', obs: ['Face verification via Tareef API', 'NOT Luxand'] },
  { name: 'Decision_EditProfile_vs_Settings', obs: ['Edit Profile = avatar+username+name+bio', 'Settings = everything else'] },
  { name: 'Decision_Graph_RAG_Tool', obs: ['@modelcontextprotocol/server-memory', 'Single JSON graph file'] },
  { name: 'Decision_Currency', obs: ['Haitian Gourde symbol G', 'Placed after number', 'Max 99999 G'] },
];

for (const d of decisions) {
  addEntity(d.name, 'decision', d.obs);
}
addRelation('MaurMaket', 'Decision_DualDB', 'has_decision');
addRelation('MaurMaket', 'Decision_ImgBB', 'has_decision');
addRelation('MaurMaket', 'Decision_MonCashConnect', 'has_decision');
addRelation('MaurMaket', 'Decision_Tareef', 'has_decision');
addRelation('MaurMaket', 'Decision_EditProfile_vs_Settings', 'has_decision');
addRelation('MaurMaket', 'Decision_Graph_RAG_Tool', 'has_decision');
addRelation('MaurMaket', 'Decision_Currency', 'has_decision');

// Add key components
const components = [
  { name: 'Server_js', obs: ['Backend ~5800 lines', 'Express.js + PostgreSQL'] },
  { name: 'Api_ts', obs: ['API client', 'isDev flag', 'IP: 10.55.244.105'] },
  { name: 'App_tsx', obs: ['Tab navigation', '56px tab bar'] },
  { name: 'Store_ts', obs: ['User state management'] },
  { name: 'UseUser_hook', obs: ['React Query + store subscription'] },
  { name: 'Icon_component', obs: ['Custom SVG icon system', 'Null guard added'] },
  { name: 'Theme_ts', obs: ['COLORS, SPACING, RADIUS, FONTS'] },
];

for (const c of components) {
  addEntity(c.name, 'component', c.obs);
}

// Write output
const graph = { entities, relations };
fs.writeFileSync(OUTPUT, JSON.stringify(graph, null, 2));

console.log(`\nGraph built:`);
console.log(`  Entities: ${entities.length}`);
console.log(`  Relations: ${relations.length}`);
console.log(`  Sessions processed: ${processedCount}`);
console.log(`  Entity types: ${[...new Set(entities.map(e => e.entityType))].join(', ')}`);
console.log(`  Relation types: ${[...new Set(relations.map(r => r.relationType))].join(', ')}`);
console.log(`  Dates covered: ${Object.keys(dateIndex).length}`);
console.log(`\nDate index:`);
for (const [date, sessions] of Object.entries(dateIndex).sort()) {
  console.log(`  ${date}: ${sessions.length} sessions`);
}

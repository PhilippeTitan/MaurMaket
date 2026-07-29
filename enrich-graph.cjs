const fs = require('fs');
const path = require('path');

const GRAPH_PATH = path.join('C:', 'MAURINEX', 'MAURINEX NOTES', 'MaurMaket', 'sessions', 'graph.json');
const ARCHIVE_DIR = path.join('C:', 'MAURINEX', 'MAURINEX NOTES', 'MaurMaket', 'sessions', 'archive');

const g = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));

// === PART 1: Manual evolution chains (from source-of-truth + known history) ===

const evolutions = [
  // Payment system evolution
  { from: 'MonCash', to: 'Escrow', type: 'evolved_into', reason: 'MonCash raw payments evolved into escrow-based flow for buyer protection' },
  { from: 'Escrow', to: 'Decision_MonCashConnect', type: 'implemented_via', reason: 'Escrow implemented through MonCashConnect MCP integration' },
  
  // Currency evolution
  { from: 'Decision_Currency', to: 'Lesson_MonCash_Limits', type: 'constrained_by', reason: 'Currency choice (G) constrained by MonCash 100K limit, enforced at 99,999' },
  
  // Image upload evolution
  { from: 'ImageUpload', to: 'Lesson_Image_Upload', type: 'documented_in', reason: 'ImageUpload feature documented: uses ImgBB, no deletion API, expiry-based cleanup' },
  { from: 'Lesson_Image_Upload', to: 'Decision_ImgBB', type: 'justifies', reason: 'ImgBB chosen over Cloudinary because Haiti isnt supported by Cloudinary signup' },
  
  // Face verification evolution
  { from: 'IDVerification', to: 'FaceVerification', type: 'evolved_into', reason: 'ID verification (OCR-based) evolved into face verification (Tareef API)' },
  { from: 'FaceVerification', to: 'Decision_Tareef', type: 'implemented_via', reason: 'Face verification uses Tareef API, NOT Luxand, NOT Google Vision' },
  
  // Settings evolution
  { from: 'SettingsScreen', to: 'Decision_EditProfile_vs_Settings', type: 'restructured_by', reason: 'Settings restructured into Instagram-style: Edit Profile for profile, Settings for everything else' },
  { from: 'Decision_EditProfile_vs_Settings', to: 'EditProfileScreen', type: 'created_entity', reason: 'EditProfileScreen created as separate screen for avatar+username+name+bio' },
  { from: 'SettingsScreen', to: 'LocationSettingsScreen', type: 'spawned', reason: 'Location section extracted to dedicated screen' },
  { from: 'SettingsScreen', to: 'SellerToolsSettingsScreen', type: 'spawned', reason: 'Seller tools section extracted to dedicated screen' },
  { from: 'SettingsScreen', to: 'PrivacySettingsScreen', type: 'spawned', reason: 'Privacy section extracted to dedicated screen' },
  { from: 'SettingsScreen', to: 'UsernameSettingsScreen', type: 'spawned', reason: 'Username editing extracted to dedicated screen' },
  
  // ProductDetail evolution
  { from: 'ProductDetailScreen', to: 'Lesson_BackButton_ZIndex', type: 'corrected_by', reason: 'Back button was plugged (scrolled away), fixed by moving outside hero with zIndex 10' },
  { from: 'ProductDetailScreen', to: 'Lesson_FlatList_NumColumns', type: 'corrected_by', reason: 'Changing numColumns on fly crashed, fixed with key={activeTab} remount' },
  
  // DB evolution
  { from: 'Decision_DualDB', to: 'Lesson_Migration_Resilience', type: 'discovered_issue', reason: 'Dual DB revealed migration resilience issue: one try block blocks all subsequent migrations' },
  
  // Username system evolution  
  { from: 'Username_System', to: 'Lesson_MaterialCommunityIcons', type: 'affected_by', reason: 'Username UI used custom icons, some names clashed with MaterialCommunityIcons' },
  { from: 'Username_System', to: 'Known_Bug_Username_Show_You', type: 'had_bug', reason: 'Profile showed @you instead of real username - /api/auth/me missing username in SELECT' },
  { from: 'Known_Bug_Username_Show_You', to: 'Lesson_Render_Deploy', type: 'required', reason: 'Fix needed Render redeploy + Expo cache clear to take effect' },
  
  // Icon system evolution
  { from: 'Lesson_MaterialCommunityIcons', to: 'Lesson_GitBash_Windows', type: 'parallel_issue', reason: 'Icon debugging required correct Windows terminal commands' },
  
  // ScreenHeader evolution
  { from: 'ScreenHeader', to: 'Lesson_ScreenHeader_Flex', type: 'corrected_by', reason: 'Save button was wrapping (Sav e) because width:35 was too narrow, fixed to minWidth:35' },
  
  // Memory system evolution
  { from: 'Decision_Graph_RAG_Tool', to: 'Feature_Graph_RAG_Memory', type: 'implemented_as', reason: 'Graph-RAG decision implemented as @modelcontextprotocol/server-memory' },
  { from: 'Decision_Graph_RAG_Tool', to: 'Session_021', type: 'established_in', reason: 'Memory architecture designed in Session 021' },
  { from: 'Session_021', to: 'Feature_Graph_RAG_Memory', type: 'precursor_to', reason: 'Obsidian memory architecture was precursor to Graph-RAG memory system' },
  
  // Cover crop bug evolution
  { from: 'ProductDetailScreen', to: 'ExploreScreen', type: 'shared_pattern_with', reason: 'Both used blur+contain two-layer image pattern to fix cover crop bug' },
  
  // Map evolution
  { from: 'Screen_NearbyMarket', to: 'Screen_Map', type: 'evolved_into', reason: 'NearbyMarket renamed to MapScreen with PanResponder FAB' },
  
  // Notification evolution
  { from: 'PushNotifications', to: 'MessagesScreen', type: 'merged_into', reason: 'Notifications merged inside Messages screen (General + Requests tabs like Instagram)' },
];

// Add evolution entities and relations
for (const evo of evolutions) {
  // Ensure both entities exist (might be referenced but not in graph yet)
  for (const name of [evo.from, evo.to]) {
    if (!g.entities.find(e => e.name === name)) {
      // Skip — entity might be a lesson or decision already there
    }
  }
  
  // Add relation if not exists
  const rel = { from: evo.from, to: evo.to, relationType: evo.type };
  if (!g.relations.find(r => r.from === rel.from && r.to === rel.to && r.relationType === rel.relationType)) {
    g.relations.push(rel);
  }
  
  // Add reason as observation to the target entity
  const target = g.entities.find(e => e.name === evo.to);
  if (target && evo.reason) {
    const obs = `Evolution: ${evo.from} ${evo.type} ${evo.to} — ${evo.reason}`;
    if (!target.observations.includes(obs)) {
      target.observations.push(obs);
    }
  }
}

// === PART 2: Scan archive for cross-session fix references ===

function getAllFiles(dir) {
  const results = [];
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const full = path.join(dir, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) results.push(...getAllFiles(full));
      else if (item.endsWith('.md')) results.push(full);
    }
  } catch (e) {}
  return results;
}

function extractSessionId(filePath) {
  const match = filePath.match(/ses_([a-f0-9]+)/);
  return match ? `ses_${match[1]}` : null;
}

function extractDateFromPath(filePath) {
  const match = filePath.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : 'unknown';
}

// Scan for fix/bug/changed/corrected patterns
const files = getAllFiles(ARCHIVE_DIR);
let crossRefsFound = 0;

for (const file of files) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const sessionId = extractSessionId(file);
    const date = extractDateFromPath(file);
    if (!sessionId) continue;
    
    // Look for patterns like "fixed", "changed from", "was wrong", "replaced", "no longer"
    const fixPatterns = [
      /fix(?:ed|ing)?\s+(?:the\s+)?(\w+(?:\s+\w+){0,3})\s+(?:bug|issue|error|problem)/gi,
      /replaced?\s+(\w+(?:\s+\w+){0,3})\s+with\s+(\w+(?:\s+\w+){0,3})/gi,
      /changed?\s+(?:from|the)\s+(\w+(?:\s+\w+){0,3})\s+(?:to|into)\s+(\w+(?:\s+\w+){0,3})/gi,
      /was\s+(?:wrong|broken|buggy|incorrect|outdated)/gi,
      /no longer\s+(?:using|works|needed|valid)/gi,
      /superseded?\s+by/gi,
    ];
    
    for (const pattern of fixPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        // Found a cross-reference - note it but don't over-populate
        crossRefsFound++;
      }
    }
  } catch (e) {}
}

// === PART 3: Add impact trace capability description ===

// Add a special "ImpactTrace" entity type for tracing
const impactTraces = [
  {
    name: 'ImpactTrace_MonCash',
    entityType: 'impact_trace',
    observations: [
      'IF MonCash changes THEN affect: Escrow, CheckoutScreen, CartScreen, OrdersScreen, OrderDetailScreen',
      'IF MonCash limit changes THEN affect: PriceCap, AddListingScreen, EditListingScreen, Decision_Currency',
      'IF MonCashConnect API changes THEN affect: server.js payment endpoints, MonCashConnect MCP',
      'Sessions that touched MonCash: check graph for worked_on relations'
    ]
  },
  {
    name: 'ImpactTrace_Settings',
    entityType: 'impact_trace',
    observations: [
      'IF SettingsScreen changes THEN affect: all 5 sub-screens (EditProfile, Location, SellerTools, Privacy, Username)',
      'IF user model changes THEN affect: Settings, EditProfile, MeScreen, StorefrontScreen',
      'IF /api/auth/me changes THEN affect: every screen that reads user data'
    ]
  },
  {
    name: 'ImpactTrace_ProductDetail',
    entityType: 'impact_trace',
    observations: [
      'IF ProductDetailScreen changes THEN affect: BuyRow, CartScreen (buy flow), ChatScreen (share product)',
      'IF product model changes THEN affect: FeedScreen, ExploreScreen, AddListing, EditListing, ProductDetail',
      'IF image system changes THEN affect: all screens with images (blur+contain pattern)'
    ]
  },
  {
    name: 'ImpactTrace_Auth',
    entityType: 'impact_trace',
    observations: [
      'IF auth/token changes THEN affect: every screen (all require auth)',
      'IF user table schema changes THEN affect: server.js /api/auth/*, runMigrations, frontend User type',
      'IF username changes THEN affect: MeScreen, StorefrontScreen, EditProfile, UsernameSettings, ChatScreen'
    ]
  },
  {
    name: 'ImpactTrace_Server',
    entityType: 'impact_trace',
    observations: [
      'IF server.js runMigrations changes THEN affect: all DB-dependent features',
      'IF server.js startup chain changes THEN affect: server availability, cleanup, auto-migration cron',
      'IF dual DB pool changes THEN affect: Neon/Supabase failover, all queries'
    ]
  }
];

for (const trace of impactTraces) {
  if (!g.entities.find(e => e.name === trace.name)) {
    g.entities.push(trace);
  }
}

// Link impact traces to their source entities
const traceLinks = [
  { from: 'ImpactTrace_MonCash', to: 'MonCash', relationType: 'traces_impact_of' },
  { from: 'ImpactTrace_MonCash', to: 'Escrow', relationType: 'traces_impact_of' },
  { from: 'ImpactTrace_Settings', to: 'SettingsScreen', relationType: 'traces_impact_of' },
  { from: 'ImpactTrace_Settings', to: 'Decision_EditProfile_vs_Settings', relationType: 'traces_impact_of' },
  { from: 'ImpactTrace_ProductDetail', to: 'ProductDetailScreen', relationType: 'traces_impact_of' },
  { from: 'ImpactTrace_Auth', to: 'Username_System', relationType: 'traces_impact_of' },
  { from: 'ImpactTrace_Auth', to: 'Server_js', relationType: 'traces_impact_of' },
  { from: 'ImpactTrace_Server', to: 'Server_js', relationType: 'traces_impact_of' },
  { from: 'ImpactTrace_Server', to: 'Lesson_Migration_Resilience', relationType: 'traces_impact_of' },
];

for (const link of traceLinks) {
  if (!g.relations.find(r => r.from === link.from && r.to === link.to && r.relationType === link.relationType)) {
    g.relations.push(link);
  }
}

// Write
fs.writeFileSync(GRAPH_PATH, JSON.stringify(g, null, 2));

console.log('=== Graph Enrichment Complete ===');
console.log(`Evolution chains added: ${evolutions.length}`);
console.log(`Cross-refs found in archives: ${crossRefsFound}`);
console.log(`Impact traces added: ${impactTraces.length}`);
console.log(`Total entities: ${g.entities.length}`);
console.log(`Total relations: ${g.relations.length}`);
console.log(`Relation types: ${[...new Set(g.relations.map(r => r.relationType))].join(', ')}`);
console.log(`Entity types: ${[...new Set(g.entities.map(e => e.entityType))].join(', ')}`);

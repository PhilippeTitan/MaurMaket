#!/usr/bin/env node
/**
 * MaurMaket Session Archive Script v2
 * 
 * Captures ALL conversation data: tool calls, reasoning, patches, diffs.
 * Organizes by date in sessions/archive/YYYY/YYYY-MM/
 * 
 * Usage:
 *   node archive-sessions.cjs                    # Archive all unarchived sessions
 *   node archive-sessions.cjs --id ses_xxx       # Archive specific session
 *   node archive-sessions.cjs --limit 5          # Archive last 5 sessions
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(process.env.HOME || process.env.USERPROFILE, '.local', 'share', 'opencode', 'opencode.db');
const ARCHIVE_DIR = path.join(process.env.HOME || process.env.USERPROFILE, 'MAURINEX', 'MAURINEX NOTES', 'MaurMaket', 'sessions', 'archive');

const db = new Database(DB_PATH, { readonly: true });

function escapeYaml(str) {
  if (!str) return '""';
  if (/[:{}\[\],&*?|>!%@`#'"\n]/.test(str) || str.trim() !== str) {
    return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
  }
  return str;
}

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatTime(iso) {
  return new Date(iso).toTimeString().slice(0, 8);
}

function truncate(str, maxLen = 50000) {
  if (!str || str.length <= maxLen) return str || '';
  return str.slice(0, maxLen) + '\n\n[TRUNCATED]';
}

function getMessages(sessionId) {
  return db.prepare(`
    SELECT id, time_created, data 
    FROM message WHERE session_id = ? 
    ORDER BY time_created ASC
  `).all(sessionId);
}

function getMessageParts(messageId) {
  return db.prepare(`
    SELECT id, time_created, data
    FROM part WHERE message_id = ? 
    ORDER BY time_created ASC
  `).all(messageId);
}

function formatPart(partData) {
  const lines = [];
  const type = partData.type || 'unknown';
  
  switch (type) {
    case 'text':
      lines.push(partData.text || '');
      break;
      
    case 'tool': {
      const toolName = partData.tool || 'unknown';
      const callId = partData.callID || '';
      lines.push(`\`\`\`tool-call: ${toolName} (${callId})`);
      
      if (partData.state?.input) {
        try {
          const input = typeof partData.state.input === 'string' ? JSON.parse(partData.state.input) : partData.state.input;
          lines.push(JSON.stringify(input, null, 2));
        } catch {
          lines.push(String(partData.state.input).slice(0, 5000));
        }
      }
      lines.push('```\n');
      
      if (partData.state?.output) {
        lines.push(`**Result:**`);
        const output = typeof partData.state.output === 'string' ? partData.state.output : JSON.stringify(partData.state.output);
        lines.push(truncate(output, 10000));
        lines.push('');
      }
      break;
    }
      
    case 'reasoning':
      if (partData.text) {
        lines.push(`> **Reasoning:**`);
        truncate(partData.text, 10000).split('\n').forEach(l => lines.push(`> ${l}`));
        lines.push('');
      }
      break;
      
    case 'patch':
      if (partData.patch) {
        lines.push(`**Patch — ${partData.patch.file || 'unknown'}:**`);
        lines.push('```diff');
        lines.push(truncate(partData.patch.content || '', 30000));
        lines.push('```\n');
      }
      break;
      
    case 'file':
      if (partData.file) {
        lines.push(`📎 File: \`${partData.file.path || partData.file}\``);
      }
      break;
      
    case 'step-start':
      if (partData.title) lines.push(`---\n**Step: ${partData.title}**\n`);
      break;
      
    case 'step-finish':
      lines.push(`---\n*Step complete*\n`);
      break;
      
    default:
      lines.push(`[${type}]`);
      if (partData.text) lines.push(truncate(partData.text, 2000));
      break;
  }
  
  return lines.join('\n');
}

function archiveSession(session) {
  const messages = getMessages(session.id);
  let archivedParts = 0;
  
  const date = new Date(session.time_created);
  const yearMonth = `${date.getFullYear()}/${String(date.getMonth()+1).padStart(2,'0')}`;
  const dayDir = path.join(ARCHIVE_DIR, yearMonth);
  fs.mkdirSync(dayDir, { recursive: true });
  
  const sessionDate = formatDate(session.time_created);
  const safeTitle = (session.title || 'untitled')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60);
  
  const filename = `${sessionDate}_${safeTitle || 'untitled'}.md`;
  const filepath = path.join(dayDir, filename);
  
  let md = `---
session_id: ${session.id}
title: "${escapeYaml(session.title || 'Untitled')}"
created: ${session.time_created}
version: ${session.version || 'unknown'}
---

# ${session.title || 'Untitled'}

**Session ID:** \`${session.id}\`  
**Date:** ${sessionDate} ${formatTime(session.time_created)}  

---

`;
  
  for (const msg of messages) {
    let msgData = {};
    try { msgData = typeof msg.data === 'string' ? JSON.parse(msg.data) : (msg.data || {}); } catch {}
    
    const role = msgData.role === 'user' ? '**User**' : msgData.role === 'assistant' ? '**Assistant**' : `**${msgData.role || 'unknown'}**`;
    md += `## ${role} — ${formatTime(msg.time_created)}\n\n`;
    
    if (msgData.text) md += msgData.text + '\n\n';
    
    const parts = getMessageParts(msg.id);
    for (const part of parts) {
      let partData = {};
      try { partData = typeof part.data === 'string' ? JSON.parse(part.data) : (part.data || {}); } catch { partData = { type: 'text', text: String(part.data) }; }
      
      md += formatPart(partData) + '\n';
      archivedParts++;
    }
    
    if (msgData.diffs) {
      md += `\n**Message Diffs:**\n\`\`\`json\n${truncate(JSON.stringify(msgData.diffs, null, 2), 5000)}\n\`\`\`\n`;
    }
    
    md += '\n---\n\n';
  }
  
  fs.writeFileSync(filepath, md, 'utf8');
  return { filename, parts: archivedParts };
}

function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) || 10 : null;
  const idIdx = args.indexOf('--id');
  const specificId = idIdx >= 0 ? args[idIdx + 1] : null;
  
  let sessions;
  if (specificId) {
    sessions = db.prepare('SELECT * FROM session WHERE id = ?').all(specificId);
  } else if (limit) {
    sessions = db.prepare('SELECT * FROM session ORDER BY time_created DESC LIMIT ?').all(limit);
  } else {
    sessions = db.prepare('SELECT * FROM session ORDER BY time_created DESC').all();
  }
  
  console.log(`Archiving ${sessions.length} sessions...\n`);
  
  let archived = 0, errored = 0;
  
  for (const session of sessions) {
    try {
      const result = archiveSession(session);
      console.log(`✅ ${(session.title || 'untitled').slice(0, 50)} — ${result.parts} parts`);
      archived++;
    } catch (err) {
      console.error(`❌ ${(session.title || 'untitled').slice(0, 50)} — ${err.message}`);
      errored++;
    }
  }
  
  console.log(`\nDone: ${archived} archived, ${errored} errored`);
  db.close();
}

main();

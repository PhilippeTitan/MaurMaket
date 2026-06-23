import * as api from '../api.js';
import store from '../store.js';
import { showToast } from '../toast.js';
import { navigate } from '../main.js';

export default async function MessagesPage(page, { conversationId } = {}) {
  if (!store.isLoggedIn) { navigate('/login'); return; }
  if (conversationId) return showChat(page, conversationId);
  return showList(page);
}

async function showList(page) {
  page.innerHTML = '<div class="fullscreen-page"><div class="loading"><div class="spinner"></div></div></div>';
  try {
    const { conversations } = await api.getConversations();
    page.innerHTML = `
      <div style="height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--bg);">
        <div class="topbar">
          <i class="ti ti-arrow-left" id="msg-back" style="font-size:22px;color:var(--text2);cursor:pointer;padding:4px;"></i>
          <span class="logo" style="margin-left:4px;">Messages</span>
          <div class="topbar-right"></div>
        </div>
        <div style="flex:1;overflow-y:auto;padding:8px 12px;">
          ${conversations.length > 0 ? conversations.map(c => {
            const timeAgo = getTimeAgo(new Date(c.last_message_at));
            return `
              <div class="conv-item" data-id="${c.id}" style="display:flex;gap:12px;padding:12px 8px;border-bottom:1px solid var(--border);cursor:pointer;">
                <div class="avatar-md" style="flex-shrink:0;">${(c.other_party_name || 'U')[0]}</div>
                <div style="flex:1;min-width:0;">
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div style="font-size:0.85rem;font-weight:600;color:var(--text);">${c.other_party_name}</div>
                    <div style="font-size:0.65rem;color:var(--text2);">${timeAgo}</div>
                  </div>
                  <div style="font-size:0.78rem;color:var(--text2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">${c.last_message || 'No messages yet'}</div>
                </div>
                ${c.unread_count > 0 ? `<div style="background:var(--coral);color:#fff;font-size:0.6rem;font-weight:700;padding:2px 6px;border-radius:8px;flex-shrink:0;align-self:center;">${c.unread_count}</div>` : ''}
              </div>
            `;
          }).join('') : '<div style="text-align:center;padding:40px 20px;color:var(--text2);font-size:0.85rem;">No conversations yet</div>'}
        </div>
      </div>
    `;
    page.querySelector('#msg-back').addEventListener('click', () => window.history.back());
    page.querySelectorAll('.conv-item').forEach(el => {
      el.addEventListener('click', () => {
        navigate('/messages', { conversationId: el.dataset.id });
      });
    });
  } catch (err) {
    page.innerHTML = `<div class="fullscreen-page"><div class="empty-state"><h3>Error</h3><p>${err.message}</p></div></div>`;
  }
}

async function showChat(page, conversationId) {
  page.innerHTML = '<div class="fullscreen-page"><div class="loading"><div class="spinner"></div></div></div>';
  try {
    const { messages } = await api.getMessages(conversationId);
    const { conversations } = await api.getConversations();
    const conv = conversations.find(c => c.id === conversationId);
    const otherName = conv ? conv.other_party_name : 'Chat';
    page.innerHTML = `
      <div style="height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--bg);">
        <div class="topbar">
          <i class="ti ti-arrow-left" id="chat-back" style="font-size:22px;color:var(--text2);cursor:pointer;padding:4px;"></i>
          <span class="logo" style="margin-left:4px;font-size:16px;">${otherName}</span>
          <div class="topbar-right"></div>
        </div>
        <div id="chat-messages" style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:6px;">
          ${messages.length > 0 ? messages.map(m => {
            const isMine = m.sender_id === store.user.id;
            return `
              <div style="display:flex;justify-content:${isMine ? 'flex-end' : 'flex-start'};">
                <div style="max-width:80%;padding:8px 14px;border-radius:16px;background:${isMine ? 'var(--coral)' : 'var(--surface)'};color:${isMine ? '#fff' : 'var(--text)'};font-size:0.85rem;word-wrap:break-word;">
                  ${escapeHtml(m.content)}
                  <div style="font-size:0.6rem;opacity:0.6;margin-top:4px;text-align:right;">${formatTime(new Date(m.created_at))}</div>
                </div>
              </div>
            `;
          }).join('') : '<div style="text-align:center;padding:40px;color:var(--text2);font-size:0.85rem;">No messages yet. Say hello!</div>'}
        </div>
        <div style="display:flex;gap:8px;padding:8px 12px;border-top:1px solid var(--border);background:var(--surface);">
          <input id="chat-input" type="text" placeholder="Type a message..." style="flex:1;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:20px;padding:10px 14px;font-size:0.85rem;outline:none;font-family:'Inter',sans-serif;">
          <button id="chat-send" style="background:var(--coral);color:#fff;border:none;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;"><i class="ti ti-send"></i></button>
        </div>
      </div>
    `;
    const messagesContainer = page.querySelector('#chat-messages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    page.querySelector('#chat-back').addEventListener('click', () => navigate('/messages'));
    const input = page.querySelector('#chat-input');
    const sendBtn = page.querySelector('#chat-send');
    async function sendMsg() {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      try {
        const { message } = await api.sendMessage(conversationId, text);
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;justify-content:flex-end;';
        div.innerHTML = `<div style="max-width:80%;padding:8px 14px;border-radius:16px;background:var(--coral);color:#fff;font-size:0.85rem;word-wrap:break-word;">${escapeHtml(message.content)}<div style="font-size:0.6rem;opacity:0.6;margin-top:4px;text-align:right;">just now</div></div>`;
        messagesContainer.appendChild(div);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
    sendBtn.addEventListener('click', sendMsg);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMsg(); });
    const pollInterval = setInterval(async () => {
      try {
        const { messages: newMessages } = await api.getMessages(conversationId);
        const existingTexts = new Set();
        messagesContainer.querySelectorAll('.msg-bubble').forEach(el => existingTexts.add(el.textContent));
        messagesContainer.innerHTML = newMessages.map(m => {
          const isMine = m.sender_id === store.user.id;
          return `
            <div style="display:flex;justify-content:${isMine ? 'flex-end' : 'flex-start'};">
              <div style="max-width:80%;padding:8px 14px;border-radius:16px;background:${isMine ? 'var(--coral)' : 'var(--surface)'};color:${isMine ? '#fff' : 'var(--text)'};font-size:0.85rem;word-wrap:break-word;">
                ${escapeHtml(m.content)}
                <div style="font-size:0.6rem;opacity:0.6;margin-top:4px;text-align:right;">${formatTime(new Date(m.created_at))}</div>
              </div>
            </div>
          `;
        }).join('');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      } catch {}
    }, 5000);
    page._pollInterval = pollInterval;
    window.addEventListener('beforeunload', () => clearInterval(pollInterval));
  } catch (err) {
    page.innerHTML = `<div class="fullscreen-page"><div class="empty-state"><h3>Error</h3><p>${err.message}</p></div></div>`;
  }
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function getTimeAgo(date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

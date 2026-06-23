import * as api from '../api.js';
import store from '../store.js';
import { navigate } from '../main.js';

export default async function NotificationsPage(page) {
  if (!store.isLoggedIn) { navigate('/login'); return; }
  page.innerHTML = '<div class="fullscreen-page"><div class="loading"><div class="spinner"></div></div></div>';
  try {
    const { notifications } = await api.getNotifications();
    api.markAllNotificationsRead().catch(() => {});
    page.innerHTML = `
      <div style="height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--bg);">
        <div class="topbar">
          <i class="ti ti-arrow-left" id="notif-back" style="font-size:22px;color:var(--text2);cursor:pointer;padding:4px;"></i>
          <span class="logo" style="margin-left:4px;">Notifications</span>
          <div class="topbar-right"></div>
        </div>
        <div style="flex:1;overflow-y:auto;padding:12px;">
          ${notifications.length > 0 ? notifications.map(n => {
            const icons = {
              order_status: '<i class="ti ti-truck" style="color:var(--blue);"></i>',
              new_follower: '<i class="ti ti-users" style="color:var(--green);"></i>',
              review_received: '<i class="ti ti-star" style="color:var(--coral);"></i>',
              meetup_proposed: '<i class="ti ti-map-pin" style="color:var(--coral);"></i>',
              meetup_confirmed: '<i class="ti ti-circle-check" style="color:var(--green);"></i>',
              payment_received: '<i class="ti ti-currency" style="color:var(--green);"></i>',
            };
            const icon = icons[n.type] || '<i class="ti ti-bell"></i>';
            const timeAgo = getTimeAgo(new Date(n.created_at));
            return `
              <div class="notif-item" data-id="${n.id}" data-order="${n.data?.orderId || ''}" style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);cursor:pointer;">
                <div style="width:36px;height:36px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;flex-shrink:0;">${icon}</div>
                <div style="flex:1;min-width:0;">
                  <div style="font-size:0.85rem;font-weight:600;color:var(--text);">${n.title}</div>
                  <div style="font-size:0.78rem;color:var(--text2);margin-top:2px;">${n.body || ''}</div>
                  <div style="font-size:0.7rem;color:var(--text3);margin-top:4px;">${timeAgo}</div>
                </div>
                ${!n.is_read ? '<div style="width:8px;height:8px;border-radius:50%;background:var(--coral);flex-shrink:0;margin-top:4px;"></div>' : ''}
              </div>
            `;
          }).join('') : '<div style="text-align:center;padding:40px 20px;color:var(--text2);font-size:0.85rem;">No notifications yet</div>'}
        </div>
      </div>
    `;
    page.querySelector('#notif-back').addEventListener('click', () => window.history.back());
    page.querySelectorAll('.notif-item').forEach(el => {
      el.addEventListener('click', async () => {
        const orderId = el.dataset.order;
        if (orderId) {
          try {
            const { order } = await api.getOrder(orderId);
            const role = order.my_role;
            navigate('/orders');
          } catch {
            navigate('/orders');
          }
        } else {
          window.history.back();
        }
      });
    });
  } catch (err) {
    page.innerHTML = `<div class="fullscreen-page"><div class="empty-state"><h3>Error</h3><p>${err.message}</p></div></div>`;
  }
}

function getTimeAgo(date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

import store from '../store.js';
import { showToast } from '../toast.js';
import { navigate } from '../main.js';
import * as api from '../api.js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const TIMELINE_ICONS = {
  order_placed: '🛍️',
  payment_received: '💳',
  status_change: '🔄',
  meetup_proposed: '📍',
  meetup_confirmed: '✅',
  note_added: '📝',
};

export default function OrdersPage(page) {
  if (!store.isLoggedIn) { navigate('/login'); return; }

  let activeTab = 'buying';
  let buyerOrders = [];
  let sellerOrders = [];

  page.innerHTML = `
    <div style="height:100%;display:flex;flex-direction:column;background:var(--bg);">
      <div class="topbar">
        <span class="logo">Orders</span>
        <div class="topbar-right"></div>
      </div>
      <div class="seller-tabs">
        <button class="seller-tab active" data-tab="buying">Buying</button>
        <button class="seller-tab" data-tab="selling">Selling</button>
      </div>
      <div id="orders-content" style="flex:1;overflow-y:auto;padding:12px;-webkit-overflow-scrolling:touch;"></div>
    </div>
  `;

  page.querySelector('.seller-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.seller-tab');
    if (!tab) return;
    page.querySelectorAll('.seller-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeTab = tab.dataset.tab;
    renderOrders();
  });

  async function loadOrders() {
    try {
      const data = await api.getOrders();
      buyerOrders = data.buyerOrders || [];
      sellerOrders = data.sellerOrders || [];
      renderOrders();
    } catch (err) {
      const c = page.querySelector('#orders-content');
      if (c) c.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  }

  function renderOrders() {
    const c = page.querySelector('#orders-content');
    const orders = activeTab === 'buying' ? buyerOrders : sellerOrders;
    const role = activeTab === 'buying' ? 'buyer' : 'seller';

    if (orders.length === 0) {
      c.innerHTML = `<div class="empty-state"><h3>No orders</h3><p>${role === 'buyer' ? 'Orders you place will show here' : 'Orders from buyers will show here'}</p></div>`;
      return;
    }

    c.innerHTML = orders.map(o => {
      const otherName = role === 'buyer' ? o.seller_name : o.buyer_name;
      const otherPhone = role === 'buyer' ? o.seller_phone : o.buyer_phone;
      const meetupStatus = getMeetupStatus(o, store.user.id);
      return `
        <div class="order-card order-card-clickable" data-id="${o.id}" data-role="${role}">
          <div class="row1">
            <span class="order-id">${o.id.slice(0, 8)}...</span>
            <span class="status ${o.status}">${o.status.replace('_', ' ')}</span>
          </div>
          <div style="font-size:0.85rem;color:var(--text);">${otherName || 'Unknown'}</div>
          ${otherPhone ? `<div style="font-size:0.75rem;color:var(--text2);">${otherPhone}</div>` : ''}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
            <div style="font-weight:700;color:var(--coral);font-size:0.95rem;">Rs ${parseFloat(o.total_amount).toFixed(2)}</div>
            <div style="font-size:0.65rem;color:var(--text2);">${new Date(o.created_at).toLocaleDateString()}</div>
          </div>
          ${meetupStatus ? `<div style="margin-top:6px;font-size:0.7rem;color:${meetupStatus.color};background:${meetupStatus.bg};padding:4px 10px;border-radius:8px;display:inline-block;">${meetupStatus.label}</div>` : ''}
        </div>
      `;
    }).join('');

    c.querySelectorAll('.order-card-clickable').forEach(el => {
      el.addEventListener('click', () => openMeetupDetail(el.dataset.id, el.dataset.role));
    });
  }

  function getMeetupStatus(order, userId) {
    if (order.status === 'completed') return { label: 'Completed', color: 'var(--green)', bg: 'rgba(0,229,160,0.12)' };
    if (order.meetup_confirmed) return { label: 'Meetup confirmed', color: 'var(--blue)', bg: 'rgba(0,194,255,0.12)' };
    if (order.status !== 'paid' && order.status !== 'pending') return null;
    if (order.meetup_lat && order.meetup_proposed_by !== userId) return { label: 'Location proposed — confirm', color: 'var(--coral)', bg: 'rgba(255,77,106,0.12)' };
    if (order.meetup_lat) return { label: 'Waiting for confirmation', color: 'var(--text2)', bg: 'var(--surface2)' };
    return { label: 'Arrange meetup', color: 'var(--blue)', bg: 'rgba(0,194,255,0.12)' };
  }

  function openMeetupDetail(orderId, role) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:1000;background:var(--bg);display:flex;flex-direction:column;overflow:hidden;';

    overlay.innerHTML = `
      <div class="topbar">
        <i class="ti ti-arrow-left" id="meetup-back" style="font-size:22px;color:var(--text2);cursor:pointer;padding:4px;"></i>
        <span class="logo" style="margin-left:4px;">Order Details</span>
        <div class="topbar-right"></div>
      </div>
      <div id="meetup-body" style="flex:1;overflow-y:auto;padding:16px;"></div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#meetup-back').addEventListener('click', () => document.body.removeChild(overlay));

    loadMeetupDetail(overlay, orderId, role);
  }

  async function loadMeetupDetail(overlay, orderId, role) {
    const body = overlay.querySelector('#meetup-body');
    body.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const { order } = await api.getOrder(orderId);
      const otherName = role === 'buyer' ? order.seller_name : order.buyer_name;
      const otherPhone = role === 'buyer' ? order.seller_phone : order.buyer_phone;
      const isBuyer = role === 'buyer';

      body.innerHTML = `
        <div style="background:var(--surface);border-radius:16px;padding:16px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="font-size:0.7rem;color:var(--text2);font-family:monospace;">${order.id}</div>
            <span class="status ${order.status}" style="font-size:0.7rem;font-weight:600;padding:2px 10px;border-radius:10px;">${order.status.replace('_', ' ')}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:0.85rem;color:var(--text);">${otherName || 'Unknown'}</div>
              ${otherPhone ? `<div style="font-size:0.75rem;color:var(--text2);">${otherPhone}</div>` : ''}
            </div>
            <div style="font-weight:700;color:var(--coral);font-size:1.1rem;">Rs ${parseFloat(order.total_amount).toFixed(2)}</div>
          </div>
        </div>

        ${order.items && order.items.length > 0 ? `
          <div style="background:var(--surface);border-radius:16px;padding:12px;margin-bottom:12px;">
            <div style="font-size:0.8rem;font-weight:600;color:var(--text2);margin-bottom:8px;">Items</div>
            ${order.items.map(item => `
              <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.85rem;">
                <span style="color:var(--text);">${item.product_name} × ${item.quantity}</span>
                <span style="color:var(--coral);font-weight:600;">Rs ${parseFloat(item.price).toFixed(2)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div id="timeline-section" style="background:var(--surface);border-radius:16px;padding:12px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;" id="timeline-toggle">
            <div style="font-size:0.8rem;font-weight:600;color:var(--text2);">Order Timeline</div>
            <i class="ti ti-chevron-down" id="timeline-chevron" style="color:var(--text2);font-size:1.1rem;"></i>
          </div>
          <div id="timeline-body" style="display:none;margin-top:8px;">
            <div style="text-align:center;padding:12px;"><div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0 auto;"></div></div>
          </div>
        </div>

        <div id="meetup-section">
          ${renderMeetupSection(order, isBuyer)}
        </div>

        ${otherPhone ? `
          <a href="tel:${otherPhone}" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:14px;color:var(--text);text-decoration:none;margin-top:8px;font-size:0.9rem;">
            <i class="ti ti-phone"></i> Call ${otherName}
          </a>
        ` : ''}
      `;

      // Timeline toggle
      const timelineToggle = body.querySelector('#timeline-toggle');
      const timelineBody = body.querySelector('#timeline-body');
      const timelineChevron = body.querySelector('#timeline-chevron');
      let timelineLoaded = false;

      timelineToggle.addEventListener('click', async () => {
        const isOpen = timelineBody.style.display !== 'none';
        if (isOpen) {
          timelineBody.style.display = 'none';
          timelineChevron.style.transform = '';
        } else {
          timelineBody.style.display = 'block';
          timelineChevron.style.transform = 'rotate(180deg)';
          if (!timelineLoaded) {
            timelineLoaded = true;
            try {
              const { events } = await api.getOrderTimeline(orderId);
              if (events.length === 0) {
                timelineBody.innerHTML = '<div style="text-align:center;color:var(--text2);font-size:0.8rem;padding:8px;">No events recorded yet</div>';
              } else {
                timelineBody.innerHTML = events.map(e => {
                  const icon = TIMELINE_ICONS[e.event_type] || '📌';
                  const label = e.event_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                  const when = new Date(e.created_at).toLocaleString();
                  return `
                    <div style="display:flex;gap:10px;padding:6px 0;border-left:2px solid var(--border);padding-left:12px;margin-left:4px;position:relative;">
                      <div style="position:absolute;left:-9px;top:8px;font-size:0.9rem;">${icon}</div>
                      <div style="flex:1;">
                        <div style="font-size:0.8rem;color:var(--text);font-weight:500;">${label}</div>
                        ${e.note ? `<div style="font-size:0.7rem;color:var(--text2);">${e.note}</div>` : ''}
                        ${e.old_value && e.new_value ? `<div style="font-size:0.7rem;color:var(--text2);">${e.old_value} → ${e.new_value}</div>` : ''}
                        <div style="font-size:0.65rem;color:var(--text2);margin-top:2px;">${when}${e.actor_name ? ` by ${e.actor_name}` : ''}</div>
                      </div>
                    </div>
                  `;
                }).join('');
              }
            } catch {
              timelineBody.innerHTML = '<div style="text-align:center;color:var(--coral);font-size:0.8rem;padding:8px;">Failed to load timeline</div>';
            }
          }
        }
      });

      // Init static maps
      if (order.meetup_lat && order.meetup_lng) {
        initStaticMap('meetup-map-static', order.meetup_lat, order.meetup_lng);
      }

      // Attach meetup action handlers
      if (order.status === 'paid') {
        if (!order.meetup_lat) {
          body.querySelector('#propose-meetup-btn')?.addEventListener('click', () => {
            openMapPicker(overlay, order.id);
          });
        } else if (order.meetup_proposed_by !== store.user.id && !order.meetup_confirmed) {
          body.querySelector('#confirm-meetup-btn')?.addEventListener('click', async () => {
            try {
              await api.confirmMeetup(order.id);
              showToast('Meetup confirmed!', 'success');
              document.body.removeChild(overlay);
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
          body.querySelector('#propose-alternative-btn')?.addEventListener('click', () => {
            openMapPicker(overlay, order.id);
          });
        } else if (order.meetup_proposed_by === store.user.id && !order.meetup_confirmed) {
          body.querySelector('#propose-alternative-btn')?.addEventListener('click', () => {
            openMapPicker(overlay, order.id);
          });
        }
      }
      if (order.meetup_confirmed || order.status === 'completed') {
        body.querySelector('#complete-order-btn')?.addEventListener('click', async () => {
          if (!confirm('Mark this order as completed?')) return;
          try {
            await api.completeOrder(order.id);
            showToast('Order completed!', 'success');
            document.body.removeChild(overlay);
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }

      body.querySelector('#reorder-btn')?.addEventListener('click', async () => {
        try {
          const { items } = await api.reorder(order.id);
          if (items.length === 0) { showToast('No items available to re-order', 'info'); return; }
          items.forEach(item => store.addToCart({ id: item.productId, name: item.name, price: item.price, image_url: null }));
          showToast('Items added to cart!', 'success');
          navigate('/cart');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      body.querySelector('#review-btn')?.addEventListener('click', () => {
        const reviewOverlay = document.createElement('div');
        reviewOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:1002;display:flex;align-items:center;justify-content:center;padding:16px;';
        reviewOverlay.innerHTML = `
          <div style="background:var(--surface);border-radius:20px;padding:24px;max-width:320px;width:100%;text-align:center;">
            <h3 style="margin-bottom:8px;">Rate Your Experience</h3>
            <div id="star-picker" style="font-size:2rem;margin-bottom:12px;cursor:pointer;">
              ${[1,2,3,4,5].map(i => `<span class="star" data-val="${i}" style="color:var(--text2);padding:0 2px;">★</span>`).join('')}
            </div>
            <div class="form-group">
              <textarea id="review-comment" placeholder="Share your experience (optional)" rows="3" style="font-size:0.85rem;padding:10px;"></textarea>
            </div>
            <button class="btn btn-primary" id="review-submit" style="width:100%;border-radius:14px;padding:14px;" disabled>Submit Review</button>
            <button class="btn btn-ghost" id="review-cancel" style="width:100%;margin-top:6px;">Cancel</button>
          </div>
        `;
        overlay.appendChild(reviewOverlay);

        let selectedRating = 0;
        reviewOverlay.querySelectorAll('.star').forEach(el => {
          el.addEventListener('click', () => {
            selectedRating = parseInt(el.dataset.val);
            reviewOverlay.querySelectorAll('.star').forEach(s => {
              s.style.color = parseInt(s.dataset.val) <= selectedRating ? 'var(--coral)' : 'var(--text2)';
            });
            reviewOverlay.querySelector('#review-submit').disabled = false;
          });
        });

        reviewOverlay.querySelector('#review-submit').addEventListener('click', async () => {
          const comment = reviewOverlay.querySelector('#review-comment').value;
          const btn = reviewOverlay.querySelector('#review-submit');
          btn.disabled = true; btn.textContent = 'Submitting...';
          try {
            await api.createReview(order.id, selectedRating, comment);
            showToast('Review submitted!', 'success');
            overlay.removeChild(reviewOverlay);
          } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false; btn.textContent = 'Submit Review';
          }
        });

        reviewOverlay.querySelector('#review-cancel').addEventListener('click', () => overlay.removeChild(reviewOverlay));
      });
    } catch (err) {
      body.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  }

  function renderMeetupSection(order, isBuyer) {
    if (order.status === 'completed') {
      return `
        <div style="background:var(--surface);border-radius:16px;padding:16px;text-align:center;">
          <div style="font-size:2rem;margin-bottom:4px;">✅</div>
          <div style="font-weight:600;color:var(--green);">Order Completed</div>
          ${order.meetup_address ? `<div style="font-size:0.8rem;color:var(--text2);margin-top:4px;">Met at: ${order.meetup_address}</div>` : ''}
          <button class="btn btn-outline" id="reorder-btn" style="width:100%;border-radius:14px;padding:12px;margin-top:10px;">Re-order</button>
          ${order.my_role === 'buyer' ? `<button class="btn btn-ghost" id="review-btn" style="width:100%;border-radius:14px;padding:10px;margin-top:6px;">Leave a Review</button>` : ''}
        </div>
      `;
    }

    if (order.meetup_confirmed) {
      return `
        <div style="background:var(--surface);border-radius:16px;padding:16px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            <i class="ti ti-map-pin" style="color:var(--green);font-size:1.2rem;"></i>
            <span style="font-weight:600;color:var(--text);">Meetup Confirmed</span>
          </div>
          ${order.meetup_address ? `<div style="font-size:0.85rem;color:var(--text2);margin-bottom:8px;">📍 ${order.meetup_address}</div>` : ''}
          ${order.meetup_note ? `<div style="font-size:0.8rem;color:var(--text2);background:var(--surface2);padding:8px 12px;border-radius:10px;margin-bottom:8px;">"${order.meetup_note}"</div>` : ''}
          <div id="meetup-map-static" style="height:160px;border-radius:12px;margin-bottom:8px;"></div>
          <a href="https://www.openstreetmap.org/directions?from=&to=${order.meetup_lat},${order.meetup_lng}" target="_blank" class="btn btn-outline" style="width:100%;border-radius:14px;padding:12px;font-size:0.85rem;text-decoration:none;">Open in Maps</a>
          <button class="btn btn-primary" id="complete-order-btn" style="width:100%;border-radius:14px;padding:14px;margin-top:6px;">Mark as Completed</button>
        </div>
      `;
    }

    if (order.meetup_lat) {
      const proposedByMe = order.meetup_proposed_by === store.user.id;
      return `
        <div style="background:var(--surface);border-radius:16px;padding:16px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            <i class="ti ti-map-pin" style="color:var(--blue);font-size:1.2rem;"></i>
            <span style="font-weight:600;color:var(--text);">Meetup Proposed</span>
          </div>
          ${order.meetup_address ? `<div style="font-size:0.85rem;color:var(--text2);margin-bottom:8px;">📍 ${order.meetup_address}</div>` : ''}
          ${order.meetup_note ? `<div style="font-size:0.8rem;color:var(--text2);background:var(--surface2);padding:8px 12px;border-radius:10px;margin-bottom:8px;">"${order.meetup_note}"</div>` : ''}
          <div id="meetup-map-static" style="height:160px;border-radius:12px;margin-bottom:8px;"></div>
          ${proposedByMe
            ? `<div style="text-align:center;font-size:0.85rem;color:var(--text2);padding:8px;">Waiting for the other party to confirm...</div>`
            : `<button class="btn btn-primary" id="confirm-meetup-btn" style="width:100%;border-radius:14px;padding:14px;">Confirm Meetup Location</button>`
          }
          <button class="btn btn-ghost" id="propose-alternative-btn" style="width:100%;margin-top:4px;">Propose Alternative</button>
        </div>
      `;
    }

    if (order.status === 'paid') {
      return `
        <div style="background:var(--surface);border-radius:16px;padding:16px;margin-bottom:8px;text-align:center;">
          <div style="font-size:2rem;margin-bottom:4px;">📍</div>
          <div style="font-weight:600;color:var(--text);margin-bottom:4px;">Arrange a Meetup</div>
          <div style="font-size:0.8rem;color:var(--text2);margin-bottom:12px;">Choose a location for the exchange</div>
          <button class="btn btn-primary" id="propose-meetup-btn" style="width:100%;border-radius:14px;padding:14px;">Propose Meeting Point</button>
        </div>
      `;
    }

    return `<div style="background:var(--surface);border-radius:16px;padding:16px;text-align:center;color:var(--text2);font-size:0.85rem;">Order is ${order.status}</div>`;
  }

  function openMapPicker(overlay, orderId) {
    const mapOverlay = document.createElement('div');
    mapOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:1001;background:var(--bg);display:flex;flex-direction:column;';
    mapOverlay.innerHTML = `
      <div class="topbar">
        <i class="ti ti-arrow-left" id="map-back" style="font-size:22px;color:var(--text2);cursor:pointer;padding:4px;"></i>
        <span class="logo" style="margin-left:4px;">Choose Location</span>
        <div class="topbar-right"></div>
      </div>
      <div style="padding:8px 12px;">
        <input type="text" id="map-search" placeholder="Search for a place..." style="padding:10px 14px;font-size:0.85rem;" />
      </div>
      <div id="map-container" style="flex:1;min-height:0;"></div>
      <div style="padding:12px;background:var(--surface);border-top:1px solid var(--border);">
        <div id="map-address" style="font-size:0.8rem;color:var(--text2);margin-bottom:8px;text-align:center;">Drag the pin to set location</div>
        <div class="form-group" style="margin-bottom:8px;">
          <textarea id="map-note" placeholder="Add a note (e.g. 'I'll be at the entrance')" rows="2" style="font-size:0.8rem;padding:10px;"></textarea>
        </div>
        <button class="btn btn-primary" id="map-confirm" style="width:100%;border-radius:14px;padding:14px;" disabled>Confirm Location</button>
      </div>
    `;
    overlay.appendChild(mapOverlay);

    let lat = 18.9712;
    let lng = -72.2852;
    let marker;
    let map;

    function initMap() {
      map = L.map(mapOverlay.querySelector('#map-container'), { zoomControl: false }).setView([lat, lng], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        lat = pos.lat;
        lng = pos.lng;
        reverseGeocode(lat, lng);
      });
      setTimeout(() => map.invalidateSize(), 300);
    }

    async function reverseGeocode(lat, lng) {
      const addrEl = mapOverlay.querySelector('#map-address');
      addrEl.textContent = 'Looking up address...';
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`, { headers: { 'Accept-Language': 'en' } });
        const data = await res.json();
        const address = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        addrEl.textContent = `📍 ${address}`;
        mapOverlay.querySelector('#map-confirm').disabled = false;
      } catch {
        addrEl.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        mapOverlay.querySelector('#map-confirm').disabled = false;
      }
    }

    function searchLocation(query) {
      if (!query.trim()) return;
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`, { headers: { 'Accept-Language': 'en' } })
        .then(r => r.json())
        .then(data => {
          if (data.length > 0) {
            const loc = data[0];
            lat = parseFloat(loc.lat);
            lng = parseFloat(loc.lon);
            map.setView([lat, lng], 15);
            marker.setLatLng([lat, lng]);
            reverseGeocode(lat, lng);
          } else {
            showToast('No results found', 'info');
          }
        })
        .catch(() => showToast('Search failed', 'error'));
    }

    mapOverlay.querySelector('#map-back').addEventListener('click', () => overlay.removeChild(mapOverlay));
    mapOverlay.querySelector('#map-search').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') searchLocation(e.target.value);
    });
    mapOverlay.querySelector('#map-confirm').addEventListener('click', async () => {
      const note = mapOverlay.querySelector('#map-note').value;
      const addrEl = mapOverlay.querySelector('#map-address');
      const address = addrEl.textContent.replace(/^📍 /, '');
      try {
        await api.proposeMeetup(orderId, lat, lng, address, note);
        showToast('Meetup location proposed!', 'success');
        overlay.removeChild(mapOverlay);
        document.body.removeChild(overlay);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    initMap();
    reverseGeocode(lat, lng);
  }

  function initStaticMap(containerId, lat, lng) {
    setTimeout(() => {
      const el = document.getElementById(containerId);
      if (!el) return;
      const map = L.map(el, { zoomControl: false, dragging: false, scrollWheelZoom: false, touchZoom: false }).setView([lat, lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '' }).addTo(map);
      L.marker([lat, lng]).addTo(map);
    }, 200);
  }

  loadOrders();
}

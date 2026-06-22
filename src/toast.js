let toasts = [];

export function showToast(message, type = 'info', duration = 3000) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  toasts.push(setTimeout(() => toast.remove(), duration));
}

export function clearToasts() {
  toasts.forEach(clearTimeout);
  document.querySelectorAll('.toast').forEach(el => el.remove());
  toasts = [];
}

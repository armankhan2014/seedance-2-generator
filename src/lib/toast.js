// src/lib/toast.js
// Lightweight module-level toast system — no React context needed.
// Any component can import `toast` and fire it; ToastContainer subscribes.

const listeners = new Set();
let _id = 0;

function emit(message, type = "info", duration = 4000) {
  const t = { id: ++_id, message, type, duration };
  listeners.forEach((fn) => fn(t));
}

const toast = (message, duration) => emit(message, "info", duration);
toast.success = (message, duration) => emit(message, "success", duration);
toast.error   = (message, duration) => emit(message, "error", duration ?? 5000);
toast.warning = (message, duration) => emit(message, "warning", duration);
toast.info    = (message, duration) => emit(message, "info", duration);

export const toastEmitter = {
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export default toast;

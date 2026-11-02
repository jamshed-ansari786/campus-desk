// Theme Management & Real-time Notifications Client
document.addEventListener("DOMContentLoaded", () => {
  // 1. Theme Toggle
  const savedTheme = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
  document.documentElement.setAttribute("data-bs-theme", savedTheme);
  updateThemeIcon(savedTheme);
  document.dispatchEvent(new Event("campusdesk:themechange"));

  const themeToggleBtn = document.getElementById("themeToggleBtn");
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      const nextTheme = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", nextTheme);
      document.documentElement.setAttribute("data-bs-theme", nextTheme);
      localStorage.setItem("theme", nextTheme);
      updateThemeIcon(nextTheme);
      document.dispatchEvent(new Event("campusdesk:themechange"));
    });
  }

  function updateThemeIcon(theme) {
    const icon = document.getElementById("themeIcon");
    if (!icon) return;
    if (theme === "dark") {
      icon.className = "bi bi-sun-fill text-warning";
    } else {
      icon.className = "bi bi-moon-stars-fill text-secondary";
    }
  }

  // 2. Real-time Notifications via Socket.IO
  const socket = window.getCampusSocket
    ? window.getCampusSocket()
    : (typeof io !== "undefined" && document.body.dataset.authenticated === "true"
        ? io({
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
          })
        : null);

  if (document.body.dataset.authenticated === "true") {
    fetchNotifications();
  }

  if (socket) {
    socket.on("new_notification", (notif) => {
      showToast(notif.title, notif.message, notif.link);
      incrementNotificationCount();
      prependNotificationItem(notif);
    });

    socket.on("new_announcement", (announcement) => {
      showToast(`📢 Announcement: ${announcement.title}`, announcement.content, "/");
    });
  }

  const notifDropdownBtn = document.getElementById("notifDropdownBtn");
  if (notifDropdownBtn) {
    notifDropdownBtn.addEventListener("click", () => {
      fetchNotifications();
    });
  }

  const markAllReadBtn = document.getElementById("markAllReadBtn");
  if (markAllReadBtn) {
    markAllReadBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await fetch("/api/notifications/read-all", { method: "PATCH" });
        const badge = document.getElementById("notifBadge");
        if (badge) badge.style.display = "none";
        fetchNotifications();
      } catch (err) {
        console.error("Failed to mark all read:", err);
      }
    });
  }

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();

      const badge = document.getElementById("notifBadge");
      if (badge) {
        if (data.unreadCount > 0) {
          badge.textContent = data.unreadCount > 99 ? "99+" : data.unreadCount;
          badge.style.display = "inline-block";
        } else {
          badge.style.display = "none";
        }
      }

      const listContainer = document.getElementById("notifListContainer");
      if (listContainer) {
        if (!data.notifications || data.notifications.length === 0) {
          listContainer.innerHTML = '<li class="p-3 text-center text-muted small">No notifications yet</li>';
        } else {
          listContainer.innerHTML = data.notifications
            .map(
              (n) => `
            <li class="border-bottom p-2 ${n.isRead ? "" : "bg-light bg-opacity-25"}">
              <a href="${n.link || "#"}" class="text-decoration-none d-block">
                <strong class="d-block text-dark small">${escapeHtml(n.title)}</strong>
                <span class="text-muted small">${escapeHtml(n.message)}</span>
                <div class="text-secondary" style="font-size: 0.72rem;">${new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </a>
            </li>
          `
            )
            .join("");
        }
      }
    } catch (err) {
      console.warn("Could not fetch notifications:", err);
    }
  }

  function incrementNotificationCount() {
    const badge = document.getElementById("notifBadge");
    if (!badge) return;
    const current = parseInt(badge.textContent) || 0;
    badge.textContent = current + 1;
    badge.style.display = "inline-block";
  }

  function prependNotificationItem(n) {
    const listContainer = document.getElementById("notifListContainer");
    if (!listContainer) return;
    const item = document.createElement("li");
    item.className = "border-bottom p-2 bg-light bg-opacity-25";
    item.innerHTML = `
      <a href="${n.link || "#"}" class="text-decoration-none d-block">
        <strong class="d-block text-dark small">${escapeHtml(n.title)}</strong>
        <span class="text-muted small">${escapeHtml(n.message)}</span>
        <div class="text-secondary" style="font-size: 0.72rem;">Just now</div>
      </a>
    `;
    listContainer.prepend(item);
  }

  function showToast(title, body, link) {
    let toastContainer = document.getElementById("smsToastContainer");
    if (!toastContainer) {
      toastContainer = document.createElement("div");
      toastContainer.id = "smsToastContainer";
      toastContainer.className = "toast-container position-fixed bottom-0 end-0 p-3";
      toastContainer.style.zIndex = "1090";
      document.body.appendChild(toastContainer);
    }

    const toastEl = document.createElement("div");
    toastEl.className = "toast show shadow-lg border-primary";
    toastEl.setAttribute("role", "alert");
    toastEl.innerHTML = `
      <div class="toast-header bg-primary text-white">
        <i class="bi bi-bell-fill me-2"></i>
        <strong class="me-auto">${escapeHtml(title)}</strong>
        <small class="text-white-50">Just now</small>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
      </div>
      <div class="toast-body">
        ${escapeHtml(body)}
        ${link ? `<div class="mt-2"><a href="${link}" class="btn btn-sm btn-outline-primary">View</a></div>` : ""}
      </div>
    `;

    toastContainer.appendChild(toastEl);
    setTimeout(() => {
      toastEl.classList.remove("show");
      setTimeout(() => toastEl.remove(), 400);
    }, 6000);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
});

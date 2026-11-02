/**
 * CampusDesk Shared Socket.IO Client Manager
 *
 * Resolves Socket.IO "Session ID unknown" (400 Bad Request) polling errors by:
 * 1. Preferring WebSocket transport first to establish persistent bi-directional
 *    connections that do not rely on ephemeral HTTP long-polling session IDs (sid).
 * 2. Implementing client-side error recovery on "xhr poll error" / HTTP 400 status,
 *    resetting transport negotiation and re-establishing a clean connection handshake.
 * 3. Maintaining a singleton socket instance to eliminate duplicate connections
 *    between notifications and chat on the same browser tab.
 * 4. Preventing guest or unauthenticated pages from triggering socket connections.
 */
(function () {
  let socketInstance = null;

  function getCampusSocket() {
    if (typeof io === "undefined") {
      return null;
    }

    // Only establish socket connection for authenticated users
    const isAuthenticated =
      document.body &&
      document.body.dataset &&
      document.body.dataset.authenticated === "true";

    if (!isAuthenticated) {
      return null;
    }

    if (socketInstance) {
      return socketInstance;
    }

    socketInstance = io({
      transports: ["websocket", "polling"],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    // Client-side recovery on connection error (e.g. server restart, polling sid mismatch)
    socketInstance.on("connect_error", (error) => {
      const isPollingSessionError =
        error.message === "xhr poll error" ||
        error.description === 400 ||
        (error.context && error.context.status === 400);

      if (isPollingSessionError) {
        console.warn(
          "[CampusDesk Socket] Polling session unrecognized or server restarted (400 Bad Request). Reconnecting with fresh session...",
          error.message
        );
        // Force WebSocket prioritization to bypass stale polling session IDs
        socketInstance.io.opts.transports = ["websocket", "polling"];
        setTimeout(() => {
          if (!socketInstance.connected) {
            socketInstance.connect();
          }
        }, 1000);
      } else {
        console.warn("[CampusDesk Socket] Connection error:", error.message);
      }
    });

    socketInstance.on("disconnect", (reason) => {
      if (reason === "io server disconnect") {
        // Disconnected forcibly by server; reconnect if user is still logged in
        if (document.body && document.body.dataset.authenticated === "true") {
          setTimeout(() => {
            if (!socketInstance.connected) {
              socketInstance.connect();
            }
          }, 1500);
        }
      }
    });

    window.campusSocket = socketInstance;
    return socketInstance;
  }

  window.getCampusSocket = getCampusSocket;
})();

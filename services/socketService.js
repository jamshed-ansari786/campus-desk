const { Server } = require("socket.io");
const cookie = require("cookie");
const { verifyToken, canUsersChat } = require("../middleware/auth");
const {
  Conversation,
  ChatMessage,
  Notification,
  Student,
  Teacher,
  Admin,
} = require("../models");

let io = null;
const onlineUsers = new Map(); // userId -> Set of socket IDs

function initSocket(server, sessionMiddleware) {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    allowUpgrades: true,
    pingInterval: 25000,
    pingTimeout: 20000,
    connectionStateRecovery: {
      // Buffer missed packets and keep session state for up to 2 minutes during reconnects
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true,
    },
  });

  // Optional persistent adapter for multi-instance load balancing
  if (process.env.REDIS_URL) {
    try {
      const { createClient } = require("redis");
      const { createAdapter } = require("@socket.io/redis-adapter");
      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();
      Promise.all([pubClient.connect(), subClient.connect()])
        .then(() => {
          io.adapter(createAdapter(pubClient, subClient));
          console.log("Socket.IO Redis adapter enabled for multi-node clustering.");
        })
        .catch((err) => {
          console.warn("Socket.IO Redis adapter connection failed:", err.message);
        });
    } catch (e) {
      console.warn("REDIS_URL is configured, but redis / @socket.io/redis-adapter is not installed.");
    }
  }

  // Socket authentication middleware
  io.use(async (socket, next) => {
    try {
      // 1. Try handshake auth token (JWT)
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (token) {
        const decoded = verifyToken(token);
        if (decoded) {
          socket.user = decoded;
          return next();
        }
      }

      // 2. Try cookie session
      const req = socket.request;
      if (req && req.headers && req.headers.cookie && sessionMiddleware) {
        if (!req.originalUrl) req.originalUrl = req.url || "/";
        sessionMiddleware(req, {}, () => {
          if (req.session && req.session.user) {
            socket.user = req.session.user;
            return next();
          }
          return next(new Error("Authentication required for Socket.IO"));
        });
      } else {
        return next(new Error("No credentials provided"));
      }
    } catch (err) {
      return next(new Error("Authentication failed"));
    }
  });

  io.on("connection", async (socket) => {
    const user = socket.user;
    if (!user || !user.id) {
      socket.disconnect(true);
      return;
    }

    const userId = String(user.id);
    socket.join(`user:${userId}`);
    if (user.role) socket.join(`role:${user.role}`);

    // Track online status
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    // Notify online status change
    io.emit("user_status", { userId, status: "online" });

    // Send current online users to caller
    socket.emit("online_users", Array.from(onlineUsers.keys()));

    // Typing indicators
    socket.on("typing", async (data) => {
      const recipientId = String(data?.recipientId || "");
      if (recipientId) {
        io.to(`user:${recipientId}`).emit("user_typing", {
          senderId: userId,
          senderName: user.name,
          conversationId: data.conversationId,
        });
      }
    });

    socket.on("stop_typing", (data) => {
      const recipientId = String(data?.recipientId || "");
      if (recipientId) {
        io.to(`user:${recipientId}`).emit("user_stop_typing", {
          senderId: userId,
          conversationId: data.conversationId,
        });
      }
    });

    // Send private message
    socket.on("send_message", async (data, callback) => {
      try {
        const recipientId = String(data?.recipientId || "").trim();
        const content = String(data?.content || "").trim();

        if (!recipientId || !content) {
          const err = { error: "Recipient and message content are required." };
          if (callback) callback(err);
          return socket.emit("chat_error", err);
        }

        // Fetch recipient user profile
        let recipientUser = null;
        const [student, teacher, admin] = await Promise.all([
          Student.findById(recipientId),
          Teacher.findById(recipientId),
          Admin.findById(recipientId),
        ]);

        if (student) recipientUser = { id: String(student._id), role: "STUDENT", name: student.name };
        else if (teacher) recipientUser = { id: String(teacher._id), role: "TEACHER", name: teacher.name };
        else if (admin) recipientUser = { id: String(admin._id), role: "ADMIN", name: admin.name };

        if (!recipientUser) {
          const err = { error: "Recipient not found." };
          if (callback) callback(err);
          return socket.emit("chat_error", err);
        }

        // Check backend permission
        const allowed = await canUsersChat(user, recipientUser);
        if (!allowed) {
          const err = { error: "You do not have permission to chat with this user." };
          if (callback) callback(err);
          return socket.emit("chat_error", err);
        }

        // Find or create conversation
        let conversation = await Conversation.findOne({
          "participants.userId": { $all: [userId, recipientId] },
        });

        if (!conversation) {
          conversation = await Conversation.create({
            participants: [
              { userId, role: user.role, name: user.name },
              { userId: recipientId, role: recipientUser.role, name: recipientUser.name },
            ],
          });
        }

        // Create ChatMessage
        const message = await ChatMessage.create({
          conversationId: conversation._id,
          senderId: userId,
          senderRole: user.role,
          senderName: user.name,
          recipientId,
          content,
          readBy: [userId],
        });

        // Update conversation summary
        conversation.lastMessage = {
          content,
          senderId: userId,
          senderName: user.name,
          timestamp: message.createdAt,
        };
        conversation.updatedAt = new Date();
        await conversation.save();

        const payload = {
          _id: message._id,
          conversationId: conversation._id,
          senderId: userId,
          senderRole: user.role,
          senderName: user.name,
          recipientId,
          content,
          createdAt: message.createdAt,
          readBy: message.readBy,
        };

        // Emit to recipient and sender
        io.to(`user:${recipientId}`).emit("new_message", payload);
        io.to(`user:${userId}`).emit("new_message", payload);

        // Create real-time notification
        const notification = await Notification.create({
          recipientId,
          recipientRole: recipientUser.role,
          title: `New message from ${user.name}`,
          message: content.length > 60 ? content.slice(0, 57) + "..." : content,
          type: "CHAT",
          link: "/chat",
        });

        io.to(`user:${recipientId}`).emit("new_notification", notification);

        if (callback) callback({ success: true, message: payload });
      } catch (err) {
        console.error("Socket send_message error:", err);
        if (callback) callback({ error: "Failed to send message." });
        socket.emit("chat_error", { error: "Failed to send message." });
      }
    });

    // Mark messages read
    socket.on("mark_read", async (data) => {
      try {
        const conversationId = data?.conversationId;
        if (!conversationId) return;

        await ChatMessage.updateMany(
          {
            conversationId,
            recipientId: userId,
            readBy: { $ne: userId },
          },
          { $addToSet: { readBy: userId } }
        );

        // Find the conversation to notify other participant
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          const other = conversation.participants.find((p) => String(p.userId) !== userId);
          if (other) {
            io.to(`user:${other.userId}`).emit("messages_read", {
              conversationId,
              readerId: userId,
            });
          }
        }
      } catch (err) {
        console.error("Error marking messages read:", err);
      }
    });

    socket.on("disconnect", () => {
      if (onlineUsers.has(userId)) {
        const set = onlineUsers.get(userId);
        set.delete(socket.id);
        if (set.size === 0) {
          onlineUsers.delete(userId);
          io.emit("user_status", { userId, status: "offline" });
        }
      }
    });
  });

  return io;
}

function getIO() {
  return io;
}

function sendNotification(recipientId, notificationData) {
  if (io && recipientId) {
    io.to(`user:${recipientId}`).emit("new_notification", notificationData);
  }
}

function broadcastAnnouncement(announcement) {
  if (!io) return;
  if (announcement.targetRole === "ALL") {
    io.emit("new_announcement", announcement);
  } else if (announcement.targetRole === "STUDENT") {
    io.to("role:STUDENT").emit("new_announcement", announcement);
  } else if (announcement.targetRole === "TEACHER") {
    io.to("role:TEACHER").emit("new_announcement", announcement);
  }
}

module.exports = {
  initSocket,
  getIO,
  sendNotification,
  broadcastAnnouncement,
  onlineUsers,
};


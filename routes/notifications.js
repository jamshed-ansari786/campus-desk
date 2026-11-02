const express = require("express");
const { requireApiAuth, allowApiRoles } = require("../middleware/auth");
const { Notification, Announcement } = require("../models");
const { broadcastAnnouncement } = require("../services/socketService");

const router = express.Router();

// GET unread count & recent notifications
router.get("/api/notifications", requireApiAuth, async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const user = req.user || req.session.user;
    const userId = user.id;

    const [unreadCount, notifications] = await Promise.all([
      Notification.countDocuments({ recipientId: userId, isRead: false }),
      Notification.find({ recipientId: userId }).sort({ createdAt: -1 }).limit(20),
    ]);

    res.json({ unreadCount, notifications });
  } catch (err) {
    next(err);
  }
});

// Mark single notification as read
router.patch("/api/notifications/:id/read", requireApiAuth, async (req, res, next) => {
  try {
    const user = req.user || req.session.user;
    await Notification.updateOne(
      { _id: req.params.id, recipientId: user.id },
      { $set: { isRead: true } }
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Mark all notifications as read
router.patch("/api/notifications/read-all", requireApiAuth, async (req, res, next) => {
  try {
    const user = req.user || req.session.user;
    await Notification.updateMany(
      { recipientId: user.id, isRead: false },
      { $set: { isRead: true } }
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET Announcements
router.get("/api/announcements", requireApiAuth, async (req, res, next) => {
  try {
    const user = req.user || req.session.user;
    const filter = {
      $or: [{ targetRole: "ALL" }, { targetRole: user.role }],
    };
    const announcements = await Announcement.find(filter).sort({ createdAt: -1 }).limit(10);
    res.json({ announcements });
  } catch (err) {
    next(err);
  }
});

// POST Announcement (Admin or Teacher)
router.post("/api/announcements", requireApiAuth, allowApiRoles("ADMIN", "TEACHER"), async (req, res, next) => {
  try {
    const user = req.user || req.session.user;
    const { title, content, targetRole } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required." });
    }

    const announcement = await Announcement.create({
      title: String(title).trim(),
      content: String(content).trim(),
      authorId: user.id,
      authorRole: user.role,
      authorName: user.name,
      targetRole: ["ALL", "STUDENT", "TEACHER"].includes(targetRole) ? targetRole : "ALL",
      collegeId: user.collegeId || null,
    });

    broadcastAnnouncement(announcement);

    res.status(201).json({ success: true, announcement });
  } catch (err) {
    next(err);
  }
});

module.exports = router;


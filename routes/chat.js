const express = require("express");
const { requireLogin, requireApiAuth, canUsersChat } = require("../middleware/auth");
const {
  Conversation,
  ChatMessage,
  Student,
  Teacher,
  Admin,
  CollegeCourse,
  SemesterSubject,
  Semester,
  TeachingAssignment,
  Enrollment,
} = require("../models");
const { onlineUsers, getIO, sendNotification } = require("../services/socketService");

const router = express.Router();

// Web Page: Chat Interface
router.get("/chat", requireLogin, (req, res) => {
  res.render("chat", {
    title: "Campus Messages",
    currentUser: req.session.user,
  });
});

// API: Get Permitted Contacts
router.get("/api/chat/contacts", requireApiAuth, async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const user = req.user || req.session.user;
    const userId = String(user.id);
    const role = user.role;
    let contacts = [];

    if (role === "ADMIN") {
      // Admin can contact all active Teachers and Students
      const [teachers, students] = await Promise.all([
        Teacher.find({ archivedAt: null, status: "ACTIVE" }).select("name email teacherId designation"),
        Student.find({ archivedAt: null, status: "ACTIVE" }).select("name email studentId"),
      ]);

      contacts = [
        ...teachers.map((t) => ({
          _id: t._id,
          name: t.name,
          email: t.email,
          role: "TEACHER",
          identifier: t.teacherId || "Teacher",
        })),
        ...students.map((s) => ({
          _id: s._id,
          name: s.name,
          email: s.email,
          role: "STUDENT",
          identifier: s.studentId || "Student",
        })),
      ];
    } else if (role === "TEACHER") {
      // Teacher can contact Admins and their permitted Students
      const admins = await Admin.find({ status: "ACTIVE" }).select("name email role");

      // Find permitted students
      const teacher = await Teacher.findById(userId);
      let studentIds = new Set();

      // 1. Directly assigned students
      const directStudents = await Student.find({ teacherId: userId, archivedAt: null }).select("_id");
      directStudents.forEach((s) => studentIds.add(String(s._id)));

      // 2. Students in same college courses that the teacher teaches
      const assignments = await TeachingAssignment.find({
        teacherId: userId,
        status: "APPROVED",
      }).populate("semesterSubjectId");

      const semSubjectIds = assignments
        .filter((a) => a.semesterSubjectId)
        .map((a) => a.semesterSubjectId._id);

      if (semSubjectIds.length > 0) {
        const enrollments = await Enrollment.find({
          semesterSubjectId: { $in: semSubjectIds },
          enrollmentStatus: "ENROLLED",
        }).distinct("studentId");
        enrollments.forEach((sid) => studentIds.add(String(sid)));
      }

      // 3. Fallback: Students in the same college
      if (teacher && teacher.collegeId && studentIds.size === 0) {
        const collegeCourses = await CollegeCourse.find({ collegeId: teacher.collegeId }).distinct("_id");
        const collegeStudents = await Student.find({
          collegeCourseId: { $in: collegeCourses },
          archivedAt: null,
        }).select("_id");
        collegeStudents.forEach((s) => studentIds.add(String(s._id)));
      }

      const students = await Student.find({
        _id: { $in: Array.from(studentIds) },
        archivedAt: null,
        status: "ACTIVE",
      }).select("name email studentId");

      contacts = [
        ...admins.map((a) => ({
          _id: a._id,
          name: a.name,
          email: a.email,
          role: "ADMIN",
          identifier: a.role.replace("_", " "),
        })),
        ...students.map((s) => ({
          _id: s._id,
          name: s.name,
          email: s.email,
          role: "STUDENT",
          identifier: s.studentId || "Student",
        })),
      ];
    } else if (role === "STUDENT") {
      // Student can contact Admins and their permitted Teachers
      const admins = await Admin.find({ status: "ACTIVE" }).select("name email role");
      const student = await Student.findById(userId);
      let teacherIds = new Set();

      if (student) {
        // 1. Directly assigned teacher
        if (student.teacherId) teacherIds.add(String(student.teacherId));

        // 2. Teachers for enrolled semester subjects
        const enrollments = await Enrollment.find({
          studentId: userId,
          enrollmentStatus: "ENROLLED",
        }).distinct("semesterSubjectId");

        if (enrollments.length > 0) {
          const assignments = await TeachingAssignment.find({
            semesterSubjectId: { $in: enrollments },
            status: "APPROVED",
          }).distinct("teacherId");
          assignments.forEach((tid) => teacherIds.add(String(tid)));
        }

        // 3. Fallback: Teachers in the same college
        if (student.collegeCourseId && teacherIds.size === 0) {
          const cc = await CollegeCourse.findById(student.collegeCourseId);
          if (cc) {
            const teachersInCollege = await Teacher.find({
              collegeId: cc.collegeId,
              archivedAt: null,
            }).select("_id");
            teachersInCollege.forEach((t) => teacherIds.add(String(t._id)));
          }
        }
      }

      const teachers = await Teacher.find({
        _id: { $in: Array.from(teacherIds) },
        archivedAt: null,
        status: "ACTIVE",
      }).select("name email teacherId designation");

      contacts = [
        ...admins.map((a) => ({
          _id: a._id,
          name: a.name,
          email: a.email,
          role: "ADMIN",
          identifier: a.role.replace("_", " "),
        })),
        ...teachers.map((t) => ({
          _id: t._id,
          name: t.name,
          email: t.email,
          role: "TEACHER",
          identifier: t.designation || "Teacher",
        })),
      ];
    }

    // Attach online status & unread counts
    const contactIds = contacts.map((c) => String(c._id));
    const unreadCounts = await ChatMessage.aggregate([
      {
        $match: {
          recipientId: new (require("mongoose").Types.ObjectId)(userId),
          senderId: { $in: contacts.map((c) => c._id) },
          readBy: { $ne: new (require("mongoose").Types.ObjectId)(userId) },
        },
      },
      {
        $group: {
          _id: "$senderId",
          count: { $sum: 1 },
        },
      },
    ]);

    const unreadMap = {};
    unreadCounts.forEach((u) => {
      unreadMap[String(u._id)] = u.count;
    });

    const enrichedContacts = contacts.map((c) => ({
      ...c,
      isOnline: Boolean(onlineUsers && onlineUsers.has(String(c._id))),
      unreadCount: unreadMap[String(c._id)] || 0,
    }));

    res.json({ contacts: enrichedContacts });
  } catch (err) {
    next(err);
  }
});

// API: Get Conversation Messages (with pagination & search)
router.get("/api/chat/messages/:recipientId", requireApiAuth, async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const user = req.user || req.session.user;
    const userId = String(user.id);
    const recipientId = String(req.params.recipientId);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const searchQuery = String(req.query.q || "").trim();

    // Fetch recipient
    const [student, teacher, admin] = await Promise.all([
      Student.findById(recipientId),
      Teacher.findById(recipientId),
      Admin.findById(recipientId),
    ]);
    const recipientUser = student
      ? { id: String(student._id), role: "STUDENT", name: student.name }
      : teacher
      ? { id: String(teacher._id), role: "TEACHER", name: teacher.name }
      : admin
      ? { id: String(admin._id), role: "ADMIN", name: admin.name }
      : null;

    if (!recipientUser) {
      return res.status(404).json({ error: "Contact user not found." });
    }

    // Permission check
    const allowed = await canUsersChat(user, recipientUser);
    if (!allowed) {
      return res.status(403).json({ error: "Access denied. Chat not permitted with this user." });
    }

    // Find conversation
    const conversation = await Conversation.findOne({
      "participants.userId": { $all: [userId, recipientId] },
    });

    if (!conversation) {
      return res.json({ messages: [], total: 0, conversationId: null, recipient: recipientUser });
    }

    const query = { conversationId: conversation._id };
    if (searchQuery) {
      query.content = { $regex: searchQuery, $options: "i" };
    }

    const total = await ChatMessage.countDocuments(query);
    const messages = await ChatMessage.find(query)
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    // Mark as read
    await ChatMessage.updateMany(
      {
        conversationId: conversation._id,
        recipientId: userId,
        readBy: { $ne: userId },
      },
      { $addToSet: { readBy: userId } }
    );

    res.json({
      messages,
      total,
      page,
      pages: Math.ceil(total / limit),
      conversationId: conversation._id,
      recipient: recipientUser,
    });
  } catch (err) {
    next(err);
  }
});

// API: Send Message via REST
router.post("/api/chat/messages", requireApiAuth, async (req, res, next) => {
  try {
    const user = req.user || req.session.user;
    const userId = String(user.id);
    const recipientId = String(req.body.recipientId || "").trim();
    const content = String(req.body.content || "").trim();

    if (!recipientId || !content) {
      return res.status(400).json({ error: "Recipient and message content are required." });
    }

    const [student, teacher, admin] = await Promise.all([
      Student.findById(recipientId),
      Teacher.findById(recipientId),
      Admin.findById(recipientId),
    ]);
    const recipientUser = student
      ? { id: String(student._id), role: "STUDENT", name: student.name }
      : teacher
      ? { id: String(teacher._id), role: "TEACHER", name: teacher.name }
      : admin
      ? { id: String(admin._id), role: "ADMIN", name: admin.name }
      : null;

    if (!recipientUser) {
      return res.status(404).json({ error: "Recipient user not found." });
    }

    const allowed = await canUsersChat(user, recipientUser);
    if (!allowed) {
      return res.status(403).json({ error: "You do not have permission to chat with this user." });
    }

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

    const message = await ChatMessage.create({
      conversationId: conversation._id,
      senderId: userId,
      senderRole: user.role,
      senderName: user.name,
      recipientId,
      content,
      readBy: [userId],
    });

    conversation.lastMessage = {
      content,
      senderId: userId,
      senderName: user.name,
      timestamp: message.createdAt,
    };
    conversation.updatedAt = new Date();
    await conversation.save();

    const io = getIO();
    if (io) {
      io.to(`user:${recipientId}`).emit("new_message", message);
      io.to(`user:${userId}`).emit("new_message", message);
    }

    res.status(201).json({ success: true, message });
  } catch (err) {
    next(err);
  }
});

module.exports = router;


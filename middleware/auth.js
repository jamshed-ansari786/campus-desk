const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "sms_super_secret_jwt_key_2026";

function requireLogin(req, res, next) {
  if (!req.session.user) {
    req.session.flash = { type: "error", message: "Please login first." };
    return res.redirect("/login");
  }
  next();
}

function allowRoles(...roles) {
  return (req, res, next) => {
    const user = req.session.user;
    if (!user) {
      req.session.flash = { type: "error", message: "Please login first." };
      return res.redirect("/login");
    }
    if (!roles.includes(user.role)) {
      return res.status(403).render("error", {
        title: "Access denied",
        message: "You do not have access to this page.",
      });
    }
    next();
  };
}

function generateToken(user) {
  return jwt.sign(
    {
      id: String(user.id || user._id),
      role: user.role,
      adminRole: user.adminRole || null,
      name: user.name,
      email: user.email,
      collegeId: user.collegeId || null,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// Middleware that accepts either session or Authorization: Bearer <token>
function requireApiAuth(req, res, next) {
  if (req.session && req.session.user) {
    req.user = req.session.user;
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
      return next();
    }
  }

  return res.status(401).json({ error: "Unauthorized. Please provide a valid session or token." });
}

function allowApiRoles(...roles) {
  return (req, res, next) => {
    const user = req.user || req.session?.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized. Please log in." });
    }
    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: "Forbidden. Insufficient role permissions." });
    }
    next();
  };
}

// Check permission between two users for private chat
async function canUsersChat(userA, userB) {
  if (!userA || !userB) return false;
  if (String(userA.id || userA._id) === String(userB.id || userB._id)) return false;

  const roleA = userA.role;
  const roleB = userB.role;

  // Admin can chat with any teacher and any student
  if (roleA === "ADMIN" || roleB === "ADMIN") return true;

  // Students cannot chat with other students
  if (roleA === "STUDENT" && roleB === "STUDENT") return false;

  // Teachers cannot chat with other teachers
  if (roleA === "TEACHER" && roleB === "TEACHER") return false;

  // Between Teacher and Student
  const teacherUser = roleA === "TEACHER" ? userA : userB;
  const studentUser = roleA === "STUDENT" ? userA : userB;

  try {
    const { Student, Teacher, TeachingAssignment, SemesterSubject, Semester } = require("../models");
    const studentDoc = await Student.findById(studentUser.id || studentUser._id);
    const teacherDoc = await Teacher.findById(teacherUser.id || teacherUser._id);

    if (!studentDoc || !teacherDoc) return false;

    // Check direct assignment
    if (studentDoc.teacherId && String(studentDoc.teacherId) === String(teacherDoc._id)) {
      return true;
    }

    // Check same college
    if (studentDoc.collegeCourseId && teacherDoc.collegeId) {
      const { CollegeCourse } = require("../models");
      const cc = await CollegeCourse.findById(studentDoc.collegeCourseId);
      if (cc && String(cc.collegeId) === String(teacherDoc.collegeId)) {
        return true;
      }
    }

    // Check course / teaching assignment overlap
    if (studentDoc.collegeCourseId) {
      const semesters = await Semester.find({ collegeCourseId: studentDoc.collegeCourseId }).select("_id");
      const semSubjectIds = await SemesterSubject.find({
        semesterId: { $in: semesters.map((s) => s._id) },
      }).distinct("_id");

      const hasAssignment = await TeachingAssignment.exists({
        teacherId: teacherDoc._id,
        semesterSubjectId: { $in: semSubjectIds },
        status: "APPROVED",
      });

      if (hasAssignment) return true;
    }

    // Fallback if both active in same department or college
    if (studentDoc.departmentId && teacherDoc.departmentId && String(studentDoc.departmentId) === String(teacherDoc.departmentId)) {
      return true;
    }

    return true; // Permit communication within campus
  } catch (err) {
    console.error("Error checking chat permissions:", err);
    return false;
  }
}

module.exports = {
  requireLogin,
  allowRoles,
  generateToken,
  verifyToken,
  requireApiAuth,
  allowApiRoles,
  canUsersChat,
  JWT_SECRET,
};

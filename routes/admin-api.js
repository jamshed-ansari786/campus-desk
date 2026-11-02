const express = require("express");
const { requireApiAuth, allowApiRoles } = require("../middleware/auth");
const {
  Student,
  Teacher,
  Course,
  College,
  Attendance,
  FeeRecord,
  Grade,
  TeachingAssignment,
} = require("../models");

const router = express.Router();
router.use(requireApiAuth);
router.use(allowApiRoles("ADMIN"));

// Admin API Summary Stats
router.get("/stats", async (req, res, next) => {
  try {
    const [students, teachers, courses, colleges, attendanceTotal, feesTotal] = await Promise.all([
      Student.countDocuments({ archivedAt: null }),
      Teacher.countDocuments({ archivedAt: null }),
      Course.countDocuments({ archivedAt: null }),
      College.countDocuments({ archivedAt: null }),
      Attendance.countDocuments(),
      FeeRecord.aggregate([
        { $group: { _id: null, total: { $sum: "$totalAmount" }, paid: { $sum: "$paidAmount" } } },
      ]),
    ]);

    const feeSummary = feesTotal[0] || { total: 0, paid: 0 };

    res.json({
      students,
      teachers,
      courses,
      colleges,
      attendanceTotal,
      fees: {
        total: feeSummary.total,
        paid: feeSummary.paid,
        outstanding: Math.max(0, feeSummary.total - feeSummary.paid),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Admin API Students List with pagination & search
router.get("/students", async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const search = String(req.query.search || "").trim();

    const query = { archivedAt: null };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { studentId: { $regex: search, $options: "i" } },
      ];
    }

    const [total, students] = await Promise.all([
      Student.countDocuments(query),
      Student.find(query)
        .populate({
          path: "collegeCourseId",
          populate: [{ path: "courseId" }, { path: "collegeId" }],
        })
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ name: 1 }),
    ]);

    res.json({
      students,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
});

// Admin API Teachers List
router.get("/teachers", async (req, res, next) => {
  try {
    const teachers = await Teacher.find({ archivedAt: null })
      .populate("collegeId", "name")
      .populate("assignedCourseIds", "name")
      .sort({ name: 1 });

    res.json({ teachers, total: teachers.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;


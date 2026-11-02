const express = require("express");
const mongoose = require("mongoose");
const { allowRoles } = require("../middleware/auth");
const {
  Student,
  CollegeCourse,
  Course,
  College,
  Semester,
  SemesterSubject,
  Subject,
  Enrollment,
  Attendance,
  Assignment,
  AssignmentSubmission,
  Grade,
  FeeRecord,
  Announcement,
} = require("../models");

const router = express.Router();
router.use(allowRoles("STUDENT"));

// 1. Student Dashboard
router.get("/", async (req, res, next) => {
  try {
    const studentId = req.session.user.id;
    const profile = await Student.findById(studentId)
      .populate({
        path: "collegeCourseId",
        populate: [{ path: "courseId" }, { path: "collegeId" }],
      })
      .populate("departmentId");

    if (!profile) {
      return res.status(404).render("error", {
        title: "Student not found",
        message: "Student profile not found.",
      });
    }

    const collegeCourse =
      profile.collegeCourseId?.collegeId && profile.collegeCourseId?.courseId
        ? profile.collegeCourseId
        : null;

    // Enrolled subjects
    const enrolled = await Enrollment.find({ studentId: profile._id }).populate({
      path: "semesterSubjectId",
      populate: [{ path: "subjectId" }, { path: "semesterId" }],
    });

    const semesters = collegeCourse
      ? await Semester.find({ collegeCourseId: collegeCourse._id })
      : [];
    const semIds = semesters.map((x) => x._id);
    const all = collegeCourse
      ? await SemesterSubject.find({ semesterId: { $in: semIds } })
          .populate("subjectId")
          .populate("semesterId")
      : [];

    const existing = new Set(enrolled.map((x) => String(x.semesterSubjectId?._id)));
    const subjects = enrolled.map((e) => ({
      enrollment_status: e.enrollmentStatus,
      code: e.semesterSubjectId?.subjectId?.code,
      name: e.semesterSubjectId?.subjectId?.name,
      credits: e.semesterSubjectId?.subjectId?.credits,
      semester_no: e.semesterSubjectId?.semesterId?.semesterNo,
      semester_subject_id: String(e.semesterSubjectId?._id),
    }));

    const available = all
      .filter((x) => !existing.has(String(x._id)))
      .map((x) => ({
        semester_subject_id: String(x._id),
        code: x.subjectId?.code,
        name: x.subjectId?.name,
        credits: x.subjectId?.credits,
        semester_no: x.semesterId?.semesterNo,
      }));

    // Calculate attendance stats
    const totalAttendance = await Attendance.countDocuments({ studentId });
    const presentAttendance = await Attendance.countDocuments({
      studentId,
      status: { $in: ["PRESENT", "LATE"] },
    });
    const attendanceRate = totalAttendance > 0 ? Math.round((presentAttendance / totalAttendance) * 100) : 100;

    // Assignments
    const enrolledSemSubjectIds = enrolled.map((e) => e.semesterSubjectId?._id).filter(Boolean);
    const upcomingAssignments = await Assignment.find({
      semesterSubjectId: { $in: enrolledSemSubjectIds },
      status: "ACTIVE",
      dueDate: { $gte: new Date() },
    })
      .sort({ dueDate: 1 })
      .limit(3);

    // Latest grades
    const recentGrades = await Grade.find({ studentId })
      .populate({
        path: "semesterSubjectId",
        populate: { path: "subjectId" },
      })
      .sort({ createdAt: -1 })
      .limit(4);

    // Fee info
    const feeRecord = await FeeRecord.findOne({ studentId });

    // Announcements
    const announcements = await Announcement.find({
      $or: [{ targetRole: "ALL" }, { targetRole: "STUDENT" }],
    })
      .sort({ createdAt: -1 })
      .limit(3);

    res.render("student/dashboard", {
      title: "Student Dashboard",
      profile: {
        ...profile.toObject(),
        student_id: String(profile._id),
        course_name: collegeCourse?.courseId?.name || "Not assigned",
        college_name: collegeCourse?.collegeId?.name || "Not assigned",
      },
      subjects,
      available,
      stats: {
        attendanceRate,
        totalClasses: totalAttendance,
        enrolledCount: subjects.length,
        upcomingAssignmentsCount: upcomingAssignments.length,
      },
      upcomingAssignments,
      recentGrades,
      feeRecord,
      announcements,
      currentUser: req.session.user,
    });
  } catch (e) {
    next(e);
  }
});

// 2. Attendance View
router.get("/attendance", async (req, res, next) => {
  try {
    const studentId = req.session.user.id;
    const records = await Attendance.find({ studentId })
      .populate({
        path: "semesterSubjectId",
        populate: { path: "subjectId" },
      })
      .sort({ date: -1 });

    const total = records.length;
    const present = records.filter((r) => r.status === "PRESENT").length;
    const absent = records.filter((r) => r.status === "ABSENT").length;
    const late = records.filter((r) => r.status === "LATE").length;
    const excused = records.filter((r) => r.status === "EXCUSED").length;
    const percentage = total > 0 ? Math.round(((present + late) / total) * 100) : 100;

    res.render("student/attendance", {
      title: "My Attendance",
      records,
      stats: { total, present, absent, late, excused, percentage },
      currentUser: req.session.user,
    });
  } catch (e) {
    next(e);
  }
});

// 3. Assignments View
router.get("/assignments", async (req, res, next) => {
  try {
    const studentId = req.session.user.id;
    const enrollments = await Enrollment.find({ studentId, enrollmentStatus: "ENROLLED" }).select("semesterSubjectId");
    const semSubjectIds = enrollments.map((e) => e.semesterSubjectId);

    const assignments = await Assignment.find({
      semesterSubjectId: { $in: semSubjectIds },
      status: { $ne: "ARCHIVED" },
    })
      .populate({
        path: "semesterSubjectId",
        populate: { path: "subjectId" },
      })
      .populate("teacherId", "name email")
      .sort({ dueDate: 1 });

    const submissions = await AssignmentSubmission.find({ studentId });
    const subMap = {};
    submissions.forEach((s) => {
      subMap[String(s.assignmentId)] = s;
    });

    const enriched = assignments.map((a) => {
      const sub = subMap[String(a._id)];
      const isOverdue = new Date() > new Date(a.dueDate) && !sub;
      return {
        ...a.toObject(),
        submission: sub || null,
        isOverdue,
      };
    });

    res.render("student/assignments", {
      title: "My Assignments",
      assignments: enriched,
      currentUser: req.session.user,
    });
  } catch (e) {
    next(e);
  }
});

// Submit Assignment
router.post("/assignments/:id/submit", async (req, res, next) => {
  try {
    const studentId = req.session.user.id;
    const assignmentId = req.params.id;
    const { submissionText, fileUrl } = req.body;

    if (!submissionText && !fileUrl) {
      req.session.flash = { type: "error", message: "Please enter submission text or link." };
      return res.redirect("/student/assignments");
    }

    await AssignmentSubmission.findOneAndUpdate(
      { assignmentId, studentId },
      {
        assignmentId,
        studentId,
        submissionText: String(submissionText || "").trim(),
        fileUrl: String(fileUrl || "").trim(),
        submittedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    req.session.flash = { type: "success", message: "Assignment submitted successfully!" };
    res.redirect("/student/assignments");
  } catch (e) {
    next(e);
  }
});

// 4. Grades View
router.get("/grades", async (req, res, next) => {
  try {
    const studentId = req.session.user.id;
    const grades = await Grade.find({ studentId })
      .populate({
        path: "semesterSubjectId",
        populate: { path: "subjectId" },
      })
      .populate("teacherId", "name")
      .sort({ createdAt: -1 });

    let totalMarks = 0;
    let totalMax = 0;
    grades.forEach((g) => {
      totalMarks += g.marksObtained;
      totalMax += g.maxMarks;
    });

    const overallPct = totalMax > 0 ? Math.round((totalMarks / totalMax) * 100) : 0;
    let gpa = (overallPct / 20).toFixed(2); // 5-point scale or 10-point scale: (overallPct / 10).toFixed(2)
    let gpa10 = (overallPct / 10).toFixed(2);

    res.render("student/grades", {
      title: "Academic Performance & Grades",
      grades,
      stats: { totalMarks, totalMax, overallPct, gpa: gpa10 },
      currentUser: req.session.user,
    });
  } catch (e) {
    next(e);
  }
});

// 5. Fees View
router.get("/fees", async (req, res, next) => {
  try {
    const studentId = req.session.user.id;
    let feeRecord = await FeeRecord.findOne({ studentId }).populate("courseId collegeId");

    if (!feeRecord) {
      // Find course fee from student profile
      const student = await Student.findById(studentId).populate({
        path: "collegeCourseId",
        populate: { path: "courseId" },
      });

      const totalAmount = student?.collegeCourseId?.courseId?.totalFee || 50000;
      feeRecord = await FeeRecord.create({
        studentId,
        courseId: student?.collegeCourseId?.courseId?._id || null,
        collegeId: student?.collegeCourseId?.collegeId || null,
        totalAmount,
        paidAmount: 0,
        status: "PENDING",
      });
    }

    const outstanding = Math.max(0, feeRecord.totalAmount - feeRecord.paidAmount);

    res.render("student/fees", {
      title: "My Fee Ledger",
      feeRecord,
      outstanding,
      currentUser: req.session.user,
    });
  } catch (e) {
    next(e);
  }
});

// 6. Subject Enrollment
router.post("/enroll", async (req, res, next) => {
  try {
    const sid = String(req.body.semester_subject_id || "");
    if (!mongoose.isValidObjectId(sid)) {
      req.session.flash = {
        type: "error",
        message: "Please select a valid subject.",
      };
      return res.redirect("/student");
    }
    const student = await Student.findById(req.session.user.id);
    if (!student || !student.collegeCourseId) {
      req.session.flash = {
        type: "error",
        message:
          "Your college and course have not been assigned yet. Contact an administrator to enroll in subjects.",
      };
      return res.redirect("/student");
    }
    const semesters = await Semester.find({
      collegeCourseId: student.collegeCourseId,
    }).select("_id");
    const valid = await SemesterSubject.findOne({
      _id: sid,
      semesterId: { $in: semesters.map((x) => x._id) },
    });
    if (!valid) {
      req.session.flash = {
        type: "error",
        message: "This subject is not available for your course.",
      };
      return res.redirect("/student");
    }
    await Enrollment.updateOne(
      { studentId: student._id, semesterSubjectId: valid._id },
      { $setOnInsert: { enrollmentStatus: "ENROLLED" } },
      { upsert: true },
    );
    req.session.flash = {
      type: "success",
      message: "Subject enrollment updated successfully.",
    };
    res.redirect("/student");
  } catch (e) {
    next(e);
  }
});

module.exports = router;

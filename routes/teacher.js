const express = require("express");
const mongoose = require("mongoose");
const { allowRoles } = require("../middleware/auth");
const {
  TeachingAssignment,
  SemesterSubject,
  Subject,
  Semester,
  CollegeCourse,
  College,
  Course,
  Student,
  Enrollment,
  Attendance,
  Assignment,
  AssignmentSubmission,
  Grade,
  Announcement,
  Notification,
} = require("../models");
const { sendNotification } = require("../services/socketService");

const router = express.Router();
router.use(allowRoles("TEACHER"));

// Helper: Get Teacher's Approved SemesterSubjects
async function getTeacherApprovedSubjects(teacherId) {
  const assignments = await TeachingAssignment.find({
    teacherId,
    status: "APPROVED",
  }).populate({
    path: "semesterSubjectId",
    populate: [
      { path: "subjectId" },
      {
        path: "semesterId",
        populate: {
          path: "collegeCourseId",
          populate: [{ path: "courseId" }, { path: "collegeId" }],
        },
      },
    ],
  });

  return assignments
    .filter((a) => a.semesterSubjectId && a.semesterSubjectId.subjectId)
    .map((a) => ({
      assignmentId: String(a._id),
      semesterSubjectId: String(a.semesterSubjectId._id),
      subjectName: a.semesterSubjectId.subjectId.name,
      subjectCode: a.semesterSubjectId.subjectId.code,
      credits: a.semesterSubjectId.subjectId.credits,
      semesterNo: a.semesterSubjectId.semesterId?.semesterNo,
      courseName: a.semesterSubjectId.semesterId?.collegeCourseId?.courseId?.name || "N/A",
      collegeName: a.semesterSubjectId.semesterId?.collegeCourseId?.collegeId?.name || "N/A",
    }));
}

// 1. Dashboard
router.get("/", async (req, res, next) => {
  try {
    const teacherId = req.session.user.id;
    const subjects = await getTeacherApprovedSubjects(teacherId);
    const semSubjectIds = subjects.map((s) => s.semesterSubjectId);

    // Enrolled students count
    const studentIds = await Enrollment.find({
      semesterSubjectId: { $in: semSubjectIds },
      enrollmentStatus: "ENROLLED",
    }).distinct("studentId");

    // Assignments
    const assignments = await Assignment.find({ teacherId }).sort({ createdAt: -1 }).limit(5);

    // Submissions pending review
    const assignmentIds = await Assignment.find({ teacherId }).distinct("_id");
    const pendingSubmissions = await AssignmentSubmission.countDocuments({
      assignmentId: { $in: assignmentIds },
      marksObtained: null,
    });

    // Recent announcements
    const announcements = await Announcement.find({
      $or: [{ targetRole: "ALL" }, { targetRole: "TEACHER" }],
    })
      .sort({ createdAt: -1 })
      .limit(5);

    res.render("teacher/dashboard", {
      title: "Teacher Dashboard",
      subjects,
      stats: {
        totalSubjects: subjects.length,
        totalStudents: studentIds.length,
        totalAssignments: assignmentIds.length,
        pendingSubmissions,
      },
      assignments,
      announcements,
      currentUser: req.session.user,
    });
  } catch (e) {
    next(e);
  }
});

// 2. Attendance Page
router.get("/attendance", async (req, res, next) => {
  try {
    const teacherId = req.session.user.id;
    const subjects = await getTeacherApprovedSubjects(teacherId);
    const selectedSubjectId = req.query.subjectId || (subjects.length > 0 ? subjects[0].semesterSubjectId : null);
    const selectedDate = req.query.date || new Date().toISOString().slice(0, 10);

    let students = [];
    let attendanceMap = {};

    if (selectedSubjectId) {
      // Find enrolled students
      const enrollments = await Enrollment.find({
        semesterSubjectId: selectedSubjectId,
        enrollmentStatus: "ENROLLED",
      }).populate("studentId");

      students = enrollments
        .filter((e) => e.studentId && e.studentId.status === "ACTIVE")
        .map((e) => e.studentId);

      // Check existing attendance for this date
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      const records = await Attendance.find({
        semesterSubjectId: selectedSubjectId,
        date: { $gte: startOfDay, $lte: endOfDay },
      });

      records.forEach((r) => {
        attendanceMap[String(r.studentId)] = {
          status: r.status,
          remarks: r.remarks || "",
        };
      });
    }

    res.render("teacher/attendance", {
      title: "Mark Attendance",
      subjects,
      selectedSubjectId,
      selectedDate,
      students,
      attendanceMap,
      currentUser: req.session.user,
    });
  } catch (e) {
    next(e);
  }
});

// Save Attendance
router.post("/attendance", async (req, res, next) => {
  try {
    const teacherId = req.session.user.id;
    const { semesterSubjectId, date, attendance } = req.body;

    if (!semesterSubjectId || !date) {
      req.session.flash = { type: "error", message: "Subject and date are required." };
      return res.redirect("/teacher/attendance");
    }

    const attendanceDate = new Date(date);
    attendanceDate.setHours(12, 0, 0, 0);

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    if (attendance && typeof attendance === "object") {
      for (const [studentId, statusValue] of Object.entries(attendance)) {
        if (!mongoose.isValidObjectId(studentId)) continue;
        const status = ["PRESENT", "ABSENT", "LATE", "EXCUSED"].includes(statusValue) ? statusValue : "PRESENT";

        await Attendance.findOneAndUpdate(
          {
            studentId,
            semesterSubjectId,
            date: { $gte: startOfDay, $lte: endOfDay },
          },
          {
            studentId,
            semesterSubjectId,
            date: attendanceDate,
            status,
            markedByTeacherId: teacherId,
          },
          { upsert: true, new: true }
        );
      }
    }

    req.session.flash = { type: "success", message: "Attendance records saved successfully!" };
    res.redirect(`/teacher/attendance?subjectId=${semesterSubjectId}&date=${date}`);
  } catch (e) {
    next(e);
  }
});

// 3. Assignments List & Create
router.get("/assignments", async (req, res, next) => {
  try {
    const teacherId = req.session.user.id;
    const subjects = await getTeacherApprovedSubjects(teacherId);

    const assignments = await Assignment.find({ teacherId })
      .populate({
        path: "semesterSubjectId",
        populate: { path: "subjectId" },
      })
      .sort({ createdAt: -1 });

    // Attach submission counts
    const assignmentIds = assignments.map((a) => a._id);
    const submissionCounts = await AssignmentSubmission.aggregate([
      { $match: { assignmentId: { $in: assignmentIds } } },
      { $group: { _id: "$assignmentId", count: { $sum: 1 } } },
    ]);

    const countMap = {};
    submissionCounts.forEach((s) => (countMap[String(s._id)] = s.count));

    const enrichedAssignments = assignments.map((a) => ({
      ...a.toObject(),
      submissionCount: countMap[String(a._id)] || 0,
      subjectName: a.semesterSubjectId?.subjectId?.name || "General",
    }));

    res.render("teacher/assignments", {
      title: "Course Assignments",
      assignments: enrichedAssignments,
      subjects,
      currentUser: req.session.user,
    });
  } catch (e) {
    next(e);
  }
});

// Create Assignment
router.post("/assignments", async (req, res, next) => {
  try {
    const teacherId = req.session.user.id;
    const { title, description, semesterSubjectId, dueDate, maxMarks } = req.body;

    if (!title || !dueDate) {
      req.session.flash = { type: "error", message: "Title and due date are required." };
      return res.redirect("/teacher/assignments");
    }

    const assignment = await Assignment.create({
      title: String(title).trim(),
      description: String(description || "").trim(),
      semesterSubjectId: semesterSubjectId || null,
      teacherId,
      dueDate: new Date(dueDate),
      maxMarks: Number(maxMarks) || 100,
    });

    // Notify enrolled students
    if (semesterSubjectId) {
      const enrollments = await Enrollment.find({
        semesterSubjectId,
        enrollmentStatus: "ENROLLED",
      }).select("studentId");

      for (const e of enrollments) {
        const notif = await Notification.create({
          recipientId: e.studentId,
          recipientRole: "STUDENT",
          title: `New Assignment: ${title}`,
          message: `Due on ${new Date(dueDate).toLocaleDateString()}`,
          type: "ASSIGNMENT",
          link: "/student/assignments",
        });
        sendNotification(e.studentId, notif);
      }
    }

    req.session.flash = { type: "success", message: "Assignment created and students notified!" };
    res.redirect("/teacher/assignments");
  } catch (e) {
    next(e);
  }
});

// View Assignment Submissions
router.get("/assignments/:id", async (req, res, next) => {
  try {
    const teacherId = req.session.user.id;
    const assignment = await Assignment.findOne({ _id: req.params.id, teacherId }).populate({
      path: "semesterSubjectId",
      populate: { path: "subjectId" },
    });

    if (!assignment) {
      req.session.flash = { type: "error", message: "Assignment not found." };
      return res.redirect("/teacher/assignments");
    }

    const submissions = await AssignmentSubmission.find({ assignmentId: assignment._id })
      .populate("studentId", "name email studentId")
      .sort({ submittedAt: -1 });

    res.render("teacher/assignment-detail", {
      title: `Submissions: ${assignment.title}`,
      assignment,
      submissions,
      currentUser: req.session.user,
    });
  } catch (e) {
    next(e);
  }
});

// Grade Submission
router.post("/assignments/:id/grade/:submissionId", async (req, res, next) => {
  try {
    const teacherId = req.session.user.id;
    const { marksObtained, feedback } = req.body;

    const submission = await AssignmentSubmission.findById(req.params.submissionId);
    if (!submission) {
      req.session.flash = { type: "error", message: "Submission not found." };
      return res.redirect(`/teacher/assignments/${req.params.id}`);
    }

    submission.marksObtained = Number(marksObtained);
    submission.feedback = String(feedback || "").trim();
    submission.gradedAt = new Date();
    submission.gradedByTeacherId = teacherId;
    await submission.save();

    // Notify student
    const notif = await Notification.create({
      recipientId: submission.studentId,
      recipientRole: "STUDENT",
      title: "Assignment Graded",
      message: `Score: ${submission.marksObtained}. Feedback: ${submission.feedback || "Good job!"}`,
      type: "GRADE",
      link: "/student/assignments",
    });
    sendNotification(submission.studentId, notif);

    req.session.flash = { type: "success", message: "Grade and feedback saved successfully!" };
    res.redirect(`/teacher/assignments/${req.params.id}`);
  } catch (e) {
    next(e);
  }
});

// 4. Grades Management
router.get("/grades", async (req, res, next) => {
  try {
    const teacherId = req.session.user.id;
    const subjects = await getTeacherApprovedSubjects(teacherId);
    const selectedSubjectId = req.query.subjectId || (subjects.length > 0 ? subjects[0].semesterSubjectId : null);
    const selectedExamType = req.query.examType || "FINAL";

    let students = [];
    let gradesMap = {};

    if (selectedSubjectId) {
      const enrollments = await Enrollment.find({
        semesterSubjectId: selectedSubjectId,
        enrollmentStatus: "ENROLLED",
      }).populate("studentId");

      students = enrollments
        .filter((e) => e.studentId && e.studentId.status === "ACTIVE")
        .map((e) => e.studentId);

      const existingGrades = await Grade.find({
        semesterSubjectId: selectedSubjectId,
        examType: selectedExamType,
      });

      existingGrades.forEach((g) => {
        gradesMap[String(g.studentId)] = {
          marksObtained: g.marksObtained,
          maxMarks: g.maxMarks,
          grade: g.grade,
          remarks: g.remarks,
        };
      });
    }

    res.render("teacher/grades", {
      title: "Manage Student Grades",
      subjects,
      selectedSubjectId,
      selectedExamType,
      students,
      gradesMap,
      currentUser: req.session.user,
    });
  } catch (e) {
    next(e);
  }
});

// Save Grades
router.post("/grades", async (req, res, next) => {
  try {
    const teacherId = req.session.user.id;
    const { semesterSubjectId, examType, maxMarks, grades } = req.body;

    if (!semesterSubjectId || !examType) {
      req.session.flash = { type: "error", message: "Subject and exam type are required." };
      return res.redirect("/teacher/grades");
    }

    const defaultMax = Number(maxMarks) || 100;

    if (grades && typeof grades === "object") {
      for (const [studentId, data] of Object.entries(grades)) {
        if (!mongoose.isValidObjectId(studentId)) continue;
        const marks = Number(data.marks);
        if (isNaN(marks)) continue;

        // Auto calculate grade letter
        const pct = (marks / defaultMax) * 100;
        let gradeLetter = "F";
        if (pct >= 90) gradeLetter = "A+";
        else if (pct >= 80) gradeLetter = "A";
        else if (pct >= 70) gradeLetter = "B";
        else if (pct >= 60) gradeLetter = "C";
        else if (pct >= 50) gradeLetter = "D";

        await Grade.findOneAndUpdate(
          { studentId, semesterSubjectId, examType },
          {
            studentId,
            semesterSubjectId,
            examType,
            marksObtained: marks,
            maxMarks: defaultMax,
            grade: data.grade || gradeLetter,
            remarks: String(data.remarks || "").trim(),
            teacherId,
          },
          { upsert: true, new: true }
        );

        // Notify student
        const notif = await Notification.create({
          recipientId: studentId,
          recipientRole: "STUDENT",
          title: `New Grade Posted (${examType})`,
          message: `Marks: ${marks}/${defaultMax} (Grade: ${gradeLetter})`,
          type: "GRADE",
          link: "/student/grades",
        });
        sendNotification(studentId, notif);
      }
    }

    req.session.flash = { type: "success", message: "Grades saved and published successfully!" };
    res.redirect(`/teacher/grades?subjectId=${semesterSubjectId}&examType=${examType}`);
  } catch (e) {
    next(e);
  }
});

// 5. Students Roster
router.get("/students", async (req, res, next) => {
  try {
    const teacherId = req.session.user.id;
    const subjects = await getTeacherApprovedSubjects(teacherId);
    const semSubjectIds = subjects.map((s) => s.semesterSubjectId);

    const enrollments = await Enrollment.find({
      semesterSubjectId: { $in: semSubjectIds },
      enrollmentStatus: "ENROLLED",
    })
      .populate("studentId")
      .populate({
        path: "semesterSubjectId",
        populate: { path: "subjectId" },
      });

    const students = enrollments
      .filter((e) => e.studentId && e.studentId.status === "ACTIVE")
      .map((e) => ({
        ...e.studentId.toObject(),
        subjectName: e.semesterSubjectId?.subjectId?.name || "Subject",
        subjectCode: e.semesterSubjectId?.subjectId?.code || "",
      }));

    res.render("teacher/students", {
      title: "My Students",
      students,
      currentUser: req.session.user,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

const express = require("express");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { allowRoles } = require("../middleware/auth");
const {
  Student,
  StudentLogin,
  Teacher,
  TeacherLogin,
  Admin,
  AdminLogin,
  Course,
  Subject,
  College,
  University,
  CollegeCourse,
  Semester,
  SemesterSubject,
  TeachingAssignment,
  Department,
  LoginActivity,
  ManagementActivity,
  Attendance,
  Grade,
  FeeRecord,
  AcademicSession,
  Announcement,
  Notification,
  Assignment,
  AssignmentSubmission,
} = require("../models");
const { generateExcel, generatePDF } = require("../services/reportService");
const router = express.Router();
router.use(allowRoles("ADMIN"));
router.use((req, res, next) => {
  const user = req.session.user;
  if (
    user.adminRole === "COLLEGE_ADMIN" &&
    !mongoose.isValidObjectId(user.collegeId)
  ) {
    return res.status(403).render("error", {
      title: "Access denied",
      message: "This college administrator account has no valid college scope.",
    });
  }
  next();
});

function isCollegeAdmin(req) {
  return req.session.user.adminRole === "COLLEGE_ADMIN";
}

function requireSuperAdmin(req, res, next) {
  if (req.session.user.adminRole !== "SUPER_ADMIN") {
    return res.status(403).render("error", {
      title: "Access denied",
      message: "Only a super administrator can manage this data.",
    });
  }
  next();
}

async function recordManagement(
  req,
  action,
  entityType,
  entity,
  collegeId,
  entityLabel,
) {
  await ManagementActivity.create({
    actorId: req.session.user.id,
    action,
    entityType,
    entityId: entity._id,
    entityLabel:
      entityLabel || entity.name || entity.code || entity.email || String(entity._id),
    collegeId: collegeId || null,
  });
}

router.get("/", async (req, res, next) => {
  try {
    let studentFilter = { archivedAt: null };
    let teacherFilter = { archivedAt: null };
    let courseFilter = {};
    let collegeFilter = { archivedAt: null };
    let assignmentFilter = { status: "PENDING" };
    let loginFilter = {};
    if (isCollegeAdmin(req)) {
      const collegeCourses = await CollegeCourse.find({
        collegeId: req.session.user.collegeId,
      }).select("_id courseId");
      const courseIds = collegeCourses.map((item) => item.courseId);
      const [studentIds, teacherIds] = await Promise.all([
        Student.find({ collegeCourseId: { $in: collegeCourses.map((item) => item._id) } }).distinct("_id"),
        Teacher.find({
        collegeId: req.session.user.collegeId,
        }).distinct("_id"),
      ]);
      studentFilter = {
        archivedAt: null,
        collegeCourseId: { $in: collegeCourses.map((item) => item._id) },
      };
      teacherFilter.collegeId = req.session.user.collegeId;
      courseFilter._id = { $in: courseIds };
      assignmentFilter.teacherId = { $in: teacherIds };
      collegeFilter._id = req.session.user.collegeId;
      loginFilter = {
        $or: [
          { role: "STUDENT", accountId: { $in: studentIds } },
          { role: "TEACHER", accountId: { $in: teacherIds } },
          { role: "ADMIN", accountId: req.session.user.id },
        ],
      };
    }
    const [
      students,
      teachers,
      courses,
      colleges,
      pending,
      recentStudents,
      logins,
      activity,
      universities,
      attendanceTotal,
      attendancePresent,
      feeSummary,
      gradeAgg,
    ] = await Promise.all([
      Student.countDocuments(studentFilter),
      Teacher.countDocuments(teacherFilter),
      Course.countDocuments({ ...courseFilter, archivedAt: null }),
      College.countDocuments(collegeFilter),
      TeachingAssignment.countDocuments(assignmentFilter),
      Student.find(studentFilter)
        .sort({ createdAt: -1 })
        .limit(5)
        .select("name email createdAt")
        .lean(),
      LoginActivity.find(loginFilter)
        .sort({ createdAt: -1 })
        .limit(8)
        .select("role username success createdAt")
        .lean(),
      ManagementActivity.find(
        isCollegeAdmin(req)
          ? { collegeId: req.session.user.collegeId }
          : {},
      )
        .sort({ createdAt: -1 })
        .limit(8)
        .select("action entityType entityLabel createdAt")
        .lean(),
      isCollegeAdmin(req) ? Promise.resolve(null) : University.countDocuments(),
      Attendance.countDocuments(),
      Attendance.countDocuments({ status: { $in: ["PRESENT", "LATE"] } }),
      FeeRecord.aggregate([
        { $group: { _id: null, total: { $sum: "$totalAmount" }, paid: { $sum: "$paidAmount" } } },
      ]),
      Grade.aggregate([
        { $group: { _id: "$grade", count: { $sum: 1 } } },
      ]),
    ]);

    const totalAtt = attendanceTotal || 0;
    const presAtt = attendancePresent || 0;
    const attendanceRate = totalAtt > 0 ? Math.round((presAtt / totalAtt) * 100) : 94;

    const feeAgg = feeSummary && feeSummary[0] ? feeSummary[0] : { total: 0, paid: 0 };

    const gradesMap = { "A+": 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
    if (gradeAgg && Array.isArray(gradeAgg)) {
      gradeAgg.forEach((g) => {
        if (g._id && gradesMap[g._id] !== undefined) gradesMap[g._id] = g.count;
      });
    }

    res.render("admin/dashboard", {
      title: "Admin Dashboard",
      stats: {
        universities,
        colleges,
        students,
        teachers,
        courses,
        pending,
        attendanceRate,
        totalFees: feeAgg.total,
        paidFees: feeAgg.paid,
      },
      chartData: {
        grades: gradesMap,
        attendance: { present: presAtt, absent: Math.max(0, totalAtt - presAtt) },
      },
      recentStudents,
      loginActivity: logins,
      managementActivity: activity,
    });
  } catch (e) {
    next(e);
  }
});
router.get("/courses", requireSuperAdmin, async (req, res, next) => {
  try {
    const docs = await Course.find({ archivedAt: null })
      .sort("name")
      .populate("departmentId");
    const courses = await Promise.all(
      docs.map(async (c) => ({
        course_id: String(c._id),
        name: c.name,
        code: c.code || "",
        description: c.description || "",
        department_id: String(c.departmentId?._id || ""),
        department_name: c.departmentId?.name || "—",
        duration_years: c.durationYears,
        college_count: await CollegeCourse.countDocuments({ courseId: c._id }),
        college_ids: (await CollegeCourse.find({ courseId: c._id }).distinct("collegeId")).map(String),
      })),
    );
    const [departments, colleges] = await Promise.all([
      Department.find({ archivedAt: null }).sort("name").populate("collegeId"),
      College.find({ archivedAt: null }).sort("name"),
    ]);
    res.render("admin/courses", {
      title: "Manage Courses",
      courses,
      colleges,
      departments: departments.map((department) => ({
        department_id: String(department._id),
        name: department.name,
        college_name: department.collegeId?.name || "",
      })),
    });
  } catch (e) {
    next(e);
  }
});
router.post("/courses", requireSuperAdmin, async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim(),
      code = String(req.body.code || "").trim().toUpperCase(),
      description = String(req.body.description || "").trim(),
      departmentId = String(req.body.department_id || ""),
      duration = Number(req.body.duration_years),
      collegeIds = (Array.isArray(req.body.college_ids)
        ? req.body.college_ids
        : req.body.college_ids
          ? [req.body.college_ids]
          : []
      ).map(String);
    if (
      !name ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      collegeIds.some((id) => !mongoose.isValidObjectId(id))
    ) {
      req.session.flash = {
        type: "error",
        message: "Enter a valid course name and duration.",
      };
      return res.redirect("/admin/courses");
    }
    if (departmentId && !mongoose.isValidObjectId(departmentId)) {
      req.session.flash = { type: "error", message: "Select a valid department." };
      return res.redirect("/admin/courses");
    }
    const validColleges = await College.find({
      _id: { $in: collegeIds },
      archivedAt: null,
    }).distinct("_id");
    if (validColleges.length !== collegeIds.length) {
      req.session.flash = { type: "error", message: "Select only active colleges." };
      return res.redirect("/admin/courses");
    }
    const department = departmentId
      ? await Department.findOne({ _id: departmentId, archivedAt: null })
      : null;
    if (
      departmentId &&
      (!department || !collegeIds.includes(String(department.collegeId)))
    ) {
      req.session.flash = {
        type: "error",
        message: "Select the department's college in the course availability list.",
      };
      return res.redirect("/admin/courses");
    }
    const course = await Course.create({
      name,
      code: code || undefined,
      description,
      departmentId: departmentId || null,
      durationYears: duration,
    });
    await Promise.all(
      collegeIds.map((collegeId) =>
        CollegeCourse.updateOne(
          { collegeId, courseId: course._id },
          { $setOnInsert: { collegeId, courseId: course._id } },
          { upsert: true },
        ),
      ),
    );
    await recordManagement(req, "created", "COURSE", course);
    req.session.flash = { type: "success", message: "The course has been added." };
    res.redirect("/admin/courses");
  } catch (e) {
    if (e.code === 11000) {
      req.session.flash = {
        type: "error",
        message: "This course already exists.",
      };
      return res.redirect("/admin/courses");
    }
    next(e);
  }
});
router.post("/courses/:id/update", requireSuperAdmin, async (req, res, next) => {
  try {
    const duration = Number(req.body.duration_years);
    const name = String(req.body.name || "").trim();
    const code = String(req.body.code || "").trim().toUpperCase();
    const description = String(req.body.description || "").trim();
    const departmentId = String(req.body.department_id || "");
    const collegeIds = (Array.isArray(req.body.college_ids)
      ? req.body.college_ids
      : req.body.college_ids
        ? [req.body.college_ids]
        : []
    ).map(String);
    if (
      !mongoose.isValidObjectId(req.params.id) ||
      !name ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      (departmentId && !mongoose.isValidObjectId(departmentId)) ||
      collegeIds.some((id) => !mongoose.isValidObjectId(id))
    ) {
      req.session.flash = { type: "error", message: "Enter valid course details." };
      return res.redirect("/admin/courses");
    }
    const department = departmentId
      ? await Department.findOne({ _id: departmentId, archivedAt: null })
      : null;
    if (departmentId && !department) {
      req.session.flash = { type: "error", message: "Select an active department." };
      return res.redirect("/admin/courses");
    }
    const validColleges = await College.find({
      _id: { $in: collegeIds },
      archivedAt: null,
    }).distinct("_id");
    if (validColleges.length !== collegeIds.length) {
      req.session.flash = { type: "error", message: "Select only active colleges." };
      return res.redirect("/admin/courses");
    }
    if (departmentId && !collegeIds.includes(String(department.collegeId))) {
      req.session.flash = {
        type: "error",
        message: "Select the department's college in the course availability list.",
      };
      return res.redirect("/admin/courses");
    }
    const course = await Course.findOneAndUpdate(
      { _id: req.params.id, archivedAt: null },
      {
        name,
        code: code || undefined,
        description,
        departmentId: departmentId || null,
        durationYears: duration,
      },
      { new: true, runValidators: true },
    );
    if (!course) {
      return res.status(404).render("error", {
        title: "Course not found",
        message: "The course could not be found.",
      });
    }
    await Promise.all(
      collegeIds.map((collegeId) =>
        CollegeCourse.updateOne(
          { collegeId, courseId: course._id },
          { $setOnInsert: { collegeId, courseId: course._id } },
          { upsert: true },
        ),
      ),
    );
    await recordManagement(req, "updated", "COURSE", course);
    req.session.flash = { type: "success", message: "Course details updated." };
    res.redirect("/admin/courses");
  } catch (e) {
    if (e.code === 11000) {
      req.session.flash = { type: "error", message: "The course name or code is already in use." };
      return res.redirect("/admin/courses");
    }
    next(e);
  }
});
router.post("/courses/:id/archive", requireSuperAdmin, async (req, res, next) => {
  try {
    const course = await Course.findOneAndUpdate(
      { _id: req.params.id, archivedAt: null },
      { archivedAt: new Date() },
      { new: true },
    );
    if (!course) {
      return res.status(404).render("error", {
        title: "Course not found",
        message: "The course could not be found.",
      });
    }
    await recordManagement(req, "archived", "COURSE", course);
    req.session.flash = { type: "success", message: "Course archived. Academic history has been preserved." };
    res.redirect("/admin/courses");
  } catch (e) {
    next(e);
  }
});
router.get("/subjects", requireSuperAdmin, async (req, res, next) => {
  try {
    const docs = await Subject.find().sort("name");
    res.render("admin/subjects", {
      title: "Manage Subjects",
      subjects: docs.map((s) => ({
        subject_id: String(s._id),
        code: s.code,
        name: s.name,
        credits: s.credits,
        subject_type: s.subjectType,
      })),
    });
  } catch (e) {
    next(e);
  }
});
router.post("/subjects", requireSuperAdmin, async (req, res, next) => {
  try {
    const code = String(req.body.code || "")
        .trim()
        .toUpperCase(),
      name = String(req.body.name || "").trim(),
      credits = Number(req.body.credits),
      type = String(req.body.subject_type || "");
    if (
      !code ||
      !name ||
      !Number.isInteger(credits) ||
      credits < 0 ||
      !["CREDIT", "NON_CREDIT"].includes(type)
    ) {
      req.session.flash = {
        type: "error",
        message: "Fill in the subject details correctly.",
      };
      return res.redirect("/admin/subjects");
    }
    const subject = await Subject.create({
      code,
      name,
      credits,
      subjectType: type,
    });
    await recordManagement(req, "created", "SUBJECT", subject);
    req.session.flash = { type: "success", message: "Subject added successfully." };
    res.redirect("/admin/subjects");
  } catch (e) {
    if (e.code === 11000) {
      req.session.flash = {
        type: "error",
        message: "The subject code is already in use..",
      };
      return res.redirect("/admin/subjects");
    }
    next(e);
  }
});
router.get("/colleges", async (req, res, next) => {
  try {
    const filter = { archivedAt: null };
    if (isCollegeAdmin(req)) filter._id = req.session.user.collegeId;
    const [colleges, universities] = await Promise.all([
      College.find(filter).sort("name").populate("universityId").lean(),
      isCollegeAdmin(req) ? Promise.resolve([]) : University.find().sort("name").lean(),
    ]);
    res.render("admin/colleges", {
      title: "Manage Colleges",
      colleges,
      universities,
    });
  } catch (e) {
    next(e);
  }
});
router.post("/colleges", requireSuperAdmin, async (req, res, next) => {
  try {
    const universityId = String(req.body.university_id || "");
    const name = String(req.body.name || "").trim();
    const city = String(req.body.city || "").trim();
    const state = String(req.body.state || "").trim();
    const website = String(req.body.website || "").trim();
    const phone = String(req.body.phone || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    if (
      !name ||
      !mongoose.isValidObjectId(universityId) ||
      !(await University.exists({ _id: universityId })) ||
      (email && !/^\S+@\S+\.\S+$/.test(email))
    ) {
      req.session.flash = {
        type: "error",
        message: "Enter a valid college name, university, and contact email.",
      };
      return res.redirect("/admin/colleges");
    }
    const college = await College.create({
      universityId,
      name,
      city,
      state,
      website,
      phone,
      email,
    });
    await recordManagement(req, "created", "COLLEGE", college, college._id);
    req.session.flash = { type: "success", message: "College added successfully." };
    res.redirect("/admin/colleges");
  } catch (e) {
    if (e.code === 11000) {
      req.session.flash = { type: "error", message: "That college already exists under this university." };
      return res.redirect("/admin/colleges");
    }
    next(e);
  }
});
router.post("/colleges/:id/update", async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const city = String(req.body.city || "").trim();
    const state = String(req.body.state || "").trim();
    const website = String(req.body.website || "").trim();
    const phone = String(req.body.phone || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const filter = { _id: req.params.id, archivedAt: null };
    if (isCollegeAdmin(req)) filter._id = req.session.user.collegeId;
    if (
      !name ||
      !mongoose.isValidObjectId(req.params.id) ||
      (email && !/^\S+@\S+\.\S+$/.test(email))
    ) {
      req.session.flash = { type: "error", message: "Enter valid college details." };
      return res.redirect("/admin/colleges");
    }
    const college = await College.findOneAndUpdate(
      filter,
      { name, city, state, website, phone, email },
      { new: true, runValidators: true },
    );
    if (!college) {
      return res.status(404).render("error", {
        title: "College not found",
        message: "The college could not be found.",
      });
    }
    await recordManagement(req, "updated", "COLLEGE", college, college._id);
    req.session.flash = { type: "success", message: "College details updated." };
    res.redirect("/admin/colleges");
  } catch (e) {
    if (e.code === 11000) {
      req.session.flash = { type: "error", message: "A college with that name already exists under this university." };
      return res.redirect("/admin/colleges");
    }
    next(e);
  }
});
router.post("/colleges/:id/archive", requireSuperAdmin, async (req, res, next) => {
  try {
    const college = await College.findOneAndUpdate(
      { _id: req.params.id, archivedAt: null },
      { archivedAt: new Date() },
      { new: true },
    );
    if (!college) {
      return res.status(404).render("error", {
        title: "College not found",
        message: "The college could not be found.",
      });
    }
    await recordManagement(req, "archived", "COLLEGE", college, college._id);
    req.session.flash = {
      type: "success",
      message: "College archived. Linked academic records have been preserved.",
    };
    res.redirect("/admin/colleges");
  } catch (e) {
    next(e);
  }
});
router.get("/departments", async (req, res, next) => {
  try {
    const collegeId = String(req.query.college || "");
    const collegeFilter = { archivedAt: null };
    if (isCollegeAdmin(req)) collegeFilter._id = req.session.user.collegeId;
    const [colleges, departments] = await Promise.all([
      College.find(collegeFilter).sort("name"),
      Department.find({
        archivedAt: null,
        ...(collegeId && mongoose.isValidObjectId(collegeId)
          ? { collegeId }
          : {}),
        ...(isCollegeAdmin(req) ? { collegeId: req.session.user.collegeId } : {}),
      })
        .sort("name")
        .populate("collegeId"),
    ]);
    res.render("admin/departments", {
      title: "Manage Departments",
      colleges,
      departments,
    });
  } catch (e) {
    next(e);
  }
});
router.post("/departments", async (req, res, next) => {
  try {
    const collegeId = isCollegeAdmin(req)
      ? req.session.user.collegeId
      : String(req.body.college_id || "");
    const name = String(req.body.name || "").trim();
    const description = String(req.body.description || "").trim();
    if (
      !name ||
      !mongoose.isValidObjectId(collegeId) ||
      !(await College.exists({ _id: collegeId, archivedAt: null }))
    ) {
      req.session.flash = { type: "error", message: "Choose a valid college and department name." };
      return res.redirect("/admin/departments");
    }
    const department = await Department.create({ collegeId, name, description });
    await recordManagement(req, "created", "DEPARTMENT", department, collegeId);
    req.session.flash = { type: "success", message: "Department added successfully." };
    res.redirect("/admin/departments");
  } catch (e) {
    if (e.code === 11000) {
      req.session.flash = { type: "error", message: "That department already exists at the selected college." };
      return res.redirect("/admin/departments");
    }
    next(e);
  }
});
router.post("/departments/:id/update", async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const description = String(req.body.description || "").trim();
    const filter = { _id: req.params.id, archivedAt: null };
    if (isCollegeAdmin(req)) filter.collegeId = req.session.user.collegeId;
    if (!name || !mongoose.isValidObjectId(req.params.id)) {
      req.session.flash = { type: "error", message: "Enter a valid department name." };
      return res.redirect("/admin/departments");
    }
    const department = await Department.findOneAndUpdate(
      filter,
      { name, description },
      { new: true, runValidators: true },
    );
    if (!department) {
      return res.status(404).render("error", {
        title: "Department not found",
        message: "The department could not be found.",
      });
    }
    await recordManagement(req, "updated", "DEPARTMENT", department, department.collegeId);
    req.session.flash = { type: "success", message: "Department updated." };
    res.redirect("/admin/departments");
  } catch (e) {
    if (e.code === 11000) {
      req.session.flash = { type: "error", message: "That department already exists at this college." };
      return res.redirect("/admin/departments");
    }
    next(e);
  }
});
router.post("/departments/:id/archive", async (req, res, next) => {
  try {
    const filter = { _id: req.params.id, archivedAt: null };
    if (isCollegeAdmin(req)) filter.collegeId = req.session.user.collegeId;
    const department = await Department.findOneAndUpdate(
      filter,
      { archivedAt: new Date() },
      { new: true },
    );
    if (!department) {
      return res.status(404).render("error", {
        title: "Department not found",
        message: "The department could not be found.",
      });
    }
    await recordManagement(req, "archived", "DEPARTMENT", department, department.collegeId);
    req.session.flash = {
      type: "success",
      message: "Department archived. Related profiles and courses were preserved.",
    };
    res.redirect("/admin/departments");
  } catch (e) {
    next(e);
  }
});
async function getStudentCollegeCourses(req) {
  const filter = { archivedAt: null };
  if (isCollegeAdmin(req)) filter.collegeId = req.session.user.collegeId;
  return CollegeCourse.find(filter)
    .populate({ path: "collegeId", match: { archivedAt: null } })
    .populate({ path: "courseId", match: { archivedAt: null } })
    .sort("collegeId.name courseId.name");
}

function normalizeStudent(student) {
  return {
    student_id: String(student._id),
    name: student.name,
    email: student.email,
    status: student.status,
    custom_student_id: student.studentId || "",
    phone: student.phone || "",
    college_course_id: String(student.collegeCourseId?._id || student.collegeCourseId || ""),
    college_name: student.collegeCourseId?.collegeId?.name || "—",
    course_name: student.collegeCourseId?.courseId?.name || "—",
    department_id: String(student.departmentId?._id || student.departmentId || ""),
    department_name: student.departmentId?.name || "—",
    semester_no: student.semesterNo || "",
    academic_year: student.academicYear || "",
    enrollment_date: student.enrollmentDate
      ? new Date(student.enrollmentDate).toISOString().slice(0, 10)
      : "",
    profile_image_url: student.profileImageUrl || "",
  };
}

async function studentCollegeCourseIsAllowed(req, collegeCourseId) {
  if (!mongoose.isValidObjectId(collegeCourseId)) return false;
  const filter = { _id: collegeCourseId, archivedAt: null };
  if (isCollegeAdmin(req)) filter.collegeId = req.session.user.collegeId;
  const collegeCourse = await CollegeCourse.findOne(filter)
    .populate({ path: "collegeId", match: { archivedAt: null } })
    .populate({ path: "courseId", match: { archivedAt: null } });
  return Boolean(collegeCourse?.collegeId && collegeCourse.courseId);
}

router.get("/students", async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const search = String(req.query.q || "").trim().slice(0, 100);
    const collegeId = String(req.query.college || "");
    const courseId = String(req.query.course || "");
    const semesterNo = String(req.query.semester || "");
    const filter = { archivedAt: null };
    const conditions = [];
    if (search) {
      const expression = new RegExp(
        search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
      conditions.push({
        $or: [
          { name: expression },
          { email: expression },
          { studentId: expression },
        ],
      });
    }
    if (isCollegeAdmin(req)) {
      const allowedCollegeCourses = await CollegeCourse.find({
        collegeId: req.session.user.collegeId,
      }).distinct("_id");
      conditions.push({ collegeCourseId: { $in: allowedCollegeCourses } });
    }
    if (collegeId && mongoose.isValidObjectId(collegeId)) {
      const ids = await CollegeCourse.find({ collegeId }).distinct("_id");
      conditions.push({ collegeCourseId: { $in: ids } });
    }
    if (courseId && mongoose.isValidObjectId(courseId)) {
      const ids = await CollegeCourse.find({ courseId }).distinct("_id");
      conditions.push({ collegeCourseId: { $in: ids } });
    }
    if (/^\d+$/.test(semesterNo)) {
      conditions.push({ semesterNo: Number(semesterNo) });
    }
    if (conditions.length) filter.$and = conditions;

    const [total, docs, collegeCourses] = await Promise.all([
      Student.countDocuments(filter),
      Student.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * 15)
        .limit(15)
        .populate({
          path: "collegeCourseId",
          populate: [{ path: "courseId" }, { path: "collegeId" }],
        })
        .populate("departmentId")
        .lean(),
      getStudentCollegeCourses(req),
    ]);
    const students = docs.map(normalizeStudent);
    const options = collegeCourses
      .filter((item) => item.collegeId && item.courseId)
      .map((item) => ({
        college_course_id: String(item._id),
        college_id: String(item.collegeId._id),
        college_name: item.collegeId.name,
        course_id: String(item.courseId._id),
        course_name: item.courseId.name,
      }));
    res.render("admin/students", {
      title: "Manage Students",
      students,
      options,
      filters: { search, collegeId, courseId, semesterNo },
      pagination: {
        page,
        pages: Math.max(1, Math.ceil(total / 15)),
        total,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get("/students/new", async (req, res, next) => {
  try {
    const collegeCourses = await getStudentCollegeCourses(req);
    const departments = await Department.find({
      archivedAt: null,
      ...(isCollegeAdmin(req) ? { collegeId: req.session.user.collegeId } : {}),
    }).sort("name");
    res.render("admin/student-form", {
      title: "Add Student",
      student: null,
      collegeCourses: collegeCourses.filter((item) => item.collegeId && item.courseId),
      departments,
    });
  } catch (e) {
    next(e);
  }
});

router.get("/students/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).render("error", {
        title: "Student not found",
        message: "The student profile could not be found.",
      });
    }
    const student = await Student.findOne({
      _id: req.params.id,
      archivedAt: null,
      ...(isCollegeAdmin(req)
        ? {
            collegeCourseId: {
              $in: await CollegeCourse.find({
                collegeId: req.session.user.collegeId,
              }).distinct("_id"),
            },
          }
        : {}),
    })
      .populate({
        path: "collegeCourseId",
        populate: [{ path: "courseId" }, { path: "collegeId" }],
      })
      .populate("departmentId");
    if (!student) {
      return res.status(404).render("error", {
        title: "Student not found",
        message: "The student profile could not be found.",
      });
    }
    res.render("admin/student-detail", {
      title: student.name,
      student: normalizeStudent(student),
    });
  } catch (e) {
    next(e);
  }
});

router.get("/students/:id/edit", async (req, res, next) => {
  try {
    const student = await Student.findOne({
      _id: req.params.id,
      archivedAt: null,
      ...(isCollegeAdmin(req)
        ? {
            collegeCourseId: {
              $in: await CollegeCourse.find({
                collegeId: req.session.user.collegeId,
              }).distinct("_id"),
            },
          }
        : {}),
    })
      .populate({
        path: "collegeCourseId",
        populate: [{ path: "courseId" }, { path: "collegeId" }],
      })
      .populate("departmentId");
    if (!student) {
      return res.status(404).render("error", {
        title: "Student not found",
        message: "The student profile could not be found.",
      });
    }
    const collegeCourses = await getStudentCollegeCourses(req);
    const departments = await Department.find({
      archivedAt: null,
      ...(isCollegeAdmin(req) ? { collegeId: req.session.user.collegeId } : {}),
    }).sort("name");
    res.render("admin/student-form", {
      title: "Edit Student",
      student: normalizeStudent(student),
      collegeCourses: collegeCourses.filter((item) => item.collegeId && item.courseId),
      departments,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/students", async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    const collegeCourseId = String(req.body.college_course_id || "");
    const phone = String(req.body.phone || "").trim();
    const studentId = String(req.body.student_id || "").trim();
    const departmentId = String(req.body.department_id || "");
    const semesterNo = req.body.semester_no
      ? Number(req.body.semester_no)
      : undefined;
    const academicYear = String(req.body.academic_year || "").trim();
    const enrollmentDate = req.body.enrollment_date
      ? new Date(req.body.enrollment_date)
      : new Date();
    const profileImageUrl = String(req.body.profile_image_url || "").trim();
    if (
      !name ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      !/^[A-Za-z0-9._-]{3,40}$/.test(username) ||
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72 ||
      !(await studentCollegeCourseIsAllowed(req, collegeCourseId)) ||
      (departmentId && !mongoose.isValidObjectId(departmentId)) ||
      (semesterNo !== undefined &&
        (!Number.isInteger(semesterNo) || semesterNo < 1)) ||
      Number.isNaN(enrollmentDate.getTime())
    ) {
      req.session.flash = {
        type: "error",
        message: "Enter valid student details and an 8–72 byte password with a valid username.",
      };
      return res.redirect("/admin/students/new");
    }
    if (
      (await Student.findOne({ email })) ||
      (studentId && (await Student.findOne({ studentId }))) ||
      (await StudentLogin.findOne({ username }))
    ) {
      req.session.flash = {
        type: "error",
        message: "The email, student ID, or username is already in use.",
      };
      return res.redirect("/admin/students/new");
    }
    if (departmentId) {
      const department = await Department.findOne({
        _id: departmentId,
        archivedAt: null,
      });
      const courseLink = await CollegeCourse.findById(collegeCourseId);
      if (!department || String(department.collegeId) !== String(courseLink.collegeId)) {
        req.session.flash = {
          type: "error",
          message: "Select a department belonging to the chosen college.",
        };
        return res.redirect("/admin/students/new");
      }
    }
    const student = await Student.create({
      collegeCourseId,
      name,
      email,
      studentId: studentId || undefined,
      phone,
      departmentId: departmentId || null,
      semesterNo,
      academicYear,
      enrollmentDate,
      profileImageUrl,
    });
    try {
      await StudentLogin.create({
        studentId: student._id,
        username,
        passwordHash: await bcrypt.hash(password, 12),
      });
    } catch (e) {
      await Student.findByIdAndDelete(student._id);
      throw e;
    }
    const collegeCourse = await CollegeCourse.findById(collegeCourseId);
    await recordManagement(
      req,
      "created",
      "STUDENT",
      student,
      collegeCourse.collegeId,
    );
    req.session.flash = {
      type: "success",
      message: "Student profile and login account created.",
    };
    res.redirect("/admin/students");
  } catch (e) {
    if (e.code === 11000) {
      req.session.flash = {
        type: "error",
        message: "The email, student ID, or username is already in use.",
      };
      return res.redirect("/admin/students/new");
    }
    next(e);
  }
});

router.post("/students/:id/update", async (req, res, next) => {
  try {
    const collegeCourseId = String(req.body.college_course_id || "");
    const departmentId = String(req.body.department_id || "");
    const semesterNo = req.body.semester_no
      ? Number(req.body.semester_no)
      : undefined;
    const enrollmentDate = req.body.enrollment_date
      ? new Date(req.body.enrollment_date)
      : undefined;
    const studentId = String(req.body.student_id || "").trim();
    const updates = {
      name: String(req.body.name || "").trim(),
      email: String(req.body.email || "").trim().toLowerCase(),
      phone: String(req.body.phone || "").trim(),
      departmentId: departmentId || null,
      semesterNo,
      academicYear: String(req.body.academic_year || "").trim(),
      profileImageUrl: String(req.body.profile_image_url || "").trim(),
    };
    if (
      !mongoose.isValidObjectId(req.params.id) ||
      !updates.name ||
      !/^\S+@\S+\.\S+$/.test(updates.email) ||
      !(await studentCollegeCourseIsAllowed(req, collegeCourseId)) ||
      (semesterNo !== undefined &&
        (!Number.isInteger(semesterNo) || semesterNo < 1)) ||
      (departmentId && !mongoose.isValidObjectId(departmentId)) ||
      (enrollmentDate && Number.isNaN(enrollmentDate.getTime()))
    ) {
      req.session.flash = { type: "error", message: "Enter valid student details." };
      return res.redirect(`/admin/students/${req.params.id}/edit`);
    }
    if (enrollmentDate) updates.enrollmentDate = enrollmentDate;
    updates.collegeCourseId = collegeCourseId;
    const updateOperation = { $set: updates };
    const unsetFields = {};
    if (studentId) updateOperation.$set.studentId = studentId;
    else unsetFields.studentId = 1;
    if (semesterNo === undefined) unsetFields.semesterNo = 1;
    if (Object.keys(unsetFields).length) updateOperation.$unset = unsetFields;
    if (departmentId) {
      const department = await Department.findOne({
        _id: departmentId,
        archivedAt: null,
      });
      const courseLink = await CollegeCourse.findById(collegeCourseId);
      if (!department || String(department.collegeId) !== String(courseLink.collegeId)) {
        req.session.flash = {
          type: "error",
          message: "Select a department belonging to the chosen college.",
        };
        return res.redirect(`/admin/students/${req.params.id}/edit`);
      }
    }
    const filter = { _id: req.params.id, archivedAt: null };
    if (isCollegeAdmin(req)) {
      filter.collegeCourseId = {
        $in: await CollegeCourse.find({
          collegeId: req.session.user.collegeId,
        }).distinct("_id"),
      };
    }
    const student = await Student.findOneAndUpdate(filter, updateOperation, {
      new: true,
      runValidators: true,
    });
    if (!student) {
      return res.status(404).render("error", {
        title: "Student not found",
        message: "The student profile could not be found.",
      });
    }
    const collegeCourse = await CollegeCourse.findById(collegeCourseId);
    await recordManagement(req, "updated", "STUDENT", student, collegeCourse.collegeId);
    req.session.flash = { type: "success", message: "Student profile updated." };
    res.redirect(`/admin/students/${student._id}`);
  } catch (e) {
    if (e.code === 11000) {
      req.session.flash = {
        type: "error",
        message: "The email or student ID is already in use.",
      };
      return res.redirect(`/admin/students/${req.params.id}/edit`);
    }
    next(e);
  }
});

router.post("/students/:id/archive", async (req, res, next) => {
  try {
    const filter = { _id: req.params.id, archivedAt: null };
    if (isCollegeAdmin(req)) {
      filter.collegeCourseId = {
        $in: await CollegeCourse.find({
          collegeId: req.session.user.collegeId,
        }).distinct("_id"),
      };
    }
    const student = await Student.findOneAndUpdate(
      filter,
      { status: "INACTIVE", archivedAt: new Date() },
      { new: true },
    );
    if (!student) {
      return res.status(404).render("error", {
        title: "Student not found",
        message: "The student profile could not be found.",
      });
    }
    await StudentLogin.updateOne(
      { studentId: student._id },
      { $set: { status: "DISABLED" } },
    );
    const collegeCourse = await CollegeCourse.findById(student.collegeCourseId);
    await recordManagement(req, "archived", "STUDENT", student, collegeCourse?.collegeId);
    req.session.flash = {
      type: "success",
      message: "Student archived and login disabled. Academic history was preserved.",
    };
    res.redirect("/admin/students");
  } catch (e) {
    next(e);
  }
});
function normalizeTeacher(teacher) {
  return {
    teacher_id: String(teacher._id),
    custom_teacher_id: teacher.teacherId || "",
    name: teacher.name,
    email: teacher.email,
    phone: teacher.phone || "",
    status: teacher.status,
    college_id: String(teacher.collegeId?._id || teacher.collegeId || ""),
    college_name: teacher.collegeId?.name || "—",
    department_id: String(teacher.departmentId?._id || teacher.departmentId || ""),
    department_name: teacher.departmentId?.name || "—",
    specialization: teacher.specialization || "",
    designation: teacher.designation || "",
    profile_image_url: teacher.profileImageUrl || "",
    skills: (teacher.skills || []).join(", "),
    assigned_course_ids: (teacher.assignedCourseIds || []).map((id) =>
      String(id?._id || id),
    ),
    assigned_courses: (teacher.assignedCourseIds || []).map(
      (course) => course.name || String(course),
    ),
  };
}

async function getTeacherFormOptions(req, collegeId) {
  const collegeFilter = { archivedAt: null };
  if (isCollegeAdmin(req)) collegeFilter._id = req.session.user.collegeId;
  if (collegeId && mongoose.isValidObjectId(collegeId)) {
    collegeFilter._id = collegeId;
  }
  const courseFilter = { archivedAt: null };
  if (isCollegeAdmin(req)) {
    courseFilter._id = {
      $in: await CollegeCourse.find({
        collegeId: req.session.user.collegeId,
      }).distinct("courseId"),
    };
  }
  const [colleges, departments, courses] = await Promise.all([
    College.find(collegeFilter).sort("name"),
    Department.find({
      archivedAt: null,
      ...(collegeId ? { collegeId } : {}),
      ...(isCollegeAdmin(req) ? { collegeId: req.session.user.collegeId } : {}),
    }).sort("name"),
    Course.find(courseFilter).sort("name"),
  ]);
  return { colleges, departments, courses };
}

router.get("/teachers", async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const search = String(req.query.q || "").trim().slice(0, 100);
    const collegeId = String(req.query.college || "");
    const departmentId = String(req.query.department || "");
    const filter = { archivedAt: null };
    if (isCollegeAdmin(req)) filter.collegeId = req.session.user.collegeId;
    if (collegeId && mongoose.isValidObjectId(collegeId) && !isCollegeAdmin(req)) {
      filter.collegeId = collegeId;
    }
    if (departmentId && mongoose.isValidObjectId(departmentId)) {
      filter.departmentId = departmentId;
    }
    if (search) {
      const expression = new RegExp(
        search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
      filter.$or = [
        { name: expression },
        { email: expression },
        { teacherId: expression },
      ];
    }
    const [total, docs, options] = await Promise.all([
      Teacher.countDocuments(filter),
      Teacher.find(filter)
        .sort("name")
        .skip((page - 1) * 15)
        .limit(15)
        .populate("collegeId")
        .populate("departmentId")
        .lean(),
      getTeacherFormOptions(req, collegeId),
    ]);
    res.render("admin/teachers", {
      title: "Manage Teachers",
      teachers: docs.map(normalizeTeacher),
      colleges: options.colleges,
      departments: options.departments,
      filters: { search, collegeId, departmentId },
      pagination: {
        page,
        pages: Math.max(1, Math.ceil(total / 15)),
        total,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get("/teachers/new", async (req, res, next) => {
  try {
    const { colleges, departments, courses } = await getTeacherFormOptions(req);
    res.render("admin/teacher-form", {
      title: "Add Teacher",
      teacher: null,
      colleges,
      departments,
      courses,
    });
  } catch (e) {
    next(e);
  }
});

router.get("/teachers/:id", async (req, res, next) => {
  try {
    const filter = { _id: req.params.id, archivedAt: null };
    if (isCollegeAdmin(req)) filter.collegeId = req.session.user.collegeId;
    const teacher = await Teacher.findOne(filter)
      .populate("collegeId")
      .populate("departmentId")
      .populate("assignedCourseIds")
      .lean();
    if (!teacher) {
      return res.status(404).render("error", {
        title: "Teacher not found",
        message: "The teacher profile could not be found.",
      });
    }
    res.render("admin/teacher-detail", {
      title: teacher.name,
      teacher: normalizeTeacher(teacher),
    });
  } catch (e) {
    next(e);
  }
});

router.get("/teachers/:id/edit", async (req, res, next) => {
  try {
    const filter = { _id: req.params.id, archivedAt: null };
    if (isCollegeAdmin(req)) filter.collegeId = req.session.user.collegeId;
    const teacher = await Teacher.findOne(filter)
      .populate("collegeId")
      .populate("departmentId")
      .populate("assignedCourseIds")
      .lean();
    if (!teacher) {
      return res.status(404).render("error", {
        title: "Teacher not found",
        message: "The teacher profile could not be found.",
      });
    }
    const { colleges, departments, courses } = await getTeacherFormOptions(
      req,
      String(teacher.collegeId?._id || teacher.collegeId),
    );
    res.render("admin/teacher-form", {
      title: "Edit Teacher",
      teacher: normalizeTeacher(teacher),
      colleges,
      departments,
      courses,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/teachers", async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim(),
      email = String(req.body.email || "")
        .trim()
        .toLowerCase(),
      username = String(req.body.username || "").trim(),
      password = String(req.body.password || ""),
      collegeId = isCollegeAdmin(req)
        ? req.session.user.collegeId
        : String(req.body.college_id || ""),
      teacherId = String(req.body.teacher_id || "").trim(),
      phone = String(req.body.phone || "").trim(),
      departmentId = String(req.body.department_id || ""),
      specialization = String(req.body.specialization || "").trim(),
      designation = String(req.body.designation || "").trim(),
      profileImageUrl = String(req.body.profile_image_url || "").trim(),
      skills = String(req.body.skills || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      assignedCourseIds = (Array.isArray(req.body.course_ids)
        ? req.body.course_ids
        : req.body.course_ids
          ? [req.body.course_ids]
          : []
      ).map(String);
    if (
      !name ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      !/^[A-Za-z0-9._-]{3,40}$/.test(username) ||
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72 ||
      !mongoose.isValidObjectId(collegeId) ||
      (departmentId && !mongoose.isValidObjectId(departmentId)) ||
      assignedCourseIds.some((id) => !mongoose.isValidObjectId(id))
    ) {
      req.session.flash = {
        type: "error",
        message: "Enter valid teacher details and an 8–72 byte password with a valid username.",
      };
      return res.redirect("/admin/teachers");
    }
    if (
      (await Teacher.findOne({ email })) ||
      (teacherId && (await Teacher.findOne({ teacherId }))) ||
      (await TeacherLogin.findOne({ username }))
    ) {
      req.session.flash = {
        type: "error",
        message: "The email or username is already in use.",
      };
      return res.redirect("/admin/teachers");
    }
    const college = await College.findOne({
      _id: collegeId,
      archivedAt: null,
    });
    const department = departmentId
      ? await Department.findOne({ _id: departmentId, archivedAt: null })
      : null;
    const linkedCourseIds = await CollegeCourse.find({
      collegeId,
      courseId: { $in: assignedCourseIds },
    }).distinct("courseId");
    const validCourses = await Course.find({
      _id: { $in: linkedCourseIds },
      archivedAt: null,
    }).distinct("_id");
    if (
      !college ||
      (department &&
        String(department.collegeId) !== String(collegeId)) ||
      validCourses.length !== assignedCourseIds.length
    ) {
      req.session.flash = {
        type: "error",
        message: "Select a valid college, department, and set of courses.",
      };
      return res.redirect("/admin/teachers");
    }
    const teacher = await Teacher.create({
      collegeId,
      name,
      email,
      teacherId: teacherId || undefined,
      phone,
      departmentId: departmentId || null,
      specialization,
      designation,
      profileImageUrl,
      skills,
      assignedCourseIds,
    });
    try {
      await TeacherLogin.create({
        teacherId: teacher._id,
        username,
        passwordHash: await bcrypt.hash(password, 12),
      });
    } catch (e) {
      await Teacher.findByIdAndDelete(teacher._id);
      throw e;
    }
    await recordManagement(req, "created", "TEACHER", teacher, collegeId);
    req.session.flash = {
      type: "success",
      message: "Teacher and login accounts have been created.",
    };
    res.redirect("/admin/teachers");
  } catch (e) {
    if (e.code === 11000) {
      req.session.flash = {
        type: "error",
        message: "The email or username is already in use.",
      };
      return res.redirect("/admin/teachers");
    }
    next(e);
  }
});

router.post("/teachers/:id/update", async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const teacherId = String(req.body.teacher_id || "").trim();
    const phone = String(req.body.phone || "").trim();
    const departmentId = String(req.body.department_id || "");
    const specialization = String(req.body.specialization || "").trim();
    const designation = String(req.body.designation || "").trim();
    const profileImageUrl = String(req.body.profile_image_url || "").trim();
    const skills = String(req.body.skills || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const assignedCourseIds = (Array.isArray(req.body.course_ids)
      ? req.body.course_ids
      : req.body.course_ids
        ? [req.body.course_ids]
        : []
    ).map(String);
    if (
      !mongoose.isValidObjectId(req.params.id) ||
      !name ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      (departmentId && !mongoose.isValidObjectId(departmentId)) ||
      assignedCourseIds.some((id) => !mongoose.isValidObjectId(id))
    ) {
      req.session.flash = { type: "error", message: "Enter valid teacher details." };
      return res.redirect(`/admin/teachers/${req.params.id}/edit`);
    }
    const filter = { _id: req.params.id, archivedAt: null };
    if (isCollegeAdmin(req)) filter.collegeId = req.session.user.collegeId;
    const existing = await Teacher.findOne(filter);
    if (!existing) {
      return res.status(404).render("error", {
        title: "Teacher not found",
        message: "The teacher profile could not be found.",
      });
    }
    const department = departmentId
      ? await Department.findOne({ _id: departmentId, archivedAt: null })
      : null;
    const linkedCourseIds = await CollegeCourse.find({
      collegeId: existing.collegeId,
      courseId: { $in: assignedCourseIds },
    }).distinct("courseId");
    const validCourses = await Course.find({
      _id: { $in: linkedCourseIds },
      archivedAt: null,
    }).distinct("_id");
    if (
      (department &&
        String(department.collegeId) !== String(existing.collegeId)) ||
      validCourses.length !== assignedCourseIds.length
    ) {
      req.session.flash = {
        type: "error",
        message: "Select a department belonging to the teacher's college and valid courses.",
      };
      return res.redirect(`/admin/teachers/${req.params.id}/edit`);
    }
    existing.name = name;
    existing.email = email;
    existing.teacherId = teacherId || undefined;
    existing.phone = phone;
    existing.departmentId = departmentId || null;
    existing.specialization = specialization;
    existing.designation = designation;
    existing.profileImageUrl = profileImageUrl;
    existing.skills = skills;
    existing.assignedCourseIds = assignedCourseIds;
    await existing.save();
    await recordManagement(req, "updated", "TEACHER", existing, existing.collegeId);
    req.session.flash = { type: "success", message: "Teacher profile updated." };
    res.redirect(`/admin/teachers/${existing._id}`);
  } catch (e) {
    if (e.code === 11000) {
      req.session.flash = { type: "error", message: "The email or teacher ID is already in use." };
      return res.redirect(`/admin/teachers/${req.params.id}/edit`);
    }
    next(e);
  }
});

router.post("/teachers/:id/archive", async (req, res, next) => {
  try {
    const filter = { _id: req.params.id, archivedAt: null };
    if (isCollegeAdmin(req)) filter.collegeId = req.session.user.collegeId;
    const teacher = await Teacher.findOneAndUpdate(
      filter,
      { status: "INACTIVE", archivedAt: new Date() },
      { new: true },
    );
    if (!teacher) {
      return res.status(404).render("error", {
        title: "Teacher not found",
        message: "The teacher profile could not be found.",
      });
    }
    await TeacherLogin.updateOne(
      { teacherId: teacher._id },
      { $set: { status: "DISABLED" } },
    );
    await recordManagement(req, "archived", "TEACHER", teacher, teacher.collegeId);
    req.session.flash = {
      type: "success",
      message: "Teacher archived and login disabled. Academic history was preserved.",
    };
    res.redirect("/admin/teachers");
  } catch (e) {
    next(e);
  }
});
router.get("/assignments", async (req, res, next) => {
  try {
    const filter = {};
    if (isCollegeAdmin(req)) {
      filter.teacherId = {
        $in: await Teacher.find({
          collegeId: req.session.user.collegeId,
          archivedAt: null,
        }).distinct("_id"),
      };
    }
    const docs = await TeachingAssignment.find(filter)
      .sort({ createdAt: -1 })
      .populate("teacherId")
      .populate({
        path: "semesterSubjectId",
        populate: [
          { path: "subjectId" },
          {
            path: "semesterId",
            populate: {
              path: "collegeCourseId",
              populate: { path: "collegeId" },
            },
          },
        ],
      });
    const assignments = docs.map((a) => ({
      assignment_id: String(a._id),
      status: a.status,
      teacher_name: a.teacherId?.name || "—",
      subject_name: a.semesterSubjectId?.subjectId?.name || "—",
      code: a.semesterSubjectId?.subjectId?.code || "—",
      semester_no: a.semesterSubjectId?.semesterId?.semesterNo || "—",
      college_name:
        a.semesterSubjectId?.semesterId?.collegeCourseId?.collegeId?.name ||
        "—",
    }));
    res.render("admin/assignments", {
      title: "Teaching Assignments",
      assignments,
    });
  } catch (e) {
    next(e);
  }
});
router.post("/assignments/:id/decision", async (req, res, next) => {
  try {
    const status = String(req.body.status || "");
    if (!["APPROVED", "REJECTED"].includes(status)) {
      req.session.flash = { type: "error", message: "Invalid decision." };
      return res.redirect("/admin/assignments");
    }
    if (isCollegeAdmin(req)) {
      const assignment = await TeachingAssignment.findById(req.params.id)
        .populate("teacherId")
        .select("teacherId");
      if (
        !assignment ||
        String(assignment.teacherId?.collegeId) !==
          String(req.session.user.collegeId)
      ) {
        return res.status(404).render("error", {
          title: "Assignment not found",
          message: "The teaching assignment could not be found in your college.",
        });
      }
    }
    const doc = await TeachingAssignment.findByIdAndUpdate(
      req.params.id,
      { status, approvedByAdminId: req.session.user.id },
      { new: true },
    );
    if (!doc)
      return res
        .status(404)
        .render("error", {
          title: "Not found",
          message: "Assignment not found.",
        });
    const teacher = await Teacher.findById(doc.teacherId).select("collegeId");
    await recordManagement(
      req,
      status.toLowerCase(),
      "ASSIGNMENT",
      doc,
      teacher?.collegeId,
      `Teaching assignment ${status.toLowerCase()}`,
    );
    req.session.flash = {
      type: "success",
      message: `Assignment ${status.toLowerCase()} successfully.`,
    };
    res.redirect("/admin/assignments");
  } catch (e) {
    next(e);
  }
});
router.get("/academic-structure", requireSuperAdmin, async (req, res, next) => {
  try {
    const [
      universities,
      colleges,
      courses,
      semesters,
      subjects,
      students,
      teachers,
    ] = await Promise.all([
      University.countDocuments(),
      College.countDocuments(),
      Course.countDocuments(),
      Semester.countDocuments(),
      Subject.countDocuments(),
      Student.countDocuments(),
      Teacher.countDocuments(),
    ]);
    res.render("admin/academic-structure", {
      title: "Academic Structure",
      stats: {
        universities,
        colleges,
        courses,
        semesters,
        subjects,
        students,
        teachers,
      },
    });
  } catch (e) {
    next(e);
  }
});
// -------------------------------------------------------------
// 1. ADMIN USERS MANAGEMENT (SUPER_ADMIN ONLY)
// -------------------------------------------------------------
router.get("/admins", requireSuperAdmin, async (req, res, next) => {
  try {
    const admins = await Admin.find().populate("collegeId").sort({ createdAt: -1 });
    const colleges = await College.find({ archivedAt: null }).select("name");
    res.render("admin/admins", {
      title: "Administrators",
      admins,
      colleges,
      currentUser: req.session.user,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/admins", requireSuperAdmin, async (req, res, next) => {
  try {
    const { name, email, role, collegeId, password } = req.body;
    if (!name || !email || !password || !role) {
      req.session.flash = { type: "error", message: "Name, email, role, and password are required." };
      return res.redirect("/admin/admins");
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const existing = await Admin.findOne({ email: cleanEmail });
    if (existing) {
      req.session.flash = { type: "error", message: "An admin with this email already exists." };
      return res.redirect("/admin/admins");
    }

    const admin = await Admin.create({
      name: String(name).trim(),
      email: cleanEmail,
      role: role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "COLLEGE_ADMIN",
      collegeId: role === "COLLEGE_ADMIN" && mongoose.isValidObjectId(collegeId) ? collegeId : null,
    });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await AdminLogin.create({
      adminId: admin._id,
      username: cleanEmail,
      passwordHash,
      status: "ACTIVE",
    });

    await recordManagement(req, "created", "ADMIN", admin, admin.collegeId, `Admin: ${admin.name}`);

    req.session.flash = { type: "success", message: `Admin account for ${admin.name} created successfully!` };
    res.redirect("/admin/admins");
  } catch (e) {
    next(e);
  }
});

router.post("/admins/:id/status", requireSuperAdmin, async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) {
      req.session.flash = { type: "error", message: "Admin not found." };
      return res.redirect("/admin/admins");
    }

    const newStatus = admin.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const loginStatus = newStatus === "ACTIVE" ? "ACTIVE" : "DISABLED";
    admin.status = newStatus;
    await admin.save();

    await AdminLogin.updateOne({ adminId: admin._id }, { status: loginStatus });
    await recordManagement(req, `status_${newStatus.toLowerCase()}`, "ADMIN", admin, admin.collegeId, `Admin ${admin.name} status`);

    req.session.flash = { type: "success", message: `Admin account status changed to ${newStatus}.` };
    res.redirect("/admin/admins");
  } catch (e) {
    next(e);
  }
});

// -------------------------------------------------------------
// 2. REPORTS & DATA EXPORTS (EXCEL & PDF)
// -------------------------------------------------------------
router.get("/reports", async (req, res, next) => {
  try {
    const [courses, colleges] = await Promise.all([
      Course.find({ archivedAt: null }).select("name code"),
      College.find({ archivedAt: null }).select("name"),
    ]);

    const [totalStudents, totalAttendance, totalFees, totalGrades] = await Promise.all([
      Student.countDocuments({ archivedAt: null }),
      Attendance.countDocuments(),
      FeeRecord.aggregate([{ $group: { _id: null, total: { $sum: "$totalAmount" }, paid: { $sum: "$paidAmount" } } }]),
      Grade.countDocuments(),
    ]);

    const feeAgg = totalFees[0] || { total: 0, paid: 0 };

    res.render("admin/reports", {
      title: "Reports & Analytics",
      courses,
      colleges,
      stats: {
        totalStudents,
        totalAttendance,
        totalFees: feeAgg.total,
        paidFees: feeAgg.paid,
        outstandingFees: Math.max(0, feeAgg.total - feeAgg.paid),
        totalGrades,
      },
      currentUser: req.session.user,
    });
  } catch (e) {
    next(e);
  }
});

// Export Students (Excel)
router.get("/reports/students/excel", async (req, res, next) => {
  try {
    const query = { archivedAt: null };
    if (req.query.status) query.status = req.query.status;

    const students = await Student.find(query)
      .populate({
        path: "collegeCourseId",
        populate: [{ path: "courseId" }, { path: "collegeId" }],
      })
      .populate("departmentId")
      .sort({ name: 1 });

    const columns = [
      { header: "Student ID", key: "studentId", width: 16 },
      { header: "Name", key: "name", width: 25 },
      { header: "Email", key: "email", width: 30 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Course", key: "course", width: 25 },
      { header: "College", key: "college", width: 25 },
      { header: "Status", key: "status", width: 12 },
    ];

    const rows = students.map((s) => ({
      studentId: s.studentId || "-",
      name: s.name,
      email: s.email,
      phone: s.phone || "-",
      course: s.collegeCourseId?.courseId?.name || "Unassigned",
      college: s.collegeCourseId?.collegeId?.name || "Unassigned",
      status: s.status,
    }));

    const buffer = await generateExcel({ title: "Students Report", columns, rows });
    res.setHeader("Content-Disposition", 'attachment; filename="students-report.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});

// Export Students (PDF)
router.get("/reports/students/pdf", async (req, res, next) => {
  try {
    const students = await Student.find({ archivedAt: null })
      .populate({
        path: "collegeCourseId",
        populate: { path: "courseId" },
      })
      .limit(200);

    const headers = ["ID", "Name", "Email", "Course", "Status"];
    const rows = students.map((s) => [
      s.studentId || "-",
      s.name,
      s.email,
      s.collegeCourseId?.courseId?.name || "-",
      s.status,
    ]);

    const buffer = await generatePDF({ title: "Student Roster Report", headers, rows });
    res.setHeader("Content-Disposition", 'attachment; filename="students-report.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});

// Export Attendance (Excel)
router.get("/reports/attendance/excel", async (req, res, next) => {
  try {
    const records = await Attendance.find()
      .populate("studentId", "name studentId email")
      .populate({ path: "semesterSubjectId", populate: { path: "subjectId" } })
      .sort({ date: -1 })
      .limit(500);

    const columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Student", key: "student", width: 25 },
      { header: "Student ID", key: "studentId", width: 16 },
      { header: "Subject", key: "subject", width: 25 },
      { header: "Status", key: "status", width: 14 },
      { header: "Remarks", key: "remarks", width: 20 },
    ];

    const rows = records.map((r) => ({
      date: new Date(r.date).toLocaleDateString(),
      student: r.studentId?.name || "-",
      studentId: r.studentId?.studentId || "-",
      subject: r.semesterSubjectId?.subjectId?.name || "General",
      status: r.status,
      remarks: r.remarks || "",
    }));

    const buffer = await generateExcel({ title: "Attendance Report", columns, rows });
    res.setHeader("Content-Disposition", 'attachment; filename="attendance-report.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});

// Export Attendance (PDF)
router.get("/reports/attendance/pdf", async (req, res, next) => {
  try {
    const records = await Attendance.find()
      .populate("studentId", "name studentId")
      .populate({ path: "semesterSubjectId", populate: { path: "subjectId" } })
      .sort({ date: -1 })
      .limit(200);

    const headers = ["Date", "Student", "Subject", "Status"];
    const rows = records.map((r) => [
      new Date(r.date).toLocaleDateString(),
      r.studentId?.name || "-",
      r.semesterSubjectId?.subjectId?.name || "-",
      r.status,
    ]);

    const buffer = await generatePDF({ title: "Attendance Summary Report", headers, rows });
    res.setHeader("Content-Disposition", 'attachment; filename="attendance-report.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});

// Export Fees (Excel)
router.get("/reports/fees/excel", async (req, res, next) => {
  try {
    const fees = await FeeRecord.find()
      .populate("studentId", "name studentId email")
      .populate("courseId", "name")
      .sort({ status: 1 });

    const columns = [
      { header: "Student", key: "student", width: 25 },
      { header: "Student ID", key: "studentId", width: 16 },
      { header: "Course", key: "course", width: 25 },
      { header: "Total Fee", key: "total", width: 15 },
      { header: "Paid", key: "paid", width: 15 },
      { header: "Balance", key: "balance", width: 15 },
      { header: "Status", key: "status", width: 14 },
    ];

    const rows = fees.map((f) => ({
      student: f.studentId?.name || "-",
      studentId: f.studentId?.studentId || "-",
      course: f.courseId?.name || "-",
      total: f.totalAmount,
      paid: f.paidAmount,
      balance: Math.max(0, f.totalAmount - f.paidAmount),
      status: f.status,
    }));

    const buffer = await generateExcel({ title: "Fees Report", columns, rows });
    res.setHeader("Content-Disposition", 'attachment; filename="fees-report.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});

// Export Fees (PDF)
router.get("/reports/fees/pdf", async (req, res, next) => {
  try {
    const fees = await FeeRecord.find()
      .populate("studentId", "name studentId")
      .populate("courseId", "name")
      .limit(200);

    const headers = ["Student", "Course", "Total", "Paid", "Status"];
    const rows = fees.map((f) => [
      f.studentId?.name || "-",
      f.courseId?.name || "-",
      `$${f.totalAmount}`,
      `$${f.paidAmount}`,
      f.status,
    ]);

    const buffer = await generatePDF({ title: "Course Fees & Collections Report", headers, rows });
    res.setHeader("Content-Disposition", 'attachment; filename="fees-report.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});

// Export Grades (Excel)
router.get("/reports/grades/excel", async (req, res, next) => {
  try {
    const grades = await Grade.find()
      .populate("studentId", "name studentId")
      .populate({ path: "semesterSubjectId", populate: { path: "subjectId" } })
      .sort({ createdAt: -1 })
      .limit(500);

    const columns = [
      { header: "Student", key: "student", width: 25 },
      { header: "Subject", key: "subject", width: 25 },
      { header: "Exam", key: "exam", width: 15 },
      { header: "Score", key: "score", width: 14 },
      { header: "Grade", key: "grade", width: 12 },
    ];

    const rows = grades.map((g) => ({
      student: g.studentId?.name || "-",
      subject: g.semesterSubjectId?.subjectId?.name || "-",
      exam: g.examType,
      score: `${g.marksObtained}/${g.maxMarks}`,
      grade: g.grade || "-",
    }));

    const buffer = await generateExcel({ title: "Grades Report", columns, rows });
    res.setHeader("Content-Disposition", 'attachment; filename="academic-grades-report.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});

// Export Grades (PDF)
router.get("/reports/grades/pdf", async (req, res, next) => {
  try {
    const grades = await Grade.find()
      .populate("studentId", "name")
      .populate({ path: "semesterSubjectId", populate: { path: "subjectId" } })
      .limit(200);

    const headers = ["Student", "Subject", "Exam", "Marks", "Grade"];
    const rows = grades.map((g) => [
      g.studentId?.name || "-",
      g.semesterSubjectId?.subjectId?.name || "-",
      g.examType,
      `${g.marksObtained}/${g.maxMarks}`,
      g.grade || "-",
    ]);

    const buffer = await generatePDF({ title: "Academic Examination Results", headers, rows });
    res.setHeader("Content-Disposition", 'attachment; filename="academic-grades-report.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});

// -------------------------------------------------------------
// 3. FEES MANAGEMENT
// -------------------------------------------------------------
router.get("/fees", async (req, res, next) => {
  try {
    const statusFilter = req.query.status;
    const query = {};
    if (statusFilter && ["PAID", "PARTIAL", "PENDING", "OVERDUE"].includes(statusFilter)) {
      query.status = statusFilter;
    }

    const fees = await FeeRecord.find(query)
      .populate({
        path: "studentId",
        select: "name email studentId phone",
      })
      .populate("courseId", "name code")
      .sort({ createdAt: -1 });

    const totalAgg = await FeeRecord.aggregate([
      { $group: { _id: null, total: { $sum: "$totalAmount" }, paid: { $sum: "$paidAmount" } } },
    ]);
    const feeTotals = totalAgg[0] || { total: 0, paid: 0 };

    res.render("admin/fees", {
      title: "Fee Management",
      fees,
      statusFilter: statusFilter || "ALL",
      stats: {
        total: feeTotals.total,
        paid: feeTotals.paid,
        outstanding: Math.max(0, feeTotals.total - feeTotals.paid),
      },
      currentUser: req.session.user,
    });
  } catch (e) {
    next(e);
  }
});

// Record Fee Payment
router.post("/fees/:id/payment", async (req, res, next) => {
  try {
    const { amount, paymentMethod, transactionRef, remarks } = req.body;
    const paymentAmount = Number(amount);

    if (!paymentAmount || paymentAmount <= 0) {
      req.session.flash = { type: "error", message: "Please enter a valid positive payment amount." };
      return res.redirect("/admin/fees");
    }

    const feeRecord = await FeeRecord.findById(req.params.id);
    if (!feeRecord) {
      req.session.flash = { type: "error", message: "Fee record not found." };
      return res.redirect("/admin/fees");
    }

    feeRecord.paidAmount += paymentAmount;
    if (feeRecord.paidAmount >= feeRecord.totalAmount) {
      feeRecord.status = "PAID";
    } else {
      feeRecord.status = "PARTIAL";
    }

    feeRecord.transactions.push({
      amount: paymentAmount,
      paymentMethod: paymentMethod || "ONLINE_RECEIPT",
      transactionRef: String(transactionRef || "").trim(),
      remarks: String(remarks || "").trim(),
      receivedByAdminId: req.session.user.id,
      paidAt: new Date(),
    });

    await feeRecord.save();

    // Notify student
    await Notification.create({
      recipientId: feeRecord.studentId,
      recipientRole: "STUDENT",
      title: "Fee Payment Recorded",
      message: `Payment of $${paymentAmount} received. Balance: $${Math.max(0, feeRecord.totalAmount - feeRecord.paidAmount)}.`,
      type: "FEE",
      link: "/student/fees",
    });

    await recordManagement(req, "payment_recorded", "FEE", feeRecord, feeRecord.collegeId, `Fee payment: $${paymentAmount}`);

    req.session.flash = { type: "success", message: `Payment of $${paymentAmount} recorded successfully!` };
    res.redirect("/admin/fees");
  } catch (e) {
    next(e);
  }
});

// -------------------------------------------------------------
// 4. ATTENDANCE OVERVIEW
// -------------------------------------------------------------
router.get("/attendance", async (req, res, next) => {
  try {
    const selectedDate = req.query.date || new Date().toISOString().slice(0, 10);
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const records = await Attendance.find({
      date: { $gte: startOfDay, $lte: endOfDay },
    })
      .populate("studentId", "name studentId email")
      .populate({ path: "semesterSubjectId", populate: { path: "subjectId" } })
      .populate("markedByTeacherId", "name")
      .sort({ createdAt: -1 });

    const totalCount = await Attendance.countDocuments();
    const presentCount = await Attendance.countDocuments({ status: { $in: ["PRESENT", "LATE"] } });
    const overallRate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 100;

    res.render("admin/attendance", {
      title: "Attendance Overview",
      records,
      selectedDate,
      stats: { totalCount, presentCount, overallRate },
      currentUser: req.session.user,
    });
  } catch (e) {
    next(e);
  }
});

// -------------------------------------------------------------
// 5. ACADEMIC SESSIONS / TERMS
// -------------------------------------------------------------
router.get("/sessions", requireSuperAdmin, async (req, res, next) => {
  try {
    const sessions = await AcademicSession.find().sort({ startDate: -1 });
    res.render("admin/sessions", {
      title: "Academic Sessions",
      sessions,
      currentUser: req.session.user,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/sessions", requireSuperAdmin, async (req, res, next) => {
  try {
    const { name, startDate, endDate, isCurrent } = req.body;
    if (!name || !startDate || !endDate) {
      req.session.flash = { type: "error", message: "Session name, start date, and end date are required." };
      return res.redirect("/admin/sessions");
    }

    if (isCurrent) {
      await AcademicSession.updateMany({}, { isCurrent: false });
    }

    const session = await AcademicSession.create({
      name: String(name).trim(),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      isCurrent: Boolean(isCurrent),
    });

    await recordManagement(req, "created", "SESSION", session, null, `Academic session: ${session.name}`);

    req.session.flash = { type: "success", message: `Academic session ${session.name} created!` };
    res.redirect("/admin/sessions");
  } catch (e) {
    next(e);
  }
});

router.post("/sessions/:id/current", requireSuperAdmin, async (req, res, next) => {
  try {
    await AcademicSession.updateMany({}, { isCurrent: false });
    await AcademicSession.findByIdAndUpdate(req.params.id, { isCurrent: true, status: "ACTIVE" });

    req.session.flash = { type: "success", message: "Active academic session updated!" };
    res.redirect("/admin/sessions");
  } catch (e) {
    next(e);
  }
});

// -------------------------------------------------------------
// 6. ANNOUNCEMENTS
// -------------------------------------------------------------
router.get("/announcements", async (req, res, next) => {
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 });
    res.render("admin/announcements", {
      title: "Announcements & Broadcasts",
      announcements,
      currentUser: req.session.user,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/announcements", async (req, res, next) => {
  try {
    const { title, content, targetRole } = req.body;
    if (!title || !content) {
      req.session.flash = { type: "error", message: "Title and content are required." };
      return res.redirect("/admin/announcements");
    }

    const announcement = await Announcement.create({
      title: String(title).trim(),
      content: String(content).trim(),
      authorId: req.session.user.id,
      authorRole: "ADMIN",
      authorName: req.session.user.name,
      targetRole: ["ALL", "STUDENT", "TEACHER"].includes(targetRole) ? targetRole : "ALL",
      collegeId: req.session.user.collegeId || null,
    });

    const { broadcastAnnouncement } = require("../services/socketService");
    broadcastAnnouncement(announcement);

    await recordManagement(req, "broadcast", "ANNOUNCEMENT", announcement, announcement.collegeId, `Announcement: ${announcement.title}`);

    req.session.flash = { type: "success", message: "Announcement broadcasted successfully!" };
    res.redirect("/admin/announcements");
  } catch (e) {
    next(e);
  }
});

router.post("/announcements/:id/delete", async (req, res, next) => {
  try {
    await Announcement.findByIdAndDelete(req.params.id);
    req.session.flash = { type: "success", message: "Announcement deleted." };
    res.redirect("/admin/announcements");
  } catch (e) {
    next(e);
  }
});

// -------------------------------------------------------------
// 7. DETAILED ACTIVITY LOGS
// -------------------------------------------------------------
router.get("/activity", async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;

    const [managementLogs, loginLogs, totalManagement, totalLogins] = await Promise.all([
      ManagementActivity.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("actorId", "name email"),
      LoginActivity.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      ManagementActivity.countDocuments(),
      LoginActivity.countDocuments(),
    ]);

    res.render("admin/activity", {
      title: "System Activity Logs",
      managementLogs,
      loginLogs,
      page,
      totalPages: Math.ceil(Math.max(totalManagement, totalLogins) / limit),
      currentUser: req.session.user,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

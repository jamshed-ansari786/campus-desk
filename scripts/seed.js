require("dotenv").config();
const bcrypt = require("bcryptjs");
const { connectDB, mongoose } = require("../config/db");
const M = require("../models");
async function seed() {
  await connectDB();
  const universities = [
    {
      name: "University of Delhi",
      slug: "university-of-delhi",
      officialWebsite: "https://www.du.ac.in/",
      city: "Delhi",
      state: "Delhi (NCT)",
      description: "A university based in Delhi, India.",
      logoUrl: "https://www.du.ac.in/uploads/du/images/logo-du.png",
      sources: [
        "https://www.du.ac.in/index.php?page=about-du-2",
        "https://www.du.ac.in/index.php?page=syllabi",
      ],
      programs: [],
    },
    {
      name: "Banaras Hindu University",
      slug: "banaras-hindu-university",
      officialWebsite: "https://www.bhu.ac.in/",
      city: "Varanasi",
      state: "Uttar Pradesh",
      description: "A university based in Varanasi, Uttar Pradesh, India.",
      logoUrl: "https://www.bhu.ac.in/Scripts/SitesBhu/images/logo.png",
      sources: ["https://www.bhu.ac.in/Site/Home/1_2_16_Main-Site"],
      programs: [],
    },
    {
      name: "Jawaharlal Nehru University",
      slug: "jawaharlal-nehru-university",
      officialWebsite: "https://www.jnu.ac.in/",
      city: "New Delhi",
      state: "Delhi (NCT)",
      description: "A university based in New Delhi, India.",
      sources: ["https://www.jnu.ac.in/", "https://www.jnu.ac.in/admissions"],
      programs: [],
    },
    {
      name: "Jamia Millia Islamia",
      slug: "jamia-millia-islamia",
      officialWebsite: "https://www.jmi.ac.in/",
      city: "New Delhi",
      state: "Delhi (NCT)",
      description: "A university based in New Delhi, India.",
      logoUrl: "https://www.jmi.ac.in/assets/images/logo/logo.svg",
      sources: [
        "https://www.jmi.ac.in/Contactus/Contact-Us",
        "https://www.jmi.ac.in/About-Jamia/Profile/About-JMI",
        "https://www.jmi.ac.in/academics",
      ],
      programs: [
        {
          name: "Undergraduate programmes",
          sourceUrl: "https://www.jmi.ac.in/About-Jamia/Profile/About-JMI",
        },
        {
          name: "Postgraduate programmes",
          sourceUrl: "https://www.jmi.ac.in/About-Jamia/Profile/About-JMI",
        },
        {
          name: "M.Phil. and Ph.D. programmes",
          sourceUrl: "https://www.jmi.ac.in/About-Jamia/Profile/About-JMI",
        },
        {
          name: "Diploma and certificate programmes",
          sourceUrl: "https://www.jmi.ac.in/About-Jamia/Profile/About-JMI",
        },
      ],
    },
    {
      name: "Aligarh Muslim University",
      slug: "aligarh-muslim-university",
      officialWebsite: "https://www.amu.ac.in/",
      city: "Aligarh",
      state: "Uttar Pradesh",
      description: "A university based in Aligarh, Uttar Pradesh, India.",
      sources: [
        "https://www.amu.ac.in/about-us/facts",
        "https://www.amu.ac.in/department-list",
      ],
      programs: [],
    },
    {
      name: "University of Mumbai",
      slug: "university-of-mumbai",
      officialWebsite: "https://mu.ac.in/",
      city: "Mumbai",
      state: "Maharashtra",
      description: "A university based in Mumbai, Maharashtra, India.",
      sources: [
        "https://mu.ac.in/",
        "https://www.mu.ac.in/about-us.php",
        "https://www.mu.ac.in/departments.php",
        "https://muugadmission.samarth.edu.in/",
      ],
      programs: [],
    },
    {
      name: "University of Calcutta",
      slug: "university-of-calcutta",
      officialWebsite: "https://www.caluniv.ac.in/",
      city: "Kolkata",
      state: "West Bengal",
      description: "A university based in Kolkata, West Bengal, India.",
      sources: [
        "https://www.caluniv.ac.in/",
        "https://www.caluniv.ac.in/about/about_university.html",
        "https://www.caluniv.ac.in/academic/academic.html",
      ],
      programs: [],
    },
    {
      name: "University of Allahabad",
      slug: "university-of-allahabad",
      officialWebsite: "https://www.allduniv.ac.in/",
      city: "Prayagraj",
      state: "Uttar Pradesh",
      description: "A university based in Prayagraj, Uttar Pradesh, India.",
      logoUrl: "https://www.allduniv.ac.in/assets/frontend/img/home/au_logo.png",
      sources: [
        "https://www.allduniv.ac.in/",
        "https://www.allduniv.ac.in/p/714/pg-admission-2026-2027",
      ],
      programs: [
        {
          name: "M.Tech (CSE/ECE)",
          sourceUrl: "https://www.allduniv.ac.in/p/714/pg-admission-2026-2027",
        },
        {
          name: "MBA",
          sourceUrl: "https://www.allduniv.ac.in/p/714/pg-admission-2026-2027",
        },
        {
          name: "M.A. (Ancient History)",
          sourceUrl: "https://www.allduniv.ac.in/p/714/pg-admission-2026-2027",
        },
        {
          name: "M.Sc. (Design and Innovation in Rural Technology)",
          sourceUrl: "https://www.allduniv.ac.in/p/714/pg-admission-2026-2027",
        },
        {
          name: "LL.B. (Hons.)",
          sourceUrl: "https://www.allduniv.ac.in/p/714/pg-admission-2026-2027",
        },
        {
          name: "LL.M.",
          sourceUrl: "https://www.allduniv.ac.in/p/714/pg-admission-2026-2027",
        },
      ],
    },
    {
      name: "Indira Gandhi National Open University",
      slug: "indira-gandhi-national-open-university",
      officialWebsite: "https://www.ignou.ac.in/",
      city: "New Delhi",
      state: "Delhi (NCT)",
      description: "An open university based in New Delhi, India.",
      sources: [
        "https://www.ignou.ac.in/",
        "https://ignouadmission.samarth.edu.in/index.php/site/programmes",
      ],
      programs: [
        {
          name: "Advance Certificate in Information Security",
          sourceUrl: "https://ignouadmission.samarth.edu.in/index.php/site/programmes",
        },
        {
          name: "Advanced Certificate in Power Distribution Management",
          sourceUrl: "https://ignouadmission.samarth.edu.in/index.php/site/programmes",
        },
        {
          name: "Appreciation Course on Environment",
          sourceUrl: "https://ignouadmission.samarth.edu.in/index.php/site/programmes",
        },
        {
          name: "Appreciation Course on Population and Sustainable Development",
          sourceUrl: "https://ignouadmission.samarth.edu.in/index.php/site/programmes",
        },
      ],
    },
    {
      name: "University of Hyderabad",
      slug: "university-of-hyderabad",
      officialWebsite: "https://uohyd.ac.in/",
      city: "Hyderabad",
      state: "Telangana",
      description: "A university based in Hyderabad, Telangana, India.",
      logoUrl: "https://uohyd.ac.in/uoh_logo.jpg",
      sources: ["https://uohyd.ac.in/", "https://acad.uohyd.ac.in/"],
      programs: [],
    },
  ];
  for (const university of universities) {
    const existing = await M.University.findOne({ name: university.name }).lean();
    if (!existing) {
      await M.University.create(university);
      continue;
    }
    const missingFields = Object.fromEntries(
      Object.entries(university).filter(([key, value]) => {
        const current = existing[key];
        return (
          current == null ||
          (typeof current === "string" && !current.trim()) ||
          (Array.isArray(value) &&
            value.length > 0 &&
            (!Array.isArray(current) || current.length === 0))
        );
      }),
    );
    if (Object.keys(missingFields).length) {
      await M.University.updateOne(
        { _id: existing._id },
        { $set: missingFields },
        { runValidators: true },
      );
    }
  }
  const university = await M.University.findOneAndUpdate(
    { name: "Demo University" },
    { $setOnInsert: { name: "Demo University" } },
    { upsert: true, new: true },
  );
  const college = await M.College.findOneAndUpdate(
    { universityId: university._id, name: "Demo College" },
    { $setOnInsert: { universityId: university._id, name: "Demo College" } },
    { upsert: true, new: true },
  );
  const courseDefs = [
    ["BCA", 3],
    ["MCA", 2],
    ["BBA", 3],
    ["MBA", 2],
    ["B.Tech", 4],
    ["M.Tech", 2],
    ["B.Sc.", 3],
    ["M.Sc.", 2],
    ["B.Com.", 3],
    ["M.Com.", 2],
  ];
  let bcaCC;
  for (const [name, durationYears] of courseDefs) {
    const course = await M.Course.findOneAndUpdate(
      { name },
      { $setOnInsert: { name, durationYears } },
      { upsert: true, new: true },
    );
    const cc = await M.CollegeCourse.findOneAndUpdate(
      { collegeId: college._id, courseId: course._id },
      { $setOnInsert: { collegeId: college._id, courseId: course._id } },
      { upsert: true, new: true },
    );
    if (name === "BCA") bcaCC = cc;
  }
  for (let i = 1; i <= 6; i++)
    await M.Semester.findOneAndUpdate(
      { collegeCourseId: bcaCC._id, semesterNo: i },
      { $setOnInsert: { collegeCourseId: bcaCC._id, semesterNo: i } },
      { upsert: true, new: true },
    );
  const sem = await M.Semester.findOne({
    collegeCourseId: bcaCC._id,
    semesterNo: 1,
  });
  const defs = [
    ["BCA101", "Programming Fundamentals", 5, "CREDIT"],
    ["BCA102", "Database Basics", 5, "CREDIT"],
    ["BCA103", "Web Development", 5, "CREDIT"],
    ["BCA104", "Computer Fundamentals", 5, "CREDIT"],
    ["BCA105", "Mathematics", 5, "CREDIT"],
    ["BCA106", "Communication Skills", 0, "NON_CREDIT"],
  ];
  for (const [code, name, credits, subjectType] of defs) {
    const sub = await M.Subject.findOneAndUpdate(
      { code },
      { $setOnInsert: { code, name, credits, subjectType } },
      { upsert: true, new: true },
    );
    await M.SemesterSubject.updateOne(
      { semesterId: sem._id, subjectId: sub._id },
      { $setOnInsert: { semesterId: sem._id, subjectId: sub._id } },
      { upsert: true },
    );
  }
  const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  let admin = configuredEmail
    ? await M.Admin.findOne({ email: configuredEmail })
    : await M.Admin.findOne({ role: "SUPER_ADMIN" });
  let adminLoginCreated = false;
  if (!admin) {
    const email = configuredEmail;
    const password = process.env.ADMIN_PASSWORD;
    if (
      !email ||
      !password ||
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      throw new Error(
        "Set ADMIN_EMAIL and an ADMIN_PASSWORD of 8–72 UTF-8 bytes to create the initial admin.",
      );
    }
    admin = await M.Admin.create({
      name: "Super Admin",
      email,
      role: "SUPER_ADMIN",
      collegeId: null,
    });
    await M.AdminLogin.create({
      adminId: admin._id,
      username: process.env.ADMIN_USERNAME?.trim() || email,
      passwordHash: await bcrypt.hash(password, 12),
      status: "ACTIVE",
    });
    adminLoginCreated = true;
  }
  let adminLogin = await M.AdminLogin.findOne({ adminId: admin._id });
  if (!adminLogin) {
    const password = process.env.ADMIN_PASSWORD;
    if (
      !password ||
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      throw new Error(
        "The admin has no login. Set ADMIN_PASSWORD (8–72 UTF-8 bytes) to create its login.",
      );
    }
    adminLogin = await M.AdminLogin.create({
      adminId: admin._id,
      username: process.env.ADMIN_USERNAME?.trim() || admin.email,
      passwordHash: await bcrypt.hash(password, 12),
      status: "ACTIVE",
    });
    adminLoginCreated = true;
  }
  const studentEmail = "student@example.com";
  let student = await M.Student.findOne({ email: studentEmail });
  if (!student)
    student = await M.Student.create({
      collegeCourseId: bcaCC._id,
      name: "Demo Student",
      email: studentEmail,
    });
  const studentLoginExists = await M.StudentLogin.exists({ studentId: student._id });
  let studentLoginCreated = false;
  if (!studentLoginExists) {
    const password = process.env.DEMO_STUDENT_PASSWORD;
    if (
      password &&
      password.length >= 8 &&
      Buffer.byteLength(password, "utf8") <= 72
    ) {
      await M.StudentLogin.create({
        studentId: student._id,
        username: "student",
        passwordHash: await bcrypt.hash(password, 12),
        status: "ACTIVE",
      });
      studentLoginCreated = true;
    }
  }
  let teacher = await M.Teacher.findOne({ email: "teacher@example.com" });
  if (!teacher)
    teacher = await M.Teacher.create({
      collegeId: college._id,
      name: "Demo Teacher",
      email: "teacher@example.com",
    });
  const teacherLoginExists = await M.TeacherLogin.exists({ teacherId: teacher._id });
  let teacherLoginCreated = false;
  if (!teacherLoginExists) {
    const password = process.env.DEMO_TEACHER_PASSWORD;
    if (
      password &&
      password.length >= 8 &&
      Buffer.byteLength(password, "utf8") <= 72
    ) {
      await M.TeacherLogin.create({
        teacherId: teacher._id,
        username: "teacher",
        passwordHash: await bcrypt.hash(password, 12),
        status: "ACTIVE",
      });
      teacherLoginCreated = true;
    }
  }
  const ss = await M.SemesterSubject.findOne({ semesterId: sem._id }).sort({
    _id: 1,
  });
  if (ss) {
    await M.TeachingAssignment.updateOne(
      { teacherId: teacher._id, semesterSubjectId: ss._id },
      {
        $set: {
          teacherId: teacher._id,
          semesterSubjectId: ss._id,
          status: "APPROVED",
        },
      },
      { upsert: true },
    );

    // Seed Attendance
    await M.Attendance.updateOne(
      { studentId: student._id, semesterSubjectId: ss._id },
      {
        $setOnInsert: {
          studentId: student._id,
          semesterSubjectId: ss._id,
          date: new Date(),
          status: "PRESENT",
          markedByTeacherId: teacher._id,
          remarks: "Active in class",
        },
      },
      { upsert: true }
    );

    // Seed Assignment
    const demoAssignment = await M.Assignment.findOneAndUpdate(
      { teacherId: teacher._id, title: "Coursework Project 1" },
      {
        $setOnInsert: {
          title: "Coursework Project 1",
          description: "Implement data structure operations and document performance analysis.",
          semesterSubjectId: ss._id,
          teacherId: teacher._id,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          maxMarks: 100,
          status: "ACTIVE",
        },
      },
      { upsert: true, new: true }
    );

    // Seed Grade
    await M.Grade.updateOne(
      { studentId: student._id, semesterSubjectId: ss._id, examType: "MIDTERM" },
      {
        $setOnInsert: {
          studentId: student._id,
          semesterSubjectId: ss._id,
          examType: "MIDTERM",
          marksObtained: 88,
          maxMarks: 100,
          grade: "A",
          remarks: "Excellent grasp of core concepts",
          teacherId: teacher._id,
        },
      },
      { upsert: true }
    );
  }

  // Seed Fee Record
  await M.FeeRecord.updateOne(
    { studentId: student._id },
    {
      $setOnInsert: {
        studentId: student._id,
        courseId: course._id,
        collegeId: college._id,
        academicYear: "2025-2026",
        totalAmount: 50000,
        paidAmount: 25000,
        status: "PARTIAL",
        transactions: [
          {
            amount: 25000,
            paymentMethod: "ONLINE_RECEIPT",
            transactionRef: "REC-2026-001",
            remarks: "First Semester Installment",
            paidAt: new Date(),
          },
        ],
      },
    },
    { upsert: true }
  );

  // Seed Academic Session
  await M.AcademicSession.updateOne(
    { name: "2025-2026 Academic Year" },
    {
      $setOnInsert: {
        name: "2025-2026 Academic Year",
        startDate: new Date("2025-08-01"),
        endDate: new Date("2026-06-30"),
        isCurrent: true,
        status: "ACTIVE",
      },
    },
    { upsert: true }
  );

  // Seed Announcement
  await M.Announcement.updateOne(
    { title: "Welcome to Academic Year 2025-2026" },
    {
      $setOnInsert: {
        title: "Welcome to Academic Year 2025-2026",
        content: "Campus Desk is now live with real-time student attendance, coursework submissions, and live faculty chat.",
        authorId: admin._id,
        authorRole: "ADMIN",
        authorName: admin.name,
        targetRole: "ALL",
      },
    },
    { upsert: true }
  );
  console.log("MongoDB seed complete.");
  console.log(
    adminLoginCreated
      ? `Initial admin login created for ${admin.email}; its username is from ADMIN_USERNAME or the admin email.`
      : "The existing admin login was left unchanged.",
  );
  console.log(
    teacherLoginExists
      ? "The existing demo teacher login was left unchanged."
      : teacherLoginCreated
        ? "A demo teacher login was created using DEMO_TEACHER_PASSWORD (username: teacher)."
        : "No demo teacher login was created; set DEMO_TEACHER_PASSWORD (8–72 UTF-8 bytes) if needed.",
  );
  console.log(
    studentLoginExists
      ? "The existing demo student login was left unchanged."
      : studentLoginCreated
        ? "A demo student login was created using DEMO_STUDENT_PASSWORD (username: student)."
        : "No demo student login was created; set DEMO_STUDENT_PASSWORD (8–72 UTF-8 bytes) if needed.",
  );
  await mongoose.connection.close();
}
seed().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.connection.close();
  } catch {}
  process.exit(1);
});

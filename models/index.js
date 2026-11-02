const mongoose = require("mongoose");
const { Schema, model } = mongoose;
const opts = { timestamps: true };
const universitySchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, unique: true, sparse: true, trim: true, lowercase: true },
    officialWebsite: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    description: { type: String, trim: true },
    publicPhone: { type: String, trim: true },
    publicEmail: { type: String, trim: true, lowercase: true },
    logoUrl: { type: String, trim: true },
    campusImageUrl: { type: String, trim: true },
    sources: [{ type: String, trim: true }],
    departments: [
      {
        name: { type: String, required: true, trim: true },
        sourceUrl: { type: String, required: true, trim: true },
      },
    ],
    programs: [
      {
        name: { type: String, required: true, trim: true },
        sourceUrl: { type: String, required: true, trim: true },
      },
    ],
  },
  opts,
);
const collegeSchema = new Schema(
  {
    universityId: {
      type: Schema.Types.ObjectId,
      ref: "University",
      required: true,
    },
    name: { type: String, required: true, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    website: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    archivedAt: { type: Date, default: null },
  },
  opts,
);
collegeSchema.index({ universityId: 1, name: 1 }, { unique: true });
const departmentSchema = new Schema(
  {
    collegeId: { type: Schema.Types.ObjectId, ref: "College", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    archivedAt: { type: Date, default: null },
  },
  opts,
);
departmentSchema.index({ collegeId: 1, name: 1 }, { unique: true });
const courseSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    code: { type: String, unique: true, sparse: true, trim: true, uppercase: true },
    durationYears: { type: Number, required: true, min: 0.5 },
    totalFee: { type: Number, default: 0, min: 0 },
    description: { type: String, trim: true },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", default: null },
    archivedAt: { type: Date, default: null },
  },
  opts,
);
const collegeCourseSchema = new Schema(
  {
    collegeId: { type: Schema.Types.ObjectId, ref: "College", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
  },
  opts,
);
collegeCourseSchema.index({ collegeId: 1, courseId: 1 }, { unique: true });
const semesterSchema = new Schema(
  {
    collegeCourseId: {
      type: Schema.Types.ObjectId,
      ref: "CollegeCourse",
      required: true,
    },
    semesterNo: { type: Number, required: true, min: 1 },
  },
  opts,
);
semesterSchema.index({ collegeCourseId: 1, semesterNo: 1 }, { unique: true });
const subjectSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    name: { type: String, required: true },
    credits: { type: Number, default: 0, min: 0 },
    subjectType: {
      type: String,
      enum: ["CREDIT", "NON_CREDIT"],
      default: "CREDIT",
    },
  },
  opts,
);
const semesterSubjectSchema = new Schema(
  {
    semesterId: {
      type: Schema.Types.ObjectId,
      ref: "Semester",
      required: true,
    },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
  },
  opts,
);
semesterSubjectSchema.index({ semesterId: 1, subjectId: 1 }, { unique: true });
const studentSchema = new Schema(
  {
    collegeCourseId: {
      type: Schema.Types.ObjectId,
      ref: "CollegeCourse",
      default: null,
    },
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    studentId: { type: String, unique: true, sparse: true, trim: true },
    phone: { type: String, trim: true, unique: true, sparse: true },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", default: null },
    semesterNo: { type: Number, min: 1 },
    academicYear: { type: String, trim: true },
    enrollmentDate: { type: Date, default: Date.now },
    profileImageUrl: { type: String, trim: true },
    archivedAt: { type: Date, default: null },
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", default: null },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "SUSPENDED"],
      default: "ACTIVE",
    },
  },
  opts,
);
const studentLoginSchema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      unique: true,
    },
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    status: { type: String, enum: ["ACTIVE", "DISABLED"], default: "ACTIVE" },
  },
  opts,
);
const teacherSchema = new Schema(
  {
    collegeId: { type: Schema.Types.ObjectId, ref: "College", required: true },
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    teacherId: { type: String, unique: true, sparse: true, trim: true },
    phone: { type: String, trim: true, unique: true, sparse: true },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", default: null },
    specialization: { type: String, trim: true },
    designation: { type: String, trim: true },
    assignedCourseIds: [{ type: Schema.Types.ObjectId, ref: "Course" }],
    profileImageUrl: { type: String, trim: true },
    archivedAt: { type: Date, default: null },
    skills: [{ type: String, trim: true }],
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "SUSPENDED"],
      default: "ACTIVE",
    },
  },
  opts,
);
const teacherLoginSchema = new Schema(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
      unique: true,
    },
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    status: { type: String, enum: ["ACTIVE", "DISABLED"], default: "ACTIVE" },
  },
  opts,
);
const adminSchema = new Schema(
  {
    collegeId: { type: Schema.Types.ObjectId, ref: "College", default: null },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    role: {
      type: String,
      enum: ["SUPER_ADMIN", "COLLEGE_ADMIN"],
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "SUSPENDED"],
      default: "ACTIVE",
    },
  },
  opts,
);
const adminLoginSchema = new Schema(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      unique: true,
    },
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    status: { type: String, enum: ["ACTIVE", "DISABLED"], default: "ACTIVE" },
  },
  opts,
);
const teacherSubjectSkillSchema = new Schema(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    skillName: { type: String, trim: true },
  },
  opts,
);
teacherSubjectSkillSchema.index(
  { teacherId: 1, subjectId: 1 },
  { unique: true },
);
const enrollmentSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    semesterSubjectId: {
      type: Schema.Types.ObjectId,
      ref: "SemesterSubject",
      required: true,
    },
    enrollmentStatus: {
      type: String,
      enum: ["ENROLLED", "COMPLETED", "DROPPED"],
      default: "ENROLLED",
    },
  },
  opts,
);
enrollmentSchema.index(
  { studentId: 1, semesterSubjectId: 1 },
  { unique: true },
);
const teachingAssignmentSchema = new Schema(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
    semesterSubjectId: {
      type: Schema.Types.ObjectId,
      ref: "SemesterSubject",
      required: true,
    },
    approvedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
  },
  opts,
);
teachingAssignmentSchema.index(
  { teacherId: 1, semesterSubjectId: 1 },
  { unique: true },
);
const loginActivitySchema = new Schema(
  {
    role: {
      type: String,
      enum: ["STUDENT", "TEACHER", "ADMIN"],
      required: true,
    },
    accountId: { type: Schema.Types.ObjectId, required: false },
    username: { type: String, required: true },
    success: { type: Boolean, required: true },
    ipAddress: String,
  },
  opts,
);
const managementActivitySchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
    action: { type: String, required: true, trim: true },
    entityType: {
      type: String,
      enum: [
        "COLLEGE",
        "STUDENT",
        "TEACHER",
        "COURSE",
        "DEPARTMENT",
        "SUBJECT",
        "ASSIGNMENT",
        "ADMIN",
        "FEE",
        "ANNOUNCEMENT",
        "SESSION",
      ],
      required: true,
    },
    entityId: { type: Schema.Types.ObjectId, required: true },
    entityLabel: { type: String, required: true, trim: true },
    collegeId: { type: Schema.Types.ObjectId, ref: "College", default: null },
  },
  opts,
);

const attendanceSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    semesterSubjectId: { type: Schema.Types.ObjectId, ref: "SemesterSubject", default: null },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", default: null },
    collegeId: { type: Schema.Types.ObjectId, ref: "College", default: null },
    date: { type: Date, required: true, default: Date.now },
    status: {
      type: String,
      enum: ["PRESENT", "ABSENT", "LATE", "EXCUSED"],
      default: "PRESENT",
      required: true,
    },
    remarks: { type: String, trim: true },
    markedByTeacherId: { type: Schema.Types.ObjectId, ref: "Teacher", default: null },
    academicYear: { type: String, trim: true },
  },
  opts,
);
attendanceSchema.index({ studentId: 1, date: 1 });
attendanceSchema.index({ semesterSubjectId: 1, date: 1 });

const gradeSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    semesterSubjectId: { type: Schema.Types.ObjectId, ref: "SemesterSubject", default: null },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", default: null },
    examType: {
      type: String,
      enum: ["MIDTERM", "FINAL", "QUIZ", "ASSIGNMENT", "PROJECT"],
      default: "FINAL",
      required: true,
    },
    marksObtained: { type: Number, required: true, min: 0 },
    maxMarks: { type: Number, required: true, default: 100, min: 1 },
    grade: { type: String, trim: true },
    remarks: { type: String, trim: true },
    semesterNo: { type: Number, min: 1 },
    academicYear: { type: String, trim: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", default: null },
  },
  opts,
);
gradeSchema.index({ studentId: 1, semesterSubjectId: 1, examType: 1 });

const assignmentSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    semesterSubjectId: { type: Schema.Types.ObjectId, ref: "SemesterSubject", default: null },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", default: null },
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
    dueDate: { type: Date, required: true },
    maxMarks: { type: Number, default: 100, min: 1 },
    attachmentUrl: { type: String, trim: true },
    status: {
      type: String,
      enum: ["ACTIVE", "CLOSED", "ARCHIVED"],
      default: "ACTIVE",
    },
  },
  opts,
);
assignmentSchema.index({ teacherId: 1, dueDate: 1 });
assignmentSchema.index({ semesterSubjectId: 1 });

const assignmentSubmissionSchema = new Schema(
  {
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    submissionText: { type: String, trim: true },
    fileUrl: { type: String, trim: true },
    submittedAt: { type: Date, default: Date.now },
    marksObtained: { type: Number, default: null },
    feedback: { type: String, trim: true },
    gradedAt: { type: Date, default: null },
    gradedByTeacherId: { type: Schema.Types.ObjectId, ref: "Teacher", default: null },
  },
  opts,
);
assignmentSubmissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });

const feeTransactionSchema = new Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: {
      type: String,
      enum: ["CASH", "BANK_TRANSFER", "CHEQUE", "ONLINE_RECEIPT", "OTHER"],
      default: "ONLINE_RECEIPT",
    },
    transactionRef: { type: String, trim: true },
    paidAt: { type: Date, default: Date.now },
    remarks: { type: String, trim: true },
    receivedByAdminId: { type: Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  opts,
);

const feeRecordSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, unique: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", default: null },
    collegeId: { type: Schema.Types.ObjectId, ref: "College", default: null },
    academicYear: { type: String, trim: true },
    totalAmount: { type: Number, required: true, min: 0, default: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["PAID", "PARTIAL", "PENDING", "OVERDUE"],
      default: "PENDING",
    },
    dueDate: { type: Date, default: null },
    transactions: [feeTransactionSchema],
  },
  opts,
);
feeRecordSchema.index({ collegeId: 1, status: 1 });

const academicSessionSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isCurrent: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["UPCOMING", "ACTIVE", "COMPLETED"],
      default: "ACTIVE",
    },
  },
  opts,
);

const announcementSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true, trim: true },
    authorId: { type: Schema.Types.ObjectId, required: true },
    authorRole: { type: String, enum: ["ADMIN", "TEACHER"], required: true },
    authorName: { type: String, required: true, trim: true },
    targetRole: {
      type: String,
      enum: ["ALL", "STUDENT", "TEACHER"],
      default: "ALL",
    },
    collegeId: { type: Schema.Types.ObjectId, ref: "College", default: null },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", default: null },
  },
  opts,
);
announcementSchema.index({ createdAt: -1 });

const notificationSchema = new Schema(
  {
    recipientId: { type: Schema.Types.ObjectId, required: true },
    recipientRole: {
      type: String,
      enum: ["ADMIN", "TEACHER", "STUDENT"],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["CHAT", "ASSIGNMENT", "ANNOUNCEMENT", "GRADE", "ATTENDANCE", "FEE", "SYSTEM"],
      default: "SYSTEM",
    },
    link: { type: String, trim: true, default: "" },
    isRead: { type: Boolean, default: false },
  },
  opts,
);
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

const conversationSchema = new Schema(
  {
    participants: [
      {
        userId: { type: Schema.Types.ObjectId, required: true },
        role: { type: String, enum: ["ADMIN", "TEACHER", "STUDENT"], required: true },
        name: { type: String, required: true },
      },
    ],
    lastMessage: {
      content: { type: String, default: "" },
      senderId: { type: Schema.Types.ObjectId, default: null },
      senderName: { type: String, default: "" },
      timestamp: { type: Date, default: Date.now },
    },
  },
  opts,
);
conversationSchema.index({ "participants.userId": 1 });
conversationSchema.index({ updatedAt: -1 });

const chatMessageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    senderId: { type: Schema.Types.ObjectId, required: true },
    senderRole: { type: String, enum: ["ADMIN", "TEACHER", "STUDENT"], required: true },
    senderName: { type: String, required: true },
    recipientId: { type: Schema.Types.ObjectId, required: true },
    content: { type: String, required: true, trim: true },
    readBy: [{ type: Schema.Types.ObjectId }],
  },
  opts,
);
chatMessageSchema.index({ conversationId: 1, createdAt: 1 });
chatMessageSchema.index({ recipientId: 1, readBy: 1 });

module.exports = {
  University: model("University", universitySchema),
  College: model("College", collegeSchema),
  Department: model("Department", departmentSchema),
  Course: model("Course", courseSchema),
  CollegeCourse: model("CollegeCourse", collegeCourseSchema),
  Semester: model("Semester", semesterSchema),
  Subject: model("Subject", subjectSchema),
  SemesterSubject: model("SemesterSubject", semesterSubjectSchema),
  Student: model("Student", studentSchema),
  StudentLogin: model("StudentLogin", studentLoginSchema),
  Teacher: model("Teacher", teacherSchema),
  TeacherLogin: model("TeacherLogin", teacherLoginSchema),
  Admin: model("Admin", adminSchema),
  AdminLogin: model("AdminLogin", adminLoginSchema),
  TeacherSubjectSkill: model("TeacherSubjectSkill", teacherSubjectSkillSchema),
  Enrollment: model("Enrollment", enrollmentSchema),
  TeachingAssignment: model("TeachingAssignment", teachingAssignmentSchema),
  LoginActivity: model("LoginActivity", loginActivitySchema),
  ManagementActivity: model("ManagementActivity", managementActivitySchema),
  Attendance: model("Attendance", attendanceSchema),
  Grade: model("Grade", gradeSchema),
  Assignment: model("Assignment", assignmentSchema),
  AssignmentSubmission: model("AssignmentSubmission", assignmentSubmissionSchema),
  FeeRecord: model("FeeRecord", feeRecordSchema),
  AcademicSession: model("AcademicSession", academicSessionSchema),
  Announcement: model("Announcement", announcementSchema),
  Notification: model("Notification", notificationSchema),
  Conversation: model("Conversation", conversationSchema),
  ChatMessage: model("ChatMessage", chatMessageSchema),
};

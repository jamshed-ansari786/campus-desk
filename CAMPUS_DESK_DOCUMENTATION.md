# CampusDesk architecture and data reference

This guide describes behavior implemented in the current source. CampusDesk is a server-rendered academic-management application with a public university directory, authenticated role portals, a small JSON API, and Socket.IO chat/notifications.

## Architecture

```text
Browser
  ├─ HTML forms / same-origin fetch ──> Express routes ──> Mongoose ──> MongoDB
  ├─ EJS HTML <─────────────────────── Express views
  ├─ Static CSS / JavaScript <──────── Express public/
  └─ Socket.IO <────────────────────── shared HTTP server
                                      └─ shared Express session middleware
```

`server.js` creates the Express application and HTTP server, configures EJS, body parsers, static assets, NoSQL-key sanitization/security headers, sessions and flash messages, initializes Socket.IO, mounts routes, and connects to MongoDB before listening. The route/service/model layers are separated as follows:

| Layer | Main responsibilities |
| --- | --- |
| `routes/` | Request handling, validation, authorization, model queries, and response selection |
| `middleware/` | Session role checks, API token/session checks, flash locals, request sanitization, and auth rate limiting |
| `models/index.js` | MongoDB document schemas, references, enums, indexes, and timestamps |
| `services/` | Socket.IO authentication/events and PDF/XLSX construction |
| `views/` | Server-rendered public and role-specific pages |
| `public/` | Styles and browser behavior |
| `scripts/` | Idempotent data seed and explicit admin password reset |
| `tests/` | Supertest/service assertions and Playwright browser checks |

Express mounts auth, chat, and notification routes at `/`; the directory at `/colleges`; admin pages at `/admin`; admin JSON handlers at `/api/admin`; and portals at `/student` and `/teacher`.

## Roles and access

- `STUDENT`: own portal, enrollment, own attendance/assignments/grades/fees, and eligible chat contacts.
- `TEACHER`: own portal, approved teaching subjects, attendance recording, assignment creation/submission grading, grades, roster, announcements, and eligible chat contacts.
- `ADMIN`: administrative pages and management operations.
- Admin profiles have a separate `adminRole`: `SUPER_ADMIN` or `COLLEGE_ADMIN`. College admins are scoped to an assigned college on supported operations. Super admins manage global catalogue data, admin accounts, academic structure, and academic sessions.

Web pages use the `sms.sid` express-session cookie. The cookie is HTTP-only, `SameSite=Lax`, secure in production, and lasts eight hours. Sessions are regenerated on successful web sign-in. JSON endpoints protected by `requireApiAuth` accept the session or a bearer JWT; tokens expire after seven days. `requireApiAuth` returns JSON `401` responses, while page authorization redirects or renders an HTML access-denied page.

Student, teacher, and admin profile documents are separate from their login documents. Login passwords are stored as bcrypt hashes. Login attempts are recorded in `LoginActivity`; admin changes are recorded in `ManagementActivity`.

## Data models and relationships

The following 29 Mongoose models are exported from `models/index.js`. Schemas use timestamps. Fields listed here are the key fields/links, not an exhaustive listing of every optional property.

### Institution and academic catalogue

| Model | Main fields / references |
| --- | --- |
| `University` | Unique name; slug, official website, location/contact, description, image/logo URLs, source URLs, nested sourced departments and programs. Public directory records are distinct from managed colleges. |
| `College` | Required `universityId` reference, name, location/contact, `archivedAt`; unique per university/name. |
| `Department` | Required `collegeId`, name, description, `archivedAt`; unique per college/name. |
| `Course` | Unique name, optional unique code, duration, total fee, description, optional `departmentId`, `archivedAt`. |
| `CollegeCourse` | Join between `College` and `Course`; unique college/course pair. |
| `Semester` | `collegeCourseId`, `semesterNo`; unique per college-course/semester number. |
| `Subject` | Unique uppercase code, name, credits, `CREDIT` or `NON_CREDIT`. |
| `SemesterSubject` | Join between `Semester` and `Subject`; unique semester/subject pair. |

Relationship chain: `University → College → Department`; courses can reference a department and are linked to colleges through `CollegeCourse`. Each college/course link can have semesters; semesters contain `SemesterSubject` links to subjects.

### Accounts, enrollment, and academic activity

| Model | Main fields / references |
| --- | --- |
| `Student` | Name/email, optional student ID and phone, optional `collegeCourseId`, department, semester/year, enrollment date, profile image URL, optional mentor `teacherId`, status (`ACTIVE`, `INACTIVE`, `SUSPENDED`), `archivedAt`. |
| `StudentLogin` | Unique `studentId`, unique username, password hash, login status (`ACTIVE`, `DISABLED`). |
| `Teacher` | Required college, name/email, optional teacher ID/phone, department, specialization/designation, assigned courses, skills, profile image URL, status, archive timestamp. |
| `TeacherLogin` | Unique `teacherId`, unique username, password hash, login status. |
| `Admin` | Name/email, optional college, role (`SUPER_ADMIN`, `COLLEGE_ADMIN`), status. |
| `AdminLogin` | Unique `adminId`, unique username, password hash, login status. |
| `TeacherSubjectSkill` | Teacher/subject mapping and skill name; unique teacher/subject pair. |
| `Enrollment` | Student and semester-subject references; status (`ENROLLED`, `COMPLETED`, `DROPPED`); unique student/subject pair. |
| `TeachingAssignment` | Teacher and semester-subject references, optional approving admin, status (`PENDING`, `APPROVED`, `REJECTED`); unique teacher/subject pair. |
| `Attendance` | Student, optional semester-subject/course/college, date, status (`PRESENT`, `ABSENT`, `LATE`, `EXCUSED`), remarks, marking teacher, academic year. |
| `Grade` | Student, optional semester-subject/course, exam type (`MIDTERM`, `FINAL`, `QUIZ`, `ASSIGNMENT`, `PROJECT`), marks/max marks, grade/remarks, year/semester, teacher. |
| `Assignment` | Title/description, optional semester-subject/course, teacher, due date, max marks, attachment URL, status (`ACTIVE`, `CLOSED`, `ARCHIVED`). |
| `AssignmentSubmission` | Assignment/student, submission text and/or file URL, submission time, marks, feedback, grading metadata; unique assignment/student pair. |
| `FeeRecord` | Unique student, optional course/college, academic year, total/paid amounts, fee status (`PAID`, `PARTIAL`, `PENDING`, `OVERDUE`), due date, embedded payment transaction array. |
| `AcademicSession` | Unique name, start/end dates, `isCurrent`, status (`UPCOMING`, `ACTIVE`, `COMPLETED`). |

### Activity, announcements, and chat

| Model | Main fields / references |
| --- | --- |
| `LoginActivity` | Role, optional account ID, submitted username, success flag, IP address. |
| `ManagementActivity` | Admin actor, action, entity type/ID/label, optional college scope. |
| `Announcement` | Title/content, author identity and role, target role (`ALL`, `STUDENT`, `TEACHER`), optional college/course. |
| `Notification` | Recipient ID/role, title/message, type (`CHAT`, `ASSIGNMENT`, `ANNOUNCEMENT`, `GRADE`, `ATTENDANCE`, `FEE`, `SYSTEM`), link, read flag. |
| `Conversation` | Participants (ID/role/name) and last-message summary. |
| `ChatMessage` | Conversation, sender/recipient identity, content, and `readBy` IDs. |

## Implemented workflows and limits

- **University discovery:** the public directory is backed by `University` records. Seed data includes institution/program source URLs. This is separate from the admin-managed `College` and academic catalogue.
- **Student signup:** creates a profile and login without requiring an existing college/course assignment. Enrollment becomes available after an admin assigns the student to a college-course.
- **Teacher signup:** chooses the first unarchived college as context; signup is unavailable if no such college exists.
- **OTP and recovery:** codes expire in five minutes and are attempt-limited. Signup OTPs are held in the session and shown only outside production because no email/SMS service is integrated. Password reset is unavailable in production until delivery is configured; development shows the generated code in the page.
- **Student/teacher archive:** sets archive/status fields and disables the associated login while retaining academic history.
- **Assignments:** submissions accept text and/or a URL. There is no file upload/storage service.
- **Images:** profiles store image URLs; there is no image upload pipeline.
- **Assistant:** the home-page assistant is a client-side rules/FAQ helper and does not use an AI API.
- **Reports:** the admin exports include student, attendance, fee, and grade reports in XLSX and PDF.

## Real-time events and chat

Socket.IO shares the Express HTTP server and session middleware. A socket may authenticate using a valid JWT passed in handshake auth/query or the `sms.sid` cookie. Authenticated sockets join `user:<id>` and `role:<role>` rooms. Presence is kept in an in-process map; it is not a durable or cross-instance presence store.

| Event | Direction | Behavior |
| --- | --- | --- |
| `online_users` | Server → connecting client | Sends current online user IDs. |
| `user_status` | Server → all clients | Announces `{ userId, status }` on connect/disconnect. |
| `typing`, `stop_typing` | Client → server | Carries recipient/conversation identifiers; server forwards `user_typing` or `user_stop_typing`. |
| `send_message` | Client → server | Persists a message, emits `new_message` to sender and recipient, creates a chat notification, and responds through optional acknowledgement. |
| `chat_error` | Server → sender | Reports failed/invalid socket message attempts. |
| `mark_read` | Client → server | Adds the current user to message `readBy` and emits `messages_read` to the other participant. |
| `new_message` | Server → clients | Delivers persisted message payloads. |
| `new_notification` | Server → user room | Delivers a notification record. |
| `new_announcement` | Server → role room or all | Broadcasts a targeted announcement. |
| `user_typing`, `user_stop_typing`, `messages_read` | Server → recipient | Presence within a conversation, typing state, and read-state updates. |

The chat contact list is role-specific. Admins can contact active students and teachers. Teachers and students are offered admins plus relevant counterpart users derived from direct assignments, approved teaching/enrollment links, or same-college fallback. Student-to-student and teacher-to-teacher conversations are denied by the chat permission helper. Self-chat is denied.

The server configures WebSocket/polling and two-minute connection-state recovery. The browser shares one socket instance and avoids connecting on guest pages. Optional Redis adapter code exists behind `REDIS_URL`, but the Redis packages are not declared in the current dependencies.

## Configuration and operations

Supported settings, defaults, and production caveats are listed in [BACKEND.md](./BACKEND.md#environment-variables). Never include real secrets in docs. Seed and password-reset instructions are in the [README](./README.md#requirements-and-local-setup).

## Tests and deployment considerations

`npm test` covers selected HTTP, auth, sanitization, chat-helper, report, and Socket.IO behavior. `npm run test:e2e` checks major public pages, access redirects, themes, guest socket behavior, and admin navigation. These are targeted checks, not complete coverage of every route or model.

The application uses a default in-memory Express session store, has no CSRF middleware, and configures Socket.IO CORS with a wildcard origin. Configure production session persistence, HTTPS, origin restrictions, delivery providers, backups, data retention, and institutional privacy requirements before deployment. Review [BACKEND.md](./BACKEND.md#production-and-known-limitations) for the current caveats.

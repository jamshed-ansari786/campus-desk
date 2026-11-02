# CampusDesk routes and API reference

CampusDesk is primarily a server-rendered Express application. Browser pages and form actions return HTML or redirects. A smaller set of `/api/...` routes returns JSON; report routes return downloadable files. The route list below reflects the current mounts in `server.js`.

## Request and response conventions

- URL-encoded form bodies are parsed with a 20 KB limit; JSON bodies are also parsed by Express.
- Most HTML `POST` handlers validate input, set a one-time session flash message, and redirect back to a page. Invalid input commonly redirects; missing records may render an HTML 404.
- JSON APIs return JSON on successful responses and usually use `{ "error": "..." }` for explicit authentication, authorization, or validation errors. Unhandled errors reach the application error handler, which renders an HTML error page.
- `:id` is a MongoDB document ID; `:slug` is a university slug. All query and form fields below use the names expected by the handlers.
- Session-authenticated API requests use the `sms.sid` cookie. API and chat/notification routes that use `requireApiAuth` also accept `Authorization: Bearer <token>`.

## Health and home

| Method | Path | Access | Inputs | Result |
| --- | --- | --- | --- | --- |
| `GET` | `/` | Public | None | Renders the home page, or redirects a signed-in user to `/admin`, `/teacher`, or `/student`. |
| `GET` | `/health` | Public | None | JSON: `{ "status": "ok", "database": "connected" }`; database may be `"disconnected"`. |

## Authentication routes

| Method | Path | Access | Inputs | Result |
| --- | --- | --- | --- | --- |
| `GET` | `/login` | Public | None | Renders student/teacher sign-in. |
| `POST` | `/login` | Public | Form: `email`, `password` | Records a login attempt; success regenerates the session and redirects to the matching portal. Invalid credentials render the login page with status `401`. |
| `GET` | `/admin/login` | Public | None | Renders admin sign-in. |
| `POST` | `/admin/login` | Public | Form: `email`, `password` | Success regenerates the session and redirects to `/admin`; invalid credentials render status `401`. |
| `GET` | `/forgot-password` | Public | None | Renders account recovery. |
| `POST` | `/forgot-password` | Public | Form: `email` | Starts a five-minute verification-code flow outside production. Production returns `503` because delivery is not configured. |
| `POST` | `/reset-password` | Public | Form: `email`, `otp`, `password`, `confirmPassword` | Verifies the session-bound code, updates an active account password, and redirects to the appropriate login. Codes expire in five minutes and allow up to five attempts. |
| `GET` | `/signup` | Public | None | Renders student/teacher registration. |
| `POST` | `/signup` | Public | Form: `role`, `firstName`, `lastName`, `email`, `phone`; verification step also sends `otp`, `password`, `confirmPassword` | First submission starts signup and issues an OTP. The second verifies it, creates the profile/login, signs the user in, and redirects to their portal. Only `STUDENT` and `TEACHER` are supported. |
| `POST` | `/logout` | Signed-in user | None | Destroys the session, clears `sms.sid`, and redirects to `/login`. |
| `POST` | `/api/auth/login` | Public | JSON/form: `email`, `password`, optional `role` (`ADMIN`, `TEACHER`, `STUDENT`) | JSON success: `{ success, token, user }`; missing inputs return `400`, invalid credentials `401`. Token lifetime is seven days. |
| `GET` | `/api/auth/me` | Session or bearer token | None | JSON: `{ user }`; unauthenticated requests return `401`. |
| `POST` | `/api/auth/logout` | Public route | None | Destroys a session if present and returns `{ success: true, message }`. A bearer token is not revoked server-side. |

Login/password endpoints using `authLimiter` are limited to 30 requests per IP per 15 minutes. Signup does not use this limiter; signup OTP attempts are separately limited to five per session, followed by a five-minute lockout.

## Public university directory

| Method | Path | Access | Query / result |
| --- | --- | --- | --- |
| `GET` | `/colleges` | Public | Optional `q` searches name/city/state, `state` filters exact state, `course` searches program names, and `page` selects a page. Renders nine directory records per page. |
| `GET` | `/colleges/:slug` | Public | Renders the university profile; unknown slugs render an HTML 404. |

## Admin HTML routes

All `/admin` routes require a signed-in `ADMIN`. `COLLEGE_ADMIN` access is scoped to its college on supported operations; `SUPER_ADMIN` is required where noted. Successful actions generally redirect with a flash message.

### Dashboard, academic structure, and people

| Method | Path | Additional access | Inputs / purpose |
| --- | --- | --- | --- |
| `GET` | `/admin` | Admin | Dashboard counts and recent activity; college admins see scoped data. |
| `GET` | `/admin/academic-structure` | Super admin | Academic-structure summary counts. |
| `GET` | `/admin/students` | Admin | Optional query: `page`, `q`, `college`, `course`, `semester`. Search and filter active, unarchived students. |
| `GET` | `/admin/students/new` | Admin | New-student form. |
| `GET` | `/admin/students/:id` | Admin | Student detail page. |
| `GET` | `/admin/students/:id/edit` | Admin | Student edit form. |
| `POST` | `/admin/students` | Admin | Form: `name`, `email`, `username`, `password`, `college_course_id`, `phone`, `student_id`, `department_id`, `semester_no`, `academic_year`, `enrollment_date`, `profile_image_url`. Creates profile and login. |
| `POST` | `/admin/students/:id/update` | Admin | Form: student profile fields `name`, `email`, `phone`, `student_id`, `college_course_id`, `department_id`, `semester_no`, `academic_year`, `enrollment_date`, `profile_image_url`. |
| `POST` | `/admin/students/:id/archive` | Admin | Archives the profile and disables its login; academic records are retained. |
| `GET` | `/admin/teachers` | Admin | Optional query: `page`, `q`, `college`, `department`. Search/filter unarchived teachers. |
| `GET` | `/admin/teachers/new` | Admin | New-teacher form. |
| `GET` | `/admin/teachers/:id` | Admin | Teacher detail page. |
| `GET` | `/admin/teachers/:id/edit` | Admin | Teacher edit form. |
| `POST` | `/admin/teachers` | Admin | Form: `name`, `email`, `username`, `password`, `college_id` (ignored in favor of assigned college for college admins), `teacher_id`, `phone`, `department_id`, `specialization`, `designation`, `profile_image_url`, comma-separated `skills`, repeated `course_ids`. Creates profile and login. |
| `POST` | `/admin/teachers/:id/update` | Admin | Form: teacher profile fields `name`, `email`, `teacher_id`, `phone`, `department_id`, `specialization`, `designation`, `profile_image_url`, `skills`, repeated `course_ids`. |
| `POST` | `/admin/teachers/:id/archive` | Admin | Archives the profile and disables its login; academic records are retained. |
| `GET` | `/admin/assignments` | Admin | Lists teaching assignments, scoped by college for college admins. |
| `POST` | `/admin/assignments/:id/decision` | Admin | Form: `status` (`APPROVED` or `REJECTED`). Records the reviewing admin. |

### Colleges, departments, courses, and subjects

| Method | Path | Additional access | Inputs / purpose |
| --- | --- | --- | --- |
| `GET` | `/admin/colleges` | Admin | Lists visible colleges. |
| `POST` | `/admin/colleges` | Super admin | Form: `university_id`, `name`, `city`, `state`, `website`, `phone`, `email`. |
| `POST` | `/admin/colleges/:id/update` | Admin | Form: `name`, `city`, `state`, `website`, `phone`, `email`; college admins can update only their assigned college. |
| `POST` | `/admin/colleges/:id/archive` | Super admin | Archives a college; linked records are preserved. |
| `GET` | `/admin/departments` | Admin | Optional query: `college`. Lists visible departments. |
| `POST` | `/admin/departments` | Admin | Form: `college_id` (super admin), `name`, `description`; college admins use their assigned college. |
| `POST` | `/admin/departments/:id/update` | Admin | Form: `name`, `description`; college admins are restricted to their college. |
| `POST` | `/admin/departments/:id/archive` | Admin | Archives a department within the user's scope. |
| `GET` | `/admin/courses` | Super admin | Lists active courses and college availability. |
| `POST` | `/admin/courses` | Super admin | Form: `name`, `code`, `description`, `department_id`, `duration_years`, repeated `college_ids`. |
| `POST` | `/admin/courses/:id/update` | Super admin | Same course fields; updates course and college availability links. |
| `POST` | `/admin/courses/:id/archive` | Super admin | Archives a course; academic history is preserved. |
| `GET` | `/admin/subjects` | Super admin | Lists subjects. |
| `POST` | `/admin/subjects` | Super admin | Form: `code`, `name`, integer `credits`, `subject_type` (`CREDIT` or `NON_CREDIT`). |

### Admin accounts, reports, finance, and operations

| Method | Path | Additional access | Inputs / purpose |
| --- | --- | --- | --- |
| `GET` | `/admin/admins` | Super admin | Lists admin accounts and active colleges. |
| `POST` | `/admin/admins` | Super admin | Form: `name`, `email`, `role`, `collegeId`, `password`; creates `SUPER_ADMIN` or `COLLEGE_ADMIN`. |
| `POST` | `/admin/admins/:id/status` | Super admin | Toggles the admin profile between active/inactive and enables/disables its login. |
| `GET` | `/admin/reports` | Admin | Renders report summary. |
| `GET` | `/admin/reports/students/excel` | Admin | Optional `status`; downloads XLSX. |
| `GET` | `/admin/reports/students/pdf` | Admin | Downloads PDF (up to 200 rows). |
| `GET` | `/admin/reports/attendance/excel` | Admin | Downloads XLSX (up to 500 records). |
| `GET` | `/admin/reports/attendance/pdf` | Admin | Downloads PDF (up to 200 records). |
| `GET` | `/admin/reports/fees/excel` | Admin | Downloads fee XLSX. |
| `GET` | `/admin/reports/fees/pdf` | Admin | Downloads fee PDF (up to 200 records). |
| `GET` | `/admin/reports/grades/excel` | Admin | Downloads grades XLSX (up to 500 records). |
| `GET` | `/admin/reports/grades/pdf` | Admin | Downloads grades PDF (up to 200 records). |
| `GET` | `/admin/fees` | Admin | Optional query: `status` (`PAID`, `PARTIAL`, `PENDING`, `OVERDUE`). Renders fees and totals. |
| `POST` | `/admin/fees/:id/payment` | Admin | Form: positive `amount`, optional `paymentMethod`, `transactionRef`, `remarks`. Records a payment and notifies the student. |
| `GET` | `/admin/attendance` | Admin | Optional query: `date` (defaults to today); renders attendance overview. |
| `GET` | `/admin/sessions` | Super admin | Lists academic sessions. |
| `POST` | `/admin/sessions` | Super admin | Form: `name`, `startDate`, `endDate`, optional `isCurrent`. |
| `POST` | `/admin/sessions/:id/current` | Super admin | Sets the selected academic session as current. |
| `GET` | `/admin/announcements` | Admin | Lists announcements. |
| `POST` | `/admin/announcements` | Admin | Form: `title`, `content`, optional `targetRole` (`ALL`, `STUDENT`, `TEACHER`). Broadcasts the announcement. |
| `POST` | `/admin/announcements/:id/delete` | Admin | Deletes an announcement. |
| `GET` | `/admin/activity` | Admin | Optional query: `page`; renders management activity. |

## Student and teacher HTML routes

| Method | Path | Access | Inputs / purpose |
| --- | --- | --- | --- |
| `GET` | `/student` | Student | Dashboard, subjects, enrollment choices, assignments, grades, fee summary, and announcements. |
| `GET` | `/student/attendance` | Student | Attendance history and summary. |
| `GET` | `/student/assignments` | Student | Assignments for enrolled subjects and submission status. |
| `POST` | `/student/assignments/:id/submit` | Student | Form: `submissionText` and/or `fileUrl` (a link; no upload storage). Creates or updates a submission. |
| `GET` | `/student/grades` | Student | Grade history and summary. |
| `GET` | `/student/fees` | Student | Fee ledger; creates a default ledger if one does not exist. |
| `POST` | `/student/enroll` | Student | Form: `semester_subject_id`; enrolls only in a subject available for the student's assigned college/course. |
| `GET` | `/chat` | Signed-in user | Renders the authenticated campus chat interface. |
| `GET` | `/teacher` | Teacher | Dashboard, approved subjects, counts, recent assignments, and announcements. |
| `GET` | `/teacher/attendance` | Teacher | Optional query: `subjectId`, `date`; loads enrolled students and attendance for that date. |
| `POST` | `/teacher/attendance` | Teacher | Form: `semesterSubjectId`, `date`, nested `attendance[studentId]` values (`PRESENT`, `ABSENT`, `LATE`, `EXCUSED`). |
| `GET` | `/teacher/assignments` | Teacher | Lists the teacher's assignments and submission counts. |
| `POST` | `/teacher/assignments` | Teacher | Form: `title`, `description`, `semesterSubjectId`, `dueDate`, `maxMarks`. Creates an assignment and notifies enrolled students when a subject is selected. |
| `GET` | `/teacher/assignments/:id` | Teacher | Lists submissions for an assignment owned by the teacher. |
| `POST` | `/teacher/assignments/:id/grade/:submissionId` | Teacher | Form: `marksObtained`, `feedback`; grades the submission and notifies the student. |
| `GET` | `/teacher/grades` | Teacher | Optional query: `subjectId`, `examType` (defaults to `FINAL`); lists enrolled students and current grades. |
| `POST` | `/teacher/grades` | Teacher | Form: `semesterSubjectId`, `examType`, `maxMarks`, nested `grades[studentId][marks]`, optional `grade`, `remarks`. Saves grades and notifies students. |
| `GET` | `/teacher/students` | Teacher | Roster for students enrolled in the teacher's approved subjects. |

## JSON endpoints

### Admin API

All `/api/admin` routes accept an authenticated session or bearer token and require role `ADMIN`.

| Method | Path | Query/body | JSON response |
| --- | --- | --- | --- |
| `GET` | `/api/admin/stats` | None | `{ students, teachers, courses, colleges, attendanceTotal, fees: { total, paid, outstanding } }`. |
| `GET` | `/api/admin/students` | Query: `page` (default 1), `limit` (default 20, max 100), `search` | `{ students, page, limit, total, pages }`. |
| `GET` | `/api/admin/teachers` | None | `{ teachers, total }`; returns all unarchived teachers, sorted by name. |

### Chat

These routes require a session or bearer token. Contact availability is based on role and campus/teaching relationships; users cannot message themselves, and students cannot message other students.

| Method | Path | Query/body | JSON response |
| --- | --- | --- | --- |
| `GET` | `/api/chat/contacts` | None | `{ contacts }`; contact entries include identity/role, online status, and unread count. |
| `GET` | `/api/chat/messages/:recipientId` | Query: `page` (default 1), `limit` (default 30, max 100), `q` (message-content search) | `{ messages, total, page, pages, conversationId, recipient }`; if no conversation exists, returns an empty list and `conversationId: null`. |
| `POST` | `/api/chat/messages` | JSON: `recipientId`, `content` | Status `201`, `{ success: true, message }`; invalid body returns `400`, missing recipient `404`, denied chat `403`. |

### Notifications and announcements

All endpoints require a session or bearer token. The announcement creation endpoint additionally requires role `ADMIN` or `TEACHER`.

| Method | Path | Query/body | JSON response |
| --- | --- | --- | --- |
| `GET` | `/api/notifications` | None | `{ unreadCount, notifications }` with at most 20 recent notifications; response is marked no-cache. |
| `PATCH` | `/api/notifications/:id/read` | None | `{ success: true }`; only the current recipient's record is updated. |
| `PATCH` | `/api/notifications/read-all` | None | `{ success: true }`; marks the current user's unread notifications as read. |
| `GET` | `/api/announcements` | None | `{ announcements }` with up to 10 latest announcements targeted to `ALL` or the user's role. |
| `POST` | `/api/announcements` | JSON: `title`, `content`, optional `targetRole` (`ALL`, `STUDENT`, `TEACHER`) | Status `201`, `{ success: true, announcement }`; missing title/content returns `400`. Invalid target role defaults to `ALL`. |

## Socket.IO events

Socket.IO runs on the same HTTP server. Connections authenticate with a valid handshake JWT or the Express `sms.sid` session cookie. Event names and payload essentials:

| Direction | Event | Data / behavior |
| --- | --- | --- |
| Server → client | `online_users` | Array of currently online user IDs sent on connect. |
| Server → all | `user_status` | `{ userId, status }`, where status is `online` or `offline`. |
| Client → server | `typing`, `stop_typing` | `{ recipientId, conversationId }`; forwarded as `user_typing` / `user_stop_typing`. |
| Client → server | `send_message` | `{ recipientId, content }`; persists a message, emits `new_message` to both participants, creates a notification, and optionally invokes an acknowledgement callback. Failures emit `chat_error`. |
| Client → server | `mark_read` | `{ conversationId }`; marks received messages read and emits `messages_read` to the other participant. |
| Server → client | `new_message` | Persisted message payload. |
| Server → client | `new_notification` | A new notification record. |
| Server → role / all | `new_announcement` | Broadcast announcement for its target role (or all sockets for `ALL`). |
| Server → client | `messages_read` | `{ conversationId, readerId }`. |

The server enables WebSocket and polling transports and two-minute connection-state recovery. See [CAMPUS_DESK_DOCUMENTATION.md](./CAMPUS_DESK_DOCUMENTATION.md#real-time-events-and-chat) for connection and permission details.

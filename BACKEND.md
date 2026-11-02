# Backend Guide

CampusDesk uses **Node.js, Express, MongoDB, and Mongoose**. It does not use MySQL. Express serves both the EJS frontend and the static assets; most routes return HTML pages or handle HTML form submissions rather than a separate REST API.

## Backend entry points and configuration

| Path                              | Responsibility                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `server.js`                       | Configures Express, sessions, static files, route mounts, error handling, database startup, and HTTP listener |
| `config/db.js`                    | Connects Mongoose using `MONGO_URI` (fallback: local `student_management` database)                           |
| `routes/`                         | Authentication, directory, admin, student, and teacher request handlers                                       |
| `middleware/auth.js`              | Login and role authorization middleware                                                                       |
| `middleware/flash.js`             | Provides current user and one-time flash messages to EJS views                                                |
| `models/index.js`                 | Mongoose schemas and models                                                                                   |
| `scripts/seed.js`                 | Idempotent university/demo data and initial admin setup                                                       |
| `scripts/reset-admin-password.js` | Explicitly updates the configured admin password hash                                                         |

## Start commands and ports

From the project root:

```powershell
npm install
npm run dev
```

The production-style start command is `npm start`. Express listens on `0.0.0.0` by default, using `PORT` (default `8000`); `HOST` can override the bind address. MongoDB connection settings remain in `.env` via `MONGO_URI`. Do not expose MongoDB's port to client devices or the public internet.

Available npm scripts:

| Command                        | Purpose                                                                |
| ------------------------------ | ---------------------------------------------------------------------- |
| `npm run dev`                  | Start the app with Nodemon                                             |
| `npm start`                    | Start the app with Node                                                |
| `npm run db:seed`              | Run the idempotent seed                                                |
| `npm run admin:reset-password` | Update the admin password hash using the configured environment values |

## HTTP routes

There are **46 HTTP route handlers**: 44 declared in the route modules and two declared directly in `server.js`. A GET and POST on the same URL count as separate handlers. Most routes serve EJS pages or process form submissions; `/health` returns JSON.

### Server-level and authentication routes

| Method    | URL            | Access / purpose                                          |
| --------- | -------------- | --------------------------------------------------------- |
| GET       | `/`            | Public home or redirect to the signed-in user's dashboard |
| GET       | `/health`      | JSON health and MongoDB connection status                 |
| GET, POST | `/login`       | Student/teacher login with email and password             |
| GET, POST | `/admin/login` | Separate administrator login                              |
| GET, POST | `/signup`      | Student/teacher registration and OTP verification         |
| POST      | `/logout`      | End the authenticated session                             |

### University directory routes

| Method | URL               | Access / purpose                                                 |
| ------ | ----------------- | ---------------------------------------------------------------- |
| GET    | `/colleges`       | Public university directory with search, filters, and pagination |
| GET    | `/colleges/:slug` | Public university detail                                         |

### Admin routes

Admin routes require an authenticated administrator; some operations require a super admin.

| Method    | URL                               | Purpose                             |
| --------- | --------------------------------- | ----------------------------------- |
| GET       | `/admin`                          | Admin dashboard and activity        |
| GET, POST | `/admin/courses`                  | List and create courses             |
| POST      | `/admin/courses/:id/update`       | Update a course                     |
| POST      | `/admin/courses/:id/archive`      | Archive a course                    |
| GET, POST | `/admin/subjects`                 | List and create subjects            |
| GET, POST | `/admin/colleges`                 | List and create colleges            |
| POST      | `/admin/colleges/:id/update`      | Update a college                    |
| POST      | `/admin/colleges/:id/archive`     | Archive a college                   |
| GET, POST | `/admin/departments`              | List and create departments         |
| POST      | `/admin/departments/:id/update`   | Update a department                 |
| POST      | `/admin/departments/:id/archive`  | Archive a department                |
| GET       | `/admin/students`                 | Search and list students            |
| GET       | `/admin/students/new`             | New-student form                    |
| GET       | `/admin/students/:id`             | Student detail                      |
| GET       | `/admin/students/:id/edit`        | Student edit form                   |
| POST      | `/admin/students`                 | Create a student                    |
| POST      | `/admin/students/:id/update`      | Update a student                    |
| POST      | `/admin/students/:id/archive`     | Archive a student and disable login |
| GET       | `/admin/teachers`                 | Search and list teachers            |
| GET       | `/admin/teachers/new`             | New-teacher form                    |
| GET       | `/admin/teachers/:id`             | Teacher detail                      |
| GET       | `/admin/teachers/:id/edit`        | Teacher edit form                   |
| POST      | `/admin/teachers`                 | Create a teacher                    |
| POST      | `/admin/teachers/:id/update`      | Update a teacher                    |
| POST      | `/admin/teachers/:id/archive`     | Archive a teacher and disable login |
| GET       | `/admin/assignments`              | List teaching assignments           |
| POST      | `/admin/assignments/:id/decision` | Approve or reject an assignment     |
| GET       | `/admin/academic-structure`       | View academic structure             |

### Student and teacher routes

| Method | URL               | Access / purpose                                     |
| ------ | ----------------- | ---------------------------------------------------- |
| GET    | `/student`        | Student dashboard                                    |
| POST   | `/student/enroll` | Enroll the signed-in student in an available subject |
| GET    | `/teacher`        | Teacher dashboard and assignments                    |

`:id` is a MongoDB document ID and `:slug` is a university slug. Query-string parameters are used for search, filters, and pagination.

## Authentication and request flow

1. Express parses URL-encoded form bodies and serves `public/`.
2. Express session middleware loads the session; flash middleware makes the current user and flash message available to EJS.
3. Route authorization middleware checks login and role before protected routes run.
4. Routes validate submitted form data, query or update Mongoose models, then render an EJS template or redirect.
5. Authentication passwords are stored as bcrypt hashes. The admin login is separate from public student/teacher login.

## Main data models

The models are defined in `models/index.js` and include `University`, `College`, `Department`, `Course`, `CollegeCourse`, `Semester`, `Subject`, `SemesterSubject`, `Student`, `StudentLogin`, `Teacher`, `TeacherLogin`, `Admin`, `AdminLogin`, `Enrollment`, `TeachingAssignment`, `LoginActivity`, and `ManagementActivity`.

## API and CORS

The app is currently a server-rendered web application, not a standalone JSON API. Browser forms and static assets use same-origin paths, so no CORS middleware or frontend API URL is required. `/health` is the main JSON endpoint and reports whether Mongoose is connected.

## Real-Time Architecture (Socket.IO)

Socket.IO is mounted on the shared HTTP server in `services/socketService.js` and initialized in `server.js`.

- **Transport Strategy**: Configured with `["websocket", "polling"]` (WebSocket preferred). This prevents the HTTP long-polling error `400 Bad Request: {"code":1,"message":"Session ID unknown"}` by establishing a single full-duplex TCP/WebSocket connection instead of ephemeral polling session requests.
- **Connection State Recovery**: Built-in `connectionStateRecovery` buffers packets and preserves socket rooms and states across brief disconnections.
- **Client Manager (`/js/socket-client.js`)**: A centralized singleton helper (`window.getCampusSocket()`) shared by notifications and chat. Includes automatic recovery on `connect_error` (`xhr poll error` / HTTP 400 status) to reset stale sessions and cleanly renegotiate handshakes.
- **Clustering / Persistent Store Support**: Supports optional Redis clustering when `REDIS_URL` is configured in environment variables (`@socket.io/redis-adapter`). For multi-node load balancing without Redis, sticky sessions (e.g. `ip_hash` in Nginx) should be enabled on the reverse proxy.

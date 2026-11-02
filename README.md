# CampusDesk

CampusDesk is a learning-focused campus management web application built with Node.js, Express, EJS, and MongoDB. It combines a public university directory with authenticated portals for students, teachers, and administrators.

## What is implemented

- Public university search with state/program filters, pagination, source-linked directory entries, and detail pages.
- Separate student, teacher, and admin accounts; role-protected dashboards and admin super-admin/college-admin scopes.
- Admin tools for colleges, departments, courses, subjects, students, teachers, teaching assignments, academic sessions, fees, announcements, and activity.
- Student views for enrollment, attendance, assignments/submissions, grades, fees, and announcements.
- Teacher views for attendance, assignments and submissions, grading, student rosters, and announcements.
- Authenticated chat, online presence, notifications, and role-targeted announcements using Socket.IO.
- Admin spreadsheet/PDF reports, login activity, and management activity records.
- Responsive layouts and a light/dark theme switch.

Some account-delivery workflows are intentionally incomplete: there is no configured email/SMS provider. Signup OTPs are shown only outside production; password reset returns an unavailable response in production. See [production notes](./BACKEND.md#production-and-known-limitations).

## Technology stack

| Area | Technologies |
| --- | --- |
| Runtime and server | Node.js, Express |
| Views and client | EJS, HTML, CSS, browser JavaScript |
| Database | MongoDB, Mongoose |
| Authentication | `express-session`, `bcryptjs`, `jsonwebtoken` |
| Real-time communication | Socket.IO |
| Reports | ExcelJS, PDFKit |
| Tests | Node.js test script, Supertest, Playwright |
| Browser UI libraries | Bootstrap 5, Bootstrap Icons, and Chart.js loaded from CDNs |

Express renders the pages and serves static assets from one origin; there is no separate frontend server. See [FRONTEND.md](./FRONTEND.md), [BACKEND.md](./BACKEND.md), and the [API reference](./API.md) for details.

## Project flow

1. A browser requests an Express page or submits a form / JSON request.
2. Express parses the request, serves static files, sanitizes request values, and loads the session and flash state.
3. The mounted route applies authentication/role checks, validates input, and reads or writes data through Mongoose.
4. The response is an EJS page, a redirect with a flash message, a JSON response, or a generated report.
5. Authenticated chat and notification events use Socket.IO on the same HTTP server and share the session middleware.

## Project structure

| Path | Responsibility |
| --- | --- |
| `server.js` | Express setup, middleware, route mounts, Socket.IO initialization, errors, database startup, and HTTP listener |
| `config/db.js` | MongoDB/Mongoose connection |
| `models/index.js` | Mongoose schemas and models |
| `routes/` | Auth, directory, admin, student, teacher, chat, notification, and admin JSON handlers |
| `middleware/` | Session role checks, flash messages, request sanitization, and auth rate limiter |
| `services/` | Socket.IO service and PDF/XLSX report generation |
| `views/` | EJS pages and shared layout partials |
| `public/` | Shared CSS and browser-side JavaScript |
| `scripts/` | Idempotent seed and explicit admin password reset |
| `tests/` | API/security checks and browser end-to-end checks |

## Requirements and local setup

1. Install a supported Node.js LTS release and run MongoDB locally or provide a hosted MongoDB URI.
2. Install project dependencies:

   ```powershell
   npm install
   ```

3. Copy `.env.example` to `.env`. Set a private MongoDB URI, a long random `SESSION_SECRET`, and unique initial admin credentials. Never commit `.env` or paste real secrets into documentation.
4. Seed sample and directory data:

   ```powershell
   npm run db:seed
   ```

   The seed is designed to be re-run without resetting existing passwords or deleting admin accounts. Demo student/teacher login records are created only when the corresponding `DEMO_STUDENT_PASSWORD` / `DEMO_TEACHER_PASSWORD` is configured and a login is absent. Demo accounts and data are not real records.

5. Start the development server:

   ```powershell
   npm run dev
   ```

6. Open `http://localhost:8000`. Check `http://localhost:8000/health` for the application and database status. The public directory is at `/colleges`.

The server requires `SESSION_SECRET`. `MONGO_URI` defaults to `mongodb://127.0.0.1:27017/student_management`; `PORT` defaults to `8000`, and `HOST` defaults to `0.0.0.0`. Additional supported variables and behavior are documented in [BACKEND.md](./BACKEND.md#environment-variables).

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run with Nodemon |
| `npm start` | Run with Node.js |
| `npm run db:seed` | Add or update seed data |
| `npm run admin:reset-password` | Explicitly reset the admin matching `ADMIN_EMAIL` |
| `npm test` | Run the Node/Supertest API and service checks |
| `npm run test:e2e` | Run Playwright browser tests; the app must already be running |

For E2E tests, set `BASE_URL` if the server is not at `http://localhost:8000`. See the [testing guide](./BACKEND.md#testing).

## Local network testing

To open CampusDesk from a phone on the same Wi-Fi, start the app on the computer and browse to `http://<computer-ip>:8000` from the phone. Find the current address with `ipconfig` on Windows. Allow only the app port through the local firewall if needed; do not expose MongoDB's port to the phone or the public network.

## Production and data notes

CampusDesk is a learning project and has not been security-audited. Before using real student data, configure a persistent session store, HTTPS, strong and separate session/JWT secrets, appropriate Socket.IO origin restrictions, CSRF protection, production OTP/password-reset delivery, and institutional privacy/retention policies. See [BACKEND.md](./BACKEND.md#production-and-known-limitations).


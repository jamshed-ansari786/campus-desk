# Backend guide

## Runtime and architecture

CampusDesk is a Node.js/Express server-rendered application. `server.js` creates one HTTP server, configures Express and the EJS view engine, attaches Socket.IO, mounts the route modules, connects to MongoDB, and starts listening. The same server handles rendered pages, JSON endpoints, static files, report downloads, and sockets.

### Request path

1. `dotenv` loads environment values.
2. Express parses JSON and URL-encoded forms, serves `public/`, and runs NoSQL-key sanitization/security headers.
3. `express-session` reads or creates the `sms.sid` session; flash middleware exposes `currentUser` and one-time `flash` values to EJS.
4. A mounted route checks the current session or bearer token, applies role/scope rules, validates input, and calls Mongoose models or services.
5. The route renders EJS, redirects, returns JSON, or sends a PDF/XLSX file. Unhandled errors are logged and rendered with the error view.

## Key files

| Path | Responsibility |
| --- | --- |
| `server.js` | App wiring, middleware order, routes, HTTP server, Socket.IO, and startup |
| `config/db.js` | Mongoose connection using `MONGO_URI` or the local default |
| `models/index.js` | All Mongoose models and schema relationships |
| `routes/auth.js` | Web login/signup/recovery and JSON token/session auth |
| `routes/colleges.js` | Public university listing and detail |
| `routes/admin.js` | Admin pages, management actions, and report exports |
| `routes/admin-api.js` | `/api/admin` statistics and list responses |
| `routes/student.js`, `routes/teacher.js` | Role-specific portals and academic operations |
| `routes/chat.js`, `routes/notifications.js` | Chat APIs/page, notification APIs, announcement API |
| `middleware/auth.js` | Session roles, bearer-token support, and chat eligibility helper |
| `middleware/flash.js` | Per-request EJS locals for user and flash state |
| `middleware/security.js` | Removes `$` / dot keys from request objects and sets basic headers |
| `middleware/rateLimiter.js` | Authentication limiter and an API limiter definition |
| `services/socketService.js` | Socket authentication, rooms, presence, chat events, and broadcasts |
| `services/reportService.js` | XLSX and PDF buffer generation |
| `scripts/seed.js` | Idempotent sample, academic, and directory data seeding |
| `scripts/reset-admin-password.js` | Explicit password reset for the admin matching `ADMIN_EMAIL` |

The route mount prefixes are `/` for auth/chat/notification, `/colleges`, `/admin`, `/api/admin`, `/student`, and `/teacher`. The full method/path list and request contracts are in [API.md](./API.md).

## Declared npm dependencies

The versions are maintained in `package.json` and `package-lock.json`.

| Dependency | Use |
| --- | --- |
| `express` | HTTP server and routing |
| `ejs` | Server-rendered views |
| `mongoose` | MongoDB models and database access |
| `express-session` | Browser sessions |
| `bcryptjs` | Password hashing |
| `jsonwebtoken` | Bearer-token authentication |
| `express-rate-limit` | Authentication request limiter |
| `socket.io` | Real-time transport |
| `exceljs`, `pdfkit` | XLSX and PDF reports |
| `dotenv` | Load local environment configuration |
| `nodemon` (development) | Restart the server during development |
| `supertest` (development) | HTTP assertions for the test suite |
| `@playwright/test` (development) | Browser end-to-end testing |

Bootstrap 5, Bootstrap Icons, and Chart.js are loaded from CDNs in the shared EJS header rather than installed as npm dependencies.

## Authentication, authorization, and sessions

- Web roles are `STUDENT`, `TEACHER`, and `ADMIN`. Admin profiles additionally have `SUPER_ADMIN` or `COLLEGE_ADMIN` scope.
- Profile documents (`Student`, `Teacher`, `Admin`) are separate from credential documents (`StudentLogin`, `TeacherLogin`, `AdminLogin`). Passwords are stored as bcrypt hashes.
- Successful web login regenerates the session before attaching the user. The cookie name is `sms.sid`, `httpOnly`, `SameSite=Lax`, and `secure` when `NODE_ENV=production`; its lifetime is eight hours.
- The default Express session store is used; no persistent session store is configured in the project.
- JSON auth at `POST /api/auth/login` returns a signed JWT with a seven-day expiry. `requireApiAuth` accepts either the session or `Authorization: Bearer <token>`.
- `JWT_SECRET` takes precedence for JWT signing; the implementation falls back to `SESSION_SECRET` and then an internal development fallback. Configure a separate strong `JWT_SECRET` for deployments that issue tokens.
- Login, admin login, password request/reset, and API login use a per-IP limit of 30 requests per 15 minutes. The API limiter is defined in `middleware/rateLimiter.js` but is not mounted on the current routes.
- Admin routes first require role `ADMIN`. College admins are scoped to their assigned college where supported; course/subject management, certain college operations, admin account management, academic-structure summary, and academic-session management require `SUPER_ADMIN`.
- Web form routes generally redirect unauthenticated users to `/login`; JSON auth middleware responds with `401`, and role failures with `403`.

## MongoDB models

All 29 exported models are defined in `models/index.js` with timestamps. The schema list and major references are documented in [CAMPUS_DESK_DOCUMENTATION.md](./CAMPUS_DESK_DOCUMENTATION.md#data-models-and-relationships). Main relationship chain:

`University → College → Department`; `College + Course → CollegeCourse → Semester → SemesterSubject ← Subject`; students enroll in semester subjects, and teachers receive teaching assignments for them.

Profiles and logins are separate. Attendance, grades, assignments/submissions, fees, academic sessions, announcements, notifications, chat conversations/messages, login activity, and management activity are also persisted. `FeeRecord` embeds payment transactions; there is no separate exported FeeTransaction model.

## Environment variables

`.env.example` contains the core local settings. Use placeholders in documentation and keep actual `.env` values private.

| Variable | Required / default | Purpose |
| --- | --- | --- |
| `MONGO_URI` | Optional; local default is `mongodb://127.0.0.1:27017/student_management` | MongoDB connection string. |
| `SESSION_SECRET` | Required to start | Express session signing secret. |
| `PORT` | Optional; `8000` | HTTP port. |
| `HOST` | Optional; `0.0.0.0` | Listen interface. |
| `NODE_ENV` | Optional | `production` enables secure session cookies, hides signup OTPs, and disables password reset until delivery is configured. |
| `JWT_SECRET` | Optional in code; set a strong secret when using JWT auth | JWT signing secret; see fallback behavior above. |
| `ADMIN_EMAIL` | Needed to create the initial admin / reset a password | Email identifying the configured admin. |
| `ADMIN_PASSWORD` | Needed to create an initial admin or run password reset | Initial seed password must be 8–72 UTF-8 bytes; the reset script requires 12–72 bytes with uppercase, lowercase, number, and special character. |
| `ADMIN_USERNAME` | Optional | Admin login name; falls back to `ADMIN_EMAIL` where used. |
| `DEMO_STUDENT_PASSWORD` | Optional | Creates the demo student login only when absent; 8–72 UTF-8 bytes. |
| `DEMO_TEACHER_PASSWORD` | Optional | Creates the demo teacher login only when absent; 8–72 UTF-8 bytes. |
| `BASE_URL` | Optional; E2E default `http://localhost:8000` | Playwright target URL. |
| `REDIS_URL` | Optional code path | Attempts a Redis Socket.IO adapter, but `redis` and `@socket.io/redis-adapter` are not in the current package manifest; installing/configuring them is required before this mode can work. |

## Install, seed, and run

```powershell
npm install
Copy-Item .env.example .env
# Edit .env with local MongoDB and unique secret/admin values.
npm run db:seed
npm run dev
```

`npm start` runs `node server.js`. The seed script is idempotent and does not reset existing admin passwords or delete collections. Optional demo credentials create demo login documents only when the corresponding login is absent. The admin reset command changes the password only for the active admin matching `ADMIN_EMAIL`:

```powershell
npm run admin:reset-password
```

## Testing

```powershell
npm test
```

This runs `tests/api.test.js`, which covers home/health/auth rendering, protected-route redirects, JWT helpers, chat permission helper cases, NoSQL sanitization, XLSX/PDF generation, static Socket.IO assets, and Socket.IO recovery configuration.

For browser tests, first start CampusDesk and ensure its MongoDB connection is available, then run in another terminal:

```powershell
npm run test:e2e
```

Playwright uses `tests/e2e.spec.js`, Chromium, `BASE_URL` (default `http://localhost:8000`), and checks page rendering, protected redirects, theme switching/readability, guest socket behavior, and admin navigation layout. The config does not start the web server automatically.

## Troubleshooting

| Symptom | Checks |
| --- | --- |
| Server exits with “Missing SESSION_SECRET” | Copy `.env.example` to `.env` and set a long random `SESSION_SECRET`. |
| Startup reports a MongoDB connection failure, or `/health` says `disconnected` | Confirm MongoDB is running and `MONGO_URI` points to a reachable database. The default is local MongoDB on port 27017. |
| Port 8000 is already occupied | Set another `PORT` and use the new port in the browser URL and any local firewall rule. |
| `npm run db:seed` cannot create the first admin | Set valid `ADMIN_EMAIL` and `ADMIN_PASSWORD` values; the initial seed password must be 8–72 UTF-8 bytes. |
| Admin password reset fails | Confirm the matching admin exists and is active. The reset script requires 12–72 UTF-8 bytes and uppercase, lowercase, numeric, and special characters. |
| Playwright cannot connect | Start the app separately, verify its health endpoint, then set `BASE_URL` to that server. If Chromium is missing, run `npx playwright install chromium`. |
| Mobile device cannot reach the app | Confirm both devices are on the same network, use the computer's current LAN IP, and allow only the app port on the private network. Keep MongoDB private. |
| Existing MongoDB data prevents phone indexes from building | Student and teacher phone fields use unique sparse indexes. Resolve duplicate non-empty phone values in each collection before index creation. |

## Production and known limitations

- Signup has no email/SMS provider. The generated OTP is only rendered outside production, so production signup cannot complete until delivery is integrated.
- Password reset intentionally responds with `503` in production until email delivery is integrated. In non-production the code is shown in the page.
- The default in-memory session store is not suitable for multi-process/persistent production use.
- Configure HTTPS, separate strong session/JWT secrets, a persistent session store, CSRF protections, and appropriate rate limiting.
- Socket.IO currently allows all origins in its CORS configuration. Restrict origins before exposing the service publicly.
- `REDIS_URL` support is conditional on optional packages that are not installed in the current manifest; without them it logs a warning and does not provide clustered delivery.
- MongoDB should remain private. Limit network/firewall access to the Express port.
- Profile images and assignment files are URL fields; the app does not upload or store those files.
- The app is a learning project and is not security-audited. Define privacy, retention, backup, and incident-response policies before handling real student records.

# Student Management System (CampusDesk)

A learning-focused college management application built with Node.js, Express, EJS, CSS, and MongoDB/Mongoose. Existing records use separate student, teacher, and admin login collections with bcrypt password hashes.

## Current features

- Role-protected student, teacher, and admin dashboards.
- Public university directory at `/colleges`, with search, location/program filters, pagination, source-linked profiles, and official websites.
- Ten university directory records are added idempotently by the seed script. Each university remains separate from its affiliated `College` records.
- Admin college, department, course, student, and teacher management.
- Student and teacher profiles support optional contact, department, academic, and profile-image URL fields.
- Student and teacher archive actions disable their login while retaining academic and activity history.
- Course offerings are represented through `CollegeCourse`; the directory lists only programs recorded with official source URLs.
- Search and pagination for student and teacher lists.
- Admin dashboard statistics, recent registrations, login activity, and management activity.
- Light theme throughout the application.
- Login history is stored separately in the `LoginActivity` model; passwords are hashed with bcrypt.
- Role-based route access, flash messages, and responsive EJS/CSS pages.

## Technologies

| Area | Technologies |
| --- | --- |
| Runtime and server | Node.js, Express |
| Frontend | EJS templates, HTML, CSS, browser-side JavaScript |
| Database | MongoDB, Mongoose |
| Authentication and sessions | `express-session`, `bcryptjs`, JSON Web Tokens |
| Real-time features | Socket.IO for chat and notifications |
| Reports | ExcelJS (spreadsheets), PDFKit (PDFs) |
| Testing | Node.js test runner with Supertest, Playwright for end-to-end tests |

Express renders the frontend and serves static assets from the same origin; there is no separate frontend application or API server.

## Project flow

1. The browser requests a page or submits a form to the Express application.
2. Express parses the request, serves static files when applicable, sanitizes request data, and loads the user's session and flash messages.
3. The mounted route handles the request. Authentication and role middleware protect restricted pages and actions, and route handlers validate submitted data.
4. Route handlers read or update MongoDB through the Mongoose models.
5. Express returns a rendered EJS page, a redirect with a flash message, or JSON for endpoints such as `/health`.
6. Chat and notification events use Socket.IO on the same HTTP server and share the Express session middleware.

## Architecture

CampusDesk is a server-rendered, layered Express application. Routes coordinate requests and responses, middleware handles shared concerns such as sessions and authorization, Mongoose models define persisted data, and EJS views render the user interface.

| Path | Responsibility |
| --- | --- |
| `server.js` | Application entry point; configures Express, middleware, Socket.IO, routes, error handling, database startup, and the HTTP listener |
| `config/db.js` | Connects to MongoDB through Mongoose |
| `routes/` | Authentication, public university directory, admin, student, teacher, chat, notification, and admin API handlers |
| `middleware/` | Authentication and role checks, flash messages, request sanitization, and rate limiting |
| `models/index.js` | Mongoose schemas and models for accounts, academic records, directory data, and activity |
| `services/` | Socket.IO initialization and report generation |
| `views/` | EJS pages and shared partials for the public site and role-specific dashboards |
| `public/` | Browser JavaScript and shared CSS served by Express |
| `scripts/` | Database seeding and the explicit admin password-reset command |
| `tests/` | API/integration tests and Playwright end-to-end tests |

## Requirements

1. Node.js LTS
2. MongoDB (local or hosted)
3. VS Code (optional)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and configure `MONGO_URI`, a long random `SESSION_SECRET`, and a unique initial admin email and password (8–72 UTF-8 bytes). `ADMIN_USERNAME` is optional; if omitted, the email is used. Never commit `.env`.

3. Add or update the idempotent sample and university catalogue records:

   ```bash
   npm run db:seed
   ```

   The seed does not delete admin accounts or reset existing account passwords. It creates demo student/teacher logins only if their matching login is absent and the optional `DEMO_STUDENT_PASSWORD` / `DEMO_TEACHER_PASSWORD` is set (8–72 UTF-8 bytes). Existing logins are left unchanged. These sample profiles are not real people; do not use them for real student data.

4. Start the site:

   ```bash
   npm run dev
   ```

5. Visit `http://localhost:8000`. The university directory is available at `http://localhost:8000/colleges`.

## Test from a phone on the same network

This is an Express/EJS application; Express serves both the pages and static assets. There is no separate frontend development server or browser API origin to configure, so browser requests use same-origin paths and do not need CORS. The app uses MongoDB/Mongoose, not MySQL. Keep MongoDB running locally and do not expose its port to the phone.

The server binds to `0.0.0.0` by default (override with `HOST` if needed). To use the laptop IPv4 address `172.16.16.245`:

1. Start MongoDB locally on the laptop.
2. In PowerShell, open the project folder and run:

   ```powershell
   npm install
   npm run dev
   ```

   `npm install` is only needed when installing dependencies for the first time or after dependency changes.

3. On the laptop, verify `http://localhost:8000/health` returns JSON with `"status":"ok"` and `"database":"connected"`.
4. Connect the Android phone to the same Wi-Fi network or hotspot, then open `http://172.16.16.245:8000` in its browser. The health endpoint can also be checked at `http://172.16.16.245:8000/health`.

If the laptop's network is marked Private, allow only the app's TCP port through Windows Firewall (run PowerShell as Administrator):

```powershell
New-NetFirewallRule -DisplayName "Student Management System TCP 8000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8000 -Profile Private -RemoteAddress LocalSubnet
```

Do not create an inbound firewall rule for MongoDB (normally port 27017). Check the current laptop IPv4 address with `ipconfig`; if it changed, use the address on the active Wi-Fi adapter in the phone URL. If local health works but the phone cannot connect, confirm both devices use the same network, verify the network profile is Private (`Get-NetConnectionProfile`), check whether client/AP isolation is enabled on the router/hotspot, and confirm the server is listening on port 8000 (`Get-NetTCPConnection -LocalPort 8000 -State Listen`). If port 8000 is already occupied, choose another `PORT` in `.env` and use that port in both the firewall rule and phone URL.

The admin account is initialized from `ADMIN_EMAIL`, optional `ADMIN_USERNAME`, and `ADMIN_PASSWORD` only if an admin login needs to be created. The seed never prints passwords. Student and teacher login uses `/login` with the account email and password; administrator login is separate at `/admin/login`.

To intentionally change an existing admin password, set a new strong `ADMIN_PASSWORD` in `.env` and run `npm run admin:reset-password`. The reset command only updates the login for the admin matching `ADMIN_EMAIL`; normal database seeding does not overwrite existing admin passwords.

## University directory data and sources

University names, locations, official websites, and available program names are stored with source URLs in the `universities` collection. The listed institutions are directory entries, not a claim that every example course is offered at every university.

Only program information found in the official sources is listed. If a department name, public contact, logo, or image could not be verified, the page identifies it as unavailable. Official logo links are used only where found on university-owned domains. Campus photos are omitted where reuse/linking permission could not be verified.

The ten directory entries are University of Delhi, Banaras Hindu University, Jawaharlal Nehru University, Jamia Millia Islamia, Aligarh Muslim University, University of Mumbai, University of Calcutta, University of Allahabad, Indira Gandhi National Open University, and University of Hyderabad.

## Existing data and archive behavior

Schema additions are optional where they apply to existing student, teacher, course, college, and university documents. No database collection is dropped by the application. Student and teacher phone fields now have unique sparse indexes; resolve any duplicate phone values already stored in either collection before MongoDB can build those indexes. Student, teacher, college, department, and course archive actions preserve referenced academic records; student and teacher archive actions also disable their login.

Public signup creates student and teacher accounts only; admin roles cannot be selected during signup or student/teacher login. Signup validates names, email, Indian mobile numbers, OTP, and password on both the browser and server. The OTP expires after five minutes and is limited to five attempts per signup session, with a five-minute lockout after the limit is reached. In local development, the OTP is displayed in the signup page because this project has no configured email/SMS provider; configure an OTP delivery provider before enabling public signup in production. Forgot-password requests are available from both login pages. Reset codes are shown only in non-production environments, expire after five minutes, and are limited to five attempts; production password reset returns an explicit unavailable response until email delivery is configured and integrated. Successful signup logs the user in and opens the corresponding dashboard. Student signup does not require a pre-existing college/course assignment; the account dashboard remains usable and displays that academic placement is pending until an administrator assigns it.

## Important production considerations

This remains a learning project, not a fully security-audited production service. Before using real student data, configure a persistent Express session store, add CSRF protection and rate limiting, use HTTPS, rotate secrets, and define institutional privacy/retention policies. Profile image fields accept URLs; only use images you are authorized to display.
#   c a m p u s - d e s k  
 #   c a m p u s - d e s k  
 
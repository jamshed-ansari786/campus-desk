# Frontend guide

CampusDesk uses EJS templates rendered by Express, shared CSS, browser JavaScript, and same-origin forms/fetch calls. It is not a separate React/Vue frontend and has no separate development server.

## Frontend files

| Path | Responsibility |
| --- | --- |
| `views/partials/header.ejs` | Document head, CDN assets, theme initialization, navigation, notifications, account menu, and flash messages |
| `views/partials/footer.ejs` | Shared footer and browser script references |
| `views/home.ejs` | Public landing page, navigation, campus assistant, and timed sign-up reminder |
| `views/auth/` | Student/teacher login, admin login, signup, and password recovery |
| `views/colleges/` | Public university directory and detail templates |
| `views/admin/` | Admin dashboard and management pages |
| `views/student/` | Student dashboard, attendance, assignments, grades, and fees |
| `views/teacher/` | Teacher dashboard, attendance, assignments/submissions, grades, and roster |
| `views/chat.ejs` | Authenticated chat interface |
| `views/error.ejs` | Shared error page |
| `views/partials/admin-sidebar.ejs` | Role-aware admin navigation |
| `public/css/style.css` | Shared responsive component styles and light/dark theme tokens |
| `public/js/admin-nav.js` | Responsive admin menu and accordion groups |
| `public/js/app-notifications.js` | Theme persistence, notification dropdown/toasts, and announcement toasts |
| `public/js/socket-client.js` | Shared authenticated Socket.IO connection singleton and reconnect handling |
| `public/js/campus-assistant.js` | Client-side FAQ-style assistant and sign-up reminder behavior |

Bootstrap 5, Bootstrap Icons, and Chart.js are referenced from CDNs in the shared header rather than bundled through npm. The app also serves Socket.IO's browser client from its own server.

## Page and workflow map

| Page / route family | Main user workflow |
| --- | --- |
| `/` | Explore CampusDesk, open the local FAQ-style assistant, or go to signup/login/universities. |
| `/colleges`, `/colleges/:slug` | Search universities by text, state, or program; paginate and view a sourced profile. |
| `/login`, `/admin/login`, `/signup`, `/forgot-password` | Sign in by role, self-register as a student/teacher, or request account recovery. |
| `/admin` | Review dashboard activity and navigate management areas. |
| `/admin/colleges`, `/admin/departments`, `/admin/courses`, `/admin/subjects`, `/admin/academic-structure` | Manage institution and academic catalogue, subject to role scope. |
| `/admin/students`, `/admin/teachers`, `/admin/assignments`, `/admin/admins` | Search/manage people, review teaching assignment decisions, and (super admin) manage admin accounts. |
| `/admin/attendance`, `/admin/fees`, `/admin/reports`, `/admin/sessions`, `/admin/announcements`, `/admin/activity` | Review attendance, record fee payments, export reports, manage sessions and announcements, and view activity. |
| `/student` and student subroutes | Enroll in available subjects and review attendance, assignments/submissions, grades, fees, and announcements. |
| `/teacher` and teacher subroutes | Review approved subjects and roster, record attendance, create assignments, grade submissions, and publish grades. |
| `/chat` | Open authenticated private chat with role/campus-eligible contacts. |

See [API.md](./API.md) for the complete HTTP routes, methods, query parameters, and form fields.

## Shared layout, theme, and navigation

- EJS pages use shared header/footer partials for consistent navigation, notifications, flash messages, CSS, and scripts.
- The theme toggle switches between light and dark themes. The selection is stored in browser `localStorage` under `theme` and reused on later pages.
- The admin sidebar groups routes, indicates the active page, and collapses/opens at the responsive breakpoint. On mobile, following a link closes the menu.
- Layouts use responsive styles from `public/css/style.css`.

## Browser-side behavior

- Login and signup provide browser validation and inline error targets; server validation remains authoritative.
- The home assistant is an in-page rule-based FAQ helper. It matches questions about accounts, login, and university discovery, then links to existing pages; it does not call an AI service.
- The home-page account reminder appears after 10 seconds. Dismissing it stores a flag in `sessionStorage` for that tab/session.
- Authenticated pages load notification data from `/api/notifications`, show real-time notification/announcement toasts, and can mark notifications read.
- The chat client uses the shared Socket.IO connection manager. Guest pages do not start an authenticated socket connection.

## Forms and same-origin APIs

Most interactions are standard HTML form submissions. The notification and chat features also use authenticated same-origin JSON endpoints and Socket.IO. Since pages and static files are served by Express from the same origin, no separate frontend API base URL or CORS setup is required for normal browser use.

To run locally:

```powershell
npm install
npm run dev
```

Configure `.env` and MongoDB first; see the [README](./README.md#requirements-and-local-setup).


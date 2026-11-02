# Frontend Guide

CampusDesk uses **EJS templates, CSS, and browser-side JavaScript** for its frontend. It is a server-rendered application: Express renders the pages and also serves the static files. There is no separate React/Vue app or frontend development server.

## Frontend files

| Path                                | Responsibility                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `views/`                            | EJS page templates rendered by Express                                               |
| `views/partials/header.ejs`         | Shared page head, navigation, flash messages, and page opening                       |
| `views/partials/footer.ejs`         | Shared footer and browser-side script references                                     |
| `views/auth/`                       | Signup, student/teacher login, and admin login templates                             |
| `views/colleges/`                   | University directory and detail templates                                            |
| `views/admin/`                      | Admin dashboard and management screens                                               |
| `views/student/dashboard.ejs`       | Student portal and subject enrollment interface                                      |
| `views/teacher/dashboard.ejs`       | Teacher portal and assignment interface                                              |
| `views/home.ejs`, `views/error.ejs` | Public home and error pages                                                          |
| `public/css/style.css`              | Shared responsive styling, components, and light theme variables                     |
| `public/js/campus-assistant.js`     | Landing-page campus assistant and delayed account reminder                          |
| `public/js/admin-nav.js`            | Responsive admin sidebar collapse and mobile-menu behavior                          |

## Pages and frontend URLs

The browser navigates to these routes, which are rendered by the backend:

| URL                                     | Page                                                 |
| --------------------------------------- | ---------------------------------------------------- |
| `/`                                     | Home or role-specific dashboard redirect             |
| `/login`                                | Student and teacher login                            |
| `/admin/login`                          | Admin login                                          |
| `/signup`                               | Student/teacher signup and OTP/password verification |
| `/colleges`                             | Searchable university directory                      |
| `/colleges/:slug`                       | University detail page                               |
| `/admin`                                | Admin dashboard                                      |
| `/admin/courses`, `/admin/subjects`     | Course and subject management                        |
| `/admin/colleges`, `/admin/departments` | College and department management                    |
| `/admin/students`, `/admin/teachers`    | Student and teacher management                       |
| `/admin/assignments`                    | Teaching assignment review                           |
| `/admin/academic-structure`             | Academic structure page                              |
| `/student`                              | Student dashboard and subject enrollment             |
| `/teacher`                              | Teacher dashboard                                    |

Several management pages have additional detail, create, edit, archive, and action URLs. See [BACKEND.md](./BACKEND.md) for the complete HTTP route list.

## Styling

- Shared design tokens, layout rules, form styles, tables, responsive breakpoints, and role-specific styling live in `public/css/style.css`.
- The shared header sets the application theme to light; there is no theme toggle or saved theme preference.
- Admin pages receive a distinct admin body class and use the same light theme as the rest of the application.
- EJS templates use the shared header/footer partials to keep navigation, flash messages, CSS, and scripts consistent.
- The public home page includes an FAQ-style campus assistant that links visitors to the existing account and university pages. A sign-in/sign-up reminder appears 10 seconds after the first home-page visit in a tab; dismissing it prevents it from appearing again in that tab.
- Admin pages share the same role-aware sidebar, active-page indicator, and responsive navigation toggle. Sidebar groups behave as accordions: opening a group closes the others, and the group containing the current admin page opens by default. The sidebar remains available on every admin route with light-theme contrast styles.

## Forms and browser validation

Signup and login include browser-side validation and accessible inline error targets. These checks improve usability but do not replace server validation; the backend validates all submitted data independently.

The current app uses same-origin form actions and static URLs. Since the browser and Express server share an origin, there is no separate frontend API base URL or CORS configuration to maintain.

## Run the application

Run the Express app from the project root:

```powershell
npm install
npm run dev
```

Express serves both the rendered frontend and static assets on the configured `PORT` (default `8000`). There is no second frontend server to start.

const assert = require("assert");
const request = require("supertest");
const { app } = require("../server");
const { generateToken, verifyToken, canUsersChat } = require("../middleware/auth");
const { sanitizeNoSql } = require("../middleware/security");
const { generateExcel, generatePDF } = require("../services/reportService");
const { Admin, AdminLogin } = require("../models");

async function runTests() {
  console.log("=========================================");
  console.log("   CampusDesk API & Security Test Suite  ");
  console.log("=========================================\n");

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         Error: ${err.message}`);
      failed++;
    }
  }

  // 1. Health & Home Check
  await test("GET /health returns 200 with status ok", async () => {
    const res = await request(app).get("/health");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, "ok");
  });

  await test("GET / renders home page for unauthenticated guest", async () => {
    const res = await request(app).get("/");
    assert.strictEqual(res.status, 200);
    assert.ok(res.text.includes("CampusDesk"));
  });

  await test("GET /login renders login form", async () => {
    const res = await request(app).get("/login");
    assert.strictEqual(res.status, 200);
    assert.ok(res.text.includes("Login"));
    assert.ok(res.text.includes('href="/forgot-password"'));
  });

  await test("GET /forgot-password renders the account recovery form", async () => {
    const res = await request(app).get("/forgot-password");
    assert.strictEqual(res.status, 200);
    assert.ok(res.text.includes("Forgot your password?"));
    assert.ok(res.text.includes('action="/forgot-password"'));
  });

  await test("GET /admin/login includes the forgot password link", async () => {
    const res = await request(app).get("/admin/login");
    assert.strictEqual(res.status, 200);
    assert.ok(res.text.includes('href="/forgot-password"'));
  });

  await test("POST /forgot-password rejects invalid email addresses", async () => {
    const res = await request(app)
      .post("/forgot-password")
      .type("form")
      .send({ email: "not-an-email" });
    assert.strictEqual(res.status, 400);
    assert.ok(res.text.includes("Enter a valid email address."));
  });

  await test("Admin account and credential statuses use their own allowed values", () => {
    const admin = new Admin({
      name: "Campus Administrator",
      email: "admin-status@test.com",
      role: "COLLEGE_ADMIN",
      status: "INACTIVE",
    });
    const adminLogin = new AdminLogin({
      adminId: "660000000000000000000001",
      username: "admin-status@test.com",
      passwordHash: "hashed-password",
      status: "DISABLED",
    });

    assert.strictEqual(admin.validateSync(), undefined);
    assert.strictEqual(adminLogin.validateSync(), undefined);
  });

  // 2. Role-Based Access Control (RBAC) Protection
  await test("GET /admin redirects unauthenticated users to /login", async () => {
    const res = await request(app).get("/admin");
    assert.strictEqual(res.status, 302);
    assert.ok(res.headers.location.includes("/login"));
  });

  await test("GET /teacher redirects unauthenticated users to /login", async () => {
    const res = await request(app).get("/teacher");
    assert.strictEqual(res.status, 302);
    assert.ok(res.headers.location.includes("/login"));
  });

  await test("GET /student redirects unauthenticated users to /login", async () => {
    const res = await request(app).get("/student");
    assert.strictEqual(res.status, 302);
    assert.ok(res.headers.location.includes("/login"));
  });

  await test("GET /chat redirects unauthenticated users to /login", async () => {
    const res = await request(app).get("/chat");
    assert.strictEqual(res.status, 302);
    assert.ok(res.headers.location.includes("/login"));
  });

  // 3. JWT Authentication & Token Signing
  await test("JWT generateToken and verifyToken work correctly", () => {
    const userPayload = {
      id: "660000000000000000000001",
      name: "Dr. Admin",
      email: "admin@test.com",
      role: "ADMIN",
      adminRole: "SUPER_ADMIN",
    };
    const token = generateToken(userPayload);
    assert.ok(typeof token === "string" && token.length > 20);

    const decoded = verifyToken(token);
    assert.ok(decoded);
    assert.strictEqual(decoded.id, userPayload.id);
    assert.strictEqual(decoded.role, "ADMIN");
    assert.strictEqual(decoded.adminRole, "SUPER_ADMIN");
  });

  await test("GET /api/auth/me returns 401 without token", async () => {
    const res = await request(app).get("/api/auth/me");
    assert.strictEqual(res.status, 401);
  });

  await test("GET /api/auth/me returns 200 and user payload with valid Bearer token", async () => {
    const token = generateToken({
      id: "660000000000000000000002",
      name: "Student Alpha",
      email: "student@test.com",
      role: "STUDENT",
    });
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.user.name, "Student Alpha");
    assert.strictEqual(res.body.user.role, "STUDENT");
  });

  // 4. Private Chat Permission Rules
  await test("canUsersChat allows Admin to chat with Teacher", async () => {
    const admin = { id: "660000000000000000000001", role: "ADMIN", name: "Admin" };
    const teacher = { id: "660000000000000000000002", role: "TEACHER", name: "Teacher" };
    const allowed = await canUsersChat(admin, teacher);
    assert.strictEqual(allowed, true);
  });

  await test("canUsersChat allows Admin to chat with Student", async () => {
    const admin = { id: "660000000000000000000001", role: "ADMIN", name: "Admin" };
    const student = { id: "660000000000000000000003", role: "STUDENT", name: "Student" };
    const allowed = await canUsersChat(admin, student);
    assert.strictEqual(allowed, true);
  });

  await test("canUsersChat strictly forbids Student from chatting with another Student", async () => {
    const student1 = { id: "660000000000000000000003", role: "STUDENT", name: "Student 1" };
    const student2 = { id: "660000000000000000000004", role: "STUDENT", name: "Student 2" };
    const allowed = await canUsersChat(student1, student2);
    assert.strictEqual(allowed, false);
  });

  await test("canUsersChat forbids user from chatting with themselves", async () => {
    const user = { id: "660000000000000000000001", role: "ADMIN", name: "Admin" };
    const allowed = await canUsersChat(user, user);
    assert.strictEqual(allowed, false);
  });

  // 5. NoSQL Injection Sanitization
  await test("sanitizeNoSql strips malicious MongoDB operator keys ($gt, $ne, dot notation)", () => {
    const req = {
      body: {
        username: "admin",
        password: { $gt: "" },
        "nested.key": "val",
      },
      query: {
        filter: { $ne: null },
      },
      params: {},
    };
    const res = { setHeader: () => {} };
    let called = false;
    sanitizeNoSql(req, res, () => {
      called = true;
    });

    assert.ok(called);
    assert.strictEqual(req.body.username, "admin");
    assert.strictEqual(req.body.password.$gt, undefined);
    assert.strictEqual(req.body["nested.key"], undefined);
    assert.strictEqual(req.query.filter.$ne, undefined);
  });

  // 6. Reports Generation (Excel & PDF)
  await test("Report service generates valid Excel buffer", async () => {
    const buffer = await generateExcel({
      title: "Test Report",
      columns: [
        { header: "Name", key: "name" },
        { header: "Score", key: "score" },
      ],
      rows: [
        { name: "Alice", score: 95 },
        { name: "Bob", score: 88 },
      ],
    });
    assert.ok(Buffer.isBuffer(buffer));
    assert.ok(buffer.length > 100);
  });

  await test("Report service generates valid PDF buffer", async () => {
    const buffer = await generatePDF({
      title: "Test PDF Report",
      headers: ["Student", "Grade"],
      rows: [
        ["Alice", "A"],
        ["Bob", "B"],
      ],
    });
    assert.ok(Buffer.isBuffer(buffer));
    // PDF files start with %PDF
    assert.strictEqual(buffer.slice(0, 4).toString(), "%PDF");
  });

  // 7. Socket.IO & Session Stability
  await test("GET /js/socket-client.js returns client-side socket manager script", async () => {
    const res = await request(app).get("/js/socket-client.js");
    assert.strictEqual(res.status, 200);
    assert.ok(res.text.includes("getCampusSocket"));
    assert.ok(res.text.includes("websocket"));
    assert.ok(res.text.includes("xhr poll error"));
  });

  await test("HTML pages include /socket.io/socket.io.js and /js/socket-client.js", async () => {
    const res = await request(app).get("/");
    assert.strictEqual(res.status, 200);
    assert.ok(res.text.includes("/socket.io/socket.io.js"));
    assert.ok(res.text.includes("/js/socket-client.js"));
  });

  await test("Socket.IO server has connectionStateRecovery and websocket transports enabled", async () => {
    const { getIO } = require("../services/socketService");
    const io = getIO();
    assert.ok(io, "Socket.IO server instance must be initialized");
    assert.deepStrictEqual(io.opts.transports, ["websocket", "polling"]);
    assert.ok(io.opts.connectionStateRecovery, "connectionStateRecovery must be configured");
    assert.strictEqual(io.opts.connectionStateRecovery.skipMiddlewares, true);
  });

  console.log("\n=========================================");
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log("=========================================\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();

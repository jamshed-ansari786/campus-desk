const express = require("express");
const bcrypt = require("bcryptjs");
const { createHash, randomInt, timingSafeEqual } = require("crypto");
const {
  Student,
  StudentLogin,
  Teacher,
  TeacherLogin,
  Admin,
  AdminLogin,
  College,
  LoginActivity,
} = require("../models");
const { requireLogin, generateToken, requireApiAuth } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiter");

const router = express.Router();
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const NAME_PATTERN = /^[\p{L}\s'-]+$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const PHONE_PATTERN = /^[6-9][0-9]{9}$/;

function normalizeName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getSignupData(body) {
  return {
    role: String(body.role || "").toUpperCase(),
    firstName: normalizeName(body.firstName),
    lastName: normalizeName(body.lastName),
    email: String(body.email || "").trim().toLowerCase(),
    phone: String(body.phone || "").trim(),
    otp: String(body.otp || "").trim(),
    password: String(body.password || ""),
    confirmPassword: String(body.confirmPassword || ""),
  };
}

function validateIdentity(data) {
  const errors = {};
  for (const field of ["firstName", "lastName"]) {
    const value = data[field];
    const label = field === "firstName" ? "First name" : "Last name";
    if (!value) errors[field] = `${label} is required.`;
    else if (value.length < 2 || value.length > 50)
      errors[field] = `${label} must be 2–50 characters.`;
    else if (!NAME_PATTERN.test(value))
      errors[field] = "Use letters, spaces, hyphens, or apostrophes only.";
  }
  if (!EMAIL_PATTERN.test(data.email) || data.email.length > 180)
    errors.email = "Enter a valid email address.";
  if (!PHONE_PATTERN.test(data.phone))
    errors.phone = "Enter a 10-digit Indian mobile number starting with 6–9.";
  if (!["STUDENT", "TEACHER"].includes(data.role))
    errors.role = "Choose Student or Teacher.";
  return errors;
}

function validatePassword(password) {
  const errors = {};
  if (!password) {
    errors.password = "Password is required.";
    return errors;
  }
  if (password.length < 8)
    errors.password = "Password must be at least 8 characters.";
  else if (!/[A-Z]/.test(password))
    errors.password = "Add at least one uppercase letter.";
  else if (!/[a-z]/.test(password))
    errors.password = "Add at least one lowercase letter.";
  else if (!/[0-9]/.test(password))
    errors.password = "Add at least one number.";
  else if (!/[^A-Za-z0-9]/.test(password))
    errors.password = "Add at least one special character.";
  else if (Buffer.byteLength(password, "utf8") > 72)
    errors.password = "Password must be no more than 72 UTF-8 bytes.";
  return errors;
}

function renderSignup(res, options = {}) {
  return res.status(options.status || 200).render("auth/signup", {
    title: options.pendingOtp ? "Verify account" : "Create Account",
    pendingOtp: Boolean(options.pendingOtp),
    generatedOtp: options.generatedOtp || null,
    formData: options.formData || {},
    fieldErrors: options.fieldErrors || {},
    formError: options.formError || null,
    otpExpiresInMinutes: Math.ceil(OTP_TTL_MS / 60000),
  });
}

function renderPasswordReset(res, options = {}) {
  return res.status(options.status || 200).render("auth/forgot-password", {
    title: options.pendingOtp ? "Reset Password" : "Forgot Password",
    pendingOtp: Boolean(options.pendingOtp),
    generatedOtp: options.generatedOtp || null,
    formData: options.formData || {},
    fieldErrors: options.fieldErrors || {},
    formError: options.formError || null,
    formSuccess: options.formSuccess || null,
    otpExpiresInMinutes: Math.ceil(OTP_TTL_MS / 60000),
  });
}

function hashOtp(otp) {
  return createHash("sha256").update(otp).digest("hex");
}

function isValidOtp(otp, expectedHash) {
  if (!/^[0-9]{6}$/.test(otp) || !/^[a-f0-9]{64}$/.test(expectedHash || ""))
    return false;
  return timingSafeEqual(
    Buffer.from(hashOtp(otp), "hex"),
    Buffer.from(expectedHash, "hex"),
  );
}

function lockOtpSession(req, email) {
  req.session.signupOtpLockedEmail = email;
  req.session.signupOtpLockedUntil = Date.now() + OTP_TTL_MS;
}

function createUsernameBase(role, firstName, lastName) {
  const normalized = `${firstName}_${lastName}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, 24);
  return normalized || `${role.toLowerCase()}user`;
}

async function ensureUniqueUsername(role, firstName, lastName) {
  const Login = role === "STUDENT" ? StudentLogin : TeacherLogin;
  const base = createUsernameBase(role, firstName, lastName);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = String(randomInt(10, 100));
    const username = `${base.slice(0, 31)}${suffix}`;
    if (!(await Login.exists({ username }))) return username;
  }
  throw new Error("Could not create a unique username. Please try again.");
}

async function getDefaultTeacherContext() {
  return College.findOne({ archivedAt: null });
}

router.get("/login", (req, res) =>
  res.render("auth/login", {
    title: "Login",
    fieldErrors: {},
    formData: {},
    adminLogin: false,
  }),
);

router.post("/login", authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const fieldErrors = {};

    if (!EMAIL_PATTERN.test(email) || email.length > 180)
      fieldErrors.email = "Enter a valid email address.";
    if (!password) fieldErrors.password = "Password is required.";
    if (Object.keys(fieldErrors).length) {
      return res.status(400).render("auth/login", {
        title: "Login",
        fieldErrors,
        formData: { email },
        adminLogin: false,
      });
    }

    const [student, teacher] = await Promise.all([
      Student.findOne({ email }),
      Teacher.findOne({ email }),
    ]);
    const candidates = [
      { role: "STUDENT", profile: student, Login: StudentLogin, id: "studentId" },
      { role: "TEACHER", profile: teacher, Login: TeacherLogin, id: "teacherId" },
    ].filter((candidate) => candidate.profile);

    let authenticated = null;
    for (const candidate of candidates) {
      const login = await candidate.Login.findOne({
        [candidate.id]: candidate.profile._id,
      });
      if (
        login &&
        login.status === "ACTIVE" &&
        candidate.profile.status === "ACTIVE" &&
        Buffer.byteLength(password, "utf8") <= 72 &&
        (await bcrypt.compare(password, login.passwordHash))
      ) {
        authenticated = { ...candidate, login };
        break;
      }
    }

    await LoginActivity.create({
      role: authenticated?.role || candidates[0]?.role || "STUDENT",
      accountId: authenticated?.profile._id || candidates[0]?.profile?._id,
      username: email,
      success: Boolean(authenticated),
      ipAddress: req.ip,
    });

    if (!authenticated) {
      return res.status(401).render("auth/login", {
        title: "Login",
        fieldErrors: {},
        formData: { email },
        formError: "Email or password is incorrect, or the account is disabled.",
        adminLogin: false,
      });
    }

    req.session.regenerate((error) => {
      if (error) return next(error);
      const { profile, role } = authenticated;
      req.session.user = {
        id: String(profile._id),
        name: profile.name,
        email: profile.email,
        username: email,
        role,
        adminRole: null,
        collegeId: profile.collegeId ? String(profile.collegeId) : null,
      };
      req.session.flash = {
        type: "success",
        message: `Welcome, ${profile.name}!`,
      };
      return res.redirect(role === "TEACHER" ? "/teacher" : "/student");
    });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/login", (req, res) =>
  res.render("auth/login", {
    title: "Admin Login",
    fieldErrors: {},
    formData: {},
    adminLogin: true,
  }),
);

router.post("/admin/login", authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const fieldErrors = {};
    if (!EMAIL_PATTERN.test(email) || email.length > 180)
      fieldErrors.email = "Enter a valid email address.";
    if (!password) fieldErrors.password = "Password is required.";
    if (Object.keys(fieldErrors).length) {
      return res.status(400).render("auth/login", {
        title: "Admin Login",
        fieldErrors,
        formData: { email },
        adminLogin: true,
      });
    }

    const profile = await Admin.findOne({ email });
    const login = profile
      ? await AdminLogin.findOne({ adminId: profile._id })
      : null;
    const valid = Boolean(
      login &&
        profile &&
        login.status === "ACTIVE" &&
        profile.status === "ACTIVE" &&
        Buffer.byteLength(password, "utf8") <= 72 &&
        (await bcrypt.compare(password, login.passwordHash)),
    );
    await LoginActivity.create({
      role: "ADMIN",
      accountId: profile?._id,
      username: email,
      success: valid,
      ipAddress: req.ip,
    });
    if (!valid) {
      return res.status(401).render("auth/login", {
        title: "Admin Login",
        fieldErrors: {},
        formData: { email },
        formError: "Email or password is incorrect, or the account is disabled.",
        adminLogin: true,
      });
    }

    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.user = {
        id: String(profile._id),
        name: profile.name,
        email: profile.email,
        username: email,
        role: "ADMIN",
        adminRole: profile.role,
        collegeId: profile.collegeId ? String(profile.collegeId) : null,
      };
      req.session.flash = {
        type: "success",
        message: `Welcome, ${profile.name}!`,
      };
      return res.redirect("/admin");
    });
  } catch (error) {
    next(error);
  }
});

router.get("/forgot-password", (req, res) => renderPasswordReset(res));

router.post("/forgot-password", authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email) || email.length > 180) {
      return renderPasswordReset(res, {
        status: 400,
        formData: { email },
        fieldErrors: { email: "Enter a valid email address." },
      });
    }

    if (process.env.NODE_ENV === "production") {
      return renderPasswordReset(res, {
        status: 503,
        formData: { email },
        formError:
          "Password reset is unavailable because email delivery is not configured. Please contact your administrator.",
      });
    }

    const [admin, teacher, student] = await Promise.all([
      Admin.findOne({ email, status: "ACTIVE" }).select("_id"),
      Teacher.findOne({ email, status: "ACTIVE" }).select("_id"),
      Student.findOne({ email, status: "ACTIVE" }).select("_id"),
    ]);
    const candidates = [
      admin && { role: "ADMIN", profile: admin, Login: AdminLogin, idField: "adminId" },
      teacher && { role: "TEACHER", profile: teacher, Login: TeacherLogin, idField: "teacherId" },
      student && { role: "STUDENT", profile: student, Login: StudentLogin, idField: "studentId" },
    ].filter(Boolean);

    let account = null;
    for (const candidate of candidates) {
      const login = await candidate.Login.findOne({
        [candidate.idField]: candidate.profile._id,
        status: "ACTIVE",
      }).select("_id");
      if (login) {
        account = { role: candidate.role, profileId: String(candidate.profile._id) };
        break;
      }
    }

    const otp = String(randomInt(100000, 1000000));
    req.session.passwordReset = {
      email,
      account,
      otpHash: hashOtp(otp),
      attempts: 0,
      expiresAt: Date.now() + OTP_TTL_MS,
    };

    return renderPasswordReset(res, {
      pendingOtp: true,
      generatedOtp: otp,
      formData: { email },
      formSuccess:
        "If an active account uses this email, use the verification code below to reset its password.",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/reset-password", authLimiter, async (req, res, next) => {
  try {
    const pending = req.session.passwordReset;
    const email = String(req.body.email || "").trim().toLowerCase();
    const data = {
      email,
      otp: String(req.body.otp || "").trim(),
      password: String(req.body.password || ""),
      confirmPassword: String(req.body.confirmPassword || ""),
    };

    if (!pending || pending.email !== email) {
      delete req.session.passwordReset;
      return renderPasswordReset(res, {
        status: 400,
        formData: { email },
        formError: "Password reset was not started. Request a new verification code.",
      });
    }

    if (Date.now() > pending.expiresAt) {
      delete req.session.passwordReset;
      return renderPasswordReset(res, {
        status: 400,
        formData: { email },
        formError: "The verification code expired. Request a new code.",
      });
    }

    if (pending.attempts >= OTP_MAX_ATTEMPTS) {
      delete req.session.passwordReset;
      return renderPasswordReset(res, {
        status: 429,
        formData: { email },
        formError: "Too many incorrect codes. Request a new verification code.",
      });
    }

    if (!isValidOtp(data.otp, pending.otpHash)) {
      pending.attempts += 1;
      const attemptsRemaining = OTP_MAX_ATTEMPTS - pending.attempts;
      if (attemptsRemaining === 0) delete req.session.passwordReset;
      return renderPasswordReset(res, {
        status: attemptsRemaining === 0 ? 429 : 400,
        pendingOtp: attemptsRemaining > 0,
        formData: { email },
        fieldErrors: {
          otp:
            attemptsRemaining > 0
              ? `Incorrect code. ${attemptsRemaining} attempts remaining.`
              : "Too many incorrect codes. Request a new verification code.",
        },
      });
    }

    if (!pending.account) {
      delete req.session.passwordReset;
      return renderPasswordReset(res, {
        status: 400,
        formData: { email },
        formError: "No active account could be reset for that email address.",
      });
    }

    const fieldErrors = validatePassword(data.password);
    if (!data.confirmPassword) {
      fieldErrors.confirmPassword = "Confirm password is required.";
    } else if (data.password !== data.confirmPassword) {
      fieldErrors.confirmPassword = "Passwords do not match.";
    }
    if (Object.keys(fieldErrors).length) {
      return renderPasswordReset(res, {
        status: 400,
        pendingOtp: true,
        formData: { email },
        fieldErrors,
      });
    }

    const accountModels = {
      ADMIN: { Profile: Admin, Login: AdminLogin, idField: "adminId", destination: "/admin/login" },
      TEACHER: { Profile: Teacher, Login: TeacherLogin, idField: "teacherId", destination: "/login" },
      STUDENT: { Profile: Student, Login: StudentLogin, idField: "studentId", destination: "/login" },
    };
    const accountModel = accountModels[pending.account.role];
    const profile = await accountModel.Profile.findOne({
      _id: pending.account.profileId,
      email,
      status: "ACTIVE",
    });
    const login = profile
      ? await accountModel.Login.findOne({
          [accountModel.idField]: profile._id,
          status: "ACTIVE",
        })
      : null;

    if (!login) {
      delete req.session.passwordReset;
      return renderPasswordReset(res, {
        status: 400,
        formData: { email },
        formError: "This account is no longer active. Contact your administrator.",
      });
    }

    login.passwordHash = await bcrypt.hash(data.password, 12);
    await login.save();
    delete req.session.passwordReset;
    req.session.flash = {
      type: "success",
      message: "Your password was reset. Sign in with your new password.",
    };
    return res.redirect(accountModel.destination);
  } catch (error) {
    next(error);
  }
});

router.get("/signup", (req, res) =>
  renderSignup(res, { formData: { role: "STUDENT" } }),
);

router.post("/signup", async (req, res, next) => {
  try {
    const data = getSignupData(req.body);
    const pending = req.session.signupDraft;
    if (
      req.session.signupOtpLockedEmail === data.email &&
      req.session.signupOtpLockedUntil > Date.now() &&
      !pending
    ) {
      return renderSignup(res, {
        status: 429,
        formData: data,
        formError: "Too many incorrect OTP attempts. Try again in five minutes.",
      });
    }
    const isOtpStep = Boolean(
      pending || data.otp || data.password || data.confirmPassword,
    );

    if (isOtpStep) {
      if (!pending) {
        return renderSignup(res, {
          status: 400,
          formData: data,
          formError: "Signup verification was not started. Please enter your details again.",
        });
      }
      if (
        pending.email !== data.email ||
        pending.role !== data.role ||
        pending.phone !== data.phone ||
        pending.firstName !== data.firstName ||
        pending.lastName !== data.lastName
      ) {
        return renderSignup(res, {
          status: 400,
          pendingOtp: true,
          generatedOtp:
            process.env.NODE_ENV === "production" ? null : pending.otp,
          formData: pending,
          formError: "Signup details cannot be changed during verification. Use the details shown and try again.",
        });
      }
      if (Date.now() > pending.expiresAt) {
        delete req.session.signupDraft;
        return renderSignup(res, {
          status: 400,
          formData: data,
          formError: "Your OTP has expired. Please start signup again.",
        });
      }
      if (pending.attempts >= OTP_MAX_ATTEMPTS) {
        lockOtpSession(req, pending.email);
        delete req.session.signupDraft;
        return renderSignup(res, {
          status: 429,
          formData: data,
          formError: "Too many incorrect OTP attempts. Please start signup again.",
        });
      }
      if (!/^[0-9]{6}$/.test(data.otp) || data.otp !== pending.otp) {
        pending.attempts += 1;
        if (pending.attempts >= OTP_MAX_ATTEMPTS) {
          lockOtpSession(req, pending.email);
          delete req.session.signupDraft;
          return renderSignup(res, {
            status: 429,
            formData: data,
            formError: "Too many incorrect OTP attempts. Please start signup again.",
          });
        }
        return renderSignup(res, {
          status: 400,
          pendingOtp: true,
          generatedOtp:
            process.env.NODE_ENV === "production" ? null : pending.otp,
          formData: data,
          fieldErrors: {
            otp: `Incorrect OTP. ${OTP_MAX_ATTEMPTS - pending.attempts} attempts remaining.`,
          },
        });
      }

      const identityErrors = validateIdentity(data);
      const passwordErrors = validatePassword(data.password);
      const fieldErrors = { ...identityErrors, ...passwordErrors };
      if (!data.confirmPassword)
        fieldErrors.confirmPassword = "Confirm password is required.";
      else if (data.password !== data.confirmPassword)
        fieldErrors.confirmPassword = "Passwords do not match.";
      if (Buffer.byteLength(data.password, "utf8") > 72)
        fieldErrors.password = "Password must be no more than 72 UTF-8 bytes.";
      if (Object.keys(fieldErrors).length) {
        return renderSignup(res, {
          status: 400,
          pendingOtp: true,
          generatedOtp:
            process.env.NODE_ENV === "production" ? null : pending.otp,
          formData: data,
          fieldErrors,
        });
      }

      const [studentEmail, teacherEmail, studentPhone, teacherPhone] =
        await Promise.all([
          Student.exists({ email: data.email }),
          Teacher.exists({ email: data.email }),
          Student.exists({ phone: data.phone }),
          Teacher.exists({ phone: data.phone }),
        ]);
      const duplicateErrors = {};
      if (studentEmail || teacherEmail)
        duplicateErrors.email = "An account with this email already exists.";
      if (studentPhone || teacherPhone)
        duplicateErrors.phone = "An account with this phone number already exists.";
      if (Object.keys(duplicateErrors).length) {
        delete req.session.signupDraft;
        return renderSignup(res, {
          status: 409,
          formData: data,
          fieldErrors: duplicateErrors,
        });
      }

      const fullName = `${data.firstName} ${data.lastName}`;
      delete req.session.signupOtpLockedEmail;
      delete req.session.signupOtpLockedUntil;
      const passwordHash = await bcrypt.hash(data.password, 12);
      const username = await ensureUniqueUsername(
        data.role,
        data.firstName,
        data.lastName,
      );

      if (data.role === "STUDENT") {
        const student = await Student.create({
          name: fullName,
          email: data.email,
          phone: data.phone,
          status: "ACTIVE",
        });
        try {
          await StudentLogin.create({
            studentId: student._id,
            username,
            passwordHash,
          });
        } catch (error) {
          await Student.findByIdAndDelete(student._id);
          throw error;
        }
        delete req.session.signupDraft;
        req.session.regenerate((error) => {
          if (error) return next(error);
          req.session.user = {
            id: String(student._id),
            name: fullName,
            email: data.email,
            username: data.email,
            role: "STUDENT",
            adminRole: null,
            collegeId: null,
          };
          req.session.flash = {
            type: "success",
            message: `Welcome, ${fullName}! Your student dashboard is ready.`,
          };
          return res.redirect("/student");
        });
        return;
      }

      const college = await getDefaultTeacherContext();
      if (!college) {
        return renderSignup(res, {
          status: 503,
          pendingOtp: true,
          generatedOtp:
            process.env.NODE_ENV === "production" ? null : pending.otp,
          formData: data,
          formError:
            "Teacher signup is unavailable because no active college is configured.",
        });
      }
      const teacher = await Teacher.create({
        collegeId: college._id,
        name: fullName,
        email: data.email,
        phone: data.phone,
        status: "ACTIVE",
      });
      try {
        await TeacherLogin.create({
          teacherId: teacher._id,
          username,
          passwordHash,
        });
      } catch (error) {
        await Teacher.findByIdAndDelete(teacher._id);
        throw error;
      }
      delete req.session.signupDraft;
      req.session.regenerate((error) => {
        if (error) return next(error);
        req.session.user = {
          id: String(teacher._id),
          name: fullName,
          email: data.email,
          username: data.email,
          role: "TEACHER",
          adminRole: null,
          collegeId: String(college._id),
        };
        req.session.flash = {
          type: "success",
          message: `Welcome, ${fullName}! Your teacher dashboard is ready.`,
        };
        return res.redirect("/teacher");
      });
    } else {
      const identityErrors = validateIdentity(data);
      if (Object.keys(identityErrors).length) {
        return renderSignup(res, {
          status: 400,
          formData: data,
          fieldErrors: identityErrors,
        });
      }

      const [studentEmail, teacherEmail, studentPhone, teacherPhone] =
        await Promise.all([
          Student.exists({ email: data.email }),
          Teacher.exists({ email: data.email }),
          Student.exists({ phone: data.phone }),
          Teacher.exists({ phone: data.phone }),
        ]);
      const fieldErrors = {};
      if (studentEmail || teacherEmail)
        fieldErrors.email = "An account with this email already exists.";
      if (studentPhone || teacherPhone)
        fieldErrors.phone = "An account with this phone number already exists.";
      if (Object.keys(fieldErrors).length) {
        return renderSignup(res, {
          status: 409,
          formData: data,
          fieldErrors,
        });
      }

      const otp = String(randomInt(100000, 1000000));
      req.session.signupDraft = {
        role: data.role,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        otp,
        attempts: 0,
        expiresAt: Date.now() + OTP_TTL_MS,
      };
      return renderSignup(res, {
        pendingOtp: true,
        generatedOtp: process.env.NODE_ENV === "production" ? null : otp,
        formData: data,
      });
    }
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      const message =
        field === "phone"
          ? "An account with this phone number already exists."
          : "An account with this email or username already exists.";
      return renderSignup(res, {
        status: 409,
        formData: getSignupData(req.body),
        pendingOtp: Boolean(req.session.signupDraft),
        generatedOtp:
          process.env.NODE_ENV === "production"
            ? null
            : req.session.signupDraft?.otp,
        fieldErrors: { [field === "phone" ? "phone" : "email"]: message },
      });
    }
    next(error);
  }
});

router.post("/logout", requireLogin, (req, res, next) =>
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("sms.sid");
    res.redirect("/login");
  }),
);

// REST API Authentication Endpoints (JWT & Mobile/Test support)
router.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const requestedRole = req.body.role ? String(req.body.role).toUpperCase() : null;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    // Check Admin
    if (!requestedRole || requestedRole === "ADMIN") {
      const admin = await Admin.findOne({ email });
      if (admin && admin.status === "ACTIVE") {
        const adminLogin = await AdminLogin.findOne({ adminId: admin._id });
        if (
          adminLogin &&
          adminLogin.status === "ACTIVE" &&
          (await bcrypt.compare(password, adminLogin.passwordHash))
        ) {
          const userObj = {
            id: String(admin._id),
            name: admin.name,
            email: admin.email,
            role: "ADMIN",
            adminRole: admin.role,
            collegeId: admin.collegeId ? String(admin.collegeId) : null,
          };
          const token = generateToken(userObj);
          if (req.session) req.session.user = userObj;
          return res.json({ success: true, token, user: userObj });
        }
      }
    }

    // Check Teacher
    if (!requestedRole || requestedRole === "TEACHER") {
      const teacher = await Teacher.findOne({ email });
      if (teacher && teacher.status === "ACTIVE") {
        const teacherLogin = await TeacherLogin.findOne({ teacherId: teacher._id });
        if (
          teacherLogin &&
          teacherLogin.status === "ACTIVE" &&
          (await bcrypt.compare(password, teacherLogin.passwordHash))
        ) {
          const userObj = {
            id: String(teacher._id),
            name: teacher.name,
            email: teacher.email,
            role: "TEACHER",
            adminRole: null,
            collegeId: teacher.collegeId ? String(teacher.collegeId) : null,
          };
          const token = generateToken(userObj);
          if (req.session) req.session.user = userObj;
          return res.json({ success: true, token, user: userObj });
        }
      }
    }

    // Check Student
    if (!requestedRole || requestedRole === "STUDENT") {
      const student = await Student.findOne({ email });
      if (student && student.status === "ACTIVE") {
        const studentLogin = await StudentLogin.findOne({ studentId: student._id });
        if (
          studentLogin &&
          studentLogin.status === "ACTIVE" &&
          (await bcrypt.compare(password, studentLogin.passwordHash))
        ) {
          const userObj = {
            id: String(student._id),
            name: student.name,
            email: student.email,
            role: "STUDENT",
            adminRole: null,
            collegeId: student.collegeCourseId ? String(student.collegeCourseId) : null,
          };
          const token = generateToken(userObj);
          if (req.session) req.session.user = userObj;
          return res.json({ success: true, token, user: userObj });
        }
      }
    }

    return res.status(401).json({ error: "Invalid email or password." });
  } catch (err) {
    console.error("API login error:", err);
    return res.status(500).json({ error: "Server error during authentication." });
  }
});

router.get("/api/auth/me", requireApiAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post("/api/auth/logout", (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.clearCookie("sms.sid");
      res.json({ success: true, message: "Logged out successfully." });
    });
  } else {
    res.json({ success: true, message: "Logged out." });
  }
});

module.exports = router;

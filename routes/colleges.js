const express = require("express");
const { University } = require("../models");

const router = express.Router();
const PAGE_SIZE = 9;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const search = String(req.query.q || "").trim().slice(0, 100);
    const state = String(req.query.state || "").trim().slice(0, 80);
    const course = String(req.query.course || "").trim().slice(0, 100);
    const conditions = [];

    if (search) {
      const expression = new RegExp(escapeRegex(search), "i");
      conditions.push({
        $or: [{ name: expression }, { city: expression }, { state: expression }],
      });
    }
    if (state) conditions.push({ state });
    if (course) {
      conditions.push({
        "programs.name": new RegExp(escapeRegex(course), "i"),
      });
    }
    const query = conditions.length ? { $and: conditions } : {};
    const [total, institutions, states, programs] = await Promise.all([
      University.countDocuments(query),
      University.find(query)
        .sort({ name: 1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(),
      University.distinct("state", { state: { $exists: true, $ne: "" } }),
      University.distinct("programs.name"),
    ]);

    res.render("colleges/index", {
      title: "Universities",
      institutions,
      states: states.filter(Boolean).sort(),
      programs: programs.filter(Boolean).sort(),
      filters: { search, state, course },
      pagination: {
        page,
        pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        total,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:slug", async (req, res, next) => {
  try {
    const institution = await University.findOne({
      slug: String(req.params.slug).toLowerCase(),
    }).lean();
    if (!institution) {
      return res.status(404).render("error", {
        title: "University not found",
        message: "The university profile you requested was not found.",
      });
    }
    res.render("colleges/detail", {
      title: institution.name,
      institution,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

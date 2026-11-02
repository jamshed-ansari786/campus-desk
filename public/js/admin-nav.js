(() => {
  const toggle = document.querySelector("[data-admin-nav-toggle]");
  const shell = document.querySelector(".admin-shell");
  const sidebar = document.querySelector(".admin-sidebar");
  const nav = document.querySelector("#admin-navigation");
  const label = document.querySelector("[data-admin-nav-toggle-label]");
  if (!toggle || !shell || !sidebar || !nav || !label) return;

  const mobileQuery = window.matchMedia("(max-width: 850px)");
  const sections = [...nav.querySelectorAll("[data-admin-nav-section]")];

  function setSectionExpanded(section, isExpanded) {
    const sectionToggle = section.querySelector("[data-admin-nav-section-toggle]");
    const panel = document.getElementById(sectionToggle.getAttribute("aria-controls"));
    sectionToggle.setAttribute("aria-expanded", String(isExpanded));
    panel.hidden = !isExpanded;
    panel.setAttribute("aria-hidden", String(!isExpanded));
  }

  sections.forEach((section) => {
    const sectionToggle = section.querySelector("[data-admin-nav-section-toggle]");
    const isExpanded = sectionToggle.getAttribute("aria-expanded") === "true";
    setSectionExpanded(section, isExpanded);
    sectionToggle.addEventListener("click", () => {
      const shouldExpand = sectionToggle.getAttribute("aria-expanded") !== "true";
      sections.forEach((otherSection) => {
        setSectionExpanded(otherSection, otherSection === section && shouldExpand);
      });
    });
  });

  function renderNavigation(isExpanded) {
    toggle.setAttribute("aria-expanded", String(isExpanded));
    toggle.setAttribute(
      "aria-label",
      mobileQuery.matches
        ? isExpanded
          ? "Close administration navigation"
          : "Open administration navigation"
        : isExpanded
          ? "Collapse administration navigation"
          : "Expand administration navigation",
    );
    label.textContent = mobileQuery.matches
      ? isExpanded
        ? "Close menu"
        : "Open menu"
      : isExpanded
        ? "Collapse"
        : "Expand";
    shell.classList.toggle("admin-nav-collapsed", !isExpanded);
    nav.setAttribute("aria-hidden", String(!isExpanded));
  }

  function handleBreakpointChange() {
    renderNavigation(!mobileQuery.matches);
  }

  toggle.addEventListener("click", () => {
    renderNavigation(toggle.getAttribute("aria-expanded") !== "true");
  });
  mobileQuery.addEventListener("change", handleBreakpointChange);
  nav.addEventListener("click", (event) => {
    if (mobileQuery.matches && event.target.closest("a")) {
      renderNavigation(false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileQuery.matches && toggle.getAttribute("aria-expanded") === "true") {
      renderNavigation(false);
      toggle.focus();
    }
  });

  handleBreakpointChange();
})();

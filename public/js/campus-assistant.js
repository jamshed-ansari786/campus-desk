(() => {
  const prompt = document.querySelector("[data-signup-prompt]");
  const assistant = document.querySelector("[data-campus-assistant]");
  if (!prompt || !assistant) return;

  const dialog = prompt.querySelector('[role="dialog"]');
  const promptClose = prompt.querySelector("[data-close-prompt]");
  let previousFocus = null;

  function closePrompt() {
    prompt.hidden = true;
    document.body.classList.remove("home-prompt-open");
    try {
      sessionStorage.setItem("campusdesk-prompt-dismissed", "true");
    } catch (error) {
      console.warn("Could not save the sign-up reminder preference.", error);
    }
    if (previousFocus && typeof previousFocus.focus === "function") {
      previousFocus.focus();
    }
  }

  function openPrompt() {
    previousFocus = document.activeElement;
    prompt.hidden = false;
    document.body.classList.add("home-prompt-open");
    promptClose.focus();
  }

  prompt.addEventListener("click", (event) => {
    if (
      event.target.closest("[data-close-prompt]") ||
      event.target === prompt
    ) {
      closePrompt();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (prompt.hidden) return;
    if (event.key === "Escape") {
      closePrompt();
      return;
    }
    if (event.key === "Tab") {
      const focusable = [
        ...dialog.querySelectorAll("a[href], button:not([disabled])"),
      ];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  let wasDismissed = false;
  try {
    wasDismissed =
      sessionStorage.getItem("campusdesk-prompt-dismissed") === "true";
  } catch (error) {
    console.warn("Could not read the sign-up reminder preference.", error);
  }
  if (!wasDismissed) window.setTimeout(openPrompt, 10000);

  const panel = assistant.querySelector("[data-assistant-panel]");
  const toggle = assistant.querySelector("[data-assistant-toggle]");
  const close = assistant.querySelector("[data-assistant-close]");
  const form = assistant.querySelector("[data-assistant-form]");
  const input = form.elements.question;
  const messages = assistant.querySelector("[data-assistant-messages]");
  const assistantOpeners = document.querySelectorAll("[data-open-assistant]");

  function setAssistantOpen(isOpen) {
    panel.hidden = !isOpen;
    toggle.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) input.focus();
    else toggle.focus();
  }

  function addMessage(text, className, href) {
    const bubble = document.createElement("p");
    bubble.className = `home-chat-bubble ${className}`;
    bubble.textContent = text;
    if (href) {
      const link = document.createElement("a");
      link.href = href;
      link.className = "home-chat-action";
      link.textContent =
        href === "/colleges"
          ? "Explore universities →"
          : href === "/signup"
            ? "Create an account →"
            : "Log in →";
      bubble.append(" ", link);
    }
    messages.append(bubble);
    messages.scrollTop = messages.scrollHeight;
  }

  function answerQuestion(question) {
    const text = question.trim().toLowerCase();
    if (
      /sign.?up|create|register|new account|teacher|student account/.test(text)
    ) {
      return {
        message:
          "You can create a student or teacher account in just a few steps.",
        href: "/signup",
      };
    }
    if (/universit|college|course|program|degree|study/.test(text)) {
      return {
        message:
          "Explore the university directory to search institutions and their programs.",
        href: "/colleges",
      };
    }
    if (/log.?in|sign.?in|portal|password|account/.test(text)) {
      return {
        message:
          "Head to the login page to access your student or teacher portal.",
        href: "/login",
      };
    }
    if (/campusdesk|what can you|what do you/.test(text)) {
      return {
        message:
          "CampusDesk brings university discovery and student and teacher portals together. I can point you to account setup, login, or the university directory.",
      };
    }
    return {
      message:
        "I can help with creating an account, logging in, or exploring universities. Which would you like to do?",
    };
  }

  function submitQuestion(question) {
    const text = question.trim();
    if (!text) return;
    addMessage(text, "home-chat-user");
    const answer = answerQuestion(text);
    addMessage(answer.message, "home-chat-reply", answer.href);
  }

  toggle.addEventListener("click", () => setAssistantOpen(panel.hidden));
  close.addEventListener("click", () => setAssistantOpen(false));
  assistantOpeners.forEach((button) => {
    button.addEventListener("click", () => setAssistantOpen(true));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) setAssistantOpen(false);
  });
  assistant.querySelectorAll("[data-assistant-question]").forEach((button) => {
    button.addEventListener("click", () =>
      submitQuestion(button.dataset.assistantQuestion),
    );
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitQuestion(input.value);
    input.value = "";
    input.focus();
  });
})();

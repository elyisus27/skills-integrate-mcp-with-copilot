document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const signupForm = document.getElementById("signup-form");
  const registerDialog = document.getElementById("register-dialog");
  const registerActivityName = document.getElementById("register-activity-name");
  const cancelRegister = document.getElementById("cancel-register");
  const activitySearch = document.getElementById("activity-search");
  const categoryFilter = document.getElementById("category-filter");
  const dayFilter = document.getElementById("day-filter");
  const sortSelect = document.getElementById("sort-select");
  const resetFilters = document.getElementById("reset-filters");
  const activityCount = document.getElementById("activity-count");
  let allActivities = {};
  let registerActivity = "";
  const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const CATEGORY_MASCOTS = {
    Academic: "img/privateinvestocat.jpg",
    Technology: "img/codercat.jpg",
    Sports: "img/dojocat.jpg",
    Arts: "img/octocat-de-los-muertos.jpg",
  };
  const studentLookupContainer = document.getElementById(
    "student-lookup-container"
  );
  const studentSearchForm = document.getElementById("student-search-form");
  const studentQuery = document.getElementById("student-query");
  const studentResults = document.getElementById("student-results");
  const messageDiv = document.getElementById("message");
  const accountButton = document.getElementById("account-button");
  const accountButtonLabel = document.getElementById("account-button-label");
  const accountStatus = document.getElementById("account-status");
  const loginDialog = document.getElementById("login-dialog");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const cancelLogin = document.getElementById("cancel-login");
  let authenticated = false;

  // Fetch activities once, then filter and sort them in the browser
  async function fetchActivities() {
    try {
      const response = await fetch("/activities");
      if (!response.ok) {
        throw new Error(`Unexpected response: ${response.status}`);
      }
      allActivities = await response.json();
      populateCategories();
      renderActivities();
    } catch (error) {
      activitiesList.replaceChildren();
      const failure = document.createElement("p");
      failure.textContent = "Failed to load activities. Please try again later.";
      activitiesList.appendChild(failure);
      console.error("Error fetching activities:", error);
    }
  }

  function populateCategories() {
    const selected = categoryFilter.value;
    const categories = [
      ...new Set(
        Object.values(allActivities)
          .map((details) => details.category)
          .filter(Boolean)
      ),
    ].sort();
    categoryFilter.replaceChildren(new Option("All categories", ""));
    categories.forEach((category) =>
      categoryFilter.appendChild(new Option(category, category))
    );
    categoryFilter.value = categories.includes(selected) ? selected : "";
  }

  function normalizeText(text) {
    return String(text)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  // Earliest weekday and start time, so activities sort by when they happen
  function timeSortKey(details) {
    const days = (details.days || [])
      .map((day) => DAY_ORDER.indexOf(day))
      .filter((index) => index >= 0);
    const firstDay = days.length ? Math.min(...days) : 99;
    return firstDay * 10000 + toMinutes(details.start_time);
  }

  function toMinutes(time) {
    const match = /^(\d{2}):(\d{2})$/.exec(time || "");
    return match ? Number(match[1]) * 60 + Number(match[2]) : 9999;
  }

  function visibleActivities() {
    const text = normalizeText(activitySearch.value.trim());
    const category = categoryFilter.value;
    const day = dayFilter.value;
    const spots = (details) =>
      details.max_participants - details.participants.length;

    const entries = Object.entries(allActivities).filter(([name, details]) => {
      if (category && details.category !== category) {
        return false;
      }
      if (day && !(details.days || []).includes(day)) {
        return false;
      }
      return (
        !text ||
        normalizeText(`${name} ${details.description}`).includes(text)
      );
    });

    const sorters = {
      name: ([a], [b]) => a.localeCompare(b),
      time: ([a, x], [b, y]) => timeSortKey(x) - timeSortKey(y) || a.localeCompare(b),
      spots: ([a, x], [b, y]) => spots(y) - spots(x) || a.localeCompare(b),
    };
    return entries.sort(sorters[sortSelect.value] || sorters.name);
  }

  function addLine(parent, label, value) {
    const line = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    line.append(strong, value);
    parent.appendChild(line);
  }

  function renderActivities() {
    const entries = visibleActivities();
    const total = Object.keys(allActivities).length;
    activitiesList.replaceChildren();
    activityCount.textContent = `Showing ${entries.length} of ${total} activities`;

    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "no-results";
      empty.textContent =
        "No activities match your filters. Try a different search or reset the filters.";
      activitiesList.appendChild(empty);
      return;
    }

    entries.forEach(([name, details]) => {
      const card = document.createElement("div");
      card.className = "activity-card";

      const heading = document.createElement("div");
      heading.className = "card-heading";
      const mascot = document.createElement("img");
      mascot.className = "card-mascot";
      mascot.src = CATEGORY_MASCOTS[details.category] || "img/original.png";
      mascot.alt = "";
      mascot.loading = "lazy";
      const title = document.createElement("h4");
      title.textContent = name;
      heading.append(mascot, title);
      card.appendChild(heading);

      if (details.category) {
        const badge = document.createElement("span");
        badge.className = "category-badge";
        badge.textContent = details.category;
        card.appendChild(badge);
      }

      const description = document.createElement("p");
      description.textContent = details.description;
      card.appendChild(description);

      const spotsLeft = details.max_participants - details.participants.length;
      addLine(card, "Schedule", details.schedule);
      addLine(card, "Availability", `${spotsLeft} spots left`);
      addLine(card, "Points", String(Number(details.points) || 0));

      const participantsBox = document.createElement("div");
      participantsBox.className = "participants-container";
      if (details.participants.length > 0) {
        const section = document.createElement("div");
        section.className = "participants-section";
        const label = document.createElement("h5");
        label.textContent = "Participants:";
        const list = document.createElement("ul");
        list.className = "participants-list";
        details.participants.forEach((email) => {
          const item = document.createElement("li");
          const emailSpan = document.createElement("span");
          emailSpan.className = "participant-email";
          emailSpan.textContent = email;
          item.appendChild(emailSpan);
          if (authenticated) {
            const button = document.createElement("button");
            button.className = "delete-btn";
            button.type = "button";
            button.textContent = "Unregister";
            button.setAttribute("aria-label", `Unregister ${email}`);
            button.addEventListener("click", () => handleUnregister(name, email));
            item.appendChild(button);
          }
          list.appendChild(item);
        });
        section.append(label, list);
        participantsBox.appendChild(section);
      } else {
        const none = document.createElement("p");
        none.innerHTML = "<em>No participants yet</em>";
        participantsBox.appendChild(none);
      }
      card.appendChild(participantsBox);

      if (authenticated) {
        const registerButton = document.createElement("button");
        registerButton.type = "button";
        registerButton.className = "register-btn";
        registerButton.textContent = "Register student";
        registerButton.setAttribute("aria-label", `Register a student for ${name}`);
        registerButton.disabled = spotsLeft <= 0;
        if (spotsLeft <= 0) {
          registerButton.textContent = "Activity full";
        }
        registerButton.addEventListener("click", () => openRegisterDialog(name));
        card.appendChild(registerButton);
      }

      activitiesList.appendChild(card);
    });
  }

  function openRegisterDialog(activityName) {
    registerActivity = activityName;
    registerActivityName.textContent = activityName;
    signupForm.reset();
    registerDialog.showModal();
    document.getElementById("email").focus();
  }

  async function refreshAuthSession() {
    const response = await fetch("/auth/session");
    if (!response.ok) {
      throw new Error("Unable to check teacher login.");
    }
    const session = await response.json();
    authenticated = session.authenticated;
    studentLookupContainer.classList.toggle("hidden", !authenticated);
    if (!authenticated) {
      studentResults.replaceChildren();
      studentSearchForm.reset();
    }
    accountStatus.textContent = authenticated
      ? `Signed in as ${session.username}`
      : "Viewing as a guest";
    accountButtonLabel.textContent = authenticated ? "Log out" : "Teacher login";
    accountButton.setAttribute(
      "aria-label",
      authenticated ? "Teacher logout" : "Teacher login"
    );
    await fetchActivities();
  }

  async function handleAccountButton() {
    if (!authenticated) {
      loginError.classList.add("hidden");
      loginForm.reset();
      loginDialog.showModal();
      return;
    }

    try {
      const response = await fetch("/auth/logout", { method: "POST" });
      if (!response.ok) {
        throw new Error("Unable to sign out.");
      }
      await refreshAuthSession();
    } catch (error) {
      showMessage("Failed to log out. Please try again.", "error");
      console.error("Error logging out:", error);
    }
  }

  function showMessage(message, status) {
    messageDiv.textContent = message;
    messageDiv.className = `message ${status}`;
    messageDiv.classList.remove("hidden");
    setTimeout(() => messageDiv.classList.add("hidden"), 5000);
  }

  // Handle unregister functionality
  async function handleUnregister(activity, email) {

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/unregister?email=${encodeURIComponent(email)}`,
        {
          method: "DELETE",
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(result.message, "success");

        // Refresh activities list to show updated participants
        await fetchActivities();
      } else {
        showMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage("Failed to unregister. Please try again.", "error");
      console.error("Error unregistering:", error);
    }
  }

  accountButton.addEventListener("click", handleAccountButton);
  cancelLogin.addEventListener("click", () => loginDialog.close());
  loginDialog.addEventListener("click", (event) => {
    if (event.target === loginDialog) {
      loginDialog.close();
    }
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError.classList.add("hidden");
    const credentials = Object.fromEntries(new FormData(loginForm));
    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const result = await response.json();
      if (!response.ok) {
        loginError.textContent = result.detail || "Unable to log in.";
        loginError.classList.remove("hidden");
        return;
      }
      loginDialog.close();
      await refreshAuthSession();
      showMessage("Signed in successfully.", "success");
    } catch (error) {
      loginError.textContent = "Unable to log in. Please try again.";
      loginError.classList.remove("hidden");
      console.error("Error logging in:", error);
    }
  });

  function renderStudentResults(data) {
    studentResults.replaceChildren();
    if (data.results.length === 0) {
      const empty = document.createElement("p");
      empty.className = "no-results";
      empty.textContent = `No students found for "${data.query}". Try a different name, email or student ID.`;
      studentResults.appendChild(empty);
      return;
    }

    const summary = document.createElement("p");
    summary.className = "results-summary";
    summary.textContent =
      data.total > data.results.length
        ? `Showing ${data.results.length} of ${data.total} students. Refine your search to narrow results.`
        : `${data.total} student${data.total === 1 ? "" : "s"} found.`;
    studentResults.appendChild(summary);

    data.results.forEach((student) => {
      const card = document.createElement("article");
      card.className = "student-card";

      const title = document.createElement("h4");
      title.textContent = student.name;
      card.appendChild(title);

      const details = document.createElement("p");
      details.textContent = [
        student.email,
        student.student_id ? `ID ${student.student_id}` : null,
        student.grade ? `Grade ${student.grade}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      card.appendChild(details);

      const count = document.createElement("p");
      const countLabel = document.createElement("strong");
      countLabel.textContent = "Activities: ";
      count.append(
        countLabel,
        `${student.activities_count} · Total points: ${student.total_points}`
      );
      card.appendChild(count);

      if (student.activities.length > 0) {
        const list = document.createElement("ul");
        list.className = "student-activities";
        student.activities.forEach((activity) => {
          const item = document.createElement("li");
          const label = document.createElement("span");
          label.textContent =
            activity.points === null
              ? `${activity.name} (no points yet)`
              : `${activity.name} (${activity.points} pts)`;
          item.appendChild(label);

          const pointsInput = document.createElement("input");
          pointsInput.type = "number";
          pointsInput.min = "0";
          pointsInput.max = "10000";
          pointsInput.step = "1";
          pointsInput.value = activity.points ?? "";
          pointsInput.placeholder = "pts";
          pointsInput.setAttribute("aria-label", `Points for ${activity.name}`);

          const saveButton = document.createElement("button");
          saveButton.type = "button";
          saveButton.className = "award-btn";
          saveButton.textContent = "Award";
          saveButton.addEventListener("click", () =>
            awardPoints(student.email, activity.name, pointsInput.value)
          );

          const controls = document.createElement("span");
          controls.className = "points-controls";
          controls.append(pointsInput, saveButton);
          item.appendChild(controls);
          list.appendChild(item);
        });
        card.appendChild(list);
      }
      studentResults.appendChild(card);
    });
  }

  async function awardPoints(email, activity, points) {
    const params = new URLSearchParams({ email });
    if (points !== "") {
      params.set("points", points);
    }
    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(activity)}/points?${params}`,
        { method: "POST" }
      );
      const result = await response.json();
      if (!response.ok) {
        const detail = Array.isArray(result.detail)
          ? "Points must be a whole number."
          : result.detail;
        showMessage(detail || "Unable to award points.", "error");
        return;
      }
      showMessage(result.message, "success");
      await searchStudents(lastStudentQuery, false);
    } catch (error) {
      showMessage("Unable to award points. Please try again.", "error");
      console.error("Error awarding points:", error);
    }
  }

  let lastStudentQuery = "";

  async function searchStudents(query, track = true) {
    lastStudentQuery = query;
    try {
      const response = await fetch(
        `/students/search?q=${encodeURIComponent(query)}&track=${track}`
      );
      const result = await response.json();
      if (!response.ok) {
        showMessage(result.detail || "Student search failed.", "error");
        if (response.status === 401) {
          await refreshAuthSession();
        }
        return;
      }
      renderStudentResults(result);
    } catch (error) {
      showMessage("Student search failed. Please try again.", "error");
      console.error("Error searching students:", error);
    }
  }

  studentSearchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = studentQuery.value.trim();
    if (query) {
      await searchStudents(query);
    }
  });

  // Handle form submission
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const activity = registerActivity;
    const registerError = document.getElementById("register-error");
    registerError.classList.add("hidden");

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/signup?email=${encodeURIComponent(email)}`,
        {
          method: "POST",
        }
      );

      const result = await response.json();

      if (response.ok) {
        registerDialog.close();
        showMessage(result.message, "success");

        // Refresh activities list to show updated participants
        await fetchActivities();
      } else {
        registerError.textContent = result.detail || "An error occurred";
        registerError.classList.remove("hidden");
      }
    } catch (error) {
      registerError.textContent = "Failed to sign up. Please try again.";
      registerError.classList.remove("hidden");
      console.error("Error signing up:", error);
    }
  });

  cancelRegister.addEventListener("click", () => registerDialog.close());
  registerDialog.addEventListener("click", (event) => {
    if (event.target === registerDialog) {
      registerDialog.close();
    }
  });

  [activitySearch, categoryFilter, dayFilter, sortSelect].forEach((control) =>
    control.addEventListener("input", renderActivities)
  );
  resetFilters.addEventListener("click", () => {
    activitySearch.value = "";
    categoryFilter.value = "";
    dayFilter.value = "";
    sortSelect.value = "name";
    renderActivities();
  });

  // Initialize app
  refreshAuthSession().catch((error) => {
    activitiesList.innerHTML =
      "<p>Failed to initialize the page. Please try again later.</p>";
    console.error("Error initializing app:", error);
  });
});

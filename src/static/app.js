document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const signupContainer = document.getElementById("signup-container");
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

  // Function to fetch activities from API
  async function fetchActivities() {
    try {
      const response = await fetch("/activities");
      const activities = await response.json();

      // Clear loading message
      activitiesList.innerHTML = "";
      activitySelect.replaceChildren(new Option("-- Select an activity --", ""));

      // Populate activities list
      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";

        const spotsLeft =
          details.max_participants - details.participants.length;

        // Create participants HTML with delete icons instead of bullet points
        const participantsHTML =
          details.participants.length > 0
            ? `<div class="participants-section">
              <h5>Participants:</h5>
              <ul class="participants-list">
                ${details.participants
                  .map(
                    (email) => `<li>
                      <span class="participant-email">${email}</span>
                      ${
                        authenticated
                          ? `<button class="delete-btn" data-activity="${name}" data-email="${email}" aria-label="Unregister ${email}">Unregister</button>`
                          : ""
                      }
                    </li>`
                  )
                  .join("")}
              </ul>
            </div>`
            : `<p><em>No participants yet</em></p>`;

        activityCard.innerHTML = `
          <h4>${name}</h4>
          <p>${details.description}</p>
          <p><strong>Schedule:</strong> ${details.schedule}</p>
          <p><strong>Availability:</strong> ${spotsLeft} spots left</p>
          <div class="participants-container">
            ${participantsHTML}
          </div>
        `;

        activitiesList.appendChild(activityCard);

        // Add option to select dropdown
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });

      // Add event listeners to delete buttons
      activitiesList.querySelectorAll(".delete-btn").forEach((button) => {
        button.addEventListener("click", handleUnregister);
      });
    } catch (error) {
      activitiesList.innerHTML =
        "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  async function refreshAuthSession() {
    const response = await fetch("/auth/session");
    if (!response.ok) {
      throw new Error("Unable to check teacher login.");
    }
    const session = await response.json();
    authenticated = session.authenticated;
    signupContainer.classList.toggle("hidden", !authenticated);
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
  async function handleUnregister(event) {
    const button = event.target;
    const activity = button.getAttribute("data-activity");
    const email = button.getAttribute("data-email");

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
      count.append(countLabel, String(student.activities_count));
      card.appendChild(count);

      if (student.activities.length > 0) {
        const list = document.createElement("ul");
        student.activities.forEach((activity) => {
          const item = document.createElement("li");
          item.textContent =
            activity.points === null
              ? activity.name
              : `${activity.name} (${activity.points} pts)`;
          list.appendChild(item);
        });
        card.appendChild(list);
      }
      studentResults.appendChild(card);
    });
  }

  studentSearchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = studentQuery.value.trim();
    if (!query) {
      return;
    }
    try {
      const response = await fetch(
        `/students/search?q=${encodeURIComponent(query)}`
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
  });

  // Handle form submission
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value;
    const activity = document.getElementById("activity").value;

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
        showMessage(result.message, "success");
        signupForm.reset();

        // Refresh activities list to show updated participants
        await fetchActivities();
      } else {
        showMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage("Failed to sign up. Please try again.", "error");
      console.error("Error signing up:", error);
    }
  });

  // Initialize app
  refreshAuthSession().catch((error) => {
    activitiesList.innerHTML =
      "<p>Failed to initialize the page. Please try again later.</p>";
    console.error("Error initializing app:", error);
  });
});

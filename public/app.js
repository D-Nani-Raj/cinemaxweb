const state = {
  user: null,
  movies: [],
  loading: true,
  authMode: "login",
  modalMovieId: null,
  editingMovieId: null
};

const app = document.getElementById("app");
const sessionActions = document.getElementById("session-actions");

boot();

async function boot() {
  await restoreSession();
  render();
}

async function restoreSession() {
  try {
    const session = await api("/api/auth/session");
    state.user = session.user;
    const moviePayload = await api("/api/movies");
    state.movies = moviePayload.movies;
  } catch (error) {
    state.user = null;
    state.movies = [];
  } finally {
    state.loading = false;
  }
}

function render() {
  renderTopbar();

  if (state.loading) {
    app.innerHTML = `<section class="section"><p class="section-subtitle">Loading Cinemax...</p></section>`;
    return;
  }

  if (!state.user) {
    renderAuth();
    return;
  }

  renderDashboard();
  renderModal();
  bindEvents();
}

function renderTopbar() {
  if (!state.user) {
    sessionActions.innerHTML = `<button class="ghost-btn" data-switch-auth="register">Create account</button>`;
    return;
  }

  sessionActions.innerHTML = `
    <span class="chip">${escapeHtml(state.user.name)} · ${state.user.role}</span>
    <button class="ghost-btn" id="logout-btn">Log out</button>
  `;

  document.getElementById("logout-btn").onclick = logout;
}

function renderAuth() {
  app.innerHTML = `
    <section class="section">
      <h2 class="section-title">Your Hosted Movie Platform Starts Here</h2>
      <p class="section-subtitle">Users can sign up, log in, and see the same movie catalog. Admin-added movies are saved on the server and stay available for everyone.</p>
      <div class="auth-grid">
        <div class="auth-card">
          <p class="eyebrow">${state.authMode === "login" ? "Login" : "Register"}</p>
          <h3>${state.authMode === "login" ? "Welcome back" : "Create your viewer account"}</h3>
          <form id="auth-form">
            ${state.authMode === "register" ? `
              <div class="field">
                <label for="name">Full name</label>
                <input id="name" name="name" placeholder="Aarav Singh" required>
              </div>
            ` : ""}
            <div class="field">
              <label for="email">Email</label>
              <input id="email" name="email" type="email" placeholder="you@example.com" required>
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input id="password" name="password" type="password" placeholder="Minimum 6 characters" required>
            </div>
            <button class="btn" type="submit">${state.authMode === "login" ? "Log in" : "Create account"}</button>
          </form>
          <div class="hint-box">
            Admin demo login:<br>
            <strong>Email:</strong> admin@cinimax.local<br>
            <strong>Password:</strong> Admin@123
          </div>
        </div>
        <div class="auth-card">
          <p class="eyebrow">What this app already does</p>
          <h3>Full-stack and persistent</h3>
          <p class="muted">This version includes a real backend, persistent storage in the server filesystem, admin-only movie management, and login-protected browsing for all users.</p>
          <div class="chip-row">
            <span class="chip">Backend API</span>
            <span class="chip">Cookie login</span>
            <span class="chip">Persistent storage</span>
            <span class="chip">Admin dashboard</span>
            <span class="chip">Hosted-link ready</span>
          </div>
          <div class="inline-actions">
            <button class="ghost-btn" data-switch-auth="${state.authMode === "login" ? "register" : "login"}">
              ${state.authMode === "login" ? "Need an account?" : "Already have an account?"}
            </button>
          </div>
        </div>
      </div>
    </section>
  `;

  document.getElementById("auth-form").onsubmit = onAuthSubmit;
  bindEvents();
}

function renderDashboard() {
  const featured = state.movies[0];
  app.innerHTML = `
    ${featured ? renderHero(featured) : ""}
    <section class="section">
      <div class="admin-header">
        <div>
          <h2 class="section-title">Movie Library</h2>
          <p class="section-subtitle">Every logged-in user sees the same saved catalog from the backend.</p>
        </div>
        <div class="inline-actions">
          ${state.user.role === "admin" ? `<button class="btn" id="open-add-form">Add movie</button>` : ""}
        </div>
      </div>
      ${renderMovieGrid()}
    </section>
    ${state.user.role === "admin" ? renderAdminSection() : ""}
  `;
}

function renderHero(movie) {
  return `
    <section class="hero" style="background-image:url('${escapeAttribute(movie.backdropUrl || movie.posterUrl)}')">
      <div class="hero-content">
        <span class="chip">Featured now</span>
        <h2 class="hero-title">${escapeHtml(movie.title)}</h2>
        <div class="hero-meta">
          <span class="chip">${movie.year}</span>
          <span class="chip">${escapeHtml(movie.duration)}</span>
          <span class="chip">Rating ${Number(movie.rating).toFixed(1)}</span>
        </div>
        <p class="hero-copy">${escapeHtml(movie.description)}</p>
        <div class="inline-actions">
          <button class="btn" data-play-movie="${movie.id}">Watch now</button>
          ${movie.trailerUrl ? `<a class="ghost-btn" href="${escapeAttribute(movie.trailerUrl)}" target="_blank" rel="noreferrer">Open trailer</a>` : ""}
        </div>
      </div>
    </section>
  `;
}

function renderMovieGrid() {
  if (!state.movies.length) {
    return `<div class="empty-state">No movies have been added yet.</div>`;
  }

  return `
    <div class="movie-grid">
      ${state.movies.map((movie) => `
        <article class="movie-card">
          <img class="movie-poster" src="${escapeAttribute(movie.posterUrl)}" alt="${escapeAttribute(movie.title)}">
          <div class="movie-body">
            <h3 class="movie-title">${escapeHtml(movie.title)}</h3>
            <div class="chip-row">
              <span class="chip">${movie.year}</span>
              <span class="chip">${escapeHtml(movie.duration)}</span>
              <span class="chip">${escapeHtml((movie.genre || []).join(", ") || "Unsorted")}</span>
            </div>
            <p class="muted">${escapeHtml(movie.description)}</p>
            <div class="inline-actions">
              <button class="btn" data-play-movie="${movie.id}">Watch</button>
              ${state.user.role === "admin" ? `<button class="ghost-btn" data-edit-movie="${movie.id}">Edit</button>` : ""}
              ${state.user.role === "admin" ? `<button class="danger-btn" data-delete-movie="${movie.id}">Delete</button>` : ""}
            </div>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderAdminSection() {
  const editingMovie = state.movies.find((movie) => movie.id === state.editingMovieId);

  return `
    <section class="section">
      <div class="admin-header">
        <div>
          <h2 class="section-title">Admin Dashboard</h2>
          <p class="section-subtitle">Add, edit, and remove movies. Changes are saved on the server and visible to everyone after login.</p>
        </div>
      </div>
      <div class="stats-grid">
        <div class="stats-card">
          <p class="muted">Movies saved</p>
          <p class="stats-value">${state.movies.length}</p>
        </div>
        <div class="stats-card">
          <p class="muted">Access model</p>
          <p class="stats-value">Login</p>
        </div>
        <div class="stats-card">
          <p class="muted">Storage</p>
          <p class="stats-value">Persistent</p>
        </div>
      </div>
      <div class="admin-form" id="admin-form-wrap">
        <p class="eyebrow">${editingMovie ? "Edit movie" : "Add movie"}</p>
        <h3>${editingMovie ? `Update ${escapeHtml(editingMovie.title)}` : "Publish a new movie"}</h3>
        <form id="movie-form">
          <div class="form-grid">
            <div class="field">
              <label for="title">Title</label>
              <input id="title" name="title" value="${escapeAttribute(editingMovie?.title || "")}" required>
            </div>
            <div class="field">
              <label for="year">Year</label>
              <input id="year" name="year" type="number" value="${escapeAttribute(editingMovie?.year || new Date().getFullYear())}" required>
            </div>
            <div class="field">
              <label for="duration">Duration</label>
              <input id="duration" name="duration" value="${escapeAttribute(editingMovie?.duration || "2h 00m")}" required>
            </div>
            <div class="field">
              <label for="rating">Rating</label>
              <input id="rating" name="rating" type="number" min="0" max="10" step="0.1" value="${escapeAttribute(editingMovie?.rating || 7.5)}">
            </div>
            <div class="field">
              <label for="genre">Genres</label>
              <input id="genre" name="genre" value="${escapeAttribute((editingMovie?.genre || []).join(", "))}" placeholder="Action, Drama">
            </div>
            <div class="field">
              <label for="posterUrl">Poster image URL</label>
              <input id="posterUrl" name="posterUrl" value="${escapeAttribute(editingMovie?.posterUrl || "")}" placeholder="Optional if you upload a poster file">
            </div>
            <div class="field">
              <label for="posterFile">Poster file upload</label>
              <input id="posterFile" name="posterFile" type="file" accept="image/*">
            </div>
            <div class="field">
              <label for="backdropUrl">Backdrop URL</label>
              <input id="backdropUrl" name="backdropUrl" value="${escapeAttribute(editingMovie?.backdropUrl || "")}" placeholder="Optional custom hero image">
            </div>
            <div class="field">
              <label for="streamUrl">Movie video URL</label>
              <input id="streamUrl" name="streamUrl" value="${escapeAttribute(editingMovie?.streamUrl || "")}" placeholder="Optional if you upload a video file">
            </div>
            <div class="field">
              <label for="movieFile">Movie video upload</label>
              <input id="movieFile" name="movieFile" type="file" accept="video/*">
            </div>
            <div class="field">
              <label for="trailerUrl">Trailer URL</label>
              <input id="trailerUrl" name="trailerUrl" value="${escapeAttribute(editingMovie?.trailerUrl || "")}" placeholder="YouTube embed link">
            </div>
          </div>
          <div class="field">
            <label for="description">Description</label>
            <textarea id="description" name="description" required>${escapeHtml(editingMovie?.description || "")}</textarea>
          </div>
          <p class="muted">If you upload files here, they are stored on the server and become visible to all logged-in users on the hosted site.</p>
          <div class="inline-actions">
            <button class="btn" type="submit">${editingMovie ? "Save changes" : "Add movie"}</button>
            ${editingMovie ? `<button class="ghost-btn" type="button" id="cancel-edit">Cancel edit</button>` : ""}
          </div>
        </form>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Movie</th>
              <th>Year</th>
              <th>Genres</th>
              <th>Stream</th>
            </tr>
          </thead>
          <tbody>
            ${state.movies.map((movie) => `
              <tr>
                <td>${escapeHtml(movie.title)}</td>
                <td>${movie.year}</td>
                <td>${escapeHtml((movie.genre || []).join(", "))}</td>
                <td><a href="${escapeAttribute(movie.streamUrl)}" target="_blank" rel="noreferrer">Open source</a></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderModal() {
  const existing = document.getElementById("movie-modal");
  if (existing) existing.remove();

  const movie = state.movies.find((item) => item.id === state.modalMovieId);
  if (!movie) return;

  const modal = document.createElement("div");
  modal.className = "modal open";
  modal.id = "movie-modal";
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-grid">
        <div class="modal-player">
          <video controls autoplay src="${escapeAttribute(movie.streamUrl)}"></video>
        </div>
        <div class="modal-info">
          <div class="inline-actions" style="justify-content: space-between; align-items: center;">
            <span class="chip">${escapeHtml(movie.duration)}</span>
            <button class="ghost-btn" id="close-modal">Close</button>
          </div>
          <h3 class="modal-title">${escapeHtml(movie.title)}</h3>
          <p class="muted">${escapeHtml(movie.description)}</p>
          <div class="chip-row">
            <span class="chip">${movie.year}</span>
            <span class="chip">Rating ${Number(movie.rating).toFixed(1)}</span>
            <span class="chip">${escapeHtml((movie.genre || []).join(", ") || "Unsorted")}</span>
          </div>
          ${movie.trailerUrl ? `<p><a href="${escapeAttribute(movie.trailerUrl)}" target="_blank" rel="noreferrer">Open trailer in new tab</a></p>` : ""}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.getElementById("close-modal").onclick = closeModal;
  modal.onclick = (event) => {
    if (event.target === modal) closeModal();
  };
}

function bindEvents() {
  document.querySelectorAll("[data-switch-auth]").forEach((button) => {
    button.onclick = () => {
      state.authMode = button.dataset.switchAuth;
      render();
    };
  });

  document.querySelectorAll("[data-play-movie]").forEach((button) => {
    button.onclick = () => {
      state.modalMovieId = button.dataset.playMovie;
      renderModal();
    };
  });

  document.querySelectorAll("[data-edit-movie]").forEach((button) => {
    button.onclick = () => {
      state.editingMovieId = button.dataset.editMovie;
      render();
      document.getElementById("admin-form-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  });

  document.querySelectorAll("[data-delete-movie]").forEach((button) => {
    button.onclick = async () => {
      if (!confirm("Delete this movie from the shared library?")) return;
      try {
        await api(`/api/movies/${button.dataset.deleteMovie}`, { method: "DELETE" });
        toast("Movie deleted.");
        await refreshMovies();
      } catch (error) {
        toast(error.message, true);
      }
    };
  });

  const movieForm = document.getElementById("movie-form");
  if (movieForm) movieForm.onsubmit = onMovieSubmit;

  const cancelEdit = document.getElementById("cancel-edit");
  if (cancelEdit) {
    cancelEdit.onclick = () => {
      state.editingMovieId = null;
      render();
    };
  }

  const openAddForm = document.getElementById("open-add-form");
  if (openAddForm) {
    openAddForm.onclick = () => {
      state.editingMovieId = null;
      document.getElementById("admin-form-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  }
}

async function onAuthSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = {
    name: form.get("name"),
    email: form.get("email"),
    password: form.get("password")
  };

  try {
    const endpoint = state.authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const result = await api(endpoint, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    state.user = result.user;
    await refreshMovies();
    toast(`Welcome, ${state.user.name.split(" ")[0]}!`);
  } catch (error) {
    toast(error.message, true);
  }
}

async function onMovieSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const existingMovie = state.movies.find((movie) => movie.id === state.editingMovieId);

  let posterUrl = String(form.get("posterUrl") || "").trim();
  let streamUrl = String(form.get("streamUrl") || "").trim();
  const backdropUrlInput = String(form.get("backdropUrl") || "").trim();

  const posterFile = form.get("posterFile");
  const movieFile = form.get("movieFile");

  try {
    if (posterFile && posterFile.size) {
      toast("Uploading poster...");
      const uploadedPoster = await uploadFileAsset(posterFile);
      posterUrl = uploadedPoster.url;
    } else if (existingMovie) {
      posterUrl = posterUrl || existingMovie.posterUrl;
    }

    if (movieFile && movieFile.size) {
      toast("Uploading movie file...");
      const uploadedMovie = await uploadFileAsset(movieFile);
      streamUrl = uploadedMovie.url;
    } else if (existingMovie) {
      streamUrl = streamUrl || existingMovie.streamUrl;
    }
  } catch (error) {
    toast(error.message, true);
    return;
  }

  const payload = {
    title: form.get("title"),
    year: Number(form.get("year")),
    duration: form.get("duration"),
    rating: Number(form.get("rating")),
    genre: String(form.get("genre") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    posterUrl,
    backdropUrl: backdropUrlInput || posterUrl || existingMovie?.backdropUrl || "",
    streamUrl,
    trailerUrl: form.get("trailerUrl"),
    description: form.get("description")
  };

  try {
    const isEditing = Boolean(state.editingMovieId);
    await api(isEditing ? `/api/movies/${state.editingMovieId}` : "/api/movies", {
      method: isEditing ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    toast(isEditing ? "Movie updated." : "Movie added.");
    state.editingMovieId = null;
    await refreshMovies();
  } catch (error) {
    toast(error.message, true);
  }
}

async function refreshMovies() {
  const moviePayload = await api("/api/movies");
  state.movies = moviePayload.movies;
  render();
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" });
  state.user = null;
  state.movies = [];
  state.editingMovieId = null;
  state.modalMovieId = null;
  render();
}

function closeModal() {
  state.modalMovieId = null;
  document.getElementById("movie-modal")?.remove();
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

async function uploadFileAsset(file) {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch("/api/uploads", {
    method: "POST",
    credentials: "include",
    body: form
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.error || "Upload failed.");
  }

  return payload.file;
}

function toast(message, isError = false) {
  const root = document.getElementById("toast-root");
  const item = document.createElement("div");
  item.className = "toast";
  item.style.borderColor = isError ? "rgba(251, 113, 133, 0.4)" : "rgba(49, 196, 141, 0.35)";
  item.textContent = message;
  root.appendChild(item);
  setTimeout(() => item.remove(), 3200);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

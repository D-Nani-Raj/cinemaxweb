(function () {
  var BRIDGE = {
    users: [],
    customMovies: [],
    sessionUser: null,
    idMap: {}
  };
  var USER_SCOPED_KEYS = {
    fav: true,
    wl: true,
    wd: true,
    wp: true,
    ur: true,
    rv: true,
    hist: true,
    req: true
  };

  function api(url, options) {
    options = options || {};
    var headers = options.headers || {};
    var body = options.body;
    if (!(body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    return fetch(url, {
      method: options.method || "GET",
      body: body,
      headers: headers,
      credentials: "include"
    }).then(async function (response) {
      var text = await response.text();
      var payload = {};
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch (error) {
          payload = { error: text };
        }
      }
      if (!response.ok) {
        throw new Error(payload.error || ("Request failed (" + response.status + ")."));
      }
      return payload;
    });
  }

  function getUiId(movie) {
    var rawId = String(movie.id || movie.backendId || "");
    if (BRIDGE.idMap[rawId]) return BRIDGE.idMap[rawId];
    var hash = 0;
    for (var i = 0; i < rawId.length; i++) {
      hash = ((hash << 5) - hash + rawId.charCodeAt(i)) | 0;
    }
    var nextId = Math.abs(hash) + 100000;
    while (Object.values(BRIDGE.idMap).indexOf(nextId) > -1) nextId += 1;
    BRIDGE.idMap[rawId] = nextId;
    return nextId;
  }

  function toUiMovie(movie) {
    var recoveredDefault = typeof DEFAULT_MOVIES !== "undefined"
      ? DEFAULT_MOVIES.find(function (item) { return String(item.title || "").toLowerCase() === String(movie.title || "").toLowerCase(); })
      : null;
    var rawId = movie.id;
    var uiId = typeof rawId === "number" ? rawId : getUiId(movie);

    return {
      id: uiId,
      backendId: String(movie.id),
      title: String(movie.title || "").trim(),
      year: Number(movie.year) || new Date().getFullYear(),
      rating: Number(movie.rating) || 5,
      genre: Array.isArray(movie.genre) ? movie.genre : [],
      duration: String(movie.duration || ""),
      dur_min: parseDurationMinutes(String(movie.duration || "")),
      category: String(movie.category || (recoveredDefault && recoveredDefault.category) || "Custom"),
      poster: String(movie.posterUrl || movie.poster || ""),
      backdrop: String(movie.backdropUrl || movie.backdrop || movie.posterUrl || movie.poster || ""),
      overview: String(movie.description || movie.overview || ""),
      trailerUrl: String(movie.trailerUrl || ""),
      videoUrl: String(movie.streamUrl || movie.videoUrl || ""),
      videoType: String(movie.streamUrl || movie.videoUrl || "").startsWith("/uploads/") ? "file" : (movie.videoUrl ? "url" : "url"),
      _edited: true
    };
  }

  function toApiMovie(movie, existingId) {
    return {
      id: existingId || movie.backendId || movie.id,
      title: movie.title,
      year: movie.year,
      rating: movie.rating,
      genre: movie.genre || [],
      duration: movie.duration,
      category: movie.category || "Custom",
      posterUrl: movie.poster,
      backdropUrl: movie.backdrop,
      description: movie.overview,
      trailerUrl: movie.trailerUrl || "",
      streamUrl: movie.videoUrl || ""
    };
  }

  function parseDurationMinutes(duration) {
    var hours = duration.match(/(\d+)\s*h/i);
    var minutes = duration.match(/(\d+)\s*m/i);
    if (hours || minutes) {
      return (hours ? +hours[1] * 60 : 0) + (minutes ? +minutes[1] : 0);
    }
    var raw = parseInt(duration, 10);
    return Number.isFinite(raw) ? raw : 120;
  }

  function setSessionUser(user, adminFlag) {
    BRIDGE.sessionUser = user || null;
    BRIDGE.users = BRIDGE.users || [];
    try {
      if (user) localStorage.setItem("cx_current_user", JSON.stringify(user));
      else localStorage.removeItem("cx_current_user");
      if (adminFlag) localStorage.setItem("cx_admin_session", JSON.stringify(true));
      else localStorage.removeItem("cx_admin_session");
    } catch (e) {}
  }

  function getStorageScope() {
    if (!BRIDGE.sessionUser) return "guest";
    return (BRIDGE.sessionUser.role === "admin" ? "admin" : "user") + "_" + BRIDGE.sessionUser.id;
  }

  function storageKey(key) {
    if (!USER_SCOPED_KEYS[key]) return "cx_" + key;
    return "cx_" + getStorageScope() + "_" + key;
  }

  function scopedLoad(key, fallback) {
    try {
      var v = localStorage.getItem(storageKey(key));
      return v !== null ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function scopedSave(key, value) {
    try {
      localStorage.setItem(storageKey(key), JSON.stringify(value));
    } catch (e) {}
  }

  function hydrateScopedState() {
    if (typeof S === "undefined") return;
    S.fav = scopedLoad("fav", []);
    S.wl = scopedLoad("wl", []);
    S.wd = scopedLoad("wd", []);
    S.wp = scopedLoad("wp", {});
    S.ur = scopedLoad("ur", {});
    S.rv = scopedLoad("rv", {});
    S.hist = scopedLoad("hist", []);
    S.req = scopedLoad("req", []);
  }

  function clearScopedState() {
    if (typeof S === "undefined") return;
    S.fav = [];
    S.wl = [];
    S.wd = [];
    S.wp = {};
    S.ur = {};
    S.rv = {};
    S.hist = [];
    S.req = [];
  }

  function refreshCustomMovies() {
    window.FIREBASE_CUSTOM_MOVIES = BRIDGE.customMovies.slice();
    window.FIREBASE_READY = true;
    FIREBASE_CUSTOM_MOVIES = window.FIREBASE_CUSTOM_MOVIES.slice();
    FIREBASE_READY = true;
    refreshMovies();
  }

  async function syncSession() {
    try {
      var session = await api("/api/auth/session");
      BRIDGE.sessionUser = session.user;
      setSessionUser(session.user, session.user.role === "admin");
      return session.user;
    } catch (error) {
      setSessionUser(null, false);
      return null;
    }
  }

  async function syncMovies() {
    try {
      var payload = await api("/api/movies");
      BRIDGE.customMovies = (payload.movies || []).map(toUiMovie);
    } catch (error) {
      BRIDGE.customMovies = [];
    }
    refreshCustomMovies();
  }

  async function syncUsers() {
    if (!BRIDGE.sessionUser || BRIDGE.sessionUser.role !== "admin") {
      BRIDGE.users = [];
      return;
    }
    try {
      var payload = await api("/api/admin/users");
      BRIDGE.users = payload.users || [];
    } catch (error) {
      BRIDGE.users = [];
    }
  }

  async function uploadFile(file) {
    var form = new FormData();
    form.append("file", file);
    var payload = await api("/api/uploads", { method: "POST", body: form, headers: {} });
    return payload.file;
  }

  window.getUsers = function () {
    return BRIDGE.users.slice();
  };
  window.saveUsers = function () {};
  window.getCurrentUser = function () {
    return BRIDGE.sessionUser;
  };
  window.isAdminSession = function () {
    return !!(BRIDGE.sessionUser && BRIDGE.sessionUser.role === "admin" && JSON.parse(localStorage.getItem("cx_admin_session") || "false"));
  };
  window.isLoggedIn = function () {
    return !!BRIDGE.sessionUser;
  };
  window.getCustomMovies = function () {
    return BRIDGE.customMovies.slice();
  };
  window.saveCustomMovies = function () {};
  window.LS = function (key, fallback) {
    return scopedLoad(key, fallback);
  };
  window.SS = function (key, value) {
    scopedSave(key, value);
  };

  window.authRegister = async function (name, email, password) {
    var payload = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name: name, email: email, password: password })
    });
    setSessionUser(payload.user, payload.user.role === "admin");
    BRIDGE.sessionUser = payload.user;
    hydrateScopedState();
    await syncUsers();
    await syncMovies();
    return { ok: true, user: payload.user };
  };

  window.authLogin = async function (email, password) {
    var payload = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: email, password: password })
    });
    setSessionUser(payload.user, false);
    BRIDGE.sessionUser = payload.user;
    hydrateScopedState();
    await syncUsers();
    await syncMovies();
    return { ok: true, user: payload.user };
  };

  window.authAdminLogin = async function (id, password) {
    if (id !== window.ADMIN_ID && id !== "admin@cinimax.local") {
      return { ok: false, msg: "Invalid admin credentials." };
    }
    try {
      var payload = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "admin@cinimax.local", password: password })
      });
      if (payload.user.role !== "admin") {
        return { ok: false, msg: "Admin access required." };
      }
      setSessionUser(payload.user, true);
      BRIDGE.sessionUser = payload.user;
      hydrateScopedState();
      await syncUsers();
      await syncMovies();
      return { ok: true };
    } catch (error) {
      return { ok: false, msg: error.message };
    }
  };

  window.authLogout = async function () {
    try { await api("/api/auth/logout", { method: "POST" }); } catch (e) {}
    BRIDGE.sessionUser = null;
    setSessionUser(null, false);
    BRIDGE.users = [];
    clearScopedState();
    await syncMovies();
  };

  window.resetPassword = async function (email, newPass) {
    try {
      await api("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email: email, password: newPass })
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, msg: error.message };
    }
  };

  window.addCustomMovie = async function (movie) {
    var payload = await api("/api/movies", {
      method: "POST",
      body: JSON.stringify(toApiMovie(movie))
    });
    var normalized = toUiMovie(payload.movie);
    BRIDGE.customMovies.push(normalized);
    refreshCustomMovies();
    return normalized;
  };

  window.updateMovie = async function (movie) {
    var payload;
    if (typeof DEFAULT_MOVIES !== "undefined" && DEFAULT_MOVIES.some(function (item) { return String(item.id) === String(movie.id); })) {
      payload = await api("/api/movies", {
        method: "POST",
        body: JSON.stringify(toApiMovie(movie, movie.id))
      });
    } else {
      var backendId = movie.backendId || movie.id;
      payload = await api("/api/movies/" + encodeURIComponent(backendId), {
        method: "PUT",
        body: JSON.stringify(toApiMovie(movie, backendId))
      });
    }
    var normalized = toUiMovie(payload.movie);
    var idx = BRIDGE.customMovies.findIndex(function (item) { return String(item.id) === String(movie.id); });
    if (idx > -1) BRIDGE.customMovies[idx] = normalized;
    else BRIDGE.customMovies.push(normalized);
    refreshCustomMovies();
    return normalized;
  };

  window.deleteMovieById = async function (id) {
    var movie = BRIDGE.customMovies.find(function (item) { return String(item.id) === String(id); });
    var backendId = movie && movie.backendId ? movie.backendId : id;
    await api("/api/movies/" + encodeURIComponent(backendId), { method: "DELETE" });
    BRIDGE.customMovies = BRIDGE.customMovies.filter(function (item) { return String(item.id) !== String(id); });
    refreshCustomMovies();
  };

  window.adminDeleteUser = async function (uid) {
    if (!confirm("Remove this user account?")) return;
    try {
      await api("/api/admin/users/" + encodeURIComponent(uid), { method: "DELETE" });
      await syncUsers();
      toast("User removed.");
      R();
    } catch (error) {
      toast(error.message || "Failed to remove user.");
    }
  };

  window.doLogin = async function () {
    var email = (document.getElementById("login-email") || {}).value || "";
    var pass = (document.getElementById("login-pass") || {}).value || "";
    var e = document.getElementById("login-err");
    if (e) e.textContent = "";
    if (!email || !pass) { if (e) e.textContent = "Please fill all fields."; return; }
    try {
      var res = await window.authLogin(email.trim(), pass);
      toast("Welcome back, " + res.user.name + "!");
      R();
    } catch (error) {
      if (e) e.textContent = error.message;
    }
  };

  window.doSignup = async function () {
    var name = (document.getElementById("signup-name") || {}).value || "";
    var email = (document.getElementById("signup-email") || {}).value || "";
    var pass = (document.getElementById("signup-pass") || {}).value || "";
    var e = document.getElementById("signup-err");
    if (e) e.textContent = "";
    if (!name || !email || !pass) { if (e) e.textContent = "Please fill all fields."; return; }
    if (pass.length < 6) { if (e) e.textContent = "Password must be at least 6 characters."; return; }
    try {
      var res = await window.authRegister(name.trim(), email.trim(), pass);
      toast("Account created! Welcome, " + res.user.name + "!");
      R();
    } catch (error) {
      if (e) e.textContent = error.message;
    }
  };

  window.doAdminLogin = async function () {
    var id = (document.getElementById("admin-id") || {}).value || "";
    var pass = (document.getElementById("admin-pass") || {}).value || "";
    var e = document.getElementById("admin-err");
    if (e) e.textContent = "";
    var res = await window.authAdminLogin(id.trim(), pass);
    if (!res.ok) { if (e) e.textContent = res.msg; return; }
    toast("Admin access granted!");
    S.showAdminAuth = false;
    go("admin");
  };

  window.doForgotStep2 = async function () {
    var p1 = (document.getElementById("new-pass") || {}).value || "";
    var p2 = (document.getElementById("new-pass2") || {}).value || "";
    var e = document.getElementById("reset-err");
    if (e) e.textContent = "";
    if (!p1 || !p2) { if (e) e.textContent = "Please fill both fields."; return; }
    if (p1.length < 6) { if (e) e.textContent = "Min 6 characters."; return; }
    if (p1 !== p2) { if (e) e.textContent = "Passwords do not match."; return; }
    var res = await window.resetPassword(S.forgotEmail, p1);
    if (!res.ok) { if (e) e.textContent = res.msg; return; }
    toast("Password reset! Please log in.");
    S.forgotMode = false; S.forgotStep = 1; S.forgotEmail = ""; renderAuthUI();
  };

  window.doForgotStep1 = function () {
    var email = (document.getElementById("forgot-email") || {}).value || "";
    var e = document.getElementById("forgot-err");
    if (e) e.textContent = "";
    if (!email) { if (e) e.textContent = "Please enter your email."; return; }
    S.forgotEmail = email.trim();
    S.forgotStep = 2;
    renderAuthUI();
  };

  window.doLogout = async function () {
    await window.authLogout();
    toast("Signed out. See you soon!");
    R();
  };

  window.adminAddMovie = async function () {
    var title = (document.getElementById("am-title") || {}).value || "";
    var year = +(document.getElementById("am-year") || {}).value || 0;
    var rating = +(document.getElementById("am-rating") || {}).value || 0;
    var dur = (document.getElementById("am-dur") || {}).value || "";
    var durmin = +(document.getElementById("am-durmin") || {}).value || 0;
    var cat = (document.getElementById("am-cat") || {}).value || "";
    var overview = (document.getElementById("am-overview") || {}).value || "";
    var poster = (document.getElementById("am-poster") || {}).value || "";
    var backdrop = (document.getElementById("am-backdrop") || {}).value || "";
    var trailerUrl = (document.getElementById("am-trailerurl") || {}).value || "";
    var genres = S.adminAddGenres || [];
    var err = document.getElementById("am-err");
    if (err) err.textContent = "";
    if (!title.trim()) { if (err) err.textContent = "Title is required."; return; }
    if (!year) { if (err) err.textContent = "Year is required."; return; }
    if (!cat) { if (err) err.textContent = "Category is required."; return; }
    if (!overview.trim()) { if (err) err.textContent = "Description is required."; return; }
    if (!genres.length) { if (err) err.textContent = "Select at least one genre."; return; }

    var videoUrl = "";
    var videoType = "none";
    var amFileInp = document.getElementById("am-fileinput");
    var amUrlInp = document.getElementById("am-videourl");
    var activeTab = S.addVsrcTab || "url";

    try {
      if (amFileInp && amFileInp.files && amFileInp.files[0]) {
        var uploadedMovie = await uploadFile(amFileInp.files[0]);
        videoUrl = uploadedMovie.url;
        videoType = "file";
      } else if (activeTab === "url" && amUrlInp && amUrlInp.value.trim()) {
        videoUrl = amUrlInp.value.trim();
        videoType = "url";
      }

      if (!poster.trim() && document.getElementById("am-posterfile") && document.getElementById("am-posterfile").files[0]) {
        var uploadedPoster = await uploadFile(document.getElementById("am-posterfile").files[0]);
        poster = uploadedPoster.url;
        if (!backdrop.trim()) backdrop = uploadedPoster.url;
      }
    } catch (error) {
      if (err) err.textContent = error.message;
      return;
    }

    if (!videoUrl) { if (err) err.textContent = "Add a movie video URL or upload a video file."; return; }

    var movie = {
      title: title.trim(),
      year: year,
      rating: rating || 5,
      genre: genres,
      duration: dur || (durmin ? durmin + "m" : "120m"),
      dur_min: durmin || parseDurationMinutes(dur || "120m"),
      category: cat,
      poster: poster.trim() || "https://via.placeholder.com/210x315/1a1a2e/e0e0e0?text=POSTER",
      backdrop: backdrop.trim() || poster.trim() || "https://via.placeholder.com/1280x720/1a1a2e/e0e0e0?text=BACKDROP",
      overview: overview.trim(),
      trailerUrl: trailerUrl.trim(),
      videoUrl: videoUrl,
      videoType: videoType
    };

    try {
      await window.addCustomMovie(movie);
      S.adminAddGenres = [];
      S.adminSection = "movies";
      toast('Movie "' + movie.title + '" added!');
      R();
    } catch (error) {
      if (err) err.textContent = error.message || "Failed to add movie.";
    }
  };

  window.saveEditMovie = async function () {
    var id = S.editMovieId;
    var m = gM(id);
    if (!m) return;
    var title = (document.getElementById("em-title") || {}).value || "";
    var year = +(document.getElementById("em-year") || {}).value || 0;
    var rating = +(document.getElementById("em-rating") || {}).value || 0;
    var dur = (document.getElementById("em-dur") || {}).value || "";
    var durmin = +(document.getElementById("em-durmin") || {}).value || 0;
    var cat = (document.getElementById("em-cat") || {}).value || "";
    var overview = (document.getElementById("em-overview") || {}).value || "";
    var poster = (document.getElementById("em-poster") || {}).value || m.poster;
    var backdrop = (document.getElementById("em-backdrop") || {}).value || m.backdrop;
    var trailerUrl = (document.getElementById("em-trailerurl") || {}).value || "";
    var err = document.getElementById("em-err");
    if (err) err.textContent = "";
    var checkedGs = document.querySelectorAll("#em-genre-wrap .genre-check.checked");
    var genres = [];
    checkedGs.forEach(function (el) { genres.push(el.textContent); });
    if (!title.trim()) { if (err) err.textContent = "Title is required."; return; }
    if (!year) { if (err) err.textContent = "Year is required."; return; }
    if (!cat) { if (err) err.textContent = "Category is required."; return; }
    if (!overview.trim()) { if (err) err.textContent = "Overview is required."; return; }
    if (!genres.length) { if (err) err.textContent = "Select at least one genre."; return; }

    var videoUrl = m.videoUrl || "";
    var videoType = m.videoType || "url";
    var emPosterFileInp = document.getElementById("em-posterfile");
    try {
      var emFileInp = document.getElementById("em-fileinput");
      var emUrlInp = document.getElementById("em-videourl");
      if (emFileInp && emFileInp.files && emFileInp.files[0]) {
        var uploadedMovie = await uploadFile(emFileInp.files[0]);
        videoUrl = uploadedMovie.url;
        videoType = "file";
      } else if (S.editVsrcTab === "url" && emUrlInp && emUrlInp.value.trim()) {
        videoUrl = emUrlInp.value.trim();
        videoType = "url";
      }

      if (emPosterFileInp && emPosterFileInp.files && emPosterFileInp.files[0]) {
        var uploadedPoster = await uploadFile(emPosterFileInp.files[0]);
        poster = uploadedPoster.url;
        if (!backdrop || backdrop === m.backdrop || backdrop === m.poster) {
          backdrop = uploadedPoster.url;
        }
      }
    } catch (error) {
      if (err) err.textContent = error.message;
      return;
    }

    var updated = Object.assign({}, m, {
      title: title.trim(),
      year: year,
      rating: rating || m.rating,
      genre: genres,
      duration: dur || m.duration,
      dur_min: durmin || m.dur_min,
      category: cat,
      overview: overview.trim(),
      poster: poster.trim() || m.poster,
      backdrop: backdrop.trim() || m.backdrop,
      trailerUrl: trailerUrl.trim(),
      videoUrl: videoUrl,
      videoType: videoType
    });
    try {
      await window.updateMovie(updated);
      closeEditModal();
      toast("Movie updated!");
      R();
    } catch (error) {
      if (err) err.textContent = error.message || "Failed to save changes.";
    }
  };

  document.addEventListener("DOMContentLoaded", async function () {
    var addPosterField = document.getElementById("am-poster");
    if (addPosterField && !document.getElementById("am-posterfile")) {
      var wrap = addPosterField.parentElement;
      wrap.insertAdjacentHTML("afterend", '<div class="form-group" style="grid-column:1/-1"><label>Poster Image Upload</label><input type="file" id="am-posterfile" class="form-input" accept="image/*"></div>');
    }
    await syncSession();
    hydrateScopedState();
    await syncUsers();
    await syncMovies();
    R();
  });

  window.openEditModal = function (id) {
    var m = gM(id); if (!m) return;
    S.editMovieId = id;
    S.editVsrcTab = m.videoType === "file" ? "file" : "url";
    var body = document.getElementById("edit-modal-body");
    if (!body) return;
    var selG = m.genre.slice();
    body.innerHTML = renderEditForm(m, selG);
    var posterField = document.getElementById("em-poster");
    if (posterField && !document.getElementById("em-posterfile")) {
      var wrap = posterField.parentElement;
      wrap.insertAdjacentHTML("afterend", '<div class="form-group" style="grid-column:1/-1"><label>Poster Image Upload</label><input type="file" id="em-posterfile" class="form-input" accept="image/*"></div>');
    }
    document.getElementById("edit-modal").classList.add("open");
  };
})();

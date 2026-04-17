const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const UPLOADS_DIR = path.join(__dirname, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");
const SESSION_COOKIE = "cinimax_session";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "video/ogg",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

ensureStorage();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    serveStatic(req, res, url);
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }

    console.error("Server error:", error);
    sendJson(res, 500, { error: "Internal server error." });
  }
});

server.listen(PORT, () => {
  console.log(`Cinemax server running on http://localhost:${PORT}`);
});

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    writeDb({
      users: [],
      sessions: [],
      movies: seedMovies(),
      meta: {
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    });
  }

  const db = readDb();
  const existingAdmin = db.users.find((user) => user.email === "admin@cinimax.local");

  if (!existingAdmin) {
    db.users.push({
      id: crypto.randomUUID(),
      name: "Cinema Admin",
      email: "admin@cinimax.local",
      passwordHash: hashPassword("Admin@123"),
      role: "admin",
      createdAt: Date.now()
    });
    writeDb(db);
  }
}

function seedMovies() {
  return [
    {
      id: crypto.randomUUID(),
      title: "The Silent Horizon",
      year: 2025,
      genre: ["Sci-Fi", "Drama"],
      duration: "2h 08m",
      rating: 8.4,
      posterUrl: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=900&q=80",
      backdropUrl: "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=1600&q=80",
      trailerUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      streamUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
      description: "An ex-pilot must guide the last inhabited orbital station through a deadly solar storm."
    },
    {
      id: crypto.randomUUID(),
      title: "Neon Chase",
      year: 2024,
      genre: ["Action", "Thriller"],
      duration: "1h 54m",
      rating: 7.9,
      posterUrl: "https://images.unsplash.com/photo-1513106580091-1d82408b8cd6?auto=format&fit=crop&w=900&q=80",
      backdropUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80",
      trailerUrl: "https://www.youtube.com/embed/aqz-KE-bpKQ",
      streamUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      description: "A courier with stolen evidence races through a rain-lit megacity before dawn."
    },
    {
      id: crypto.randomUUID(),
      title: "Monsoon Letters",
      year: 2023,
      genre: ["Romance", "Drama"],
      duration: "2h 01m",
      rating: 8.1,
      posterUrl: "https://images.unsplash.com/photo-1518998053901-5348d3961a04?auto=format&fit=crop&w=900&q=80",
      backdropUrl: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1600&q=80",
      trailerUrl: "https://www.youtube.com/embed/ScMzIvxBSi4",
      streamUrl: "https://www.w3schools.com/html/movie.mp4",
      description: "Two strangers reconnect across cities through handwritten letters delivered in the monsoon."
    }
  ];
}

function readDb() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(db) {
  db.meta = db.meta || {};
  db.meta.updatedAt = Date.now();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readJsonBody(req);
    const name = String(body.name || "").trim();
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (!name || !email || password.length < 6) {
      throw new HttpError(400, "Name, email, and a password with at least 6 characters are required.");
    }

    const db = readDb();
    if (db.users.some((user) => user.email === email)) {
      throw new HttpError(409, "An account with this email already exists.");
    }

    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash: hashPassword(password),
      role: "user",
      createdAt: Date.now()
    };

    db.users.push(user);
    const session = createSession(db, user.id);
    writeDb(db);
    setSessionCookie(res, session.token);
    sendJson(res, 201, { user: publicUser(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJsonBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const db = readDb();
    const user = db.users.find((entry) => entry.email === email);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new HttpError(401, "Invalid email or password.");
    }

    const session = createSession(db, user.id);
    writeDb(db);
    setSessionCookie(res, session.token);
    sendJson(res, 200, { user: publicUser(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const db = readDb();
    const token = parseCookies(req)[SESSION_COOKIE];
    db.sessions = db.sessions.filter((session) => session.token !== token);
    writeDb(db);
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/session") {
    const auth = requireAuth(req);
    sendJson(res, 200, { user: publicUser(auth.user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/reset-password") {
    const body = await readJsonBody(req);
    const email = normalizeEmail(body.email);
    const newPassword = String(body.password || "");
    if (!email || newPassword.length < 6) {
      throw new HttpError(400, "Email and a password with at least 6 characters are required.");
    }
    const db = readDb();
    const user = db.users.find((entry) => entry.email === email);
    if (!user) {
      throw new HttpError(404, "No account found.");
    }
    user.passwordHash = hashPassword(newPassword);
    writeDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/movies") {
    const auth = requireAuth(req);
    sendJson(res, 200, { movies: auth.db.movies });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/uploads") {
    requireAdmin(req);
    const upload = await readMultipartForm(req);
    const stored = saveUploadedAsset(upload.file);
    sendJson(res, 201, { file: stored });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/movies") {
    const auth = requireAdmin(req);
    const body = await readJsonBody(req);
    const movie = validateMovie(body, body.id);
    const existingIndex = auth.db.movies.findIndex((item) => String(item.id) === String(movie.id));
    if (existingIndex > -1) {
      const previousMovie = auth.db.movies[existingIndex];
      auth.db.movies[existingIndex] = movie;
      cleanupReplacedAssets(previousMovie, movie);
      writeDb(auth.db);
      sendJson(res, 200, { movie });
      return;
    }
    auth.db.movies.unshift(movie);
    writeDb(auth.db);
    sendJson(res, 201, { movie });
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/movies/")) {
    const auth = requireAdmin(req);
    const movieId = url.pathname.split("/").pop();
    const body = await readJsonBody(req);
    const index = auth.db.movies.findIndex((item) => item.id === movieId);

    if (index === -1) {
      throw new HttpError(404, "Movie not found.");
    }

    const previousMovie = auth.db.movies[index];
    auth.db.movies[index] = validateMovie(body, movieId);
    cleanupReplacedAssets(previousMovie, auth.db.movies[index]);
    writeDb(auth.db);
    sendJson(res, 200, { movie: auth.db.movies[index] });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/movies/")) {
    const auth = requireAdmin(req);
    const movieId = url.pathname.split("/").pop();
    const nextMovies = auth.db.movies.filter((movie) => movie.id !== movieId);

    if (nextMovies.length === auth.db.movies.length) {
      throw new HttpError(404, "Movie not found.");
    }

    const removedMovie = auth.db.movies.find((movie) => movie.id === movieId);
    cleanupMovieAssets(removedMovie);
    auth.db.movies = nextMovies;
    writeDb(auth.db);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/users") {
    const auth = requireAdmin(req);
    sendJson(res, 200, {
      users: auth.db.users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
      }))
    });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/admin/users/")) {
    const auth = requireAdmin(req);
    const userId = url.pathname.split("/").pop();
    const target = auth.db.users.find((user) => user.id === userId);
    if (!target) {
      throw new HttpError(404, "User not found.");
    }
    if (target.role === "admin") {
      throw new HttpError(400, "Admin user cannot be removed.");
    }
    auth.db.users = auth.db.users.filter((user) => user.id !== userId);
    auth.db.sessions = auth.db.sessions.filter((session) => session.userId !== userId);
    writeDb(auth.db);
    sendJson(res, 200, { ok: true });
    return;
  }

  throw new HttpError(404, "Route not found.");
}

function serveStatic(req, res, url) {
  let rootDir = PUBLIC_DIR;
  let filePath = url.pathname === "/" ? "/index.html" : url.pathname;

  if (url.pathname.startsWith("/uploads/")) {
    rootDir = UPLOADS_DIR;
    filePath = url.pathname.replace(/^\/uploads/, "");
  }

  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  const absPath = path.join(rootDir, filePath);

  if (!absPath.startsWith(rootDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.stat(absPath, (error, stats) => {
    if (error || !stats.isFile()) {
      if (rootDir === UPLOADS_DIR) {
        sendText(res, 404, "Not found");
        return;
      }
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallbackContent) => {
        if (fallbackError) {
          sendText(res, 404, "Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
        res.end(fallbackContent);
      });
      return;
    }

    const ext = path.extname(absPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    if (contentType.startsWith("video/")) {
      streamVideoFile(req, res, absPath, stats, contentType);
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stats.size
    });
    fs.createReadStream(absPath).pipe(res);
  });
}

function streamVideoFile(req, res, absPath, stats, contentType) {
  const rangeHeader = req.headers.range;

  if (!rangeHeader) {
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stats.size,
      "Accept-Ranges": "bytes"
    });
    fs.createReadStream(absPath).pipe(res);
    return;
  }

  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) {
    res.writeHead(416, {
      "Content-Range": `bytes */${stats.size}`
    });
    res.end();
    return;
  }

  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : stats.size - 1;

  if (!Number.isFinite(start) || start < 0) {
    start = 0;
  }

  if (!Number.isFinite(end) || end >= stats.size) {
    end = stats.size - 1;
  }

  if (start > end || start >= stats.size) {
    res.writeHead(416, {
      "Content-Range": `bytes */${stats.size}`
    });
    res.end();
    return;
  }

  res.writeHead(206, {
    "Content-Type": contentType,
    "Content-Length": end - start + 1,
    "Content-Range": `bytes ${start}-${end}/${stats.size}`,
    "Accept-Ranges": "bytes"
  });

  fs.createReadStream(absPath, { start, end }).pipe(res);
}

function requireAuth(req) {
  const db = readDb();
  const token = parseCookies(req)[SESSION_COOKIE];
  const session = db.sessions.find((entry) => entry.token === token && entry.expiresAt > Date.now());

  if (!session) {
    throw new HttpError(401, "Please log in first.");
  }

  const user = db.users.find((entry) => entry.id === session.userId);
  if (!user) {
    throw new HttpError(401, "Invalid session.");
  }

  return { db, user, session };
}

function requireAdmin(req) {
  const auth = requireAuth(req);
  if (auth.user.role !== "admin") {
    throw new HttpError(403, "Admin access required.");
  }
  return auth;
}

function validateMovie(input, existingId) {
  const title = String(input.title || "").trim();
  const description = String(input.description || "").trim();
  const year = Number(input.year);
  const rating = Number(input.rating);
  const duration = String(input.duration || "").trim();
  const category = String(input.category || "").trim();
  const trailerUrl = String(input.trailerUrl || "").trim();
  const streamUrl = String(input.streamUrl || "").trim();
  const posterUrl = String(input.posterUrl || "").trim();
  const backdropUrl = String(input.backdropUrl || "").trim();
  const genre = Array.isArray(input.genre)
    ? input.genre.map((item) => String(item).trim()).filter(Boolean)
    : String(input.genre || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

  if (!title || !description || !duration || !posterUrl || !streamUrl || !year || !category) {
    throw new HttpError(400, "Title, year, category, duration, description, poster URL, and stream URL are required.");
  }

  return {
    id: existingId || crypto.randomUUID(),
    title,
    year,
    rating: Number.isFinite(rating) ? rating : 7,
    duration,
    category,
    genre,
    posterUrl,
    backdropUrl: backdropUrl || posterUrl,
    trailerUrl,
    streamUrl,
    description
  };
}

function cleanupReplacedAssets(previousMovie, nextMovie) {
  if (!previousMovie || !nextMovie) {
    return;
  }

  ["posterUrl", "backdropUrl", "streamUrl"].forEach((field) => {
    if (previousMovie[field] && previousMovie[field] !== nextMovie[field]) {
      cleanupManagedAsset(previousMovie[field]);
    }
  });
}

function cleanupMovieAssets(movie) {
  if (!movie) {
    return;
  }

  ["posterUrl", "backdropUrl", "streamUrl"].forEach((field) => {
    cleanupManagedAsset(movie[field]);
  });
}

function cleanupManagedAsset(assetUrl) {
  const filePath = resolveManagedAssetPath(assetUrl);
  if (!filePath) {
    return;
  }

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("Failed to delete uploaded file:", error.message);
  }
}

function resolveManagedAssetPath(assetUrl) {
  if (typeof assetUrl !== "string" || !assetUrl.startsWith("/uploads/")) {
    return null;
  }

  const safeRelative = path.normalize(assetUrl.replace(/^\/uploads\//, ""));
  const filePath = path.join(UPLOADS_DIR, safeRelative);
  if (!filePath.startsWith(UPLOADS_DIR)) {
    return null;
  }
  return filePath;
}

function saveUploadedAsset(file) {
  if (!file || !file.filename || !file.content || !file.content.length) {
    throw new HttpError(400, "A file upload is required.");
  }

  const extension = path.extname(file.filename).toLowerCase();
  const safeName = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  const targetPath = path.join(UPLOADS_DIR, safeName);
  fs.writeFileSync(targetPath, file.content);

  return {
    url: `/uploads/${safeName}`,
    originalName: file.filename,
    mimeType: file.contentType || detectMimeType(extension)
  };
}

function createSession(db, userId) {
  const session = {
    token: crypto.randomBytes(32).toString("hex"),
    userId,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7
  };

  db.sessions = db.sessions.filter((entry) => entry.userId !== userId && entry.expiresAt > Date.now());
  db.sessions.push(session);
  return session;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, originalHash] = String(stored || "").split(":");
  if (!salt || !originalHash) {
    return false;
  }
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(originalHash, "hex"));
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((acc, chunk) => {
    const [key, ...rest] = chunk.trim().split("=");
    if (!key) {
      return acc;
    }
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) {
        reject(new HttpError(413, "Request body is too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new HttpError(400, "Invalid JSON body."));
      }
    });

    req.on("error", () => reject(new HttpError(400, "Failed to read request body.")));
  });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > 600 * 1024 * 1024) {
        reject(new HttpError(413, "Upload is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => reject(new HttpError(400, "Failed to read upload.")));
  });
}

async function readMultipartForm(req) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

  if (!boundaryMatch) {
    throw new HttpError(400, "Multipart boundary is missing.");
  }

  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const body = await readRawBody(req);
  const parts = parseMultipartBody(body, boundary);
  const file = parts.find((part) => part.filename);

  if (!file) {
    throw new HttpError(400, "No file was uploaded.");
  }

  return { file, parts };
}

function parseMultipartBody(buffer, boundary) {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const parts = [];
  let cursor = buffer.indexOf(boundaryBuffer);

  while (cursor !== -1) {
    cursor += boundaryBuffer.length;

    if (buffer[cursor] === 45 && buffer[cursor + 1] === 45) {
      break;
    }

    if (buffer[cursor] === 13 && buffer[cursor + 1] === 10) {
      cursor += 2;
    }

    const nextBoundary = buffer.indexOf(boundaryBuffer, cursor);
    if (nextBoundary === -1) {
      break;
    }

    const partBuffer = buffer.subarray(cursor, nextBoundary - 2);
    const headerEnd = partBuffer.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) {
      cursor = nextBoundary;
      continue;
    }

    const headersText = partBuffer.subarray(0, headerEnd).toString("utf8");
    const content = partBuffer.subarray(headerEnd + 4);
    const part = parseMultipartHeaders(headersText, content);
    parts.push(part);
    cursor = nextBoundary;
  }

  return parts;
}

function parseMultipartHeaders(headersText, content) {
  const lines = headersText.split("\r\n");
  const headers = {};

  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim().toLowerCase();
    headers[key] = line.slice(separator + 1).trim();
  }

  const disposition = headers["content-disposition"] || "";
  const nameMatch = disposition.match(/name="([^"]+)"/i);
  const filenameMatch = disposition.match(/filename="([^"]*)"/i);

  return {
    name: nameMatch ? nameMatch[1] : "",
    filename: filenameMatch ? path.basename(filenameMatch[1]) : "",
    contentType: headers["content-type"] || "application/octet-stream",
    content
  };
}

function detectMimeType(extension) {
  return MIME_TYPES[extension] || "application/octet-stream";
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

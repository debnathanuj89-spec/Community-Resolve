/* ============================================
   LocalFix — Shared JavaScript
   Firebase config, auth helpers, utilities
   ============================================ */

// ─────────────────────────────────────────────
// FIREBASE CONFIGURATION
// Replace these values with your own Firebase
// project settings from:
// https://console.firebase.google.com →
//   Project Settings → Your apps → Web app
// ─────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyC0rIkvS7EjrqKQ1s6CmVFLomYbIJ9Aw7M",
  authDomain:        "resolvelt-23fa0.firebaseapp.com",
  projectId:         "resolvelt-23fa0",
  storageBucket:     "resolvelt-23fa0.firebasestorage.app",
  messagingSenderId: "478641195425",
  appId:             "1:478641195425:web:95dad4fd36f9c5a53763e0",
  measurementId:     "G-PVXCG1R41S"
};

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const ISSUE_CATEGORIES = [
  { value: "pothole",        label: "🕳️ Pothole",           cssClass: "cat-pothole" },
  { value: "streetlight",    label: "💡 Broken Streetlight", cssClass: "cat-streetlight" },
  { value: "graffiti",       label: "🖌️ Graffiti",          cssClass: "cat-graffiti" },
  { value: "garbage",        label: "🗑️ Waste / Garbage",   cssClass: "cat-garbage" },
  { value: "flooding",       label: "🌊 Flooding",          cssClass: "cat-flooding" },
  { value: "infrastructure", label: "🏗️ Infrastructure",   cssClass: "cat-infrastructure" },
  { value: "noise",          label: "📢 Noise Complaint",   cssClass: "cat-noise" },
  { value: "other",          label: "📌 Other",             cssClass: "cat-other" }
];

const ISSUE_STATUSES = [
  { value: "open",        label: "Open",        badgeClass: "badge-open" },
  { value: "in_progress", label: "In Progress", badgeClass: "badge-in_progress" },
  { value: "resolved",    label: "Resolved",    badgeClass: "badge-resolved" },
  { value: "closed",      label: "Closed",      badgeClass: "badge-closed" }
];

// Default map center — Agartala, Tripura
const DEFAULT_MAP_CENTER = [23.8315, 91.2868];
const DEFAULT_MAP_ZOOM   = 10;

// Tripura districts
const TRIPURA_DISTRICTS = [
  { value: "agartala",      label: "🏙️ Agartala" },
  { value: "west_tripura",  label: "📍 West Tripura" },
  { value: "sepahijala",    label: "📍 Sepahijala" },
  { value: "gomati",        label: "📍 Gomati" },
  { value: "south_tripura", label: "📍 South Tripura" },
  { value: "khowai",        label: "📍 Khowai" },
  { value: "dhalai",        label: "📍 Dhalai" },
  { value: "unakoti",       label: "📍 Unakoti" },
  { value: "north_tripura", label: "📍 North Tripura" }
];

// Approximate bounding box for Tripura
const TRIPURA_BOUNDS = { south: 22.929, north: 24.539, west: 91.159, east: 92.327 };

/** Returns true if the lat/lng falls within Tripura's bounding box. */
function isInTripura(lat, lng) {
  return lat >= TRIPURA_BOUNDS.south && lat <= TRIPURA_BOUNDS.north &&
         lng >= TRIPURA_BOUNDS.west  && lng <= TRIPURA_BOUNDS.east;
}

// Firestore collection names
const COLLECTIONS = {
  ISSUES: "issues",
  USERS:  "users",
  VOTES:  "votes"
};

// Admin UIDs — add user UIDs here after first login
// Or set a custom claim. For demo, check email ending with @admin.resolvelt.com
const ADMIN_EMAIL_DOMAIN = "@admin.resolvelt.com";

// ─────────────────────────────────────────────
// FIREBASE INITIALIZATION
// ─────────────────────────────────────────────
let app, auth, db;

/**
 * Initialize Firebase. Call this at the start of each page.
 * Returns true on success, false if config is placeholder.
 */
function initFirebase() {
  // Detect placeholder config
  if (FIREBASE_CONFIG.apiKey === "YOUR_API_KEY") {
    console.warn("⚠️  LocalFix: Firebase config is not set. Edit script.js and replace the placeholder values.");
    showToast("Firebase is not configured yet. Please update script.js with your Firebase credentials.", "warning", 8000);
    return false;
  }

  if (!firebase.apps.length) {
    app = firebase.initializeApp(FIREBASE_CONFIG);
  } else {
    app = firebase.apps[0];
  }

  auth    = firebase.auth();
  db      = firebase.firestore();

  // Enable Firestore offline persistence
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

  return true;
}

// ─────────────────────────────────────────────
// AUTHENTICATION HELPERS
// ─────────────────────────────────────────────

/**
 * Get currently signed-in user, or null.
 */
function getCurrentUser() {
  return auth ? auth.currentUser : null;
}

/**
 * Watch auth state changes.
 * @param {function} callback - receives user or null
 */
function onAuthStateChanged(callback) {
  if (!auth) return;
  auth.onAuthStateChanged(callback);
}

/**
 * Sign out and redirect to login page.
 */
async function signOut(redirectUrl = "./login.html") {
  try {
    await auth.signOut();
    window.location.href = redirectUrl;
  } catch (err) {
    showToast("Sign-out failed: " + err.message, "error");
  }
}

/**
 * Guard a page — redirect to login if not authenticated.
 * Returns the user if authenticated, redirects otherwise.
 */
function requireAuth(redirectUrl = "./login.html") {
  return new Promise((resolve) => {
    auth.onAuthStateChanged((user) => {
      if (user) {
        resolve(user);
      } else {
        window.location.href = redirectUrl;
      }
    });
  });
}

/**
 * Check if user is admin — Firestore is the single source of truth.
 * Role can only be set to "admin" by editing the Firestore document directly
 * or via the admin dashboard; it is never trusted from the client at signup.
 */
async function isAdmin(user) {
  if (!user) return false;
  try {
    const doc = await db.collection(COLLECTIONS.USERS).doc(user.uid).get();
    return doc.exists && doc.data().role === "admin";
  } catch (e) {
    return false;
  }
}

/**
 * Create or update user profile in Firestore on sign-in.
 */
async function ensureUserProfile(user, extraData = {}) {
  if (!user || !db) throw new Error("Firebase not initialized");
  const fullName = extraData.displayName || user.displayName || "Anonymous";
  const userRef  = db.collection(COLLECTIONS.USERS).doc(user.uid);
  const snap     = await userRef.get();
  if (!snap.exists) {
    // New accounts are always created as "resident".
    // Admin role can only be granted by editing Firestore directly.
    await userRef.set({
      uid:       user.uid,
      fullName:  fullName,
      email:     user.email || "",
      role:      "resident",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } else {
    // Backfill fullName if missing (for existing docs that used displayName)
    const data = snap.data();
    if (!data.fullName && fullName !== "Anonymous") {
      await userRef.update({ fullName });
    }
  }
}

// ─────────────────────────────────────────────
// FIRESTORE HELPERS
// ─────────────────────────────────────────────

/**
 * Get all issues ordered by creation date descending.
 * @param {object} filters - { status, category }
 */
async function getIssues(filters = {}) {
  let query = db.collection(COLLECTIONS.ISSUES);
  if (filters.status)   query = query.where("status",   "==", filters.status);
  if (filters.category) query = query.where("category", "==", filters.category);
  query = query.orderBy("createdAt", "desc");
  const snap = await query.get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get issues reported by a specific user.
 */
async function getUserIssues(uid) {
  const snap = await db.collection(COLLECTIONS.ISSUES)
    .where("reportedBy", "==", uid)
    .orderBy("createdAt", "desc")
    .get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get a single issue by ID.
 */
async function getIssue(id) {
  const doc = await db.collection(COLLECTIONS.ISSUES).doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

/**
 * Create a new issue in Firestore.
 */
async function createIssue(data) {
  const docRef = await db.collection(COLLECTIONS.ISSUES).add({
    ...data,
    status:    "open",
    upvotes:   0,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return docRef.id;
}

/**
 * Update issue status (admin only).
 */
async function updateIssueStatus(id, status) {
  await db.collection(COLLECTIONS.ISSUES).doc(id).update({
    status,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

/**
 * Toggle upvote for current user on an issue.
 * Uses a subcollection to track who voted.
 * Returns new upvote count.
 */
async function toggleUpvote(issueId, userId) {
  const voteRef = db.collection(COLLECTIONS.ISSUES).doc(issueId)
    .collection("voters").doc(userId);
  const issueRef = db.collection(COLLECTIONS.ISSUES).doc(issueId);

  const voteSnap = await voteRef.get();
  const increment = firebase.firestore.FieldValue.increment;

  if (voteSnap.exists) {
    // Remove vote
    await voteRef.delete();
    await issueRef.update({ upvotes: increment(-1) });
    return false; // voted = false
  } else {
    // Add vote
    await voteRef.set({ votedAt: firebase.firestore.FieldValue.serverTimestamp() });
    await issueRef.update({ upvotes: increment(1) });
    return true; // voted = true
  }
}

/**
 * Check if user has upvoted an issue.
 */
async function hasUpvoted(issueId, userId) {
  const snap = await db.collection(COLLECTIONS.ISSUES).doc(issueId)
    .collection("voters").doc(userId).get();
  return snap.exists;
}

/**
 * Get dashboard stats: totals grouped by status.
 */
async function getDashboardStats() {
  const snap = await db.collection(COLLECTIONS.ISSUES).get();
  const stats = { total: 0, open: 0, in_progress: 0, resolved: 0, closed: 0 };
  snap.docs.forEach(doc => {
    const d = doc.data();
    stats.total++;
    if (stats[d.status] !== undefined) stats[d.status]++;
  });
  return stats;
}

// ─────────────────────────────────────────────
// MAP HELPERS (Leaflet)
// ─────────────────────────────────────────────

let _map = null;

/**
 * Initialize a Leaflet map in an element.
 * @param {string} elementId - id of the map container div
 * @param {Array}  center    - [lat, lng]
 * @param {number} zoom      - zoom level
 */
function initMap(elementId, center = DEFAULT_MAP_CENTER, zoom = DEFAULT_MAP_ZOOM) {
  if (_map) {
    _map.remove();
    _map = null;
  }
  _map = L.map(elementId).setView(center, zoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(_map);
  return _map;
}

/**
 * Get the category emoji for map markers.
 */
function getCategoryEmoji(category) {
  const map = {
    pothole:        "🕳️",
    streetlight:    "💡",
    graffiti:       "🖌️",
    garbage:        "🗑️",
    flooding:       "🌊",
    infrastructure: "🏗️",
    noise:          "📢",
    other:          "📌"
  };
  return map[category] || "📌";
}

/**
 * Create a custom Leaflet divIcon marker.
 */
function createMarkerIcon(category, status) {
  const emoji = getCategoryEmoji(category);
  const color = status === "resolved" ? "#27ae60" : status === "in_progress" ? "#f39c12" : "#e74c3c";
  return L.divIcon({
    className: "",
    html: `<div style="
      background:${color};
      color:#fff;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      width:36px;height:36px;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);
      border:2px solid #fff;
      font-size:14px;
    "><span style="transform:rotate(45deg)">${emoji}</span></div>`,
    iconSize:   [36, 36],
    iconAnchor: [18, 36],
    popupAnchor:[0, -40]
  });
}

/**
 * Add issue markers to the map.
 * @param {L.Map}  map     - Leaflet map instance
 * @param {Array}  issues  - array of issue objects
 * @param {function} onClick - optional click handler for marker
 */
function addIssuesToMap(map, issues, onClick) {
  issues.forEach(issue => {
    if (!issue.location || !issue.location.lat) return;
    const icon = createMarkerIcon(issue.category, issue.status);
    const marker = L.marker([issue.location.lat, issue.location.lng], { icon })
      .addTo(map);
    const catLabel = getCategoryLabel(issue.category);
    const statusLabel = getStatusLabel(issue.status);
    marker.bindPopup(`
      <div style="min-width:180px;font-family:Inter,sans-serif;">
        <strong style="font-size:0.9rem;">${escHtml(issue.title)}</strong>
        <div style="margin:4px 0;font-size:0.75rem;color:#6b7280;">
          ${catLabel} &nbsp;·&nbsp; ${statusLabel}
        </div>
        <div style="font-size:0.78rem;color:#374151;">${escHtml(issue.description || "").substring(0, 80)}${(issue.description || "").length > 80 ? "…" : ""}</div>
        <div style="margin-top:6px;font-size:0.75rem;color:#9ca3af;">👍 ${issue.upvotes || 0} upvotes</div>
      </div>
    `);
    if (onClick) marker.on("click", () => onClick(issue));
  });
}

// ─────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────

/**
 * Show a toast notification.
 * @param {string} message  - toast message
 * @param {string} type     - "info" | "success" | "error" | "warning"
 * @param {number} duration - ms before auto-dismiss (0 = no auto-dismiss)
 */
function showToast(message, type = "info", duration = 3500) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const icons = { info: "ℹ️", success: "✅", error: "❌", warning: "⚠️" };
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || "ℹ️"}</span>
    <span class="toast-text">${escHtml(message)}</span>
    <button class="toast-close" aria-label="Close">×</button>
  `;
  toast.querySelector(".toast-close").addEventListener("click", () => removeToast(toast));
  container.appendChild(toast);
  if (duration > 0) setTimeout(() => removeToast(toast), duration);
  return toast;
}

function removeToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.classList.add("removing");
  setTimeout(() => toast.parentNode && toast.parentNode.removeChild(toast), 220);
}

/**
 * Show / hide the full-page loading overlay.
 */
function setLoading(visible, message = "Loading…") {
  let overlay = document.getElementById("loading-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "loading-overlay";
    overlay.className = "loading-overlay";
    overlay.innerHTML = `<div class="spinner"></div><span id="loading-msg"></span>`;
    document.body.appendChild(overlay);
  }
  document.getElementById("loading-msg").textContent = message;
  overlay.classList.toggle("active", visible);
}

/**
 * Open / close a modal.
 */
function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add("active");
}
function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove("active");
}

/**
 * Bind modal close on overlay click and close buttons.
 */
function bindModalClose(modalId) {
  const overlay = document.getElementById(modalId);
  if (!overlay) return;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal(modalId);
  });
  overlay.querySelectorAll("[data-close-modal]").forEach(btn => {
    btn.addEventListener("click", () => closeModal(modalId));
  });
}

// ─────────────────────────────────────────────
// RENDERING HELPERS
// ─────────────────────────────────────────────

/**
 * Render an issue card as HTML string.
 * @param {object}  issue     - issue data object
 * @param {string}  userId    - current user UID (or null for public)
 * @param {boolean} showVote  - whether to show upvote button
 * @param {boolean} listMode  - true = compact row (list view), false = full card (grid view)
 */
function renderIssueCard(issue, userId, showVote = true, listMode = false) {
  const catInfo  = ISSUE_CATEGORIES.find(c => c.value === issue.category) || ISSUE_CATEGORIES[7];
  const statInfo = ISSUE_STATUSES.find(s => s.value === issue.status)     || ISSUE_STATUSES[0];
  const date     = issue.createdAt ? formatDate(issue.createdAt.toDate ? issue.createdAt.toDate() : new Date(issue.createdAt)) : "";

  // ── Row / list mode (compact horizontal layout) ──
  if (listMode) {
    return `
      <div class="issue-row" data-id="${issue.id}">
        <div class="issue-row-icon ${catInfo.cssClass}">${getCategoryEmoji(issue.category)}</div>
        <div class="issue-row-body">
          <div class="issue-row-title">${escHtml(issue.title)}</div>
          <div class="issue-row-meta">
            <span class="badge ${statInfo.badgeClass}">${statInfo.label}</span>
            <span class="badge ${catInfo.cssClass}">${catInfo.label}</span>
            ${issue.district ? `<span class="issue-row-district">· ${escHtml(getDistrictLabel(issue.district).replace(/📍\s*|🏙️\s*/g,''))}</span>` : ""}
          </div>
        </div>
        <div class="issue-row-right">
          ${showVote ? `
          <button class="upvote-btn" data-issue-id="${issue.id}" ${!userId ? 'title="Sign in to vote"' : ""}>
            👍 <span class="vote-count">${issue.upvotes || 0}</span>
          </button>` : ""}
          <span class="issue-date">${date}</span>
        </div>
      </div>
    `;
  }

  // ── Card / grid mode (full vertical card) ──
  return `
    <div class="issue-card" data-id="${issue.id}">
      <div class="issue-card-img">
        <span>${getCategoryEmoji(issue.category)}</span>
      </div>
      <div class="issue-card-body">
        <div class="issue-meta">
          <span class="badge ${catInfo.cssClass}">${catInfo.label}</span>
          <span class="badge ${statInfo.badgeClass}">${statInfo.label}</span>
        </div>
        <div class="issue-title">${escHtml(issue.title)}</div>
        <div class="issue-desc">${escHtml(issue.description || "")}</div>
        <div class="issue-location">📍 ${escHtml(issue.address || "Location not specified")}</div>
      </div>
      ${showVote ? `
      <div class="issue-actions">
        <button class="upvote-btn" data-issue-id="${issue.id}" ${!userId ? 'title="Sign in to vote"' : ""}>
          👍 <span class="vote-count">${issue.upvotes || 0}</span>
        </button>
        ${issue.reportedBy === userId ? '<span class="badge badge-primary hide-mobile">Your report</span>' : ""}
        <span class="issue-date">${date}</span>
      </div>` : ""}
    </div>
  `;
}

/**
 * Render status badge HTML.
 */
function renderStatusBadge(status) {
  const info = ISSUE_STATUSES.find(s => s.value === status) || ISSUE_STATUSES[0];
  return `<span class="badge ${info.badgeClass}">${info.label}</span>`;
}

/**
 * Render category badge HTML.
 */
function renderCategoryBadge(category) {
  const info = ISSUE_CATEGORIES.find(c => c.value === category) || ISSUE_CATEGORIES[7];
  return `<span class="badge ${info.cssClass}">${info.label}</span>`;
}

/**
 * Populate a <select> with category options.
 */
function populateCategorySelect(selectEl, includeAll = false) {
  if (includeAll) selectEl.innerHTML += `<option value="">All Categories</option>`;
  ISSUE_CATEGORIES.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat.value;
    opt.textContent = cat.label;
    selectEl.appendChild(opt);
  });
}

/**
 * Populate a <select> with Tripura district options.
 */
function populateDistrictSelect(selectEl, includeAll = false) {
  if (includeAll) selectEl.innerHTML += `<option value="">All Districts</option>`;
  TRIPURA_DISTRICTS.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d.value;
    opt.textContent = d.label;
    selectEl.appendChild(opt);
  });
}

/** Get human-readable district label. */
function getDistrictLabel(value) {
  const d = TRIPURA_DISTRICTS.find(d => d.value === value);
  return d ? d.label : value;
}

/**
 * Populate a <select> with status options.
 */
function populateStatusSelect(selectEl, includeAll = false) {
  if (includeAll) selectEl.innerHTML += `<option value="">All Statuses</option>`;
  ISSUE_STATUSES.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.value;
    opt.textContent = s.label;
    selectEl.appendChild(opt);
  });
}

// ─────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────

/** HTML-escape a string to prevent XSS. */
function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Format a Date object as a relative or absolute date string. */
function formatDate(date) {
  if (!date) return "";
  const now  = new Date();
  const diff = now - date; // ms
  if (diff < 60000)           return "just now";
  if (diff < 3600000)         return Math.floor(diff / 60000) + "m ago";
  if (diff < 86400000)        return Math.floor(diff / 3600000) + "h ago";
  if (diff < 7 * 86400000)    return Math.floor(diff / 86400000) + "d ago";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Get human-readable category label. */
function getCategoryLabel(value) {
  const cat = ISSUE_CATEGORIES.find(c => c.value === value);
  return cat ? cat.label : value;
}

/** Get human-readable status label. */
function getStatusLabel(value) {
  const s = ISSUE_STATUSES.find(s => s.value === value);
  return s ? s.label : value;
}

/** Validate email format. */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Validate password strength (min 6 chars). */
function isValidPassword(pwd) {
  return pwd && pwd.length >= 6;
}

/** Geolocate the user and return {lat, lng} or null. */
function getUserLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      ()   => resolve(null),
      { timeout: 8000 }
    );
  });
}

// Bind global sign-out buttons when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-signout]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (auth) signOut();
    });
  });
});

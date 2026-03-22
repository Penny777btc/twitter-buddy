const fs = require("fs");
const path = require("path");
const config = require("./config");

function log(message) {
  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}] ${message}`);
}

function ensureDir() {
  fs.mkdirSync(config.followManagerDir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {}
  return fallback;
}

function writeJson(file, data) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

function normalizeHandle(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  const urlMatch = value.match(/x\.com\/([A-Za-z0-9_]+)/i) || value.match(/twitter\.com\/([A-Za-z0-9_]+)/i);
  const raw = urlMatch ? urlMatch[1] : value.replace(/^@/, "").split(/[/?#\s]/)[0];
  return raw.replace(/[^A-Za-z0-9_]/g, "").toLowerCase();
}

function profileUrl(handle) {
  return `https://x.com/${handle}`;
}

function parseHandleLines(text) {
  const seen = new Set();
  const items = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const handle = normalizeHandle(line);
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);
    items.push({
      handle,
      url: profileUrl(handle),
      source: line.trim(),
    });
  }
  return items;
}

function getFollowingSnapshot() {
  return readJson(config.followingSnapshotFile, {
    scannedAt: null,
    count: 0,
    accounts: [],
  });
}

function getFollowCandidates() {
  return readJson(config.followCandidatesFile, {
    updatedAt: null,
    candidates: [],
  });
}

function getUnfollowSuggestions() {
  return readJson(config.unfollowSuggestionsFile, {
    updatedAt: null,
    rules: {},
    suggestions: [],
  });
}

function saveFollowingSnapshot(snapshot) {
  writeJson(config.followingSnapshotFile, snapshot);
}

function saveFollowCandidates(payload) {
  writeJson(config.followCandidatesFile, payload);
}

function saveUnfollowSuggestions(payload) {
  writeJson(config.unfollowSuggestionsFile, payload);
}

function updateCandidateStatus(handle, status) {
  const payload = getFollowCandidates();
  payload.updatedAt = new Date().toISOString();
  payload.candidates = payload.candidates.map((item) =>
    item.handle === handle
      ? { ...item, status, reviewedAt: new Date().toISOString() }
      : item
  );
  saveFollowCandidates(payload);
  return payload.candidates.find((item) => item.handle === handle) || null;
}

function updateSuggestionStatus(handle, status) {
  const payload = getUnfollowSuggestions();
  payload.updatedAt = new Date().toISOString();
  payload.suggestions = payload.suggestions.map((item) =>
    item.handle === handle
      ? { ...item, status, reviewedAt: new Date().toISOString() }
      : item
  );
  saveUnfollowSuggestions(payload);
  return payload.suggestions.find((item) => item.handle === handle) || null;
}

function countByStatus(items, status) {
  return items.filter((item) => item.status === status).length;
}

function getApprovedQueue(limit = 20) {
  const candidates = getFollowCandidates().candidates
    .filter((item) => item.status === "approved")
    .slice(0, limit)
    .map((item) => ({ ...item, queueType: "follow" }));
  const suggestions = getUnfollowSuggestions().suggestions
    .filter((item) => item.status === "approved")
    .slice(0, limit)
    .map((item) => ({ ...item, queueType: "unfollow" }));

  return {
    follow: candidates,
    unfollow: suggestions,
  };
}

async function detectOwnProfileUrl(page) {
  const profileHref = await page.evaluate(() => {
    const selectors = [
      '[data-testid="AppTabBar_Profile_Link"]',
      'a[aria-label*="Profile"]',
      'a[aria-label*="个人资料"]',
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.href) return el.href;
    }
    return null;
  });

  if (!profileHref) throw new Error("Could not find current profile link. Please confirm you are logged in to X.");
  return profileHref.replace(/\/$/, "");
}

async function resolveOwnProfileUrl(page) {
  await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  return detectOwnProfileUrl(page);
}

async function waitForLogin(page, timeoutMs = 10 * 60 * 1000) {
  log("[follow-manager] X login required. Waiting for you to complete login in the browser window ...");
  await page.goto("https://x.com/login", { waitUntil: "domcontentloaded" });

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const currentUrl = page.url();
      if (/x\.com\/home/i.test(currentUrl) || /x\.com\/[^/]+$/i.test(currentUrl)) {
        const profileUrl = await detectOwnProfileUrl(page);
        log("[follow-manager] Login detected. Continuing following scan.");
        return profileUrl;
      }

      const profileUrl = await detectOwnProfileUrl(page);
      log("[follow-manager] Login detected. Continuing following scan.");
      return profileUrl;
    } catch {}
    await page.waitForTimeout(2000);
  }

  throw new Error("Timed out waiting for X login. Please finish login within 10 minutes and try again.");
}

const SCAN_FOLLOWING_FN = `
(() => {
  if (!window._followingMap) window._followingMap = new Map();
  const cells = document.querySelectorAll('[data-testid="UserCell"], [data-testid="cellInnerDiv"]');
  for (const cell of cells) {
    const anchors = Array.from(cell.querySelectorAll('a[href^="/"]'));
    const profileAnchor = anchors.find((a) => {
      const href = a.getAttribute('href') || '';
      return /^\\/[A-Za-z0-9_]+$/.test(href);
    });
    if (!profileAnchor) continue;
    const handle = (profileAnchor.getAttribute('href') || '').replace(/^\\//, '').toLowerCase();
    if (!handle) continue;
    const spans = Array.from(cell.querySelectorAll('span'));
    const bioNode = cell.querySelector('[data-testid="UserDescription"]');
    const buttonNode = Array.from(cell.querySelectorAll('div[role="button"], button')).find((el) => /Following|正在关注|已关注/i.test(el.innerText || ''));
    const verifiedNode = cell.querySelector('[data-testid="icon-verified"], [aria-label*="Verified"]');
    const protectedNode = cell.querySelector('[aria-label*="Protected"], [aria-label*="受保护"]');
    const name = spans.map((s) => s.innerText.trim()).find((t) => t && !/^@/.test(t) && t !== '·') || handle;
    const bio = bioNode ? bioNode.innerText.trim() : '';
    window._followingMap.set(handle, {
      handle,
      name,
      bio,
      url: 'https://x.com/' + handle,
      isFollowingVisible: !!buttonNode,
      isVerified: !!verifiedNode,
      isProtected: !!protectedNode,
    });
  }
  return Array.from(window._followingMap.values());
})()`;

async function scanFollowing(options = {}) {
  const { launchBrowser } = require("./collect-timeline");
  const maxScrolls = options.maxScrolls || config.followManager.scanMaxScrolls;
  log(`[follow-manager] Starting following scan (${maxScrolls} scrolls max) ...`);

  const browser = await launchBrowser();
  const page = browser.pages()[0] || (await browser.newPage());

  try {
    let ownProfile;
    try {
      ownProfile = await resolveOwnProfileUrl(page);
    } catch {
      ownProfile = await waitForLogin(page);
    }
    await page.goto(`${ownProfile}/following`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    let previousCount = 0;
    let staleCount = 0;

    for (let i = 0; i < maxScrolls; i++) {
      const accounts = await page.evaluate(SCAN_FOLLOWING_FN);
      if (accounts.length === previousCount) staleCount++;
      else staleCount = 0;
      previousCount = accounts.length;
      if (staleCount >= 8) break;
      await page.evaluate(() => window.scrollBy({ top: 1200, behavior: "smooth" }));
      await page.waitForTimeout(800);
    }

    const accounts = await page.evaluate(SCAN_FOLLOWING_FN);
    const snapshot = {
      scannedAt: new Date().toISOString(),
      count: accounts.length,
      accounts: accounts.sort((a, b) => a.handle.localeCompare(b.handle)),
    };
    saveFollowingSnapshot(snapshot);
    log(`[follow-manager] Following scan complete: ${snapshot.count} accounts.`);
    return snapshot;
  } finally {
    await browser.close();
  }
}

function importFollowCandidates(text) {
  const snapshot = getFollowingSnapshot();
  const payload = getFollowCandidates();
  const currentHandles = new Set(snapshot.accounts.map((item) => item.handle));
  const existingHandles = new Set(payload.candidates.map((item) => item.handle));
  const incoming = parseHandleLines(text);
  const importedAt = new Date().toISOString();

  const created = [];
  const skipped = [];

  for (const item of incoming) {
    if (currentHandles.has(item.handle)) {
      skipped.push({ handle: item.handle, reason: "already-following" });
      continue;
    }
    if (existingHandles.has(item.handle)) {
      skipped.push({ handle: item.handle, reason: "already-imported" });
      continue;
    }
    const candidate = {
      handle: item.handle,
      url: item.url,
      source: item.source,
      status: "pending",
      importedAt,
      notes: "",
    };
    payload.candidates.push(candidate);
    created.push(candidate);
  }

  payload.updatedAt = importedAt;
  payload.candidates.sort((a, b) => a.handle.localeCompare(b.handle));
  saveFollowCandidates(payload);

  return {
    imported: created,
    skipped,
    totalCandidates: payload.candidates.length,
  };
}

function getLastSeenMap() {
  const lastSeen = new Map();
  try {
    const files = fs.readdirSync(config.tweetsDir).filter((file) => file.endsWith(".json")).sort().reverse();
    for (const file of files) {
      const tweets = JSON.parse(fs.readFileSync(path.join(config.tweetsDir, file), "utf-8"));
      for (const tweet of tweets) {
        const match = String(tweet.link || "").match(/x\.com\/([A-Za-z0-9_]+)\/status\//i);
        if (!match) continue;
        const handle = match[1].toLowerCase();
        const seenAt = tweet.time || null;
        if (!seenAt) continue;
        const prev = lastSeen.get(handle);
        if (!prev || seenAt > prev) lastSeen.set(handle, seenAt);
      }
    }
  } catch {}
  return lastSeen;
}

function buildUnfollowSuggestions(customRules = {}) {
  const snapshot = getFollowingSnapshot();
  if (!snapshot.accounts.length) {
    throw new Error("No following snapshot found. Run a following scan first.");
  }

  const rules = {
    inactivityDays: Number(customRules.inactivityDays) || config.followManager.inactivityDays,
    bioExcludeKeywords: Array.isArray(customRules.bioExcludeKeywords)
      ? customRules.bioExcludeKeywords.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
      : config.followManager.bioExcludeKeywords,
    protectedAccountReview: typeof customRules.protectedAccountReview === "boolean"
      ? customRules.protectedAccountReview
      : config.followManager.protectedAccountReview,
  };

  const lastSeen = getLastSeenMap();
  const cutoffMs = Date.now() - rules.inactivityDays * 24 * 60 * 60 * 1000;
  const existing = getUnfollowSuggestions();
  const existingStatus = new Map(existing.suggestions.map((item) => [item.handle, item.status]));

  const suggestions = [];
  for (const account of snapshot.accounts) {
    const reasons = [];
    const lastSeenAt = lastSeen.get(account.handle) || null;
    if (!lastSeenAt || new Date(lastSeenAt).getTime() < cutoffMs) {
      reasons.push(lastSeenAt ? `No collected tweets seen in the last ${rules.inactivityDays} days` : "No collected tweets seen in local history");
    }

    const bioText = String(account.bio || "").toLowerCase();
    const matchedKeywords = rules.bioExcludeKeywords.filter((keyword) => bioText.includes(keyword));
    if (matchedKeywords.length > 0) {
      reasons.push(`Bio matched exclude keywords: ${matchedKeywords.join(", ")}`);
    }

    if (rules.protectedAccountReview && account.isProtected) {
      reasons.push("Protected account flagged for manual review");
    }

    if (reasons.length === 0) continue;

    suggestions.push({
      handle: account.handle,
      name: account.name,
      bio: account.bio,
      url: account.url,
      isProtected: !!account.isProtected,
      isVerified: !!account.isVerified,
      lastSeenAt,
      reasons,
      status: existingStatus.get(account.handle) || "pending",
      generatedAt: new Date().toISOString(),
    });
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    rules,
    suggestions: suggestions.sort((a, b) => {
      const aTime = a.lastSeenAt || "";
      const bTime = b.lastSeenAt || "";
      return aTime.localeCompare(bTime) || a.handle.localeCompare(b.handle);
    }),
  };
  saveUnfollowSuggestions(payload);
  return payload;
}

function getManagerSummary() {
  const following = getFollowingSnapshot();
  const candidates = getFollowCandidates();
  const suggestions = getUnfollowSuggestions();
  return {
    following: {
      scannedAt: following.scannedAt,
      count: following.count,
    },
    candidates: {
      updatedAt: candidates.updatedAt,
      total: candidates.candidates.length,
      pending: countByStatus(candidates.candidates, "pending"),
      approved: countByStatus(candidates.candidates, "approved"),
      completed: countByStatus(candidates.candidates, "completed"),
      skipped: countByStatus(candidates.candidates, "skipped"),
    },
    suggestions: {
      updatedAt: suggestions.updatedAt,
      total: suggestions.suggestions.length,
      pending: countByStatus(suggestions.suggestions, "pending"),
      approved: countByStatus(suggestions.suggestions, "approved"),
      completed: countByStatus(suggestions.suggestions, "completed"),
      skipped: countByStatus(suggestions.suggestions, "skipped"),
    },
  };
}

module.exports = {
  scanFollowing,
  importFollowCandidates,
  buildUnfollowSuggestions,
  getFollowingSnapshot,
  getFollowCandidates,
  getUnfollowSuggestions,
  updateCandidateStatus,
  updateSuggestionStatus,
  getManagerSummary,
  getApprovedQueue,
  normalizeHandle,
  profileUrl,
};

if (require.main === module) {
  const [command, ...args] = process.argv.slice(2);

  (async () => {
    if (command === "scan") {
      const maxScrollIndex = args.indexOf("--max-scrolls");
      const maxScrolls = maxScrollIndex >= 0 ? Number(args[maxScrollIndex + 1]) : undefined;
      const result = await scanFollowing({ maxScrolls });
      console.log(JSON.stringify({ scannedAt: result.scannedAt, count: result.count }, null, 2));
      return;
    }

    if (command === "import") {
      const fileIndex = args.indexOf("--file");
      if (fileIndex < 0 || !args[fileIndex + 1]) {
        throw new Error("Usage: node follow-manager.js import --file handles.txt");
      }
      const text = fs.readFileSync(path.resolve(args[fileIndex + 1]), "utf-8");
      console.log(JSON.stringify(importFollowCandidates(text), null, 2));
      return;
    }

    if (command === "suggest-unfollow") {
      console.log(JSON.stringify(buildUnfollowSuggestions(), null, 2));
      return;
    }

    throw new Error("Usage: node follow-manager.js <scan|import|suggest-unfollow>");
  })().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}

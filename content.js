// Feed and Reels filter: reads each post/reel's text (caption, hashtags, username,
// image alt text) and hides or skips anything that doesn't match your keywords.
(() => {
  let settings = { ...FF_DEFAULTS };
  let allowRes = [];
  let blockRes = [];
  let accounts = [];

  const SKIP_AFTER_MS = 300; // give the caption a moment to load, then skip
  let active = null;
  let activeSince = 0;
  let lastSkip = 0;

  function toRegexes(text) {
    return text
      .split(/[\n,]/)
      .map((k) => k.trim().replace(/^#/, ""))
      .filter(Boolean)
      .map((k) => {
        const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // Match at the start of a word: "edit" matches edit, editing, edits, but not "credit"
        return new RegExp("(?<![\\p{L}\\p{N}_])" + escaped, "iu");
      });
  }

  function applySettings(s) {
    settings = { ...FF_DEFAULTS, ...s };
    allowRes = toRegexes(settings.keywords);
    blockRes = toRegexes(settings.blockWords);
    accounts = settings.accounts
      .split(/[\n,\s]/)
      .map((a) => a.trim().replace(/^@/, "").toLowerCase())
      .filter(Boolean);
    // Settings changed: re-check everything (except posts the user chose to show)
    document.querySelectorAll("[data-ff]").forEach((el) => {
      if (el.dataset.ffUser !== "show") delete el.dataset.ff;
    });
    scan();
  }

  // Find the element that wraps each post/reel
  function findUnits() {
    const units = new Set(document.querySelectorAll("article"));
    for (const video of document.querySelectorAll("video")) {
      if (video.closest("article")) continue;
      const unit = reelUnit(video);
      if (unit) units.add(unit);
    }
    return units;
  }

  // On the Reels page: walk up from the video until the parent holds more than one
  // video. That child is one whole reel.
  function reelUnit(video) {
    let el = video;
    while (el.parentElement && el.parentElement !== document.body) {
      if (el.parentElement.querySelectorAll("video").length > 1) return el;
      el = el.parentElement;
    }
    return null;
  }

  function textOf(unit) {
    let text = unit.innerText || "";
    // Our own cover is part of innerText too, leave it out
    const cover = unit.querySelector(":scope > .ff-cover");
    if (cover) text = text.replace(cover.innerText, "");
    for (const img of unit.querySelectorAll("img[alt]")) text += " " + img.alt;
    return text;
  }

  function fromAllowedAccount(unit) {
    if (!accounts.length) return false;
    for (const a of unit.querySelectorAll("a[href]")) {
      const name = a.getAttribute("href").replace(/^\/|\/$/g, "").toLowerCase();
      if (accounts.includes(name)) return true;
    }
    return false;
  }

  function decide(unit) {
    const text = textOf(unit);
    if (blockRes.some((r) => r.test(text))) return "block";
    if (fromAllowedAccount(unit)) return "allow";
    // Learned taste: things you watch fully or like, and things you always skip
    const taste = window.ffTaste ? window.ffTaste.scoreOf(unit) : 0;
    if (taste <= -6) return "block";
    if (taste >= 4) return "allow";
    if (allowRes.some((r) => r.test(text))) return "allow";
    return "block";
  }

  function addCover(unit) {
    if (unit.querySelector(":scope > .ff-cover")) return;
    const cover = document.createElement("div");
    cover.className = "ff-cover";
    cover.innerHTML = "<span>Skipped: doesn't match your topics</span>";
    const btn = document.createElement("button");
    btn.textContent = "Show anyway";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      unit.dataset.ffUser = "show";
      unit.dataset.ff = "allow";
    });
    cover.appendChild(btn);
    unit.appendChild(cover);
  }

  function silence(unit) {
    for (const v of unit.querySelectorAll("video")) {
      v.muted = true;
      if (!v.paused) v.pause();
    }
  }

  function scan() {
    if (!settings.enabled) {
      document.querySelectorAll("[data-ff]").forEach((el) => delete el.dataset.ff);
      return;
    }
    // While Topic Reels runs, or on a search page, everything is already on-topic
    if (window.ffFocusOn?.() || location.pathname.startsWith("/explore/search")) return;
    for (const unit of findUnits()) {
      if (unit.dataset.ffUser === "show") continue;
      // Captions load late, so decide again on every scan
      const verdict = decide(unit);
      if (unit.dataset.ff !== verdict) unit.dataset.ff = verdict;
      if (verdict === "block") {
        addCover(unit);
        silence(unit);
      }
    }
    checkActiveReel();
  }

  // If the reel in the middle of the screen is blocked, scroll to the next one
  function checkActiveReel() {
    if (!settings.autoSkip || !location.pathname.startsWith("/reels")) return;
    const mid = innerHeight / 2;
    let current = null;
    for (const unit of document.querySelectorAll("[data-ff]")) {
      if (unit.tagName === "ARTICLE") continue;
      const r = unit.getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) { current = unit; break; }
    }
    if (current !== active) {
      active = current;
      activeSince = Date.now();
      return;
    }
    if (!active || active.dataset.ff !== "block") return;
    const now = Date.now();
    if (now - activeSince < SKIP_AFTER_MS || now - lastSkip < 800) return;
    lastSkip = now;
    const next = active.nextElementSibling;
    if (next) next.scrollIntoView({ behavior: "smooth", block: "start" });
    else active.parentElement?.scrollBy?.({ top: innerHeight, behavior: "smooth" });
  }

  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; scan(); }, 250);
  }).observe(document.body, { childList: true, subtree: true });
  setInterval(scan, 400);

  chrome.storage.sync.get(FF_DEFAULTS, applySettings);
  chrome.storage.onChanged.addListener(() => chrome.storage.sync.get(FF_DEFAULTS, applySettings));
})();

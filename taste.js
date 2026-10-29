// Learns what you like: how long you watch each reel, whether you like/save it, or skip it fast.
// Scores each reel's creator (@name), hashtags (#tag) and caption words.
// Everything stays on this computer (chrome.storage.local).
(() => {
  const MAX_TERMS = 600;
  const LIMIT = 30;               // each term's score stays between -30 and +30
  const STOP = new Set((
    "this that with from have just what when will your yours they them their there here " +
    "about into than then been were more most some such only also very much make made " +
    "like follow comment link bio video videos reel reels post full watch"
  ).split(" "));

  let scores = {};
  let saveTimer = null;
  let cur = null;                 // the reel you're watching right now

  chrome.storage.local.get({ ffTaste: {} }, (r) => (scores = r.ffTaste));
  chrome.storage.onChanged.addListener((c, area) => {
    // "Reset" in the popup clears it here too
    if (area === "local" && c.ffTaste && !saveTimer) scores = c.ffTaste.newValue || {};
  });

  function captionOf(box) {
    const h1 = box.querySelector("h1");
    return h1 ? h1.innerText : (box.innerText || "").slice(0, 400);
  }

  function creatorOf(box) {
    const skip = ["explore", "reels", "reel", "p", "accounts", "direct", "stories"];
    for (const a of box.querySelectorAll("a[href]")) {
      const m = a.getAttribute("href").match(/^\/([A-Za-z0-9._]+)\/$/);
      if (m && !skip.includes(m[1])) return m[1].toLowerCase();
    }
    return null;
  }

  function featuresOf(box) {
    const cap = captionOf(box).toLowerCase();
    const f = new Set();
    const who = creatorOf(box);
    if (who) f.add("@" + who);
    for (const t of cap.match(/#[\p{L}\p{N}_]+/gu) || []) f.add(t);
    for (const a of box.querySelectorAll('a[href^="/explore/tags/"]')) {
      const tag = decodeURIComponent(a.getAttribute("href").split("/")[3] || "");
      if (tag) f.add("#" + tag.toLowerCase());
    }
    const words = cap.replace(/#[\p{L}\p{N}_]+/gu, " ").match(/\p{L}{4,}/gu) || [];
    for (const w of words.slice(0, 40)) if (!STOP.has(w)) f.add(w);
    return [...f].slice(0, 30);
  }

  function scoreOf(box) {
    let s = 0;
    for (const f of featuresOf(box)) s += scores[f] || 0;
    return s;
  }

  function learn(feats, delta) {
    for (const f of feats) {
      // Creators and hashtags are stronger signals than plain words
      const w = f[0] === "@" || f[0] === "#" ? 1 : 0.5;
      const v = Math.max(-LIMIT, Math.min(LIMIT, (scores[f] || 0) + delta * w));
      if (Math.abs(v) < 0.25) delete scores[f];
      else scores[f] = Math.round(v * 100) / 100;
    }
    const keys = Object.keys(scores);
    if (keys.length > MAX_TERMS) {
      keys.sort((a, b) => Math.abs(scores[a]) - Math.abs(scores[b]));
      for (const k of keys.slice(0, keys.length - MAX_TERMS)) delete scores[k];
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      chrome.storage.local.set({ ffTaste: scores });
    }, 1000);
  }

  // Your favourite hashtags; Topic Reels searches these too
  function learnedTopics() {
    return Object.keys(scores)
      .filter((k) => k[0] === "#" && scores[k] >= 6)
      .sort((a, b) => scores[b] - scores[a])
      .slice(0, 5)
      .map((k) => k.slice(1));
  }

  // Which reel/post is on screen right now
  function currentBox() {
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog && /^\/(p|reel)\//.test(location.pathname)) {
      return { key: location.pathname, box: dialog.querySelector("article") || dialog };
    }
    const mid = innerHeight / 2;
    for (const el of document.querySelectorAll("[data-ff]")) {
      const r = el.getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) return { key: el, box: el };
    }
    // A post/reel opened on its own page (instagram.com/p/ID/), not in a dialog
    if (/^\/(p|reel)\//.test(location.pathname)) {
      const v = document.querySelector("main video");
      if (v) return { key: location.pathname, box: postBox(v) };
    }
    return null;
  }

  // Walk up from the video until we reach the part with both the caption (h1) and the Comment button
  function postBox(video) {
    for (let el = video; el && el !== document.body; el = el.parentElement) {
      if (el.querySelector("h1") && el.querySelector('svg[aria-label="Comment"]')) return el;
    }
    return document.querySelector("main") || document.body;
  }

  // How many red (liked) hearts are showing. Uses colour and label, not language.
  const RED = "rgb(255, 48, 64)";
  function likedHearts(box) {
    let n = 0;
    for (const svg of box.querySelectorAll("svg")) {
      if (svg.getAttribute("aria-label") === "Unlike") { n++; continue; }
      const cs = getComputedStyle(svg);
      if (cs.color === RED || cs.fill === RED) n++;
    }
    return n;
  }

  function finish(c) {
    if (!c) return;
    let d = c.signal;
    const dur = c.duration;
    if (dur && c.watched >= dur * 1.5) d += 3;              // rewatched
    else if ((dur && c.watched >= dur * 0.8) || c.watched >= 20) d += 2;
    else if (dur > 6 && c.watched >= 1 && c.watched < 3) d -= 1; // you skipped it fast
    if (d) learn(c.feats, d);
  }

  function tick() {
    const now = currentBox();
    if ((now && now.key) !== (cur && cur.key)) {
      finish(cur);
      cur = now && now.box.dataset.ff !== "block"
        ? { key: now.key, box: now.box, feats: [], watched: 0, duration: 0, signal: 0, at: 0, hearts: null }
        : null;
    }
    if (!cur) return;
    // Like: more red hearts right after your click/tap = like, fewer = unlike
    const hearts = likedHearts(cur.box);
    if (cur.hearts !== null && hearts !== cur.hearts && Date.now() - lastInput < 4000) {
      if (hearts > cur.hearts) {
        cur.signal += 4;
        saveLiked(cur.box);
      } else {
        cur.signal -= 4;
      }
    }
    cur.hearts = hearts;
    const v = cur.box.querySelector("video");
    if (v && !v.paused) cur.watched += 0.5;
    if (v && v.duration) cur.duration = v.duration;
    // Captions arrive late, so refresh features every couple of seconds
    if (cur.at++ % 4 === 0 && cur.box.isConnected) cur.feats = featuresOf(cur.box);
  }

  // Is this the post's own Save button? The post's action bar has a Comment/Share icon and
  // exactly one Like; a comment's button only reaches the whole post (many Likes) going up.
  function isPostAction(btn) {
    let p = btn;
    for (let i = 0; i < 6 && p; i++) {
      p = p.parentElement;
      if (p && p.querySelector('svg[aria-label="Comment"], svg[aria-label="Share"], svg[aria-label="Share Post"]')) {
        return p.querySelectorAll('svg[aria-label="Like"], svg[aria-label="Unlike"]').length === 1;
      }
    }
    return false;
  }

  document.addEventListener("click", (e) => {
    if (!cur) return;
    const btn = e.target.closest('button, [role="button"]');
    if (!btn || !isPostAction(btn)) return;
    const label = btn.querySelector("svg[aria-label]")?.getAttribute("aria-label");
    const delta = { Save: 3, Remove: -3 }[label]; // likes are caught by the red heart above
    if (delta) cur.signal += delta;
  }, true);

  let lastInput = 0;
  for (const type of ["pointerdown", "keydown"]) {
    document.addEventListener(type, () => (lastInput = Date.now()), true);
  }

  // The reel's link: from the URL if we're on it, otherwise the post's own /reel/ or /p/ link
  function postUrlOf(box) {
    const own = location.pathname.match(/^\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/);
    const link = box.querySelector('a[href*="/reel/"], a[href*="/p/"]');
    const id = own ? own[1] : link && (link.getAttribute("href").match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/) || [])[1];
    return id ? "https://www.instagram.com/reel/" + id + "/" : null;
  }

  function toast(text) {
    const t = Object.assign(document.createElement("div"), { className: "ff-toast", textContent: text });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  // quiet: a like-triggered save stays silent when the downloader isn't installed
  function download(url, quiet) {
    chrome.runtime.sendMessage({ type: "saveReel", url }, (res) => {
      if (res && res.ok) return toast("Saving reel to " + (res.folder || "your download folder"));
      if (quiet && res && res.code === "no_helper") return;
      toast("Couldn't save: " + ((res && res.error) || "unknown error"));
    });
  }

  function saveLiked(box) {
    if (!box.querySelector("video")) return; // videos only
    chrome.storage.sync.get({ saveLiked: FF_DEFAULTS.saveLiked }, ({ saveLiked }) => {
      const url = saveLiked && postUrlOf(box);
      if (url) download(url, true);
    });
  }

  // "⬇ Download reel": saves whatever reel is on screen, one click
  const dl = Object.assign(document.createElement("button"), {
    className: "ff-fab ff-dl",
    textContent: "⬇ Download reel",
  });
  dl.addEventListener("click", () => {
    // On the home feed with no reel picked, the page's first link could be the wrong reel
    const onReelPage = /^\/(p|reel|reels)\//.test(location.pathname);
    const url = cur ? postUrlOf(cur.box) : onReelPage ? postUrlOf(document.body) : null;
    if (url) download(url, false);
    else toast("No reel found. Open a reel, then click again.");
  });
  document.body.appendChild(dl);
  const showDl = () => chrome.storage.sync.get({ showDownloadButton: true }, (s) => {
    dl.style.display = s.showDownloadButton ? "" : "none";
  });
  showDl();
  chrome.storage.onChanged.addListener(showDl);

  // Tab closed or reloaded: record the last reel right away
  addEventListener("pagehide", () => {
    finish(cur);
    cur = null;
    clearTimeout(saveTimer);
    saveTimer = null;
    chrome.storage.local.set({ ffTaste: scores });
  });

  window.ffTaste = { scoreOf, learnedTopics };
  setInterval(tick, 500);
})();

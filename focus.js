// Topic Reels: searches Instagram for your topics and plays only those reels, one
// after another. When a reel ends the next one opens; when a topic runs out, the next topic.
(() => {
  const ON_KEY = "ffFocus";       // sessionStorage: Topic Reels is running in this tab
  const TOPIC_KEY = "ffTopic";    // sessionStorage: index of the current topic
  const MAX_SEEN = 3000;
  const IMAGE_POST_MS = 8000;     // how long to stay on a photo post

  let topics = [];
  let seen = new Set();
  let lastUrl = "";               // last post whose arrival we handled
  let href = location.href;
  let urlSince = Date.now();      // when the current URL started
  let lastTime = 0;
  let lastStep = 0;
  let openedHere = false;         // did we open a reel from the grid on this page load?
  let tasteChecked = false;

  const isOn = () => sessionStorage.getItem(ON_KEY) === "1";
  window.ffFocusOn = isOn;        // content.js pauses the filter while this is on

  const idOf = (path) => (path.match(/\/(?:p|reel)\/([^/?#]+)/) || [])[1];

  // Your topics interleaved with the hashtags you've been liking
  function allTopics() {
    const learned = window.ffTaste ? window.ffTaste.learnedTopics() : [];
    const mixed = [];
    for (let i = 0; i < Math.max(learned.length, topics.length); i++) {
      if (learned[i]) mixed.push(learned[i]);
      if (topics[i]) mixed.push(topics[i]);
    }
    return [...new Set(mixed)];
  }
  const searchUrl = (i) => {
    const all = allTopics();
    return "https://www.instagram.com/explore/search/keyword/?q=" +
      encodeURIComponent(all[i % all.length]);
  };

  function start(i) {
    if (!topics.length) return;
    sessionStorage.setItem(ON_KEY, "1");
    sessionStorage.setItem(TOPIC_KEY, String(i));
    chrome.storage.local.set({ ffNextTopic: (i + 1) % allTopics().length });
    location.href = searchUrl(i);
  }

  function stop() {
    sessionStorage.removeItem(ON_KEY);
    updateButton();
  }

  function nextTopic() {
    start(Number(sessionStorage.getItem(TOPIC_KEY) || 0) + 1);
  }

  function markSeen(id) {
    seen.add(id);
    const list = [...seen].slice(-MAX_SEEN);
    chrome.storage.local.set({ ffSeen: list });
  }

  // The dialog's "Next" (next reel). Carousels have a "Next" too, so take the one
  // furthest to the right of the screen.
  function goNext() {
    const now = Date.now();
    if (now - lastStep < 1000) return;
    lastStep = now;
    const candidates = [...document.querySelectorAll('[role="dialog"] [aria-label="Next"]')];
    const best = candidates.sort(
      (a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right
    )[0];
    if (best) (best.closest('button, [role="button"]') || best).click();
    else nextTopic();
  }

  function onSearchPage() {
    if (openedHere) {
      // We opened a reel and we're back on the grid: the user closed it, so stop
      stop();
      return;
    }
    if (Date.now() - urlSince < 1500) return; // let the grid load
    const links = [...document.querySelectorAll('main a[href*="/reel/"], main a[href*="/p/"]')];
    if (!links.length) {
      if (Date.now() - urlSince > 10000) nextTopic();
      return;
    }
    const fresh = links.find((a) => !seen.has(idOf(a.getAttribute("href"))));
    if (!fresh) return nextTopic();
    openedHere = true;
    fresh.click();
  }

  function onPost(dialog) {
    const id = idOf(location.pathname);
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      lastTime = 0;
      if (id && seen.has(id)) return goNext(); // already watched, move on
      if (id) markSeen(id);
      tasteChecked = false;
    }
    // Once the caption is in: skip reels like the ones you always skip
    if (!tasteChecked && Date.now() - urlSince > 600) {
      tasteChecked = true;
      const box = dialog.querySelector("article") || dialog;
      if (window.ffTaste && window.ffTaste.scoreOf(box) <= -6) return goNext();
    }
    const video = dialog.querySelector("video");
    if (video && video.duration) {
      // Instagram loops videos, so "ended" rarely fires: a jump from the end to the start = done
      if (video.ended || (lastTime > video.duration - 1.5 && video.currentTime < 1)) goNext();
      lastTime = video.currentTime;
    } else if (!video && Date.now() - urlSince > IMAGE_POST_MS) {
      goNext();
    }
  }

  function tick() {
    updateButton();
    if (location.href !== href) { href = location.href; urlSince = Date.now(); }
    if (!isOn()) return;
    const path = location.pathname;
    const dialog = document.querySelector('[role="dialog"]');
    if (path.startsWith("/explore/search/keyword")) {
      onSearchPage();
    } else if (/^\/(p|reel)\//.test(path) && dialog) {
      onPost(dialog);
    } else if (Date.now() - urlSince > 3000) {
      stop(); // the user went somewhere else
    }
  }

  // Floating button on every Instagram page
  let btn = null;
  function updateButton() {
    if (!btn) {
      btn = document.createElement("button");
      btn.className = "ff-fab";
      btn.addEventListener("click", () => {
        if (isOn()) stop();
        else chrome.storage.local.get({ ffNextTopic: 0 }, (r) => start(r.ffNextTopic));
      });
      document.body.appendChild(btn);
    }
    const label = isOn() ? "■ Stop Topic Reels" : "▶ Topic Reels";
    if (btn.textContent !== label) btn.textContent = label;
  }

  // Started from the popup: URL ends with #ff-play=<topic index>
  const m = location.hash.match(/^#ff-play=(\d+)/);
  if (m) {
    sessionStorage.setItem(ON_KEY, "1");
    sessionStorage.setItem(TOPIC_KEY, m[1]);
    history.replaceState(null, "", location.pathname + location.search);
  }

  function loadSettings() {
    chrome.storage.sync.get(FF_DEFAULTS, (s) => {
      topics = s.topics.split("\n").map((t) => t.trim()).filter(Boolean);
    });
  }
  loadSettings();
  chrome.storage.onChanged.addListener(loadSettings);
  chrome.storage.local.get({ ffSeen: [] }, (r) => {
    seen = new Set(r.ffSeen);
    setInterval(tick, 500);
  });
})();

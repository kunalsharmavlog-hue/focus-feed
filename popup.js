const $ = (id) => document.getElementById(id);
const fields = ["keywords", "blockWords", "accounts", "topics"];
const toggles = ["enabled", "autoSkip", "saveLiked", "showDownloadButton", "useLogin"];

chrome.storage.sync.get(FF_DEFAULTS, (s) => {
  fields.forEach((f) => ($(f).value = s[f]));
  toggles.forEach((t) => ($(t).checked = s[t]));
});

document.querySelectorAll("[data-preset]").forEach((btn) => {
  btn.addEventListener("click", () => {
    $("keywords").value = FF_PRESETS[btn.dataset.preset].join("\n");
  });
});

function save(done) {
  const s = {};
  fields.forEach((f) => (s[f] = $(f).value));
  toggles.forEach((t) => (s[t] = $(t).checked));
  chrome.storage.sync.set(s, done);
}

$("save").addEventListener("click", () => {
  save(() => {
    $("status").textContent = "Saved. Applied to open Instagram tabs.";
    setTimeout(() => ($("status").textContent = ""), 2500);
  });
});

// Save the topics, then open Instagram's search for the next one; focus.js takes over there
$("play").addEventListener("click", () => {
  save(() => {
    const topics = $("topics").value.split("\n").map((t) => t.trim()).filter(Boolean);
    if (!topics.length) return;
    chrome.storage.local.get({ ffNextTopic: 0 }, (r) => {
      const i = r.ffNextTopic % topics.length;
      const url = "https://www.instagram.com/explore/search/keyword/?q=" +
        encodeURIComponent(topics[i]) + "#ff-play=" + i;
      chrome.tabs.create({ url });
      window.close();
    });
  });
});

// Learned taste: green = likes, red = things you skip
function showTaste() {
  chrome.storage.local.get({ ffTaste: {} }, ({ ffTaste }) => {
    const keys = Object.keys(ffTaste);
    if (!keys.length) return;
    const top = keys.filter((k) => ffTaste[k] > 0).sort((a, b) => ffTaste[b] - ffTaste[a]).slice(0, 12);
    const low = keys.filter((k) => ffTaste[k] < 0).sort((a, b) => ffTaste[a] - ffTaste[b]).slice(0, 6);
    const box = $("taste");
    box.textContent = "";
    const chips = document.createElement("div");
    chips.className = "chips";
    for (const k of top) chips.append(Object.assign(document.createElement("span"), { className: "chip", textContent: k }));
    for (const k of low) chips.append(Object.assign(document.createElement("span"), { className: "chip neg", textContent: k }));
    box.append(chips);
  });
}
showTaste();

$("resetTaste").addEventListener("click", () => {
  chrome.storage.local.set({ ffTaste: {} }, () => {
    $("taste").textContent = "Cleared. It will start learning again.";
  });
});

// Is the optional downloader installed, and where does it save?
chrome.runtime.sendMessage({ type: "helperStatus" }, (res) => {
  const box = $("helper");
  if (res && res.ok) {
    box.className = "ok";
    box.textContent = "Downloader ready. Saving to: " + res.folder;
  } else {
    box.textContent = "Downloader not installed. Downloads need a one-time setup (see README).";
  }
});

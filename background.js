// Passes a reel link to the optional local downloader (saver/host.py), which saves it
// with yt-dlp. Only if you turn on "Use my Instagram login" are your instagram.com
// cookies sent along; the downloader deletes them after that one download.

const HOST = "com.focusfeed.saver";

// yt-dlp reads the "Netscape cookie file" format
function toCookieFile(cookies) {
  const lines = ["# Netscape HTTP Cookie File"];
  for (const c of cookies) {
    const domain = c.hostOnly ? c.domain : (c.domain.startsWith(".") ? c.domain : "." + c.domain);
    lines.push([
      domain,
      c.hostOnly ? "FALSE" : "TRUE",
      c.path,
      c.secure ? "TRUE" : "FALSE",
      Math.floor(c.expirationDate || 0),
      c.name,
      c.value,
    ].join("\t"));
  }
  return lines.join("\n") + "\n";
}

function sendToHelper(payload, reply) {
  chrome.runtime.sendNativeMessage(HOST, payload, (res) => {
    if (chrome.runtime.lastError) {
      reply({ ok: false, code: "no_helper", error: "Downloader not installed (see README: saver/install.sh)" });
    } else {
      reply(res || { ok: false, error: "No answer from the downloader" });
    }
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === "helperStatus") {
    sendToHelper({ status: true }, reply);
    return true;
  }
  if (msg.type !== "saveReel") return;
  chrome.storage.sync.get({ useLogin: false }, ({ useLogin }) => {
    if (!useLogin) return sendToHelper({ url: msg.url }, reply);
    chrome.cookies.getAll({ domain: "instagram.com" }, (cookies) => {
      sendToHelper({ url: msg.url, cookies: toCookieFile(cookies || []) }, reply);
    });
  });
  return true; // reply comes later
});

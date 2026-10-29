# Focus Feed downloader: a Chrome "native messaging host".
# Takes a reel link from the extension and saves the video with yt-dlp into your
# download folder (set by install.sh in config.json), converted to H.264 so it plays
# in QuickTime, Premiere and other editors.
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG = os.path.join(HERE, "config.json")
LOG = os.path.expanduser("~/Library/Logs/focus-feed-saver.log" if sys.platform == "darwin"
                         else "~/.cache/focus-feed-saver.log")
# Chrome starts us with a bare PATH, so also look where Homebrew and friends install tools
SEARCH_PATH = os.pathsep.join([os.environ.get("PATH", ""), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"])


def tool(name):
    return shutil.which(name, path=SEARCH_PATH)


def download_dir():
    with open(CONFIG) as f:
        return os.path.expanduser(json.load(f)["download_dir"])


def read_message():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    size = struct.unpack("<I", raw)[0]
    return json.loads(sys.stdin.buffer.read(size))


def send(obj):
    data = json.dumps(obj).encode()
    sys.stdout.buffer.write(struct.pack("<I", len(data)) + data)
    sys.stdout.buffer.flush()


def main():
    msg = read_message() or {}
    dest = download_dir()
    if not tool("yt-dlp") or not tool("ffmpeg"):
        return send({"ok": False, "error": "yt-dlp or ffmpeg not found. Install them (e.g. brew install yt-dlp ffmpeg)."})
    # The folder's parent must exist; if it's on an external drive that isn't plugged in, say so
    if not os.path.isdir(os.path.dirname(dest.rstrip("/"))):
        return send({"ok": False, "error": "Download folder isn't available. Is the drive connected? (" + dest + ")"})
    if msg.get("status"):
        return send({"ok": True, "folder": dest})

    # Only accept an Instagram post/reel ID, nothing else
    m = re.match(r"^https://www\.instagram\.com/(?:p|reel|reels)/([A-Za-z0-9_-]+)/?", msg.get("url", ""))
    if not m:
        return send({"ok": False, "error": "Not an Instagram reel link"})
    os.makedirs(dest, exist_ok=True)

    # Login cookies (only if the user turned that on): a private temp file (0600) that the
    # download process deletes as soon as it's done
    args = [sys.executable, "-I", os.path.abspath(__file__), "--download", m.group(1)]
    cookies = msg.get("cookies")
    if isinstance(cookies, str) and 0 < len(cookies) < 200000:
        fd, cookie_path = tempfile.mkstemp(prefix="focusfeed-", suffix=".txt")
        with os.fdopen(fd, "w") as f:
            f.write(cookies)
        args.append(cookie_path)

    # Download in a separate process so Chrome gets its answer right away
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    log = open(LOG, "a")
    subprocess.Popen(
        args,
        stdin=subprocess.DEVNULL, stdout=log, stderr=log,
        start_new_session=True,  # keep downloading after Chrome closes this host
    )
    send({"ok": True, "folder": dest})


def video_codec(path):
    out = subprocess.run(
        [tool("ffprobe"), "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=codec_name", "-of", "csv=p=0", path],
        capture_output=True, text=True,
    )
    return out.stdout.strip()


# Instagram serves HD reels as VP9, which QuickTime and Premiere can't play: convert to H.264
def make_editable(path):
    if not tool("ffprobe") or video_codec(path) in ("h264", ""):
        return
    tmp = path[:-4] + ".h264.tmp.mp4"
    done = subprocess.run(
        [tool("ffmpeg"), "-v", "error", "-y", "-i", path,
         "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", tmp]
    )
    if done.returncode == 0:
        os.replace(tmp, path)
        print("Converted to H.264:", path, flush=True)
    elif os.path.exists(tmp):
        os.remove(tmp)


def download(reel_id, cookie_path=None):
    try:
        if re.fullmatch(r"[A-Za-z0-9_-]+", reel_id):
            fetch(reel_id, cookie_path)
    finally:
        if cookie_path and os.path.exists(cookie_path):
            os.remove(cookie_path)


def fetch(reel_id, cookie_path):
    dest = download_dir()
    cookie_args = ["--cookies", cookie_path] if cookie_path else []
    out = subprocess.run(
        [
            tool("yt-dlp"), "--no-progress", "--ffmpeg-location", os.path.dirname(tool("ffmpeg")),
            *cookie_args,
            # Liking, unliking and liking again won't download the same reel twice
            "--download-archive", os.path.join(dest, ".downloaded.txt"),
            "-o", os.path.join(dest, "%(uploader)s - %(id)s.%(ext)s"),
            "--print", "after_move:filepath", "--no-simulate",
            "https://www.instagram.com/reel/%s/" % reel_id,
        ],
        stdout=subprocess.PIPE, text=True,
    )
    for path in out.stdout.split("\n"):
        if path.strip().endswith(".mp4") and os.path.exists(path.strip()):
            make_editable(path.strip())


if len(sys.argv) in (3, 4) and sys.argv[1] == "--download":
    download(sys.argv[2], sys.argv[3] if len(sys.argv) == 4 else None)
else:
    main()

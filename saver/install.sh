#!/bin/sh
# Sets up the optional Focus Feed downloader for Google Chrome (macOS and Linux).
#
#   sh saver/install.sh                          # saves to ~/Movies/Focus Feed (macOS) or ~/Videos/Focus Feed
#   sh saver/install.sh "/Volumes/MyDrive/Reels" # or any folder you like
#
# Needs python3, yt-dlp and ffmpeg (macOS: brew install yt-dlp ffmpeg).
# Run it again if you move the extension folder or want a different download folder.
set -e
cd "$(dirname "$0")"
SAVER="$(pwd)"
EXT_DIR="$(dirname "$SAVER")"

PYTHON="$(command -v python3 || true)"
[ -n "$PYTHON" ] || { echo "python3 not found. Install it first."; exit 1; }
for t in yt-dlp ffmpeg ffprobe; do
  command -v "$t" >/dev/null 2>&1 || echo "Warning: $t not found. Install it (macOS: brew install yt-dlp ffmpeg)."
done

case "$(uname)" in
  Darwin) DEFAULT_DIR="$HOME/Movies/Focus Feed"; HOSTS_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" ;;
  *)      DEFAULT_DIR="$HOME/Videos/Focus Feed"; HOSTS_DIR="$HOME/.config/google-chrome/NativeMessagingHosts" ;;
esac
DOWNLOAD_DIR="${1:-$DEFAULT_DIR}"

# An unpacked extension's ID comes from its folder path (Chrome's rule)
EXT_ID=$("$PYTHON" -I -c "import hashlib,sys; h=hashlib.sha256(sys.argv[1].encode()).hexdigest()[:32]; print(''.join(chr(97+int(c,16)) for c in h))" "$EXT_DIR")

"$PYTHON" -I -c "import json,sys; json.dump({'download_dir': sys.argv[1]}, open('config.json','w'), indent=2)" "$DOWNLOAD_DIR"

# Chrome runs this launcher, which uses the python3 found above
cat > run-host.sh <<EOF
#!/bin/sh
exec "$PYTHON" -I "$SAVER/host.py" "\$@"
EOF
chmod +x run-host.sh

mkdir -p "$HOSTS_DIR"
cat > "$HOSTS_DIR/com.focusfeed.saver.json" <<EOF
{
  "name": "com.focusfeed.saver",
  "description": "Focus Feed downloader",
  "path": "$SAVER/run-host.sh",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF

echo "Downloader installed."
echo "  Extension ID:    $EXT_ID"
echo "  Download folder: $DOWNLOAD_DIR"
echo "Restart Chrome (quit fully, then reopen) so it picks this up."

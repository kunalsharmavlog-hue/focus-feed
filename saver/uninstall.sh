#!/bin/sh
# Removes the Focus Feed downloader from Chrome. Your downloaded videos are kept.
cd "$(dirname "$0")"
case "$(uname)" in
  Darwin) HOSTS_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" ;;
  *)      HOSTS_DIR="$HOME/.config/google-chrome/NativeMessagingHosts" ;;
esac
rm -f "$HOSTS_DIR/com.focusfeed.saver.json" run-host.sh config.json
echo "Downloader removed. Downloaded videos were not touched."

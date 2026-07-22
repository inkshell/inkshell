#!/bin/sh
# InkShell installer for macOS.
#
#   curl -fsSL https://raw.githubusercontent.com/inkshell/inkshell/main/install.sh | bash
#
# Downloads the latest release for this Mac's architecture and installs it into
# /Applications. The point of installing this way is quarantine: macOS only
# gatekeeps files whose downloader marked them (browsers do, `curl` doesn't),
# so an app fetched here opens with no "InkShell is damaged" dialog and no
# `xattr` incantation — the block a browser download of an unsigned app runs
# into. See the README's install section for the manual alternative.
#
# INKSHELL_VERSION pins a release tag (e.g. INKSHELL_VERSION=v0.1.3); the
# default is the latest.
set -eu

REPO="inkshell/inkshell"

fail() {
  echo "install: $1" >&2
  exit 1
}

[ "$(uname -s)" = "Darwin" ] || fail "this installer is macOS-only — see the README for other platforms"

# The release assets are named InkShell-<version>-<arch>-mac.zip.
case "$(uname -m)" in
  arm64) arch="arm64" ;;
  x86_64) arch="x64" ;;
  *) fail "unsupported architecture: $(uname -m)" ;;
esac

if [ -n "${INKSHELL_VERSION:-}" ]; then
  api="https://api.github.com/repos/$REPO/releases/tags/$INKSHELL_VERSION"
else
  api="https://api.github.com/repos/$REPO/releases/latest"
fi

url=$(curl -fsSL "$api" | grep -o "https://[^\"]*-${arch}-mac\.zip" | head -1) ||
  fail "could not reach the GitHub releases API"
[ -n "$url" ] || fail "no ${arch} build in the release — it may still be publishing, try again in a minute"

# A running InkShell would keep executing from the bundle we're about to
# replace; make the swap explicit instead of yanking it out from underneath.
if pgrep -qf "InkShell.app/Contents/MacOS/InkShell" 2>/dev/null; then
  fail "InkShell is running — quit it first, then re-run this installer"
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Downloading $(basename "$url")..."
curl -fL --progress-bar -o "$tmp/inkshell.zip" "$url"

# ditto is Apple's own archiver: it restores the .app's structure, symlinks and
# executable bits exactly, which `unzip` does not always get right.
ditto -xk "$tmp/inkshell.zip" "$tmp/extracted"
[ -d "$tmp/extracted/InkShell.app" ] || fail "unexpected archive layout: no InkShell.app inside"

dest="/Applications"
if [ ! -w "$dest" ]; then
  dest="$HOME/Applications"
  mkdir -p "$dest"
fi

rm -rf "$dest/InkShell.app"
mv "$tmp/extracted/InkShell.app" "$dest/InkShell.app"

echo "Installed to $dest/InkShell.app"

# Not fatal — the app itself explains this better than an installer can — but
# saying it now saves a puzzled first launch.
command -v claude >/dev/null 2>&1 ||
  echo "note: the \`claude\` CLI was not found on your PATH — InkShell needs it to run sessions (https://docs.claude.com/en/docs/claude-code)"

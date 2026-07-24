#!/usr/bin/env bash
# ============================================================
# Apollo WSL Bootstrap — one script, full restore
# Run: curl -fsSL https://raw.githubusercontent.com/thedamod/dotfiles/main/setup.sh | bash
# Or:  bash ~/dotfiles/setup.sh
# ============================================================
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
DOTFILES="${DOTFILES:-$HOME/dotfiles}"
LOG="/tmp/apollo-bootstrap-$(date +%s).log"
exec > >(tee -a "$LOG") 2>&1

echo "=== Apollo WSL Bootstrap ==="
echo "Log: $LOG"

# ---- helpers ----
cmd() { command -v "$1" >/dev/null 2>&1; }
section() { echo; echo "━━━ $1 ━━━"; }

retry() {
  local n=0
  until "$@"; do
    n=$((n+1))
    [ "$n" -ge 3 ] && return 1
    sleep 2
  done
}

# ---- detect Ubuntu release ----
source /etc/os-release
CODENAME="${VERSION_CODENAME:-noble}"

# ============================================================
# 1. System sources & packages
# ============================================================
section "Adding APT sources"

sudo mkdir -p /etc/apt/keyrings /etc/apt/sources.list.d

# Charm
if [ ! -f /etc/apt/keyrings/charm.gpg ]; then
  retry curl --fail --location --silent --show-error \
    https://repo.charm.sh/apt/gpg.key \
    | sudo tee /etc/apt/keyrings/charm.gpg >/dev/null
  echo 'deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *' \
    | sudo tee /etc/apt/sources.list.d/charm.list >/dev/null
fi

# Cloudflared
if [ ! -f /etc/apt/keyrings/cloudflare.gpg ]; then
  retry curl --fail --location --silent --show-error \
    https://pkg.cloudflare.com/cloudflare-main.gpg \
    | sudo tee /etc/apt/keyrings/cloudflare.gpg >/dev/null
  echo "deb [signed-by=/etc/apt/keyrings/cloudflare.gpg] https://pkg.cloudflare.com/cloudflared any main" \
    | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
fi

# Tailscale
if [ ! -f /etc/apt/keyrings/tailscale.gpg ]; then
  retry curl --fail --location --silent --show-error \
    "https://pkgs.tailscale.com/stable/ubuntu/${CODENAME}.noarmor.gpg" \
    | sudo tee /etc/apt/keyrings/tailscale.gpg >/dev/null
  echo "deb [signed-by=/etc/apt/keyrings/tailscale.gpg] https://pkgs.tailscale.com/stable/ubuntu ${CODENAME} main" \
    | sudo tee /etc/apt/sources.list.d/tailscale.list >/dev/null
fi

# PostgreSQL (official)
if [ ! -f /etc/apt/keyrings/postgresql.asc ]; then
  retry curl --fail --location --silent --show-error \
    https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | sudo tee /etc/apt/keyrings/postgresql.asc >/dev/null
  echo "deb [signed-by=/etc/apt/keyrings/postgresql.asc] https://apt.postgresql.org/pub/repos/apt ${CODENAME}-pgdg main" \
    | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
fi

# ngrok
if [ ! -f /etc/apt/keyrings/ngrok.asc ]; then
  retry curl --fail --location --silent --show-error \
    https://ngrok-agent.s3.amazonaws.com/ngrok.asc \
    | sudo tee /etc/apt/keyrings/ngrok.asc >/dev/null
  echo "deb [signed-by=/etc/apt/keyrings/ngrok.asc] https://ngrok-agent.s3.amazonaws.com bookworm main" \
    | sudo tee /etc/apt/sources.list.d/ngrok.list >/dev/null
fi

# Gierens (eza)
if [ ! -f /etc/apt/keyrings/gierens.gpg ]; then
  retry curl --fail --location --silent --show-error \
    https://deb.gierens.de/gierens.gpg \
    | sudo tee /etc/apt/keyrings/gierens.gpg >/dev/null
  echo "deb [signed-by=/etc/apt/keyrings/gierens.gpg] http://deb.gierens.de stable main" \
    | sudo tee /etc/apt/sources.list.d/gierens.list >/dev/null
fi

section "Installing APT packages"
sudo apt-get update -qq

# Core — expected to all succeed
sudo apt-get install -y -qq \
  build-essential curl git unzip \
  zsh neovim \
  python3 python3-dev python3-pip python3-venv pipx \
  golang-go rustup \
  postgresql postgresql-client postgresql-common \
  redis-server \
  gh ripgrep fd-find fzf zoxide eza bat glow \
  cmake bubblewrap \
  ffmpeg xclip \
  stow zstd \
  tailscale cloudflared ngrok \
  ca-certificates software-properties-common \
  libssl-dev pkg-config \
  texlive-full \
  tmate \
  libcairo2-dev libpango1.0-dev libgl1-mesa-dev \
  libglfw3-dev libglm-dev libglew-dev libsixel-bin

# Detect installed PostgreSQL major version for pgvector
PG_MAJOR=$(pg_config --version 2>/dev/null | grep -oP '\d+' | head -1 || echo 16)
sudo apt-get install -y -qq "postgresql-${PG_MAJOR}-pgvector" || true

# Optional packages (won't abort on failure)
sudo apt-get install -y -qq television 2>/dev/null || echo "  (television not in repos, skipping)"
sudo apt-get install -y -qq wine wine32:i386 wine64 2>/dev/null || echo "  (wine not available, skipping)"

# ============================================================
# 2. Rust
# ============================================================
section "Rust toolchain"
if ! command -v rustup >/dev/null; then
  retry curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y
fi
source "$HOME/.cargo/env"
rustup default stable
rustup component add rustfmt clippy
echo "rustc: $(rustc --version)"

# ============================================================
# 3. bun
# ============================================================
section "bun"
if ! cmd bun; then
  retry curl -fsSL https://bun.sh/install | bash
fi
export BUN_INSTALL="$HOME/.bun"
case ":$PATH:" in
  *":$BUN_INSTALL/bin:"*) ;;
  *) export PATH="$BUN_INSTALL/bin:$PATH" ;;
esac
echo "bun: $(bun --version)"

# ============================================================
# 4. Node via fnm
# ============================================================
section "Node.js (fnm)"
if ! cmd fnm; then
  retry curl -fsSL https://fnm.vercel.app/install | bash
  export PATH="$HOME/.local/share/fnm:$PATH"
  eval "$(fnm env)"
fi
fnm install --lts
fnm default lts-latest
fnm use lts-latest
echo "node: $(node --version)"

# ============================================================
# 5. Oh My Zsh + plugins
# ============================================================
section "Oh My Zsh"
if [ ! -d "$HOME/.oh-my-zsh" ]; then
  RUNZSH=no KEEP_ZSHRC=yes sh -c \
    "$(retry curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
fi

ZSH_CUSTOM="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"
for plugin in zsh-autosuggestions fzf-tab; do
  dir="$ZSH_CUSTOM/plugins/$plugin"
  if [ ! -d "$dir/.git" ]; then
    rm -rf "$dir"
    retry git clone --depth=1 "https://github.com/zsh-users/$plugin" "$dir"
  fi
done
# fast-syntax-highlighting
if [ ! -d "$ZSH_CUSTOM/plugins/fast-syntax-highlighting/.git" ]; then
  rm -rf "$ZSH_CUSTOM/plugins/fast-syntax-highlighting"
  retry git clone --depth=1 https://github.com/zdharma-continuum/fast-syntax-highlighting \
    "$ZSH_CUSTOM/plugins/fast-syntax-highlighting"
fi

# ============================================================
# 6. Dotfiles (symlinks)
# ============================================================
section "Dotfiles"
if [ ! -d "$DOTFILES/.git" ]; then
  rm -rf "$DOTFILES"
  retry git clone --depth=1 https://github.com/thedamod/dotfiles.git "$DOTFILES"
fi
cd "$DOTFILES"

# Shell rc files
for item in .zshrc .zshenv .profile .bashrc .gitconfig .gitignore; do
  [ -f "$item" ] && ln -sf "$DOTFILES/$item" "$HOME/$item"
done

# Directories — use -n to avoid following existing symlinks
for dir in .config .oh-my-zsh/custom .agents; do
  [ -d "$DOTFILES/$dir" ] && ln -sfn "$DOTFILES/$dir" "$HOME/$dir" 2>/dev/null || true
done

# Selective .pi linking — settings and extensions live in dotfiles,
# but auth.json and runtime state stay local.
mkdir -p "$HOME/.pi/agent"
for f in settings.json code-previews.json models.json web-providers.json AGENTS.md; do
  [ -f "$DOTFILES/.pi/agent/$f" ] && ln -sf "$DOTFILES/.pi/agent/$f" "$HOME/.pi/agent/$f"
done
[ -d "$DOTFILES/.pi/agent/extensions" ] && ln -sfn "$DOTFILES/.pi/agent/extensions" "$HOME/.pi/agent/extensions"
[ -d "$DOTFILES/.pi/agent/themes" ] && ln -sfn "$DOTFILES/.pi/agent/themes" "$HOME/.pi/agent/themes"

# ============================================================
# 7. Global Bun + Pi packages
# ============================================================
section "Global Bun packages"

GLOBAL_PKGS=(
  "@earendil-works/pi-coding-agent"
  "@earendil-works/pi-tui"
  "@openai/codex"
  "@railway/cli"
  "opencode-ai"
  "agent-browser"
  "firecrawl-mcp"
  "pnpm"
  "turbo"
  "vercel"
  "postplan"
  "pi-image-tools"
  "pi-web-providers"
  "@dreki-gg/pi-subagent"
  "tree-sitter-cli"
  "@googleworkspace/cli"
)

FAILED_PKGS=()
for pkg in "${GLOBAL_PKGS[@]}"; do
  if bun install -g "$pkg" 2>/dev/null; then
    echo "  ✓ $pkg"
  else
    echo "  ✗ $pkg"
    FAILED_PKGS+=("$pkg")
  fi
done

if ((${#FAILED_PKGS[@]})); then
  echo "Retrying failed packages..."
  for pkg in "${FAILED_PKGS[@]}"; do
    retry bun install -g "$pkg" 2>/dev/null && echo "  ✓ $pkg (retry)" || echo "  ✗ $pkg (gave up)"
  done
fi

# Pi skill packages
PI_PKGS=(
  "npm:pi-image-tools"
  "npm:@dreki-gg/pi-subagent"
  "npm:pi-web-providers"
  "npm:@ff-labs/pi-fff"
  "npm:pi-model-discovery"
  "npm:pi-code-previews"
)
if cmd pi; then
  for pkg in "${PI_PKGS[@]}"; do
    pi package install "$pkg" 2>/dev/null && echo "  ✓ pi $pkg" || echo "  ✗ pi $pkg"
  done
fi

# ============================================================
# 8. Services (WSL-safe)
# ============================================================
section "System services"
if command -v systemctl >/dev/null && systemctl list-unit-files >/dev/null 2>&1; then
  sudo systemctl enable postgresql redis-server tailscaled 2>/dev/null || true
  sudo systemctl start postgresql redis-server 2>/dev/null || true
fi

# ============================================================
# 9. SSH + GitHub auth
# ============================================================
section "SSH key"
SSH_KEY="$HOME/.ssh/id_ed25519"
if [ ! -f "$SSH_KEY" ]; then
  ssh-keygen -t ed25519 -C "github" -f "$SSH_KEY" -N "" 2>/dev/null
  if ! ssh-add -l >/dev/null 2>&1; then
    eval "$(ssh-agent -s)"
    ssh-add "$SSH_KEY"
  fi
  echo ""
  echo "────────────────────────────────────────────"
  echo "🔑 Add this SSH public key to GitHub:"
  echo "    https://github.com/settings/keys"
  echo "────────────────────────────────────────────"
  cat "$SSH_KEY.pub"
  echo "────────────────────────────────────────────"
  echo "Then run:  ssh -T git@github.com"
fi

# ============================================================
# 10. zsh as default
# ============================================================
section "Default shell"
if [ "$SHELL" != "$(command -v zsh)" ]; then
  chsh -s "$(command -v zsh)" 2>/dev/null || true
fi

# ============================================================
section "✅ Bootstrap complete"
echo "Restart terminal or run:  exec zsh"
echo "Then finish setup:        ssh -T git@github.com"
echo "                         railway login"
echo "                         pi auth login"
echo "                         codex auth login"
echo "                         sudo tailscale up"
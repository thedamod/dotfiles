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

# ============================================================
# 1. System sources & packages
# ============================================================
section "Adding APT sources"

sudo mkdir -p /etc/apt/keyrings /etc/apt/sources.list.d

# Charm
if [ ! -f /etc/apt/keyrings/charm.gpg ]; then
  sudo curl -fsSL https://repo.charm.sh/apt/gpg.key -o /etc/apt/keyrings/charm.gpg
  echo 'deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *' \
    | sudo tee /etc/apt/sources.list.d/charm.list >/dev/null
fi

# Cloudflared
if [ ! -f /usr/share/keyrings/cloudflare-public-v2.gpg ]; then
  sudo curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-public-v2.gpg
  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-public-v2.gpg] https://pkg.cloudflare.com/cloudflared any main' \
    | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
fi

# Tailscale
if [ ! -f /usr/share/keyrings/tailscale-archive-keyring.gpg ]; then
  sudo curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.noarmor.gpg -o /usr/share/keyrings/tailscale-archive-keyring.gpg
  echo 'deb [signed-by=/usr/share/keyrings/tailscale-archive-keyring.gpg] https://pkgs.tailscale.com/stable/ubuntu noble main' \
    | sudo tee /etc/apt/sources.list.d/tailscale.list >/dev/null
fi

# PostgreSQL (official)
if [ ! -f /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc ]; then
  sudo curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  echo 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main' \
    | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
fi

# ngrok
if [ ! -f /etc/apt/sources.list.d/ngrok.list ]; then
  sudo curl -fsSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc -o /etc/apt/keyrings/ngrok.asc
  echo 'deb [signed-by=/etc/apt/keyrings/ngrok.asc] https://ngrok-agent.s3.amazonaws.com bookworm main' \
    | sudo tee /etc/apt/sources.list.d/ngrok.list >/dev/null
fi

# Gierens (eza)
if [ ! -f /etc/apt/keyrings/gierens.gpg ]; then
  sudo mkdir -p /etc/apt/keyrings
  sudo curl -fsSL https://deb.gierens.de/gierens.gpg -o /etc/apt/keyrings/gierens.gpg
  echo 'deb [signed-by=/etc/apt/keyrings/gierens.gpg] http://deb.gierens.de stable main' \
    | sudo tee /etc/apt/sources.list.d/gierens.list >/dev/null
fi

section "Installing APT packages"
sudo apt-get update -qq

# Core toolchain
sudo apt-get install -y -qq \
  build-essential curl git unzip \
  zsh neovim \
  python3 python3-dev python3-pip python3-venv pipx \
  golang-go rustup \
  postgresql postgresql-client postgresql-16-pgvector \
  redis-server \
  gh ripgrep fd-find fzf zoxide eza bat glow \
  cmake bubblewrap \
  ffmpeg xclip \
  stow zstd \
  tailscale cloudflared ngrok \
  television \
  ca-certificates software-properties-common \
  libssl-dev pkg-config \
  || echo "Some packages may have failed (non-fatal)"

# Wine (optional)
sudo apt-get install -y -qq wine wine32:i386 wine64 2>/dev/null || true

# ============================================================
# 2. Rust
# ============================================================
section "Rust toolchain"
if ! cmd rustc; then
  rustup default stable 2>/dev/null || {
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
  }
fi
rustup component add rustfmt clippy 2>/dev/null || true
echo "rustc: $(rustc --version)"

# ============================================================
# 3. bun
# ============================================================
section "bun"
if ! cmd bun; then
  curl -fsSL https://bun.sh/install | bash
fi
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
echo "bun: $(bun --version)"

# ============================================================
# 4. Node via fnm
# ============================================================
section "Node.js (fnm)"
if ! cmd fnm; then
  curl -fsSL https://fnm.vercel.app/install | bash
  export PATH="$HOME/.local/share/fnm:$PATH"
  eval "$(fnm env)"
fi
fnm install --lts 2>/dev/null || fnm install 22
fnm default $(fnm list | head -1 | tr -d '→ ')
echo "node: $(node --version)"

# ============================================================
# 5. Oh My Zsh + plugins
# ============================================================
section "Oh My Zsh"
if [ ! -d "$HOME/.oh-my-zsh" ]; then
  RUNZSH=no KEEP_ZSHRC=yes sh -c \
    "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
fi

ZSH_CUSTOM="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"
for plugin in zsh-autosuggestions fzf-tab; do
  dir="$ZSH_CUSTOM/plugins/$plugin"
  if [ ! -d "$dir/.git" ]; then
    rm -rf "$dir"
    git clone --depth=1 "https://github.com/zsh-users/$plugin" "$dir" 2>/dev/null || true
  fi
done
# fast-syntax-highlighting
if [ ! -d "$ZSH_CUSTOM/plugins/fast-syntax-highlighting/.git" ]; then
  rm -rf "$ZSH_CUSTOM/plugins/fast-syntax-highlighting"
  git clone --depth=1 https://github.com/zdharma-continuum/fast-syntax-highlighting \
    "$ZSH_CUSTOM/plugins/fast-syntax-highlighting" 2>/dev/null || true
fi

# ============================================================
# 6. Dotfiles (symlinks via stow or manual)
# ============================================================
section "Dotfiles"
if [ ! -d "$DOTFILES" ]; then
  git clone https://github.com/thedamod/dotfiles.git "$DOTFILES"
fi
cd "$DOTFILES"

# Symlink everything tracked (stow-safe). The dotfiles repo
# carries the exact directory layout expected at $HOME.
for item in .zshrc .zshenv .profile .bashrc .gitconfig .gitignore; do
  [ -f "$item" ] && ln -sf "$DOTFILES/$item" "$HOME/$item"
done
for dir in .config .oh-my-zsh/custom .pi .agents; do
  [ -d "$DOTFILES/$dir" ] && ln -sfn "$DOTFILES/$dir" "$HOME/$dir" 2>/dev/null || true
done
# Selective .pi linking — the settings, extensions, themes live in dotfiles,
# but auth.json and runtime state stay local.
mkdir -p "$HOME/.pi/agent"
for f in settings.json code-previews.json models.json web-providers.json AGENTS.md; do
  [ -f "$DOTFILES/.pi/agent/$f" ] && ln -sf "$DOTFILES/.pi/agent/$f" "$HOME/.pi/agent/$f"
done
if [ -d "$DOTFILES/.pi/agent/extensions" ]; then
  ln -sfn "$DOTFILES/.pi/agent/extensions" "$HOME/.pi/agent/extensions"
fi
if [ -d "$DOTFILES/.pi/agent/themes" ]; then
  ln -sfn "$DOTFILES/.pi/agent/themes" "$HOME/.pi/agent/themes"
fi

# ============================================================
# 7. Global Bun + Pi packages
# ============================================================
section "Global Bun packages"
# Pin current versions — install each
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
for pkg in "${GLOBAL_PKGS[@]}"; do
  bun install -g "$pkg" 2>/dev/null && echo "  ✓ $pkg" || echo "  ✗ $pkg (will retry later)"
done

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
# 8. Services
# ============================================================
section "System services"
sudo systemctl enable postgresql redis-server tailscaled 2>/dev/null || true
sudo systemctl start postgresql redis-server 2>/dev/null || true

# ============================================================
# 9. SSH + GitHub auth
# ============================================================
section "SSH key"
SSH_KEY="$HOME/.ssh/id_ed25519"
if [ ! -f "$SSH_KEY" ]; then
  ssh-keygen -t ed25519 -C "github" -f "$SSH_KEY" -N "" 2>/dev/null
  eval "$(ssh-agent -s)" 2>/dev/null || true
  ssh-add "$SSH_KEY" 2>/dev/null || true
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
echo "Then run:                 cd ~/dotfiles && setup.sh"  # idempotent

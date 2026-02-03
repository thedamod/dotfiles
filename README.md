# dotfiles

Bootstrap configuration for **Apollo** — my primary development machine.

This repository exists so that if Apollo ever gets wiped, replaced, or reborn,
it can be fully restored in minutes.

One script. One restart. Back to work.

## 🛰 What This Repo Does

### Shell
- Zsh
- Oh My Zsh
- Preconfigured environment via `.zshrc`

### Toolchain
- bun
- fnm (Node version manager)
- Go
- Neovim
- opencode

### Data Layer
- PostgreSQL
- Redis

### GitHub
- SSH key generation
- ssh-agent wiring
- GitHub-ready authentication

---

## 🧠 Design Philosophy

- **Apollo-first**: this is the source of truth for my setup
- Idempotent — safe to re-run
- Minimal prompts, no wizard hell
- macOS + Ubuntu/Debian compatible
- Dotfiles live in `~/.dotfiles`

---

## 🚀 Booting Apollo

On a fresh machine:
Clone [setup.sh](https://gist.github.com/aether6430/866c7c07c386bab6690f98fb104e77c9)
```bash
chmod +x setup.sh
./setup.sh
exec zsh
```

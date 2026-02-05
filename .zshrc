export ZSH="$HOME/.oh-my-zsh"

ZSH_THEME="robbyrussell"

ENABLE_CORRECTION="true"

eval "$(zoxide init zsh)"

plugins=(git timer fnm bun fzf zoxide eza fast-syntax-highlighting zsh-autosuggestions fzf-tab)

zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"
zstyle ':completion:*' menu no
zstyle ':fzf-tab:complete:cd:*' fzf-preview 'ls --color $realpath'
zstyle ':fzf-tab:complete:__zoxide_z:*' fzf-preview 'ls --color $realpath'

HISTSIZE=5000
HISTFILE=~/.zsh_history
SAVEHIST=$HISTSIZE
HISTDUP=erase
setopt appendhistory
setopt sharehistory
setopt hist_ignore_space
setopt hist_ignore_all_dups
setopt hist_save_no_dups
setopt hist_ignore_dups
setopt hist_find_no_dups

bindkey -v

alias ls='ls --color'
alias vim='nvim'
alias c='clear'

source $ZSH/oh-my-zsh.sh
export PATH="$PATH:/opt/nvim-linux-x86_64/bin"

bindkey '^[[Z' autosuggest-accept

# fnm
FNM_PATH="/home/apollo/.local/share/fnm"
if [ -d "$FNM_PATH" ]; then
  export PATH="$FNM_PATH:$PATH"
  eval "`fnm env`"
fi

# fnm
FNM_PATH="/home/apollo/.local/share/fnm"
if [ -d "$FNM_PATH" ]; then
  export PATH="$FNM_PATH:$PATH"
  eval "`fnm env`"
fi

# bun completions
[ -s "/home/apollo/.bun/_bun" ] && source "/home/apollo/.bun/_bun"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"


# opencode
export PATH=/home/apollo/.opencode/bin:$PATH

. "$HOME/.local/bin/env"

eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv zsh)"

# pnpm
export PNPM_HOME="/home/apollo/.local/share/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
# pnpm end

export PATH="$HOME/dotfiles/bookmark_manager:$PATH"



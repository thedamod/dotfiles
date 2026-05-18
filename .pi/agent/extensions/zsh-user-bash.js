// dotfiles/.pi/agent/extensions/zsh-user-bash.ts
import { basename } from "node:path";
import {
  createLocalBashOperations
} from "@earendil-works/pi-coding-agent";
function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
function getZshPath() {
  if (process.env.PI_USER_BASH_SHELL)
    return process.env.PI_USER_BASH_SHELL;
  if (process.env.SHELL && basename(process.env.SHELL) === "zsh") {
    return process.env.SHELL;
  }
  return "/bin/zsh";
}
function zsh_user_bash_default(pi) {
  const local = createLocalBashOperations();
  pi.on("user_bash", () => {
    return {
      operations: {
        exec(command, cwd, options) {
          const zshCommand = `exec ${shellQuote(getZshPath())} -fc ${shellQuote(command)}`;
          return local.exec(zshCommand, cwd, options);
        }
      }
    };
  });
}
export {
  zsh_user_bash_default as default
};

// rounded-editor.ts
import { Editor, visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";
function rounded_editor_default(pi) {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI)
      return;
    const appTheme = ctx.ui.theme;
    const border = (text) => appTheme.fg("muted", text);
    ctx.ui.setEditorComponent((tui, _editorTheme, kb) => {

      class RoundedEditor extends Editor {
        constructor() {
          super(tui, { borderColor: border }, { paddingX: 1 });
        }
        render(width) {
          const result = super.render(width);
          if (result.length < 2 || width < 4)
            return result;
          const hasAc = this.autocompleteState;
          const boxStart = hasAc && result.length > 3 ? result.findIndex((l, i) => i > 0 && l.includes("─")) : 0;
          if (boxStart < 0)
            return result;
          const topIdx = boxStart;
          const botIdx = result.length - 1;
          const rawLabel = typeof this.statusLabel === "string" ? this.statusLabel : "";
          const label = rawLabel && width > 10 ? truncateToWidth(` ${rawLabel} `, Math.max(0, width - 6), "") : "";
          const labelWidth = visibleWidth(label);
          const topFill = Math.max(0, width - 2 - labelWidth);
          result[topIdx] = border(`╭${"─".repeat(topFill)}${label}${"─".repeat(Math.max(0, width - 2 - topFill - labelWidth))}╮`);
          result[botIdx] = border(`╰${"─".repeat(Math.max(0, width - 2))}╯`);
          for (let i = topIdx + 1;i < botIdx; i++) {
            const inner = truncateToWidth(result[i], Math.max(0, width - 2), "");
            const pad = " ".repeat(Math.max(0, width - 2 - visibleWidth(inner)));
            result[i] = `${border("│")}${inner}${pad}${border("│")}`;
          }
          return result;
        }
      }
      const editor = new RoundedEditor;
      return editor;
    });
  });
}
export {
  rounded_editor_default as default
};

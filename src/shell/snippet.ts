/**
 * Shell snippet generation
 */
import * as fs from "fs";
import * as path from "path";

export function getShellSnippet(shellName: string | null): string {
    if (shellName === "fish") {
        return [
            "if not set -q CODE_ENV_TERMINAL_TAG",
            "  if type -q uuidgen",
            "    set -gx CODE_ENV_TERMINAL_TAG (uuidgen)",
            "  else",
            "    set -gx CODE_ENV_TERMINAL_TAG (date +%s)-$fish_pid-(random)",
            "  end",
            "end",
            "function codenv",
            "  if test (count $argv) -ge 1",
            "    switch $argv[1]",
            "      case use unset auto",
            "        command codenv $argv | source",
            "      case '*'",
            "        command codenv $argv",
            "    end",
            "  else",
            "    command codenv",
            "  end",
            "end",
            "function codex",
            "  command codenv launch codex -- $argv",
            "end",
            "function claude",
            "  command codenv launch claude -- $argv",
            "end",
            "codenv auto",
        ].join("\n");
    }
    return [
        'if [ -z "$CODE_ENV_TERMINAL_TAG" ]; then',
        '  if command -v uuidgen >/dev/null 2>&1; then',
        '    CODE_ENV_TERMINAL_TAG="$(uuidgen)"',
        "  else",
        '    CODE_ENV_TERMINAL_TAG="$(date +%s)-$$-$RANDOM"',
        "  fi",
        "  export CODE_ENV_TERMINAL_TAG",
        "fi",
        "codenv() {",
        '  if [ "$1" = "use" ] || [ "$1" = "unset" ] || [ "$1" = "auto" ]; then',
        '    source <(command codenv "$@")',
        "  else",
        '    command codenv "$@"',
        "  fi",
        "}",
        "codex() {",
        '  command codenv launch codex -- "$@"',
        "}",
        "claude() {",
        '  command codenv launch claude -- "$@"',
        "}",
        "codenv auto",
    ].join("\n");
}

export function escapeRegExp(value: string): string {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function upsertShellSnippet(rcPath: string, snippet: string): void {
    const markerStart = "# >>> codenv >>>";
    const markerEnd = "# <<< codenv <<<";
    const block = `${markerStart}\n${snippet}\n${markerEnd}`;
    const existing = fs.existsSync(rcPath) ? fs.readFileSync(rcPath, "utf8") : "";
    let updated = "";

    if (existing.includes(markerStart) && existing.includes(markerEnd)) {
        const re = new RegExp(
            `${escapeRegExp(markerStart)}[\\s\\S]*?${escapeRegExp(markerEnd)}`
        );
        updated = existing.replace(re, block);
    } else if (existing.trim().length === 0) {
        updated = `${block}\n`;
    } else {
        const sep = existing.endsWith("\n") ? "\n" : "\n\n";
        updated = `${existing}${sep}${block}\n`;
    }

    const dir = path.dirname(rcPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(rcPath, updated, "utf8");
}

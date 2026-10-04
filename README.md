# pi-copy-code

A small [Pi](https://pi.dev) extension that copies Markdown code blocks from completed assistant replies to your system clipboard. It copies code only; it never executes it.

[中文说明](README.zh-CN.md)

## Install

Requires Pi and Node.js **22.19 or newer** (the minimum required by the tested Pi release).

```sh
pi install git:github.com/Ryan041001/pi-copy-code
```

Restart Pi or run `/reload`. To try it for one invocation without adding it to your package settings, run `pi -e git:github.com/Ryan041001/pi-copy-code`.

Pi loads the package's declared extension automatically. It does not take over shortcuts or require manual changes to `settings.json`.

## Usage

- `/copycode` — find code in the most recent completed assistant reply. A single block is copied immediately; multiple blocks open a picker.
- `/copycode 2` — copy the second code block in that reply.
- `/copycode history` — pick from up to the 100 most recent blocks on the active session branch.

Use the picker arrows to choose a block, **Enter** to copy, or **Esc** to cancel. Newer replies appear first in history; blocks within each reply keep their original order. A newer reply without code does not hide the latest code-bearing reply. Source timestamps are shown in the picker and confirmation.

## Compatibility

- Tested with Pi **1.0.2** and Node.js **24**; the extension uses Pi's public extension, Markdown/TUI, and clipboard APIs.
- Requires Pi **1.0.2 or newer** and Node.js **22.19 or newer**.
- Works in Pi's interactive TUI. RPC, JSON, and print modes are intentionally rejected because copying requires an interactive UI.
- Clipboard access is delegated to Pi, so platform and terminal support follow Pi's clipboard implementation (macOS, Windows, Linux, WSL, and supported remote-terminal clipboard paths). A working clipboard utility/terminal integration may be needed on Linux or remote sessions.

## Data handling and safety

- Reads only completed assistant text in the active session branch. It ignores user messages, tool output/arguments, hidden thinking, and incomplete replies.
- Preserves code whitespace, including indentation, tabs, blank lines, and trailing spaces. Markdown parsing normalizes CRLF to LF and removes fence/quote/list structure. It does not add a final newline.
- The picker preview is sanitized for terminal control characters; copied source text is not rewritten.
- The extension does not execute copied code, access the network, or register a keyboard shortcut. Review code before pasting or running it.
- Pi extensions run with the permissions of the Pi process. Review the source before installing if you do not trust it.

## Development

```sh
npm install --no-save --package-lock=false
npm test
npm run check:package
```

The test suite uses Node's built-in test runner, injects a fake clipboard, and checks extension loading with the installed Pi loader. It does not modify your real clipboard. `PI_PACKAGE_DIR` can point tests at a specific Pi package directory when it is not resolvable from the project or the standard global Node installation.

To test the local package in Pi, run `pi -e .` from this directory. Changes to an already loaded extension require `/reload` or a Pi restart.

## Remove

```sh
pi remove git:github.com/Ryan041001/pi-copy-code
```

## License

MIT. See [LICENSE](LICENSE).

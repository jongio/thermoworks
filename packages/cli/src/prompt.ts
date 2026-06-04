import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

export function prompt(question: string): Promise<string> {
	return new Promise((resolve, reject) => {
		// terminal: false avoids raw mode and keypress event machinery,
		// letting the OS terminal handle echo and line editing natively.
		const rl = createInterface({ input: stdin, output: stdout, terminal: false });
		rl.on("close", () => reject(new Error("cancelled")));
		rl.question(question, (answer) => {
			rl.removeAllListeners("close");
			rl.close();
			resolve(answer);
		});
	});
}

/**
 * Prompt for a password with asterisk masking.
 * Uses readline with a muted output stream to reliably suppress echo
 * on all platforms (including Windows Terminal paste via Ctrl+V).
 */
export function promptPassword(question: string): Promise<string> {
	return new Promise((resolve, reject) => {
		stdout.write(question);

		// Muted output prevents ALL terminal echo from readline
		const muted = new Writable({
			write(_chunk: Buffer, _encoding: string, callback: () => void) {
				callback();
			},
		});

		const rl = createInterface({
			input: stdin,
			output: muted,
			terminal: true,
		});

		let displayLen = 0;

		function onKeypress(
			ch: string | undefined,
			key: { name?: string; ctrl?: boolean; meta?: boolean } | undefined,
		): void {
			if (key?.name === "return" || key?.name === "enter") return;
			if (key?.ctrl || key?.meta) return;

			if (key?.name === "backspace") {
				if (displayLen > 0) {
					displayLen--;
					stdout.write("\b \b");
				}
				return;
			}

			// Only mask printable characters (skip arrow keys / escape sequences)
			if (ch && ch.length === 1 && ch >= " ") {
				displayLen++;
				stdout.write("*");
			}
		}

		stdin.on("keypress", onKeypress);

		rl.on("line", (answer) => {
			stdin.removeListener("keypress", onKeypress);
			rl.close();
			stdout.write("\n");
			resolve(answer);
		});

		rl.on("SIGINT", () => {
			stdin.removeListener("keypress", onKeypress);
			rl.close();
			stdout.write("\n");
			reject(new Error("cancelled"));
		});
	});
}

/**
 * Interactive radio-button single-select.
 * ↑/↓ to navigate, Enter to confirm.
 * @param defaultIndex - pre-selected index (user can just press Enter)
 * Returns 0-based index.
 */
export function promptRadio(header: string, choices: string[], defaultIndex = 0): Promise<number> {
	return new Promise((resolve, _reject) => {
		let cursor = defaultIndex;
		let rendered = false;

		const muted = new Writable({
			write(_chunk: Buffer, _encoding: string, callback: () => void) {
				callback();
			},
		});

		const rl = createInterface({
			input: stdin,
			output: muted,
			terminal: true,
		});

		function render(): void {
			if (rendered) {
				stdout.write(`\x1b[${choices.length + 1}A`);
			}

			stdout.write(`${header} \x1b[2m(↑/↓ Enter)\x1b[22m\x1b[K\n`);
			for (let i = 0; i < choices.length; i++) {
				const dot = i === cursor ? "\x1b[32m●\x1b[39m" : "○";
				const pointer = i === cursor ? "\x1b[36m❯\x1b[39m" : " ";
				stdout.write(`${pointer} ${dot} ${choices[i]}\x1b[K\n`);
			}
			rendered = true;
		}

		function cleanup(): void {
			stdin.removeListener("keypress", onKeypress);
			rl.close();
		}

		function onKeypress(
			_ch: string | undefined,
			key: { name?: string; ctrl?: boolean } | undefined,
		): void {
			if (key?.ctrl && key.name === "c") {
				cleanup();
				stdout.write("\n");
				process.exit(0);
			}

			if (key?.name === "return" || key?.name === "enter") {
				cleanup();
				resolve(cursor);
				return;
			}

			if (key?.name === "up") {
				cursor = cursor > 0 ? cursor - 1 : choices.length - 1;
				render();
				return;
			}

			if (key?.name === "down") {
				cursor = cursor < choices.length - 1 ? cursor + 1 : 0;
				render();
				return;
			}
		}

		stdin.on("keypress", onKeypress);
		rl.on("SIGINT", () => {
			cleanup();
			stdout.write("\n");
			process.exit(0);
		});

		render();
	});
}

/**
 * Interactive checkbox multi-select.
 * ↑/↓ to navigate, Space to toggle, A to select all, Enter to confirm.
 * Returns array of 0-based indices of selected items.
 */
export function promptCheckbox(header: string, choices: string[]): Promise<number[]> {
	return new Promise((resolve, _reject) => {
		const selected = new Set<number>();
		let cursor = 0;
		let rendered = false;

		const muted = new Writable({
			write(_chunk: Buffer, _encoding: string, callback: () => void) {
				callback();
			},
		});

		const rl = createInterface({
			input: stdin,
			output: muted,
			terminal: true,
		});

		function render(): void {
			// Move cursor up to overwrite previous render
			if (rendered) {
				stdout.write(`\x1b[${choices.length + 1}A`);
			}

			stdout.write(`${header} \x1b[2m(↑/↓ Space A=all Enter)\x1b[22m\x1b[K\n`);
			for (let i = 0; i < choices.length; i++) {
				const check = selected.has(i) ? "\x1b[32m✓\x1b[39m" : " ";
				const pointer = i === cursor ? "\x1b[36m❯\x1b[39m" : " ";
				stdout.write(`${pointer} [${check}] ${choices[i]}\x1b[K\n`);
			}
			rendered = true;
		}

		function cleanup(): void {
			stdin.removeListener("keypress", onKeypress);
			rl.close();
		}

		function onKeypress(
			ch: string | undefined,
			key: { name?: string; ctrl?: boolean } | undefined,
		): void {
			if (key?.ctrl && key.name === "c") {
				cleanup();
				stdout.write("\n");
				process.exit(0);
			}

			if (key?.name === "return" || key?.name === "enter") {
				cleanup();
				if (selected.size === 0) {
					console.error("No items selected.");
					process.exit(1);
				}
				resolve([...selected].sort((a, b) => a - b));
				return;
			}

			if (key?.name === "up") {
				cursor = cursor > 0 ? cursor - 1 : choices.length - 1;
				render();
				return;
			}

			if (key?.name === "down") {
				cursor = cursor < choices.length - 1 ? cursor + 1 : 0;
				render();
				return;
			}

			if (key?.name === "space" || ch === " ") {
				if (selected.has(cursor)) {
					selected.delete(cursor);
				} else {
					selected.add(cursor);
				}
				render();
				return;
			}

			if (ch === "a" || ch === "A") {
				if (selected.size === choices.length) {
					selected.clear();
				} else {
					for (let i = 0; i < choices.length; i++) selected.add(i);
				}
				render();
				return;
			}
		}

		stdin.on("keypress", onKeypress);
		rl.on("SIGINT", () => {
			cleanup();
			stdout.write("\n");
			process.exit(0);
		});

		render();
	});
}

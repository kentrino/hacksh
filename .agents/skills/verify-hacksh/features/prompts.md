# Prompts

`prompt.select`, `prompt.confirm`, and `prompt.text` on the command context ask the user for input when the mode is interactive (pretty, no `CI`, TTY stdin and stdout). The logger only emits logs; prompts use the same print queue, terminal lock, and abort signal as the rest of the invocation. Active prompts redraw in place and collapse to one `✔` result line. Text re-prompts while `validate` returns a message. Ctrl-C or Escape cancels and `runMain` exits 130. In any non-interactive mode a prompt fails immediately with `reason: non-interactive` and exit 1.

## Sub-features

- `prompt-select` moves with arrow keys and accepts with Enter.
- `prompt-autocomplete` filters by a case-insensitive substring, then Down selects the first match and Enter submits it.
- `prompt-sort` orders `select` and `autocomplete` options with a stable `sortBy` key.
- `prompt-confirm` accepts `y`, `n`, or Enter (initial value, else No).
- `prompt-text` shows the placeholder, edits input, and retries on a validation message.
- `prompt-cancel` cancels on Ctrl-C or Escape with `Prompt cancelled` and exit 130.
- `prompt-noninteractive` fails without waiting when stdin is not a TTY, in JSON mode, or with `CI`.
- `prompt-redraw` wraps and erases correctly at narrow widths.

## How to get to it (user POV)

- Run `demo ask` in a terminal and answer the three prompts.
- Press Ctrl-C at any prompt.
- Run `demo ask` with stdin redirected, in CI, or with `HACKSH_OUTPUT=json`.

## Driving it with drive.mjs

Preconditions:

- Baseline from the index. `ask` asks `Environment` (select, initial `staging`), `Deploy to <env>?` (confirm), and `Release name` (text, placeholder `v1.2.3`, rejects empty), then logs `Releasing <release> to <env>`.

- **Full flow.** Write `verify-hacksh.local/scratch/$RUN/ask.steps` with the lines `expect Environment`, `send \r`, `expect Deploy to staging?`, `send y`, `expect Release name`, `send \r`, `expect A release name is required`, `send v9\r`. Run `D --label ask-pty --env NO_COLOR=1 --pty verify-hacksh.local/scratch/$RUN/ask.steps --expect-code 0 -- CLI ask`. The transcript contains `✔  Environment: staging`, `✔  Deploy to staging?: Yes`, `A release name is required`, `✔  Release name: v9`, and `✔  [demo:ask] Releasing v9 to staging`.
- **Select movement.** Use `send \033[B\r` at `Environment`. The result line is `✔  Environment: production`.
- **Cancel.** Write a steps file with `expect Environment` and `send \003`. Run with `--expect-code 130`. The transcript contains `■  Prompt cancelled` and `reason: cancelled`.
- **Autocomplete.** Run `D --label pick-pty --env NO_COLOR=1 --pty verify-hacksh.local/scratch/$RUN/pick.steps --expect-code 0 -- CLI pick`, with steps `expect Choose a language` and `send go\033[B\r`. The transcript contains `✔  Choose a language: Go` and the submitted value `go`.
- **Stable sort.** Run `D --label sorted-pty --env NO_COLOR=1 --pty verify-hacksh.local/scratch/$RUN/sorted.steps --expect-code 0 -- CLI sorted`, with steps `expect Environment` and `send \r`. Staging (the lower `sortBy` key) is the initial selection, and the transcript contains `✔  Environment: Staging`.
- **Non-interactive.** Run `D --label ask-noninteractive --env NO_COLOR=1 --expect-code 1 --timeout 3000 -- CLI ask` without `--pty`. stderr starts with `■  Cannot request select input in non-interactive mode: Environment` and contains `reason: non-interactive`; it must not time out. `CLI pick` without a PTY fails the same way for autocomplete.
- **Narrow redraw.** Run the full flow with `--columns 20` and a long text answer. Assert final result lines only; the repo's own `pnpm test:prompt-pty` replays the terminal to check erased rows.

## Gotchas

- Confirm accepts the keystroke without Enter; `send y\r` leaves a stray Enter that the next prompt may consume.
- Redraw frames appear as raw `ESC[1A ESC[2K`; never assert that an intermediate frame is absent by substring on the raw transcript.
- PTY output merges stderr into stdout, so the cancellation error is in `stdout` of the evidence.

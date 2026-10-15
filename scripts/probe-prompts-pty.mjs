import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("../src/fixtures/prompt-pty-cli.ts", import.meta.url));
const driver = fileURLToPath(new URL("prompt-prompts-pty.exp", import.meta.url));

async function runProbe(mode, expectedCode) {
  const child = spawn("expect", [driver, process.execPath, fixture, mode], {
    env: { ...process.env, NODE_NO_WARNINGS: "1", NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`PTY probe timed out (${mode})\n${output}`));
    }, 5_000);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
  if (result.code !== expectedCode) {
    throw new Error(
      `PTY probe failed (${mode}): ${JSON.stringify({ ...result, expectedCode })}\n${output}`,
    );
  }
  return output;
}

function characterWidth(character) {
  const codePoint = character.codePointAt(0);
  return codePoint >= 0x1100 && (codePoint <= 0x115f || codePoint >= 0x2e80) ? 2 : 1;
}

function effectiveTerminalLines(output, columns = 20) {
  const lines = [""];
  let row = 0;
  let column = 0;
  for (let index = 0; index < output.length;) {
    if (output.startsWith("\u001b[1A", index)) {
      row = Math.max(0, row - 1);
      index += 4;
    } else if (output.startsWith("\u001b[2K", index)) {
      lines[row] = "";
      column = 0;
      index += 4;
    } else if (output[index] === "\r") {
      column = 0;
      index += 1;
    } else if (output[index] === "\n") {
      row += 1;
      column = 0;
      lines[row] ??= "";
      index += 1;
    } else {
      const character = String.fromCodePoint(output.codePointAt(index));
      const width = characterWidth(character);
      if (column + width > columns) {
        row += 1;
        column = 0;
        lines[row] ??= "";
      }
      lines[row] = `${lines[row]}${character}`;
      column += width;
      index += character.length;
    }
  }
  while (lines.length > 1 && lines.at(-1) === "") lines.pop();
  return lines;
}

const flow = await runProbe("flow", 0);
const longName = "ofabcdefghijklmnopqrstuvwxyz0123456789fF";
if (
  !flow.includes(
    `PROBE_RESULT {"environment":"production","confirmed":true,"name":"${longName}","restored":true}`,
  )
) {
  throw new Error(`PTY flow result was not restored or had wrong values\n${flow}`);
}
const rendered = effectiveTerminalLines(flow);
for (const expected of ["✔  Environment", "Target: production", "✔  Continue?: Yes"]) {
  if (!rendered.includes(expected)) {
    throw new Error(`PTY prompt output omitted final result line: ${expected}\n${flow}`);
  }
}
if (!rendered.join("").includes(`✔  Name: ${longName}`)) {
  throw new Error(`PTY long input did not render as one wrapped final result\n${flow}`);
}
if (
  rendered.some(
    (line) =>
      line.startsWith("?  ") ||
      line.startsWith("│  ") ||
      line.includes("Too short") ||
      line.includes("at least three"),
  )
) {
  throw new Error(`PTY prompt output retained an erased active block\n${flow}`);
}

const caught = await runProbe("caught-cancel", 0);
const caughtRendered = effectiveTerminalLines(caught);
if (!caught.includes('CAUGHT_RESULT {"restored":true}')) {
  throw new Error(`PTY caught cancellation did not restore the terminal\n${caught}`);
}
if (caughtRendered.some((line) => line === "")) {
  throw new Error(`PTY caught cancellation left an internal empty row\n${caught}`);
}
for (const expected of ["first log after cancellation", "second log after cancellation"]) {
  if (caughtRendered.join("").split(expected).length !== 2) {
    throw new Error(`PTY caught cancellation omitted log: ${expected}\n${caught}`);
  }
}
if (caughtRendered.some((line) => line.includes("Caught cancellation"))) {
  throw new Error(`PTY caught cancellation redrew a dead prompt\n${caught}`);
}

const cancellation = await runProbe("cancel", 130);
if (!cancellation.includes("Prompt cancelled") || !cancellation.includes("cancelled")) {
  throw new Error(`PTY cancellation was not identified\n${cancellation}`);
}
if (effectiveTerminalLines(cancellation).some((line) => line === "?  Cancel me")) {
  throw new Error(`PTY cancellation left the active prompt on screen\n${cancellation}`);
}

process.stdout.write(
  "PTY prompt probe passed: close, narrow redraw, multiline, long input, cancellation, restoration\n",
);

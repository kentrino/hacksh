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

function effectiveTerminalLines(output) {
  const lines = [""];
  let row = 0;
  for (let index = 0; index < output.length;) {
    if (output.startsWith("\u001b[1A", index)) {
      row = Math.max(0, row - 1);
      index += 4;
    } else if (output.startsWith("\u001b[2K", index)) {
      lines[row] = "";
      index += 4;
    } else if (output[index] === "\r") {
      index += 1;
    } else if (output[index] === "\n") {
      row += 1;
      lines[row] ??= "";
      index += 1;
    } else {
      lines[row] = `${lines[row]}${output[index]}`;
      index += 1;
    }
  }
  return lines.filter(Boolean);
}

const flow = await runProbe("flow", 0);
if (
  !flow.includes(
    'PROBE_RESULT {"environment":"production","confirmed":true,"name":"ofF","restored":true}',
  )
) {
  throw new Error(`PTY flow result was not restored or had wrong values\n${flow}`);
}
const rendered = effectiveTerminalLines(flow);
for (const expected of ["✔  Environment: production", "✔  Continue?: Yes", "✔  Name: ofF"]) {
  if (rendered.filter((line) => line === expected).length !== 1) {
    throw new Error(`PTY prompt output did not collapse to one result line: ${expected}\n${flow}`);
  }
}
if (rendered.some((line) => line.startsWith("?  ") || line.startsWith("│  "))) {
  throw new Error(`PTY prompt output retained an erased active block\n${flow}`);
}

const cancellation = await runProbe("cancel", 130);
if (!cancellation.includes("Prompt cancelled") || !cancellation.includes("cancelled")) {
  throw new Error(`PTY cancellation was not identified\n${cancellation}`);
}
if (effectiveTerminalLines(cancellation).some((line) => line === "?  Cancel me")) {
  throw new Error(`PTY cancellation left the active prompt on screen\n${cancellation}`);
}

process.stdout.write(
  "PTY prompt probe passed: redraw, type-ahead, f/F, validation retry, cancellation, restoration\n",
);

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

const flow = await runProbe("flow", 0);
if (
  !flow.includes(
    'PROBE_RESULT {"environment":"production","confirmed":true,"name":"xhi","restored":true}',
  )
) {
  throw new Error(`PTY flow result was not restored or had wrong values\n${flow}`);
}

const cancellation = await runProbe("cancel", 130);
if (!cancellation.includes("Prompt cancelled") || !cancellation.includes("cancelled")) {
  throw new Error(`PTY cancellation was not identified\n${cancellation}`);
}

process.stdout.write(
  "PTY prompt probe passed: select, confirm, text retry, cancellation, restoration\n",
);

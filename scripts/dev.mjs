// Standard Next development server, with preview host flag compatibility.
// --smoke optionally runs authenticated HTTP checks from the server's network.
import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream } from "node:fs";
const input = process.argv.slice(2),
  smoke = input.includes("--smoke");
const args = input
  .filter((a) => !["--strictPort", "--smoke"].includes(a))
  .map((a) => (a === "--host" ? "--hostname" : a));
if (!args.includes("--hostname")) args.push("--hostname", "0.0.0.0");
const portIndex = args.indexOf("--port"),
  port = portIndex >= 0 ? args[portIndex + 1] : "3000";
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", ...args],
  { stdio: smoke ? ["inherit", "pipe", "pipe"] : "inherit", env: process.env },
);
let smokeStarted = false;
if (smoke) {
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      process.stdout.write(chunk);
      if (!smokeStarted && chunk.toString().includes("Ready")) {
        smokeStarted = true;
        mkdirSync(".qa", { recursive: true });
        const log = createWriteStream(".qa/http-smoke.log");
        const check = spawn(
          process.execPath,
          ["--import", "tsx", "scripts/http-smoke.ts"],
          {
            env: {
              ...process.env,
              SALONOS_TEST_URL: `http://localhost:${port}`,
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        for (const source of [check.stdout, check.stderr])
          source.on("data", (bytes) => {
            process.stdout.write(bytes);
            log.write(bytes);
          });
        check.on("exit", (code) => {
          log.end(`\nHTTP_SMOKE_EXIT=${code}\n`);
        });
      }
    });
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));

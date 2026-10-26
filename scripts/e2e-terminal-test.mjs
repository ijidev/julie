import { WebSocket } from "ws";
import fs from "node:fs";
import path from "node:path";

// Load environment variables safely
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2];
  }
}

const BASE_URL = "https://julie.ijihost.com";
const PASSWORD = process.env.ADMIN_PASSWORD;

if (!PASSWORD) {
  console.error("FATAL: No password found in environment.");
  process.exit(1);
}

async function main() {
  // 1. Login to get session cookie
  const loginRes = await fetch(`${BASE_URL}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD })
  });

  if (!loginRes.ok) {
    console.error("Login failed with status:", loginRes.status);
    process.exit(1);
  }

  const cookies = loginRes.headers.get("set-cookie");
  if (!cookies) { console.error("No cookie received"); process.exit(1); }

  console.log("[1/3] Login successful. Connecting to WebSocket...");

  // 2. Connect to WebSocket
  const ws = new WebSocket(`wss://julie.ijihost.com/terminal-ws`, {
    headers: { Cookie: cookies.split(";")[0] }
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { console.error("Timeout"); process.exit(1); }, 15000);
    ws.on("open", () => {
      console.log("[2/3] WebSocket connected. Executing test command...");
      ws.send(JSON.stringify({ type: "exec", command: "echo JULIE-AIOS-TERMINAL-OK" }));
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "data" && msg.text.includes("JULIE-AIOS-TERMINAL-OK")) {
        console.log("[3/3] Command output verified: JULIE-AIOS-TERMINAL-OK");
      } else if (msg.type === "exit") {
        console.log(`Execution finished with code ${msg.code}. Duration: ${msg.durationMs}ms`);
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      } else if (msg.type === "error") {
        console.error("WS Error:", msg.message);
        clearTimeout(timeout);
        process.exit(1);
      }
    });
  });
}

main().then(() => {
  console.log("E2E TEST PASSED");
  process.exit(0);
}).catch(err => { console.error("E2E TEST FAILED", err); process.exit(1); });

import fs from "fs";
import path from "path";

// Auto-load .env.local and .env
const envLocal = path.resolve(process.cwd(), ".env.local");
const envDefault = path.resolve(process.cwd(), ".env");

if (fs.existsSync(envLocal) && typeof (process as any).loadEnvFile === "function") {
  (process as any).loadEnvFile(envLocal);
} else if (fs.existsSync(envDefault) && typeof (process as any).loadEnvFile === "function") {
  (process as any).loadEnvFile(envDefault);
}

import { validateEmailConfig, verifySMTPConnection } from "../src/lib/email";

async function main() {
  console.log("==================================================");
  console.log("   CHRONOS — SMTP Connection Diagnostic Tool      ");
  console.log("==================================================");

  // 1. Check Config
  console.log("\n[1/2] Checking email configuration environment variables...");
  const validation = validateEmailConfig();

  if (!validation.isValid) {
    console.error("❌ Configuration invalid! Missing required environment variables:");
    for (const v of validation.missingVariables) {
      console.error(`  - ${v}`);
    }
    console.log("\nPlease define these variables in your .env.local file.");
    process.exit(1);
  }

  const { host, port, secure, user, from, appUrl } = validation.sanitizedConfig!;
  console.log("✓ Environment variables detected:");
  console.log(`  - Host:     ${host}`);
  console.log(`  - Port:     ${port} (Secure/TLS: ${secure})`);
  console.log(`  - User:     ${user}`);
  console.log(`  - From:     ${from}`);
  console.log(`  - App URL:  ${appUrl}`);
  console.log("  - Pass:     [REDACTED]");

  // 2. Test Connection
  console.log("\n[2/2] Connecting to SMTP server and verifying credentials...");
  const result = await verifySMTPConnection();

  if (!result.ok) {
    console.error(`❌ SMTP verification failed: ${result.message}`);
    if (result.error) {
      console.error(`   Details: ${result.error}`);
    }
    process.exit(1);
  }

  console.log("✓ SUCCESS: SMTP connection established and authenticated successfully!");
  console.log(`  Connected to ${result.host}:${result.port} as ${result.user}`);
}

main().catch((err) => {
  console.error("Unexpected error during SMTP verification:", err);
  process.exit(1);
});

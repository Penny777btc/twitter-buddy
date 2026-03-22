const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const Anthropic = require("@anthropic-ai/sdk");
const config = require("./config");

function parseJsonLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function runCodexCli(prompt) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "twitter-buddy-codex-"));
  const outputFile = path.join(tempDir, "last-message.txt");
  const args = [
    "exec",
    "--skip-git-repo-check",
    "--json",
    "-o",
    outputFile,
    "-",
  ];

  if (config.codex?.model) {
    args.splice(1, 0, "--model", config.codex.model);
  }

  const bin = config.codex?.bin || process.env.CODEX_BIN || "codex";

  return await new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        const events = parseJsonLines(stdout);
        const lastAgentMessage = [...events]
          .reverse()
          .find((event) => event.type === "item.completed" && event.item?.type === "agent_message")
          ?.item?.text;
        const outputText = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, "utf-8").trim() : "";
        fs.rmSync(tempDir, { recursive: true, force: true });

        if (code !== 0) {
          reject(new Error(stderr.trim() || lastAgentMessage || `codex exited with code ${code}`));
          return;
        }

        const text = outputText || lastAgentMessage || "";
        if (!text) {
          reject(new Error("codex returned no message"));
          return;
        }

        resolve(text);
      } catch (err) {
        reject(err);
      }
    });

    child.stdin.end(prompt);
  });
}

async function runAnthropic(prompt, model, maxTokens) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  return message.content[0].text;
}

async function generateText({ prompt, anthropicModel, maxTokens }) {
  const provider = config.llm?.provider || "codex-cli";

  if (provider === "anthropic") {
    return runAnthropic(prompt, anthropicModel, maxTokens);
  }

  if (provider === "codex-cli") {
    return runCodexCli(prompt);
  }

  throw new Error(`Unsupported llm provider: ${provider}`);
}

module.exports = { generateText };

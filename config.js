const fs = require("fs");
const path = require("path");

const analysisPromptFile = path.join(__dirname, "prompts", "analysis-report.md");
const analysisPrompt = fs.readFileSync(analysisPromptFile, "utf-8").trim();

module.exports = {
  // Chrome 配置
  chromeDataDir: path.join(__dirname, ".chrome-profile"),

  // LLM provider 配置
  llm: {
    provider: process.env.LLM_PROVIDER || "codex-cli",
  },

  // Codex CLI 配置
  codex: {
    bin: process.env.CODEX_BIN || "codex",
    model: process.env.CODEX_MODEL || "",
  },

  // 采集配置
  scroll: {
    burstMin: 3,
    burstMax: 10,
    burstDelayMin: 200,
    burstDelayMax: 500,
    pauseMin: 3000,
    pauseMax: 9000,
    scrollPixels: 700,
    maxScrolls: 200,
    staleLimit: 10,
  },

  // 守护进程配置
  daemon: {
    intervalMin: 5 * 60 * 1000,   // 最短间隔 5 分钟
    intervalMax: 60 * 60 * 1000,  // 最长间隔 60 分钟
    analysisIntervalMs: 2 * 60 * 60 * 1000, // 每 2 小时触发一次分析
  },

  // LLM 分析配置
  analysis: {
    model: "claude-opus-4-6",
    maxTokens: 4096,
    analysisHours: 48, // 分析最近几小时的推文
    redactBeforeUpload: false,
    redactLinks: false,
    maxTweetLength: 2000,
    prompt: analysisPrompt,
  },

  // 账号发现配置
  discover: {
    maxScrolls: 100,
    intervalMs: 6 * 60 * 60 * 1000, // daemon 中每 6 小时跑一次
    model: "claude-sonnet-4-6",
    maxTokens: 4096,
    redactBeforeUpload: false,
    redactLinks: false,
    maxTweetLength: 2000,
    prompt: `你是一个推特账号发现助手。以下是从"为你推荐"(For You) 时间线采集到的推文数据（JSON 格式）。

请用中文分析并推荐值得关注的账号：

1. **值得关注的账号**：找出推文中出现的、内容质量高的账号。每个账号请给出：
   - 账号名和链接（用 Markdown 格式 [@用户名](https://x.com/用户名)）
   - 该账号发了什么内容（附推文链接）
   - 为什么值得关注（内容质量、专业领域、影响力等）
   - 推荐指数（⭐ 1-5 星）

2. **优质内容精选**：挑出最有价值的 5-10 条推文，给出摘要和原文链接（用 Markdown 格式 [摘要](链接)）

3. **新发现的话题/领域**：有没有你之前没接触过的有趣话题或圈子

4. **不推荐关注的类型**：哪些账号看起来是营销号、机器人、或者低质量内容

关注重点：加密货币、AI/科技、宏观经济、地缘政治、深度思考、原创内容`,
  },

  // Dashboard 配置
  dashboard: {
    host: process.env.DASHBOARD_HOST || "127.0.0.1",
    port: Number(process.env.DASHBOARD_PORT) || 3456,
    authToken: process.env.DASHBOARD_TOKEN || "",
    maxBodyBytes: 16 * 1024,
  },

  // 数据目录
  dataDir: path.join(__dirname, "data"),
  tweetsDir: path.join(__dirname, "data", "tweets"),
  analysisDir: path.join(__dirname, "data", "analysis"),
  discoverDir: path.join(__dirname, "data", "discover"),
  stateFile: path.join(__dirname, "data", "state.json"),
};

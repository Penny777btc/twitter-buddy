# Twitter Buddy

Your personal Twitter/X assistant that automatically scrolls your timeline, collects tweets, analyzes trends with AI, and discovers accounts worth following — so you don't have to.

你的私人推特助手 — 自动帮你刷推特、采集推文、AI 分析趋势、发现值得关注的账号。

[中文说明](#中文说明)

## What It Does

- **Auto-collect tweets** — Launches Chrome, switches to your "Following" timeline (sorted by latest), scrolls and saves every tweet with deduplication
- **AI analysis** — Periodically sends collected tweets to your configured LLM provider for trend analysis, key highlights, and sentiment summary
- **Account discovery** — Scrolls the "For You" tab and uses your configured LLM provider to find high-quality accounts worth following
- **Follow manager** — Scan your current following list, import follow candidates, and generate unfollow suggestions for manual review
- **Dashboard** — Web UI to view analysis reports, discover reports, tweet volume charts, and trigger manual runs

## Requirements

- Node.js 18+
- Google Chrome installed
- `codex login` completed on this machine, or an [Anthropic API key](https://console.anthropic.com/)

## Setup

```bash
git clone https://github.com/YOUR_USERNAME/twitter-buddy.git
cd twitter-buddy
npm install
npx playwright install-deps
```

Create a `.env` file:

```
# Default provider: local Codex CLI using your ChatGPT/Codex login
LLM_PROVIDER=codex-cli

# Optional dashboard protection
# DASHBOARD_TOKEN=choose-a-long-random-string
# DASHBOARD_HOST=127.0.0.1
# DASHBOARD_PORT=3456

# Optional: pin a Codex model
# CODEX_MODEL=gpt-5-codex

# Optional fallback: use Anthropic API instead
# LLM_PROVIDER=anthropic
# ANTHROPIC_API_KEY=sk-ant-xxxxx
```

If you want to use your ChatGPT/Codex subscription instead of an API key:

```bash
codex login
```

Log in to Twitter (opens a Chrome window, log in manually, then close it):

```bash
npm run login
```

## Usage

### Daemon Mode (recommended)

Runs everything automatically — tweet collection, analysis every 2h over the last 48h of tweets, account discovery every 6h, plus a dashboard at `http://localhost:3456`:

```bash
npm run daemon
```

### Individual Commands

| Command | Description |
|---|---|
| `npm run collect` | One-time tweet collection |
| `npm run collect:5` | Quick collection (5 scrolls) |
| `npm run analyze` | Analyze recent 48h of tweets |
| `npm run analyze:4h` | Analyze recent 4h of tweets |
| `npm run discover` | Discover accounts from "For You" |
| `npm run discover:50` | Quick discovery (50 scrolls) |
| `npm run dashboard` | Start dashboard only |
| `npm run following:scan` | Scan the accounts you currently follow |
| `npm run unfollow:suggest` | Generate local unfollow suggestions from saved rules |
| `npm run login` | Log in to Twitter |

### Dashboard

Open `http://localhost:3456` after starting the daemon or dashboard.

- **Analysis Reports** — AI-generated trend reports with next auto-run countdown
- **Discover** — Account recommendations with "Run Now" button
- **Follow Manager** — Following scan, candidate import, manual review queues for follow / unfollow
- **Stats** — Tweet volume charts by hour/day
- **Tweet Data Files** — Raw collected data

### Follow Manager Workflow

The follow manager is intentionally semi-automatic:

1. Run a following scan to build a local snapshot of accounts you already follow.
2. Paste candidate `@handles` or `x.com/...` profile URLs into the dashboard.
3. Generate unfollow suggestions using conservative rules like inactivity or bio keywords.
4. Approve or dismiss each item in the dashboard.
5. Use `Approved Queue` to batch-open approved profiles, or `Session Mode` to process them one by one.
6. Complete the follow / unfollow action manually in X.

This project does **not** background-click follow / unfollow buttons in bulk.

## Configuration

Edit `config.js` to customize:

- `scroll.*` — Scroll speed, burst size, delays (for anti-detection)
- `daemon.intervalMin/Max` — Collection frequency (default: 5-60 min random)
- `daemon.analysisIntervalMs` — Analysis frequency (default: 2 hours)
- `discover.intervalMs` — Discovery frequency (default: 6 hours)
- `discover.maxScrolls` — How far to scroll "For You" (default: 100)
- `followManager.scanMaxScrolls` — How far to scroll when scanning your following list
- `followManager.inactivityDays` — Default inactivity threshold for unfollow suggestions
- `followManager.bioExcludeKeywords` — Comma-separated bio keywords to flag for manual review
- `followManager.protectedAccountReview` — Whether protected accounts should be suggested for review
- `llm.provider` — `codex-cli` or `anthropic`
- `codex.bin` / `codex.model` — Codex CLI binary and optional model override
- `analysis.model` / `discover.model` — Anthropic model to use when `llm.provider=anthropic`
- `analysis.analysisHours` — Default tweet lookback window for analysis (now 48 hours)
- `analysis.prompt` / `discover.prompt` — Custom AI prompts
- `analysis.redactBeforeUpload` / `discover.redactBeforeUpload` — Replace usernames before sending data to the LLM provider
- `analysis.redactLinks` / `discover.redactLinks` — Strip links before sending data to the LLM provider
- `analysis.maxTweetLength` / `discover.maxTweetLength` — Truncate tweet text before sending data to the LLM provider
- `dashboard.host` / `dashboard.port` / `dashboard.authToken` — Dashboard bind address and optional token protection

## Analysis Report Format

The default analysis report now follows a fixed structured template:

- `0. 一句话总结`
- `1. 核心叙事`
- `2. 可操作 Alpha 清单`
- `3. 风险信号`
- `4. 噪音标注`
- `5. 关键人物本期表现`
- `6. 跨维度联动观察`

The canonical prompt for this report lives in [prompts/analysis-report.md](/Users/pennys/conductor/repos/twitter-buddy/prompts/analysis-report.md). Update that file if you want to change the default report rules for manual runs and daemon-generated reports.

## Data Storage

All data is stored locally in the `data/` directory:

```
data/
├── tweets/          # tweets_YYYY-MM-DD.json (per-day, deduplicated)
├── analysis/        # analysis_YYYY-MM-DD-HH-MM.md
├── discover/        # discover_YYYY-MM-DD-HH-MM.md
├── follow-manager/  # following snapshot, candidates, unfollow suggestions
└── state.json       # daemon state (last run times, gaps, etc.)
```

## Running on a Server

**Windows Server (with desktop)** — Works out of the box. RDP in, run `npm run login`, then `npm run daemon`.

**Headless Linux VPS** — Use `xvfb` for a virtual display:

```bash
sudo apt install -y xvfb google-chrome-stable
npx playwright install-deps
xvfb-run node daemon.js
```

If you expose the dashboard beyond the local machine, set `DASHBOARD_TOKEN` first.

## Tech Stack

- [Playwright](https://playwright.dev/) — Browser automation
- [Codex CLI](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan) or [Claude API](https://docs.anthropic.com/) — AI analysis
- Vanilla Node.js HTTP server — Dashboard (zero dependencies)

---

## 中文说明

你的私人推特助手 — 自动帮你刷推特、采集推文、AI 分析趋势、发现值得关注的账号。

### 功能

- **自动采集推文** — 启动 Chrome，切到 "Following" 时间线（最新排序），自动滚动采集，按天去重保存
- **AI 分析** — 定时把采集到的推文发给你配置的 LLM 提供方分析，输出热点话题、重点推文、情绪倾向
- **账号发现** — 自动刷 "为你推荐" 标签页，用你配置的 LLM 提供方找出值得关注的高质量账号
- **关注管理** — 扫描当前 following 列表、导入待关注账号、按规则生成待取关建议，供人工审核
- **Dashboard** — 网页界面查看分析报告、发现报告、推文数量图表，支持手动触发

### 快速开始

```bash
# 安装
npm install
npx playwright install-deps

# 默认：使用你本机已登录的 Codex
echo "LLM_PROVIDER=codex-cli" > .env

# 先完成登录
codex login

# 可选：保护 Dashboard
echo "DASHBOARD_TOKEN=choose-a-long-random-string" >> .env

# 登录推特（手动登录后关闭浏览器）
npm run login

# 启动守护进程（全自动）
npm run daemon
```

打开 `http://localhost:3456` 查看 Dashboard。

### 命令一览

| 命令 | 说明 |
|---|---|
| `npm run daemon` | 守护进程（采集 + 分析 + 发现 全自动） |
| `npm run collect` | 单次采集推文 |
| `npm run analyze` | 分析最近 48 小时推文 |
| `npm run discover` | 发现值得关注的账号 |
| `npm run following:scan` | 扫描当前 following 列表 |
| `npm run unfollow:suggest` | 生成本地待取关建议 |
| `npm run dashboard` | 只启动 Dashboard |
| `npm run login` | 登录推特 |

### 关注管理工作流

`Follow Manager` 采用半自动模式：

1. 先扫描当前 following 列表，建立本地快照。
2. 在 dashboard 里粘贴待关注的 `@handle` 或主页链接。
3. 按“不活跃 / bio 关键词 / 受保护账号”等规则生成待取关建议。
4. 逐条批准或忽略。
5. 用 `Approved Queue` 批量打开已批准主页，或在 `Session Mode` 里逐个处理。
6. 在 X 页面里手动完成关注或取关。

默认不会在后台自动批量点 `Follow / Unfollow`。

### 部署

- **Windows Server**（带桌面）— 直接跑，没问题
- **Linux VPS**（无屏幕）— 用 `xvfb-run node daemon.js`

### 数据安全

- 原始推文、分析结果、`.env` 和 `.chrome-profile` 默认都保存在本地磁盘。
- `analyze` 和 `discover` 功能会把推文内容发送到你配置的 LLM 提供方。
- 默认配置下会调用本机 `codex` CLI，因此需要先在这台机器上完成 `codex login`。
- 如果改成 `LLM_PROVIDER=anthropic`，则会发送到 Anthropic API。
- 如果想减少上传内容，可以在 `config.js` 里启用 `redactBeforeUpload`、`redactLinks`，或者调低 `maxTweetLength`。
- `.env`、`.chrome-profile` 和 `data/` 已在 `.gitignore` 中排除。
- `.chrome-profile` 含有 X 登录态，建议只放在可信机器上，不要同步到共享目录或网盘。

### 分析报告格式

默认分析报告已经固定为新的结构化模板，包含：

- `一句话总结`
- `核心叙事`
- `可操作 Alpha 清单`
- `风险信号`
- `噪音标注`
- `关键人物本期表现`
- `跨维度联动观察`

如果你后面还想继续调整这套规则，直接改 [prompts/analysis-report.md](/Users/pennys/conductor/repos/twitter-buddy/prompts/analysis-report.md) 即可，手动分析和 daemon 自动分析都会跟着更新。

# Instagram Saved Posts Organizer

A Chrome extension and web app that exports your Instagram saved posts and automatically organizes them into categories using AI.

## How it works

1. **Install the Chrome extension** from the Chrome Web Store
2. **Open Instagram** → go to your Saved posts → click into any collection
3. **Click Export** in the extension — the organizer opens automatically
4. **Auto Categorize** — free server credits included; once exhausted, add your own [OpenRouter API key](https://openrouter.ai/settings/keys) in Settings to continue

Posts are sorted into a folder tree (e.g. Food › Chicago › Restaurants › Italian, Travel › Bali, Wedding › Decor) with tags and a search bar.

## Features

- One-click export from any Instagram saved collection
- AI categorization using OpenRouter — a single API hub where you can add any LLM API key (OpenAI, Anthropic, Google, and more)
- Incremental export — only new posts are processed each time
- Folder tree with categories, subcategories, and tags
- Search across categories, subcategories, and tags
- All data stored locally in your browser — nothing sent to any server except the AI API

## Setup

### Extension
1. Clone this repo
2. Go to `chrome://extensions` → enable Developer Mode → Load unpacked
3. Select the `extension/` folder

### Web app (local)
Open `webapp/index.html` directly in your browser — no build step needed.

### Web app (hosted)
Deployed via Vercel. The `vercel.json` sets `webapp/` as the output directory.

## Requirements

- Google Chrome
- Free categorization credits included — once exhausted, bring your own [OpenRouter API key](https://openrouter.ai/settings/keys) (stored locally, never shared). OpenRouter is a unified API gateway that lets you use models from OpenAI, Anthropic, Google, and others with a single key.

## Privacy

All data stays in your browser. The only external service contacted is the AI API (via OpenRouter), called through our proxy during the free tier or directly using your own key. See [Privacy Policy](webapp/privacy.html).

## Tech

- Chrome Extension Manifest V3
- Vanilla JS, no build tools or frameworks
- OpenRouter (default: GPT-4o mini)

# Instagram Saved Posts Organizer

A Chrome extension and web app that exports your Instagram saved posts and automatically organizes them into categories using AI.

## How it works

1. **Install the Chrome extension** from the Chrome Web Store
2. **Open Instagram** → go to your Saved posts → click into any collection
3. **Click Export** in the extension — buttons appear to **Download JSON** or **Open Organizer** directly
4. **Auto Categorize** — free server credits included; once exhausted, add your own [OpenRouter API key](https://openrouter.ai/settings/keys) in Settings to continue

Posts are sorted into a folder tree (e.g. Food › Chicago › Restaurants › Italian, Travel › Bali, Wedding › Decor) with tags and a search bar.

## Features

- One-click export from any Instagram saved collection
- After export: **Download JSON** or **Open Organizer** buttons directly in the extension popup
- AI categorization powered by [OpenRouter](https://openrouter.ai) (default: GPT-4o mini)
- Incremental export — only new posts are processed each time
- Folder tree with categories, subcategories, and tags
- Search across categories, subcategories, and tags
- Light and dark theme toggle in the header
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
- Free categorization credits included — once exhausted, add your own API key via **Settings** in the organizer:
  1. Get a free [OpenRouter API key](https://openrouter.ai/settings/keys)
  2. To use your existing OpenAI, Anthropic, or Google key, add it as BYOK in [OpenRouter integrations](https://openrouter.ai/settings/integrations) — then paste your OpenRouter key into Settings
  - Your key is stored locally in your browser and never shared

## Privacy

All data stays in your browser. The only external service contacted is the AI API (via OpenRouter), called through our proxy during the free tier or using your own key once set. See [Privacy Policy](webapp/privacy.html).

## Tech

- Chrome Extension Manifest V3
- Vanilla JS, no build tools or frameworks
- OpenRouter (default: GPT-4o mini)

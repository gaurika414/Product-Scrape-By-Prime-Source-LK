# Product Scrape By Prime Source LK

Product Scrape By Prime Source LK is a local web app for extracting product information from e-commerce screenshots. Version `v0.3.0` adds batch uploads and tall screenshot tiling for easier OCR on long product pages.

## Features

- Upload up to 10 product screenshots at a time.
- Navigate results per screenshot.
- Copy the current listing or the full batch.
- Extract visible product title, price, discount, rating, shipping, delivery, and specifications.
- Generate ready-to-copy listing text.
- Detect visible product image regions from the screenshot.
- Use fallback visual crop detection when the AI does not return product image regions.
- Copy or download cropped product images where supported by the browser.
- Resize and compress screenshots in the browser before analysis.
- Tile tall screenshots into zoomed vertical sections for better text extraction.
- Run locally with a lightweight Node.js server.
- Dark mode interface.
- Ollama local vision support.
- Optional OpenAI cloud mode.

## Requirements

- Node.js 20 or newer.
- A modern browser.
- Ollama for local AI mode, or an OpenAI API key for OpenAI mode.

## Setup

Clone the repository:

```powershell
git clone https://github.com/gaurika414/Product-Scrape-By-Prime-Source-LK.git
cd Product-Scrape-By-Prime-Source-LK
```

Create a local environment file:

```powershell
copy .env.example .env
```

## Local AI Mode

Install Ollama, then pull the vision model:

```powershell
ollama pull llama3.2-vision
```

Use this `.env` setup:

```env
AI_PROVIDER=ollama
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2-vision
PORT=3077
```

## Optional OpenAI Mode

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4.1-mini
PORT=3077
```

## Start

```powershell
node server.js
```

Open:

```text
http://127.0.0.1:3077
```

## Security

Do not commit real API keys. Keep `.env` private and use `.env.example` as the public template.

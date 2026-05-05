# Product Scrape By Prime Source LK

Product Scrape By Prime Source LK is a local web app for extracting product information from e-commerce screenshots. Version `v0.5.0` improves listing output quality and adds clearer UI feedback during analysis.

## Features

- Upload up to 10 product screenshots at a time.
- Navigate results per screenshot.
- Copy the current listing or the full batch.
- Extract visible product title, price, discount, rating, shipping, delivery, and specifications.
- Generate ready-to-copy listing text.
- Resize and compress screenshots in the browser before analysis.
- Tile tall screenshots into zoomed vertical sections for better text extraction.
- Choose Gemini, OpenAI, or Ollama from the app interface.
- Set the AI model, API key, and Ollama URL from the app interface.
- Show animated toast feedback for copy, save, analysis, and error states.
- Show a spinner while batch analysis is running.
- Generate a simplified emoji listing format with hashtags.
- Run locally with a lightweight Node.js server.
- Dark mode interface.

## Requirements

- Node.js 20 or newer.
- A modern browser.
- A Gemini API key for the recommended cloud mode, an OpenAI API key for OpenAI mode, or Ollama for local AI mode.

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

## Recommended Gemini Mode

Get a Gemini API key:

1. Open [Google AI Studio API Keys](https://aistudio.google.com/apikey).
2. Sign in with your Google account.
3. Click **Create API key**.
4. Choose an existing Google Cloud project or let Google AI Studio create one.
5. Copy the key and paste it into the app's AI Settings panel, or save it in your local `.env` file.

Use this `.env` setup:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-key-here
GEMINI_MODEL=gemini-2.5-flash
PORT=3077
```

You can also paste the Gemini API key in the app's AI Settings panel.

## Optional OpenAI Mode

Create an OpenAI API key from the [OpenAI API keys page](https://platform.openai.com/api-keys), then use it in the app's AI Settings panel or in `.env`.

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4.1-mini
PORT=3077
```

## Optional Ollama Local Mode

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

## Start

```powershell
node server.js
```

Open:

```text
http://127.0.0.1:3077
```

## Security

Do not commit real API keys. Keep `.env` and `apikey.env` private and use `.env.example` as the public template. Treat API keys like passwords and rotate them if they are ever exposed.

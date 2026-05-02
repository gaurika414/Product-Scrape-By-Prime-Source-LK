# Product Scrape By Prime Source LK

Product Scrape By Prime Source LK is a local web app for extracting product information from e-commerce screenshots. Version `v0.1.0` focuses on a simple single-screenshot workflow powered by OpenAI vision.

## Features

- Upload one product screenshot at a time.
- Extract visible product title, price, discount, rating, shipping, delivery, and specifications.
- Generate ready-to-copy listing text.
- Detect visible product image regions from the screenshot.
- Copy or download cropped product images where supported by the browser.
- Run locally with a lightweight Node.js server.
- Includes a basic PWA manifest and service worker.

## Requirements

- Node.js 20 or newer.
- An OpenAI API key.
- A modern browser.

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

Edit `.env`:

```env
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4.1-mini
PORT=3077
```

Start the app:

```powershell
node server.js
```

Open the app:

```text
http://127.0.0.1:3077
```

## Usage

1. Choose a product screenshot.
2. Click `Analyze Screenshot`.
3. Review the extracted details.
4. Copy the generated text.
5. Download or copy detected product images if available.

## Project Structure

```text
.
|-- public/
|   |-- app.js
|   |-- icon.svg
|   |-- index.html
|   |-- manifest.webmanifest
|   |-- styles.css
|   `-- sw.js
|-- server.js
|-- package.json
|-- .env.example
|-- CHANGELOG.md
`-- README.md
```

## Security

Do not commit real API keys. Keep `.env` private and use `.env.example` as the public template.

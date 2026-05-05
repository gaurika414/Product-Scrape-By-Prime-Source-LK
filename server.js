const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const APP_NAME = "Product Scrape By Prime Source LK";
const PORT = Number(process.env.PORT || 3077);
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BODY_BYTES = 48 * 1024 * 1024;

loadDotEnv(path.join(__dirname, ".env"));
loadDotEnv(path.join(__dirname, "apikey.env"));

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

const productSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    source_platform: { type: "string" },
    product_title: { type: "string" },
    brand: { type: "string" },
    store_name: { type: "string" },
    price: { type: "string" },
    original_price: { type: "string" },
    currency: { type: "string" },
    discount: { type: "string" },
    rating: { type: "string" },
    review_count: { type: "string" },
    sold_count: { type: "string" },
    shipping: { type: "string" },
    delivery: { type: "string" },
    returns_policy: { type: "string" },
    stock_status: { type: "string" },
    product_url: { type: "string" },
    visible_description: { type: "string" },
    key_bullets: { type: "array", items: { type: "string" } },
    available_options: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          values: { type: "array", items: { type: "string" } }
        }
      }
    },
    product_specs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          value: { type: "string" }
        }
      }
    },
    image_regions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          x: { type: "integer" },
          y: { type: "integer" },
          width: { type: "integer" },
          height: { type: "integer" }
        }
      }
    },
    social_listing_text: {
      type: "object",
      additionalProperties: false,
      properties: {
        facebook: { type: "string" },
        instagram: { type: "string" },
        tiktok: { type: "string" }
      }
    },
    listing_text: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
    missing_or_unclear: { type: "array", items: { type: "string" } },
    confidence: { type: "string" }
  }
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        app: APP_NAME,
        provider: getAiProvider(),
        model: getActiveModel(),
        hasGeminiKey: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
        hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
        ollamaUrl: process.env.OLLAMA_URL || "http://127.0.0.1:11434"
      });
    }
    if (req.method === "POST" && url.pathname === "/api/analyze") {
      const body = await readJsonBody(req);
      return analyzeScreenshot(res, body);
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      return sendJson(res, 405, { error: "Method not allowed" });
    }
    return serveStatic(req, res, url.pathname);
  } catch (error) {
    return sendJson(res, 500, { error: "Server error", detail: error.message || String(error) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`${APP_NAME} running at http://localhost:${PORT}`);
});

async function analyzeScreenshot(res, body) {
  const imageDataUrls = getRequestImages(body);
  if (!imageDataUrls.length) {
    return sendJson(res, 400, { error: "Invalid image", detail: "Upload a PNG, JPG, JPEG, or WEBP screenshot." });
  }

  if (imageDataUrls.length > 8) {
    return sendJson(res, 400, {
      error: "Too many analysis images",
      detail: "Each screenshot can include one resized original plus up to 7 zoom tiles."
    });
  }

  const provider = getAiProvider(body);
  if (provider === "gemini") return analyzeWithGemini(res, imageDataUrls, body);
  if (provider === "ollama") return analyzeWithOllama(res, imageDataUrls, body);
  if (provider === "openai") return analyzeWithOpenAI(res, imageDataUrls, body);
  return sendJson(res, 400, {
    error: "Invalid AI_PROVIDER",
    detail: "Use AI_PROVIDER=gemini, AI_PROVIDER=ollama, or AI_PROVIDER=openai."
  });
}

async function analyzeWithGemini(res, imageDataUrls, body) {
  const apiKey = getRequestApiKey(body, "gemini") || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return sendJson(res, 500, {
      error: "Missing GEMINI_API_KEY",
      detail: "Paste a Gemini API key in AI Settings or add GEMINI_API_KEY to .env/apikey.env."
    });
  }

  const model = getRequestModel(body, "gemini") || process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const prompt = buildAnalysisPrompt(body);
  const parts = [
    { text: prompt },
    ...imageDataUrls.map((imageDataUrl) => dataUrlToGeminiPart(imageDataUrl))
  ];

  const apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseJsonSchema: productSchema
      }
    })
  });

  const responseText = await apiResponse.text();
  if (!apiResponse.ok) {
    return sendJson(res, apiResponse.status, { error: "Gemini request failed", detail: safeErrorText(responseText) });
  }

  const apiData = JSON.parse(responseText);
  const extracted = parseJsonFromModelText(extractGeminiText(apiData));
  return sendJson(res, 200, {
    ok: true,
    provider: "gemini",
    model,
    analyzedAt: new Date().toISOString(),
    result: normalizeExtraction(extracted)
  });
}

async function analyzeWithOpenAI(res, imageDataUrls, body) {
  const apiKey = getRequestApiKey(body, "openai") || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return sendJson(res, 500, {
      error: "Missing OPENAI_API_KEY",
      detail: "Paste an OpenAI API key in AI Settings, add OPENAI_API_KEY to .env/apikey.env, or switch provider."
    });
  }

  const model = getRequestModel(body, "openai") || process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const prompt = buildAnalysisPrompt(body);
  const imageContent = imageDataUrls.map((imageUrl, index) => ({
    type: "input_image",
    image_url: imageUrl,
    detail: index === 0 ? "high" : "auto"
  }));

  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            ...imageContent
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "product_screenshot_extraction",
          schema: productSchema
        }
      }
    })
  });

  const responseText = await apiResponse.text();
  if (!apiResponse.ok) {
    return sendJson(res, apiResponse.status, { error: "OpenAI request failed", detail: safeErrorText(responseText) });
  }

  const apiData = JSON.parse(responseText);
  const extracted = parseJsonFromModelText(extractOutputText(apiData));
  return sendJson(res, 200, {
    ok: true,
    provider: "openai",
    model,
    analyzedAt: new Date().toISOString(),
    result: normalizeExtraction(extracted)
  });
}

async function analyzeWithOllama(res, imageDataUrls, body) {
  const model = getRequestModel(body, "ollama") || process.env.OLLAMA_MODEL || "llama3.2-vision";
  const ollamaUrl = String((body && body.ollamaUrl) || process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const base64Images = imageDataUrls.map((imageDataUrl) => imageDataUrl.replace(/^data:image\/(png|jpe?g|webp);base64,/i, ""));
  const prompt = buildAnalysisPrompt(body);

  let apiResponse;
  try {
    apiResponse = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        images: base64Images,
        stream: false,
        format: productSchema,
        options: { temperature: 0.1 }
      })
    });
  } catch {
    return sendJson(res, 503, {
      error: "Ollama is not running",
      detail: `Start Ollama and run: ollama pull ${model}`
    });
  }

  const responseText = await apiResponse.text();
  if (!apiResponse.ok) {
    return sendJson(res, apiResponse.status, { error: "Ollama request failed", detail: safeErrorText(responseText) });
  }

  const apiData = JSON.parse(responseText);
  const extracted = parseJsonFromModelText(apiData.response || "");
  return sendJson(res, 200, {
    ok: true,
    provider: "ollama",
    model,
    analyzedAt: new Date().toISOString(),
    result: normalizeExtraction(extracted)
  });
}

function getAiProvider(body) {
  return String((body && body.provider) || process.env.AI_PROVIDER || "gemini").trim().toLowerCase();
}

function getRequestImages(body) {
  const input = Array.isArray(body && body.imageDataUrls)
    ? body.imageDataUrls
    : [body && body.imageDataUrl];

  return input
    .map((value) => String(value || ""))
    .filter((value) => /^data:image\/(png|jpe?g|webp);base64,/i.test(value));
}

function buildAnalysisPrompt(body) {
  const tileNotes = Array.isArray(body && body.tileNotes) ? body.tileNotes : [];
  const tileText = tileNotes.length
    ? ` Additional images after the first are zoomed vertical tiles from the same screenshot for OCR. Tile metadata: ${JSON.stringify(tileNotes).slice(0, 4000)}. Use the first full screenshot as the overall product-page context.`
    : "";

  return [
    "Analyze this full e-commerce product screenshot for resale listing preparation.",
    "Return only valid JSON matching the schema. Do not wrap it in markdown.",
    "Extract every visible product detail exactly as shown.",
    "Use the zoomed tiles to read small text, prices, options, shipping, descriptions, ratings, and reviews.",
    "Do not identify or crop product images. Return image_regions as an empty array.",
    "Create one detailed resale listing in listing_text using tasteful emojis, short lines, and only visible facts.",
    "The listing must include every visible useful field: name/title, price, original price, discount, rating, shipping, delivery, return policy, stock, brand, store, options, specifications, and visible description when available.",
    "Do not create separate Facebook, Instagram, or TikTok sections. Keep social_listing_text values empty.",
    "Do not mention source platform, reviews, sold count, or missing/unclear details in listing_text.",
    "Create 8 to 14 relevant hashtags in hashtags. Put hashtags at the bottom when the app formats the final text.",
    "Do not invent unavailable specifications.",
    tileText
  ].join(" ");
}

function getActiveModel() {
  const provider = getAiProvider();
  if (provider === "openai") return process.env.OPENAI_MODEL || "gpt-4.1-mini";
  if (provider === "ollama") return process.env.OLLAMA_MODEL || "llama3.2-vision";
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

function getRequestApiKey(body, provider) {
  const keys = body && body.apiKeys && typeof body.apiKeys === "object" ? body.apiKeys : {};
  const value = keys[provider] || body && body.apiKey;
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function getRequestModel(body, provider) {
  const models = body && body.models && typeof body.models === "object" ? body.models : {};
  const value = models[provider] || body && body.model;
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function dataUrlToGeminiPart(imageDataUrl) {
  const match = String(imageDataUrl).match(/^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i);
  if (!match) {
    throw new Error("Invalid image data URL.");
  }

  const mimeType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  return {
    inlineData: {
      mimeType,
      data: match[2]
    }
  };
}

function extractGeminiText(apiData) {
  const parts = apiData && apiData.candidates && apiData.candidates[0] && apiData.candidates[0].content
    ? apiData.candidates[0].content.parts || []
    : [];
  return parts.map((part) => part.text || "").join("\n").trim();
}

function stripJsonFences(text) {
  return String(text)
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseJsonFromModelText(text) {
  const stripped = stripJsonFences(text);
  try {
    return JSON.parse(stripped);
  } catch {
    const firstObject = stripped.indexOf("{");
    const lastObject = stripped.lastIndexOf("}");
    if (firstObject !== -1 && lastObject > firstObject) {
      return JSON.parse(stripped.slice(firstObject, lastObject + 1));
    }
    throw new Error("No JSON object found in AI response.");
  }
}

function extractOutputText(apiData) {
  if (typeof apiData.output_text === "string") return apiData.output_text;
  const chunks = [];
  for (const item of apiData.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") chunks.push(content.text);
      if (typeof content.output_text === "string") chunks.push(content.output_text);
    }
  }
  return chunks.join("\n").trim();
}

function normalizeExtraction(result) {
  const normalized = result && typeof result === "object" ? result : {};
  normalized.key_bullets = Array.isArray(normalized.key_bullets) ? normalized.key_bullets : [];
  normalized.available_options = Array.isArray(normalized.available_options) ? normalized.available_options : [];
  normalized.product_specs = Array.isArray(normalized.product_specs) ? normalized.product_specs : [];
  normalized.missing_or_unclear = Array.isArray(normalized.missing_or_unclear) ? normalized.missing_or_unclear : [];
  normalized.image_regions = Array.isArray(normalized.image_regions) ? normalized.image_regions : [];
  normalized.social_listing_text = normalized.social_listing_text && typeof normalized.social_listing_text === "object"
    ? normalized.social_listing_text
    : { facebook: "", instagram: "", tiktok: "" };
  normalized.listing_text = typeof normalized.listing_text === "string" ? normalized.listing_text : "";
  normalized.hashtags = Array.isArray(normalized.hashtags) ? normalized.hashtags : [];
  return normalized;
}

async function serveStatic(req, res, pathname) {
  const cleanPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const requestedPath = path.normalize(path.join(PUBLIC_DIR, cleanPath));
  if (!requestedPath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: "Forbidden" });
  let filePath = requestedPath;
  try {
    const stats = await fs.promises.stat(filePath);
    if (stats.isDirectory()) filePath = path.join(filePath, "index.html");
  } catch {
    filePath = path.join(PUBLIC_DIR, "index.html");
  }
  const ext = path.extname(filePath).toLowerCase();
  const file = await fs.promises.readFile(filePath);
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600"
  });
  if (req.method !== "HEAD") res.end(file);
  else res.end();
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("Upload is too large. Use a screenshot under 20 MB."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function safeErrorText(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed.error ? parsed.error.message || parsed.error : parsed;
  } catch {
    return text.slice(0, 1000);
  }
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

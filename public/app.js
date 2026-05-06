const MAX_FILES = 10;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const state = {
  items: [],
  selectedIndex: 0,
  settings: loadSettings()
};

const els = {
  fileInput: document.querySelector("#fileInput"),
  pasteImageBtn: document.querySelector("#pasteImageBtn"),
  providerSelect: document.querySelector("#providerSelect"),
  modelInput: document.querySelector("#modelInput"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
  apiKeyRow: document.querySelector("#apiKeyRow"),
  ollamaUrlInput: document.querySelector("#ollamaUrlInput"),
  ollamaUrlRow: document.querySelector("#ollamaUrlRow"),
  saveSettingsBtn: document.querySelector("#saveSettingsBtn"),
  dropZone: document.querySelector("#dropZone"),
  previewWrap: document.querySelector("#previewWrap"),
  previewImage: document.querySelector("#previewImage"),
  fileList: document.querySelector("#fileList"),
  analyzeBtn: document.querySelector("#analyzeBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  errorText: document.querySelector("#errorText"),
  toastHost: document.querySelector("#toastHost"),
  emptyState: document.querySelector("#emptyState"),
  resultContent: document.querySelector("#resultContent"),
  copyAllBtn: document.querySelector("#copyAllBtn"),
  copyBatchBtn: document.querySelector("#copyBatchBtn"),
  sourcePlatform: document.querySelector("#sourcePlatform"),
  productTitle: document.querySelector("#productTitle"),
  priceText: document.querySelector("#priceText"),
  detailsGrid: document.querySelector("#detailsGrid"),
  fullTextOutput: document.querySelector("#fullTextOutput")
};

els.fileInput.addEventListener("change", () => setFiles(Array.from(els.fileInput.files || [])));
els.pasteImageBtn.addEventListener("click", pasteImagesFromClipboard);
document.addEventListener("paste", handlePasteEvent);

els.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  els.dropZone.classList.add("is-dragover");
});

els.dropZone.addEventListener("dragleave", () => {
  els.dropZone.classList.remove("is-dragover");
});

els.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  els.dropZone.classList.remove("is-dragover");
  setFiles(Array.from(event.dataTransfer.files || []));
});

els.analyzeBtn.addEventListener("click", analyzeBatch);
els.clearBtn.addEventListener("click", resetApp);
els.copyAllBtn.addEventListener("click", () => copyText(getSelectedText(), "Copied current"));
els.copyBatchBtn.addEventListener("click", () => copyText(buildBatchText(), "Copied batch"));
els.providerSelect.addEventListener("change", () => applyProviderDefaults(false));
els.saveSettingsBtn.addEventListener("click", () => saveSettingsFromForm());

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

applySettingsToForm();

async function setFiles(files) {
  clearError();
  const images = files.filter((file) => file.type.startsWith("image/")).slice(0, MAX_FILES);

  if (!images.length) {
    showError("Please choose image screenshots.");
    return;
  }

  if (files.length > MAX_FILES) {
    showError(`Only the first ${MAX_FILES} screenshots were added.`);
  }

  const nextItems = [];
  for (const file of images) {
    if (file.size > MAX_FILE_BYTES) {
      showError(`${file.name} is over 20 MB and was skipped.`);
      continue;
    }

    nextItems.push({
      file,
      dataUrl: await readAsDataUrl(file),
      aiImages: [],
      tileNotes: [],
      result: null,
      crops: [],
      status: "Ready",
      error: ""
    });
  }

  state.items = nextItems;
  state.selectedIndex = 0;
  renderFileList();
  renderSelectedPreview();
  renderSelectedResult();
  els.analyzeBtn.disabled = state.items.length === 0;
  setBusy(false);
  setStatus("Ready", "ready");
}

async function appendFiles(files) {
  clearError();
  const available = MAX_FILES - state.items.length;
  if (available <= 0) {
    showError(`Maximum ${MAX_FILES} screenshots already added.`);
    return;
  }

  const images = files.filter((file) => file.type.startsWith("image/")).slice(0, available);
  if (!images.length) {
    showError("No image found to paste.");
    return;
  }

  for (const file of images) {
    if (file.size > MAX_FILE_BYTES) {
      showError(`${file.name} is over 20 MB and was skipped.`);
      continue;
    }

    state.items.push({
      file,
      dataUrl: await readAsDataUrl(file),
      aiImages: [],
      tileNotes: [],
      result: null,
      crops: [],
      status: "Ready",
      error: ""
    });
  }

  state.selectedIndex = Math.max(0, state.items.length - images.length);
  renderFileList();
  renderSelectedPreview();
  renderSelectedResult();
  els.analyzeBtn.disabled = state.items.length === 0;
  setBusy(false);
  showToast("Image pasted", "done");
}

async function pasteImagesFromClipboard() {
  try {
    if (!navigator.clipboard || !navigator.clipboard.read) {
      throw new Error("Clipboard image paste is not supported in this browser. Use Ctrl+V after copying an image.");
    }

    const items = await navigator.clipboard.read();
    const files = [];
    for (const item of items) {
      const imageType = item.types.find((type) => type.startsWith("image/"));
      if (!imageType) continue;

      const blob = await item.getType(imageType);
      files.push(new File([blob], `pasted-screenshot-${Date.now()}-${files.length + 1}.png`, { type: imageType }));
    }

    await appendFiles(files);
  } catch (error) {
    showError(error.message || "Could not read image from clipboard.");
  }
}

async function handlePasteEvent(event) {
  const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;

  event.preventDefault();
  await appendFiles(files);
}

async function analyzeBatch() {
  if (!state.items.length) return;

  saveSettingsFromForm(false);
  setBusy(true);
  clearError();

  for (let index = 0; index < state.items.length; index += 1) {
    const item = state.items[index];
    state.selectedIndex = index;
    item.status = "Preparing";
    item.error = "";
    renderFileList();
    renderSelectedPreview();
    renderSelectedResult();
    setStatus(`${index + 1}/${state.items.length}`, "working");

    try {
      const prepared = await prepareImagesForAi(item.dataUrl);
      item.aiImages = prepared.imageDataUrls;
      item.tileNotes = prepared.tileNotes;
      item.status = "Analyzing";
      renderFileList();

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageName: item.file?.name || `screenshot-${index + 1}`,
          imageDataUrls: prepared.imageDataUrls,
          tileNotes: prepared.tileNotes,
          provider: state.settings.provider,
          apiKeys: {
            gemini: state.settings.geminiApiKey,
            openai: state.settings.openaiApiKey
          },
          models: {
            gemini: state.settings.geminiModel,
            openai: state.settings.openaiModel,
            ollama: state.settings.ollamaModel
          },
          ollamaUrl: state.settings.ollamaUrl
        })
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || payload.error || "Analysis failed");

      item.result = payload.result;
      item.status = "Done";
      renderFileList();
      renderSelectedResult();
    } catch (error) {
      item.status = "Error";
      item.error = error.message || String(error);
      renderFileList();
      renderSelectedResult();
      showError(item.error);
    }
  }

  const failed = state.items.filter((item) => item.status === "Error").length;
  setBusy(false);
  setStatus(failed ? `${failed} failed` : "Done", failed ? "error" : "done");
}

function renderFileList() {
  els.fileList.innerHTML = "";

  for (const [index, item] of state.items.entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `file-item${index === state.selectedIndex ? " is-active" : ""}`;
    button.innerHTML = `
      <span>${escapeHtml(item.file.name)}</span>
      <strong>${escapeHtml(item.status)}</strong>
    `;
    button.addEventListener("click", () => {
      state.selectedIndex = index;
      renderFileList();
      renderSelectedPreview();
      renderSelectedResult();
    });
    els.fileList.appendChild(button);
  }
}

function renderSelectedPreview() {
  const item = getSelectedItem();

  if (!item) {
    els.previewImage.removeAttribute("src");
    els.previewWrap.classList.add("is-hidden");
    return;
  }

  els.previewImage.src = item.dataUrl;
  els.previewWrap.classList.remove("is-hidden");
}

function renderSelectedResult() {
  const item = getSelectedItem();

  if (!item || !item.result) {
    els.emptyState.classList.remove("is-hidden");
    els.resultContent.classList.add("is-hidden");
    els.copyAllBtn.disabled = true;
    els.copyBatchBtn.disabled = !state.items.some((batchItem) => batchItem.result);
    return;
  }

  const result = item.result || {};
  els.emptyState.classList.add("is-hidden");
  els.resultContent.classList.remove("is-hidden");
  els.copyAllBtn.disabled = false;
  els.copyBatchBtn.disabled = !state.items.some((batchItem) => batchItem.result);
  els.sourcePlatform.textContent = "Listing";
  els.productTitle.textContent = result.product_title || "Untitled product";
  els.priceText.textContent = compactJoin([result.currency, result.price]) || result.original_price || "";

  const detailItems = [
    ["File", item.file.name],
    ["Brand", result.brand],
    ["Store", result.store_name],
    ["Price", result.original_price],
    ["Discount", result.discount],
    ["Rating", result.rating],
    ["Shipping", result.shipping],
    ["Delivery", result.delivery],
    ["Returns", result.returns_policy],
    ["Stock", result.stock_status]
  ].filter(([, value]) => hasText(value));

  const specText = (result.product_specs || []).map((spec) => `${spec.name}: ${spec.value}`).join("\n");
  if (specText) detailItems.push(["Specs", specText]);

  els.detailsGrid.innerHTML = detailItems.map(([label, value]) => `
    <div class="detail-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");

  els.fullTextOutput.value = buildFullText(result);
}

async function prepareImagesForAi(dataUrl) {
  const image = await loadImage(dataUrl);
  const imageDataUrls = [resizeImage(image, 1200, 2600, "image/jpeg", 0.86)];
  const tileNotes = [];

  if (image.naturalHeight > 1500 || image.naturalHeight / image.naturalWidth > 2.1) {
    const maxTiles = 7;
    const tileHeight = Math.min(image.naturalHeight, Math.max(950, Math.round(image.naturalWidth * 1.55)));
    const overlap = Math.round(tileHeight * 0.16);
    let y = 0;
    let tileNumber = 1;

    while (y < image.naturalHeight && tileNumber <= maxTiles) {
      const height = Math.min(tileHeight, image.naturalHeight - y);
      if (height < 260) break;

      imageDataUrls.push(cropToDataUrl(image, 0, y, image.naturalWidth, height, 1200, "image/jpeg", 0.9));
      tileNotes.push({
        image_index: imageDataUrls.length,
        label: `vertical tile ${tileNumber}`,
        y_start_percent: Math.round((y / image.naturalHeight) * 100),
        y_end_percent: Math.round(((y + height) / image.naturalHeight) * 100)
      });

      if (y + height >= image.naturalHeight) break;
      y += tileHeight - overlap;
      tileNumber += 1;
    }
  }

  return { imageDataUrls, tileNotes };
}

function resizeImage(image, maxWidth, maxHeight, mimeType, quality) {
  const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL(mimeType, quality);
}

function cropToDataUrl(image, x, y, width, height, maxWidth, mimeType, quality) {
  const scale = Math.min(1, maxWidth / width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(mimeType, quality);
}

async function cropProductImages(dataUrl, regions) {
  const image = await loadImage(dataUrl);
  const crops = [];
  const seen = new Set();

  for (const [index, region] of regions.entries()) {
    const sourceX = Math.round((Number(region.x) / 1000) * image.naturalWidth);
    const sourceY = Math.round((Number(region.y) / 1000) * image.naturalHeight);
    const sourceW = Math.round((Number(region.width) / 1000) * image.naturalWidth);
    const sourceH = Math.round((Number(region.height) / 1000) * image.naturalHeight);
    const box = constrainBox(sourceX, sourceY, sourceW, sourceH, image.naturalWidth, image.naturalHeight);
    const key = `${Math.round(box.x / 10)}-${Math.round(box.y / 10)}-${Math.round(box.w / 10)}-${Math.round(box.h / 10)}`;

    if (seen.has(key) || box.w < 40 || box.h < 40) continue;
    seen.add(key);
    crops.push(makeCrop(image, box, region.label || `Product image ${index + 1}`, index + 1));
  }

  return crops;
}

async function detectVisualCrops(dataUrl) {
  const image = await loadImage(dataUrl);
  const scanWidth = 260;
  const scale = scanWidth / image.naturalWidth;
  const scanHeight = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = scanWidth;
  canvas.height = scanHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, scanWidth, scanHeight);
  const { data } = ctx.getImageData(0, 0, scanWidth, scanHeight);
  const mask = new Uint8Array(scanWidth * scanHeight);

  for (let y = 0; y < scanHeight; y += 1) {
    for (let x = 0; x < scanWidth; x += 1) {
      const index = (y * scanWidth + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const chroma = max - min;
      const dark = max < 86;
      const colorful = chroma > 24 && max > 70;
      const midTone = max > 80 && max < 238 && min < 225;

      if ((colorful || midTone || dark) && !(r > 235 && g > 235 && b > 235)) {
        mask[y * scanWidth + x] = 1;
      }
    }
  }

  const components = connectedComponents(mask, scanWidth, scanHeight)
    .map((box) => ({
      x: Math.max(0, Math.round(box.x / scale) - 12),
      y: Math.max(0, Math.round(box.y / scale) - 12),
      w: Math.min(image.naturalWidth, Math.round(box.w / scale) + 24),
      h: Math.min(image.naturalHeight, Math.round(box.h / scale) + 24),
      area: box.w * box.h
    }))
    .filter((box) => {
      const areaRatio = (box.w * box.h) / (image.naturalWidth * image.naturalHeight);
      const aspect = box.w / box.h;
      return box.w > 70 && box.h > 70 && areaRatio > 0.008 && areaRatio < 0.45 && aspect > 0.22 && aspect < 4.2;
    })
    .sort((a, b) => b.area - a.area)
    .slice(0, 8);

  return components.map((box, index) => makeCrop(image, box, `Detected product image ${index + 1}`, index + 1));
}

function connectedComponents(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const boxes = [];
  const queue = [];
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let count = 0;
    queue.length = 0;
    queue.push(start);
    visited[start] = 1;

    while (queue.length) {
      const current = queue.pop();
      const x = current % width;
      const y = Math.floor(current / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      count += 1;

      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

        const next = ny * width + nx;
        if (mask[next] && !visited[next]) {
          visited[next] = 1;
          queue.push(next);
        }
      }
    }

    if (count > 80) {
      boxes.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
    }
  }

  return mergeNearbyBoxes(boxes, width, height);
}

function mergeNearbyBoxes(boxes, width, height) {
  const expanded = boxes.map((box) => ({
    x: Math.max(0, box.x - 4),
    y: Math.max(0, box.y - 4),
    w: Math.min(width - box.x, box.w + 8),
    h: Math.min(height - box.y, box.h + 8)
  }));

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < expanded.length; i += 1) {
      for (let j = i + 1; j < expanded.length; j += 1) {
        if (!boxesOverlap(expanded[i], expanded[j])) continue;

        expanded[i] = unionBox(expanded[i], expanded[j]);
        expanded.splice(j, 1);
        changed = true;
        break;
      }
      if (changed) break;
    }
  }

  return expanded;
}

function boxesOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function unionBox(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.w, b.x + b.w);
  const bottom = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: right - x, h: bottom - y };
}

function makeCrop(image, box, label, index) {
  const safeBox = constrainBox(box.x, box.y, box.w, box.h, image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = safeBox.w;
  canvas.height = safeBox.h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, safeBox.x, safeBox.y, safeBox.w, safeBox.h, 0, 0, safeBox.w, safeBox.h);

  return {
    label,
    dataUrl: canvas.toDataURL("image/png"),
    filename: `${slugify(label || "product-image")}-${index}.png`
  };
}

function constrainBox(x, y, w, h, imageW, imageH) {
  const pad = 4;
  const nextX = Math.max(0, x - pad);
  const nextY = Math.max(0, y - pad);
  const maxW = imageW - nextX;
  const maxH = imageH - nextY;

  return {
    x: nextX,
    y: nextY,
    w: Math.max(1, Math.min(maxW, w + pad * 2)),
    h: Math.max(1, Math.min(maxH, h + pad * 2))
  };
}

function buildFullText(result) {
  const lines = buildDetailedListing(result);
  const hashtags = normalizeHashtags(result.hashtags, result);

  if (hashtags.length) {
    lines.push("", hashtags.join(" "));
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildDetailedListing(result) {
  const lines = [];
  lines.push(`✨ ${result.product_title || "New arrival"}`);

  const price = compactJoin([result.currency, result.price]);
  const highlights = [];
  if (price) highlights.push(`💰 Discounted Price: ${price}`);
  if (result.original_price) highlights.push(`🏷️ Price: ${result.original_price}`);
  if (result.discount) highlights.push(`🔥 Discount: ${result.discount}`);
  if (result.rating) highlights.push(`⭐ Rating: ${result.rating}`);
  if (result.shipping) highlights.push(`🚚 Shipping: ${result.shipping}`);
  if (result.delivery) highlights.push(`📦 Delivery: ${result.delivery}`);
  if (result.returns_policy) highlights.push(`↩️ Returns: ${result.returns_policy}`);
  if (result.stock_status) highlights.push(`📌 Stock: ${result.stock_status}`);
  if (result.brand) highlights.push(`🏷️ Brand: ${result.brand}`);
  if (result.store_name) highlights.push(`🏪 Store: ${result.store_name}`);

  if (highlights.length) {
    lines.push("");
    lines.push(...highlights);
  }

  const optionLines = (result.available_options || [])
    .filter((option) => hasText(option.name) || option.values?.length)
    .map((option) => `• ${option.name || "Option"}: ${(option.values || []).join(", ")}`);
  if (optionLines.length) {
    lines.push("", "🎨 Available Options:", ...optionLines);
  }

  const specLines = (result.product_specs || [])
    .filter((spec) => hasText(spec.name) || hasText(spec.value))
    .map((spec) => `• ${spec.name || "Spec"}: ${spec.value || ""}`.trim());
  if (specLines.length) {
    lines.push("", "📋 Product Specs:", ...specLines);
  }

  if (result.visible_description) {
    lines.push("", "📝 Details:", result.visible_description);
  }

  if (result.key_bullets?.length) {
    lines.push("", "✅ Highlights:");
    result.key_bullets.slice(0, 5).forEach((item) => lines.push(`• ${item}`));
  }

  return lines;
}

function normalizeHashtags(hashtags, result = {}) {
  const source = Array.isArray(hashtags) ? hashtags : [];
  const normalized = source
    .map((tag) => String(tag || "").trim())
    .filter(Boolean)
    .map((tag) => tag.startsWith("#") ? tag : `#${tag.replace(/\s+/g, "")}`)
    .slice(0, 16);
  if (normalized.length) return normalized;

  const words = [
    "PrimeSourceLK",
    "SriLanka",
    "OnlineShopping",
    result.brand,
    result.store_name,
    ...String(result.product_title || "").split(/\s+/).filter((word) => word.length > 3).slice(0, 5)
  ];

  return [...new Set(words)]
    .filter(Boolean)
    .map((word) => `#${String(word).replace(/[^a-z0-9]/gi, "")}`)
    .filter((tag) => tag.length > 1)
    .slice(0, 12);
}

function buildBatchText() {
  return state.items
    .filter((item) => item.result)
    .map((item, index) => `Product ${index + 1}: ${item.file.name}\n\n${buildFullText(item.result)}`)
    .join("\n\n------------------------------\n\n");
}

function getSelectedText() {
  const item = getSelectedItem();
  return item?.result ? buildFullText(item.result) : "";
}

function addLine(lines, label, value) {
  if (hasText(value)) lines.push(`${label}: ${value}`);
}

function hasText(value) {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function compactJoin(values) {
  return values.filter(hasText).join(" ").trim();
}

function getSelectedItem() {
  return state.items[state.selectedIndex] || null;
}

function setBusy(isBusy) {
  els.analyzeBtn.disabled = isBusy || !state.items.length;
  els.analyzeBtn.textContent = isBusy
    ? "Analyzing Batch..."
    : `Analyze ${state.items.length || ""} Screenshot${state.items.length === 1 ? "" : "s"}`.trim();
  els.analyzeBtn.classList.toggle("is-busy", isBusy);
  els.clearBtn.disabled = isBusy;
}

function setStatus(text, mode) {
  if (mode === "ready" || text === "Ready") return;
  showToast(text, mode);
}

function showError(message) {
  const clean = sanitizeMessage(message);
  els.errorText.textContent = clean;
  showToast(clean, "error");
}

function clearError() {
  els.errorText.textContent = "";
}

function showToast(message, mode = "done") {
  if (!els.toastHost) return;

  const toast = document.createElement("div");
  toast.className = `toast is-${mode}`;
  toast.textContent = message;
  els.toastHost.appendChild(toast);

  const lifetime = mode === "working" ? 1800 : 2600;
  window.setTimeout(() => {
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 190);
  }, lifetime);
}

function sanitizeMessage(message) {
  const text = String(message || "Something went wrong.").trim();
  if (text.startsWith("{") || text.length > 260) {
    return "The AI response could not be formatted. Try analyzing again or use one screenshot at a time.";
  }
  return text;
}

function resetApp() {
  state.items = [];
  state.selectedIndex = 0;
  els.fileInput.value = "";
  els.fileList.innerHTML = "";
  els.previewImage.removeAttribute("src");
  els.previewWrap.classList.add("is-hidden");
  els.analyzeBtn.disabled = true;
  els.analyzeBtn.textContent = "Analyze Screenshots";
  els.analyzeBtn.classList.remove("is-busy");
  els.emptyState.classList.remove("is-hidden");
  els.resultContent.classList.add("is-hidden");
  els.copyAllBtn.disabled = true;
  els.copyBatchBtn.disabled = true;
  clearError();
  setStatus("Ready", "ready");
}

function loadSettings() {
  const defaults = {
    provider: "gemini",
    geminiModel: "gemini-2.5-flash",
    openaiModel: "gpt-4.1-mini",
    ollamaModel: "llama3.2-vision",
    ollamaUrl: "http://127.0.0.1:11434",
    geminiApiKey: "",
    openaiApiKey: ""
  };

  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem("productScrapeAiSettings") || "{}") };
  } catch {
    return defaults;
  }
}

function applySettingsToForm() {
  els.providerSelect.value = state.settings.provider || "gemini";
  applyProviderDefaults(true);
}

function applyProviderDefaults(keepExistingModel) {
  const provider = els.providerSelect.value;
  state.settings.provider = provider;
  els.apiKeyRow.classList.toggle("is-hidden", provider === "ollama");
  els.ollamaUrlRow.classList.toggle("is-hidden", provider !== "ollama");

  if (provider === "gemini") {
    els.modelInput.value = keepExistingModel ? state.settings.geminiModel : "gemini-2.5-flash";
    els.apiKeyInput.value = state.settings.geminiApiKey || "";
    els.apiKeyInput.placeholder = "Paste Gemini API key";
  } else if (provider === "openai") {
    els.modelInput.value = keepExistingModel ? state.settings.openaiModel : "gpt-4.1-mini";
    els.apiKeyInput.value = state.settings.openaiApiKey || "";
    els.apiKeyInput.placeholder = "Paste OpenAI API key";
  } else {
    els.modelInput.value = keepExistingModel ? state.settings.ollamaModel : "llama3.2-vision";
    els.ollamaUrlInput.value = state.settings.ollamaUrl || "http://127.0.0.1:11434";
  }
}

function saveSettingsFromForm(showSaved = true) {
  const provider = els.providerSelect.value;
  state.settings.provider = provider;

  if (provider === "gemini") {
    state.settings.geminiModel = els.modelInput.value.trim() || "gemini-2.5-flash";
    state.settings.geminiApiKey = els.apiKeyInput.value.trim();
  } else if (provider === "openai") {
    state.settings.openaiModel = els.modelInput.value.trim() || "gpt-4.1-mini";
    state.settings.openaiApiKey = els.apiKeyInput.value.trim();
  } else {
    state.settings.ollamaModel = els.modelInput.value.trim() || "llama3.2-vision";
    state.settings.ollamaUrl = els.ollamaUrlInput.value.trim() || "http://127.0.0.1:11434";
  }

  localStorage.setItem("productScrapeAiSettings", JSON.stringify(state.settings));
  if (showSaved) setStatus("Settings saved", "done");
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function copyText(text, status = "Copied") {
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    els.fullTextOutput.focus();
    els.fullTextOutput.select();
    document.execCommand("copy");
  }

  setStatus(status, "done");
}

async function copyImage(crop) {
  try {
    if (!navigator.clipboard || !window.ClipboardItem) {
      throw new Error("Image clipboard is not supported in this browser.");
    }

    const blob = await (await fetch(crop.dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    setStatus("Image copied", "done");
  } catch {
    downloadDataUrl(crop.dataUrl, crop.filename);
    setStatus("Downloaded", "done");
  }
}

function downloadAllImages() {
  const item = getSelectedItem();
  if (!item) return;

  item.crops.forEach((crop, index) => {
    window.setTimeout(() => downloadDataUrl(crop.dataUrl, crop.filename), index * 160);
  });
}

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "product-image";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

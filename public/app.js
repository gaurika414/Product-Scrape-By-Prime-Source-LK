const state = {
  file: null,
  imageDataUrl: "",
  result: null,
  crops: []
};

const els = {
  fileInput: document.querySelector("#fileInput"),
  dropZone: document.querySelector("#dropZone"),
  previewWrap: document.querySelector("#previewWrap"),
  previewImage: document.querySelector("#previewImage"),
  analyzeBtn: document.querySelector("#analyzeBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  errorText: document.querySelector("#errorText"),
  statusPill: document.querySelector("#statusPill"),
  emptyState: document.querySelector("#emptyState"),
  resultContent: document.querySelector("#resultContent"),
  copyAllBtn: document.querySelector("#copyAllBtn"),
  sourcePlatform: document.querySelector("#sourcePlatform"),
  productTitle: document.querySelector("#productTitle"),
  priceText: document.querySelector("#priceText"),
  detailsGrid: document.querySelector("#detailsGrid"),
  fullTextOutput: document.querySelector("#fullTextOutput"),
  imageGrid: document.querySelector("#imageGrid"),
  downloadAllBtn: document.querySelector("#downloadAllBtn")
};

els.fileInput.addEventListener("change", () => {
  const [file] = els.fileInput.files || [];
  if (file) setFile(file);
});

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
  const [file] = event.dataTransfer.files || [];
  if (file) setFile(file);
});

els.analyzeBtn.addEventListener("click", analyzeScreenshot);
els.clearBtn.addEventListener("click", resetApp);
els.copyAllBtn.addEventListener("click", () => copyText(els.fullTextOutput.value, "Copied"));
els.downloadAllBtn.addEventListener("click", downloadAllImages);

document.querySelectorAll("[data-caption]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.getAttribute("data-caption");
    const text = state.result?.social_listing_text?.[key] || "";
    copyText(text, `Copied ${key}`);
  });
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

async function setFile(file) {
  clearError();
  if (!file.type.startsWith("image/")) {
    showError("Please choose an image screenshot.");
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showError("Use a screenshot under 20 MB.");
    return;
  }
  state.file = file;
  state.imageDataUrl = await readAsDataUrl(file);
  state.result = null;
  state.crops = [];
  els.previewImage.src = state.imageDataUrl;
  els.previewWrap.classList.remove("is-hidden");
  els.analyzeBtn.disabled = false;
  setStatus("Ready", "ready");
}

async function analyzeScreenshot() {
  if (!state.imageDataUrl) return;
  setBusy(true);
  clearError();
  setStatus("Analyzing", "working");
  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageName: state.file?.name || "screenshot",
        imageDataUrl: state.imageDataUrl
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || payload.error || "Analysis failed");
    state.result = payload.result;
    state.crops = await cropProductImages(state.imageDataUrl, state.result.image_regions || []);
    renderResult();
    setStatus("Done", "done");
  } catch (error) {
    showError(error.message || String(error));
    setStatus("Error", "error");
  } finally {
    setBusy(false);
  }
}

function renderResult() {
  const result = state.result || {};
  els.emptyState.classList.add("is-hidden");
  els.resultContent.classList.remove("is-hidden");
  els.copyAllBtn.disabled = false;
  els.sourcePlatform.textContent = result.source_platform || "Unknown source";
  els.productTitle.textContent = result.product_title || "Untitled product";
  els.priceText.textContent = compactJoin([result.currency, result.price]) || result.original_price || "";

  const detailItems = [
    ["Brand", result.brand],
    ["Store", result.store_name],
    ["Original price", result.original_price],
    ["Discount", result.discount],
    ["Rating", result.rating],
    ["Reviews", result.review_count],
    ["Sold", result.sold_count],
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
  renderImages();
}

function renderImages() {
  els.imageGrid.innerHTML = "";
  els.downloadAllBtn.disabled = state.crops.length === 0;
  if (!state.crops.length) {
    els.imageGrid.innerHTML = `
      <div class="detail-item">
        <span>Images</span>
        <strong>No clear product image crops were detected in this screenshot.</strong>
      </div>
    `;
    return;
  }
  for (const crop of state.crops) {
    const card = document.createElement("article");
    card.className = "image-card";
    card.innerHTML = `
      <img src="${crop.dataUrl}" alt="${escapeHtml(crop.label)}">
      <div class="image-card-body">
        <strong>${escapeHtml(crop.label)}</strong>
        <div class="image-actions">
          <button class="small-button" type="button" data-action="copy">Copy</button>
          <button class="small-button" type="button" data-action="download">Download</button>
        </div>
      </div>
    `;
    card.querySelector('[data-action="copy"]').addEventListener("click", () => copyImage(crop));
    card.querySelector('[data-action="download"]').addEventListener("click", () => downloadDataUrl(crop.dataUrl, crop.filename));
    els.imageGrid.appendChild(card);
  }
}

async function cropProductImages(dataUrl, regions) {
  const image = await loadImage(dataUrl);
  const crops = [];
  for (const [index, region] of regions.entries()) {
    const sourceX = Math.round((Number(region.x) / 1000) * image.naturalWidth);
    const sourceY = Math.round((Number(region.y) / 1000) * image.naturalHeight);
    const sourceW = Math.round((Number(region.width) / 1000) * image.naturalWidth);
    const sourceH = Math.round((Number(region.height) / 1000) * image.naturalHeight);
    if (sourceW < 40 || sourceH < 40) continue;
    const canvas = document.createElement("canvas");
    canvas.width = sourceW;
    canvas.height = sourceH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, sourceX, sourceY, sourceW, sourceH, 0, 0, sourceW, sourceH);
    const label = region.label || `Product image ${index + 1}`;
    crops.push({
      label,
      dataUrl: canvas.toDataURL("image/png"),
      filename: `${slugify(label)}-${index + 1}.png`
    });
  }
  return crops;
}

function buildFullText(result) {
  const lines = [];
  lines.push(result.product_title || "Untitled product", "");
  addLine(lines, "Source", result.source_platform);
  addLine(lines, "Brand", result.brand);
  addLine(lines, "Store", result.store_name);
  addLine(lines, "Price", compactJoin([result.currency, result.price]));
  addLine(lines, "Original Price", result.original_price);
  addLine(lines, "Discount", result.discount);
  addLine(lines, "Rating", result.rating);
  addLine(lines, "Reviews", result.review_count);
  addLine(lines, "Sold", result.sold_count);
  addLine(lines, "Shipping", result.shipping);
  addLine(lines, "Delivery", result.delivery);
  addLine(lines, "Returns", result.returns_policy);
  addLine(lines, "Stock", result.stock_status);
  if (hasText(result.visible_description)) lines.push("", "Description:", result.visible_description);
  if (result.key_bullets?.length) {
    lines.push("", "Key Details:");
    result.key_bullets.forEach((item) => lines.push(`- ${item}`));
  }
  if (result.product_specs?.length) {
    lines.push("", "Specifications:");
    result.product_specs.forEach((spec) => lines.push(`- ${spec.name}: ${spec.value}`));
  }
  if (result.social_listing_text) {
    lines.push("", "Facebook:", result.social_listing_text.facebook || "");
    lines.push("", "Instagram:", result.social_listing_text.instagram || "");
    lines.push("", "TikTok:", result.social_listing_text.tiktok || "");
  }
  if (result.missing_or_unclear?.length) {
    lines.push("", "Missing or unclear:");
    result.missing_or_unclear.forEach((item) => lines.push(`- ${item}`));
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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

function setBusy(isBusy) {
  els.analyzeBtn.disabled = isBusy || !state.imageDataUrl;
  els.analyzeBtn.textContent = isBusy ? "Analyzing..." : "Analyze Screenshot";
}

function setStatus(text) {
  els.statusPill.textContent = text;
}

function showError(message) {
  els.errorText.textContent = message;
}

function clearError() {
  els.errorText.textContent = "";
}

function resetApp() {
  state.file = null;
  state.imageDataUrl = "";
  state.result = null;
  state.crops = [];
  els.fileInput.value = "";
  els.previewImage.removeAttribute("src");
  els.previewWrap.classList.add("is-hidden");
  els.analyzeBtn.disabled = true;
  els.emptyState.classList.remove("is-hidden");
  els.resultContent.classList.add("is-hidden");
  els.copyAllBtn.disabled = true;
  clearError();
  setStatus("Ready");
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
  await navigator.clipboard.writeText(text);
  setStatus(status);
}

async function copyImage(crop) {
  try {
    const blob = await (await fetch(crop.dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    setStatus("Image copied");
  } catch {
    downloadDataUrl(crop.dataUrl, crop.filename);
    setStatus("Downloaded");
  }
}

function downloadAllImages() {
  state.crops.forEach((crop, index) => {
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

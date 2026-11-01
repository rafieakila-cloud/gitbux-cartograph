const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const CONTINENT_COLORS = {
  Africa: ["#d9e8c8", "#cfdfbd", "#e0ebd0"],
  Asia: ["#f0dfb8", "#ead8ad", "#f4e7c7"],
  Europe: ["#cddfe7", "#c5d9e2", "#d8e6eb"],
  "North America": ["#d9dded", "#cfd5e8", "#e2e4f0"],
  "South America": ["#efd5c2", "#e8cbb8", "#f3dfd1"],
  Oceania: ["#d3e4d7", "#c9ddcf", "#deeadf"],
  Antarctica: ["#e8e6dc"],
};
const DEFAULT_COUNTRY_COLORS = ["#dce4cf", "#e9dec6", "#d0e0df"];
const DATA_URL = "./data/ne_50m_admin_0_countries.geojson";
const countryNameDisplay = new Intl.DisplayNames(["id"], { type: "region" });

const canvas = document.querySelector("#mapCanvas");
const context = canvas.getContext("2d", { alpha: false });
const statusElement = document.querySelector("#mapStatus");
const zoomElement = document.querySelector("#zoomLevel");
const toastElement = document.querySelector("#coordinateToast");

if (!context) {
  throw new Error("Browser ini tidak menyediakan Canvas 2D.");
}

const state = {
  center: { x: 180, y: 90 },
  zoom: MIN_ZOOM,
  zoomTarget: MIN_ZOOM,
  zoomAnchor: null,
  width: 0,
  height: 0,
  dpr: 1,
  dragging: false,
  pointerId: null,
  pointerStart: null,
  lastPointer: null,
  moved: false,
  toastTimeout: null,
};

let countries = [];
let renderRequested = false;
let zoomFrame = null;

function normalizeLongitude(longitude) {
  return ((longitude % 360) + 360) % 360;
}

function mapScale(zoom = state.zoom) {
  return Math.min(state.width / 360, state.height / 180) * zoom;
}

function unwrapRing(coordinates) {
  const points = [];
  let previousLongitude = coordinates[0][0];

  for (const [longitude, latitude] of coordinates) {
    let unwrappedLongitude = longitude;
    while (unwrappedLongitude - previousLongitude > 180) unwrappedLongitude -= 360;
    while (unwrappedLongitude - previousLongitude < -180) unwrappedLongitude += 360;
    points.push({ x: unwrappedLongitude + 180, y: 90 - latitude });
    previousLongitude = unwrappedLongitude;
  }

  return points;
}

function polygonRings(coordinates) {
  const outer = unwrapRing(coordinates[0]);
  const outerCenter = (Math.min(...outer.map((point) => point.x))
    + Math.max(...outer.map((point) => point.x))) / 2;

  return coordinates.map((ring, index) => {
    const points = index === 0 ? outer : unwrapRing(ring);
    if (index === 0) return points;

    const ringCenter = (Math.min(...points.map((point) => point.x))
      + Math.max(...points.map((point) => point.x))) / 2;
    const alignment = Math.round((outerCenter - ringCenter) / 360) * 360;
    return points.map((point) => ({ x: point.x + alignment, y: point.y }));
  });
}

function buildCountryPath(geometry) {
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;
  const path = new Path2D();

  for (const polygon of polygons) {
    for (const ring of polygonRings(polygon)) {
      ring.forEach((point, index) => {
        if (index === 0) path.moveTo(point.x, point.y);
        else path.lineTo(point.x, point.y);
      });
      path.closePath();
    }
  }

  return path;
}

function buildCountries(geojson) {
  return geojson.features.map((feature, index) => {
    const properties = feature.properties;
    const countryCode = properties.ISO_A2_EH;
    const localizedName = /^[A-Z]{2}$/.test(countryCode || "")
      ? countryNameDisplay.of(countryCode)
      : undefined;
    const label = countryCode === "CN"
      ? "China"
      : localizedName && localizedName !== countryCode
        ? localizedName
        : properties.NAME_ID || properties.NAME_EN || properties.ADMIN;

    return {
      label,
      labelRank: Number(properties.LABELRANK),
      labelX: Number(properties.LABEL_X) + 180,
      labelY: 90 - Number(properties.LABEL_Y),
      continent: properties.CONTINENT,
      colorIndex: index % 3,
      path: buildCountryPath(feature.geometry),
    };
  });
}

async function loadMapData() {
  statusElement.textContent = "Memuat batas wilayah…";

  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const geojson = await response.json();
    if (!Array.isArray(geojson.features) || geojson.features.length === 0) {
      throw new Error("Data batas wilayah kosong atau tidak valid.");
    }

    countries = buildCountries(geojson);
    statusElement.textContent = `Peta siap · ${countries.length} negara/wilayah`;
    requestRender();
  } catch (error) {
    statusElement.textContent = "Data peta gagal dimuat. Jalankan lewat server lokal dan coba lagi.";
    console.error("Gagal memuat data Natural Earth:", error);
  }
}

function requestRender() {
  if (renderRequested) return;
  renderRequested = true;
  requestAnimationFrame(() => {
    renderRequested = false;
    render();
  });
}

function drawGraticule(scale, copies) {
  context.beginPath();
  context.strokeStyle = "#b8ceca";
  context.lineWidth = 0.55;

  for (let copy = -copies; copy <= copies; copy += 1) {
    for (let longitude = -180; longitude <= 180; longitude += 30) {
      const x = state.width / 2
        + (longitude + 180 + copy * 360 - state.center.x) * scale;
      context.moveTo(x, 0);
      context.lineTo(x, state.height);
    }

    for (let latitude = -60; latitude <= 60; latitude += 30) {
      const y = state.height / 2 + (90 - latitude - state.center.y) * scale;
      context.moveTo(0, y);
      context.lineTo(state.width, y);
    }
  }

  context.stroke();
}

function drawCountry(country, scale, copies) {
  const palette = CONTINENT_COLORS[country.continent] || DEFAULT_COUNTRY_COLORS;

  for (let copy = -copies; copy <= copies; copy += 1) {
    context.save();
    context.translate(copy * 360, 0);
    context.fillStyle = palette[country.colorIndex % palette.length];
    context.strokeStyle = "#738781";
    context.lineWidth = Math.max(0.35, 0.62 * state.zoom ** -0.5) / scale;
    context.lineJoin = "round";
    context.fill(country.path, "evenodd");
    context.stroke(country.path);
    context.restore();
  }
}

function drawCountryLabels(scale, copies) {
  const maxRank = Math.min(10, Math.floor(2 + state.zoom * 1.7));
  const candidates = [];

  for (const country of countries) {
    if (!country.label || country.labelRank > maxRank) continue;

    for (let copy = -copies; copy <= copies; copy += 1) {
      const x = state.width / 2 + (country.labelX + copy * 360 - state.center.x) * scale;
      const y = state.height / 2 + (country.labelY - state.center.y) * scale;
      if (x < 0 || x > state.width || y < 0 || y > state.height) continue;
      candidates.push({ label: country.label, rank: country.labelRank, x, y });
    }
  }

  candidates.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
  context.font = "600 10px Inter, 'Segoe UI', Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";

  const placed = [
    { left: 16, right: state.width - 16, top: 16, bottom: 82 },
    { left: state.width - 74, right: state.width - 6, top: state.height / 2 - 90, bottom: state.height / 2 + 90 },
    { left: state.width * 0.3, right: state.width * 0.7, top: state.height - 70, bottom: state.height - 35 },
    { left: state.width - 390, right: state.width - 8, top: state.height - 38, bottom: state.height - 5 },
  ];
  for (const candidate of candidates) {
    const textWidth = context.measureText(candidate.label).width;
    const bounds = {
      left: candidate.x - textWidth / 2 - 3,
      right: candidate.x + textWidth / 2 + 3,
      top: candidate.y - 7,
      bottom: candidate.y + 7,
    };
    if (bounds.left < 0 || bounds.right > state.width || bounds.top < 0 || bounds.bottom > state.height) continue;
    if (placed.some((other) => bounds.left < other.right
      && bounds.right > other.left
      && bounds.top < other.bottom
      && bounds.bottom > other.top)) {
      continue;
    }

    context.strokeStyle = "#f7f5ea";
    context.lineWidth = 3;
    context.strokeText(candidate.label, candidate.x, candidate.y);
    context.fillStyle = "#263b36";
    context.fillText(candidate.label, candidate.x, candidate.y);
    placed.push(bounds);
  }
}

function render() {
  if (!state.width || !state.height) return;

  context.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  context.fillStyle = "#e3efec";
  context.fillRect(0, 0, state.width, state.height);

  if (!countries.length) return;

  const scale = mapScale();
  const copies = Math.ceil(state.width / (360 * scale)) + 1;
  drawGraticule(scale, copies);
  context.save();
  context.setTransform(
    state.dpr * scale,
    0,
    0,
    state.dpr * scale,
    state.dpr * (state.width / 2 - state.center.x * scale),
    state.dpr * (state.height / 2 - state.center.y * scale),
  );
  countries.forEach((country) => drawCountry(country, scale, copies));
  context.restore();
  drawCountryLabels(scale, copies);

  const zoomLabel = `${state.zoom.toFixed(1)}×`;
  zoomElement.value = zoomLabel;
  zoomElement.textContent = zoomLabel;
}

function resize() {
  const bounds = canvas.getBoundingClientRect();
  state.width = bounds.width;
  state.height = bounds.height;
  state.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.round(bounds.width * state.dpr);
  canvas.height = Math.round(bounds.height * state.dpr);
  requestRender();
}

function zoomAt(nextZoom, screenX = state.width / 2, screenY = state.height / 2) {
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
  if (newZoom === state.zoomTarget) return;

  const oldScale = mapScale();
  state.zoomAnchor = {
    point: {
    x: normalizeLongitude(state.center.x + (screenX - state.width / 2) / oldScale),
    y: state.center.y + (screenY - state.height / 2) / oldScale,
    },
    screenX,
    screenY,
  };
  state.zoomTarget = newZoom;
  if (zoomFrame === null) zoomFrame = requestAnimationFrame(animateZoom);
}

function animateZoom() {
  const difference = state.zoomTarget - state.zoom;
  state.zoom += difference * 0.24;

  if (Math.abs(difference) < 0.002) {
    state.zoom = state.zoomTarget;
  }

  if (state.zoomAnchor) {
    const scale = mapScale();
    const { point, screenX, screenY } = state.zoomAnchor;
    state.center = {
      x: normalizeLongitude(point.x - (screenX - state.width / 2) / scale),
      y: point.y - (screenY - state.height / 2) / scale,
    };
  }

  render();
  if (state.zoom !== state.zoomTarget) {
    zoomFrame = requestAnimationFrame(animateZoom);
  } else {
    zoomFrame = null;
    state.zoomAnchor = null;
  }
}

function showCoordinates(screenX, screenY) {
  const scale = mapScale();
  const mapX = state.center.x + (screenX - state.width / 2) / scale;
  const mapY = state.center.y + (screenY - state.height / 2) / scale;
  const longitude = normalizeLongitude(mapX) - 180;
  const latitude = Math.max(-90, Math.min(90, 90 - mapY));
  toastElement.textContent = `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
  toastElement.classList.add("is-visible");
  clearTimeout(state.toastTimeout);
  state.toastTimeout = setTimeout(() => toastElement.classList.remove("is-visible"), 2200);
}

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  if (zoomFrame !== null) {
    cancelAnimationFrame(zoomFrame);
    zoomFrame = null;
    state.zoomTarget = state.zoom;
    state.zoomAnchor = null;
  }
  const bounds = canvas.getBoundingClientRect();
  state.dragging = true;
  state.pointerId = event.pointerId;
  state.pointerStart = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  state.lastPointer = { x: event.clientX, y: event.clientY };
  state.moved = false;
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add("is-dragging");
});

canvas.addEventListener("pointermove", (event) => {
  if (!state.dragging || event.pointerId !== state.pointerId) return;
  const dx = event.clientX - state.lastPointer.x;
  const dy = event.clientY - state.lastPointer.y;
  state.lastPointer = { x: event.clientX, y: event.clientY };
  if (Math.abs(event.clientX - (canvas.getBoundingClientRect().left + state.pointerStart.x)) > 4
    || Math.abs(event.clientY - (canvas.getBoundingClientRect().top + state.pointerStart.y)) > 4) {
    state.moved = true;
  }
  const scale = mapScale();
  state.center.x = normalizeLongitude(state.center.x - dx / scale);
  state.center.y = Math.max(-90, Math.min(270, state.center.y - dy / scale));
  requestRender();
});

function finishPointer(event) {
  if (!state.dragging || event.pointerId !== state.pointerId) return;
  state.dragging = false;
  state.pointerId = null;
  canvas.classList.remove("is-dragging");
  if (!state.moved && state.pointerStart) {
    showCoordinates(state.pointerStart.x, state.pointerStart.y);
  }
}

canvas.addEventListener("pointerup", finishPointer);
canvas.addEventListener("pointercancel", finishPointer);
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const bounds = canvas.getBoundingClientRect();
  zoomAt(state.zoomTarget + (event.deltaY < 0 ? 0.25 : -0.25), event.clientX - bounds.left, event.clientY - bounds.top);
}, { passive: false });

document.querySelector("#zoomInButton").addEventListener("click", () => zoomAt(state.zoomTarget + 1));
document.querySelector("#zoomOutButton").addEventListener("click", () => zoomAt(state.zoomTarget - 1));
document.querySelector("#homeButton").addEventListener("click", () => {
  if (zoomFrame !== null) {
    cancelAnimationFrame(zoomFrame);
    zoomFrame = null;
  }
  state.center = { x: 180, y: 90 };
  state.zoom = MIN_ZOOM;
  state.zoomTarget = MIN_ZOOM;
  state.zoomAnchor = null;
  requestRender();
});
document.querySelector("#reloadButton").addEventListener("click", loadMapData);
window.addEventListener("resize", resize);

resize();
loadMapData();

// ============================================
//  DERIV DIGIT FREQUENCY SCANNER
//  Live WebSocket connection to Deriv API
// ============================================

const APP_ID = 1089; // Deriv public demo app_id (fine for market data)
const WS_URL = `wss://api.derivws.com/trading/v1/options/ws/public`;

// ---- STATE ----
let ws = null;
let currentSymbol = "R_100";
let digitCounts = new Array(10).fill(0);
let totalTicks = 0;
let recentTicks = [];
const MAX_RECENT = 15;
const MIN_TICKS_FOR_SIGNAL = 20;

// ---- DOM REFS ----
const statusDot    = document.getElementById("statusDot");
const statusText   = document.getElementById("statusText");
const marketSelect = document.getElementById("marketSelect");
const resetBtn     = document.getElementById("resetBtn");
const footerMarket = document.getElementById("footerMarket");

const signalBanner = document.getElementById("signalBanner");
const signalIcon   = document.getElementById("signalIcon");
const signalTitle  = document.getElementById("signalTitle");
const signalSub    = document.getElementById("signalSub");
const signalPct    = document.getElementById("signalPct");

const hotDigitsEl  = document.getElementById("hotDigits");
const coldDigitsEl = document.getElementById("coldDigits");
const tickCountEl  = document.getElementById("tickCount");
const maxDevEl     = document.getElementById("maxDeviation");
const digitBarsEl  = document.getElementById("digitBars");
const recentListEl = document.getElementById("recentList");

// ---- WEBSOCKET CONNECTION ----
function connect() {
  setStatus("connecting", "Connecting…");

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    setStatus("connected", "Live");
    subscribeTicks();
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    // Handle errors from Deriv
    if (data.error) {
      console.error("Deriv error:", data.error);
      setStatus("error", data.error.message || "Error");
      return;
    }

    // Handle tick stream
    if (data.msg_type === "tick" && data.tick) {
      handleTick(data.tick);
    }
  };

  ws.onerror = () => {
    setStatus("error", "Connection error");
  };

  ws.onclose = () => {
    setStatus("error", "Disconnected — retrying in 3s");
    setTimeout(connect, 3000);
  };
}

function subscribeTicks() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  // Forget previous subscription
  ws.send(JSON.stringify({ forget_all: "ticks" }));

  // Subscribe to new symbol
  ws.send(JSON.stringify({
    ticks: currentSymbol,
    subscribe: 1,
  }));
}

// ---- TICK HANDLER ----
function handleTick(tick) {
  const quote = tick.quote.toFixed(2);
  const lastDigit = parseInt(quote.slice(-1), 10);

  // Update counts
  digitCounts[lastDigit]++;
  totalTicks++;

  // Add to recent list
  recentTicks.unshift({ quote, digit: lastDigit });
  if (recentTicks.length > MAX_RECENT) recentTicks.pop();

  // Render
  render();
}

// ---- RENDER EVERYTHING ----
function render() {
  renderStats();
  renderDigitBars();
  renderHotCold();
  renderSignal();
  renderRecent();
  tickCountEl.textContent = totalTicks.toLocaleString();
}

function renderStats() {
  if (totalTicks === 0) {
    maxDevEl.textContent = "0.0%";
    return;
  }

  let maxDev = 0;
  for (let d = 0; d < 10; d++) {
    const pct = (digitCounts[d] / totalTicks) * 100;
    const dev = Math.abs(pct - 10);
    if (dev > maxDev) maxDev = dev;
  }
  maxDevEl.textContent = maxDev.toFixed(1) + "%";
}

function renderDigitBars() {
  // Build bars once, then update heights
  if (digitBarsEl.children.length === 0) {
    for (let d = 0; d < 10; d++) {
      const wrap = document.createElement("div");
      wrap.className = "digit-bar-wrap";
      wrap.innerHTML = `
        <div class="digit-bar-pct" data-pct="${d}">0%</div>
        <div class="digit-bar" data-bar="${d}" style="height: 4px;"></div>
        <div class="digit-bar-label">${d}</div>
      `;
      digitBarsEl.appendChild(wrap);
    }
  }

  const maxCount = Math.max(...digitCounts, 1);
  const expected = totalTicks > 0 ? totalTicks / 10 : 1;

  for (let d = 0; d < 10; d++) {
    const bar = digitBarsEl.querySelector(`[data-bar="${d}"]`);
    const pctEl = digitBarsEl.querySelector(`[data-pct="${d}"]`);
    const pct = totalTicks > 0 ? (digitCounts[d] / totalTicks) * 100 : 0;
    const heightPct = (digitCounts[d] / maxCount) * 100;

    bar.style.height = Math.max(4, heightPct) + "%";
    pctEl.textContent = pct.toFixed(1) + "%";

    // Colour based on deviation from expected 10%
    bar.classList.remove("hot", "cold");
    if (totalTicks >= MIN_TICKS_FOR_SIGNAL) {
      if (pct > 12) bar.classList.add("hot");
      else if (pct < 8) bar.classList.add("cold");
    }
  }
}

function renderHotCold() {
  if (totalTicks < MIN_TICKS_FOR_SIGNAL) {
    hotDigitsEl.innerHTML = `<p class="muted">Need ${MIN_TICKS_FOR_SIGNAL - totalTicks} more ticks…</p>`;
    coldDigitsEl.innerHTML = `<p class="muted">Need ${MIN_TICKS_FOR_SIGNAL - totalTicks} more ticks…</p>`;
    return;
  }

  const sorted = digitCounts
    .map((count, digit) => ({
      digit,
      count,
      pct: (count / totalTicks) * 100,
    }))
    .sort((a, b) => b.pct - a.pct);

  const hot = sorted.slice(0, 3);
  const cold = sorted.slice(-3).reverse();

  hotDigitsEl.innerHTML = hot
    .map(
      (h) => `
    <div class="digit-row hot">
      <div class="digit-big">${h.digit}</div>
      <div class="digit-meta">${h.count} hits</div>
      <div class="digit-pct">${h.pct.toFixed(1)}%</div>
    </div>
  `
    )
    .join("");

  coldDigitsEl.innerHTML = cold
    .map(
      (c) => `
    <div class="digit-row cold">
      <div class="digit-big">${c.digit}</div>
      <div class="digit-meta">${c.count} hits</div>
      <div class="digit-pct">${c.pct.toFixed(1)}%</div>
    </div>
  `
    )
    .join("");
}

function renderSignal() {
  if (totalTicks < MIN_TICKS_FOR_SIGNAL) {
    signalBanner.classList.remove("hot", "cold");
    signalIcon.textContent = "📊";
    signalTitle.textContent = "Waiting for data…";
    signalSub.textContent = `Collecting ticks from Deriv. First signals appear after ${MIN_TICKS_FOR_SIGNAL} ticks.`;
    signalPct.textContent = "—";
    return;
  }

  // Find the most deviated digit
  let best = { digit: 0, pct: 10, dev: 0 };
  for (let d = 0; d < 10; d++) {
    const pct = (digitCounts[d] / totalTicks) * 100;
    const dev = Math.abs(pct - 10);
    if (dev > best.dev) {
      best = { digit: d, pct, dev };
    }
  }

  const direction = best.pct > 10 ? "hot" : "cold";
  const arrow = best.pct > 10 ? "🔥" : "❄️";
  const word = best.pct > 10 ? "HOT" : "COLD";

  signalBanner.classList.remove("hot", "cold");
  signalBanner.classList.add(direction);

  if (best.dev >= 2) {
    signalIcon.textContent = arrow;
    signalTitle.textContent = `Digit ${best.digit} is ${word}`;
    signalSub.textContent =
      `Appearing ${best.pct.toFixed(1)}% of the time ` +
      `(${best.pct > 10 ? "+" : ""}${(best.pct - 10).toFixed(1)}% from expected 10%)`;
    signalPct.textContent = best.pct.toFixed(1) + "%";
  } else {
    signalIcon.textContent = "⚖️";
    signalTitle.textContent = "Distribution looks normal";
    signalSub.textContent = "No digit is deviating significantly. Keep watching.";
    signalPct.textContent = "—";
  }
}

function renderRecent() {
  if (recentTicks.length === 0) {
    recentListEl.innerHTML = `<p class="muted">No ticks yet…</p>`;
    return;
  }

  recentListEl.innerHTML = recentTicks
    .map(
      (t) => `
    <div class="tick-item">
      <span class="tick-price">${t.quote}</span>
      <span>→</span>
      <span class="tick-digit">${t.digit}</span>
    </div>
  `
    )
    .join("");
}

// ---- STATUS ----
function setStatus(state, text) {
  statusText.textContent = text;
  statusDot.classList.remove("connected", "error");
  if (state === "connected") statusDot.classList.add("connected");
  if (state === "error") statusDot.classList.add("error");
}

// ---- CONTROLS ----
marketSelect.addEventListener("change", () => {
  currentSymbol = marketSelect.value;
  footerMarket.textContent = marketSelect.options[marketSelect.selectedIndex].text;
  resetState();
  subscribeTicks();
});

resetBtn.addEventListener("click", () => {
  resetState();
  render();
});

function resetState() {
  digitCounts = new Array(10).fill(0);
  totalTicks = 0;
  recentTicks = [];
  digitBarsEl.innerHTML = "";
  recentListEl.innerHTML = `<p class="muted">No ticks yet…</p>`;
  hotDigitsEl.innerHTML = `<p class="muted">Waiting for ticks…</p>`;
  coldDigitsEl.innerHTML = `<p class="muted">Waiting for ticks…</p>`;
  signalBanner.classList.remove("hot", "cold");
  signalIcon.textContent = "📊";
  signalTitle.textContent = "Waiting for data…";
  signalSub.textContent = `Collecting ticks from Deriv. First signals appear after ${MIN_TICKS_FOR_SIGNAL} ticks.`;
  signalPct.textContent = "—";
  tickCountEl.textContent = "0";
  maxDevEl.textContent = "0.0%";
}

// ---- BOOT ----
connect();
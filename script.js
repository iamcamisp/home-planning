let DATA = null;
let STATUS_FILTER = "all";
let CATEGORY_FILTER = "all";

const CATEGORY_LABEL = {
  furniture: "Furniture",
  lighting: "Lighting",
  electronics: "Electronics",
  appliances: "Appliances",
  decor: "Decor",
  other: "Other",
};

async function load() {
  try {
    const res = await fetch(`items.json?v=${Date.now()}`);
    DATA = await res.json();
    render();
    setupScrollSpy();
    setupFilters();
  } catch (err) {
    document.getElementById("rooms").innerHTML =
      `<p class="loading">Could not load list.</p>`;
    console.error(err);
  } finally {
    document.getElementById("rooms").setAttribute("aria-busy", "false");
  }
}

function statusOf(it) {
  if (it.status) return it.status;
  if (it.bought) return "owned";
  return "planned";
}

function setupFilters() {
  const status = document.getElementById("status-filter");
  if (status) {
    status.addEventListener("change", () => {
      STATUS_FILTER = status.value;
      render();
      setupScrollSpy();
    });
  }
  const cat = document.getElementById("category-filter");
  if (cat) {
    cat.addEventListener("change", () => {
      CATEGORY_FILTER = cat.value;
      render();
      setupScrollSpy();
    });
  }
  populateCategoryFilter();
}

function populateCategoryFilter() {
  const sel = document.getElementById("category-filter");
  if (!sel || !DATA) return;
  const seen = new Set();
  for (const r of DATA.rooms || []) {
    for (const it of (r.items || [])) {
      if (it.category) seen.add(it.category);
    }
  }
  const opts = [`<option value="all" ${CATEGORY_FILTER === "all" ? "selected" : ""}>All</option>`];
  for (const c of Array.from(seen).sort()) {
    const label = CATEGORY_LABEL[c] || (c.charAt(0).toUpperCase() + c.slice(1));
    opts.push(`<option value="${c}" ${CATEGORY_FILTER === c ? "selected" : ""}>${label}</option>`);
  }
  sel.innerHTML = opts.join("");
}

const STATUS_ORDER = { owned: 1, planned: 2, "to-sell": 3, sold: 4, returned: 5 };

function render() {
  if (!DATA) return;
  const allRooms = (DATA.rooms || [])
    .filter((r) => r && r.slug && r.name)
    .slice()
    .sort((a, b) => {
      // "Future Ideas" is always pinned to the bottom
      if (a.slug === "future-ideas") return 1;
      if (b.slug === "future-ideas") return -1;
      return a.name.localeCompare(b.name, "en");
    });
  // Filter + sort items
  const rooms = allRooms.map((r) => ({
    ...r,
    items: (r.items || [])
      .filter((it) => STATUS_FILTER === "all" || statusOf(it) === STATUS_FILTER)
      .filter((it) => CATEGORY_FILTER === "all" || it.category === CATEGORY_FILTER)
      .slice()
      .sort((a, b) => {
        const sa = STATUS_ORDER[statusOf(a)] || 99;
        const sb = STATUS_ORDER[statusOf(b)] || 99;
        if (sa !== sb) return sa - sb;
        return (a.name || "").localeCompare(b.name || "", "en");
      }),
  }));

  document.querySelector(".room-nav-inner").innerHTML = rooms
    .map(
      (r) =>
        `<a href="#${escapeAttr(r.slug)}" data-slug="${escapeAttr(r.slug)}">${escape(r.name)}</a>`
    )
    .join("");

  document.getElementById("rooms").innerHTML = rooms.map((r) => renderRoom(r)).join("");
}

function renderRoom(room) {
  const items = room.items || [];
  const count = items.length;
  const body = count
    ? `<div class="grid">${items.map((it) => renderCard(it)).join("")}</div>`
    : `<p class="room-empty">No pieces yet.</p>`;
  return `
    <section class="room" id="${escapeAttr(room.slug)}">
      <div class="room-header">
        <h2>${escape(room.name)}</h2>
        <span class="count">${count} ${count === 1 ? "piece" : "pieces"}</span>
      </div>
      ${body}
    </section>
  `;
}

function renderCard(it) {
  const url = it.url || "#";
  const status = statusOf(it);
  const image = it.image_url
    ? `<div class="image"><img src="${escapeAttr(it.image_url)}" alt="${escapeAttr(it.name || "")}" loading="lazy" onerror="this.parentElement.classList.add('broken')"/></div>`
    : `<div class="image broken"></div>`;

  // Prefer `brand`; fall back to legacy `store`
  const brandText = it.brand || it.store || "";
  const brand = brandText ? `<div class="brand">${escape(brandText)}</div>` : "";
  const parts = [];
  // Support both new schema (price + currency) and legacy (price_chf)
  const priceVal = (typeof it.price === "number") ? it.price : it.price_chf;
  const priceCur = it.currency || "CHF";
  if (typeof priceVal === "number") {
    if (status === "sold" && typeof it.sold_price === "number") {
      // Original price struck through, sold price next to it
      parts.push(
        `<span class="price-original">${escape(fmtMoney(priceVal, priceCur))}</span> ` +
        `<span class="price-sold">${escape(fmtMoney(it.sold_price, priceCur))}</span>`
      );
    } else {
      parts.push(escape(fmtMoney(priceVal, priceCur)));
    }
  }
  if ((status === "owned" || status === "to-sell") && it.date_bought) parts.push(escape(fmtDate(it.date_bought)));
  if (status === "sold" && it.date_sold) parts.push(escape(`sold ${fmtDate(it.date_sold)}`));
  if (status === "returned" && it.date_returned) parts.push(escape(`returned ${fmtDate(it.date_returned)}`));
  const line = parts.length
    ? `<div class="meta">${parts.join(" · ")}</div>`
    : "";
  const dims = it.dimensions
    ? `<div class="dims">${escape(it.dimensions)}</div>`
    : "";
  const detail = `${dims}${line}`;
  const tagText =
    status === "owned" ? "Owned" :
    status === "planned" ? "Planned" :
    status === "to-sell" ? "To sell" :
    status === "sold" ? "Sold" :
    status === "returned" ? "Returned" : "";
  const tag = tagText ? `<div class="status-tag tag-${status}">${tagText}</div>` : "";

  return `
    <a class="card status-${status}" href="${escapeAttr(url)}" target="_blank" rel="noopener">
      ${image}
      <div class="content">
        ${tag}
        <div class="name">${escape(it.name || "")}</div>
        ${brand}
        ${detail}
      </div>
      <div class="action"><span class="view">View →</span></div>
    </a>
  `;
}

const CURRENCY_LOCALE = { CHF: "de-CH", EUR: "de-DE", BRL: "pt-BR", USD: "en-US", GBP: "en-GB" };

function fmtMoney(amount, currency) {
  const cur = (currency || "CHF").toUpperCase();
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALE[cur] || "de-CH", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${cur} ${amount}`;
  }
}

// Backward-compat shim — items still using price_chf keep working
function fmtCHF(n) { return fmtMoney(n, "CHF"); }

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function setupScrollSpy() {
  const links = Array.from(document.querySelectorAll(".room-nav a"));
  if (!links.length) return;
  const bySlug = Object.fromEntries(links.map((a) => [a.dataset.slug, a]));
  const setActive = (slug) => {
    links.forEach((a) => a.classList.toggle("active", a.dataset.slug === slug));
  };
  const observer = new IntersectionObserver(
    (entries) => {
      // Pick the section closest to the top that's still in view
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) {
        const slug = visible[0].target.id;
        if (bySlug[slug]) setActive(slug);
      }
    },
    { rootMargin: "-100px 0px -60% 0px", threshold: 0 }
  );
  document.querySelectorAll(".room").forEach((s) => observer.observe(s));
  setActive(links[0].dataset.slug);
}

function escape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escapeAttr(s) {
  return escape(s);
}

load();

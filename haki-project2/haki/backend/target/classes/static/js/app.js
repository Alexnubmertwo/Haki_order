const API = "/api";

let allProducts = [];
let categories = ["Все"];
let activeCategory = "Все";
let cart = []; // {productId, productName, size, price, quantity}
let currentShiftData = null; // { open, shift, cashRevenue, cardRevenue, expensesTotal, expectedCashNow, receiptsCount }
let foundCustomer = null;    // customer looked up in the payment modal
let selectedPayMethod = "CASH";
let dashboardPeriod = "today";
let dashboardPayMethod = "all";

// kassir, ot imeni kotorogo sovershayutsya deystviya - zapolnyaetsya posle logina.
let CASHIER_NAME = "";
let CURRENT_ROLE = ""; // ADMIN / CASHIER

// ---------- LOGIN ----------

let selectedLoginRole = "ADMIN";

document.querySelectorAll(".role-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        selectedLoginRole = tab.dataset.role;
        document.querySelectorAll(".role-tab").forEach(t => t.classList.toggle("active", t === tab));
    });
});

document.getElementById("loginSubmitBtn").addEventListener("click", doLogin);
document.getElementById("loginPassword").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

async function doLogin() {
    const username = document.getElementById("loginUsername").value.trim();
    const password = document.getElementById("loginPassword").value;
    const errBox = document.getElementById("loginError");
    errBox.style.display = "none";
    if (!username || !password) { errBox.textContent = "Введите логин и пароль"; errBox.style.display = "block"; return; }
    try {
        const res = await fetch(API + "/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) { errBox.textContent = data.error || "Ошибка входа"; errBox.style.display = "block"; return; }
        localStorage.setItem("haki_session", JSON.stringify(data));
        applySession(data);
    } catch (e) {
        errBox.textContent = "Не удалось связаться с сервером";
        errBox.style.display = "block";
    }
}

function applySession(session) {
    CURRENT_ROLE = session.role;
    CASHIER_NAME = session.name;
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("app").style.display = "grid";
    document.querySelector(".brand .name").textContent = "Haki";
    document.querySelector(".brand .role").textContent = session.role === "ADMIN" ? "Владелец" : "Кассир: " + session.name;

    const isAdmin = session.role === "ADMIN";
    document.querySelectorAll(".nav-item.admin-only").forEach(item => item.classList.toggle("role-hidden", !isAdmin));

    initPos().catch(e => toast("Ошибка загрузки: " + e.message, true));
}

function logout() {
    localStorage.removeItem("haki_session");
    location.reload();
}

function tryRestoreSession() {
    const raw = localStorage.getItem("haki_session");
    if (!raw) return;
    try {
        applySession(JSON.parse(raw));
    } catch (e) { localStorage.removeItem("haki_session"); }
}

// ---------- helpers ----------

function money(n) {
    return (n || 0).toLocaleString("ru-RU") + " UZS";
}

function toast(msg, isError = false) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.toggle("error", isError);
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2400);
}

async function api(path, options = {}) {
    const res = await fetch(API + path, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    if (!res.ok) {
        let msg = "Ошибка запроса";
        try { const j = await res.json(); msg = j.error || msg; } catch (e) {}
        throw new Error(msg);
    }
    if (res.status === 204) return null;
    return res.json();
}

function fmtDateTime(iso) {
    return new Date(iso).toLocaleString("ru-RU");
}

// ---------- hamburger / drawer ----------

const sidebar = document.getElementById("sidebar");
const backdrop = document.getElementById("drawerBackdrop");
const hamburgerBtn = document.getElementById("hamburgerBtn");

function openDrawer() {
    sidebar.classList.add("open");
    backdrop.classList.add("show");
    hamburgerBtn.classList.add("open");
}
function closeDrawer() {
    sidebar.classList.remove("open");
    backdrop.classList.remove("show");
    hamburgerBtn.classList.remove("open");
}
hamburgerBtn.addEventListener("click", () => {
    sidebar.classList.contains("open") ? closeDrawer() : openDrawer();
});
backdrop.addEventListener("click", closeDrawer);

// ---------- navigation ----------

document.querySelectorAll(".nav-item[data-panel]").forEach(item => {
    item.addEventListener("click", () => {
        switchPanel(item.dataset.panel);
        closeDrawer();
    });
});

function switchPanel(name) {
    document.querySelectorAll(".nav-item[data-panel]").forEach(i => i.classList.toggle("active", i.dataset.panel === name));
    document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === "panel-" + name));

    if (name === "pos") refreshShiftBanner();
    if (name === "receipts") loadReceipts();
    if (name === "shifts") loadShiftsPanel();
    if (name === "expenses") loadExpensesPanel();
    if (name === "stock-in") { loadProductSelect("inProductSelect"); loadMovements("IN"); }
    if (name === "stock-out") { loadProductSelect("outProductSelect"); loadMovements("OUT"); }
    if (name === "products") loadProductsTable();
    if (name === "customers") loadCustomersTable();
    if (name === "dashboard") loadDashboard();
    if (name === "branches") loadBranches();
    if (name === "cashiers") loadCashiers();
}

// ---------- POS ----------

async function initPos() {
    allProducts = await api("/products");
    const cats = await api("/products/categories");
    categories = ["Все", ...Array.from(cats)];
    renderTabs();
    renderProductList();
    refreshShiftBanner();
}

function renderTabs() {
    const box = document.getElementById("posTabs");
    box.innerHTML = "";
    categories.forEach(cat => {
        const el = document.createElement("div");
        el.className = "tab" + (cat === activeCategory ? " active" : "");
        el.textContent = cat;
        el.onclick = () => { activeCategory = cat; renderTabs(); renderProductList(); };
        box.appendChild(el);
    });
}

function renderProductList() {
    const box = document.getElementById("posList");
    const q = document.getElementById("posSearch").value.trim().toLowerCase();
    box.innerHTML = "";

    let list = allProducts;
    if (activeCategory !== "Все") list = list.filter(p => p.category === activeCategory);
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q));

    if (list.length === 0) {
        box.innerHTML = '<div class="cart-empty">Ничего не найдено</div>';
        return;
    }

    list.forEach(p => {
        const priceLabel = priceLabelFor(p);
        const sizesLabel = Object.keys(p.prices).filter(s => s !== "BASE").join(" · ");
        const card = document.createElement("div");
        card.className = "product-card";
        card.innerHTML = `
            <div class="product-thumb">📦</div>
            <div class="product-info">
                <div class="product-name">${p.name}</div>
                ${sizesLabel ? `<div class="product-sizes">${sizesLabel}</div>` : ""}
                <div class="product-stock ${p.isLowStock ? "low" : ""}">Остаток: ${p.stockQty} ${p.unit}</div>
            </div>
            <div class="product-price">${priceLabel}</div>
        `;
        card.onclick = () => addToCartFlow(p);
        box.appendChild(card);
    });
}

function priceLabelFor(p) {
    const sizes = Object.keys(p.prices).filter(s => s !== "BASE");
    if (sizes.length === 0) return money(p.prices.BASE);
    const min = Math.min(...Object.values(p.prices));
    return "от " + money(min);
}

function addToCartFlow(product) {
    const sizes = Object.keys(product.prices).filter(s => s !== "BASE");
    let size = null, price;
    if (sizes.length > 0) {
        size = sizes.includes("M") ? "M" : sizes[0];
        price = product.prices[size];
    } else {
        price = product.prices.BASE;
    }
    const existing = cart.find(i => i.productId === product.id && i.size === size);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ productId: product.id, productName: product.name, size, price, quantity: 1 });
    }
    renderCart();
}

function cartTotal() {
    return cart.reduce((s, i) => s + i.price * i.quantity, 0);
}

function renderCart() {
    const box = document.getElementById("cartItems");
    const total = cartTotal();
    document.getElementById("cartTotal").textContent = money(total);
    const payBtn = document.getElementById("payBtn");
    payBtn.textContent = "ОПЛАТИТЬ " + money(total);
    payBtn.disabled = cart.length === 0;

    if (cart.length === 0) {
        box.innerHTML = '<div class="cart-empty">Корзина пуста</div>';
        return;
    }
    box.innerHTML = "";
    cart.forEach((item, idx) => {
        const row = document.createElement("div");
        row.className = "cart-item";
        row.innerHTML = `
            <div>
                <div>${item.productName} ${item.size ? "(" + item.size + ")" : ""}</div>
                <div style="color:var(--text-dim)">${money(item.price)}</div>
            </div>
            <div class="qty-controls">
                <button class="qty-btn" data-act="minus">−</button>
                <span>${item.quantity}</span>
                <button class="qty-btn" data-act="plus">+</button>
            </div>
        `;
        row.querySelector('[data-act="plus"]').onclick = () => { item.quantity++; renderCart(); };
        row.querySelector('[data-act="minus"]').onclick = () => {
            item.quantity--;
            if (item.quantity <= 0) cart.splice(idx, 1);
            renderCart();
        };
        box.appendChild(row);
    });
}

document.getElementById("cartClearBtn").onclick = () => { cart = []; renderCart(); };
document.getElementById("posSearch").addEventListener("input", renderProductList);

// ---------- shift banner on POS ----------

async function refreshShiftBanner() {
    try {
        currentShiftData = await api("/shifts/current");
    } catch (e) {
        currentShiftData = { open: false };
    }
    const banner = document.getElementById("shiftBanner");
    if (currentShiftData.open) {
        const s = currentShiftData.shift;
        banner.className = "shift-banner";
        banner.style.display = "flex";
        banner.innerHTML = `<span>Смена открыта: <b>${s.cashierName}</b> · с ${fmtDateTime(s.openedAt)}</span>
            <a class="link-btn" onclick="switchPanel('shifts')">Управление сменой →</a>`;
    } else {
        banner.className = "shift-banner no-shift";
        banner.style.display = "flex";
        banner.innerHTML = `<span>⚠ Смена не открыта — продажи не привязаны к кассе</span>
            <a class="link-btn" onclick="switchPanel('shifts')">Открыть смену →</a>`;
    }
}

// ---------- payment modal ----------

const payModalBackdrop = document.getElementById("payModalBackdrop");

document.getElementById("payBtn").onclick = () => openPayModal();
document.getElementById("payModalCancel").onclick = () => closePayModal();

function openPayModal() {
    if (cart.length === 0) return;
    selectedPayMethod = "CASH";
    foundCustomer = null;
    document.querySelectorAll(".pay-method-tab").forEach(t => t.classList.toggle("active", t.dataset.method === "CASH"));
    document.getElementById("mixedPayFields").style.display = "none";
    document.getElementById("debtHint").style.display = "none";
    document.getElementById("payCustomerPhone").value = "";
    document.getElementById("bonusInfoBox").style.display = "none";
    document.getElementById("bonusInfoBox").innerHTML = "";
    document.getElementById("payModalTotal").textContent = money(cartTotal());
    const total = cartTotal();
    document.getElementById("mixedCashInput").value = total;
    document.getElementById("mixedCardInput").value = 0;
    payModalBackdrop.classList.add("show");
}

function closePayModal() {
    payModalBackdrop.classList.remove("show");
}

document.querySelectorAll(".pay-method-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        selectedPayMethod = tab.dataset.method;
        document.querySelectorAll(".pay-method-tab").forEach(t => t.classList.toggle("active", t === tab));
        document.getElementById("mixedPayFields").style.display = selectedPayMethod === "MIXED" ? "block" : "none";
        document.getElementById("debtHint").style.display = selectedPayMethod === "DEBT" ? "block" : "none";
    });
});

let phoneDebounce;
document.getElementById("payCustomerPhone").addEventListener("input", (e) => {
    clearTimeout(phoneDebounce);
    const phone = e.target.value.trim();
    const box = document.getElementById("bonusInfoBox");
    if (phone.length < 5) { box.style.display = "none"; foundCustomer = null; return; }
    phoneDebounce = setTimeout(async () => {
        try {
            const customer = await api("/customers/" + encodeURIComponent(phone));
            foundCustomer = customer;
            box.style.display = "block";
            if (customer.balance > 0) {
                const maxUse = Math.min(customer.balance, cartTotal());
                box.innerHTML = `Доступно бонусов: <b>${money(customer.balance)}</b>. Списать:
                    <input type="number" id="bonusUseInput" min="0" max="${maxUse}" value="0"
                        style="width:110px; margin-left:6px; background:var(--bg-card); border:1px solid var(--border); color:var(--text); border-radius:6px; padding:4px 8px;">`;
            } else {
                box.innerHTML = "У клиента пока нет бонусов — за эту покупку начислится 1%.";
            }
        } catch (err) {
            foundCustomer = null;
            box.style.display = "none";
        }
    }, 400);
});

document.getElementById("payModalConfirm").onclick = async () => {
    const total = cartTotal();
    const phoneInput = document.getElementById("payCustomerPhone").value.trim();
    const bonusInput = document.getElementById("bonusUseInput");
    const bonusUsed = bonusInput ? Math.max(0, Math.min(parseInt(bonusInput.value || "0", 10), total)) : 0;
    const payable = total - bonusUsed;

    let cashAmount = 0, cardAmount = 0, debtAmount = 0;
    if (selectedPayMethod === "CASH") cashAmount = payable;
    else if (selectedPayMethod === "CARD") cardAmount = payable;
    else if (selectedPayMethod === "DEBT") {
        if (!phoneInput) { toast("Для оплаты в долг укажите телефон клиента", true); return; }
        debtAmount = payable;
    } else {
        cashAmount = parseInt(document.getElementById("mixedCashInput").value || "0", 10);
        cardAmount = parseInt(document.getElementById("mixedCardInput").value || "0", 10);
        if (cashAmount + cardAmount !== payable) {
            toast("Сумма наличных и карты должна равняться " + money(payable), true);
            return;
        }
    }

    const order = {
        items: cart.map(i => ({
            productId: i.productId, productName: i.productName, size: i.size,
            price: i.price, quantity: i.quantity
        })),
        cashierName: CASHIER_NAME,
        branchName: "Главный филиал",
        paymentMethod: selectedPayMethod,
        cashAmount, cardAmount, debtAmount,
        customerPhone: phoneInput || null,
        bonusUsed
    };

    try {
        const saved = await api("/orders", { method: "POST", body: JSON.stringify(order) });
        let msg = "Чек " + saved.id + " оплачен: " + money(saved.total);
        if (saved.bonusEarned > 0) msg += " · начислено бонусов: " + money(saved.bonusEarned);
        toast(msg);
        cart = [];
        renderCart();
        closePayModal();
        await initPos();
        refreshShiftBanner();
    } catch (e) {
        toast(e.message, true);
    }
};

// ---------- CHEKI ----------

async function loadReceipts() {
    const orders = await api("/orders");
    const body = document.getElementById("receiptsBody");
    body.innerHTML = "";
    const methodLabel = { CASH: "Наличные", CARD: "Карта", MIXED: "Смешанная", DEBT: "Долг" };
    [...orders].reverse().forEach(o => {
        const tr = document.createElement("tr");
        const time = fmtDateTime(o.createdAt);
        tr.innerHTML = `<td>${o.id}</td><td>${time}</td><td>${o.cashierName || "—"}</td>
            <td>${methodLabel[o.paymentMethod] || o.paymentMethod}</td>
            <td>${o.customerPhone || "—"}</td><td>${money(o.total)}</td>`;
        body.appendChild(tr);
    });
}

// ---------- SMENY ----------

async function loadShiftsPanel() {
    await loadCashierSelect();
    currentShiftData = await api("/shifts/current");

    if (currentShiftData.open) {
        document.getElementById("shiftClosedView").style.display = "none";
        document.getElementById("shiftOpenView").style.display = "block";
        const s = currentShiftData.shift;
        document.getElementById("curShiftCashier").textContent = s.cashierName;
        document.getElementById("curShiftOpened").textContent = fmtDateTime(s.openedAt);
        document.getElementById("curShiftCash").textContent = money(currentShiftData.cashRevenue);
        document.getElementById("curShiftCard").textContent = money(currentShiftData.cardRevenue);
        document.getElementById("curShiftExpenses").textContent = money(currentShiftData.expensesTotal);
        document.getElementById("curShiftExpected").textContent = money(currentShiftData.expectedCashNow);
    } else {
        document.getElementById("shiftClosedView").style.display = "block";
        document.getElementById("shiftOpenView").style.display = "none";

        const noteBox = document.getElementById("adminNoteBox");
        try {
            const note = await api("/shifts/admin-note");
            if (note.present === false) {
                noteBox.style.display = "none";
            } else {
                noteBox.style.display = "block";
                noteBox.innerHTML = `📌 Подсказка от администратора: оставлено <b>${money(note.amount)}</b>.
                    ${note.comment ? "«" + note.comment + "»" : ""}`;
                document.getElementById("shiftOpenAmount").value = note.amount;
                document.getElementById("shiftOpenComment").value = note.comment || "";
            }
        } catch (e) { noteBox.style.display = "none"; }
    }

    await loadShiftHistory();
}

async function loadCashierSelect() {
    const cashiers = await api("/cashiers");
    const sel = document.getElementById("shiftOpenCashier");
    sel.innerHTML = "";
    cashiers.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.name;
        opt.textContent = c.name + " (" + c.role + ")";
        sel.appendChild(opt);
    });
}

document.getElementById("shiftOpenBtn").onclick = async () => {
    const cashierName = document.getElementById("shiftOpenCashier").value;
    const amount = parseInt(document.getElementById("shiftOpenAmount").value || "0", 10);
    const comment = document.getElementById("shiftOpenComment").value;
    try {
        await api("/shifts/open", {
            method: "POST",
            body: JSON.stringify({ cashierName, branchName: "Главный филиал", openingCash: amount, note: comment })
        });
        CASHIER_NAME = cashierName;
        toast("Смена открыта");
        loadShiftsPanel();
        refreshShiftBanner();
    } catch (e) { toast(e.message, true); }
};

document.getElementById("shiftCloseBtn").onclick = async () => {
    const expected = currentShiftData.expectedCashNow;
    const actualStr = prompt("Сколько фактически наличных в кассе сейчас?\n\nОжидается по расчёту: " + money(expected), String(expected));
    if (actualStr === null) return;
    const actual = parseInt(actualStr, 10);
    if (isNaN(actual)) { toast("Введите число", true); return; }
    try {
        const closed = await api("/shifts/close", { method: "POST", body: JSON.stringify({ actualCash: actual }) });
        const diff = closed.discrepancy;
        let msg = "Смена закрыта. ";
        if (diff === 0) msg += "Касса сошлась ровно.";
        else if (diff > 0) msg += "Излишек: " + money(diff);
        else msg += "Недостача: " + money(Math.abs(diff));
        toast(msg, diff < 0);
        loadShiftsPanel();
        refreshShiftBanner();
    } catch (e) { toast(e.message, true); }
};

async function loadShiftHistory() {
    const history = await api("/shifts/history");
    const grid = document.getElementById("shiftHistoryGrid");
    renderShiftCards(grid, history.map(s => ({ shift: s })), true);
}

function renderShiftCards(container, list, showDiscrepancy) {
    container.innerHTML = "";
    if (list.length === 0) {
        container.innerHTML = '<div class="cart-empty" style="grid-column:1/-1;">Пока нет данных</div>';
        return;
    }
    list.forEach(entry => {
        const s = entry.shift;
        const cash = entry.cashRevenue !== undefined ? entry.cashRevenue : "—";
        const card = entry.cardRevenue !== undefined ? entry.cardRevenue : "—";
        const receipts = entry.receiptsCount !== undefined ? entry.receiptsCount : "—";
        const div = document.createElement("div");
        div.className = "shift-card";
        const period = fmtDateTime(s.openedAt) + (s.closedAt ? " — " + new Date(s.closedAt).toLocaleTimeString("ru-RU", {hour:"2-digit", minute:"2-digit"}) : "");
        let discHtml = "";
        if (showDiscrepancy && s.status === "CLOSED") {
            const d = s.discrepancy;
            const cls = d === 0 ? "discrepancy-zero" : (d < 0 ? "discrepancy-neg" : "discrepancy-pos");
            discHtml = `<span class="${cls}">расхожд.: ${d > 0 ? "+" : ""}${money(d)}</span>`;
        }
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div class="cashier">${s.cashierName}</div>
                <span class="status-pill ${s.status === "OPEN" ? "open" : "closed"}">${s.status === "OPEN" ? "открыта" : "закрыта"}</span>
            </div>
            <div class="meta">${s.branchName || ""} · ${period}</div>
            <div class="row"><span>Наличные</span><b>${typeof cash === "number" ? money(cash) : cash}</b></div>
            <div class="row"><span>Карта</span><b>${typeof card === "number" ? money(card) : card}</b></div>
            <div class="foot"><span>${receipts} чек.</span>${discHtml}</div>
        `;
        container.appendChild(div);
    });
}

// ---------- RASHODY (kassa) ----------

async function loadExpensesPanel() {
    const list = await api("/expenses");
    const body = document.getElementById("expHistoryBody");
    body.innerHTML = "";
    [...list].reverse().forEach(e => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${fmtDateTime(e.createdAt)}</td><td>${money(e.amount)}</td><td>${e.comment || "—"}</td><td>${e.cashierName || "—"}</td>`;
        body.appendChild(tr);
    });
}

document.getElementById("expSubmit").onclick = async () => {
    const amount = parseInt(document.getElementById("expAmount").value || "0", 10);
    const comment = document.getElementById("expComment").value;
    if (!amount || amount <= 0) { toast("Укажите сумму", true); return; }
    try {
        await api("/expenses", { method: "POST", body: JSON.stringify({ amount, comment, cashierName: CASHIER_NAME }) });
        toast("Расход добавлен");
        document.getElementById("expAmount").value = "";
        document.getElementById("expComment").value = "";
        loadExpensesPanel();
        refreshShiftBanner();
    } catch (e) { toast(e.message, true); }
};

// ---------- PRIHOD / RASHOD TOVARA ----------

async function loadProductSelect(selectId) {
    if (allProducts.length === 0) allProducts = await api("/products");
    const sel = document.getElementById(selectId);
    sel.innerHTML = "";
    allProducts.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = `${p.name} (остаток: ${p.stockQty})`;
        sel.appendChild(opt);
    });
}

async function loadMovements(type) {
    const movements = await api("/inventory/movements");
    const filtered = movements.filter(m => m.type === type).reverse();
    const bodyId = type === "IN" ? "inHistoryBody" : "outHistoryBody";
    const body = document.getElementById(bodyId);
    body.innerHTML = "";
    filtered.forEach(m => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${fmtDateTime(m.createdAt)}</td><td>${m.productName}</td><td>${m.quantity}</td><td>${m.comment || "—"}</td>`;
        body.appendChild(tr);
    });
}

async function submitMovement(type) {
    const prefix = type === "IN" ? "in" : "out";
    const productId = document.getElementById(prefix + "ProductSelect").value;
    const qty = parseInt(document.getElementById(prefix + "Qty").value, 10);
    const comment = document.getElementById(prefix + "Comment").value;
    if (!productId || !qty || qty <= 0) { toast("Заполните товар и количество", true); return; }
    try {
        await api(`/inventory/${prefix}`, {
            method: "POST",
            body: JSON.stringify({ productId, quantity: qty, comment, cashierName: CASHIER_NAME })
        });
        toast(type === "IN" ? "Товар оприходован" : "Товар списан");
        document.getElementById(prefix + "Comment").value = "";
        document.getElementById(prefix + "Qty").value = 1;
        allProducts = await api("/products");
        await loadProductSelect(prefix + "ProductSelect");
        await loadMovements(type);
    } catch (e) {
        toast(e.message, true);
    }
}

document.getElementById("inSubmit").onclick = () => submitMovement("IN");
document.getElementById("outSubmit").onclick = () => submitMovement("OUT");

// ---------- TOVARY ----------

async function loadProductsTable() {
    allProducts = await api("/products");
    const body = document.getElementById("productsBody");
    body.innerHTML = "";
    allProducts.forEach(p => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${p.name}</td>
            <td>${p.category}</td>
            <td>${priceLabelFor(p)}</td>
            <td style="${p.isLowStock ? "color:var(--danger)" : ""}">${p.stockQty} ${p.unit}</td>
            <td><button class="btn danger" data-id="${p.id}">Удалить</button></td>
        `;
        tr.querySelector("button").onclick = async () => {
            if (!confirm("Удалить товар «" + p.name + "»?")) return;
            await api("/products/" + p.id, { method: "DELETE" });
            loadProductsTable();
        };
        body.appendChild(tr);
    });
}

document.getElementById("addProductBtn").onclick = async () => {
    const name = prompt("Название товара:");
    if (!name) return;
    const category = prompt("Категория:", "Остальные") || "Остальные";
    const price = parseInt(prompt("Цена (UZS):", "10000") || "0", 10);
    const stock = parseInt(prompt("Начальный остаток:", "0") || "0", 10);
    try {
        await api("/products", {
            method: "POST",
            body: JSON.stringify({ name, category, prices: { BASE: price }, stockQty: stock, minStockQty: 5, unit: "шт" })
        });
        toast("Товар добавлен");
        loadProductsTable();
    } catch (e) { toast(e.message, true); }
};

// ---------- KLIENTY ----------

async function loadCustomersTable() {
    const orders = await api("/orders");
    const phones = [...new Set(orders.map(o => o.customerPhone).filter(Boolean))];
    const body = document.getElementById("customersBody");
    body.innerHTML = "";
    if (phones.length === 0) {
        body.innerHTML = '<tr><td colspan="4" style="color:var(--text-dim)">Пока нет клиентов с бонусным счётом</td></tr>';
        return;
    }
    for (const phone of phones) {
        try {
            const c = await api("/customers/" + encodeURIComponent(phone));
            const tr = document.createElement("tr");
            tr.innerHTML = `<td>${c.phone}</td><td>${money(c.balance)}</td>
                <td style="${c.debtBalance > 0 ? "color:var(--danger); font-weight:700;" : ""}">${money(c.debtBalance)}</td>
                <td>${money(c.totalSpent)}</td>`;
            body.appendChild(tr);
        } catch (e) {}
    }
}

// ---------- DASHBOARD ----------

document.querySelectorAll(".period-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        dashboardPeriod = tab.dataset.period;
        document.querySelectorAll(".period-tab").forEach(t => t.classList.toggle("active", t === tab));
        loadDashboard();
    });
});
document.querySelectorAll(".payment-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        dashboardPayMethod = tab.dataset.method;
        document.querySelectorAll(".payment-tab").forEach(t => t.classList.toggle("active", t === tab));
        loadPaymentBreakdown();
    });
});

async function loadDashboard() {
    const s = await api("/dashboard/summary?period=" + dashboardPeriod);
    document.getElementById("statOpenShifts").textContent = s.openShiftsCount;
    document.getElementById("statRevenue").textContent = money(s.revenueTotal);
    document.getElementById("statCash").textContent = money(s.cashTotal);
    document.getElementById("statCard").textContent = money(s.cardTotal);

    const badge = document.getElementById("dashboardBadge");
    if (s.lowStockCount > 0) { badge.style.display = "inline-block"; badge.textContent = s.lowStockCount; }
    else { badge.style.display = "none"; }

    const lowBody = document.getElementById("lowStockBody");
    lowBody.innerHTML = "";
    s.lowStockProducts.forEach(p => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${p.name}</td><td style="color:var(--danger)">${p.stockQty}</td><td>${p.minStockQty}</td>`;
        lowBody.appendChild(tr);
    });

    await loadPaymentBreakdown();

    const openShifts = await api("/dashboard/open-shifts");
    renderShiftCards(document.getElementById("openShiftsGrid"), openShifts, false);

    const history = await api("/dashboard/shift-history");
    renderShiftCards(document.getElementById("dashShiftHistoryGrid"), history, true);
}

async function loadPaymentBreakdown() {
    const b = await api("/dashboard/payment-breakdown?period=" + dashboardPeriod);
    const data = b[dashboardPayMethod] || b.all;
    document.getElementById("paymentSummaryLine").textContent = `${data.count} чек. · ${money(data.total)}`;
}

// ---------- FILIALY ----------

async function loadBranches() {
    const branches = await api("/branches");
    const body = document.getElementById("branchesBody");
    body.innerHTML = "";
    branches.forEach(b => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${b.name}</td><td>${b.address || "—"}</td><td><button class="btn danger" data-id="${b.id}">Удалить</button></td>`;
        tr.querySelector("button").onclick = async () => { await api("/branches/" + b.id, { method: "DELETE" }); loadBranches(); };
        body.appendChild(tr);
    });
}
document.getElementById("addBranchBtn").onclick = async () => {
    const name = prompt("Название филиала:");
    if (!name) return;
    const address = prompt("Адрес:", "");
    await api("/branches", { method: "POST", body: JSON.stringify({ name, address }) });
    loadBranches();
};

// ---------- KASSIRY ----------

async function loadCashiers() {
    const cashiers = await api("/cashiers");
    const body = document.getElementById("cashiersBody");
    body.innerHTML = "";
    cashiers.forEach(c => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${c.name}</td><td>${c.role}</td><td>${c.username || "—"}</td><td>${c.branchName || "—"}</td><td><button class="btn danger" data-id="${c.id}">Удалить</button></td>`;
        tr.querySelector("button").onclick = async () => { await api("/cashiers/" + c.id, { method: "DELETE" }); loadCashiers(); };
        body.appendChild(tr);
    });
}
document.getElementById("addCashierBtn").onclick = async () => {
    const name = prompt("Имя кассира:");
    if (!name) return;
    const username = prompt("Логин для входа кассира:");
    if (!username) return;
    const password = prompt("Пароль для входа кассира:");
    if (!password) return;
    await api("/cashiers", {
        method: "POST",
        body: JSON.stringify({ name, username, password, role: "Кассир", branchName: "Главный филиал" })
    });
    toast("Кассир добавлен — логин: " + username);
    loadCashiers();
};

// ---------- NASTROYKI: admin cash note ----------

document.getElementById("settingsNoteBtn").onclick = async () => {
    const amount = parseInt(document.getElementById("settingsNoteAmount").value || "0", 10);
    const comment = document.getElementById("settingsNoteComment").value;
    if (!amount) { toast("Укажите сумму", true); return; }
    try {
        await api("/shifts/admin-note", {
            method: "POST",
            body: JSON.stringify({ amount, comment, setBy: CASHIER_NAME })
        });
        toast("Подсказка сохранена — кассир увидит её при открытии смены");
        document.getElementById("settingsNoteAmount").value = "";
        document.getElementById("settingsNoteComment").value = "";
    } catch (e) { toast(e.message, true); }
};

// ---------- online/offline status ----------

function updateOnlineStatus() {
    const bar = document.getElementById("statusBar");
    const text = document.getElementById("statusText");
    if (navigator.onLine) {
        text.textContent = "🟢 Онлайн — есть интернет";
        bar.classList.remove("offline");
    } else {
        text.textContent = "🔴 Офлайн — нет подключения";
        bar.classList.add("offline");
    }
}
window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);
updateOnlineStatus();

// ---------- init ----------

document.querySelector(".nav-item.logout").addEventListener("click", () => {
    if (confirm("Выйти из аккаунта?")) logout();
});

tryRestoreSession();

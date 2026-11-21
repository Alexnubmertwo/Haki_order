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
let dashboardBreakdown = null; // razbivka po sposobam oplaty, prihodit vmeste s summary

// kassir, ot imeni kotorogo sovershayutsya deystviya - zapolnyaetsya posle logina.
let CASHIER_NAME = "";
let CURRENT_ROLE = ""; // SUPERADMIN / ADMIN / CASHIER
let TOKEN = "";
let CURRENT_BUSINESS = null; // {id, name} - tol'ko u SUPERADMIN, kogda on otkryl biznes

function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

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

let loginInFlight = false;

async function doLogin() {
    if (loginInFlight) return;
    const username = document.getElementById("loginUsername").value.trim();
    const password = document.getElementById("loginPassword").value;
    const errBox = document.getElementById("loginError");
    const btn = document.getElementById("loginSubmitBtn");
    errBox.style.display = "none";
    if (!username || !password) { errBox.textContent = "Введите логин и пароль"; errBox.style.display = "block"; return; }
    loginInFlight = true;
    const oldText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Входим…";
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
    } finally {
        loginInFlight = false;
        btn.disabled = false;
        btn.textContent = oldText;
    }
}

function applySession(session) {
    CURRENT_ROLE = session.role;
    CASHIER_NAME = session.name;
    TOKEN = session.token || "";
    session.businessName && (window.BUSINESS_NAME = session.businessName);
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("app").style.display = "grid";

    if (CURRENT_ROLE === "SUPERADMIN") {
        try { CURRENT_BUSINESS = JSON.parse(sessionStorage.getItem("haki_business") || "null"); } catch (e) { CURRENT_BUSINESS = null; }
    }
    updateNav();

    if (CURRENT_ROLE === "SUPERADMIN" && !CURRENT_BUSINESS) {
        switchPanel("businesses");
    } else {
        initPos().catch(e => toast("Ошибка загрузки: " + e.message, true));
    }
}

/** Pokazyvaet punkty menyu po roli i po tomu, otkryt li biznes u superadmina. */
function updateNav() {
    const isSuper = CURRENT_ROLE === "SUPERADMIN";
    const isCashier = CURRENT_ROLE === "CASHIER";
    const inBusiness = !isSuper || !!CURRENT_BUSINESS;

    document.querySelectorAll(".nav-item[data-panel]").forEach(item => {
        let hidden;
        if (item.classList.contains("superadmin-only")) hidden = !isSuper;
        else if (item.classList.contains("admin-only")) hidden = !inBusiness || isCashier;
        else hidden = !inBusiness;
        item.classList.toggle("role-hidden", hidden);
    });

    document.querySelector(".brand .name").textContent = "Haki";
    const roleEl = document.querySelector(".brand .role");
    if (isSuper) roleEl.textContent = CURRENT_BUSINESS ? "Суперадмин · " + CURRENT_BUSINESS.name : "Суперадмин";
    else if (isCashier) roleEl.textContent = "Кассир: " + CASHIER_NAME;
    else roleEl.textContent = (window.BUSINESS_NAME ? window.BUSINESS_NAME + " · " : "") + "Админ";

    const banner = document.getElementById("bizBanner");
    if (isSuper && CURRENT_BUSINESS) {
        banner.textContent = "Вы просматриваете бизнес: " + CURRENT_BUSINESS.name + " (нажмите «Бизнесы» в меню, чтобы вернуться)";
        banner.classList.add("show");
    } else {
        banner.classList.remove("show");
    }
}

function logout() {
    const t = TOKEN;
    const done = () => {
        localStorage.removeItem("haki_session");
        sessionStorage.removeItem("haki_business");
        location.reload();
    };
    if (!t) return done();
    fetch(API + "/auth/logout", { method: "POST", headers: { "Authorization": "Bearer " + t } }).finally(done);
}

function tryRestoreSession() {
    const raw = localStorage.getItem("haki_session");
    if (!raw) return;
    try {
        const session = JSON.parse(raw);
        if (!session.token) { localStorage.removeItem("haki_session"); return; }
        applySession(session);
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
    const headers = { "Content-Type": "application/json" };
    if (TOKEN) headers["Authorization"] = "Bearer " + TOKEN;
    if (CURRENT_ROLE === "SUPERADMIN" && CURRENT_BUSINESS) headers["X-Business-Id"] = CURRENT_BUSINESS.id;
    const res = await fetch(API + path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    if (res.status === 401) {
        localStorage.removeItem("haki_session");
        sessionStorage.removeItem("haki_business");
        toast("Сессия истекла — войдите заново", true);
        setTimeout(() => location.reload(), 900);
        throw new Error("Сессия истекла");
    }
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

/** Zagruzka paneli: oshibka ne dolzhna ostavlyat' "visyaschiy" ekran bez soobscheniya. */
function safeLoad(fn) {
    Promise.resolve().then(fn).catch(e => toast("Ошибка загрузки: " + e.message, true));
}

function switchPanel(name) {
    if (name === "businesses" && CURRENT_BUSINESS) {
        // vyhod iz rezhima prosmotra biznesa
        CURRENT_BUSINESS = null;
        sessionStorage.removeItem("haki_business");
        updateNav();
    }
    document.querySelectorAll(".nav-item[data-panel]").forEach(i => i.classList.toggle("active", i.dataset.panel === name));
    document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === "panel-" + name));

    if (name === "pos") safeLoad(refreshShiftBanner);
    if (name === "receipts") safeLoad(loadReceipts);
    if (name === "shifts") safeLoad(loadShiftsPanel);
    if (name === "expenses") safeLoad(loadExpensesPanel);
    if (name === "stock-in") safeLoad(() => Promise.all([loadProductSelect("inProductSelect"), loadMovements("IN")]));
    if (name === "stock-out") safeLoad(() => Promise.all([loadProductSelect("outProductSelect"), loadMovements("OUT")]));
    if (name === "products") safeLoad(loadProductsTable);
    if (name === "customers") safeLoad(loadCustomersTable);
    if (name === "dashboard") safeLoad(loadDashboard);
    if (name === "branches") safeLoad(loadBranches);
    if (name === "cashiers") safeLoad(loadCashiers);
    if (name === "businesses") safeLoad(loadBusinesses);
}

// ---------- POS ----------

/** Obnovlyaet spisok tovarov; kategorii berutsya iz samih tovarov (otdel'nyy zapros ne nuzhen). */
async function refreshProducts() {
    allProducts = await api("/products");
    categories = ["Все", ...new Set(allProducts.map(p => p.category).filter(Boolean))];
    if (!categories.includes(activeCategory)) activeCategory = "Все";
    renderTabs();
    renderProductList();
}

async function initPos() {
    await Promise.all([refreshProducts(), refreshShiftBanner()]);
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

    let list = allProducts;
    if (activeCategory !== "Все") list = list.filter(p => p.category === activeCategory);
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q));

    if (list.length === 0) {
        box.innerHTML = '<div class="cart-empty">Ничего не найдено</div>';
        return;
    }

    // vse kartochki odnoy strokoy - bystree, chem sozdavat' elementy po odnomu
    box.innerHTML = list.map(p => {
        const priceLabel = priceLabelFor(p);
        const sizesLabel = Object.keys(p.prices).filter(s => s !== "BASE").join(" · ");
        return `<div class="product-card" data-id="${esc(p.id)}">
            <div class="product-thumb">📦</div>
            <div class="product-info">
                <div class="product-name">${esc(p.name)}</div>
                ${sizesLabel ? `<div class="product-sizes">${esc(sizesLabel)}</div>` : ""}
                <div class="product-stock ${p.isLowStock ? "low" : ""}">Остаток: ${p.stockQty} ${esc(p.unit)}</div>
            </div>
            <div class="product-price">${priceLabel}</div>
        </div>`;
    }).join("");
}

// odin obrabotchik na ves' spisok (vmesto obrabotchika na kazhduyu kartochku)
document.getElementById("posList").addEventListener("click", (e) => {
    const card = e.target.closest(".product-card");
    if (!card) return;
    const p = allProducts.find(x => x.id === card.dataset.id);
    if (p) addToCartFlow(p);
});

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
                <div>${esc(item.productName)} ${item.size ? "(" + esc(item.size) + ")" : ""}</div>
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

// poisk: ne perestraivaem spisok na kazhduyu bukvu, a tol'ko kogda polzovatel' na sekundu ostanovilsya
let searchDebounce;
document.getElementById("posSearch").addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(renderProductList, 120);
});

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
        banner.innerHTML = `<span>Смена открыта: <b>${esc(s.cashierName)}</b> · с ${fmtDateTime(s.openedAt)}</span>
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

// zaschita ot dvoynogo nazhatiya: pri medlennom internete kassir mog nazhat' "Oplatit'" dvazhdy i probit' chek dvazhdy
let payInFlight = false;

document.getElementById("payModalConfirm").onclick = async () => {
    if (payInFlight) return;
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

    const btn = document.getElementById("payModalConfirm");
    const oldText = btn.textContent;
    payInFlight = true;
    btn.disabled = true;
    btn.textContent = "Проводим…";

    try {
        const saved = await api("/orders", { method: "POST", body: JSON.stringify(order) });
        let msg = "Чек " + saved.id + " оплачен: " + money(saved.total);
        if (saved.bonusEarned > 0) msg += " · начислено бонусов: " + money(saved.bonusEarned);
        toast(msg);

        // srazu pokazyvaem novye ostatki, ne zhdyom otveta servera
        const sold = cart;
        cart = [];
        renderCart();
        closePayModal();
        sold.forEach(i => {
            const p = allProducts.find(x => x.id === i.productId);
            if (p) p.stockQty = Math.max(0, p.stockQty - i.quantity);
        });
        renderProductList();

        // tochnye dannye podtyagivaem v fone
        Promise.all([refreshProducts(), refreshShiftBanner()]).catch(() => {});
    } catch (e) {
        toast(e.message, true);
    } finally {
        payInFlight = false;
        btn.disabled = false;
        btn.textContent = oldText;
    }
};

// ---------- CHEKI ----------

async function loadReceipts() {
    const orders = await api("/orders"); // novye pervymi
    const body = document.getElementById("receiptsBody");
    const methodLabel = { CASH: "Наличные", CARD: "Карта", MIXED: "Смешанная", DEBT: "Долг" };
    body.innerHTML = orders.map(o => `<tr><td>${esc(o.id)}</td><td>${fmtDateTime(o.createdAt)}</td><td>${esc(o.cashierName) || "—"}</td>
            <td>${methodLabel[o.paymentMethod] || esc(o.paymentMethod)}</td>
            <td>${esc(o.customerPhone) || "—"}</td><td>${money(o.total)}</td></tr>`).join("");
}

// ---------- SMENY ----------

async function loadShiftsPanel() {
    // vse zaprosy srazu, а ne po ocheredi
    const [, cur, history] = await Promise.all([
        loadCashierSelect(),
        api("/shifts/current"),
        api("/shifts/history")
    ]);
    currentShiftData = cur;

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
                    ${note.comment ? "«" + esc(note.comment) + "»" : ""}`;
                document.getElementById("shiftOpenAmount").value = note.amount;
                document.getElementById("shiftOpenComment").value = note.comment || "";
            }
        } catch (e) { noteBox.style.display = "none"; }
    }

    renderShiftCards(document.getElementById("shiftHistoryGrid"), history.map(s => ({ shift: s })), true);
}

async function loadCashierSelect() {
    const sel = document.getElementById("shiftOpenCashier");
    sel.innerHTML = "";
    // Spisok kassirov dostupen tol'ko adminu; kassir otkryvaet smenu na sebya.
    if (CURRENT_ROLE === "CASHIER") {
        const opt = document.createElement("option");
        opt.value = CASHIER_NAME;
        opt.textContent = CASHIER_NAME;
        sel.appendChild(opt);
        return;
    }
    const cashiers = await api("/cashiers");
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
                <div class="cashier">${esc(s.cashierName)}</div>
                <span class="status-pill ${s.status === "OPEN" ? "open" : "closed"}">${s.status === "OPEN" ? "открыта" : "закрыта"}</span>
            </div>
            <div class="meta">${esc(s.branchName) || ""} · ${period}</div>
            <div class="row"><span>Наличные</span><b>${typeof cash === "number" ? money(cash) : cash}</b></div>
            <div class="row"><span>Карта</span><b>${typeof card === "number" ? money(card) : card}</b></div>
            <div class="foot"><span>${receipts} чек.</span>${discHtml}</div>
        `;
        container.appendChild(div);
    });
}

// ---------- RASHODY (kassa) ----------

async function loadExpensesPanel() {
    const list = await api("/expenses"); // novye pervymi
    const body = document.getElementById("expHistoryBody");
    body.innerHTML = list.map(e => `<tr><td>${fmtDateTime(e.createdAt)}</td><td>${money(e.amount)}</td><td>${esc(e.comment) || "—"}</td><td>${esc(e.cashierName) || "—"}</td></tr>`).join("");
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
    const movements = await api("/inventory/movements"); // novye pervymi
    const filtered = movements.filter(m => m.type === type);
    const bodyId = type === "IN" ? "inHistoryBody" : "outHistoryBody";
    const body = document.getElementById(bodyId);
    body.innerHTML = filtered.map(m => `<tr><td>${fmtDateTime(m.createdAt)}</td><td>${esc(m.productName)}</td><td>${m.quantity}</td><td>${esc(m.comment) || "—"}</td></tr>`).join("");
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
        await Promise.all([loadProductSelect(prefix + "ProductSelect"), loadMovements(type)]);
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
            <td>${esc(p.name)}</td>
            <td>${esc(p.category)}</td>
            <td>${priceLabelFor(p)}</td>
            <td style="${p.isLowStock ? "color:var(--danger)" : ""}">${p.stockQty} ${esc(p.unit)}</td>
            <td><button class="btn danger" data-id="${esc(p.id)}">Удалить</button></td>
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
    const customers = await api("/customers"); // odin zapros vmesto zaprosa na kazhdogo klienta
    const body = document.getElementById("customersBody");
    if (customers.length === 0) {
        body.innerHTML = '<tr><td colspan="4" style="color:var(--text-dim)">Пока нет клиентов с бонусным счётом</td></tr>';
        return;
    }
    body.innerHTML = customers.map(c => `<tr><td>${esc(c.phone)}</td><td>${money(c.balance)}</td>
                <td style="${c.debtBalance > 0 ? "color:var(--danger); font-weight:700;" : ""}">${money(c.debtBalance)}</td>
                <td>${money(c.totalSpent)}</td></tr>`).join("");
}

// ---------- DASHBOARD ----------

document.querySelectorAll(".period-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        dashboardPeriod = tab.dataset.period;
        document.querySelectorAll(".period-tab").forEach(t => t.classList.toggle("active", t === tab));
        safeLoad(loadDashboard);
    });
});
document.querySelectorAll(".payment-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        dashboardPayMethod = tab.dataset.method;
        document.querySelectorAll(".payment-tab").forEach(t => t.classList.toggle("active", t === tab));
        renderPaymentBreakdown(); // dannye uzhe est' - zapros ne nuzhen
    });
});

async function loadDashboard() {
    const [s, openShifts, history] = await Promise.all([
        api("/dashboard/summary?period=" + dashboardPeriod),
        api("/dashboard/open-shifts"),
        api("/dashboard/shift-history")
    ]);

    document.getElementById("statOpenShifts").textContent = s.openShiftsCount;
    document.getElementById("statRevenue").textContent = money(s.revenueTotal);
    document.getElementById("statCash").textContent = money(s.cashTotal);
    document.getElementById("statCard").textContent = money(s.cardTotal);

    const badge = document.getElementById("dashboardBadge");
    if (s.lowStockCount > 0) { badge.style.display = "inline-block"; badge.textContent = s.lowStockCount; }
    else { badge.style.display = "none"; }

    const lowBody = document.getElementById("lowStockBody");
    lowBody.innerHTML = s.lowStockProducts.map(p => `<tr><td>${esc(p.name)}</td><td style="color:var(--danger)">${p.stockQty}</td><td>${p.minStockQty}</td></tr>`).join("");

    dashboardBreakdown = s.breakdown;
    renderPaymentBreakdown();

    renderShiftCards(document.getElementById("openShiftsGrid"), openShifts, false);
    renderShiftCards(document.getElementById("dashShiftHistoryGrid"), history, true);
}

function renderPaymentBreakdown() {
    if (!dashboardBreakdown) return;
    const data = dashboardBreakdown[dashboardPayMethod] || dashboardBreakdown.all;
    document.getElementById("paymentSummaryLine").textContent = `${data.count} чек. · ${money(data.total)}`;
}

// ---------- FILIALY ----------

async function loadBranches() {
    const branches = await api("/branches");
    const body = document.getElementById("branchesBody");
    body.innerHTML = "";
    branches.forEach(b => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${esc(b.name)}</td><td>${esc(b.address) || "—"}</td><td><button class="btn danger" data-id="${esc(b.id)}">Удалить</button></td>`;
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
        tr.innerHTML = `<td>${esc(c.name)}</td><td>${esc(c.role)}</td><td>${esc(c.username) || "—"}</td><td>${esc(c.branchName) || "—"}</td><td><button class="btn danger" data-id="${esc(c.id)}">Удалить</button></td>`;
        tr.querySelector("button").onclick = async () => { await api("/cashiers/" + c.id, { method: "DELETE" }); loadCashiers(); };
        body.appendChild(tr);
    });
}
document.getElementById("addCashierBtn").onclick = async () => {
    const name = prompt("Имя кассира:");
    if (!name) return;
    const username = prompt("Логин для входа кассира:");
    if (!username) return;
    const password = prompt("Пароль для входа кассира (не короче 6 символов):");
    if (!password) return;
    try {
        await api("/cashiers", {
            method: "POST",
            body: JSON.stringify({ name, username, password, role: "Кассир", branchName: "Главный филиал" })
        });
        toast("Кассир добавлен — логин: " + username);
        loadCashiers();
    } catch (e) { toast(e.message, true); }
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

// ---------- SUPERADMIN: biznesy ----------

async function loadBusinesses() {
    const body = document.getElementById("businessesBody");
    body.innerHTML = '<tr><td colspan="9">Загрузка…</td></tr>';
    try {
        const list = await api("/superadmin/businesses");
        body.innerHTML = "";
        if (list.length === 0) {
            body.innerHTML = '<tr><td colspan="9">Бизнесов пока нет. Нажмите «Создать бизнес и админа».</td></tr>';
            return;
        }
        list.forEach(b => {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td><b>${esc(b.name)}</b></td><td>${b.admins}</td><td>${b.cashiers}</td><td>${b.products}</td><td>${b.orders}</td>
                <td>${money(b.revenueToday)}</td><td>${money(b.revenue)}</td>
                <td><span class="status-pill ${b.active ? "on" : "off"}">${b.active ? "активен" : "отключён"}</span></td>
                <td style="white-space:nowrap">
                    <button class="btn primary" data-act="open">Открыть</button>
                    <button class="btn" data-act="users">Админы</button>
                    <button class="btn ${b.active ? "danger" : ""}" data-act="toggle">${b.active ? "Отключить" : "Включить"}</button>
                </td>`;
            tr.querySelector('[data-act="open"]').onclick = () => openBusiness(b);
            tr.querySelector('[data-act="users"]').onclick = () => openBusinessUsers(b);
            tr.querySelector('[data-act="toggle"]').onclick = async () => {
                if (b.active && !confirm("Отключить бизнес «" + b.name + "»? Все его пользователи не смогут войти.")) return;
                try {
                    await api("/superadmin/businesses/" + encodeURIComponent(b.id) + "/active", { method: "POST", body: JSON.stringify({ active: !b.active }) });
                    loadBusinesses();
                } catch (e) { toast(e.message, true); }
            };
            body.appendChild(tr);
        });
    } catch (e) {
        body.innerHTML = '<tr><td colspan="9">Не удалось загрузить: ' + esc(e.message) + '</td></tr>';
    }
}

function openBusiness(b) {
    CURRENT_BUSINESS = { id: b.id, name: b.name };
    sessionStorage.setItem("haki_business", JSON.stringify(CURRENT_BUSINESS));
    cart = [];
    activeCategory = "Все";
    updateNav();
    switchPanel("pos");
    initPos().then(() => renderCart()).catch(e => toast("Ошибка загрузки: " + e.message, true));
}

document.getElementById("addBusinessBtn").onclick = async () => {
    const businessName = prompt("Название бизнеса:");
    if (!businessName) return;
    const adminName = prompt("Имя администратора этого бизнеса:");
    if (!adminName) return;
    const username = prompt("Логин администратора (не короче 3 символов, без пробелов):");
    if (!username) return;
    const password = prompt("Пароль администратора (не короче 6 символов):");
    if (!password) return;
    try {
        await api("/superadmin/businesses", { method: "POST", body: JSON.stringify({ businessName, adminName, username, password }) });
        toast("Бизнес создан. Логин админа: " + username);
        loadBusinesses();
    } catch (e) { toast(e.message, true); }
};

let usersBusiness = null;

async function openBusinessUsers(b) {
    usersBusiness = b;
    document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === "panel-business-users"));
    document.getElementById("businessUsersTitle").textContent = "Пользователи: " + b.name;
    await loadBusinessUsers();
}

async function loadBusinessUsers() {
    const body = document.getElementById("businessUsersBody");
    body.innerHTML = '<tr><td colspan="5">Загрузка…</td></tr>';
    try {
        const users = await api("/superadmin/businesses/" + encodeURIComponent(usersBusiness.id) + "/users");
        body.innerHTML = "";
        users.forEach(u => {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td>${esc(u.name)}</td><td>${u.role === "ADMIN" ? "Админ" : "Кассир"}</td><td>${esc(u.username)}</td>
                <td><span class="status-pill ${u.active ? "on" : "off"}">${u.active ? "активен" : "отключён"}</span></td>
                <td style="white-space:nowrap">
                    <button class="btn" data-act="pwd">Новый пароль</button>
                    <button class="btn ${u.active ? "danger" : ""}" data-act="toggle">${u.active ? "Отключить" : "Включить"}</button>
                </td>`;
            tr.querySelector('[data-act="pwd"]').onclick = async () => {
                const password = prompt("Новый пароль для " + u.username + " (не короче 6 символов):");
                if (!password) return;
                try {
                    await api("/superadmin/users/" + encodeURIComponent(u.id) + "/password", { method: "POST", body: JSON.stringify({ password }) });
                    toast("Пароль изменён");
                } catch (e) { toast(e.message, true); }
            };
            tr.querySelector('[data-act="toggle"]').onclick = async () => {
                try {
                    await api("/superadmin/users/" + encodeURIComponent(u.id) + "/active", { method: "POST", body: JSON.stringify({ active: !u.active }) });
                    loadBusinessUsers();
                } catch (e) { toast(e.message, true); }
            };
            body.appendChild(tr);
        });
    } catch (e) {
        body.innerHTML = '<tr><td colspan="5">Не удалось загрузить: ' + esc(e.message) + '</td></tr>';
    }
}

document.getElementById("businessUsersBackBtn").onclick = () => switchPanel("businesses");

document.getElementById("addBusinessAdminBtn").onclick = async () => {
    if (!usersBusiness) return;
    const name = prompt("Имя нового администратора:");
    if (!name) return;
    const username = prompt("Логин (не короче 3 символов, без пробелов):");
    if (!username) return;
    const password = prompt("Пароль (не короче 6 символов):");
    if (!password) return;
    try {
        await api("/superadmin/businesses/" + encodeURIComponent(usersBusiness.id) + "/admins", { method: "POST", body: JSON.stringify({ name, username, password }) });
        toast("Админ добавлен");
        loadBusinessUsers();
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

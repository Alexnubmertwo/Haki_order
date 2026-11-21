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
let categoriesCache = [];      // [{name, products}] - sobstvennye kategorii biznesa
let receiptsCache = [];        // poslednie cheki dlya filtrov
let currentReceipt = null;     // chek, otkrytyy v okne

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

    if (name === "pos") safeLoad(() => Promise.all([refreshShiftBanner(), refreshProducts()]));
    if (name === "receipts") safeLoad(loadReceipts);
    if (name === "shifts") safeLoad(loadShiftsPanel);
    if (name === "expenses") safeLoad(loadExpensesPanel);
    if (name === "stock-in") safeLoad(() => Promise.all([loadProductSelect("inProductSelect"), loadMovements("IN")]));
    if (name === "stock-out") safeLoad(() => Promise.all([loadProductSelect("outProductSelect"), loadMovements("OUT")]));
    if (name === "products") safeLoad(loadProductsTable);
    if (name === "categories") safeLoad(loadCategories);
    if (name === "reports") safeLoad(loadReports);
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

/** Tovary, kotorye seychas vidny na kasse (kategoriya + poisk). */
function visibleProducts() {
    const q = document.getElementById("posSearch").value.trim().toLowerCase();
    let list = allProducts;
    if (activeCategory !== "Все") list = list.filter(p => p.category === activeCategory);
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q));
    return list;
}

function renderProductList() {
    const box = document.getElementById("posList");
    const list = visibleProducts();

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

/** Tovar s neskol'kimi razmerami - snachala sprashivaem razmer, inache srazu v korzinu. */
function addToCartFlow(product) {
    const sizes = Object.keys(product.prices).filter(s => s !== "BASE");
    if (sizes.length > 1) { openSizeModal(product, sizes); return; }
    if (sizes.length === 1) { pushToCart(product, sizes[0], product.prices[sizes[0]]); return; }
    pushToCart(product, null, product.prices.BASE);
}

function openSizeModal(product, sizes) {
    document.getElementById("sizeModalTitle").textContent = product.name;
    const box = document.getElementById("sizeModalButtons");
    box.innerHTML = sizes.map(s =>
        `<button class="size-btn" data-size="${esc(s)}"><span>${esc(s)}</span><b>${money(product.prices[s])}</b></button>`).join("");
    box.onclick = (e) => {
        const b = e.target.closest(".size-btn");
        if (!b) return;
        hideModal("sizeModalBackdrop");
        pushToCart(product, b.dataset.size, product.prices[b.dataset.size]);
    };
    showModal("sizeModalBackdrop");
}
document.getElementById("sizeModalCancel").onclick = () => hideModal("sizeModalBackdrop");

function pushToCart(product, size, price) {
    if (product.stockQty <= 0) toast("Остаток «" + product.name + "»: 0 — проверьте склад", true);
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
// Enter v poiske - srazu dobavit' pervyy naydennyy tovar (udobno s klaviaturoy / skanerom)
document.getElementById("posSearch").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    clearTimeout(searchDebounce);
    const list = visibleProducts();
    if (document.getElementById("posSearch").value.trim() && list.length > 0) {
        addToCartFlow(list[0]);
        document.getElementById("posSearch").value = "";
        renderProductList();
    }
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
    document.getElementById("payPrintCheck").checked = localStorage.getItem("haki_print") === "1";
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

    const printAfter = document.getElementById("payPrintCheck").checked;
    localStorage.setItem("haki_print", printAfter ? "1" : "0");

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

        if (printAfter) printReceipt(saved);
    } catch (e) {
        toast(e.message, true);
    } finally {
        payInFlight = false;
        btn.disabled = false;
        btn.textContent = oldText;
    }
};

// ---------- CHEKI ----------

const METHOD_LABEL = { CASH: "Наличные", CARD: "Карта", MIXED: "Смешанная", DEBT: "Долг" };

async function loadReceipts() {
    receiptsCache = await api("/orders"); // novye pervymi
    renderReceipts();
}

/** Filtry po tekstu, sposobu oplaty i periodu rabotayut na uzhe zagruzhennyh chekah - bez novyh zaprosov. */
function renderReceipts() {
    const q = document.getElementById("rcSearch").value.trim().toLowerCase();
    const method = document.getElementById("rcMethod").value;
    const period = document.getElementById("rcPeriod").value;
    let since = 0;
    if (period === "today") { const d = new Date(); d.setHours(0, 0, 0, 0); since = d.getTime(); }
    else if (period === "7d") since = Date.now() - 7 * 86400000;

    const list = receiptsCache.filter(o =>
        (!method || o.paymentMethod === method) &&
        (!since || new Date(o.createdAt).getTime() >= since) &&
        (!q || [o.id, o.cashierName, o.customerPhone].some(v => (v || "").toLowerCase().includes(q))));

    const sum = list.reduce((s, o) => s + (o.total || 0), 0);
    document.getElementById("rcSummary").textContent = list.length + " чек. · " + money(sum);
    document.getElementById("receiptsBody").innerHTML = list.length === 0
        ? '<tr><td colspan="6" class="muted">Чеков не найдено</td></tr>'
        : list.map(o => `<tr data-id="${esc(o.id)}"><td>${esc(o.id)}</td><td>${fmtDateTime(o.createdAt)}</td><td>${esc(o.cashierName) || "—"}</td>
            <td>${METHOD_LABEL[o.paymentMethod] || esc(o.paymentMethod)}</td>
            <td>${esc(o.customerPhone) || "—"}</td><td>${money(o.total)}</td></tr>`).join("");
}

let rcDebounce;
document.getElementById("rcSearch").addEventListener("input", () => { clearTimeout(rcDebounce); rcDebounce = setTimeout(renderReceipts, 150); });
document.getElementById("rcMethod").addEventListener("change", renderReceipts);
document.getElementById("rcPeriod").addEventListener("change", renderReceipts);

document.getElementById("receiptsBody").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    const o = receiptsCache.find(x => x.id === tr.dataset.id);
    if (o) openReceiptModal(o);
});

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

// ---------- OKNA (obschie pomoschniki) ----------

function showModal(id) { document.getElementById(id).classList.add("show"); }
function hideModal(id) { document.getElementById(id).classList.remove("show"); }

document.addEventListener("keydown", (e) => {
    // Esc - zakryt' otkrytoe okno
    if (e.key === "Escape") {
        document.querySelectorAll(".modal-backdrop.show").forEach(m => m.classList.remove("show"));
    }
    // F2 - oplata tekuschego cheka
    if (e.key === "F2" && cart.length > 0
        && !document.querySelector(".modal-backdrop.show")
        && document.getElementById("panel-pos").classList.contains("active")) {
        e.preventDefault();
        openPayModal();
    }
});

const num = n => (n || 0).toLocaleString("ru-RU");

// ---------- TOVARY ----------

function categoryNames() {
    return [...new Set([...categoriesCache.map(c => c.name), ...allProducts.map(p => p.category)])]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "ru"));
}

async function loadProductsTable() {
    const [prods, cats] = await Promise.all([api("/products"), api("/categories").catch(() => [])]);
    allProducts = prods;
    categoriesCache = cats;
    const sel = document.getElementById("prCategory");
    const prev = sel.value;
    const names = categoryNames();
    sel.innerHTML = '<option value="">Все категории</option>' + names.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    sel.value = names.includes(prev) ? prev : "";
    renderProductsTable();
}

function renderProductsTable() {
    const q = document.getElementById("prSearch").value.trim().toLowerCase();
    const cat = document.getElementById("prCategory").value;
    const list = allProducts.filter(p => (!cat || p.category === cat) && (!q || p.name.toLowerCase().includes(q)));
    document.getElementById("prSummary").textContent = list.length + " из " + allProducts.length + " товаров";
    document.getElementById("productsBody").innerHTML = list.length === 0
        ? '<tr><td colspan="5" class="muted">Товаров не найдено</td></tr>'
        : list.map(p => `<tr data-id="${esc(p.id)}">
            <td>${esc(p.name)}</td>
            <td><span class="tag">${esc(p.category)}</span></td>
            <td>${priceLabelFor(p)}</td>
            <td style="${p.isLowStock ? "color:var(--danger)" : ""}">${p.stockQty} ${esc(p.unit)}</td>
            <td class="row-actions"><button class="btn" data-act="edit">Изменить</button><button class="btn danger" data-act="del">Удалить</button></td>
        </tr>`).join("");
}

let prDebounce;
document.getElementById("prSearch").addEventListener("input", () => { clearTimeout(prDebounce); prDebounce = setTimeout(renderProductsTable, 150); });
document.getElementById("prCategory").addEventListener("change", renderProductsTable);

document.getElementById("productsBody").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    const tr = e.target.closest("tr[data-id]");
    if (!btn || !tr) return;
    const p = allProducts.find(x => x.id === tr.dataset.id);
    if (!p) return;
    if (btn.dataset.act === "edit") { openProductModal(p); return; }
    if (!confirm("Удалить товар «" + p.name + "»?")) return;
    try {
        await api("/products/" + encodeURIComponent(p.id), { method: "DELETE" });
        toast("Товар удалён");
        loadProductsTable();
    } catch (err) { toast(err.message, true); }
});

// ---------- OKNO TOVARA (dobavit' / izmenit') ----------

let editingProductId = null;
let pmInFlight = false;

function pmSizeRow(label = "", price = "") {
    return `<div class="pm-size-row">
        <input type="text" class="pm-size-label" placeholder="Размер (S, M, L…)" value="${esc(label)}" maxlength="12">
        <input type="number" class="pm-size-price" min="0" placeholder="Цена" value="${esc(price)}">
        <button class="btn danger pm-del" type="button" title="Убрать">✕</button>
    </div>`;
}

function setPmMulti(on) {
    document.getElementById("pmSingle").style.display = on ? "none" : "grid";
    document.getElementById("pmSizes").style.display = on ? "block" : "none";
}

function openProductModal(p) {
    editingProductId = p ? p.id : null;
    document.getElementById("productModalTitle").textContent = p ? "Изменить товар" : "Новый товар";
    document.getElementById("pmName").value = p ? p.name : "";
    document.getElementById("pmCategory").value = p ? p.category : (document.getElementById("prCategory").value || "");
    document.getElementById("pmCategoryList").innerHTML = categoryNames().map(c => `<option value="${esc(c)}"></option>`).join("");
    document.getElementById("pmUnit").value = p ? p.unit : "шт";
    document.getElementById("pmMin").value = p ? p.minStockQty : 5;

    const stock = document.getElementById("pmStock");
    stock.value = p ? p.stockQty : 0;
    stock.disabled = !!p;
    document.getElementById("pmStockLabel").textContent = p
        ? "Остаток (меняется через «Приход» и «Расход товара»)" : "Начальный остаток";

    const sizes = p ? Object.keys(p.prices).filter(s => s !== "BASE") : [];
    const multi = sizes.length > 0;
    document.getElementById("pmMulti").checked = multi;
    setPmMulti(multi);
    document.getElementById("pmPrice").value = p && !multi && p.prices.BASE != null ? p.prices.BASE : "";
    document.getElementById("pmSizeRows").innerHTML = multi ? sizes.map(s => pmSizeRow(s, p.prices[s])).join("") : "";

    showModal("productModalBackdrop");
    document.getElementById("pmName").focus();
}

document.getElementById("addProductBtn").onclick = () => openProductModal(null);
document.getElementById("pmCancel").onclick = () => hideModal("productModalBackdrop");

document.getElementById("pmMulti").addEventListener("change", (e) => {
    setPmMulti(e.target.checked);
    const rows = document.getElementById("pmSizeRows");
    if (e.target.checked && rows.children.length === 0) rows.innerHTML = pmSizeRow("S") + pmSizeRow("M");
});
document.getElementById("pmAddSize").onclick = () => {
    document.getElementById("pmSizeRows").insertAdjacentHTML("beforeend", pmSizeRow());
};
document.getElementById("pmSizeRows").addEventListener("click", (e) => {
    const del = e.target.closest(".pm-del");
    if (del) del.closest(".pm-size-row").remove();
});

document.getElementById("pmSave").onclick = async () => {
    if (pmInFlight) return;
    const name = document.getElementById("pmName").value.trim();
    if (!name) { toast("Введите название товара", true); return; }
    const category = document.getElementById("pmCategory").value.trim() || "Остальные";
    const unit = document.getElementById("pmUnit").value.trim() || "шт";
    const stockQty = editingProductId ? 0 : Math.max(0, parseInt(document.getElementById("pmStock").value || "0", 10) || 0);
    const minStockQty = Math.max(0, parseInt(document.getElementById("pmMin").value || "0", 10) || 0);

    let prices = {};
    if (document.getElementById("pmMulti").checked) {
        for (const row of document.querySelectorAll("#pmSizeRows .pm-size-row")) {
            const label = row.querySelector(".pm-size-label").value.trim();
            const priceStr = row.querySelector(".pm-size-price").value;
            if (!label && priceStr === "") continue; // pustuyu stroku propuskaem
            const price = parseInt(priceStr, 10);
            if (!label || isNaN(price) || price < 0) { toast("Заполните размер и цену в каждой строке", true); return; }
            if (label.toUpperCase() === "BASE") { toast("Название размера «BASE» зарезервировано", true); return; }
            if (prices[label] !== undefined) { toast("Размер «" + label + "» указан дважды", true); return; }
            prices[label] = price;
        }
        if (Object.keys(prices).length === 0) { toast("Добавьте хотя бы один размер с ценой", true); return; }
    } else {
        const price = parseInt(document.getElementById("pmPrice").value, 10);
        if (isNaN(price) || price < 0) { toast("Укажите цену", true); return; }
        prices = { BASE: price };
    }

    const btn = document.getElementById("pmSave");
    pmInFlight = true;
    btn.disabled = true;
    try {
        const editing = !!editingProductId;
        await api(editing ? "/products/" + encodeURIComponent(editingProductId) : "/products", {
            method: editing ? "PUT" : "POST",
            body: JSON.stringify({ name, category, prices, stockQty, minStockQty, unit })
        });
        hideModal("productModalBackdrop");
        toast(editing ? "Товар сохранён" : "Товар добавлен");
        await loadProductsTable();
    } catch (e) {
        toast(e.message, true);
    } finally {
        pmInFlight = false;
        btn.disabled = false;
    }
};

// ---------- KATEGORII ----------

async function loadCategories() {
    categoriesCache = await api("/categories");
    document.getElementById("categoriesBody").innerHTML = categoriesCache.length === 0
        ? '<tr><td colspan="3" class="muted">Категорий пока нет. Нажмите «Новая категория».</td></tr>'
        : categoriesCache.map(c => `<tr data-name="${esc(c.name)}">
            <td><b>${esc(c.name)}</b></td>
            <td>${c.products}</td>
            <td class="row-actions"><button class="btn" data-act="edit">Название и товары</button><button class="btn danger" data-act="del">Удалить</button></td>
        </tr>`).join("");
}

document.getElementById("categoriesBody").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    const tr = e.target.closest("tr[data-name]");
    if (!btn || !tr) return;
    const cat = categoriesCache.find(c => c.name === tr.dataset.name);
    if (!cat) return;
    if (btn.dataset.act === "edit") { openCategoryModal(cat); return; }
    const extra = cat.products > 0 ? " Её товары (" + cat.products + ") перейдут в «Остальные»." : "";
    if (!confirm("Удалить категорию «" + cat.name + "»?" + extra)) return;
    try {
        await api("/categories/delete", { method: "POST", body: JSON.stringify({ name: cat.name }) });
        toast("Категория удалена");
        await loadCategories();
        refreshProducts().catch(() => {});
    } catch (err) { toast(err.message, true); }
});

document.getElementById("addCategoryBtn").onclick = () => openCategoryModal(null);

let catEditing = null;       // ishodnoe nazvanie ili null dlya novoy
let cmSelected = new Set();  // id otmechennyh tovarov
let cmOrder = [];            // poryadok spiska na vremya okna
let cmInFlight = false;

function cmVisible() {
    const q = document.getElementById("cmSearch").value.trim().toLowerCase();
    return q ? cmOrder.filter(p => p.name.toLowerCase().includes(q)) : cmOrder;
}

function updateCmCount() {
    document.getElementById("cmCount").textContent = "Выбрано: " + cmSelected.size + " из " + allProducts.length;
}

function renderCmList() {
    const list = cmVisible();
    document.getElementById("cmList").innerHTML = list.length === 0
        ? '<div class="cart-empty" style="margin:18px 0;">Товаров не найдено</div>'
        : list.map(p => `<label class="cm-row">
            <input type="checkbox" data-id="${esc(p.id)}" ${cmSelected.has(p.id) ? "checked" : ""}>
            <span class="cm-name">${esc(p.name)}</span>
            ${p.category && p.category !== catEditing ? `<span class="cm-cat">${esc(p.category)}</span>` : ""}
        </label>`).join("");
    updateCmCount();
}

async function openCategoryModal(cat) {
    try {
        allProducts = await api("/products"); // aktual'nye kategorii tovarov
    } catch (e) { toast(e.message, true); return; }
    catEditing = cat ? cat.name : null;
    cmSelected = new Set(cat ? allProducts.filter(p => p.category === cat.name).map(p => p.id) : []);
    // snachala uzhe vhodyaschie v kategoriyu, dal'she po alfavitu
    cmOrder = [...allProducts].sort((a, b) =>
        (cmSelected.has(b.id) - cmSelected.has(a.id)) || a.name.localeCompare(b.name, "ru"));

    document.getElementById("catModalTitle").textContent = cat ? "Категория «" + cat.name + "»" : "Новая категория";
    const nameInput = document.getElementById("cmName");
    nameInput.value = cat ? cat.name : "";
    nameInput.disabled = !!cat && cat.name === "Остальные";
    document.getElementById("cmSearch").value = "";
    renderCmList();
    showModal("catModalBackdrop");
    if (!nameInput.disabled) nameInput.focus();
}

document.getElementById("cmSearch").addEventListener("input", renderCmList);
document.getElementById("cmList").addEventListener("change", (e) => {
    const id = e.target.dataset && e.target.dataset.id;
    if (!id) return;
    if (e.target.checked) cmSelected.add(id); else cmSelected.delete(id);
    updateCmCount();
});
document.getElementById("cmAll").onclick = () => { cmVisible().forEach(p => cmSelected.add(p.id)); renderCmList(); };
document.getElementById("cmNone").onclick = () => { cmVisible().forEach(p => cmSelected.delete(p.id)); renderCmList(); };
document.getElementById("cmCancel").onclick = () => hideModal("catModalBackdrop");

document.getElementById("cmSave").onclick = async () => {
    if (cmInFlight) return;
    const name = document.getElementById("cmName").value.trim().replace(/\s+/g, " ");
    if (!name) { toast("Введите название категории", true); return; }
    if (name.toLowerCase() === "все") { toast("Название «Все» зарезервировано", true); return; }
    const btn = document.getElementById("cmSave");
    cmInFlight = true;
    btn.disabled = true;
    try {
        if (catEditing && catEditing !== name) {
            await api("/categories/rename", { method: "POST", body: JSON.stringify({ from: catEditing, to: name }) });
        }
        await api("/categories/set", { method: "POST", body: JSON.stringify({ name, productIds: [...cmSelected] }) });
        hideModal("catModalBackdrop");
        toast("Категория сохранена");
        await loadCategories();
        refreshProducts().catch(() => {});
    } catch (e) {
        toast(e.message, true);
    } finally {
        cmInFlight = false;
        btn.disabled = false;
    }
};

// ---------- CHEK: sostav i pechat' ----------

function openReceiptModal(o) {
    currentReceipt = o;
    document.getElementById("rcModalTitle").textContent = "Чек " + o.id;
    const items = (o.items || []).map(i => `<tr><td>${esc(i.productName)}${i.size ? " (" + esc(i.size) + ")" : ""}</td><td>${i.quantity}</td><td>${money(i.price)}</td><td>${money(i.price * i.quantity)}</td></tr>`).join("");
    const lines = [];
    if (o.cashAmount) lines.push(["Наличными", o.cashAmount]);
    if (o.cardAmount) lines.push(["Картой", o.cardAmount]);
    if (o.bonusUsed) lines.push(["Бонусами", o.bonusUsed]);
    if (o.debtAmount) lines.push(["В долг", o.debtAmount]);
    if (o.bonusEarned) lines.push(["Начислено бонусов", o.bonusEarned]);
    document.getElementById("rcModalBody").innerHTML = `
        <div class="rc-meta">${fmtDateTime(o.createdAt)}<br>
            Кассир: ${esc(o.cashierName) || "—"} · Оплата: ${METHOD_LABEL[o.paymentMethod] || esc(o.paymentMethod)}
            ${o.customerPhone ? "<br>Клиент: " + esc(o.customerPhone) : ""}</div>
        <table class="data-table"><thead><tr><th>Товар</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>${items}</tbody></table>
        <div class="rc-total"><span>Итого</span><b>${money(o.total)}</b></div>
        <div class="rc-lines">${lines.map(([l, v]) => `<div><span>${l}</span><b>${money(v)}</b></div>`).join("")}</div>`;
    showModal("receiptModalBackdrop");
}
document.getElementById("rcModalClose").onclick = () => hideModal("receiptModalBackdrop");
document.getElementById("rcModalPrint").onclick = () => printReceipt(currentReceipt);

function receiptHtml(o) {
    const biz = window.BUSINESS_NAME || (CURRENT_BUSINESS && CURRENT_BUSINESS.name) || "Haki";
    const rows = (o.items || []).map(i =>
        `<div class="n">${esc(i.productName)}${i.size ? " (" + esc(i.size) + ")" : ""}</div>
         <div class="l"><span>${i.quantity} × ${num(i.price)}</span><span>${num(i.price * i.quantity)}</span></div>`).join("");
    const pay = [];
    if (o.cashAmount) pay.push(["Наличными", o.cashAmount]);
    if (o.cardAmount) pay.push(["Картой", o.cardAmount]);
    if (o.bonusUsed) pay.push(["Бонусами", o.bonusUsed]);
    if (o.debtAmount) pay.push(["В долг", o.debtAmount]);
    return `<!doctype html><html><head><meta charset="utf-8"><title>Чек ${esc(o.id)}</title>
<style>
 @page { size: 80mm auto; margin: 3mm; }
 body { font-family: "Courier New", monospace; font-size: 12px; width: 74mm; margin: 0; color: #000; }
 h1 { font-size: 15px; text-align: center; margin: 0 0 4px; }
 .c { text-align: center; } .n { margin-top: 4px; }
 .l { display: flex; justify-content: space-between; }
 hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
 .t { font-size: 15px; font-weight: bold; }
</style></head><body>
<h1>${esc(biz)}</h1>
<div class="c">Чек ${esc(o.id)}<br>${esc(fmtDateTime(o.createdAt))}</div><hr>
${rows}<hr>
<div class="l t"><span>ИТОГО</span><span>${num(o.total)} UZS</span></div>
${pay.map(([l, v]) => `<div class="l"><span>${l}</span><span>${num(v)}</span></div>`).join("")}
${o.bonusEarned ? `<div class="l"><span>Начислено бонусов</span><span>${num(o.bonusEarned)}</span></div>` : ""}
<hr><div class="c">Кассир: ${esc(o.cashierName || "—")}<br>Спасибо за покупку!</div>
</body></html>`;
}

/** Pechat' cherez skrytyy iframe: rabotaet v brauzere i v prilozhenii Windows. V Android-prilozhenii pechat' ne podderzhivaetsya. */
function printReceipt(o) {
    if (!o) return;
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(f);
    const doc = f.contentWindow.document;
    doc.open();
    doc.write(receiptHtml(o));
    doc.close();
    setTimeout(() => {
        try { f.contentWindow.focus(); f.contentWindow.print(); }
        catch (e) { toast("Печать недоступна на этом устройстве", true); }
        setTimeout(() => f.remove(), 3000);
    }, 250);
}

// ---------- OTCHYOTY ----------

async function loadReports() {
    const r = await api("/dashboard/reports?period=" + document.getElementById("repPeriod").value);
    const max = Math.max(1, ...r.top.map(t => t.revenue));
    document.getElementById("repTopBody").innerHTML = r.top.length === 0
        ? '<tr><td colspan="5" class="muted">За этот период продаж нет</td></tr>'
        : r.top.map((t, i) => `<tr><td>${i + 1}</td><td>${esc(t.name)}</td><td>${t.qty}</td><td>${money(t.revenue)}</td>
            <td><div class="bar"><i style="width:${Math.round(t.revenue / max * 100)}%"></i></div></td></tr>`).join("");
    document.getElementById("repCashiersBody").innerHTML = r.cashiers.length === 0
        ? '<tr><td colspan="3" class="muted">За этот период продаж нет</td></tr>'
        : r.cashiers.map(c => `<tr><td>${esc(c.cashier)}</td><td>${c.receipts}</td><td>${money(c.total)}</td></tr>`).join("");
}
document.getElementById("repPeriod").addEventListener("change", () => safeLoad(loadReports));

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

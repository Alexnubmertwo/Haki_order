package com.haki.pos.service;

import com.haki.pos.model.*;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Chernovoe in-memory hranilische dannyh dlya Haki.
 * Vsyo jivyot poka prilojenie zapuscheno; pri perezapuske - sbrasyvaetsya
 * i zapolnyaetsya demo-dannymi zanovo (seedData()).
 */
@Service
public class DataStore {

    private final Map<String, Product> products = new LinkedHashMap<>();
    private final Map<String, Cashier> cashiers = new LinkedHashMap<>();
    private final Map<String, Branch> branches = new LinkedHashMap<>();
    private final List<Order> orders = new ArrayList<>();
    private final List<InventoryMovement> movements = new ArrayList<>();
    private final Map<String, Shift> shifts = new LinkedHashMap<>();
    private final List<CashExpense> expenses = new ArrayList<>();
    private final Map<String, Customer> customers = new LinkedHashMap<>(); // key = phone

    private String currentShiftId; // null esli smena ne otkryta
    private AdminCashNote pendingAdminNote; // null esli net aktivnoy zapiski

    private final AtomicInteger idSeq = new AtomicInteger(1);

    public String nextId(String prefix) {
        return prefix + "-" + idSeq.getAndIncrement();
    }

    @PostConstruct
    public void seedData() {
        addBranch("Главный филиал", "г. Ташкент");
        addCashier("Азиз", "aziz", "aziz123", "Кассир", "Главный филиал");

        addProduct("Сув 0.5", "Фреш", Map.of("BASE", 5000), 120, 20, "шт");
        addProduct("Апельсин яблоко", "Фреш", Map.of("M", 35000, "L", 45000), 40, 10, "шт");
        addProduct("Апельсин", "Фреш", Map.of("M", 55000, "L", 65000), 35, 10, "шт");
        addProduct("Яблоко", "Фреш", Map.of("M", 30000, "L", 40000), 50, 10, "шт");
        addProduct("Кровь (свекла, яблоко, морковь)", "Фреш", Map.of("M", 30000, "L", 40000), 25, 8, "шт");
        addProduct("Айс латте", "Айс кофе", Map.of("BASE", 30000), 60, 15, "шт");
        addProduct("Айс американо", "Айс кофе", Map.of("BASE", 25000), 60, 15, "шт");
        addProduct("Айс ти ягодный", "Айс ти", Map.of("M", 25000, "L", 32000), 45, 10, "шт");
        addProduct("Айс ти лимон", "Айс ти", Map.of("M", 22000, "L", 29000), 45, 10, "шт");
        addProduct("Мохито", "Остальные", Map.of("BASE", 30000), 30, 8, "шт");
        addProduct("Детокс зелёный", "Детокс", Map.of("BASE", 28000), 20, 5, "шт");
        addProduct("Капучино", "Кофе", Map.of("BASE", 24000), 70, 15, "шт");
        addProduct("Чёрный чай", "Чай", Map.of("BASE", 15000), 80, 20, "шт");
        addProduct("Милкшейк ваниль", "Милкшейк", Map.of("BASE", 32000), 25, 8, "шт");
    }

    // ---------- Products ----------

    public Product addProduct(String name, String category, Map<String, Integer> prices,
                               int stockQty, int minStockQty, String unit) {
        String id = nextId("P");
        Product p = new Product(id, name, category, new LinkedHashMap<>(prices), stockQty, minStockQty, unit);
        products.put(id, p);
        return p;
    }

    public Collection<Product> allProducts() { return products.values(); }
    public Optional<Product> findProduct(String id) { return Optional.ofNullable(products.get(id)); }
    public void deleteProduct(String id) { products.remove(id); }
    public void putProduct(Product p) { products.put(p.getId(), p); }

    public Set<String> allCategories() {
        Set<String> cats = new LinkedHashSet<>();
        products.values().forEach(p -> cats.add(p.getCategory()));
        return cats;
    }

    // ---------- Cashiers ----------

    public Cashier addCashier(String name, String username, String password, String role, String branchName) {
        String id = nextId("C");
        Cashier c = new Cashier(id, name, username, password, role, branchName, true);
        cashiers.put(id, c);
        return c;
    }
    public Collection<Cashier> allCashiers() { return cashiers.values(); }
    public void deleteCashier(String id) { cashiers.remove(id); }

    public Optional<Cashier> findCashierByUsername(String username) {
        if (username == null) return Optional.empty();
        return cashiers.values().stream()
                .filter(c -> username.equalsIgnoreCase(c.getUsername()))
                .findFirst();
    }

    // ---------- Branches ----------

    public Branch addBranch(String name, String address) {
        String id = nextId("B");
        Branch b = new Branch(id, name, address);
        branches.put(id, b);
        return b;
    }
    public Collection<Branch> allBranches() { return branches.values(); }
    public void deleteBranch(String id) { branches.remove(id); }

    // ---------- Customers (bonusnyy schyot) ----------

    public Optional<Customer> findCustomer(String phone) {
        if (phone == null || phone.isBlank()) return Optional.empty();
        return Optional.ofNullable(customers.get(phone.trim()));
    }

    public Customer findOrCreateCustomer(String phone) {
        return customers.computeIfAbsent(phone.trim(), p -> new Customer(p, null));
    }

    public Collection<Customer> allCustomers() { return customers.values(); }

    /** Chastichnoe ili polnoe pogashenie dolga klienta (naprimer, kogda on rasplatilsya pozje). */
    public Customer repayDebt(String phone, int amount) {
        Customer c = findCustomer(phone).orElseThrow(() -> new NoSuchElementException("Клиент не найден"));
        c.setDebtBalance(Math.max(0, c.getDebtBalance() - amount));
        return c;
    }

    // ---------- Orders / checkout ----------

    public static class CheckoutResult {
        public Order order;
        public String error;
    }

    /**
     * Provodit prodaju: spisyvaet sklad, privyazyvaet k tekuschey smene,
     * primenyaet i nachislyaet bonusy klienta.
     */
    public CheckoutResult checkout(Order order) {
        CheckoutResult result = new CheckoutResult();
        order.recalcTotal();

        // proverka oplaty: nalichnye + karta + spisannye bonusy + dolg doljny v summe dat' total cheka
        int paySum = order.getCashAmount() + order.getCardAmount() + order.getBonusUsed() + order.getDebtAmount();
        if (paySum != order.getTotal()) {
            result.error = "Сумма оплаты (" + paySum + ") не совпадает с суммой чека (" + order.getTotal() + ")";
            return result;
        }
        if (order.getDebtAmount() > 0 && (order.getCustomerPhone() == null || order.getCustomerPhone().isBlank())) {
            result.error = "Для оплаты в долг укажите телефон клиента";
            return result;
        }

        // bonusy: spisanie
        Customer customer = null;
        if (order.getCustomerPhone() != null && !order.getCustomerPhone().isBlank()) {
            customer = findOrCreateCustomer(order.getCustomerPhone());
            if (order.getBonusUsed() > customer.getBalance()) {
                result.error = "На счету клиента недостаточно бонусов (доступно: " + customer.getBalance() + ")";
                return result;
            }
        } else if (order.getBonusUsed() > 0) {
            result.error = "Укажите телефон клиента, чтобы списать бонусы";
            return result;
        }

        order.setId(nextId("ORD"));
        order.setShiftId(currentShiftId);

        // spisyvaem so sklada
        for (Order.Item item : order.getItems()) {
            findProduct(item.getProductId()).ifPresent(p -> {
                p.setStockQty(Math.max(0, p.getStockQty() - item.getQuantity()));
                recordMovement(p, InventoryMovement.Type.OUT, item.getQuantity(),
                        "Продажа " + order.getId(), order.getCashierName());
            });
        }

        // bonusy: spisanie + nachislenie 1%
        if (customer != null) {
            customer.setBalance(customer.getBalance() - order.getBonusUsed());
            int earned = Math.round((order.getTotal() - order.getBonusUsed()) * 0.01f);
            order.setBonusEarned(earned);
            customer.setBalance(customer.getBalance() + earned);
            customer.setTotalSpent(customer.getTotalSpent() + order.getTotal());
            if (order.getDebtAmount() > 0) {
                customer.setDebtBalance(customer.getDebtBalance() + order.getDebtAmount());
            }
        }

        orders.add(order);
        result.order = order;
        return result;
    }

    public List<Order> allOrders() { return orders; }

    public List<Order> ordersForShift(String shiftId) {
        return orders.stream().filter(o -> Objects.equals(o.getShiftId(), shiftId)).toList();
    }

    public List<Order> ordersToday() {
        LocalDate today = LocalDate.now();
        return orders.stream().filter(o -> o.getCreatedAt().toLocalDate().equals(today)).toList();
    }

    public List<Order> ordersSince(LocalDate since) {
        return orders.stream().filter(o -> !o.getCreatedAt().toLocalDate().isBefore(since)).toList();
    }

    // ---------- Inventory movements (tovarnyy prihod/rashod, ne kassa) ----------

    public InventoryMovement recordMovement(Product product, InventoryMovement.Type type,
                                             int qty, String comment, String cashierName) {
        InventoryMovement m = new InventoryMovement(nextId("MOV"), product.getId(), product.getName(),
                type, qty, comment, cashierName);
        movements.add(m);
        return m;
    }

    public InventoryMovement addManualMovement(String productId, InventoryMovement.Type type,
                                                int qty, String comment, String cashierName) {
        Product p = products.get(productId);
        if (p == null) throw new NoSuchElementException("Товар не найден: " + productId);
        if (type == InventoryMovement.Type.IN) {
            p.setStockQty(p.getStockQty() + qty);
        } else {
            p.setStockQty(Math.max(0, p.getStockQty() - qty));
        }
        return recordMovement(p, type, qty, comment, cashierName);
    }

    public List<InventoryMovement> allMovements() { return movements; }

    // ---------- Kassovye rashody (spisyvayutsya iz nalichnyh smeny) ----------

    public CashExpense addExpense(int amount, String comment, String cashierName) {
        if (currentShiftId == null) {
            throw new IllegalStateException("Нет открытой смены — сначала откройте смену");
        }
        CashExpense e = new CashExpense(nextId("EXP"), currentShiftId, amount, comment, cashierName);
        expenses.add(e);
        return e;
    }

    public List<CashExpense> allExpenses() { return expenses; }

    public List<CashExpense> expensesForShift(String shiftId) {
        return expenses.stream().filter(e -> Objects.equals(e.getShiftId(), shiftId)).toList();
    }

    public int expensesTotalForShift(String shiftId) {
        return expensesForShift(shiftId).stream().mapToInt(CashExpense::getAmount).sum();
    }

    // ---------- Smeny (otkrytie/zakrytie kassy) ----------

    public Optional<Shift> currentShift() {
        return currentShiftId == null ? Optional.empty() : Optional.ofNullable(shifts.get(currentShiftId));
    }

    public Shift openShift(String cashierName, String branchName, int openingCash, String note) {
        if (currentShiftId != null) {
            throw new IllegalStateException("Смена уже открыта — сначала закройте текущую");
        }
        Shift s = new Shift();
        s.setId(nextId("SH"));
        s.setCashierName(cashierName);
        s.setBranchName(branchName);
        s.setOpeningCash(openingCash);
        s.setOpeningNote(note);
        s.setStatus(Shift.Status.OPEN);
        shifts.put(s.getId(), s);
        currentShiftId = s.getId();

        if (pendingAdminNote != null && !pendingAdminNote.isConsumed()) {
            pendingAdminNote.setConsumed(true);
        }
        return s;
    }

    public int cashRevenueForShift(String shiftId) {
        return ordersForShift(shiftId).stream().mapToInt(Order::getCashAmount).sum();
    }

    public int cardRevenueForShift(String shiftId) {
        return ordersForShift(shiftId).stream().mapToInt(Order::getCardAmount).sum();
    }

    public Shift closeShift(int actualCash) {
        Shift s = currentShift().orElseThrow(() -> new IllegalStateException("Нет открытой смены"));
        int cashRevenue = cashRevenueForShift(s.getId());
        int expensesTotal = expensesTotalForShift(s.getId());
        int expected = s.getOpeningCash() + cashRevenue - expensesTotal;

        s.setClosingCashActual(actualCash);
        s.setExpectedCash(expected);
        s.setDiscrepancy(actualCash - expected);
        s.setStatus(Shift.Status.CLOSED);
        s.setClosedAt(java.time.LocalDateTime.now());

        currentShiftId = null;
        return s;
    }

    public List<Shift> shiftHistory() {
        List<Shift> list = new ArrayList<>(shifts.values());
        list.sort(Comparator.comparing(Shift::getOpenedAt).reversed());
        return list;
    }

    // ---------- Admin cash note (podskazka summy dlya sleduyuschey smeny) ----------

    public void setAdminCashNote(int amount, String comment, String setBy) {
        pendingAdminNote = new AdminCashNote(amount, comment, setBy);
    }

    /** Vozvraschaet zapisku tol'ko esli ona esche ne byla ispol'zovana. */
    public Optional<AdminCashNote> pendingAdminNote() {
        if (pendingAdminNote == null || pendingAdminNote.isConsumed()) return Optional.empty();
        return Optional.of(pendingAdminNote);
    }
}

package com.haki.pos.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.haki.pos.model.*;
import com.haki.pos.security.RequestCtx;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Hranilische dannyh Haki v Supabase (PostgreSQL) cherez JDBC.
 * Mnogo biznesov: kazhdyy zapros rabotaet tol'ko s dannymi svoego biznesa (business_id iz tokena).
 * Schema: haki-supabase-v2.sql
 */
@Service
@Transactional
public class DataStore {

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final PasswordEncoder encoder;

    public DataStore(JdbcTemplate jdbc, ObjectMapper json, PasswordEncoder encoder) {
        this.jdbc = jdbc;
        this.json = json;
        this.encoder = encoder;
    }

    private static String newId(String prefix) {
        return AuthService.newId(prefix);
    }

    /** Biznes tekuschego zaprosa: vse dannye chitayutsya i pishutsya tol'ko v ramkah nego. */
    private static String bid() {
        return RequestCtx.businessId();
    }

    private static Timestamp ts(LocalDateTime t) {
        return t == null ? null : Timestamp.valueOf(t);
    }

    private static LocalDateTime ldt(java.sql.ResultSet rs, String col) throws java.sql.SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toLocalDateTime();
    }

    private static Integer intOrNull(java.sql.ResultSet rs, String col) throws java.sql.SQLException {
        int v = rs.getInt(col);
        return rs.wasNull() ? null : v;
    }

    // ---------- Products ----------

    private final RowMapper<Product> productMapper = (rs, i) -> {
        Product p = new Product();
        p.setId(rs.getString("id"));
        p.setName(rs.getString("name"));
        p.setCategory(rs.getString("category"));
        p.setImageUrl(rs.getString("image_url"));
        p.setPrices(readPrices(rs.getString("prices")));
        p.setStockQty(rs.getInt("stock_qty"));
        p.setMinStockQty(rs.getInt("min_stock_qty"));
        p.setUnit(rs.getString("unit"));
        return p;
    };

    private Map<String, Integer> readPrices(String s) {
        try {
            return json.readValue(s, new TypeReference<LinkedHashMap<String, Integer>>() {});
        } catch (Exception e) {
            throw new IllegalStateException("Не удалось прочитать цены товара", e);
        }
    }

    private String writePrices(Map<String, Integer> prices) {
        try {
            return json.writeValueAsString(prices == null ? Map.of() : prices);
        } catch (Exception e) {
            throw new IllegalStateException("Не удалось сохранить цены товара", e);
        }
    }

    public Product addProduct(String name, String category, Map<String, Integer> prices,
                              int stockQty, int minStockQty, String unit) {
        String id = newId("P");
        jdbc.update("insert into products(id,business_id,name,category,prices,stock_qty,min_stock_qty,unit) values (?,?,?,?,?::jsonb,?,?,?)",
                id, bid(), name, category, writePrices(prices), stockQty, minStockQty, unit);
        return findProduct(id).orElseThrow();
    }

    @Transactional(readOnly = true)
    public Collection<Product> allProducts() {
        return jdbc.query("select * from products where business_id = ? order by category, name", productMapper, bid());
    }

    @Transactional(readOnly = true)
    public Optional<Product> findProduct(String id) {
        return jdbc.query("select * from products where id = ? and business_id = ?", productMapper, id, bid()).stream().findFirst();
    }

    public void deleteProduct(String id) {
        jdbc.update("delete from products where id = ? and business_id = ?", id, bid());
    }

    /** Polnaya zamena tovara po id (PUT). */
    public void putProduct(Product p) {
        jdbc.update("update products set name=?, category=?, image_url=?, prices=?::jsonb, stock_qty=?, min_stock_qty=?, unit=? where id=? and business_id=?",
                p.getName(), p.getCategory(), p.getImageUrl(), writePrices(p.getPrices()),
                p.getStockQty(), p.getMinStockQty(), p.getUnit(), p.getId(), bid());
    }

    @Transactional(readOnly = true)
    public Set<String> allCategories() {
        return new LinkedHashSet<>(jdbc.queryForList("select distinct category from products where business_id = ? order by category", String.class, bid()));
    }

    // ---------- Cashiers (tablica users, rol' CASHIER) ----------

    private final RowMapper<Cashier> cashierMapper = (rs, i) -> new Cashier(
            rs.getString("id"), rs.getString("name"), rs.getString("username"), null,
            "Кассир", rs.getString("branch_name"), rs.getBoolean("active"));

    public Cashier addCashier(String name, String username, String password, String role, String branchName) {
        if (name == null || name.isBlank()) throw new IllegalArgumentException("Укажите имя кассира");
        PlatformService.checkLogin(username);
        PlatformService.checkPassword(password);
        String id = newId("U");
        jdbc.update("insert into users(id,business_id,username,password_hash,name,role,branch_name,active) values (?,?,?,?,?,'CASHIER',?,true)",
                id, bid(), username.trim(), encoder.encode(password), name.trim(), branchName);
        return new Cashier(id, name.trim(), username.trim(), null, "Кассир", branchName, true);
    }

    @Transactional(readOnly = true)
    public Collection<Cashier> allCashiers() {
        return jdbc.query("select id,name,username,branch_name,active from users where business_id = ? and role = 'CASHIER' order by name",
                cashierMapper, bid());
    }

    public void deleteCashier(String id) {
        jdbc.update("delete from users where id = ? and business_id = ? and role = 'CASHIER'", id, bid());
    }

    // ---------- Branches ----------

    private final RowMapper<Branch> branchMapper = (rs, i) ->
            new Branch(rs.getString("id"), rs.getString("name"), rs.getString("address"));

    public Branch addBranch(String name, String address) {
        String id = newId("B");
        jdbc.update("insert into branches(id,business_id,name,address) values (?,?,?,?)", id, bid(), name, address);
        return new Branch(id, name, address);
    }

    @Transactional(readOnly = true)
    public Collection<Branch> allBranches() {
        return jdbc.query("select * from branches where business_id = ? order by name", branchMapper, bid());
    }

    public void deleteBranch(String id) {
        jdbc.update("delete from branches where id = ? and business_id = ?", id, bid());
    }

    // ---------- Customers (bonusnyy schyot) ----------

    private final RowMapper<Customer> customerMapper = (rs, i) -> {
        Customer c = new Customer(rs.getString("phone"), rs.getString("name"));
        c.setBalance(rs.getInt("balance"));
        c.setTotalSpent(rs.getInt("total_spent"));
        c.setDebtBalance(rs.getInt("debt_balance"));
        return c;
    };

    @Transactional(readOnly = true)
    public Optional<Customer> findCustomer(String phone) {
        if (phone == null || phone.isBlank()) return Optional.empty();
        return jdbc.query("select * from customers where business_id = ? and phone = ?", customerMapper, bid(), phone.trim())
                .stream().findFirst();
    }

    public Customer findOrCreateCustomer(String phone) {
        String p = phone.trim();
        jdbc.update("insert into customers(business_id,phone) values (?,?) on conflict (business_id, phone) do nothing", bid(), p);
        return findCustomer(p).orElseThrow();
    }

    @Transactional(readOnly = true)
    public Collection<Customer> allCustomers() {
        return jdbc.query("select * from customers where business_id = ? order by total_spent desc", customerMapper, bid());
    }

    /** Chastichnoe ili polnoe pogashenie dolga klienta. */
    public Customer repayDebt(String phone, int amount) {
        int rows = jdbc.update("update customers set debt_balance = greatest(0, debt_balance - ?) where business_id = ? and phone = ?",
                amount, bid(), phone.trim());
        if (rows == 0) throw new NoSuchElementException("Клиент не найден");
        return findCustomer(phone).orElseThrow();
    }

    // ---------- Orders / checkout ----------

    public static class CheckoutResult {
        public Order order;
        public String error;
    }

    /**
     * Provodit prodaju v odnoy tranzakcii: spisyvaet sklad, privyazyvaet k tekuschey smene,
     * primenyaet i nachislyaet bonusy klienta. Pri oshibke vsyo otkatyvaetsya.
     */
    public CheckoutResult checkout(Order order) {
        CheckoutResult result = new CheckoutResult();
        order.recalcTotal();

        int paySum = order.getCashAmount() + order.getCardAmount() + order.getBonusUsed() + order.getDebtAmount();
        if (paySum != order.getTotal()) {
            result.error = "Сумма оплаты (" + paySum + ") не совпадает с суммой чека (" + order.getTotal() + ")";
            return result;
        }
        if (order.getDebtAmount() > 0 && (order.getCustomerPhone() == null || order.getCustomerPhone().isBlank())) {
            result.error = "Для оплаты в долг укажите телефон клиента";
            return result;
        }

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

        order.setId(newId("ORD"));
        order.setShiftId(currentShift().map(Shift::getId).orElse(null));
        order.setCreatedAt(LocalDateTime.now());

        int earned = 0;
        if (customer != null) {
            earned = Math.round((order.getTotal() - order.getBonusUsed()) * 0.01f);
            order.setBonusEarned(earned);
            order.setCustomerPhone(customer.getPhone());
        }

        jdbc.update("""
                insert into orders(id,business_id,shift_id,cashier_name,branch_name,customer_phone,total,payment_method,
                                   cash_amount,card_amount,debt_amount,bonus_used,bonus_earned,created_at)
                values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                order.getId(), bid(), order.getShiftId(), order.getCashierName(), order.getBranchName(),
                order.getCustomerPhone(), order.getTotal(), order.getPaymentMethod(),
                order.getCashAmount(), order.getCardAmount(), order.getDebtAmount(),
                order.getBonusUsed(), order.getBonusEarned(), ts(order.getCreatedAt()));

        for (Order.Item item : order.getItems()) {
            jdbc.update("insert into order_items(order_id,product_id,product_name,size_label,price,quantity) values (?,?,?,?,?,?)",
                    order.getId(), item.getProductId(), item.getProductName(), item.getSize(),
                    item.getPrice(), item.getQuantity());

            // spisanie so sklada (ne uhodim v minus)
            Optional<Product> p = findProduct(item.getProductId());
            if (p.isPresent()) {
                jdbc.update("update products set stock_qty = greatest(0, stock_qty - ?) where id = ? and business_id = ?",
                        item.getQuantity(), item.getProductId(), bid());
                recordMovement(p.get(), InventoryMovement.Type.OUT, item.getQuantity(),
                        "Продажа " + order.getId(), order.getCashierName());
            }
        }

        if (customer != null) {
            jdbc.update("""
                    update customers set balance = balance - ? + ?,
                                         total_spent = total_spent + ?,
                                         debt_balance = debt_balance + ?
                    where business_id = ? and phone = ?""",
                    order.getBonusUsed(), earned, order.getTotal(), order.getDebtAmount(), bid(), customer.getPhone());
        }

        result.order = order;
        return result;
    }

    private List<Order> loadOrders(String extraWhere, Object... extraArgs) {
        List<Object> args = new ArrayList<>();
        args.add(bid());
        args.addAll(Arrays.asList(extraArgs));
        List<Order> orders = jdbc.query("select * from orders where business_id = ? " + extraWhere + " order by created_at desc", (rs, i) -> {
            Order o = new Order();
            o.setId(rs.getString("id"));
            o.setShiftId(rs.getString("shift_id"));
            o.setCashierName(rs.getString("cashier_name"));
            o.setBranchName(rs.getString("branch_name"));
            o.setCustomerPhone(rs.getString("customer_phone"));
            o.setTotal(rs.getInt("total"));
            o.setPaymentMethod(rs.getString("payment_method"));
            o.setCashAmount(rs.getInt("cash_amount"));
            o.setCardAmount(rs.getInt("card_amount"));
            o.setDebtAmount(rs.getInt("debt_amount"));
            o.setBonusUsed(rs.getInt("bonus_used"));
            o.setBonusEarned(rs.getInt("bonus_earned"));
            o.setCreatedAt(ldt(rs, "created_at"));
            return o;
        }, args.toArray());
        if (orders.isEmpty()) return orders;

        Map<String, Order> byId = new HashMap<>();
        orders.forEach(o -> byId.put(o.getId(), o));
        String in = String.join(",", Collections.nCopies(orders.size(), "?"));
        jdbc.query("select * from order_items where order_id in (" + in + ") order by id",
                rs -> {
                    Order o = byId.get(rs.getString("order_id"));
                    if (o != null) {
                        o.getItems().add(new Order.Item(rs.getString("product_id"), rs.getString("product_name"),
                                rs.getString("size_label"), rs.getInt("price"), rs.getInt("quantity")));
                    }
                },
                byId.keySet().toArray());
        return orders;
    }

    @Transactional(readOnly = true)
    public List<Order> allOrders() { return loadOrders(""); }

    @Transactional(readOnly = true)
    public List<Order> ordersForShift(String shiftId) {
        return loadOrders("and shift_id = ?", shiftId);
    }

    @Transactional(readOnly = true)
    public List<Order> ordersToday() { return ordersSince(LocalDate.now()); }

    @Transactional(readOnly = true)
    public List<Order> ordersSince(LocalDate since) {
        return loadOrders("and created_at >= ?", ts(since.atStartOfDay()));
    }

    // ---------- Inventory movements (tovarnyy prihod/rashod, ne kassa) ----------

    public InventoryMovement recordMovement(Product product, InventoryMovement.Type type,
                                            int qty, String comment, String cashierName) {
        InventoryMovement m = new InventoryMovement(newId("MOV"), product.getId(), product.getName(),
                type, qty, comment, cashierName);
        jdbc.update("insert into inventory_movements(id,business_id,product_id,product_name,type,quantity,comment,cashier_name,created_at) values (?,?,?,?,?,?,?,?,?)",
                m.getId(), bid(), m.getProductId(), m.getProductName(), type.name(), qty, comment, cashierName,
                ts(m.getCreatedAt()));
        return m;
    }

    public InventoryMovement addManualMovement(String productId, InventoryMovement.Type type,
                                               int qty, String comment, String cashierName) {
        Product p = findProduct(productId)
                .orElseThrow(() -> new NoSuchElementException("Товар не найден: " + productId));
        if (type == InventoryMovement.Type.IN) {
            jdbc.update("update products set stock_qty = stock_qty + ? where id = ? and business_id = ?", qty, productId, bid());
        } else {
            jdbc.update("update products set stock_qty = greatest(0, stock_qty - ?) where id = ? and business_id = ?", qty, productId, bid());
        }
        return recordMovement(p, type, qty, comment, cashierName);
    }

    @Transactional(readOnly = true)
    public List<InventoryMovement> allMovements() {
        return jdbc.query("select * from inventory_movements where business_id = ? order by created_at desc", (rs, i) -> {
            InventoryMovement m = new InventoryMovement(rs.getString("id"), rs.getString("product_id"),
                    rs.getString("product_name"), InventoryMovement.Type.valueOf(rs.getString("type")),
                    rs.getInt("quantity"), rs.getString("comment"), rs.getString("cashier_name"));
            m.setCreatedAt(ldt(rs, "created_at"));
            return m;
        }, bid());
    }

    // ---------- Kassovye rashody (spisyvayutsya iz nalichnyh smeny) ----------

    private final RowMapper<CashExpense> expenseMapper = (rs, i) -> {
        CashExpense e = new CashExpense(rs.getString("id"), rs.getString("shift_id"), rs.getInt("amount"),
                rs.getString("comment"), rs.getString("cashier_name"));
        e.setCreatedAt(ldt(rs, "created_at"));
        return e;
    };

    public CashExpense addExpense(int amount, String comment, String cashierName) {
        Shift s = currentShift().orElseThrow(() -> new IllegalStateException("Нет открытой смены — сначала откройте смену"));
        CashExpense e = new CashExpense(newId("EXP"), s.getId(), amount, comment, cashierName);
        jdbc.update("insert into cash_expenses(id,business_id,shift_id,amount,comment,cashier_name,created_at) values (?,?,?,?,?,?,?)",
                e.getId(), bid(), e.getShiftId(), amount, comment, cashierName, ts(e.getCreatedAt()));
        return e;
    }

    @Transactional(readOnly = true)
    public List<CashExpense> allExpenses() {
        return jdbc.query("select * from cash_expenses where business_id = ? order by created_at desc", expenseMapper, bid());
    }

    @Transactional(readOnly = true)
    public List<CashExpense> expensesForShift(String shiftId) {
        return jdbc.query("select * from cash_expenses where business_id = ? and shift_id = ? order by created_at desc", expenseMapper, bid(), shiftId);
    }

    @Transactional(readOnly = true)
    public int expensesTotalForShift(String shiftId) {
        Integer v = jdbc.queryForObject("select coalesce(sum(amount),0) from cash_expenses where business_id = ? and shift_id = ?", Integer.class, bid(), shiftId);
        return v == null ? 0 : v;
    }

    // ---------- Smeny (otkrytie/zakrytie kassy) ----------

    private final RowMapper<Shift> shiftMapper = (rs, i) -> {
        Shift s = new Shift();
        s.setId(rs.getString("id"));
        s.setCashierName(rs.getString("cashier_name"));
        s.setBranchName(rs.getString("branch_name"));
        s.setStatus(Shift.Status.valueOf(rs.getString("status")));
        s.setOpeningCash(rs.getInt("opening_cash"));
        s.setOpeningNote(rs.getString("opening_note"));
        s.setOpenedAt(ldt(rs, "opened_at"));
        s.setClosedAt(ldt(rs, "closed_at"));
        s.setClosingCashActual(intOrNull(rs, "closing_cash_actual"));
        s.setExpectedCash(intOrNull(rs, "expected_cash"));
        s.setDiscrepancy(intOrNull(rs, "discrepancy"));
        return s;
    };

    @Transactional(readOnly = true)
    public Optional<Shift> currentShift() {
        return jdbc.query("select * from shifts where business_id = ? and status = 'OPEN' order by opened_at desc limit 1", shiftMapper, bid())
                .stream().findFirst();
    }

    public Shift openShift(String cashierName, String branchName, int openingCash, String note) {
        if (currentShift().isPresent()) {
            throw new IllegalStateException("Смена уже открыта — сначала закройте текущую");
        }
        Shift s = new Shift();
        s.setId(newId("SH"));
        s.setCashierName(cashierName);
        s.setBranchName(branchName);
        s.setOpeningCash(openingCash);
        s.setOpeningNote(note);
        s.setStatus(Shift.Status.OPEN);
        try {
            jdbc.update("insert into shifts(id,business_id,cashier_name,branch_name,status,opening_cash,opening_note,opened_at) values (?,?,?,?,'OPEN',?,?,?)",
                    s.getId(), bid(), cashierName, branchName, openingCash, note, ts(s.getOpenedAt()));
        } catch (DuplicateKeyException e) {
            throw new IllegalStateException("Смена уже открыта — сначала закройте текущую");
        }

        jdbc.update("update admin_cash_notes set consumed = true where business_id = ? and consumed = false", bid());
        return s;
    }

    @Transactional(readOnly = true)
    public int cashRevenueForShift(String shiftId) {
        Integer v = jdbc.queryForObject("select coalesce(sum(cash_amount),0) from orders where business_id = ? and shift_id = ?", Integer.class, bid(), shiftId);
        return v == null ? 0 : v;
    }

    @Transactional(readOnly = true)
    public int cardRevenueForShift(String shiftId) {
        Integer v = jdbc.queryForObject("select coalesce(sum(card_amount),0) from orders where business_id = ? and shift_id = ?", Integer.class, bid(), shiftId);
        return v == null ? 0 : v;
    }

    public Shift closeShift(int actualCash) {
        Shift s = currentShift().orElseThrow(() -> new IllegalStateException("Нет открытой смены"));
        int expected = s.getOpeningCash() + cashRevenueForShift(s.getId()) - expensesTotalForShift(s.getId());
        LocalDateTime now = LocalDateTime.now();

        jdbc.update("update shifts set status='CLOSED', closed_at=?, closing_cash_actual=?, expected_cash=?, discrepancy=? where id=? and business_id=?",
                ts(now), actualCash, expected, actualCash - expected, s.getId(), bid());

        s.setClosingCashActual(actualCash);
        s.setExpectedCash(expected);
        s.setDiscrepancy(actualCash - expected);
        s.setStatus(Shift.Status.CLOSED);
        s.setClosedAt(now);
        return s;
    }

    @Transactional(readOnly = true)
    public List<Shift> shiftHistory() {
        return jdbc.query("select * from shifts where business_id = ? order by opened_at desc", shiftMapper, bid());
    }

    // ---------- Admin cash note (podskazka summy dlya sleduyuschey smeny) ----------

    public void setAdminCashNote(int amount, String comment, String setBy) {
        jdbc.update("update admin_cash_notes set consumed = true where business_id = ? and consumed = false", bid());
        jdbc.update("insert into admin_cash_notes(business_id,amount,comment,set_by,set_at,consumed) values (?,?,?,?,?,false)",
                bid(), amount, comment, setBy, ts(LocalDateTime.now()));
    }

    /** Vozvraschaet zapisku tol'ko esli ona esche ne byla ispol'zovana. */
    @Transactional(readOnly = true)
    public Optional<AdminCashNote> pendingAdminNote() {
        return jdbc.query("select * from admin_cash_notes where business_id = ? and consumed = false order by set_at desc limit 1", (rs, i) -> {
            AdminCashNote n = new AdminCashNote(rs.getInt("amount"), rs.getString("comment"), rs.getString("set_by"));
            n.setSetAt(ldt(rs, "set_at"));
            n.setConsumed(rs.getBoolean("consumed"));
            return n;
        }, bid()).stream().findFirst();
    }
}

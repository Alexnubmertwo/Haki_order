package com.haki.pos.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/** Operacii superadmina: biznesy i ih administratory. */
@Service
@Transactional
public class PlatformService {

    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;

    public PlatformService(JdbcTemplate jdbc, PasswordEncoder encoder) {
        this.jdbc = jdbc;
        this.encoder = encoder;
    }

    static void checkLogin(String username) {
        if (username == null || username.trim().length() < 3) {
            throw new IllegalArgumentException("Логин должен быть не короче 3 символов");
        }
        if (username.trim().contains(" ")) {
            throw new IllegalArgumentException("В логине не должно быть пробелов");
        }
    }

    static void checkPassword(String password) {
        if (password == null || password.length() < 6) {
            throw new IllegalArgumentException("Пароль должен быть не короче 6 символов");
        }
    }

    private static String required(String v, String what) {
        if (v == null || v.isBlank()) throw new IllegalArgumentException("Укажите: " + what);
        return v.trim();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listBusinesses() {
        return jdbc.query("""
                select b.id, b.name, b.active, b.created_at,
                  (select count(*) from users u where u.business_id = b.id and u.role = 'ADMIN')   as admins,
                  (select count(*) from users u where u.business_id = b.id and u.role = 'CASHIER') as cashiers,
                  (select count(*) from products p where p.business_id = b.id)                    as products,
                  (select count(*) from orders o where o.business_id = b.id)                      as orders,
                  (select coalesce(sum(total),0) from orders o where o.business_id = b.id)        as revenue,
                  (select coalesce(sum(total),0) from orders o where o.business_id = b.id
                       and o.created_at >= date_trunc('day', now() at time zone 'Asia/Tashkent'))                              as revenue_today
                from businesses b order by b.created_at desc
                """, (rs, i) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", rs.getString("id"));
            m.put("name", rs.getString("name"));
            m.put("active", rs.getBoolean("active"));
            m.put("createdAt", rs.getTimestamp("created_at").toLocalDateTime().toString());
            m.put("admins", rs.getLong("admins"));
            m.put("cashiers", rs.getLong("cashiers"));
            m.put("products", rs.getLong("products"));
            m.put("orders", rs.getLong("orders"));
            m.put("revenue", rs.getLong("revenue"));
            m.put("revenueToday", rs.getLong("revenue_today"));
            return m;
        });
    }

    /** Novyy biznes + ego pervyy administrator + filial po umolchaniyu. */
    public Map<String, Object> createBusiness(String businessName, String adminName, String username, String password) {
        String bName = required(businessName, "название бизнеса");
        String aName = required(adminName, "имя администратора");
        checkLogin(username);
        checkPassword(password);

        String businessId = AuthService.newId("BIZ");
        jdbc.update("insert into businesses(id,name,active) values (?,?,true)", businessId, bName);
        jdbc.update("insert into branches(id,business_id,name,address) values (?,?,?,?)",
                AuthService.newId("B"), businessId, "Главный филиал", null);
        String adminId = insertUser(businessId, aName, username.trim(), password, "ADMIN", "Главный филиал");
        return Map.of("id", businessId, "name", bName, "adminId", adminId);
    }

    public String addAdmin(String businessId, String name, String username, String password) {
        requireBusiness(businessId);
        checkLogin(username);
        checkPassword(password);
        return insertUser(businessId, required(name, "имя администратора"), username.trim(), password, "ADMIN", null);
    }

    private String insertUser(String businessId, String name, String username, String password, String role, String branchName) {
        String id = AuthService.newId("U");
        jdbc.update("insert into users(id,business_id,username,password_hash,name,role,branch_name,active) values (?,?,?,?,?,?,?,true)",
                id, businessId, username, encoder.encode(password), name, role, branchName);
        return id;
    }

    private void requireBusiness(String businessId) {
        Integer n = jdbc.queryForObject("select count(*) from businesses where id = ?", Integer.class, businessId);
        if (n == null || n == 0) throw new NoSuchElementException("Бизнес не найден");
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listUsers(String businessId) {
        requireBusiness(businessId);
        return jdbc.query("select id, name, username, role, branch_name, active from users where business_id = ? "
                        + "order by case role when 'ADMIN' then 0 else 1 end, name",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getString("id"));
                    m.put("name", rs.getString("name"));
                    m.put("username", rs.getString("username"));
                    m.put("role", rs.getString("role"));
                    m.put("branchName", rs.getString("branch_name"));
                    m.put("active", rs.getBoolean("active"));
                    return m;
                }, businessId);
    }

    public void setBusinessActive(String businessId, boolean active) {
        requireBusiness(businessId);
        jdbc.update("update businesses set active = ? where id = ?", active, businessId);
        if (!active) {
            jdbc.update("delete from sessions where user_id in (select id from users where business_id = ?)", businessId);
        }
    }

    public void setUserActive(String userId, boolean active) {
        int rows = jdbc.update("update users set active = ? where id = ? and role <> 'SUPERADMIN'", active, userId);
        if (rows == 0) throw new NoSuchElementException("Пользователь не найден");
        if (!active) jdbc.update("delete from sessions where user_id = ?", userId);
    }

    public void resetPassword(String userId, String newPassword) {
        checkPassword(newPassword);
        int rows = jdbc.update("update users set password_hash = ? where id = ? and role <> 'SUPERADMIN'",
                encoder.encode(newPassword), userId);
        if (rows == 0) throw new NoSuchElementException("Пользователь не найден");
        jdbc.update("delete from sessions where user_id = ?", userId);
    }
}

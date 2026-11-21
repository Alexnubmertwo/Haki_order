package com.haki.pos.service;

import com.haki.pos.security.ApiException;
import com.haki.pos.security.AuthUser;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Vhod, tokeny i proverka biznesa. Parol' v baze - tol'ko bcrypt, token - tol'ko SHA-256 hash. */
@Service
public class AuthService {
    private static final Logger log = LoggerFactory.getLogger(AuthService.class);
    private static final int MAX_FAILS = 5;
    private static final long LOCK_MS = 5 * 60 * 1000L;

    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, long[]> fails = new ConcurrentHashMap<>(); // login -> {kol-vo oshibok, zablokirovan do (ms)}

    @Value("${haki.superadmin.user:}")
    private String superUser;
    @Value("${haki.superadmin.password:}")
    private String superPassword;
    @Value("${haki.session.hours:24}")
    private int sessionHours;

    private final String dummyHash;

    public AuthService(JdbcTemplate jdbc, PasswordEncoder encoder) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.dummyHash = encoder.encode("dummy-password-for-timing");
    }

    public record LoginResult(String token, AuthUser user, String businessName) {}

    /** Esli v baze net superadmina - sozdayom iz peremennyh okruzheniya. */
    @PostConstruct
    public void ensureSuperAdmin() {
        Integer n = jdbc.queryForObject("select count(*) from users where role = 'SUPERADMIN'", Integer.class);
        if (n != null && n > 0) return;
        if (superUser == null || superUser.isBlank() || superPassword == null || superPassword.length() < 8) {
            log.warn("Superadmin ne sozdan: zadayte HAKI_SUPERADMIN_USER i HAKI_SUPERADMIN_PASSWORD (parol' ot 8 simvolov) i perezapustite.");
            return;
        }
        jdbc.update("insert into users(id,business_id,username,password_hash,name,role,active) values (?,?,?,?,?,'SUPERADMIN',true)",
                newId("U"), null, superUser.trim(), encoder.encode(superPassword), "Суперадмин");
        log.info("Superadmin '{}' sozdan.", superUser.trim());
    }

    public static String newId(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8);
    }

    public LoginResult login(String username, String password) {
        String key = username == null ? "" : username.trim().toLowerCase();
        long now = System.currentTimeMillis();
        long[] f = fails.get(key);
        if (f != null && f[1] > now) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Слишком много попыток входа. Подождите 5 минут");
        }

        List<Map<String, Object>> rows = jdbc.queryForList(
                "select u.id, u.name, u.role, u.business_id, u.password_hash, u.active, b.name as business_name, b.active as business_active "
                        + "from users u left join businesses b on b.id = u.business_id where lower(u.username) = lower(?)", key);

        boolean ok = false;
        Map<String, Object> row = rows.isEmpty() ? null : rows.get(0);
        String hash = row == null ? dummyHash : (String) row.get("password_hash");
        boolean matches = password != null && encoder.matches(password, hash);
        if (row != null && matches && Boolean.TRUE.equals(row.get("active"))) {
            ok = true;
        }

        if (!ok) {
            long[] cur = fails.computeIfAbsent(key, k -> new long[]{0, 0});
            synchronized (cur) {
                cur[0]++;
                if (cur[0] >= MAX_FAILS) { cur[0] = 0; cur[1] = now + LOCK_MS; }
            }
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Неверный логин или пароль");
        }
        if (row.get("business_id") != null && !Boolean.TRUE.equals(row.get("business_active"))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Бизнес отключён. Обратитесь к администратору платформы");
        }
        fails.remove(key);

        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);

        jdbc.update("delete from sessions where expires_at < now()");
        jdbc.update("insert into sessions(token_hash, user_id, expires_at) values (?, ?, now() + (? * interval '1 hour'))",
                sha256(token), row.get("id"), sessionHours);

        AuthUser user = new AuthUser((String) row.get("id"), (String) row.get("name"),
                (String) row.get("role"), (String) row.get("business_id"));
        return new LoginResult(token, user, (String) row.get("business_name"));
    }

    public AuthUser validate(String token) {
        if (token == null || token.isBlank()) return null;
        List<AuthUser> list = jdbc.query(
                "select u.id, u.name, u.role, u.business_id from sessions s join users u on u.id = s.user_id "
                        + "where s.token_hash = ? and s.expires_at > now() and u.active",
                (rs, i) -> new AuthUser(rs.getString("id"), rs.getString("name"), rs.getString("role"), rs.getString("business_id")),
                sha256(token));
        return list.isEmpty() ? null : list.get(0);
    }

    public void logout(String token) {
        if (token != null) jdbc.update("delete from sessions where token_hash = ?", sha256(token));
    }

    public boolean businessExists(String id) {
        Integer n = jdbc.queryForObject("select count(*) from businesses where id = ?", Integer.class, id);
        return n != null && n > 0;
    }

    public boolean businessActive(String id) {
        if (id == null) return false;
        Integer n = jdbc.queryForObject("select count(*) from businesses where id = ? and active", Integer.class, id);
        return n != null && n > 0;
    }

    static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}

package com.haki.pos.controller;

import com.haki.pos.model.Cashier;
import com.haki.pos.service.DataStore;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    // Chernovaya versiya: admin zahardkojen. V sleduyuschey versii - v baze s hashem parolya.
    private static final String ADMIN_USERNAME = "Sardor";
    private static final String ADMIN_PASSWORD = "Sardor17";

    private final DataStore store;

    public AuthController(DataStore store) {
        this.store = store;
    }

    public record LoginRequest(String username, String password) {}

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest req) {
        String username = req.username() == null ? "" : req.username().trim();
        String password = req.password() == null ? "" : req.password();

        if (ADMIN_USERNAME.equalsIgnoreCase(username) && ADMIN_PASSWORD.equals(password)) {
            return ResponseEntity.ok(Map.of("role", "ADMIN", "name", "Sardor"));
        }

        Optional<Cashier> cashier = store.findCashierByUsername(username);
        if (cashier.isPresent() && cashier.get().getPassword() != null
                && cashier.get().getPassword().equals(password)) {
            Cashier c = cashier.get();
            return ResponseEntity.ok(Map.of("role", "CASHIER", "name", c.getName(), "cashierId", c.getId()));
        }

        return ResponseEntity.status(401).body(Map.of("error", "Неверный логин или пароль"));
    }
}

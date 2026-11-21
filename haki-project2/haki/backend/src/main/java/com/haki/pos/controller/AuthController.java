package com.haki.pos.controller;

import com.haki.pos.security.AuthUser;
import com.haki.pos.security.RequestCtx;
import com.haki.pos.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    public record LoginRequest(String username, String password) {}

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest req) {
        AuthService.LoginResult r = auth.login(req.username(), req.password());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("token", r.token());
        body.put("role", r.user().role());
        body.put("name", r.user().name());
        body.put("userId", r.user().id());
        body.put("businessId", r.user().businessId());
        body.put("businessName", r.businessName());
        return ResponseEntity.ok(body);
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpServletRequest request) {
        String h = request.getHeader("Authorization");
        if (h != null && h.startsWith("Bearer ")) auth.logout(h.substring(7).trim());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @GetMapping("/me")
    public AuthUser me() {
        return RequestCtx.user();
    }
}

package com.haki.pos.controller;

import com.haki.pos.service.PlatformService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** Upravlenie platformoy: tol'ko SUPERADMIN (proveryaetsya v AuthInterceptor). */
@RestController
@RequestMapping("/api/superadmin")
@CrossOrigin(origins = "*")
public class SuperAdminController {

    private final PlatformService platform;

    public SuperAdminController(PlatformService platform) {
        this.platform = platform;
    }

    public record CreateBusinessRequest(String businessName, String adminName, String username, String password) {}
    public record AddAdminRequest(String name, String username, String password) {}
    public record ActiveRequest(boolean active) {}
    public record PasswordRequest(String password) {}

    @GetMapping("/businesses")
    public List<Map<String, Object>> businesses() {
        return platform.listBusinesses();
    }

    @PostMapping("/businesses")
    public Map<String, Object> createBusiness(@RequestBody CreateBusinessRequest r) {
        return platform.createBusiness(r.businessName(), r.adminName(), r.username(), r.password());
    }

    @PostMapping("/businesses/{id}/active")
    public Map<String, Object> setActive(@PathVariable String id, @RequestBody ActiveRequest r) {
        platform.setBusinessActive(id, r.active());
        return Map.of("ok", true);
    }

    @GetMapping("/businesses/{id}/users")
    public List<Map<String, Object>> users(@PathVariable String id) {
        return platform.listUsers(id);
    }

    @PostMapping("/businesses/{id}/admins")
    public Map<String, Object> addAdmin(@PathVariable String id, @RequestBody AddAdminRequest r) {
        return Map.of("id", platform.addAdmin(id, r.name(), r.username(), r.password()));
    }

    @PostMapping("/users/{id}/active")
    public Map<String, Object> setUserActive(@PathVariable String id, @RequestBody ActiveRequest r) {
        platform.setUserActive(id, r.active());
        return Map.of("ok", true);
    }

    @PostMapping("/users/{id}/password")
    public Map<String, Object> resetPassword(@PathVariable String id, @RequestBody PasswordRequest r) {
        platform.resetPassword(id, r.password());
        return Map.of("ok", true);
    }
}

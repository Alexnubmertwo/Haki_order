package com.haki.pos.controller;

import com.haki.pos.service.DataStore;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** Kategorii tovarov. Izmenenie - tol'ko ADMIN/SUPERADMIN (sm. AuthInterceptor). */
@RestController
@RequestMapping("/api/categories")
@CrossOrigin(origins = "*")
public class CategoryController {

    private final DataStore store;

    public CategoryController(DataStore store) {
        this.store = store;
    }

    public record SetRequest(String name, List<String> productIds) {}
    public record RenameRequest(String from, String to) {}
    public record NameRequest(String name) {}

    private static String clean(String raw) {
        String s = raw == null ? "" : raw.trim().replaceAll("\\s+", " ");
        if (s.isEmpty()) throw new IllegalArgumentException("Укажите название категории");
        if (s.length() > 40) throw new IllegalArgumentException("Название категории не длиннее 40 символов");
        if (s.equalsIgnoreCase("Все")) throw new IllegalArgumentException("Название «Все» зарезервировано");
        return s;
    }

    @GetMapping
    public List<DataStore.CategoryInfo> list() {
        return store.categoriesWithCounts();
    }

    /** Sozdat' kategoriyu i/ili zadat' ee sostav (spisok tovarov). */
    @PostMapping("/set")
    public ResponseEntity<?> set(@RequestBody SetRequest req) {
        try {
            store.setCategoryProducts(clean(req.name()), req.productIds());
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/rename")
    public ResponseEntity<?> rename(@RequestBody RenameRequest req) {
        try {
            store.renameCategory(clean(req.from()), clean(req.to()));
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /** Udalit' kategoriyu: ee tovary perehodyat v "Ostal'nye". */
    @PostMapping("/delete")
    public ResponseEntity<?> delete(@RequestBody NameRequest req) {
        try {
            store.deleteCategory(clean(req.name()));
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}

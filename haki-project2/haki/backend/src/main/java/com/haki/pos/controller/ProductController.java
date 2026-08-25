package com.haki.pos.controller;

import com.haki.pos.model.Product;
import com.haki.pos.service.DataStore;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/products")
@CrossOrigin(origins = "*")
public class ProductController {

    private final DataStore store;

    public ProductController(DataStore store) {
        this.store = store;
    }

    @GetMapping
    public Collection<Product> list(@RequestParam(required = false) String category) {
        if (category == null || category.isBlank() || category.equalsIgnoreCase("Все")) {
            return store.allProducts();
        }
        return store.allProducts().stream()
                .filter(p -> p.getCategory().equalsIgnoreCase(category))
                .toList();
    }

    @GetMapping("/categories")
    public Set<String> categories() {
        return store.allCategories();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Product> get(@PathVariable String id) {
        return store.findProduct(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public Product create(@RequestBody Product p) {
        return store.addProduct(p.getName(), p.getCategory(),
                p.getPrices() != null ? p.getPrices() : Map.of("BASE", 0),
                p.getStockQty(), p.getMinStockQty(), p.getUnit() != null ? p.getUnit() : "шт");
    }

    @PutMapping("/{id}")
    public ResponseEntity<Product> update(@PathVariable String id, @RequestBody Product incoming) {
        return store.findProduct(id).map(existing -> {
            incoming.setId(id);
            store.putProduct(incoming);
            return ResponseEntity.ok(incoming);
        }).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        store.deleteProduct(id);
        return ResponseEntity.noContent().build();
    }
}

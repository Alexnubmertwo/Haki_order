package com.haki.pos.controller;

import com.haki.pos.model.Order;
import com.haki.pos.service.DataStore;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/orders")
@CrossOrigin(origins = "*")
public class OrderController {

    private final DataStore store;

    public OrderController(DataStore store) {
        this.store = store;
    }

    @GetMapping
    public List<Order> list() {
        return store.allOrders();
    }

    @PostMapping
    public ResponseEntity<?> checkout(@RequestBody Order order) {
        DataStore.CheckoutResult result = store.checkout(order);
        if (result.error != null) {
            return ResponseEntity.badRequest().body(Map.of("error", result.error));
        }
        return ResponseEntity.ok(result.order);
    }
}

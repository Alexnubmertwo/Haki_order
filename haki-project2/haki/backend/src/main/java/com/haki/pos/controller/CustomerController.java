package com.haki.pos.controller;

import com.haki.pos.model.Customer;
import com.haki.pos.service.DataStore;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/customers")
@CrossOrigin(origins = "*")
public class CustomerController {

    private final DataStore store;

    public CustomerController(DataStore store) {
        this.store = store;
    }

    /** Poisk klienta po telefonu; esli net - vozvraschaet balance=0 (klient budet sozdan pri pervoy pokupke). */
    @GetMapping("/{phone}")
    public ResponseEntity<Customer> get(@PathVariable String phone) {
        return store.findCustomer(phone)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.ok(new Customer(phone, null)));
    }

    public record RepayRequest(int amount) {}

    /** Pogashenie dolga klientom (chastichnoe ili polnoe). */
    @PostMapping("/{phone}/repay-debt")
    public ResponseEntity<?> repayDebt(@PathVariable String phone, @RequestBody RepayRequest req) {
        try {
            return ResponseEntity.ok(store.repayDebt(phone, req.amount()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(java.util.Map.of("error", e.getMessage()));
        }
    }
}

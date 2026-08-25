package com.haki.pos.controller;

import com.haki.pos.model.CashExpense;
import com.haki.pos.service.DataStore;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/expenses")
@CrossOrigin(origins = "*")
public class ExpenseController {

    private final DataStore store;

    public ExpenseController(DataStore store) {
        this.store = store;
    }

    public record ExpenseRequest(int amount, String comment, String cashierName) {}

    @GetMapping
    public List<CashExpense> list() {
        return store.allExpenses();
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody ExpenseRequest req) {
        try {
            CashExpense e = store.addExpense(req.amount(), req.comment(), req.cashierName());
            return ResponseEntity.ok(e);
        } catch (IllegalStateException ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }
}

package com.haki.pos.controller;

import com.haki.pos.model.Cashier;
import com.haki.pos.service.DataStore;
import org.springframework.web.bind.annotation.*;

import java.util.Collection;

@RestController
@RequestMapping("/api/cashiers")
@CrossOrigin(origins = "*")
public class CashierController {

    private final DataStore store;

    public CashierController(DataStore store) {
        this.store = store;
    }

    @GetMapping
    public Collection<Cashier> list() {
        return store.allCashiers();
    }

    @PostMapping
    public Cashier create(@RequestBody Cashier c) {
        return store.addCashier(c.getName(), c.getUsername(), c.getPassword(),
                c.getRole() != null ? c.getRole() : "Кассир", c.getBranchName());
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable String id) {
        store.deleteCashier(id);
    }
}

package com.haki.pos.controller;

import com.haki.pos.model.Branch;
import com.haki.pos.service.DataStore;
import org.springframework.web.bind.annotation.*;

import java.util.Collection;

@RestController
@RequestMapping("/api/branches")
@CrossOrigin(origins = "*")
public class BranchController {

    private final DataStore store;

    public BranchController(DataStore store) {
        this.store = store;
    }

    @GetMapping
    public Collection<Branch> list() {
        return store.allBranches();
    }

    @PostMapping
    public Branch create(@RequestBody Branch b) {
        return store.addBranch(b.getName(), b.getAddress());
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable String id) {
        store.deleteBranch(id);
    }
}

package com.haki.pos.controller;

import com.haki.pos.model.InventoryMovement;
import com.haki.pos.service.DataStore;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/inventory")
@CrossOrigin(origins = "*")
public class InventoryController {

    private final DataStore store;

    public InventoryController(DataStore store) {
        this.store = store;
    }

    public record MovementRequest(String productId, int quantity, String comment, String cashierName) {}

    @GetMapping("/movements")
    public List<InventoryMovement> movements() {
        return store.allMovements();
    }

    @PostMapping("/in")
    public ResponseEntity<?> stockIn(@RequestBody MovementRequest req) {
        return applyMovement(req, InventoryMovement.Type.IN);
    }

    @PostMapping("/out")
    public ResponseEntity<?> stockOut(@RequestBody MovementRequest req) {
        return applyMovement(req, InventoryMovement.Type.OUT);
    }

    private ResponseEntity<?> applyMovement(MovementRequest req, InventoryMovement.Type type) {
        if (req.productId() == null || req.productId().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Не указан товар"));
        }
        try {
            InventoryMovement m = store.addManualMovement(req.productId(), type, req.quantity(),
                    req.comment(), req.cashierName());
            return ResponseEntity.ok(m);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}

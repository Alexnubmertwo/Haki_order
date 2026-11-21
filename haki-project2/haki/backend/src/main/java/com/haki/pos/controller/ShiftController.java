package com.haki.pos.controller;

import com.haki.pos.model.AdminCashNote;
import com.haki.pos.model.Shift;
import com.haki.pos.service.DataStore;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/shifts")
@CrossOrigin(origins = "*")
public class ShiftController {

    private final DataStore store;

    public ShiftController(DataStore store) {
        this.store = store;
    }

    public record OpenRequest(String cashierName, String branchName, int openingCash, String note) {}
    public record CloseRequest(int actualCash) {}
    public record NoteRequest(int amount, String comment, String setBy) {}

    @GetMapping("/current")
    public ResponseEntity<?> current() {
        return store.currentShift()
                .<ResponseEntity<?>>map(shift -> ResponseEntity.ok(withLiveTotals(shift)))
                .orElse(ResponseEntity.ok(Map.of("open", false)));
    }

    private Map<String, Object> withLiveTotals(Shift s) {
        DataStore.ShiftTotals t = store.totalsForShift(s.getId());
        int expensesTotal = store.expensesTotalForShift(s.getId());
        int expectedCashNow = s.getOpeningCash() + t.cash() - expensesTotal;
        return Map.of(
                "open", true,
                "shift", s,
                "cashRevenue", t.cash(),
                "cardRevenue", t.card(),
                "expensesTotal", expensesTotal,
                "expectedCashNow", expectedCashNow,
                "receiptsCount", t.count()
        );
    }

    @PostMapping("/open")
    public ResponseEntity<?> open(@RequestBody OpenRequest req) {
        try {
            Shift s = store.openShift(req.cashierName(), req.branchName(), req.openingCash(), req.note());
            return ResponseEntity.ok(s);
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/close")
    public ResponseEntity<?> close(@RequestBody CloseRequest req) {
        try {
            Shift s = store.closeShift(req.actualCash());
            return ResponseEntity.ok(s);
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/history")
    public List<Shift> history() {
        return store.shiftHistory();
    }

    @GetMapping("/admin-note")
    public ResponseEntity<?> getAdminNote() {
        return store.pendingAdminNote()
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.ok(Map.of("present", false)));
    }

    @PostMapping("/admin-note")
    public AdminCashNote setAdminNote(@RequestBody NoteRequest req) {
        store.setAdminCashNote(req.amount(), req.comment(), req.setBy());
        return store.pendingAdminNote().orElseThrow();
    }
}

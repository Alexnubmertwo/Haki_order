package com.haki.pos.controller;

import com.haki.pos.model.Product;
import com.haki.pos.model.Shift;
import com.haki.pos.service.DataStore;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/dashboard")
@CrossOrigin(origins = "*")
public class DashboardController {

    private final DataStore store;

    public DashboardController(DataStore store) {
        this.store = store;
    }

    private static LocalDate sinceFor(String period) {
        return switch (period) {
            case "7d" -> LocalDate.now().minusDays(6);
            case "30d" -> LocalDate.now().minusDays(29);
            default -> LocalDate.now();
        };
    }

    private static Map<String, Object> method(DataStore.PeriodStats st, String m) {
        long[] v = st.byMethod().getOrDefault(m, new long[]{0, 0});
        return Map.of("count", v[0], "total", v[1]);
    }

    private static Map<String, Object> breakdown(DataStore.PeriodStats st) {
        return Map.of(
                "all", Map.of("count", st.count(), "total", st.total()),
                "cash", method(st, "CASH"),
                "card", method(st, "CARD"),
                "mixed", method(st, "MIXED")
        );
    }

    /** period: today | 7d | 30d. Vklyuchaet "breakdown" - razbivku po sposobam oplaty. */
    @GetMapping("/summary")
    public Map<String, Object> summary(@RequestParam(defaultValue = "today") String period) {
        DataStore.PeriodStats st = store.statsSince(sinceFor(period));
        List<Product> all = List.copyOf(store.allProducts());
        List<Product> lowStock = all.stream().filter(Product::isLowStock).toList();
        long openShiftsCount = store.currentShift().isPresent() ? 1 : 0;

        return Map.of(
                "period", period,
                "receiptsCount", st.count(),
                "revenueTotal", st.cash() + st.card(),
                "cashTotal", st.cash(),
                "cardTotal", st.card(),
                "openShiftsCount", openShiftsCount,
                "totalProducts", all.size(),
                "lowStockCount", lowStock.size(),
                "lowStockProducts", lowStock,
                "breakdown", breakdown(st)
        );
    }

    /** Razbivka chekov po sposobu oplaty za period. */
    @GetMapping("/payment-breakdown")
    public Map<String, Object> paymentBreakdown(@RequestParam(defaultValue = "today") String period) {
        return breakdown(store.statsSince(sinceFor(period)));
    }

    /** Otchyot za period: samye prodavaemye tovary i prodazhi po kassiram. */
    @GetMapping("/reports")
    public Map<String, Object> reports(@RequestParam(defaultValue = "30d") String period) {
        LocalDate since = sinceFor(period);
        return Map.of(
                "period", period,
                "top", store.topProducts(since, 15),
                "cashiers", store.salesByCashier(since)
        );
    }

    @GetMapping("/open-shifts")
    public List<Object> openShifts() {
        return store.currentShift()
                .<List<Object>>map(s -> List.of((Object) shiftSummary(s, store.totalsForShift(s.getId()))))
                .orElse(List.of());
    }

    @GetMapping("/shift-history")
    public List<Map<String, Object>> shiftHistory() {
        List<Shift> shifts = store.shiftHistory();
        Map<String, DataStore.ShiftTotals> totals = store.totalsByShift();
        DataStore.ShiftTotals zero = new DataStore.ShiftTotals(0, 0, 0);
        return shifts.stream().map(s -> shiftSummary(s, totals.getOrDefault(s.getId(), zero))).toList();
    }

    private Map<String, Object> shiftSummary(Shift s, DataStore.ShiftTotals t) {
        return Map.of(
                "shift", s,
                "cashRevenue", t.cash(),
                "cardRevenue", t.card(),
                "revenueTotal", t.cash() + t.card(),
                "receiptsCount", t.count()
        );
    }
}

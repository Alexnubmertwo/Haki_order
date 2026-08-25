package com.haki.pos.controller;

import com.haki.pos.model.Order;
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

    /** period: today | 7d | 30d */
    @GetMapping("/summary")
    public Map<String, Object> summary(@RequestParam(defaultValue = "today") String period) {
        LocalDate since = switch (period) {
            case "7d" -> LocalDate.now().minusDays(6);
            case "30d" -> LocalDate.now().minusDays(29);
            default -> LocalDate.now();
        };
        List<Order> periodOrders = store.ordersSince(since);

        int cashTotal = periodOrders.stream().mapToInt(Order::getCashAmount).sum();
        int cardTotal = periodOrders.stream().mapToInt(Order::getCardAmount).sum();
        int revenueTotal = cashTotal + cardTotal;

        long openShiftsCount = store.currentShift().isPresent() ? 1 : 0;

        List<Product> lowStock = store.allProducts().stream().filter(Product::isLowStock).toList();

        return Map.of(
                "period", period,
                "receiptsCount", periodOrders.size(),
                "revenueTotal", revenueTotal,
                "cashTotal", cashTotal,
                "cardTotal", cardTotal,
                "openShiftsCount", openShiftsCount,
                "totalProducts", store.allProducts().size(),
                "lowStockCount", lowStock.size(),
                "lowStockProducts", lowStock
        );
    }

    /** Razbivka chekov po sposobu oplaty za period - dlya vkladok "Kassa" na dashborde. */
    @GetMapping("/payment-breakdown")
    public Map<String, Object> paymentBreakdown(@RequestParam(defaultValue = "today") String period) {
        LocalDate since = switch (period) {
            case "7d" -> LocalDate.now().minusDays(6);
            case "30d" -> LocalDate.now().minusDays(29);
            default -> LocalDate.now();
        };
        List<Order> periodOrders = store.ordersSince(since);

        return Map.of(
                "all", Map.of("count", periodOrders.size(),
                        "total", periodOrders.stream().mapToInt(Order::getTotal).sum()),
                "cash", summarize(periodOrders, "CASH"),
                "card", summarize(periodOrders, "CARD"),
                "mixed", summarize(periodOrders, "MIXED")
        );
    }

    private Map<String, Object> summarize(List<Order> orders, String method) {
        List<Order> filtered = orders.stream().filter(o -> method.equals(o.getPaymentMethod())).toList();
        return Map.of("count", filtered.size(), "total", filtered.stream().mapToInt(Order::getTotal).sum());
    }

    @GetMapping("/open-shifts")
    public List<Object> openShifts() {
        return store.currentShift().<List<Object>>map(s -> List.of((Object) shiftSummary(s))).orElse(List.of());
    }

    @GetMapping("/shift-history")
    public List<Map<String, Object>> shiftHistory() {
        return store.shiftHistory().stream().map(this::shiftSummary).toList();
    }

    private Map<String, Object> shiftSummary(Shift s) {
        int cashRevenue = store.cashRevenueForShift(s.getId());
        int cardRevenue = store.cardRevenueForShift(s.getId());
        int receiptsCount = store.ordersForShift(s.getId()).size();
        return Map.of(
                "shift", s,
                "cashRevenue", cashRevenue,
                "cardRevenue", cardRevenue,
                "revenueTotal", cashRevenue + cardRevenue,
                "receiptsCount", receiptsCount
        );
    }
}

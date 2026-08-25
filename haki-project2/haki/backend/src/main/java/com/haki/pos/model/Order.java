package com.haki.pos.model;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Chek / prodaja.
 */
public class Order {

    public static class Item {
        private String productId;
        private String productName;
        private String size;      // M / L / null
        private int price;        // cena za edinicu na moment prodaji
        private int quantity;

        public Item() {}

        public Item(String productId, String productName, String size, int price, int quantity) {
            this.productId = productId;
            this.productName = productName;
            this.size = size;
            this.price = price;
            this.quantity = quantity;
        }

        public int getTotal() { return price * quantity; }

        public String getProductId() { return productId; }
        public void setProductId(String productId) { this.productId = productId; }
        public String getProductName() { return productName; }
        public void setProductName(String productName) { this.productName = productName; }
        public String getSize() { return size; }
        public void setSize(String size) { this.size = size; }
        public int getPrice() { return price; }
        public void setPrice(int price) { this.price = price; }
        public int getQuantity() { return quantity; }
        public void setQuantity(int quantity) { this.quantity = quantity; }
    }

    private String id;
    private List<Item> items = new ArrayList<>();
    private int total;
    private String cashierName;
    private String branchName;
    private String paymentMethod = "CASH"; // CASH / CARD / MIXED
    private int cashAmount;   // skol'ko oplacheno nalichnymi (dlya MIXED - chast' summy)
    private int cardAmount;   // skol'ko oplacheno kartoy
    private int debtAmount;   // skol'ko ushlo v dolg klientu (paymentMethod = DEBT)
    private String shiftId;   // k kakoy smene otnositsya (mojet byt' null esli smena ne otkryta)

    // Bonusnyy schyot klienta (opcional'no)
    private String customerPhone;
    private int bonusUsed;    // skol'ko bonusov spisano v etom cheke
    private int bonusEarned;  // skol'ko bonusov nachisleno za etot chek (1% ot summy)

    private LocalDateTime createdAt = LocalDateTime.now();

    public Order() {}

    public void recalcTotal() {
        this.total = items.stream().mapToInt(Item::getTotal).sum();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public List<Item> getItems() { return items; }
    public void setItems(List<Item> items) { this.items = items; }
    public int getTotal() { return total; }
    public void setTotal(int total) { this.total = total; }
    public String getCashierName() { return cashierName; }
    public void setCashierName(String cashierName) { this.cashierName = cashierName; }
    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }
    public String getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(String paymentMethod) { this.paymentMethod = paymentMethod; }
    public int getCashAmount() { return cashAmount; }
    public void setCashAmount(int cashAmount) { this.cashAmount = cashAmount; }
    public int getCardAmount() { return cardAmount; }
    public void setCardAmount(int cardAmount) { this.cardAmount = cardAmount; }
    public int getDebtAmount() { return debtAmount; }
    public void setDebtAmount(int debtAmount) { this.debtAmount = debtAmount; }
    public String getShiftId() { return shiftId; }
    public void setShiftId(String shiftId) { this.shiftId = shiftId; }
    public String getCustomerPhone() { return customerPhone; }
    public void setCustomerPhone(String customerPhone) { this.customerPhone = customerPhone; }
    public int getBonusUsed() { return bonusUsed; }
    public void setBonusUsed(int bonusUsed) { this.bonusUsed = bonusUsed; }
    public int getBonusEarned() { return bonusEarned; }
    public void setBonusEarned(int bonusEarned) { this.bonusEarned = bonusEarned; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}

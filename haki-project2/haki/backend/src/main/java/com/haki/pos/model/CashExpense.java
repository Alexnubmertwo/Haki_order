package com.haki.pos.model;

import java.time.LocalDateTime;

/**
 * Kassovyy rashod (naprimer: kupili vodu, taxi, melkiy remont).
 * Vsegda spisyvaetsya iz NALICHNYH tekuschey smeny - ne trogaet sklad tovarov.
 */
public class CashExpense {
    private String id;
    private String shiftId;
    private int amount;
    private String comment;
    private String cashierName;
    private LocalDateTime createdAt = LocalDateTime.now();

    public CashExpense() {}

    public CashExpense(String id, String shiftId, int amount, String comment, String cashierName) {
        this.id = id;
        this.shiftId = shiftId;
        this.amount = amount;
        this.comment = comment;
        this.cashierName = cashierName;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getShiftId() { return shiftId; }
    public void setShiftId(String shiftId) { this.shiftId = shiftId; }
    public int getAmount() { return amount; }
    public void setAmount(int amount) { this.amount = amount; }
    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
    public String getCashierName() { return cashierName; }
    public void setCashierName(String cashierName) { this.cashierName = cashierName; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}

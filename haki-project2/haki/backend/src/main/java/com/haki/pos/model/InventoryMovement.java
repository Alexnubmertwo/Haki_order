package com.haki.pos.model;

import java.time.LocalDateTime;

/**
 * Dvijenie tovara na sklade: PRIHOD (postuplenie) ili RASHOD (spisanie).
 * Sozdaetsya vruchnuyu ili avtomaticheski cherez skanirovanie shtrih-koda.
 */
public class InventoryMovement {

    public enum Type { IN, OUT }

    private String id;
    private String productId;
    private String productName; // denormalizovano dlya udobstva otobrajeniya
    private Type type;
    private int quantity;
    private String comment;
    private String cashierName;
    private LocalDateTime createdAt = LocalDateTime.now();

    public InventoryMovement() {
    }

    public InventoryMovement(String id, String productId, String productName, Type type,
                              int quantity, String comment, String cashierName) {
        this.id = id;
        this.productId = productId;
        this.productName = productName;
        this.type = type;
        this.quantity = quantity;
        this.comment = comment;
        this.cashierName = cashierName;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getProductId() { return productId; }
    public void setProductId(String productId) { this.productId = productId; }

    public String getProductName() { return productName; }
    public void setProductName(String productName) { this.productName = productName; }

    public Type getType() { return type; }
    public void setType(Type type) { this.type = type; }

    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }

    public String getCashierName() { return cashierName; }
    public void setCashierName(String cashierName) { this.cashierName = cashierName; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}

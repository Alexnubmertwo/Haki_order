package com.haki.pos.model;

import java.time.LocalDateTime;

/**
 * Zapiska admina: "ostavil N summ na razmen, vot kommentariy".
 * Pokazyvaetsya kassiru pri otkrytii sleduyuschey smeny kak podskazka
 * dlya nachal'noy summy v kasse. Posle togo kak smena otkryta s ispol'zovaniem
 * etoy summy - zapiska schitaetsya "ispol'zovannoy" (consumed=true) i bol'she ne pokazyvaetsya,
 * poka admin ne ostavit novuyu.
 */
public class AdminCashNote {
    private int amount;
    private String comment;
    private String setBy;
    private LocalDateTime setAt = LocalDateTime.now();
    private boolean consumed = false;

    public AdminCashNote() {}

    public AdminCashNote(int amount, String comment, String setBy) {
        this.amount = amount;
        this.comment = comment;
        this.setBy = setBy;
    }

    public int getAmount() { return amount; }
    public void setAmount(int amount) { this.amount = amount; }
    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
    public String getSetBy() { return setBy; }
    public void setSetBy(String setBy) { this.setBy = setBy; }
    public LocalDateTime getSetAt() { return setAt; }
    public void setSetAt(LocalDateTime setAt) { this.setAt = setAt; }
    public boolean isConsumed() { return consumed; }
    public void setConsumed(boolean consumed) { this.consumed = consumed; }
}

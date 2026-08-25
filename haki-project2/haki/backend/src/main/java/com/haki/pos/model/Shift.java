package com.haki.pos.model;

import java.time.LocalDateTime;

/**
 * Smena kassira: otkrytie -> rabota -> zakrytie so sverkoy nalichnyh.
 * expectedCash = openingCash + cashRevenue - cashExpenses
 * discrepancy  = closingCashActual - expectedCash (0 = soshlos', otricatel'noe = nedostacha)
 */
public class Shift {

    public enum Status { OPEN, CLOSED }

    private String id;
    private String cashierName;
    private String branchName;
    private Status status = Status.OPEN;

    private int openingCash;      // s chem nachali smenu
    private String openingNote;   // kommentariy (naprimer ot admina "ostavil na razmen")

    private LocalDateTime openedAt = LocalDateTime.now();
    private LocalDateTime closedAt;

    private Integer closingCashActual; // chto kassir naschital fakticheski pri zakrytii
    private Integer expectedCash;      // chto doljno bylo byt' po raschyotu
    private Integer discrepancy;       // raznica (actual - expected)

    public Shift() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getCashierName() { return cashierName; }
    public void setCashierName(String cashierName) { this.cashierName = cashierName; }
    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public int getOpeningCash() { return openingCash; }
    public void setOpeningCash(int openingCash) { this.openingCash = openingCash; }
    public String getOpeningNote() { return openingNote; }
    public void setOpeningNote(String openingNote) { this.openingNote = openingNote; }
    public LocalDateTime getOpenedAt() { return openedAt; }
    public void setOpenedAt(LocalDateTime openedAt) { this.openedAt = openedAt; }
    public LocalDateTime getClosedAt() { return closedAt; }
    public void setClosedAt(LocalDateTime closedAt) { this.closedAt = closedAt; }
    public Integer getClosingCashActual() { return closingCashActual; }
    public void setClosingCashActual(Integer closingCashActual) { this.closingCashActual = closingCashActual; }
    public Integer getExpectedCash() { return expectedCash; }
    public void setExpectedCash(Integer expectedCash) { this.expectedCash = expectedCash; }
    public Integer getDiscrepancy() { return discrepancy; }
    public void setDiscrepancy(Integer discrepancy) { this.discrepancy = discrepancy; }
}

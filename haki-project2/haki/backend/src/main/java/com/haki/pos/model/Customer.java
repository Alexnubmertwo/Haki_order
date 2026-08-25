package com.haki.pos.model;

/**
 * Klient s bonusnym schyotom. Identificiruetsya po nomeru telefona.
 * Pri kajdoy pokupke nachislyaetsya 1% ot summy na balance,
 * kotoryy mojno spisat' pri sleduyuschey pokupke.
 */
public class Customer {
    private String phone;
    private String name;
    private int balance;      // nakoplennye bonusy (UZS)
    private int totalSpent;   // vsego potracheno za vsyo vremya
    private int debtBalance;  // skol'ko klient doljen (UZS), rastyot cherez oplatu "Dolg"

    public Customer() {}

    public Customer(String phone, String name) {
        this.phone = phone;
        this.name = name;
    }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public int getBalance() { return balance; }
    public void setBalance(int balance) { this.balance = balance; }
    public int getTotalSpent() { return totalSpent; }
    public void setTotalSpent(int totalSpent) { this.totalSpent = totalSpent; }
    public int getDebtBalance() { return debtBalance; }
    public void setDebtBalance(int debtBalance) { this.debtBalance = debtBalance; }
}

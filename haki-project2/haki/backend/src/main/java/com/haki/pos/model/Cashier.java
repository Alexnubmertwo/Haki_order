package com.haki.pos.model;

public class Cashier {
    private String id;
    private String name;
    private String username;
    private String password; // chernovaya versiya: hranitsya v otkrytom vide, ne dlya prod
    private String role = "Кассир"; // Владелец / Кассир / Администратор
    private String branchName;
    private boolean active = true;

    public Cashier() {}

    public Cashier(String id, String name, String username, String password, String role, String branchName, boolean active) {
        this.id = id;
        this.name = name;
        this.username = username;
        this.password = password;
        this.role = role;
        this.branchName = branchName;
        this.active = active;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}

package com.haki.pos.security;

/** Tekuschiy polzovatel (iz tokena). businessId = null tol'ko u SUPERADMIN. */
public record AuthUser(String id, String name, String role, String businessId) {
    public boolean isSuperAdmin() { return "SUPERADMIN".equals(role); }
    public boolean isCashier() { return "CASHIER".equals(role); }
}

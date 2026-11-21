package com.haki.pos.security;

import com.haki.pos.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.io.IOException;

/**
 * Proveryaet token na kazhdom /api/**, rol' i biznes.
 *  - /api/auth/login - otkryt
 *  - /api/superadmin/** - tol'ko SUPERADMIN
 *  - tovary i kategorii (izmenenie), filialy, kassiry, dashboard, zapiska admina - ADMIN ili SUPERADMIN
 *  - ostal'noe - lyuboy voshedshiy
 * Biznes: u ADMIN/CASHIER - ih sobstvennyy; SUPERADMIN vybiraet zagolovkom X-Business-Id.
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    private final AuthService auth;

    public AuthInterceptor(AuthService auth) {
        this.auth = auth;
    }

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) throws IOException {
        String method = req.getMethod();
        String path = req.getRequestURI();

        if ("OPTIONS".equalsIgnoreCase(method)) return true;
        if (path.equals("/api/auth/login")) return true;

        String header = req.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            return deny(res, 401, "Требуется вход");
        }
        AuthUser user = auth.validate(header.substring(7).trim());
        if (user == null) {
            return deny(res, 401, "Сессия истекла, войдите заново");
        }
        req.setAttribute(RequestCtx.ATTR_USER, user);

        if (path.startsWith("/api/superadmin")) {
            if (!user.isSuperAdmin()) return deny(res, 403, "Недостаточно прав");
            return true;
        }

        boolean readOnly = "GET".equalsIgnoreCase(method);
        boolean adminOnly = path.startsWith("/api/branches")
                || path.startsWith("/api/cashiers")
                || path.startsWith("/api/dashboard")
                || (path.startsWith("/api/products") && !readOnly)
                || (path.startsWith("/api/categories") && !readOnly)
                || (path.equals("/api/shifts/admin-note") && "POST".equalsIgnoreCase(method));
        if (adminOnly && user.isCashier()) {
            return deny(res, 403, "Недостаточно прав");
        }

        if (path.startsWith("/api/auth")) return true;

        String businessId;
        if (user.isSuperAdmin()) {
            businessId = req.getHeader("X-Business-Id");
            if (businessId != null && !businessId.isBlank() && !auth.businessExists(businessId)) {
                return deny(res, 404, "Бизнес не найден");
            }
        } else {
            businessId = user.businessId();
            if (!auth.businessActive(businessId)) {
                return deny(res, 403, "Бизнес отключён. Обратитесь к администратору платформы");
            }
        }
        if (businessId != null && !businessId.isBlank()) {
            req.setAttribute(RequestCtx.ATTR_BUSINESS, businessId);
        }
        return true;
    }

    private boolean deny(HttpServletResponse res, int status, String message) throws IOException {
        res.setStatus(status);
        res.setContentType("application/json;charset=UTF-8");
        res.getWriter().write("{\"error\":\"" + message + "\"}");
        return false;
    }
}

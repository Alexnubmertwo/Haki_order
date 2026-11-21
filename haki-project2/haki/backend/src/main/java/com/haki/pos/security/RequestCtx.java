package com.haki.pos.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** Dostup k polzovatelyu i biznesu tekuschego HTTP-zaprosa (ustanavlivaet AuthInterceptor). */
public final class RequestCtx {
    public static final String ATTR_USER = "haki.user";
    public static final String ATTR_BUSINESS = "haki.business";

    private RequestCtx() {}

    private static HttpServletRequest req() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes s) {
            return s.getRequest();
        }
        throw new ApiException(HttpStatus.UNAUTHORIZED, "Нет контекста запроса");
    }

    public static AuthUser user() {
        Object u = req().getAttribute(ATTR_USER);
        if (u instanceof AuthUser a) return a;
        throw new ApiException(HttpStatus.UNAUTHORIZED, "Требуется вход");
    }

    /** Biznes, s kotorym rabotaet zapros. Superadmin dolzhen vybrat' biznes (zagolovok X-Business-Id). */
    public static String businessId() {
        Object b = req().getAttribute(ATTR_BUSINESS);
        if (b instanceof String s && !s.isBlank()) return s;
        throw new ApiException(HttpStatus.BAD_REQUEST, "Сначала выберите бизнес");
    }
}

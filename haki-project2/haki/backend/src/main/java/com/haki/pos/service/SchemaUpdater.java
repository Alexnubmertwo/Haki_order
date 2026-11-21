package com.haki.pos.service;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Dobavlyaet novye tablicy pri zapuske servera, chtoby ne nuzhno bylo vruchnuyu zapuskat' SQL v Supabase.
 * Bezopasno zapuskat' mnogo raz (create ... if not exists).
 */
@Component
public class SchemaUpdater {
    private static final Logger log = LoggerFactory.getLogger(SchemaUpdater.class);

    private final JdbcTemplate jdbc;

    public SchemaUpdater(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostConstruct
    public void migrate() {
        try {
            jdbc.execute("create table if not exists categories ("
                    + "business_id text not null references businesses(id) on delete cascade, "
                    + "name text not null, "
                    + "created_at timestamp not null default now(), "
                    + "primary key (business_id, name))");
            jdbc.execute("alter table categories enable row level security");
            log.info("Tablica categories gotova.");
        } catch (Exception e) {
            log.warn("Ne udalos' sozdat' tablicu categories - kategorii budut rabotat' tol'ko cherez tovary", e);
        }
    }
}

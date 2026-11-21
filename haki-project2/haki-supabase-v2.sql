-- ============================================================
-- Haki POS v2 — MNOGO BIZNESOV (SaaS) dlya Supabase (PostgreSQL)
--
-- Roli:  SUPERADMIN (vladelec platformy, business_id = null)
--        ADMIN      (vladelec biznesa)
--        CASHIER    (kassir biznesa)
--
-- VNIMANIE: skript UDALYAET starye tablicy Haki i sozdayot novye.
-- Zapuskay tol'ko esli staryye dannye ne nujny.
-- Supabase -> SQL Editor -> vstav' vse -> Run.
-- ============================================================

drop table if exists
    sessions, order_items, orders, cash_expenses, admin_cash_notes,
    inventory_movements, shift_schedules, shifts, product_prices, products,
    customers, cashiers, users, branches, businesses
cascade;

create table businesses (
    id          text primary key,
    name        text not null,
    active      boolean not null default true,
    created_at  timestamp not null default now()
);

create table users (
    id             text primary key,
    business_id    text references businesses(id) on delete cascade, -- null = SUPERADMIN
    username       text not null,
    password_hash  text not null,            -- bcrypt
    name           text not null,
    role           text not null check (role in ('SUPERADMIN', 'ADMIN', 'CASHIER')),
    branch_name    text,
    active         boolean not null default true,
    created_at     timestamp not null default now()
);
create unique index users_username_unique on users (lower(username));
create index idx_users_business on users(business_id);

-- tokeny vhoda (hranitsya SHA-256 hash tokena, sam token znaet tol'ko brauzer)
create table sessions (
    token_hash  text primary key,
    user_id     text not null references users(id) on delete cascade,
    expires_at  timestamp not null
);

create table branches (
    id           text primary key,
    business_id  text not null references businesses(id) on delete cascade,
    name         text not null,
    address      text
);

create table products (
    id             text primary key,
    business_id    text not null references businesses(id) on delete cascade,
    name           text not null,
    category       text not null,
    image_url      text,
    prices         jsonb not null default '{}'::jsonb,
    stock_qty      integer not null default 0,
    min_stock_qty  integer not null default 0,
    unit           text not null default 'шт'
);
create index idx_products_business on products(business_id);

create table customers (
    business_id   text not null references businesses(id) on delete cascade,
    phone         text not null,
    name          text,
    balance       integer not null default 0,
    total_spent   integer not null default 0,
    debt_balance  integer not null default 0,
    primary key (business_id, phone)
);

create table shifts (
    id                   text primary key,
    business_id          text not null references businesses(id) on delete cascade,
    cashier_name         text,
    branch_name          text,
    status               text not null check (status in ('OPEN', 'CLOSED')) default 'OPEN',
    opening_cash         integer not null default 0,
    opening_note         text,
    opened_at            timestamp not null default now(),
    closed_at            timestamp,
    closing_cash_actual  integer,
    expected_cash        integer,
    discrepancy          integer
);
-- odna otkrytaya smena na biznes
create unique index one_open_shift_per_business on shifts (business_id) where status = 'OPEN';

create table orders (
    id              text primary key,
    business_id     text not null references businesses(id) on delete cascade,
    shift_id        text references shifts(id),
    cashier_name    text,
    branch_name     text,
    customer_phone  text,
    total           integer not null default 0,
    payment_method  text not null default 'CASH',
    cash_amount     integer not null default 0,
    card_amount     integer not null default 0,
    debt_amount     integer not null default 0,
    bonus_used      integer not null default 0,
    bonus_earned    integer not null default 0,
    created_at      timestamp not null default now()
);
create index idx_orders_business_created on orders(business_id, created_at);
create index idx_orders_shift on orders(shift_id);

create table order_items (
    id            bigserial primary key,
    order_id      text not null references orders(id) on delete cascade,
    product_id    text,
    product_name  text not null,
    size_label    text,
    price         integer not null,
    quantity      integer not null
);
create index idx_items_order on order_items(order_id);

create table inventory_movements (
    id            text primary key,
    business_id   text not null references businesses(id) on delete cascade,
    product_id    text,
    product_name  text not null,
    type          text not null check (type in ('IN', 'OUT')),
    quantity      integer not null,
    comment       text,
    cashier_name  text,
    created_at    timestamp not null default now()
);
create index idx_movements_business on inventory_movements(business_id, created_at);

create table cash_expenses (
    id            text primary key,
    business_id   text not null references businesses(id) on delete cascade,
    shift_id      text not null references shifts(id),
    amount        integer not null,
    comment       text,
    cashier_name  text,
    created_at    timestamp not null default now()
);
create index idx_expenses_shift on cash_expenses(shift_id);

create table admin_cash_notes (
    id           bigserial primary key,
    business_id  text not null references businesses(id) on delete cascade,
    amount       integer not null,
    comment      text,
    set_by       text,
    set_at       timestamp not null default now(),
    consumed     boolean not null default false
);

-- RLS vklyuchen bez politik: cherez publichnyy REST API Supabase nichego ne otkryvaetsya.
-- Backend podklyuchaetsya napryamuyu pod vladel'cem bazy i RLS obhodit.
alter table businesses          enable row level security;
alter table users               enable row level security;
alter table sessions            enable row level security;
alter table branches            enable row level security;
alter table products            enable row level security;
alter table customers           enable row level security;
alter table shifts              enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;
alter table inventory_movements enable row level security;
alter table cash_expenses       enable row level security;
alter table admin_cash_notes    enable row level security;

-- Superadmin sozdayotsya avtomaticheski pri pervom zapuske backend iz peremennyh
-- okruzheniya HAKI_SUPERADMIN_USER i HAKI_SUPERADMIN_PASSWORD (parol v baze - tol'ko bcrypt).

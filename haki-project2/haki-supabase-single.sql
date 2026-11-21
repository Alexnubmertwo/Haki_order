-- ============================================================
-- Haki POS — schema dlya Supabase (PostgreSQL), ODIN biznes.
-- Vstav' celikom v Supabase -> SQL Editor -> Run.
-- Eto uproschyonnaya versiya pod tekuschiy backend (Spring Boot + JDBC).
-- Mnogobiznesnaya SaaS-schema ostayotsya v haki-supabase-schema.sql
-- ============================================================

create table if not exists branches (
    id       text primary key,
    name     text not null,
    address  text
);

create table if not exists cashiers (
    id           text primary key,
    name         text not null,
    username     text not null unique,
    password     text not null,          -- CHERNOVIK: otkrytym tekstom, pozje - bcrypt
    role         text not null default 'Кассир',
    branch_name  text,
    active       boolean not null default true
);

create table if not exists products (
    id             text primary key,
    name           text not null,
    category       text not null,
    image_url      text,
    prices         jsonb not null default '{}'::jsonb,   -- {"M":35000,"L":45000} ili {"BASE":5000}
    stock_qty      integer not null default 0,
    min_stock_qty  integer not null default 0,
    unit           text not null default 'шт'
);

create table if not exists customers (
    phone         text primary key,
    name          text,
    balance       integer not null default 0,   -- bonusy
    total_spent   integer not null default 0,
    debt_balance  integer not null default 0
);

create table if not exists shifts (
    id                   text primary key,
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
-- tol'ko odna otkrytaya smena odnovremenno
create unique index if not exists one_open_shift on shifts ((status)) where status = 'OPEN';

create table if not exists orders (
    id              text primary key,
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

create table if not exists order_items (
    id            bigserial primary key,
    order_id      text not null references orders(id) on delete cascade,
    product_id    text,                 -- bez FK: istoriya ostayotsya posle udaleniya tovara
    product_name  text not null,
    size_label    text,
    price         integer not null,
    quantity      integer not null
);

create table if not exists inventory_movements (
    id            text primary key,
    product_id    text,
    product_name  text not null,
    type          text not null check (type in ('IN', 'OUT')),
    quantity      integer not null,
    comment       text,
    cashier_name  text,
    created_at    timestamp not null default now()
);

create table if not exists cash_expenses (
    id            text primary key,
    shift_id      text not null references shifts(id),
    amount        integer not null,
    comment       text,
    cashier_name  text,
    created_at    timestamp not null default now()
);

create table if not exists admin_cash_notes (
    id        bigserial primary key,
    amount    integer not null,
    comment   text,
    set_by    text,
    set_at    timestamp not null default now(),
    consumed  boolean not null default false
);

create index if not exists idx_orders_created on orders(created_at);
create index if not exists idx_orders_shift on orders(shift_id);
create index if not exists idx_items_order on order_items(order_id);
create index if not exists idx_expenses_shift on cash_expenses(shift_id);

-- Supabase otkryvaet public-tablicy cherez REST API. Backend hodit napryamuyu
-- pod vladel'cem bazy, a REST-dostup anon/authenticated nam ne nujen:
alter table branches            enable row level security;
alter table cashiers            enable row level security;
alter table products            enable row level security;
alter table customers           enable row level security;
alter table shifts              enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;
alter table inventory_movements enable row level security;
alter table cash_expenses       enable row level security;
alter table admin_cash_notes    enable row level security;
-- Politik net -> cherez REST API (anon key) nichego ne prochitat'. Rol' postgres (backend) RLS obhodit.

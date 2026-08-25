-- ============================================================
-- Haki SaaS — schema dlya Supabase (PostgreSQL)
-- Vstav' etot skript celikom v Supabase -> SQL Editor -> Run
-- ============================================================

create extension if not exists pgcrypto; -- dlya gen_random_uuid()

-- ------------------------------------------------------------
-- BUSINESSES: kajdaya stroka - otdel'nyy klient platformy
-- ------------------------------------------------------------
create table businesses (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- USERS: edinaya tablica dlya vseh rolyey (SUPERADMIN / ADMIN / CASHIER)
-- SUPERADMIN -> business_id = null (eto ty, vladelec platformy)
-- ADMIN      -> vladelec konkretnogo biznesa
-- CASHIER    -> kassir konkretnogo biznesa
-- ------------------------------------------------------------
create table users (
    id            uuid primary key default gen_random_uuid(),
    business_id   uuid references businesses(id) on delete cascade,
    username      text not null unique,
    password      text not null, -- chernovaya versiya: otkrytym tekstom, pozje - hash (bcrypt)
    name          text not null,
    role          text not null check (role in ('SUPERADMIN', 'ADMIN', 'CASHIER')),
    branch_id     uuid, -- zapolnyaetsya posle sozdaniya branches (FK dobavim nije)
    active        boolean not null default true,
    created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- BRANCHES: filialy biznesa
-- ------------------------------------------------------------
create table branches (
    id           uuid primary key default gen_random_uuid(),
    business_id  uuid not null references businesses(id) on delete cascade,
    name         text not null,
    address      text
);

alter table users
    add constraint users_branch_fk foreign key (branch_id) references branches(id) on delete set null;

-- ------------------------------------------------------------
-- PRODUCTS: tovary/menu kajdogo biznesa
-- ------------------------------------------------------------
create table products (
    id             uuid primary key default gen_random_uuid(),
    business_id    uuid not null references businesses(id) on delete cascade,
    name           text not null,
    category       text not null,
    stock_qty      integer not null default 0,
    min_stock_qty  integer not null default 0,
    unit           text not null default 'шт',
    created_at     timestamptz not null default now()
);

-- Ceny tovara: mojet byt' neskol'ko variantov (BASE / M / L)
create table product_prices (
    id           uuid primary key default gen_random_uuid(),
    product_id   uuid not null references products(id) on delete cascade,
    size_label   text not null,   -- 'BASE', 'M', 'L' i t.p.
    price        integer not null,
    unique (product_id, size_label)
);

-- ------------------------------------------------------------
-- CUSTOMERS: klienty s bonusnym schyotom i dolgom (na biznes)
-- ------------------------------------------------------------
create table customers (
    id            uuid primary key default gen_random_uuid(),
    business_id   uuid not null references businesses(id) on delete cascade,
    phone         text not null,
    name          text,
    balance       integer not null default 0,   -- bonusy
    total_spent   integer not null default 0,
    debt_balance  integer not null default 0,
    unique (business_id, phone)
);

-- ------------------------------------------------------------
-- SHIFTS: smeny kassirov
-- ------------------------------------------------------------
create table shifts (
    id                    uuid primary key default gen_random_uuid(),
    business_id           uuid not null references businesses(id) on delete cascade,
    cashier_id            uuid not null references users(id),
    branch_id             uuid references branches(id),
    status                text not null check (status in ('OPEN', 'CLOSED')) default 'OPEN',
    opening_cash          integer not null default 0,
    opening_note          text,
    opened_at             timestamptz not null default now(),
    closed_at             timestamptz,
    closing_cash_actual   integer,
    expected_cash         integer,
    discrepancy           integer
);

-- ------------------------------------------------------------
-- SHIFT_SCHEDULES: grafik smen, kotoryy admin naznachaet kassiram
-- ------------------------------------------------------------
create table shift_schedules (
    id            uuid primary key default gen_random_uuid(),
    business_id   uuid not null references businesses(id) on delete cascade,
    cashier_id    uuid not null references users(id) on delete cascade,
    day_of_week   integer not null check (day_of_week between 0 and 6), -- 0 = voskresenye ... 6 = subbota
    start_time    time not null,
    end_time      time not null
);

-- ------------------------------------------------------------
-- ORDERS: cheki
-- ------------------------------------------------------------
create table orders (
    id               uuid primary key default gen_random_uuid(),
    business_id      uuid not null references businesses(id) on delete cascade,
    shift_id         uuid references shifts(id),
    cashier_id       uuid references users(id),
    branch_id        uuid references branches(id),
    customer_id      uuid references customers(id),
    total            integer not null default 0,
    payment_method   text not null check (payment_method in ('CASH', 'CARD', 'MIXED', 'DEBT')),
    cash_amount      integer not null default 0,
    card_amount      integer not null default 0,
    debt_amount      integer not null default 0,
    bonus_used       integer not null default 0,
    bonus_earned     integer not null default 0,
    created_at       timestamptz not null default now()
);

-- ------------------------------------------------------------
-- ORDER_ITEMS: sostav cheka (tovary + dop. uslugi)
-- ------------------------------------------------------------
create table order_items (
    id             uuid primary key default gen_random_uuid(),
    order_id       uuid not null references orders(id) on delete cascade,
    product_id     uuid references products(id), -- null dlya dop. uslug
    product_name   text not null,                 -- sohranyaem nazvanie na moment prodaji
    size_label     text,
    price          integer not null,
    quantity       integer not null
);

-- ------------------------------------------------------------
-- INVENTORY_MOVEMENTS: prihod/rashod tovara na sklade
-- ------------------------------------------------------------
create table inventory_movements (
    id             uuid primary key default gen_random_uuid(),
    business_id    uuid not null references businesses(id) on delete cascade,
    product_id     uuid references products(id),
    product_name   text not null,
    type           text not null check (type in ('IN', 'OUT')),
    quantity       integer not null,
    comment        text,
    cashier_id     uuid references users(id),
    created_at     timestamptz not null default now()
);

-- ------------------------------------------------------------
-- CASH_EXPENSES: kassovye rashody (spisyvayutsya iz nalichnyh smeny)
-- ------------------------------------------------------------
create table cash_expenses (
    id            uuid primary key default gen_random_uuid(),
    business_id   uuid not null references businesses(id) on delete cascade,
    shift_id      uuid not null references shifts(id),
    amount        integer not null,
    comment       text,
    cashier_id    uuid references users(id),
    created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- ADMIN_CASH_NOTES: podskazka admina o summe dlya sleduyuschey smeny
-- ------------------------------------------------------------
create table admin_cash_notes (
    id            uuid primary key default gen_random_uuid(),
    business_id   uuid not null references businesses(id) on delete cascade,
    amount        integer not null,
    comment       text,
    set_by        uuid references users(id),
    set_at        timestamptz not null default now(),
    consumed      boolean not null default false
);

-- ------------------------------------------------------------
-- INDEXES: uskoryayut samye chastye zaprosy (fil'tr po business_id)
-- ------------------------------------------------------------
create index idx_users_business on users(business_id);
create index idx_products_business on products(business_id);
create index idx_customers_business on customers(business_id);
create index idx_shifts_business on shifts(business_id);
create index idx_orders_business on orders(business_id);
create index idx_orders_shift on orders(shift_id);
create index idx_order_items_order on order_items(order_id);
create index idx_inventory_business on inventory_movements(business_id);
create index idx_expenses_shift on cash_expenses(shift_id);

-- ============================================================
-- SEED: tvoy sobstvennyy login superadmina platformy
-- ЗАМЕНИ 'СВОЙ_ЛОГИН' и 'СВОЙ_ПАРОЛЬ' на реальные значения
-- перед выполнением этого блока (или выполни отдельно после).
-- ============================================================
insert into users (business_id, username, password, name, role)
values (null, 'СВОЙ_ЛОГИН', 'СВОЙ_ПАРОЛЬ', 'Hamidulla', 'SUPERADMIN');

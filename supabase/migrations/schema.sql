-- =====================================================================
--  MARROW FRESH — full database schema (Supabase / PostgreSQL)
--  ONE file for a fresh project. Idempotent (if-not-exists / on-conflict).
--
--  Hierarchy:  Category → Sub-category → Product → Variant
--  Covers: categories, subcategories, products (+SEO/merchandising/gross-net),
--          product_variants, combos, customers, staff, orders, order_items,
--          coupons, rules engine, banners, settings, apartments — all with
--          public READ-ONLY Row Level Security on the catalogue tables.
--  "Cut fresh. Never frozen."  — KPHB Phase 4, Hyderabad.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
do $$ begin create type product_category as enum ('Chicken','Mutton','Fish','Prawns','Crabs','Eggs'); exception when duplicate_object then null; end $$;
do $$ begin create type order_status     as enum ('New','Cutting/Packing','Out for delivery','Delivered','Cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type payment_method   as enum ('UPI','Cash'); exception when duplicate_object then null; end $$;
do $$ begin create type payment_status   as enum ('Paid','Unpaid'); exception when duplicate_object then null; end $$;
do $$ begin create type staff_role       as enum ('admin','delivery'); exception when duplicate_object then null; end $$;
do $$ begin create type coupon_type      as enum ('percent','flat','free_delivery'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- CATALOGUE — categories → subcategories → products → variants
-- ---------------------------------------------------------------------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text unique,
  icon text,
  image_url text,
  seo_title text,
  seo_description text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  name text not null,
  slug text not null,
  icon text,
  image_url text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (category_id, slug)
);
create index if not exists subcategories_category_idx on subcategories(category_id);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  category product_category,                       -- legacy/optional (grouping uses subcategory)
  subcategory_id uuid references subcategories(id) on delete set null,
  unit text not null,                              -- '1kg' | '500g' | '6' | '30'
  price numeric(10,2) not null check (price >= 0), -- headline price (used in Product schema)
  weight_kg numeric(6,3) not null default 0,
  weight_basis text not null default 'net' check (weight_basis in ('net','gross')),
  yield_pct numeric(5,2),                          -- gross items: edible % (live chicken ~70, prawns ~60, crab ~40)
  cleaning text,                                   -- 'Dressed' | 'Cleaned & deveined'
  short_description text,
  image_url text,
  badges text[] not null default '{}',
  seo_title text,
  seo_description text,
  bestseller boolean not null default false,
  recommended boolean not null default false,
  today_special boolean not null default false,
  available boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists products_subcategory_idx on products(subcategory_id);

create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  label text not null,                             -- '250g' | '500g' | '1kg' | '6'
  weight_g numeric(8,2) not null default 0,
  price numeric(10,2) not null check (price >= 0),
  sort_order int not null default 0,
  available boolean not null default true,
  created_at timestamptz not null default now(),
  unique (product_id, label)
);
create index if not exists product_variants_product_idx on product_variants(product_id);

-- ---------------------------------------------------------------------
-- COMBOS (fixed-price bundles)
-- ---------------------------------------------------------------------
create table if not exists combos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  save_amount numeric(10,2) not null default 0,
  free_delivery boolean not null default false,
  available boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists combo_items (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references combos(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  qty numeric(6,2) not null default 1 check (qty > 0)
);

-- ---------------------------------------------------------------------
-- CUSTOMERS (phone is PRIVATE) + STAFF
-- ---------------------------------------------------------------------
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,            -- PRIVATE — hidden from delivery staff via RLS
  address text,
  area text,
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  role staff_role not null default 'delivery',
  pin text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Apartment directory (apartment-first checkout autocomplete)
create table if not exists apartments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area text,
  pincode text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ORDERS
-- ---------------------------------------------------------------------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_no bigint generated by default as identity,
  customer_id uuid references customers(id) on delete set null,
  status order_status not null default 'New',
  subtotal numeric(10,2) not null default 0,
  total_weight numeric(8,3) not null default 0,
  coupon_code text,
  discount numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  packing_fee numeric(10,2) not null default 0,
  platform_fee numeric(10,2) not null default 0,
  tax_total numeric(10,2) not null default 0,
  grand_total numeric(10,2) not null default 0,
  payment_method payment_method not null default 'UPI',
  payment_status payment_status not null default 'Unpaid',
  assigned_to uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  combo_id uuid references combos(id) on delete set null,
  name text not null,
  qty numeric(6,2) not null check (qty > 0),
  price_each numeric(10,2) not null,
  weight_each numeric(6,3) not null default 0,
  line_total numeric(10,2) not null,
  check (product_id is not null or combo_id is not null)
);

-- ---------------------------------------------------------------------
-- COUPONS · RULES (free delivery/packing engine) · BANNERS · SETTINGS
-- ---------------------------------------------------------------------
create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type coupon_type not null,
  value numeric(10,2) not null default 0,
  min_order numeric(10,2) not null default 0,
  max_discount numeric(10,2),
  first_order_only boolean not null default false,
  usage_limit int,
  per_customer_limit int,
  used_count int not null default 0,
  valid_from date,
  valid_to date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  conditions jsonb not null default '[]'::jsonb,
  match text not null default 'all' check (match in ('all','any')),
  waive_delivery boolean not null default true,
  waive_packing boolean not null default true,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image_url text,
  link_to text,
  placement text not null default 'home_hero' check (placement in ('home_hero','carousel','popup','strip')),
  sort_order int not null default 0,
  start_date date,
  end_date date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  base_delivery_fee numeric(10,2) not null default 49,
  free_delivery_amount numeric(10,2) not null default 799,
  free_delivery_weight numeric(8,3) not null default 2,
  packing_fee_enabled boolean not null default true,
  packing_fee numeric(10,2) not null default 10,
  free_packing_amount numeric(10,2) not null default 799,
  free_packing_weight numeric(8,3) not null default 2,
  platform_fee_enabled boolean not null default false,
  platform_fee_type text not null default 'flat' check (platform_fee_type in ('flat','percent')),
  platform_fee_value numeric(10,2) not null default 0,
  default_tax_rate numeric(5,2) not null default 0,
  min_order_value numeric(10,2) not null default 0,
  updated_at timestamptz not null default now()
);

-- =====================================================================
--  ROW LEVEL SECURITY
--   • public (anon) can READ the catalogue + offers (active/available rows)
--   • customers are private; delivery staff use a phone-less view
--   • admin writes use the service-role key (bypasses RLS) or an auth session
-- =====================================================================
alter table categories       enable row level security;
alter table subcategories    enable row level security;
alter table products         enable row level security;
alter table product_variants enable row level security;
alter table coupons          enable row level security;
alter table banners          enable row level security;
alter table apartments       enable row level security;
alter table customers        enable row level security;

drop policy if exists "read categories"    on categories;
drop policy if exists "read subcategories" on subcategories;
drop policy if exists "read products"      on products;
drop policy if exists "read variants"      on product_variants;
drop policy if exists "read coupons"       on coupons;
drop policy if exists "read banners"       on banners;
drop policy if exists "read apartments"    on apartments;

create policy "read categories"    on categories       for select to anon, authenticated using (active = true);
create policy "read subcategories" on subcategories    for select to anon, authenticated using (active = true);
create policy "read products"      on products         for select to anon, authenticated using (available = true);
create policy "read variants"      on product_variants for select to anon, authenticated using (available = true);
create policy "read coupons"       on coupons          for select to anon, authenticated using (active = true);
create policy "read banners"       on banners          for select to anon, authenticated using (active = true);
create policy "read apartments"    on apartments       for select to anon, authenticated using (active = true);

-- delivery staff: address + area, never the phone
create or replace view delivery_customer_view as
  select id, name, address, area from customers;

-- =====================================================================
--  SEED DATA  (illustrative — edit in the admin panel)
-- =====================================================================
insert into settings (id) values (1) on conflict (id) do nothing;

-- Categories (top level)
insert into categories (name, slug, icon, sort_order) values
  ('Chicken','chicken','🐔',1),
  ('Mutton','mutton','🐐',2),
  ('Seafood','seafood','🐟',3),
  ('Eggs','eggs','🥚',4)
on conflict (name) do nothing;

-- Sub-categories
insert into subcategories (category_id, name, slug, icon, sort_order)
select c.id, v.name, v.slug, v.icon, v.so
from categories c
join (values
  ('Chicken','Curry Cut','curry-cut','🍗',1),
  ('Chicken','Boneless','boneless','🍖',2),
  ('Chicken','Wings','wings','🍗',3),
  ('Mutton','Curry Cut','curry-cut','🐐',1),
  ('Mutton','Boneless','boneless','🍖',2),
  ('Seafood','Fish','fish','🐟',1),
  ('Seafood','Prawns','prawns','🦐',2),
  ('Seafood','Crabs','crabs','🦀',3),
  ('Eggs','Country','country','🥚',1)
) as v(cat,name,slug,icon,so) on v.cat = c.name
on conflict (category_id, slug) do nothing;

-- helper: subcategory id by category name + sub slug
--   (inline subselects used below)

-- Products (with subcategory link + gross/net where relevant)
insert into products (name, slug, category, subcategory_id, unit, price, short_description, badges, bestseller, weight_basis, yield_pct, cleaning, sort_order)
values
  ('Curry Cut','chicken-curry-cut','Chicken', (select s.id from subcategories s join categories c on c.id=s.category_id where c.name='Chicken' and s.slug='curry-cut'), '500g', 169, 'Medium pieces, skin-on. Never frozen.', '{Cut Fresh Today,Never Frozen}', true, 'net', null, null, 1),
  ('Boneless','chicken-boneless','Chicken', (select s.id from subcategories s join categories c on c.id=s.category_id where c.name='Chicken' and s.slug='boneless'), '500g', 199, 'Tender breast & thigh cubes.', '{Cut Fresh Today,Antibiotic Free}', false, 'net', null, null, 2),
  ('Wings','chicken-wings','Chicken', (select s.id from subcategories s join categories c on c.id=s.category_id where c.name='Chicken' and s.slug='wings'), '500g', 129, 'Party-favourite, fresh wings.', '{Cut Fresh Today}', false, 'net', null, null, 3),
  ('Live Chicken (dressed)','chicken-live','Chicken', (select s.id from subcategories s join categories c on c.id=s.category_id where c.name='Chicken' and s.slug='curry-cut'), '1kg', 230, 'Live weight, dressed to order.', '{Never Frozen}', false, 'gross', 70, 'Dressed', 4),
  ('Curry Cut','mutton-curry-cut','Mutton', (select s.id from subcategories s join categories c on c.id=s.category_id where c.name='Mutton' and s.slug='curry-cut'), '500g', 469, 'Tender goat, bone-in pieces.', '{Cut Fresh Today,Premium Quality}', true, 'net', null, null, 1),
  ('Boneless','mutton-boneless','Mutton', (select s.id from subcategories s join categories c on c.id=s.category_id where c.name='Mutton' and s.slug='boneless'), '500g', 519, 'Lean boneless goat cubes.', '{Premium Quality}', false, 'net', null, null, 2),
  ('Rohu','rohu-fish','Fish', (select s.id from subcategories s join categories c on c.id=s.category_id where c.name='Seafood' and s.slug='fish'), '500g', 149, 'Cleaned & cut to order, curry-ready.', '{Cleaned & Hygienic}', false, 'net', null, null, 1),
  ('Katla','katla-fish','Fish', (select s.id from subcategories s join categories c on c.id=s.category_id where c.name='Seafood' and s.slug='fish'), '500g', 139, 'Cleaned & cut, curry-ready.', '{Cleaned & Hygienic}', false, 'net', null, null, 2),
  ('Medium Prawns','prawns-medium','Prawns', (select s.id from subcategories s join categories c on c.id=s.category_id where c.name='Seafood' and s.slug='prawns'), '500g', 299, 'Shell-on; cleaned & deveined to order.', '{Cleaned & Hygienic}', true, 'gross', 60, 'Cleaned & deveined', 3),
  ('Mud Crab','mud-crab','Crabs', (select s.id from subcategories s join categories c on c.id=s.category_id where c.name='Seafood' and s.slug='crabs'), '1kg', 700, 'Live, cleaned to order.', '{Premium Quality}', false, 'gross', 40, 'Cleaned', 4),
  ('Country Eggs','country-eggs','Eggs', (select s.id from subcategories s join categories c on c.id=s.category_id where c.name='Eggs' and s.slug='country'), '6', 90, 'Farm-fresh country eggs.', '{Farm Fresh}', false, 'net', null, null, 1)
on conflict (slug) do nothing;

-- Variants
insert into product_variants (product_id, label, weight_g, price, sort_order)
select p.id, v.label, v.g, v.price, v.so
from products p
join (values
  ('chicken-curry-cut','250g',250,99,1),('chicken-curry-cut','500g',500,169,2),('chicken-curry-cut','1kg',1000,329,3),
  ('chicken-boneless','250g',250,119,1),('chicken-boneless','500g',500,199,2),('chicken-boneless','1kg',1000,389,3),
  ('chicken-wings','250g',250,75,1),('chicken-wings','500g',500,129,2),
  ('chicken-live','1kg live',1000,230,1),('chicken-live','1.5kg live',1500,345,2),
  ('mutton-curry-cut','250g',250,239,1),('mutton-curry-cut','500g',500,469,2),
  ('mutton-boneless','250g',250,265,1),('mutton-boneless','500g',500,519,2),
  ('rohu-fish','250g',250,85,1),('rohu-fish','500g',500,149,2),
  ('katla-fish','250g',250,79,1),('katla-fish','500g',500,139,2),
  ('prawns-medium','250g',250,169,1),('prawns-medium','500g',500,299,2),
  ('mud-crab','1kg live',1000,700,1),
  ('country-eggs','6',0,90,1),('country-eggs','12',0,175,2),('country-eggs','30',0,420,3)
) as v(slug,label,g,price,so) on v.slug = p.slug
on conflict (product_id, label) do nothing;

-- Coupons
insert into coupons (code, type, value, min_order, max_discount, first_order_only) values
  ('WELCOME10','percent',10,300,100,true),
  ('FLAT50','flat',50,500,null,false),
  ('FREESHIP','free_delivery',0,200,null,false)
on conflict (code) do nothing;

-- Banners (promos shown on the site)
insert into banners (title, link_to, placement, sort_order) values
  ('Launch offer — 10% off your first order','WELCOME10','strip',1),
  ('Weekend Combo — chicken + mutton','WEEKEND','carousel',2),
  ('Free delivery over ₹799','FREESHIP','carousel',3)
on conflict do nothing;

-- Free delivery / packing rules (combination-ready)
insert into rules (name, conditions, match, sort_order) values
  ('Global: ₹799 or 2kg',
   '[{"measure":"amount","scope":"all","op":">=","value":799},{"measure":"weight","scope":"all","op":">=","value":2}]'::jsonb,
   'any', 1)
on conflict do nothing;

-- Apartments (autocomplete)
insert into apartments (name, area) values
  ('My Home Avatar','KPHB'),
  ('Aparna Sarovar','Nallagandla'),
  ('Janapriya Utopia','Miyapur')
on conflict do nothing;

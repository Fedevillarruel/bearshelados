-- Tiendanube must remain a separately authorized commercial surface.
-- This migration is intended to run after the recovery seed on the partial project.
begin;

alter table public.profiles add column if not exists is_super_admin boolean not null default false;

alter table public.profiles drop constraint if exists profile_super_admin_requires_admin;
alter table public.profiles add constraint profile_super_admin_requires_admin check (
  not is_super_admin or role = 'admin'
);

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select role = 'admin' and is_active and is_super_admin
    from public.profiles
    where id = auth.uid()
  ), false);
$$;

-- This is the only automatic promotion. Future promotions require an existing super administrator.
do $$
begin
  if not exists (select 1 from public.profiles where is_super_admin) then
    update public.profiles
      set is_super_admin = true
      where email = 'admin@bears-helados.com'
        and role = 'admin'
        and is_active;
  end if;
end;
$$;

create or replace function public.protect_super_admin_flag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_super_admin is distinct from old.is_super_admin
    and auth.role() <> 'service_role'
    and not public.is_super_admin() then
    raise exception 'Only a super administrator can change Tiendanube access.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_super_admin_flag on public.profiles;
create trigger profiles_protect_super_admin_flag
  before update of is_super_admin on public.profiles
  for each row execute function public.protect_super_admin_flag();

drop policy if exists "admin manages profiles" on public.profiles;
create policy "admin manages non-super-admin profiles" on public.profiles for all using (
  public.is_super_admin() or (public.is_admin() and not is_super_admin)
) with check (
  public.is_super_admin() or (public.is_admin() and not is_super_admin)
);

create or replace function public.bootstrap_tiendanube_super_admin(target_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles where is_super_admin) then
    raise exception 'A Tiendanube super administrator already exists.';
  end if;

  update public.profiles
  set is_super_admin = true
  where id = target_user_id and role = 'admin' and is_active;

  if not found then
    raise exception 'The bootstrap account must be an active administrator.';
  end if;
end;
$$;
revoke execute on function public.bootstrap_tiendanube_super_admin(uuid) from public;
grant execute on function public.bootstrap_tiendanube_super_admin(uuid) to service_role;

create table public.tiendanube_connections (
  id uuid primary key default gen_random_uuid(),
  store_id text not null unique check (store_id ~ '^[0-9]+$'),
  store_name text,
  scopes text[] not null default '{}'::text[],
  status text not null default 'disconnected' check (status in ('pending', 'connected', 'disconnected', 'revoked', 'error')),
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz,
  disconnected_at timestamptz,
  revoked_at timestamptz,
  last_synced_at timestamptz,
  last_sync_status text not null default 'idle' check (last_sync_status in ('idle', 'queued', 'running', 'succeeded', 'failed')),
  last_sync_error text,
  webhook_registered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tiendanube_connections_status_idx on public.tiendanube_connections (status);

create table public.tiendanube_connection_secrets (
  connection_id uuid primary key references public.tiendanube_connections(id) on delete cascade,
  encrypted_access_token text not null,
  encryption_key_version int not null default 1 check (encryption_key_version > 0),
  rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tiendanube_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint tiendanube_oauth_state_expiry_check check (expires_at > created_at)
);
create index tiendanube_oauth_states_expiry_idx on public.tiendanube_oauth_states (expires_at) where consumed_at is null;

create table public.tiendanube_sku_branch_mappings (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.tiendanube_connections(id) on delete cascade,
  sku text not null check (sku = upper(trim(sku)) and length(sku) between 1 and 120),
  franchise_id uuid not null references public.franchises(id) on delete restrict,
  is_active boolean not null default true,
  effective_from date not null default current_date,
  effective_until date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tiendanube_sku_mapping_dates_check check (effective_until is null or effective_until >= effective_from),
  unique (connection_id, sku)
);
create index tiendanube_sku_branch_mappings_franchise_idx on public.tiendanube_sku_branch_mappings (franchise_id) where is_active;

create table public.tiendanube_report_grants (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.tiendanube_connections(id) on delete cascade,
  franchise_id uuid not null references public.franchises(id) on delete cascade,
  can_view_sales boolean not null default false,
  can_view_inventory boolean not null default false,
  is_active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tiendanube_report_grant_dates_check check (ends_at is null or ends_at > starts_at),
  unique (connection_id, franchise_id)
);
create index tiendanube_report_grants_franchise_idx on public.tiendanube_report_grants (franchise_id) where is_active;

create table public.tiendanube_sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.tiendanube_connections(id) on delete cascade,
  kind text not null check (kind in ('initial', 'incremental', 'webhook', 'privacy')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  requested_by uuid references public.profiles(id) on delete set null,
  cursor jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  constraint tiendanube_sync_runs_finished_check check (finished_at is null or started_at is not null)
);
create index tiendanube_sync_runs_connection_created_idx on public.tiendanube_sync_runs (connection_id, created_at desc);
create index tiendanube_sync_runs_queued_idx on public.tiendanube_sync_runs (created_at) where status = 'queued';

create table public.tiendanube_webhook_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.tiendanube_connections(id) on delete cascade,
  store_id text not null check (store_id ~ '^[0-9]+$'),
  event text not null check (length(event) between 1 and 120),
  resource_id text,
  sanitized_payload jsonb not null default '{}'::jsonb,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'queued' check (status in ('queued', 'processing', 'processed', 'failed')),
  processing_attempts int not null default 0 check (processing_attempts >= 0),
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
-- Tiendanube does not provide a universal delivery ID. Preserve each delivery and make resource upserts idempotent.
create index tiendanube_webhook_events_queued_idx on public.tiendanube_webhook_events (received_at) where status = 'queued';
create index tiendanube_webhook_events_store_idx on public.tiendanube_webhook_events (store_id, event, received_at desc);

create table public.tiendanube_orders (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.tiendanube_connections(id) on delete cascade,
  external_order_id text not null,
  order_number text,
  status text,
  payment_status text,
  shipping_status text,
  storefront text,
  total numeric(16, 2),
  currency text check (currency is null or length(currency) = 3),
  source_created_at timestamptz,
  source_updated_at timestamptz,
  paid_at timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_order_id)
);
create index tiendanube_orders_connection_created_idx on public.tiendanube_orders (connection_id, source_created_at desc);

create table public.tiendanube_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.tiendanube_orders(id) on delete cascade,
  external_line_item_id text not null,
  external_product_id text,
  external_variant_id text,
  sku text,
  product_name text,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_price numeric(16, 2),
  line_total numeric(16, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, external_line_item_id)
);
create index tiendanube_order_items_sku_idx on public.tiendanube_order_items (sku) where sku is not null;

create table public.tiendanube_inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.tiendanube_connections(id) on delete cascade,
  external_product_id text not null,
  external_variant_id text not null,
  location_id text,
  sku text,
  product_name text,
  stock_management boolean,
  stock numeric(14, 3),
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index tiendanube_inventory_snapshots_connection_time_idx on public.tiendanube_inventory_snapshots (connection_id, captured_at desc);
create index tiendanube_inventory_snapshots_sku_idx on public.tiendanube_inventory_snapshots (connection_id, sku, captured_at desc) where sku is not null;

create table public.tiendanube_privacy_requests (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.tiendanube_connections(id) on delete cascade,
  store_id text not null check (store_id ~ '^[0-9]+$'),
  request_type text not null check (request_type in ('store_redact', 'customers_redact', 'customers_data_request')),
  external_request_id text,
  customer_id text,
  order_ids text[] not null default '{}'::text[],
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  received_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  unique (store_id, request_type, external_request_id)
);
create index tiendanube_privacy_requests_queued_idx on public.tiendanube_privacy_requests (received_at) where status = 'queued';

alter table public.tiendanube_connections enable row level security;
alter table public.tiendanube_connection_secrets enable row level security;
alter table public.tiendanube_oauth_states enable row level security;
alter table public.tiendanube_sku_branch_mappings enable row level security;
alter table public.tiendanube_report_grants enable row level security;
alter table public.tiendanube_sync_runs enable row level security;
alter table public.tiendanube_webhook_events enable row level security;
alter table public.tiendanube_orders enable row level security;
alter table public.tiendanube_order_items enable row level security;
alter table public.tiendanube_inventory_snapshots enable row level security;
alter table public.tiendanube_privacy_requests enable row level security;

create policy "super admins read Tiendanube connections" on public.tiendanube_connections for select using (public.is_super_admin());
create policy "super admins read SKU mappings" on public.tiendanube_sku_branch_mappings for select using (public.is_super_admin());
create policy "read own active Tiendanube report grants" on public.tiendanube_report_grants for select using (
  public.is_super_admin() or (
    public.current_app_role() = 'franquiciado'
    and franchise_id = public.current_franchise_id()
    and is_active
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
  )
);

create trigger tiendanube_connections_updated_at before update on public.tiendanube_connections for each row execute function public.set_updated_at();
create trigger tiendanube_connection_secrets_updated_at before update on public.tiendanube_connection_secrets for each row execute function public.set_updated_at();
create trigger tiendanube_sku_branch_mappings_updated_at before update on public.tiendanube_sku_branch_mappings for each row execute function public.set_updated_at();
create trigger tiendanube_report_grants_updated_at before update on public.tiendanube_report_grants for each row execute function public.set_updated_at();
create trigger tiendanube_orders_updated_at before update on public.tiendanube_orders for each row execute function public.set_updated_at();
create trigger tiendanube_order_items_updated_at before update on public.tiendanube_order_items for each row execute function public.set_updated_at();

create or replace function public.store_tiendanube_connection(
  target_store_id text,
  target_scopes text[],
  target_encrypted_access_token text,
  target_encryption_key_version int,
  target_connected_by uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  target_connection_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Tiendanube connections may only be stored by the service role.';
  end if;
  if target_store_id !~ '^[0-9]+$' then
    raise exception 'Tiendanube store ID is invalid.';
  end if;

  insert into public.tiendanube_connections (
    store_id, scopes, status, connected_by, connected_at, disconnected_at, revoked_at, last_sync_status, last_sync_error
  ) values (
    target_store_id, coalesce(target_scopes, '{}'::text[]), 'connected', target_connected_by, now(), null, null, 'idle', null
  ) on conflict (store_id) do update set
    scopes = excluded.scopes,
    status = 'connected',
    connected_by = excluded.connected_by,
    connected_at = now(),
    disconnected_at = null,
    revoked_at = null,
    last_sync_status = 'idle',
    last_sync_error = null
  returning id into target_connection_id;

  insert into public.tiendanube_connection_secrets (
    connection_id, encrypted_access_token, encryption_key_version, rotated_at
  ) values (
    target_connection_id, target_encrypted_access_token, target_encryption_key_version, now()
  ) on conflict (connection_id) do update set
    encrypted_access_token = excluded.encrypted_access_token,
    encryption_key_version = excluded.encryption_key_version,
    rotated_at = now();

  return target_connection_id;
end;
$$;
revoke all on function public.store_tiendanube_connection(text, text[], text, int, uuid) from public;
grant execute on function public.store_tiendanube_connection(text, text[], text, int, uuid) to service_role;

select pg_notify('pgrst', 'reload schema');
commit;
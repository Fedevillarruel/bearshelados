-- Durable work claims for Tiendanube. These functions are intentionally
-- restricted to service_role so browser sessions cannot drain or alter queues.
begin;

alter table public.tiendanube_webhook_events add column if not exists locked_at timestamptz;
alter table public.tiendanube_privacy_requests add column if not exists locked_at timestamptz;
create index if not exists tiendanube_webhook_events_claim_idx on public.tiendanube_webhook_events (status, locked_at, received_at);
create index if not exists tiendanube_privacy_requests_claim_idx on public.tiendanube_privacy_requests (status, locked_at, received_at);

create or replace function public.claim_tiendanube_sync_runs(batch_size integer default 1)
returns setof public.tiendanube_sync_runs language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Tiendanube sync work may only be claimed by the service role.';
  end if;

  return query
  with candidates as (
    select id
    from public.tiendanube_sync_runs
    where status = 'queued'
      or (status = 'running' and started_at < now() - interval '15 minutes' and finished_at is null)
    order by created_at
    for update skip locked
    limit greatest(1, least(coalesce(batch_size, 1), 10))
  )
  update public.tiendanube_sync_runs sync_run
  set status = 'running', started_at = now()
  from candidates
  where sync_run.id = candidates.id
  returning sync_run.*;
end;
$$;
revoke execute on function public.claim_tiendanube_sync_runs(integer) from public;
grant execute on function public.claim_tiendanube_sync_runs(integer) to service_role;

create or replace function public.enqueue_tiendanube_incremental_syncs()
returns integer language plpgsql security definer set search_path = public as $$
declare
  queued_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Tiendanube sync work may only be queued by the service role.';
  end if;

  with candidates as (
    select connection.id
    from public.tiendanube_connections connection
    where connection.status = 'connected'
      and (connection.last_synced_at is null or connection.last_synced_at < now() - interval '15 minutes')
      and not exists (
        select 1
        from public.tiendanube_sync_runs sync_run
        where sync_run.connection_id = connection.id
          and sync_run.status in ('queued', 'running')
      )
    order by connection.last_synced_at nulls first
    for update skip locked
    limit 10
  ), queued_connections as (
    update public.tiendanube_connections connection
    set last_sync_status = 'queued', last_sync_error = null
    from candidates
    where connection.id = candidates.id
    returning connection.id
  )
  insert into public.tiendanube_sync_runs (connection_id, kind)
  select id, 'incremental'
  from queued_connections;

  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;
revoke execute on function public.enqueue_tiendanube_incremental_syncs() from public;
grant execute on function public.enqueue_tiendanube_incremental_syncs() to service_role;

create or replace function public.claim_tiendanube_webhook_events(batch_size integer default 10)
returns setof public.tiendanube_webhook_events language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Tiendanube webhook work may only be claimed by the service role.';
  end if;

  return query
  with candidates as (
    select id
    from public.tiendanube_webhook_events
    where status = 'queued'
      or (status = 'processing' and locked_at < now() - interval '15 minutes')
    order by received_at
    for update skip locked
    limit greatest(1, least(coalesce(batch_size, 10), 25))
  )
  update public.tiendanube_webhook_events webhook_event
  set status = 'processing',
      processing_attempts = webhook_event.processing_attempts + 1,
      locked_at = now()
  from candidates
  where webhook_event.id = candidates.id
  returning webhook_event.*;
end;
$$;
revoke execute on function public.claim_tiendanube_webhook_events(integer) from public;
grant execute on function public.claim_tiendanube_webhook_events(integer) to service_role;

create or replace function public.claim_tiendanube_privacy_requests(batch_size integer default 10)
returns setof public.tiendanube_privacy_requests language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Tiendanube privacy work may only be claimed by the service role.';
  end if;

  return query
  with candidates as (
    select id
    from public.tiendanube_privacy_requests
    where status = 'queued'
      or (status = 'processing' and locked_at < now() - interval '15 minutes')
    order by received_at
    for update skip locked
    limit greatest(1, least(coalesce(batch_size, 10), 25))
  )
  update public.tiendanube_privacy_requests privacy_request
  set status = 'processing', locked_at = now()
  from candidates
  where privacy_request.id = candidates.id
  returning privacy_request.*;
end;
$$;
revoke execute on function public.claim_tiendanube_privacy_requests(integer) from public;
grant execute on function public.claim_tiendanube_privacy_requests(integer) to service_role;

select pg_notify('pgrst', 'reload schema');
commit;
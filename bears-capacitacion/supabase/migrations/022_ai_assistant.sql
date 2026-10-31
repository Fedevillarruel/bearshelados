begin;

create table public.ai_settings (
  id boolean primary key default true check (id),
  settings jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.ai_knowledge (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  category text not null check (category in ('general','faq','horarios','eventos','talleres','cumpleanos','productos')),
  franchise_id uuid references public.franchises(id) on delete restrict,
  url text not null default '',
  enabled boolean not null default true,
  valid_from date,
  valid_until date,
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);
create table public.ai_meta_connection (
  id boolean primary key default true check (id),
  page_id text not null,
  page_name text not null,
  instagram_id text,
  connected_at timestamptz not null default now()
);
create table public.ai_meta_secrets (
  id boolean primary key default true check (id),
  encrypted_token text not null
);
create table public.ai_oauth_states (
  state_hash text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null
);
create table public.ai_oauth_pending (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  encrypted_token text not null,
  expires_at timestamptz not null
);
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('instagram','messenger')),
  account_id text not null,
  participant_id text not null,
  status text not null default 'bot' check (status in ('bot','human')),
  updated_at timestamptz not null default now(),
  unique(channel, account_id, participant_id)
);
create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  external_id text unique,
  role text not null check (role in ('user','assistant','human')),
  content text not null,
  topic text,
  status text not null check (status in ('received','pending','sent','failed')),
  created_at timestamptz not null default now()
);
create index ai_messages_conversation_idx on public.ai_messages(conversation_id, created_at);
create index ai_messages_period_idx on public.ai_messages(created_at);
create table public.ai_social_assets (
  id text primary key,
  kind text not null,
  text text not null,
  url text,
  occurred_at timestamptz not null default now()
);
create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.ai_messages(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','done','failed')),
  attempts int not null default 0,
  locked_until timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index ai_jobs_queue_idx on public.ai_jobs(status, created_at);
alter table public.ai_messages add column job_id uuid unique references public.ai_jobs(id) on delete set null;
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['ai_settings','ai_knowledge','ai_meta_connection','ai_conversations','ai_messages','ai_social_assets','ai_jobs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "admin reads AI" on public.%I for select to authenticated using (public.is_admin())', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  foreach t in array array['ai_meta_secrets','ai_oauth_states','ai_oauth_pending','ai_usage'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

create function public.ai_claim_job()
returns setof public.ai_jobs
language sql security definer set search_path = public as $$
  update public.ai_jobs j set status = 'done', locked_until = null
  where j.status = 'processing' and j.locked_until < now()
    and exists(select 1 from ai_messages m where m.job_id = j.id and m.status = 'sent');
  update public.ai_jobs set status = 'failed', locked_until = null,
    error = 'El worker se interrumpió repetidamente. Revisá Meta antes de responder manualmente.'
  where status = 'processing' and locked_until < now() and attempts >= 3;
  insert into ai_messages(conversation_id,job_id,role,content,status)
  select conversation_id,id,'assistant',error,'failed' from ai_jobs
  where status = 'failed' and attempts >= 3
  on conflict(job_id) do nothing;
  update ai_conversations set status = 'human'
  where id in (select conversation_id from ai_jobs where status = 'failed' and attempts >= 3);
  update public.ai_jobs set status = 'processing', locked_until = now() + interval '3 minutes', attempts = attempts + 1
  where id = (
    select j.id from public.ai_jobs j
    where (j.status = 'queued' or (j.status = 'processing' and j.locked_until < now())) and j.attempts < 3
      and not exists (
        select 1 from public.ai_jobs other
        where other.conversation_id = j.conversation_id and other.id <> j.id
          and ((other.status = 'processing' and other.locked_until > now())
            or (other.status = 'queued' and (other.created_at, other.id) < (j.created_at, j.id)))
      )
    order by j.created_at for update skip locked limit 1
  ) returning *;
$$;
revoke all on function public.ai_claim_job() from public;
grant execute on function public.ai_claim_job() to service_role;

create function public.ai_record_incoming(p_channel text, p_account text, p_sender text, p_external text, p_content text, p_time timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid; mid uuid;
begin
  insert into public.ai_conversations(channel, account_id, participant_id, updated_at)
  values(p_channel,p_account,p_sender,p_time)
  on conflict(channel,account_id,participant_id) do update
  set updated_at = greatest(ai_conversations.updated_at, excluded.updated_at)
  returning id into cid;
  insert into public.ai_messages(conversation_id, external_id, role, content, status, created_at)
  values(cid,p_external,'user',p_content,'received',p_time)
  on conflict(external_id) do nothing returning id into mid;
  if mid is not null then
    insert into public.ai_jobs(message_id,conversation_id) values(mid,cid);
  end if;
end $$;
revoke all on function public.ai_record_incoming(text,text,text,text,text,timestamptz) from public;
grant execute on function public.ai_record_incoming(text,text,text,text,text,timestamptz) to service_role;

create function public.ai_reserve_preview(p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  delete from public.ai_usage where created_at < now() - interval '1 day';
  if (select count(*) from public.ai_usage where user_id = p_user and created_at > now() - interval '1 hour') >= 30 then
    return false;
  end if;
  insert into public.ai_usage(user_id) values(p_user);
  return true;
end $$;
revoke all on function public.ai_reserve_preview(uuid) from public;
grant execute on function public.ai_reserve_preview(uuid) to service_role;

create function public.ai_metrics(p_since timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'conversations', (select count(distinct conversation_id) from ai_messages where created_at >= p_since and role = 'user'),
    'incoming', (select count(*) from ai_messages where created_at >= p_since and role = 'user'),
    'replies', (select count(*) from ai_messages where created_at >= p_since and role = 'assistant' and status = 'sent'),
    'handoffs', (select count(*) from ai_conversations where updated_at >= p_since and status = 'human'),
    'failed', (select count(*) from ai_messages where created_at >= p_since and status = 'failed'),
    'daily', coalesce((select jsonb_agg(row_to_json(d) order by d.date) from (
      select to_char(created_at at time zone 'UTC','YYYY-MM-DD') as date,
      count(*) filter(where role = 'user') as incoming,
      count(*) filter(where role = 'assistant' and status = 'sent') as replies
      from ai_messages where created_at >= p_since group by 1
    ) d), '[]'::jsonb),
    'topics', coalesce((select jsonb_agg(row_to_json(t) order by t.count desc) from (
      select topic, count(*) as count from ai_messages
      where created_at >= p_since and role = 'assistant' and topic is not null group by topic
    ) t), '[]'::jsonb)
  );
$$;
revoke all on function public.ai_metrics(timestamptz) from public;
grant execute on function public.ai_metrics(timestamptz) to service_role;

create function public.ai_complete_connection(p_user uuid, p_page text, p_name text, p_instagram text, p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('bears-ai-meta'));
  if not exists(select 1 from ai_oauth_pending where user_id = p_user and expires_at > now()) then
    raise exception 'Meta authorization expired';
  end if;
  if exists(select 1 from ai_meta_connection where page_id <> p_page) then
    raise exception 'Disconnect existing Bears account first';
  end if;
  insert into ai_meta_secrets(id, encrypted_token) values(true, p_token)
  on conflict(id) do update set encrypted_token = excluded.encrypted_token;
  insert into ai_meta_connection(id,page_id,page_name,instagram_id) values(true,p_page,p_name,p_instagram)
  on conflict(id) do update set page_id = excluded.page_id, page_name = excluded.page_name,
    instagram_id = excluded.instagram_id, connected_at = now();
  delete from ai_oauth_pending where user_id = p_user;
end $$;
revoke all on function public.ai_complete_connection(uuid,text,text,text,text) from public;
grant execute on function public.ai_complete_connection(uuid,text,text,text,text) to service_role;

create function public.ai_disconnect()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('bears-ai-meta'));
  update ai_settings set settings = jsonb_set(settings,'{enabled}','false'), updated_at = now();
  delete from ai_meta_connection;
  delete from ai_meta_secrets;
  delete from ai_oauth_pending;
  delete from ai_oauth_states;
end $$;
revoke all on function public.ai_disconnect() from public;
grant execute on function public.ai_disconnect() to service_role;
commit;

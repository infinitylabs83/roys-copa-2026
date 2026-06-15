create table public.code_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_hash text not null,
  ip_hash text not null,
  attempted_at timestamptz not null default now()
);

create index code_attempts_user_idx
  on public.code_attempts(user_id, attempted_at desc);
create index code_attempts_device_idx
  on public.code_attempts(device_hash, attempted_at desc);
create index code_attempts_ip_idx
  on public.code_attempts(ip_hash, attempted_at desc);

alter table public.code_attempts enable row level security;
revoke all on public.code_attempts from public, anon, authenticated;

create or replace function public.register_code_attempt(
  p_user_id uuid,
  p_device_hash text,
  p_ip_hash text
)
returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_since timestamptz := now() - interval '10 minutes';
begin
  perform pg_advisory_xact_lock(hashtext('code-user:' || p_user_id::text));
  perform pg_advisory_xact_lock(hashtext('code-device:' || p_device_hash));
  perform pg_advisory_xact_lock(hashtext('code-ip:' || p_ip_hash));

  if (select count(*) from public.code_attempts
      where user_id=p_user_id and attempted_at>=v_since) >= 8 then
    raise exception 'TOO_MANY_CODE_ATTEMPTS';
  end if;

  if (select count(*) from public.code_attempts
      where device_hash=p_device_hash and attempted_at>=v_since) >= 8 then
    raise exception 'TOO_MANY_CODE_ATTEMPTS';
  end if;

  if (select count(*) from public.code_attempts
      where ip_hash=p_ip_hash and attempted_at>=v_since) >= 60 then
    raise exception 'TOO_MANY_CODE_ATTEMPTS';
  end if;

  insert into public.code_attempts(user_id,device_hash,ip_hash)
  values(p_user_id,p_device_hash,p_ip_hash);

  delete from public.code_attempts
  where attempted_at < now() - interval '7 days';
end $$;

revoke all on function public.register_code_attempt(uuid,text,text)
from public,anon,authenticated;
grant execute on function public.register_code_attempt(uuid,text,text)
to service_role;

create or replace function public.consume_game_code(
  p_user_id uuid,
  p_code_digest text,
  p_device_hash text,
  p_ip_hash text,
  p_seed text,
  p_campaign_slug text
)
returns table(session_id uuid,expires_at timestamptz,rules_version text,seed text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_code public.access_codes;
  v_batch public.code_batches;
  v_campaign public.campaigns;
  v_existing public.game_sessions;
  v_session uuid:=gen_random_uuid();
  v_expires timestamptz:=now()+interval '12 minutes';
begin
  select * into v_code from public.access_codes
  where code_digest=p_code_digest for update;
  if not found then raise exception 'CODE_INVALID_OR_USED'; end if;

  select * into v_batch from public.code_batches where id=v_code.batch_id;
  select * into v_campaign from public.campaigns where id=v_batch.campaign_id;
  if v_campaign.slug<>p_campaign_slug
     or not v_campaign.active
     or now() not between v_campaign.starts_at and v_campaign.ends_at
     or now() not between v_batch.valid_from and v_batch.valid_until then
    raise exception 'CODE_OUTSIDE_VALIDITY';
  end if;

  if v_code.status='consumed' then
    select * into v_existing
    from public.game_sessions sessions
    where sessions.code_id=v_code.id
      and sessions.player_id=p_user_id
      and sessions.status='active'
      and sessions.expires_at>now();
    if found then
      return query select
        v_existing.id,
        v_existing.expires_at,
        v_existing.rules_version,
        v_existing.seed;
      return;
    end if;
    raise exception 'CODE_INVALID_OR_USED';
  end if;

  if v_code.status<>'available' then raise exception 'CODE_INVALID_OR_USED'; end if;

  insert into public.game_sessions(
    id,campaign_id,player_id,code_id,store_id,rules_version,seed,
    expires_at,device_hash,ip_hash
  ) values(
    v_session,v_campaign.id,p_user_id,v_code.id,v_batch.store_id,
    'minigame-2026-v1',p_seed,v_expires,p_device_hash,p_ip_hash
  );

  update public.access_codes set
    status='consumed',consumed_by=p_user_id,consumed_at=now()
  where id=v_code.id and status='available';
  if not found then raise exception 'CODE_ALREADY_CONSUMED'; end if;

  insert into public.audit_log(actor_id,action,entity_type,entity_id)
  values(p_user_id,'code_consumed','game_session',v_session::text);

  return query select v_session,v_expires,'minigame-2026-v1'::text,p_seed;
end $$;

revoke all on function public.consume_game_code(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.consume_game_code(uuid,text,text,text,text,text) to service_role;

create or replace function public.refresh_public_leaderboard(
  p_campaign_id uuid,
  p_day date
)
returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_campaign_id::text || ':' || p_day::text));
  perform pg_advisory_xact_lock(hashtext(p_campaign_id::text || ':general'));

  delete from public.public_leaderboard
  where campaign_id=p_campaign_id
    and period_type='daily'
    and period_key=p_day::text;

  insert into public.public_leaderboard(
    campaign_id,period_type,period_key,player_id,nickname,points,position,updated_at
  )
  select
    scores.campaign_id,
    'daily',
    p_day::text,
    scores.player_id,
    profiles.nickname,
    scores.best_score,
    row_number() over(
      order by scores.best_score desc,scores.perfect_hits desc,
        scores.best_combo desc,scores.accuracy desc,scores.achieved_at asc
    )::integer,
    now()
  from public.daily_scores scores
  join public.player_profiles profiles on profiles.user_id=scores.player_id
  where scores.campaign_id=p_campaign_id and scores.score_date=p_day;

  delete from public.public_leaderboard
  where campaign_id=p_campaign_id
    and period_type='general'
    and period_key='all';

  insert into public.public_leaderboard(
    campaign_id,period_type,period_key,player_id,nickname,points,position,updated_at
  )
  select
    totals.campaign_id,
    'general',
    'all',
    totals.player_id,
    profiles.nickname,
    totals.points,
    row_number() over(order by totals.points desc,totals.last_score_at asc)::integer,
    now()
  from (
    select
      campaign_id,
      player_id,
      sum(best_score)::integer as points,
      max(achieved_at) as last_score_at
    from public.daily_scores
    where campaign_id=p_campaign_id
    group by campaign_id,player_id
  ) totals
  join public.player_profiles profiles on profiles.user_id=totals.player_id;
end $$;

revoke all on function public.refresh_public_leaderboard(uuid,date)
from public,anon,authenticated;
grant execute on function public.refresh_public_leaderboard(uuid,date) to service_role;

create or replace function public.finalize_game(
  p_session_id uuid,p_score integer,p_perfect_hits smallint,p_accuracy numeric,
  p_best_combo numeric,p_event_hash text,p_events jsonb,p_risk_score integer,
  p_validation jsonb
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_session public.game_sessions;
  v_day date;
begin
  select * into v_session from public.game_sessions where id=p_session_id for update;
  if not found or v_session.status<>'active' then raise exception 'SESSION_INVALID'; end if;
  if now()>v_session.expires_at then
    update public.game_sessions set status='expired' where id=p_session_id;
    raise exception 'SESSION_EXPIRED';
  end if;
  if p_score not between 0 and 11070
     or jsonb_array_length(p_events)<>18 or p_risk_score>=80 then
    update public.game_sessions set status='rejected',risk_score=p_risk_score,
      rejection_reason='INTEGRITY_VALIDATION' where id=p_session_id;
    return jsonb_build_object('accepted',false);
  end if;

  update public.game_sessions set status='finished',finished_at=now(),score=p_score,
    perfect_hits=p_perfect_hits,accuracy=p_accuracy,best_combo=p_best_combo,
    event_hash=p_event_hash,risk_score=p_risk_score where id=p_session_id;
  insert into public.game_event_submissions(session_id,event_hash,events,validation_result)
  values(p_session_id,p_event_hash,p_events,p_validation);

  v_day:=(now() at time zone 'America/Sao_Paulo')::date;
  insert into public.daily_scores(
    campaign_id,score_date,player_id,best_session_id,best_score,perfect_hits,
    best_combo,accuracy,achieved_at
  ) values(
    v_session.campaign_id,v_day,v_session.player_id,p_session_id,p_score,
    p_perfect_hits,p_best_combo,p_accuracy,now()
  )
  on conflict(campaign_id,score_date,player_id) do update set
    best_session_id=excluded.best_session_id,best_score=excluded.best_score,
    perfect_hits=excluded.perfect_hits,best_combo=excluded.best_combo,
    accuracy=excluded.accuracy,achieved_at=excluded.achieved_at
  where (excluded.best_score,excluded.perfect_hits,excluded.best_combo,excluded.accuracy)
      >(daily_scores.best_score,daily_scores.perfect_hits,daily_scores.best_combo,daily_scores.accuracy);

  perform public.refresh_public_leaderboard(v_session.campaign_id,v_day);

  return jsonb_build_object('accepted',true,'score',p_score,'eligible_daily',p_score>=7000);
end $$;

revoke all on function public.finalize_game(uuid,integer,smallint,numeric,numeric,text,jsonb,integer,jsonb)
from public,anon,authenticated;
grant execute on function public.finalize_game(uuid,integer,smallint,numeric,numeric,text,jsonb,integer,jsonb)
to service_role;

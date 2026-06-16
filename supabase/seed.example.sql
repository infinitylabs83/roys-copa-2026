-- Execute depois das migrations e ajuste todos os valores entre colchetes.
-- Este arquivo nao e uma migration automatica.

insert into public.campaigns (
  slug, name, starts_at, ends_at, timezone,
  minimum_daily_score, maximum_score
) values (
  'copa-roys-2026',
  'Roy''s nos Acrescimos',
  '[INICIO_ISO_COM_FUSO]'::timestamptz,
  '[FIM_ISO_COM_FUSO]'::timestamptz,
  'America/Sao_Paulo',
  6000,
  11070
) returning id;

insert into public.stores (code, name, closes_at)
values ('[CODIGO_UNIDADE]', '[NOME_UNIDADE]', '[HORARIO_FECHAMENTO]'::time)
returning id;

-- Substitua os UUIDs retornados acima.
insert into public.code_batches (
  campaign_id, store_id, label, quantity, valid_from, valid_until
) values (
  '[CAMPAIGN_ID]'::uuid,
  '[STORE_ID]'::uuid,
  '[ROTULO_LOTE]',
  1000,
  '[VALIDO_DESDE]'::timestamptz,
  '[VALIDO_ATE]'::timestamptz
) returning id;

-- Use o UUID retornado como CAMPAIGN_BATCH_ID ao gerar os codigos.

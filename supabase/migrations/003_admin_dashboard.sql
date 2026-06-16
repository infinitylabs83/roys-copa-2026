alter table public.access_codes
add column if not exists code_label text;

create index if not exists access_codes_code_label_idx
on public.access_codes(code_label);

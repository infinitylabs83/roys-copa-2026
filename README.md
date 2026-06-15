# Roy's nos Acrescimos

Mini game oficial da campanha Roy's para a Copa do Mundo de 2026.

## Arquitetura

- Frontend estatico publicado no Vercel.
- Autenticacao anonima, banco e ranking no Supabase.
- Validacao dos codigos e da pontuacao em Supabase Edge Functions.
- Um codigo de compra libera uma partida oficial.

## Implantacao

1. Criar e vincular o projeto Supabase.
2. Aplicar as migrations em `supabase/migrations`.
3. Configurar os secrets das Edge Functions.
4. Criar campanha, unidade e lote de codigos.
5. Gerar e importar os codigos oficiais.
6. Preencher `config.js` com a URL e a chave publicavel do Supabase.
7. Publicar o frontend no Vercel.

Nunca versionar service role keys, peppers, senhas ou CSVs de codigos.


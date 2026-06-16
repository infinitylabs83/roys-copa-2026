# Conectar ao Supabase

1. Criar o projeto Supabase.
2. Habilitar Anonymous Sign-ins.
3. Executar `migrations/001_campaign.sql`.
4. Executar `migrations/002_functions.sql`.
5. Copiar `seed.example.sql`, preencher datas, unidade e validade e executar.
6. Guardar o UUID retornado por `code_batches`.
7. Implantar `start-game` e `finish-game`, incluindo a pasta `_shared`.
8. Configurar os secrets:

```text
CODE_PEPPER
DEVICE_PEPPER
IP_PEPPER
PHONE_PEPPER
PII_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

9. Preencher `prototipo/minigame/config.js` com URL e publishable key.
10. Gerar os codigos com o UUID real do lote.
11. Importar o CSV `access-codes-supabase-AAAAMMDD.csv` em `access_codes`.
12. Testar um codigo: primeiro uso libera; segundo uso deve ser rejeitado.

## Seguranca

- A service role aparece somente nas Edge Functions.
- O frontend usa somente a publishable key.
- O codigo e convertido em HMAC antes da consulta.
- O consumo usa transacao com `FOR UPDATE`.
- O servidor recalcula os 18 eventos e rejeita medidas inconsistentes.
- Sem configuracao Supabase, um dominio publico bloqueia partidas oficiais.
- Codigos demo funcionam apenas em localhost.

## Producao

Hospedar em `https://roys-copa-2026.vercel.app`. Nao imprimir QR ou codigos antes de
validar esse endereco no celular e executar o checklist de homologacao.

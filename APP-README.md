# Roy's nos Acrescimos

Minigame mobile-first da campanha Copa Roy's.

## Teste local

Na raiz do workspace:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Acesse:

```text
http://127.0.0.1:8765/outputs/campanha-roys-nos-acrescimos/prototipo/minigame/
```

Codigos locais:

- `ROY123`
- `COP202`
- `GOL777`

Cada codigo funciona uma vez por armazenamento do navegador. Esse bloqueio
local serve apenas para demonstracao. Em producao, o uso unico e garantido
pelo Supabase e funciona entre aparelhos diferentes.

## Comportamento seguro

- Em localhost sem Supabase: permite somente os tres codigos demo.
- Em dominio publico sem Supabase: bloqueia a partida oficial.
- Com Supabase: valida o lote, consome o codigo e cria uma unica sessao.
- Treino livre nunca entra no ranking.

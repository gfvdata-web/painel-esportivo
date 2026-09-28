# Painel Esportivo

Painel pessoal com todo o meu histórico esportivo. Junta o export do **Strava** (pedais e corridas com GPS pelo celular) com o do **Samsung Health** (relógio: natação em piscina, corrida, caminhada, FC).

- **Ingestão** (Node + TypeScript): lê `data/raw/`, normaliza, remove duplicatas e grava JSON compacto em `data/processed/`.
- **Site estático** (Vite + Preact): 9 telas (visão geral, calendário, volume, mapa, destinos, natação, recordes, equipamentos e atividades), com gráficos SVG próprios e mapa MapLibre + OpenStreetMap.
- **Publicação**: GitHub Pages, com os dados **cifrados** por senha.

## Privacidade

Nenhum dado pessoal em claro sai do computador:

- `data/`, `.env` e `config.local.json` estão no `.gitignore`. Um hook de pré-commit (`.githooks/pre-commit`, ativado no `npm install`) bloqueia commits que os incluam.
- O build **cifra** tudo o que vai para `dist/dados/`: gzip + AES-256-GCM, com a chave derivada de `PAINEL_SENHA` por PBKDF2-SHA-256 (600 mil iterações, sal novo a cada build). Os arquivos de detalhe têm nomes ofuscados (hash), para não expor ids do Strava. O build aborta se encontrar qualquer dado em claro em `dist/`.
- A página pede a senha e decifra no navegador. "Lembrar neste aparelho" guarda a chave derivada, nunca a senha.
- **Zonas privadas**: o ingest detecta sozinho os lugares onde muitas atividades começam ou terminam (casa, trabalho, academia) e corta o começo e o fim das trilhas num raio de 400 m. Não é preciso informar nenhuma coordenada. Zonas extras podem ir no `config.local.json`, e as coordenadas das zonas nunca são gravadas na saída.
- A segurança depende da senha: use uma frase de 4 ou 5 palavras aleatórias, sem nomes de pessoas.

## Como exportar os dados

### Strava
1. No site do Strava: **Configurações → Minha conta → Baixar ou excluir sua conta → Solicitar seu arquivo**.
2. O Strava envia por e-mail um link para um `.zip`.
3. Extraia em `data/raw/strava/`: o `activities.csv` fica na raiz dessa pasta, junto com a pasta `activities/`.

### Samsung Health
1. No app: **Configurações → Baixar dados pessoais** (confirme com a conta Samsung).
2. Copie a pasta gerada no celular para o computador.
3. Extraia em `data/raw/samsung-health/`. A pasta `samsunghealth_<usuário>_<data>/` pode ficar em qualquer nível lá dentro. Se houver mais de uma, vale a mais recente.

Ao reexportar, **substitua** as pastas antigas. A ingestão é idempotente e recalcula tudo do zero.

## Configuração

```bash
npm install
cp .env.example .env                               # defina PAINEL_SENHA
cp config/config.example.json config.local.json    # opcional: zonas extras, equipamentos, dedup
```

No `config.local.json`, tudo é opcional:

| Chave | Para quê |
|---|---|
| `zonasPrivadas` | zonas manuais `{ nome, lat, lon, raioM }`, somadas às automáticas |
| `zonasAutomaticas` | `ativo`, `minAtividades` (5), `raioAgrupamentoM` (200), `raioCorteM` (400) |
| `deduplicacao` | `toleranciaInicioS` (120) e `sobreposicaoMinima` (0,6) |
| `equipamentos` | `{ nome, esporte, de, ate }`, para quando o Strava não tem tênis/bike cadastrados |
| `fusoPadrao` | fuso das atividades sem GPS (`America/Sao_Paulo`) |

## Comandos

```bash
npm run ingest     # data/raw → data/processed (mostra resumo: fontes, duplicatas, ignorados)
npm run dev        # site local em http://localhost:5173 com os dados abertos, sem senha
npm run build      # build estático em dist/, com os dados cifrados
npm run preview    # testa o build (pede a senha) em http://localhost:4173
npm test           # testes dos parsers, dedup, métricas e criptografia
npm run publicar   # build + envia dist/ para a branch gh-pages (sem histórico)
```

Para atualizar o painel publicado: reexporte, rode `npm run ingest` e depois `npm run publicar`.

## Como os dados são unidos

- **Mesma atividade nas duas fontes**: esportes compatíveis e (início até 2 min de diferença **ou** intervalos sobrepostos em ≥ 60% da mais curta). Comparamos intervalos porque o Samsung registra o tempo *ativo* e o Strava o *decorrido*.
- **Merge campo a campo**: o Strava vence em nome, equipamento, distância e trilha; o Samsung vence em FC, calorias, cadência, dispositivo e natação. A origem de cada campo aparece no detalhe da atividade.
- **Caminhadas automáticas** do relógio que caem dentro de um pedal são absorvidas; as demais aparecem com o filtro "Incluir automáticas".
- **Gravação esquecida ligada** (tempo decorrido > 24 h ou muito maior que o tempo em movimento) é marcada, e o painel usa o tempo em movimento. Se o relógio registrou a mesma atividade, tempo e distância vêm dele.
- O relatório completo (merges, conflitos > 10%, arquivos ignorados, anomalias) fica em `data/processed/relatorio.json`, que é local e não é publicado.

## Estrutura

```
src/ingest/adapters/   um adaptador por fonte (stravaExport, samsungHealthExport); fontes novas entram aqui
src/ingest/            dedup, normalização, zonas privadas, métricas, geocodificação offline
src/shared/            modelo de dados, esportes e criptografia (usados no ingest e no site)
src/build/             plugin do Vite que serve os dados no dev e os cifra no build
src/site/              telas, gráficos e estilos do painel
test/                  testes; test/fixtures tem amostras anonimizadas (coordenadas deslocadas)
```

## Pendências conhecidas

- Os códigos 15002, 15003, 15005 e 10007 do Samsung foram classificados como **Academia** pelo perfil das sessões. Os códigos 4004 e 5001 (uma sessão cada) seguem em "Outros". Para mapear, edite `TIPOS_SAMSUNG` em `src/ingest/adapters/samsungHealthExport.ts`.
- Os tiles do mapa vêm do servidor público do OpenStreetMap, adequado para uso pessoal de baixo volume.

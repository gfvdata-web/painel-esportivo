# Painel Esportivo

Painel pessoal com todo o meu histórico esportivo. Junta o export do **Strava** com o do **Samsung Health**, que é a fonte principal de natação, corrida no relógio e musculação.

- **Ingestão** (Node + TypeScript): lê `data/raw/`, normaliza, remove duplicatas e grava em `data/processed/`.
- **Site estático** (Vite + Preact): carrega os dados processados e gera `dist/`.

## Privacidade

Nenhum dado pessoal vai para o git:

- `data/raw/`, `data/processed/`, `.env` e `config.local.json` estão no `.gitignore`.
- Um hook de pré-commit (`.githooks/pre-commit`) bloqueia qualquer commit que inclua esses arquivos. Ele é ativado automaticamente no `npm install`.
- O site publicado recebe só os dados **criptografados** (AES-GCM, com chave derivada da senha em `PAINEL_SENHA`). A página pede a senha e descriptografa no navegador.
- **Zonas privadas** (em `config.local.json`) cortam o início e o fim das trilhas perto de lugares sensíveis, como a casa.

Use como senha uma frase de 4 ou 5 palavras aleatórias. A proteção depende só dela.

## Como exportar os dados

### Strava
1. No site do Strava: **Configurações → Minha conta → Baixar ou excluir sua conta → Solicitar seu arquivo**.
2. O Strava envia por e-mail um link para um `.zip`.
3. Extraia o conteúdo em `data/raw/strava/`. O `activities.csv` fica na raiz dessa pasta, junto com a pasta `activities/`.

### Samsung Health
1. No app: **Configurações → Baixar dados pessoais** (confirme com a conta Samsung).
2. Copie a pasta gerada no celular para o computador (ou compacte e transfira).
3. Extraia em `data/raw/samsung-health/`. A pasta `samsunghealth_<usuário>_<data>/` pode ficar em qualquer nível lá dentro.

Ao reexportar, **substitua** a pasta antiga. A ingestão é idempotente e sempre recalcula tudo.

## Configuração

```bash
cp .env.example .env                               # defina PAINEL_SENHA
cp config/config.example.json config.local.json    # zonas privadas e ajustes
```

## Comandos

```bash
npm install        # dependências + ativa o hook de privacidade
npm run ingest     # data/raw → data/processed
npm run dev        # site em modo desenvolvimento
npm run build      # build estático em dist/
npm test           # testes dos parsers
```

## Estrutura

```
src/ingest/adapters/   um adaptador por fonte (stravaExport, samsungHealthExport, …)
src/ingest/            normalização, deduplicação, zonas privadas, geocodificação
src/site/              telas do painel
test/fixtures/         amostras pequenas e anonimizadas para os testes
config/                exemplos de configuração
```

# NeuroTrack — frontend + backend

Dashboard do NeuroTrack (Next.js App Router) com API própria (Route Handlers)
e PostgreSQL via Prisma. Autenticação simples por sessão (cookie + JWT).

## Stack

- Next.js 16 / React 19 / Tailwind v4
- Prisma ORM 7 + `@prisma/adapter-pg` (sem binário nativo de engine — só o
  driver `pg`, o que simplifica bastante o Docker)
- PostgreSQL
- Auth: cookie httpOnly com JWT (`jose`) + senha com `bcryptjs`

## Importante: métricas clínicas ainda não têm limiares definidos

O schema guarda as métricas brutas de uma sessão (`trackingAccuracy`,
`avgLatencyMs`, `saccadeCount`, `fixationDurationMs`) mas **nada no código
decide o que é "saudável" ou "sinalizado" a partir desses números** — isso
ainda não foi definido. O campo `status` da sessão é só o estado do fluxo de
gravação (`EM_ANDAMENTO` → `CONCLUIDA`), e pode ser marcado manualmente como
`EM_ANALISE` / `SINALIZADA` pelo médico na tela de resultados. Quando os
limiares forem definidos, é só plugar a regra onde esse campo é setado.

## Setup local

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Banco de dados — duas opções:

   - **Sem Docker** (mais rápido para desenvolver): o Prisma roda um
     Postgres local sozinho.

     ```bash
     npx prisma dev
     ```

     Copie a connection string que ele imprime para `DATABASE_URL` no seu
     `.env` (veja `.env.example`).

   - **Com Docker**:

     ```bash
     docker compose up -d db
     ```

     Com `DATABASE_URL="postgresql://neuroeye:neuroeye@localhost:5432/neuroeye?schema=public"`.

3. Copie `.env.example` para `.env` e preencha `DATABASE_URL` e `AUTH_SECRET`.

4. Rode as migrations e o seed (cria uma conta de médica + pacientes de
   exemplo):

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

   Login de desenvolvimento: `sarah.jenkins@neurotrack.app` / `neurotrack-dev`.

5. Suba o servidor:

   ```bash
   npm run dev
   ```

## Deploy (Docker)

```bash
AUTH_SECRET=$(openssl rand -base64 32) docker compose up -d --build
```

O `docker-compose.yml` sobe o Postgres, roda `prisma migrate deploy` uma vez
(serviço `migrate`) e só então inicia o app (`app`, build `standalone` do
Next.js). Rode o seed manualmente se quiser dados de exemplo em produção:

```bash
docker compose run --rm migrate npx prisma db seed
```

## Estrutura da API

Todas as rotas em `app/api/**` exigem sessão autenticada (ver `proxy.ts`),
exceto `/api/auth/*`.

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `POST /api/auth/register` — aberta só para criar a primeira conta; depois
  disso exige estar logado
- `GET/POST /api/patients`, `GET/PATCH/DELETE /api/patients/[id]`
- `GET/POST /api/patients/[id]/sessions` — `POST` inicia uma sessão
  (`EM_ANDAMENTO`)
- `GET /api/sessions`, `GET/DELETE /api/sessions/[id]`
- `POST /api/sessions/[id]/finish` — encerra a sessão e grava
  duração/métricas/série de rastreamento (tudo opcional — sem hardware
  ainda, só a duração é real)
- `PATCH /api/sessions/[id]/status` — ajuste manual de status pelo médico

## Comandos úteis do Prisma

```bash
npm run db:studio    # UI para inspecionar o banco
npm run db:migrate   # nova migration em dev
npm run db:deploy    # aplica migrations pendentes (produção)
```

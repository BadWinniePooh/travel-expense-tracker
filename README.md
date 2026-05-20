# Travel Expense Tracker

A full-stack application for tracking shared travel expenses across vacations, with automatic currency conversion and fair-split settlement calculation.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript + shadcn/ui + Tailwind CSS |
| Backend | ASP.NET Core 8 Web API (C#) |
| ORM | Entity Framework Core 8 (PostgreSQL) |
| Database | PostgreSQL 16 |
| Auth | JWT (self-contained, stateless) |
| Currency | frankfurter.app (free, no key required) |
| Container | Docker Compose (rootless) |

## Project Structure

```
/
├── frontend/                   # React + Vite + TypeScript
│   ├── src/
│   │   ├── api/                # Axios API clients
│   │   ├── components/         # React components (UI + layout)
│   │   ├── contexts/           # AuthContext
│   │   ├── hooks/              # use-toast, etc.
│   │   ├── pages/              # Route page components
│   │   └── types/              # TypeScript types
│   ├── Dockerfile
│   └── nginx.conf
├── backend/
│   ├── TravelExpenseTracker.sln
│   ├── TravelExpenseTracker.API/       # Web API layer
│   ├── TravelExpenseTracker.Core/      # Domain models + interfaces
│   ├── TravelExpenseTracker.Infrastructure/ # EF Core + repos + services
│   └── Dockerfile
├── docker-compose.yml
├── docker-compose.override.yml  # Dev overrides
├── .github/workflows/
│   ├── build.yml               # Build + test CI
│   └── security.yml            # Trivy security scan
├── renovate.json
└── .env.example
```

## Local Development

### Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8)
- [Node.js 20+](https://nodejs.org/)
- [Docker + Docker Compose](https://docs.docker.com/get-docker/)

### Running with Docker Compose

```bash
# Copy and edit env vars
cp .env.example .env

# Build and start all services
docker compose up --build

# Frontend: http://localhost:3000
# Backend API: http://localhost:5000
# Swagger UI: http://localhost:5000/swagger (dev mode only)
```

Default admin credentials: `admin` / `Admin123!`

### Running Backend Locally

```bash
cd backend

# Start only PostgreSQL
docker compose up postgres -d

# Run the API
dotnet run --project TravelExpenseTracker.API

# API available at http://localhost:5000
```

### Running Frontend Locally

```bash
cd frontend
npm install
npm run dev

# Available at http://localhost:5173
# Proxies /api → http://localhost:5000
```

## Environment Variables

See `.env.example` for all required variables.

| Variable | Description |
|----------|-------------|
| `ConnectionStrings__DefaultConnection` | PostgreSQL connection string |
| `Jwt__Secret` | JWT signing secret (min 32 chars) |
| `Jwt__Issuer` | JWT issuer |
| `Jwt__Audience` | JWT audience |
| `Jwt__ExpiryMinutes` | Token expiry in minutes |
| `ADMIN_USERNAME` | Default admin username (seeded on first run) |
| `ADMIN_PASSWORD` | Default admin password |
| `ADMIN_EMAIL` | Default admin email |

## API Endpoints

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | None | Login, returns JWT |
| GET | `/api/auth/me` | JWT | Current user info |

### Users (Admin only)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users` | List all users |
| POST | `/api/users` | Create user |
| PUT | `/api/users/{id}` | Update user |
| DELETE | `/api/users/{id}` | Delete user |

### Vacations
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/vacations` | My vacations |
| POST | `/api/vacations` | Create vacation |
| GET | `/api/vacations/{id}` | Vacation detail |
| PUT | `/api/vacations/{id}` | Update vacation |
| DELETE | `/api/vacations/{id}` | Delete (admin) |
| POST | `/api/vacations/{id}/participants` | Add participant |
| PUT | `/api/vacations/{id}/participants/{userId}` | Update split weight |
| DELETE | `/api/vacations/{id}/participants/{userId}` | Remove participant |
| GET | `/api/vacations/{id}/expenses` | List expenses |
| POST | `/api/vacations/{id}/expenses` | Add expense |
| PUT | `/api/vacations/{id}/expenses/{expenseId}` | Update expense |
| DELETE | `/api/vacations/{id}/expenses/{expenseId}` | Delete expense |
| GET | `/api/vacations/{id}/summary` | Settlement summary |

## Settlement Algorithm

The `/summary` endpoint calculates who owes whom:

1. Sum all expenses converted to the vacation's base currency.
2. For each participant: `fair_share = total * split_weight`.
3. `balance = total_paid - fair_share` (positive = overpaid, negative = underpaid).
4. Greedy matching: pair the largest debtor with the largest creditor until settled.

## Currency Conversion

Exchange rates are fetched from [frankfurter.app](https://www.frankfurter.app/) (free, no API key required) and cached in the database for 1 hour to minimize external calls.

## Production Deployment

1. Set a strong `Jwt__Secret` (min 32 random chars).
2. Set strong database passwords.
3. Set `ASPNETCORE_ENVIRONMENT=Production`.
4. Use HTTPS (terminate at a reverse proxy / load balancer).
5. Do **not** use `docker-compose.override.yml` in production.

```bash
docker compose -f docker-compose.yml up -d --build
```

## CI/CD

- **build.yml** — Triggered on push/PR to `main` and `develop`. Builds and tests both backend (.NET) and frontend (Node).
- **security.yml** — Runs [Trivy](https://github.com/aquasecurity/trivy) on Docker images and the repo filesystem. Fails on CRITICAL/HIGH CVEs. Runs on push to `main`, PRs, and weekly (Monday 06:00 UTC).
- **Renovate** — Automated dependency updates; minor/patch automerged on Mondays.

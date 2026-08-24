# Changes — Phase 3

## Added

- PostgreSQL persistence
- SQLAlchemy 2 ORM
- Psycopg PostgreSQL driver
- `.env` based `DATABASE_URL`
- Docker Compose PostgreSQL development service
- `stations`, `robots`, and `delivery_tasks` database tables
- Foreign keys for task robot/station references
- Database health check
- Initial database seeding
- Database-backed demo reset
- Repository layer between business logic and SQLAlchemy
- Persistence test using independent database sessions

## Removed

- Phase 2 `InMemoryStore`

## Kept compatible

The public FastAPI routes used by the Next.js frontend remain the same, so the Phase 2.1 frontend does not need a new API contract.

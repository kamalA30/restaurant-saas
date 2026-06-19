-- Docker PostgreSQL init script
-- Creates the database extensions needed by the application

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for fast text search (ILIKE indexes)

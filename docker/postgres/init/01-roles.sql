-- Local development only. In managed environments create these roles with your provider's tooling
-- and store the passwords in the secret manager (see docs/DEPLOYMENT.md).
CREATE ROLE shopivo_owner LOGIN PASSWORD 'shopivo_owner_dev';
CREATE ROLE shopivo_app LOGIN PASSWORD 'shopivo_app_dev' NOBYPASSRLS;
CREATE DATABASE shopivo OWNER shopivo_owner;
\connect shopivo
ALTER SCHEMA public OWNER TO shopivo_owner;
-- citext requires superuser in some PostgreSQL versions; create it upfront locally.
CREATE EXTENSION IF NOT EXISTS citext;

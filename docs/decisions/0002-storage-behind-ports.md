---
status: accepted
date: 2026-11-26
decision-makers: Lucas Poulain
---

# 0002 The studio reaches its rows through ports, with PostgreSQL by default

## Context and problem

How does an instance store its rows so that it runs on a platform that starts the new container of a deployment while the old one still serves? Scalingo runs two containers together during a deployment, and SQLite replicated by Litestream accepts one writer. Development and the tests need a database that runs without a server, and PGlite runs without one behind the same adapter as a PostgreSQL server.

## Considered options

- SQLite replicated by Litestream on every instance. Set aside because two containers cannot write the same file during a deployment.

## Decision

The studio reaches its rows through the ports of `layers/studio/server/db/ports.ts`: one interface per store, and an operation that must be atomic is one method, which the adapter runs in one transaction. Two adapters implement them: `server/db/postgres/`, which node-postgres runs against a PostgreSQL server and PGlite runs locally and in the tests, and `server/db/sqlite/`. An instance that deploys with two containers running together, as on Scalingo, runs on PostgreSQL. A light instance on one machine, without a database server, can run on the SQLite adapter, which we keep for it. We track the move of the production instance to PostgreSQL in [issue 234](https://github.com/ShallowRed/vignettes/issues/234).

The adapters, the test helpers and `test/unit/migrations.test.ts` import drizzle-orm and the database drivers; any other code reaches the rows through a port.

## Consequences

- An instance deploys with two containers running together, and the migrations run under an advisory lock while the old container serves.
- A local studio and the tests run on PGlite without a database server; a PGlite instance takes close to 1 GB, which bounds the number of test workers.
- We write a new store method in both adapters, against two schemas that give their tables and columns the same names, so that a SQLite database copies row by row into PostgreSQL.

## Confirmation

- The `DATABASE_DRIVER` pattern of `eslint.config.js` refuses an import of drizzle-orm or of a driver outside the adapters and the tests, in error.
- The store tests are contracts: each suite runs over `ADAPTERS` of `test/unit/helpers/adapters.ts`, SQLite and PGlite, in error in the CI.
- No check reads the database each instance runs on: we set it when we deploy an instance, following the guide of its platform.

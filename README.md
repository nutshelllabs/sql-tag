# sql-tag

Prevent SQL injection vulnerabilities by parameterizing your queries with this simple template tag helper.

## Features

- No dependencies
- Automatic parameterization
- Nested queries
- Helpers for common SQL constructs
- Typesafe
- Compatible with `pg` library

## Should you use it?

While this library is nice, you probably don't need it. It's primary purpose is to prevent SQL injection vulnerabilities when writing sql. The `pg` library [supports parameterized queries](https://node-postgres.com/features/queries#parameterized-query), but you need to manage the parameters yourself.  This library provides an ergonomic template tag to do this work for you, however most other libraries for working with a database _already do this_.  If you find yourself in the unique situation where you're writing some SQL, and don't want to switch to a another database client like [slonik](https://github.com/gajus/slonik) or [postgres-js](https://github.com/porsager/postgres-js), then this library might be for you.

Example:

```typescript
import { sql, toQuery } from "@nutshelllabs/sql-tag";

const userId = 123;
const userName = "john";

// Use tagged template like this
const sqlStatement = sql`SELECT * FROM users WHERE id = ${userId} AND name = ${userName}`

const results = await client.query(toQuery(query));
```

## Methods

### sql

This method is the main entry point for the library. It takes a template literal and returns an object contain string parts and parameters.  See the basic example above.

The most important thing about this is that you can nest values, and they will be "flattened" into the final query.

```typescript
const whereClause1 = sql`id = ${userId}`;

const query = sql`SELECT * FROM users WHERE ${whereClause1}`;

const { text, values } = toQuery(query);

console.log(text); // SELECT * FROM users WHERE id = $1
console.log(values); // [userId]
```

### toQuery

This function will take a `SQLFragment` object and return an object compatible with `pg`'s `query` method.  Specifically it will match the `QueryConfig` type [described here](https://node-postgres.com/features/queries#query-config-object).

This function "renders" the string parts by adding in all the `$1`, `$2`, etc. placeholders in the right places.  There is no deduplication of params, so if the same value occurs multiple times in the parameters, it will be added multiple times.

To support existing legacy use cases, this function will also accept a list of parameters that already have placeholders.

```typescript
const query = sql`SELECT * FROM users WHERE id = ${userId} && name = $1`;

const { text, values } = toQuery(query, ["john"]);

console.log(text); // SELECT * FROM users WHERE id = $2 && name = $1
console.log(values); // ["john", userId]
```

This will allow you to keep any existing code that works with parameters intact, but still use the `sql` tag to write SQL queries to add more parameters.  **IMPORTANT**: this library doesn't check the query & params to make sure they line up, so you'll need to ensure that the number of existing placeholders match the number of parameters on your own.

### identifier

A simple helper to escape double quotes in identifiers.

```typescript
const tableName = "users";
const columnName = "email";

const sqlStatement = sql`SELECT ${identifier(columnName)} FROM ${identifier(tableName)}`;

const { text, values } = toQuery(sqlStatement);

console.log(text); // SELECT "email" FROM "users"
console.log(values); // []
```

### literal

A helper to escape single quotes in literals.

```typescript
const columnName = "email";

const sqlStatement = sql`SELECT ${literal(columnName)} FROM users`;

const { text, values } = toQuery(sqlStatement);

console.log(text); // SELECT 'email' FROM users
console.log(values); // []
```

### join

This function enables you to join multiple fragments together, similar to `Array.prototype.join()`.

```typescript
const clauses = [
  sql`id = ${userId}`,
  sql`name = ${userName}`,
];

const clauses = join(clauses, sql` AND `);

const query = sql`SELECT * FROM users WHERE ${clauses}`;

const { text, values } = toQuery(query);

console.log(text); // SELECT * FROM users WHERE id = $1 AND name = $2
console.log(values); // [userId, userName]
```

### raw

**IMPORTANT**: This is an escape hatch for writing unsafe SQL queries.  Any string created in `raw()` will be inlined into the final query without modification or escaping.

```typescript
const userInput = "; DROP TABLE users; --";

const query = sql`SELECT * FROM users WHERE ${raw(userInput)}`;

const { text, values } = toQuery(query);

console.log(text); // SELECT * FROM users WHERE ; DROP TABLE users; --
console.log(values); // []
```

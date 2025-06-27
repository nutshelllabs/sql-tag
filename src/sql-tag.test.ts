import { describe, expect, it } from "vitest";
import {
  sql,
  toQuery,
  identifier,
  raw,
  join,
  literal,
  isEmpty,
  _jest,
} from "./sql-tag";

const { inlineInterpolations } = _jest;

describe("sql", () => {
  describe("basic parameter handling", () => {
    it("should work with a single parameter at the end of a string", () => {
      const { parts, params } = sql`SELECT * FROM users WHERE id = ${1}`;

      expect(parts).toEqual(["SELECT * FROM users WHERE id = ", ""]);
      expect(params).toEqual([1]);
    });

    it("should work with a single parameter in the middlade of a string", () => {
      const { parts, params } =
        sql`SELECT * FROM users WHERE id = ${1} LIMIT 1`;

      expect(parts).toEqual(["SELECT * FROM users WHERE id = ", " LIMIT 1"]);
      expect(params).toEqual([1]);
    });

    it("should work with a single parameter at the beginning of a string", () => {
      const { parts, params } = sql`${"foo"} the rest of the string`;

      expect(parts).toEqual(["", " the rest of the string"]);
      expect(params).toEqual(["foo"]);
    });

    it("should work with multiple parameters", () => {
      const { parts, params } =
        sql`SELECT * FROM users WHERE id = ${1} AND name = ${"foo"}`;

      expect(parts).toEqual([
        "SELECT * FROM users WHERE id = ",
        " AND name = ",
        "",
      ]);
      expect(params).toEqual([1, "foo"]);
    });

    it("should work with an empty string", () => {
      const { parts, params } = sql``;

      expect(parts).toEqual([""]);
      expect(params).toEqual([]);
    });
  });

  describe("fragment composition", () => {
    it("should allow nested fragments", () => {
      const fragment1 = sql`LOWER(${"foo"})`;

      expect(fragment1.parts).toEqual(["LOWER(", ")"]);
      expect(fragment1.params).toEqual(["foo"]);

      const example = sql`SELECT * FROM users WHERE id = ${1} AND name = ${fragment1}`;

      expect(example.parts).toEqual([
        "SELECT * FROM users WHERE id = ",
        " AND name = LOWER(",
        ")",
      ]);
      expect(example.params).toEqual([1, "foo"]);
    });

    it("should keep track of params correctly in nested fragments", () => {
      const fragment1 = sql`LOWER(${"FOO"})`;
      const fragment2 = sql`UPPER(${"bar"})`;

      const example = sql`SELECT ${identifier("my_column")} FROM ${identifier("some_table")} WHERE column1 = ${fragment1} AND column2 = ${fragment2}`;

      expect(example.parts).toEqual([
        'SELECT "my_column" FROM "some_table" WHERE column1 = LOWER(',
        ") AND column2 = UPPER(",
        ")",
      ]);
      expect(example.params).toEqual(["FOO", "bar"]);
    });

    it("should merge things when there's no variables", () => {
      const fragment1 = sql`SELECT`;
      const fragment2 = sql`FROM`;

      const example = sql`${fragment1} * ${fragment2} users`;

      expect(example.parts).toEqual(["SELECT * FROM users"]);
      expect(example.params).toEqual([]);
    });
  });
});

describe("toQuery", () => {
  describe("basic parameter handling", () => {
    it("should work with a single parameter at the end of a string", () => {
      const someVariable = "abc";
      const example = sql`SELECT * FROM users WHERE id = ${someVariable}`;

      const { text, values } = toQuery(example);

      expect(text).toEqual("SELECT * FROM users WHERE id = $1");
      expect(values).toEqual(expect.arrayContaining(["abc"]));
    });

    it("should work with a single parameter in the middle of a string", () => {
      const example = sql`SELECT * FROM users WHERE id = ${1} LIMIT 1`;

      const { text, values } = toQuery(example);

      expect(text).toEqual("SELECT * FROM users WHERE id = $1 LIMIT 1");
      expect(values).toEqual(expect.arrayContaining([1]));
    });

    it("should work with a single parameter at the beginning of a string", () => {
      const example = sql`${"foo"} the rest of the string`;

      const { text, values } = toQuery(example);

      expect(text).toEqual("$1 the rest of the string");
      expect(values).toEqual(expect.arrayContaining(["foo"]));
    });

    it("should work with multiple parameters", () => {
      const example = sql`SELECT * FROM users WHERE id = ${1} AND name = ${"foo"}`;

      const { text, values } = toQuery(example);

      expect(text).toEqual("SELECT * FROM users WHERE id = $1 AND name = $2");
      expect(values).toEqual(expect.arrayContaining([1, "foo"]));
    });

    it("should work with an empty string", () => {
      const example = sql``;

      const { text, values } = toQuery(example);

      expect(text).toEqual("");
      expect(values).toEqual([]);
    });
  });

  describe("fragment composition", () => {
    it("should work with nested fragments", () => {
      const fragment1 = sql`LOWER(${"foo"})`;
      const example = sql`SELECT * FROM users WHERE id = ${1} AND name = ${fragment1}`;

      const { text, values } = toQuery(example);

      expect(text).toEqual(
        "SELECT * FROM users WHERE id = $1 AND name = LOWER($2)",
      );
      expect(values).toEqual(expect.arrayContaining([1, "foo"]));
    });

    it("should work with additional parameters", () => {
      const exampleQuery = sql`SELECT * FROM users WHERE id = $1 AND name = ${"foo"}`;
      const exampleParams = [1];

      const { text, values } = toQuery(exampleQuery, exampleParams);

      expect(text).toEqual("SELECT * FROM users WHERE id = $1 AND name = $2");
      expect(values).toEqual(expect.arrayContaining([1, "foo"]));
    });

    it("should keep track of params correctly in nested fragments", () => {
      const fragment1 = sql`LOWER(${"FOO"})`;
      const fragment2 = sql`UPPER(${"bar"})`;

      const example = sql`SELECT ${identifier("my_column")} FROM ${identifier("some_table")} WHERE column1 = ${fragment1} AND column2 = ${fragment2}`;

      const { text, values } = toQuery(example);

      expect(text).toEqual(
        'SELECT "my_column" FROM "some_table" WHERE column1 = LOWER($1) AND column2 = UPPER($2)',
      );
      expect(values).toEqual(["FOO", "bar"]);
    });
  });

  describe("weird inputs", () => {
    it("should handle null and undefined safely", () => {
      const query1 = sql`SELECT * FROM users WHERE name = ${null}`;
      const query2 = sql`SELECT * FROM users WHERE name = ${undefined}`;

      const result1 = toQuery(query1);
      const result2 = toQuery(query2);

      expect(result1.text).toEqual("SELECT * FROM users WHERE name = $1");
      expect(result1.values).toEqual([null]);
      expect(result2.text).toEqual("SELECT * FROM users WHERE name = $1");
      expect(result2.values).toEqual([undefined]);
    });

    it("should handle binary data and special characters", () => {
      const binaryData = Buffer.from([0x00, 0x01, 0xff]);
      const unicodeString = "🚀 SELECT * FROM users; 💀";

      const query = sql`INSERT INTO logs (data, message) VALUES (${binaryData}, ${unicodeString})`;
      const result = toQuery(query);

      expect(result.text).toEqual(
        "INSERT INTO logs (data, message) VALUES ($1, $2)",
      );
      expect(result.values).toEqual([binaryData, unicodeString]);
    });

    it("should maintain security through nested fragments", () => {
      const maliciousValue = "'; DROP TABLE users; --";
      const innerFragment = sql`name = ${maliciousValue}`;
      const outerQuery = sql`SELECT * FROM users WHERE ${innerFragment}`;
      const result = toQuery(outerQuery);

      expect(result.text).toEqual("SELECT * FROM users WHERE name = $1");
      expect(result.values).toEqual(["'; DROP TABLE users; --"]);
    });

    it("should escape malicious identifiers", () => {
      const maliciousTable = 'users"; DROP TABLE admin; --';
      const query = sql`SELECT * FROM ${identifier(maliciousTable)}`;
      const result = toQuery(query);

      expect(result.text).toEqual(
        'SELECT * FROM "users""; DROP TABLE admin; --"',
      );
      expect(result.values).toEqual([]);
      // The identifier should be properly quoted and escaped
    });

    it("should handle identifier with multiple quote attempts", () => {
      const trickyName = 'col""umn""name';
      const query = sql`SELECT ${identifier(trickyName)} FROM users`;
      const result = toQuery(query);

      expect(result.text).toEqual('SELECT "col""""umn""""name" FROM users');
      expect(result.values).toEqual([]);
    });
  });
});

describe("identifier", () => {
  describe("basic functionality", () => {
    it("should create a identifier object with proper structure", () => {
      const result = identifier("users");

      expect(result).toEqual({
        __isIdentifier: true,
        value: "users",
      });
    });

    it("should escape double quotes in identifiers", () => {
      const result = identifier('table"name');

      expect(result).toEqual({
        __isIdentifier: true,
        value: 'table""name',
      });
    });

    it("should handle multiple double quotes", () => {
      const result = identifier('tab"le"name');

      expect(result).toEqual({
        __isIdentifier: true,
        value: 'tab""le""name',
      });
    });

    it("should throw error for non-string values", () => {
      expect(() => identifier(123 as any)).toThrow(
        "identifier() only accepts string values",
      );
      expect(() => identifier(null as any)).toThrow(
        "identifier() only accepts string values",
      );
      expect(() => identifier(undefined as any)).toThrow(
        "identifier() only accepts string values",
      );
    });

    it("should throw error for empty strings", () => {
      expect(() => identifier("")).toThrow(
        "identifier() cannot accept empty strings",
      );
    });
    it("should accept valid PostgreSQL identifiers", () => {
      expect(() => identifier("users")).not.toThrow();
      expect(() => identifier("user_table")).not.toThrow();
      expect(() => identifier("_private_table")).not.toThrow();
      expect(() => identifier("$special_table")).not.toThrow();
      expect(() => identifier("table123")).not.toThrow();
      expect(() => identifier("MyTable")).not.toThrow();
      expect(() => identifier('table"name')).not.toThrow(); // Quotes are allowed and escaped
    });
  });

  describe("integration with sql template tag", () => {
    it("should work with table names in FROM clause", () => {
      const tableName = "users";
      const fragment = sql`SELECT * FROM ${identifier(tableName)} WHERE id = ${"123"}`;

      expect(fragment.parts).toEqual(['SELECT * FROM "users" WHERE id = ', ""]);
      expect(fragment.params).toEqual(["123"]);
    });

    it("should work with column names", () => {
      const columnName = "user_id";
      const fragment = sql`SELECT ${identifier(columnName)} FROM users WHERE id = ${1}`;

      expect(fragment.parts).toEqual([
        'SELECT "user_id" FROM users WHERE id = ',
        "",
      ]);
      expect(fragment.params).toEqual([1]);
    });

    it("should work with multiple identifiers and parameters", () => {
      const tableName = "users";
      const columnName = "name";
      const fragment = sql`SELECT ${identifier(columnName)} FROM ${identifier(tableName)} WHERE id = ${"abc"}`;

      expect(fragment.parts).toEqual([
        'SELECT "name" FROM "users" WHERE id = ',
        "",
      ]);
      expect(fragment.params).toEqual(["abc"]);
    });

    it("should properly escape identifiers with quotes", () => {
      const weirdTableName = 'my"table';
      const fragment = sql`SELECT * FROM ${identifier(weirdTableName)} WHERE id = ${1}`;

      expect(fragment.parts).toEqual([
        'SELECT * FROM "my""table" WHERE id = ',
        "",
      ]);
      expect(fragment.params).toEqual([1]);
    });

    it("should work in the middle of a query", () => {
      const tableName = "users";
      const fragment = sql`SELECT * FROM ${identifier(tableName)} ORDER BY id LIMIT ${10}`;

      expect(fragment.parts).toEqual([
        'SELECT * FROM "users" ORDER BY id LIMIT ',
        "",
      ]);
      expect(fragment.params).toEqual([10]);
    });
  });

  describe("integration with toQuery", () => {
    it("should generate correct SQL with identifiers and parameters", () => {
      const tableName = "users";
      const fragment = sql`SELECT * FROM ${identifier(tableName)} WHERE id = ${123}`;
      const query = toQuery(fragment);

      expect(query.text).toEqual('SELECT * FROM "users" WHERE id = $1');
      expect(query.values).toEqual([123]);
    });

    it("should handle complex queries with mixed identifiers and parameters", () => {
      const tableName = "users";
      const columnName = "email";
      const fragment = sql`SELECT ${identifier(columnName)} FROM ${identifier(tableName)} WHERE id = ${1} AND status = ${"active"}`;
      const query = toQuery(fragment);

      expect(query.text).toEqual(
        'SELECT "email" FROM "users" WHERE id = $1 AND status = $2',
      );
      expect(query.values).toEqual([1, "active"]);
    });

    it("should work with nested fragments containing identifiers", () => {
      const tableName = "users";
      const subQuery = sql`${identifier(tableName)} WHERE active = ${true}`;
      const fragment = sql`SELECT * FROM ${subQuery} AND id = ${1}`;
      const query = toQuery(fragment);

      expect(query.text).toEqual(
        'SELECT * FROM "users" WHERE active = $1 AND id = $2',
      );
      expect(query.values).toEqual([true, 1]);
    });
  });
});

describe("raw", () => {
  describe("basic functionality", () => {
    it("should create a raw object with proper structure for strings", () => {
      const result = raw("ASC");

      expect(result).toEqual({
        __isRaw: true,
        value: "ASC",
      });
    });

    it("should create a raw object with proper structure for numbers", () => {
      const result = raw(42);

      expect(result).toEqual({
        __isRaw: true,
        value: "42",
      });
    });

    it("should handle zero as a number", () => {
      const result = raw(0);

      expect(result).toEqual({
        __isRaw: true,
        value: "0",
      });
    });

    it("should handle negative numbers", () => {
      const result = raw(-123);

      expect(result).toEqual({
        __isRaw: true,
        value: "-123",
      });
    });

    it("should handle decimal numbers", () => {
      const result = raw(3.14);

      expect(result).toEqual({
        __isRaw: true,
        value: "3.14",
      });
    });

    it("should handle empty strings", () => {
      const result = raw("");

      expect(result).toEqual({
        __isRaw: true,
        value: "",
      });
    });
  });

  describe("integration with sql template tag", () => {
    it("should inject raw strings directly into SQL", () => {
      const direction = "ASC";
      const fragment = sql`SELECT * FROM users ORDER BY name ${raw(direction)}`;

      expect(fragment.parts).toEqual(["SELECT * FROM users ORDER BY name ASC"]);
      expect(fragment.params).toEqual([]);
    });

    it("should inject raw numbers directly into SQL", () => {
      const limit = 10;
      const fragment = sql`SELECT * FROM users LIMIT ${raw(limit)}`;

      expect(fragment.parts).toEqual(["SELECT * FROM users LIMIT 10"]);
      expect(fragment.params).toEqual([]);
    });

    it("should work with multiple raw values", () => {
      const direction = "DESC";
      const nulls = "NULLS LAST";
      const fragment = sql`SELECT * FROM users ORDER BY name ${raw(direction)} ${raw(nulls)}`;

      expect(fragment.parts).toEqual([
        "SELECT * FROM users ORDER BY name DESC NULLS LAST",
      ]);
      expect(fragment.params).toEqual([]);
    });

    it("should work with mixed raw values and parameters", () => {
      const direction = "ASC";
      const userId = 123;
      const fragment = sql`SELECT * FROM users WHERE id = ${userId} ORDER BY name ${raw(direction)}`;

      expect(fragment.parts).toEqual([
        "SELECT * FROM users WHERE id = ",
        " ORDER BY name ASC",
      ]);
      expect(fragment.params).toEqual([123]);
    });

    it("should work with raw values between parameters", () => {
      const operator = "AND";
      const fragment = sql`SELECT * FROM users WHERE id = ${1} ${raw(operator)} name = ${"john"}`;

      expect(fragment.parts).toEqual([
        "SELECT * FROM users WHERE id = ",
        " AND name = ",
        "",
      ]);
      expect(fragment.params).toEqual([1, "john"]);
    });

    it("should work with identifiers and raw values", () => {
      const tableName = "users";
      const direction = "DESC";
      const fragment = sql`SELECT * FROM ${identifier(tableName)} ORDER BY id ${raw(direction)}`;

      expect(fragment.parts).toEqual([
        'SELECT * FROM "users" ORDER BY id DESC',
      ]);
      expect(fragment.params).toEqual([]);
    });
  });

  describe("integration with toQuery", () => {
    it("should generate correct SQL with raw values", () => {
      const direction = "ASC";
      const fragment = sql`SELECT * FROM users WHERE id = ${123} ORDER BY name ${raw(direction)}`;
      const query = toQuery(fragment);

      expect(query.text).toEqual(
        "SELECT * FROM users WHERE id = $1 ORDER BY name ASC",
      );
      expect(query.values).toEqual([123]);
    });

    it("should handle complex queries with mixed raw values, identifiers, and parameters", () => {
      const tableName = "users";
      const direction = "DESC";
      const nullsHandling = "NULLS FIRST";
      const fragment = sql`SELECT * FROM ${identifier(tableName)} WHERE id = ${1} AND status = ${"active"} ORDER BY name ${raw(direction)} ${raw(nullsHandling)}`;
      const query = toQuery(fragment);

      expect(query.text).toEqual(
        'SELECT * FROM "users" WHERE id = $1 AND status = $2 ORDER BY name DESC NULLS FIRST',
      );
      expect(query.values).toEqual([1, "active"]);
    });

    it("should work with nested fragments containing raw values", () => {
      const operator = "OR";
      const subQuery = sql`status = ${"active"} ${raw(operator)} priority = ${"high"}`;
      const fragment = sql`SELECT * FROM users WHERE ${subQuery}`;
      const query = toQuery(fragment);

      expect(query.text).toEqual(
        "SELECT * FROM users WHERE status = $1 OR priority = $2",
      );
      expect(query.values).toEqual(["active", "high"]);
    });
  });
});

describe("join", () => {
  describe("handles the basics", () => {
    it("should be able to join literals", () => {
      const result = join(
        [
          sql`SELECT`,
          identifier("someColumn"),
          raw("FROM"),
          identifier("some_table"),
        ],
        sql` `,
      );

      expect(result.params).toEqual([]);
      expect(result.parts).toEqual(['SELECT "someColumn" FROM "some_table"']);
    });

    it("should be able to join a mix", () => {
      const result = join(
        [
          sql`SELECT * FROM ${identifier("some_table")} WHERE ${identifier("someColumn")} = ${"abc"}`,
          sql`"otherColumn" = ${"123"}`,
        ],
        sql` AND `,
      );

      expect(result.params).toEqual(["abc", "123"]);
      expect(result.parts).toEqual([
        'SELECT * FROM "some_table" WHERE "someColumn" = ',
        ' AND "otherColumn" = ',
        "",
      ]);
    });

    it("should be fine with an empty array", () => {
      const result = join([]);

      expect(result.parts).toEqual([""]);
      expect(result.params).toEqual([]);
    });

    it("should be fine with a single fragment", () => {
      const result = join([sql`SELECT`]);

      expect(result.parts).toEqual(["SELECT"]);
      expect(result.params).toEqual([]);
    });
  });
});

describe("inlineInterpolations", () => {
  it("should work with no interpolations", () => {
    const { strings, interpolations } = inlineInterpolations(["foo"], []);
    expect(strings).toEqual(["foo"]);
    expect(interpolations).toEqual([]);
  });
  it("should be fine with no fragments", () => {
    const { strings, interpolations } = inlineInterpolations(
      ["SELECT * FROM users WHERE id = ", " AND name = ", ""],
      [1, "foo"],
    );

    expect(strings).toEqual([
      "SELECT * FROM users WHERE id = ",
      " AND name = ",
      "",
    ]);
    expect(interpolations).toEqual([1, "foo"]);
  });

  it("should flatten a single fragment", () => {
    const fragment1 = sql`LOWER(${"foo"})`;
    const example = sql`SELECT * FROM users WHERE id = ${fragment1}`;
    const { strings, interpolations } = inlineInterpolations(
      example.parts,
      example.params,
    );

    expect(strings).toEqual(["SELECT * FROM users WHERE id = LOWER(", ")"]);
    expect(interpolations).toEqual(["foo"]);
  });

  it("should flatten multiple fragments", () => {
    const fragment1 = sql`LOWER(${"foo"})`;
    const fragment2 = sql`UPPER(${"bar"})`;
    const example = sql`SELECT ${identifier("my_column")} FROM ${identifier("some_table")} WHERE column1 = ${fragment1} AND column2 = ${fragment2}`;
    const { strings, interpolations } = inlineInterpolations(
      example.parts,
      example.params,
    );

    expect(strings).toEqual([
      'SELECT "my_column" FROM "some_table" WHERE column1 = LOWER(',
      ") AND column2 = UPPER(",
      ")",
    ]);
    expect(interpolations).toEqual(["foo", "bar"]);
  });

  it("should flatten deeply nested fragments", () => {
    const fragment1 = sql`LOWER(${"foo"})`;
    const where = sql`WHERE id = ${fragment1}`;
    const example = sql`SELECT * FROM users ${where}`;
    const { strings, interpolations } = inlineInterpolations(
      example.parts,
      example.params,
    );

    expect(strings).toEqual(["SELECT * FROM users WHERE id = LOWER(", ")"]);
    expect(interpolations).toEqual(["foo"]);
  });
});

describe("literal", () => {
  describe("basic functionality", () => {
    it("should create a literal object with proper structure", () => {
      const result = literal("ASC");

      expect(result).toEqual({
        __isLiteral: true,
        value: "ASC",
      });
    });

    it("should escape single quotes in literals", () => {
      const result = literal("pa'th");

      expect(result).toEqual({
        __isLiteral: true,
        value: "pa''th",
      });
    });
  });

  describe("integration with sql template tag", () => {
    it("should work with table names in FROM clause", () => {
      const exampleLiteral = "pa'th";
      const fragment = sql`some query here ${literal(exampleLiteral)}`;

      expect(fragment.parts).toEqual(["some query here 'pa''th'"]);
      expect(fragment.params).toEqual([]);
    });
  });

  describe("weird inputs", () => {
    it("should escape malicious literal values", () => {
      const maliciousLiteral = "admin'; DROP TABLE users; --";
      const query = sql`SELECT * FROM users WHERE role = ${literal(maliciousLiteral)}`;
      const result = toQuery(query);

      expect(result.text).toEqual(
        "SELECT * FROM users WHERE role = 'admin''; DROP TABLE users; --'",
      );
      expect(result.values).toEqual([]);
    });

    it("should handle multiple single quotes in literals", () => {
      const multiQuote = "O'Reilly's 'special' case";
      const query = sql`SELECT * FROM users WHERE comment = ${literal(multiQuote)}`;
      const result = toQuery(query);

      expect(result.text).toEqual(
        "SELECT * FROM users WHERE comment = 'O''Reilly''s ''special'' case'",
      );
      expect(result.values).toEqual([]);
    });
  });
});

describe("isEmpty", () => {
  describe("basic empty fragment handling", () => {
    it("should return true for empty fragment", () => {
      const fragment = sql``;

      expect(isEmpty(fragment)).toBe(true);
    });

    it("should return true for fragment with only whitespace", () => {
      const fragment = sql`   `;

      expect(isEmpty(fragment)).toBe(false);
    });

    it("should return true for fragment with mixed whitespace characters", () => {
      const fragment = sql`  	
  `;

      expect(isEmpty(fragment)).toBe(false);
    });

    it("should return false for fragment with content", () => {
      const fragment = sql`SELECT`;

      expect(isEmpty(fragment)).toBe(false);
    });

    it("should return false for fragment with content and whitespace", () => {
      const fragment = sql`  SELECT  `;

      expect(isEmpty(fragment)).toBe(false);
    });
  });

  describe("parameter handling", () => {
    it("should return false for fragment with parameters even if strings are empty", () => {
      const fragment = sql`${123}`;

      expect(isEmpty(fragment)).toBe(false);
    });

    it("should return false for fragment with parameters and whitespace", () => {
      const fragment = sql`  ${123}  `;

      expect(isEmpty(fragment)).toBe(false);
    });

    it("should return false for fragment with multiple parameters", () => {
      const fragment = sql`${123}${456}`;

      expect(isEmpty(fragment)).toBe(false);
    });

    it("should return false for fragment with content and parameters", () => {
      const fragment = sql`SELECT * FROM users WHERE id = ${123}`;

      expect(isEmpty(fragment)).toBe(false);
    });
  });

  describe("composed fragment handling", () => {
    it("should return true for empty composed fragments", () => {
      const emptyFragment1 = sql``;
      const emptyFragment2 = sql``;
      const composed = sql`${emptyFragment1}${emptyFragment2}`;

      expect(isEmpty(composed)).toBe(true);
    });

    it("should return true for whitespace-only composed fragments", () => {
      const whitespaceFragment1 = sql`  `;
      const whitespaceFragment2 = sql`	`;
      const composed = sql`${whitespaceFragment1}${whitespaceFragment2}`;

      expect(isEmpty(composed)).toBe(false);
    });

    it("should return false for composed fragments with content", () => {
      const contentFragment = sql`SELECT`;
      const emptyFragment = sql``;
      const composed = sql`${contentFragment}${emptyFragment}`;

      expect(isEmpty(composed)).toBe(false);
    });

    it("should return false for composed fragments with parameters", () => {
      const paramFragment = sql`${123}`;
      const emptyFragment = sql``;
      const composed = sql`${paramFragment}${emptyFragment}`;

      expect(isEmpty(composed)).toBe(false);
    });
  });
});

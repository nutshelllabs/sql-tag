export type SQLFragment = {
  parts: string[];
  params: any[];
};

export type SQLQuery = {
  text: string;
  values: any[];
};

export type SQLIdentifier = {
  __isIdentifier: true;
  value: string;
};

export type SQLRaw = {
  __isRaw: true;
  value: string;
};

export type SQLLiteral = {
  __isLiteral: true;
  value: string;
};

/** Any SQL* type return from a sql-tag function */
export type SQLAny = SQLFragment | SQLIdentifier | SQLRaw | SQLLiteral;

function isSqlFragment(value: any): value is SQLFragment {
  return (
    value && typeof value === "object" && "parts" in value && "params" in value
  );
}

function isSqlIdentifier(value: any): value is SQLIdentifier {
  return (
    value &&
    typeof value === "object" &&
    "__isIdentifier" in value &&
    value.__isIdentifier === true
  );
}

function isSqlRaw(value: any): value is SQLRaw {
  return (
    value &&
    typeof value === "object" &&
    "__isRaw" in value &&
    value.__isRaw === true
  );
}

function isSqlLiteral(value: any): value is SQLLiteral {
  return (
    value &&
    typeof value === "object" &&
    "__isLiteral" in value &&
    value.__isLiteral === true
  );
}

/**
 * Inline any interpolations that should not be converted to values in the final SQL string.  This includes inlining `raw()` values, `identifier()` values, and nested fragments.
 */
function inlineInterpolations(
  strings: string[],
  interpolations: any[],
): { strings: string[]; interpolations: any[] } {
  /*
  It should always be true that we have more string than we have interpolations.  The basic stucture of the input should follow this pattern:

    strings:        [stringA,                 stringB,                stringC]
    interpolations: [         interpolation1,          interpolation2        ]

  This function will work like a loop.  Each iteration will will consider the first string, the first interpolation, and the next string.  If we can inline an interpolation value, we will, otherwise those will get accumulated into an array to get parameterized later.
  */
  if (interpolations.length === 0) {
    return { strings, interpolations };
  }

  const finalStrings: string[] = [];
  const finalInterpolations: any[] = [];

  let currentString = strings[0] ?? "";

  for (let i = 0; i < interpolations.length; i++) {
    const interpolation = interpolations[i];
    const nextString = strings[i + 1] ?? "";

    if (isSqlIdentifier(interpolation)) {
      currentString += `"${interpolation.value}"` + nextString;
    } else if (isSqlRaw(interpolation)) {
      currentString += interpolation.value + nextString;
    } else if (isSqlLiteral(interpolation)) {
      currentString += `'${interpolation.value}'` + nextString;
    } else if (isSqlFragment(interpolation)) {
      // Recursively inline the fragment
      const inlined = inlineInterpolations(
        interpolation.parts,
        interpolation.params,
      );

      // Add fragment's parameters to result
      finalInterpolations.push(...inlined.interpolations);

      // Merge fragment's strings
      if (inlined.strings.length === 0) {
        currentString += nextString;
      } else if (inlined.strings.length === 1) {
        currentString += inlined.strings[0] + nextString;
      } else {
        // Multiple strings: merge first with current, add middle ones, merge last with next
        currentString += inlined.strings[0];
        finalStrings.push(currentString);

        // Add middle strings
        for (let j = 1; j < inlined.strings.length - 1; j++) {
          finalStrings.push(inlined.strings[j] ?? "");
        }

        // Start new current string with last fragment string + next string
        currentString =
          (inlined.strings[inlined.strings.length - 1] ?? "") + nextString;
      }
    } else {
      // Can't inline - keep as parameter
      finalStrings.push(currentString);
      finalInterpolations.push(interpolation);
      currentString = nextString;
    }
  }

  // Add the final string
  finalStrings.push(currentString);

  return {
    strings: finalStrings,
    interpolations: finalInterpolations,
  };
}

/**
 *
 * @param sqlFragment A SQL query that may or may not already contain parameters
 * @param params An optional array of parameters for any placeholders already in the query
 */
export function toQuery(sqlFragment: SQLFragment): SQLQuery;
export function toQuery(sqlFragment: SQLFragment, params: any[]): SQLQuery;
export function toQuery(sqlFragment: SQLFragment, params?: any[]): SQLQuery {
  const existingParams = params || [];
  let paramIndex = existingParams.length + 1;

  let text = "";

  for (let i = 0; i < sqlFragment.parts.length; i++) {
    text += sqlFragment.parts[i];

    // If there's a corresponding parameter, add the placeholder
    if (i < sqlFragment.params.length) {
      text += "$" + paramIndex++;
    }
  }

  return {
    text,
    values: [...existingParams, ...sqlFragment.params],
  };
}

/**
 * Automatically parameterizes a SQL string with placeholders. Some objects will be inlined into the SQL string, such as `identifier()` and `literal()` values.
 */
export function sql(
  strings: TemplateStringsArray,
  ...interpolations: any[]
): SQLFragment {
  const parts: string[] = [];
  const params: any[] = [];

  const inlined = inlineInterpolations([...strings], [...interpolations]);
  const stringsToProcess = inlined.strings;
  const interpolationsToProcess = inlined.interpolations;

  // start our loop - use index-based iteration to preserve null/undefined values
  for (
    let i = 0;
    i < stringsToProcess.length || i < interpolationsToProcess.length;
    i++
  ) {
    if (i < stringsToProcess.length && i >= interpolationsToProcess.length) {
      parts.push(stringsToProcess[i] ?? "");
    } else if (
      i < stringsToProcess.length &&
      i <= interpolationsToProcess.length
    ) {
      parts.push(stringsToProcess[i] ?? "");
      params.push(interpolationsToProcess[i]);
    }
  }

  return { parts, params };
}

/**
 * Escape double quotes in an identifier string
 */
export function identifier(value: string): SQLIdentifier {
  if (typeof value !== "string") {
    throw new Error("identifier() only accepts string values");
  }

  if (value.length === 0) {
    throw new Error("identifier() cannot accept empty strings");
  }

  return {
    __isIdentifier: true,
    value: value.replace(/"/g, '""'),
  };
}

/**
 * **IMPORTANT:** This function can allow of SQL injection attacks. Use with caution. It will include the provided value directly into the SQL string.
 */
export function raw(value: string | number): SQLRaw {
  return {
    __isRaw: true,
    value: value.toString(),
  };
}

/**
 * Escape single quotes in a literal string
 */
export function literal(value: string): SQLLiteral {
  return {
    __isLiteral: true,
    value: value.replace(/'/g, "''"),
  };
}

/**
 * Similar to Array.join(), but for SQL fragments
 * @param fragments An array of sql pieces
 * @param separator An optional separator to use when joining
 * @returns Joins all the sql pieces with the given separator
 */
export function join(
  fragments: (SQLFragment | SQLRaw | SQLIdentifier | SQLLiteral)[],
  separator: SQLFragment | SQLRaw | SQLIdentifier | SQLLiteral = sql`, `,
): SQLFragment {
  if (fragments.length === 0) {
    return sql``;
  }

  if (fragments.length === 1) {
    return sql`${fragments[0]}`;
  }

  const first = sql`${fragments.shift()}`;

  // There is probably a more efficient way to do this by manipulating the parts & params arrays directly, but nothing is as readable as this.
  return fragments.reduce((acc: SQLFragment, fragment): SQLFragment => {
    return sql`${acc}${separator}${fragment}`;
  }, first);
}

/**
 * Determines whether a given SQL fragment is empty, i.e. has no parameters and no content.
 *
 * ```ts
 * isEmpty(sql``); // true
 * isEmpty(sql`SELECT`); // false
 * isEmpty(sql`    `); // false
 * ```
 */
export function isEmpty(fragment: SQLFragment): boolean {
  if (fragment.params.length > 0) {
    return false;
  }

  return fragment.parts.every((part) => part === "");
}

export const _jest = { inlineInterpolations };

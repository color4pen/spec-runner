/**
 * OpenAI strict mode JSON Schema compatibility transformations for codex adapter.
 *
 * OpenAI structured output (strict mode) requires every property to be listed in `required`
 * and optional fields to be expressed as nullable (type union with null).
 * These helpers transform a standard zod-generated JSON Schema into strict mode compatible form.
 *
 * Both functions are pure (no I/O, no mutation of inputs).
 */

type JsonSchema = Record<string, unknown>;

/**
 * Make a property schema nullable according to strict mode rules:
 * - anyOf present → append { type: "null" } (dedup)
 * - type is a string → convert to [type, "null"] array
 * - type is already an array → append "null" if absent
 *
 * Called after the property schema itself has been recursively strict-ified.
 */
function makeNullable(schema: JsonSchema): JsonSchema {
  if (Array.isArray(schema["anyOf"])) {
    const anyOf = schema["anyOf"] as JsonSchema[];
    const alreadyNull = anyOf.some((b) => b["type"] === "null");
    if (alreadyNull) return schema;
    return { ...schema, anyOf: [...anyOf, { type: "null" }] };
  }
  if (typeof schema["type"] === "string") {
    return { ...schema, type: [schema["type"], "null"] };
  }
  if (Array.isArray(schema["type"])) {
    const types = schema["type"] as string[];
    if (types.includes("null")) return schema;
    return { ...schema, type: [...types, "null"] };
  }
  return schema;
}

/**
 * Recursively transform a JSON Schema object to OpenAI strict mode compatible form.
 *
 * Rules (applied recursively):
 * - object node with properties: all properties listed in required; optional properties are nullable.
 * - array node with items: items are recursively transformed.
 * - anyOf node: each branch is recursively transformed.
 *
 * The input object is never mutated; a new object is returned.
 */
export function toOpenAIStrictSchema(schema: object): object {
  const s = schema as JsonSchema;

  // anyOf: recurse into each branch
  if (Array.isArray(s["anyOf"])) {
    const transformed: JsonSchema = { ...s };
    transformed["anyOf"] = (s["anyOf"] as object[]).map(toOpenAIStrictSchema);
    return transformed;
  }

  // array: recurse into items
  if (s["type"] === "array" && s["items"] !== undefined && s["items"] !== null) {
    return { ...s, items: toOpenAIStrictSchema(s["items"] as object) };
  }

  // object: enforce strict required + nullable
  if (s["type"] === "object" && typeof s["properties"] === "object" && s["properties"] !== null) {
    const properties = s["properties"] as Record<string, object>;
    const originalRequired: string[] = Array.isArray(s["required"]) ? (s["required"] as string[]) : [];
    const allKeys = Object.keys(properties);

    // Recursively transform each property schema
    const newProperties: Record<string, object> = {};
    for (const key of allKeys) {
      let propSchema = toOpenAIStrictSchema(properties[key]!);
      // If this key was NOT in the original required, make it nullable
      if (!originalRequired.includes(key)) {
        propSchema = makeNullable(propSchema as JsonSchema) as object;
      }
      newProperties[key] = propSchema;
    }

    return {
      ...s,
      properties: newProperties,
      required: allKeys,
    };
  }

  return { ...s };
}

/**
 * Recursively remove keys with null values from objects.
 *
 * - object: drop null-valued keys, recurse into remaining values
 * - array: recurse into each element
 * - other (primitive): return as-is
 *
 * Input is never mutated.
 */
export function stripNullDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripNullDeep);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      if (obj[key] !== null) {
        result[key] = stripNullDeep(obj[key]);
      }
    }
    return result;
  }
  return value;
}

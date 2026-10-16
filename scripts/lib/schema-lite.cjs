/** Minimal deterministic checker for the JSON Schema keywords used by this repository.
 *  Canonical documents are JSON Schema 2020-12; this is NOT a general-purpose validator. */
function check(value, schema, where = '$') {
  const errors = [];
  const fail = (message) => errors.push(`${where}: ${message}`);
  if (schema.const !== undefined && value !== schema.const) fail(`expected constant ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) fail(`not in enum ${JSON.stringify(schema.enum)}`);
  const ts = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const typeMatches = t => t === 'null' ? value === null
    : t === 'array' ? Array.isArray(value)
    : t === 'integer' ? Number.isInteger(value)
    : t === 'number' ? typeof value === 'number' && Number.isFinite(value)
    : t === 'object' ? typeof value === 'object' && value !== null && !Array.isArray(value)
    : typeof value === t;
  if (ts.length && !ts.some(typeMatches)) { fail(`expected ${ts.join('|')}`); return errors; }
  if (typeof value === 'string' && schema.minLength && [...value].length < schema.minLength) fail(`minLength ${schema.minLength}`);
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`maximum ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.uniqueItems && new Set(value.map(x => JSON.stringify(x))).size !== value.length) fail('uniqueItems');
    if (schema.items) value.forEach((v, i) => errors.push(...check(v, schema.items, `${where}[${i}]`)));
  }
  if (value !== null && !Array.isArray(value) && typeof value === 'object') {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) fail(`missing required ${key}`);
    for (const [key, v] of Object.entries(value)) {
      if (schema.properties?.[key]) errors.push(...check(v, schema.properties[key], `${where}.${key}`));
      else if (schema.additionalProperties === false) fail(`unexpected property ${key}`);
    }
    for (const condition of schema.allOf || []) {
      const cond = condition.if;
      if (!cond) continue;
      if (!check(value, cond).length && condition.then) errors.push(...check(value, condition.then, where));
    }
  }
  return errors;
}
module.exports = { check };

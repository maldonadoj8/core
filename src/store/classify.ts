// =============================================================================
// @silasdevs/core — Classify
//
// Takes a raw server payload (a dictionary whose keys are table names or
// generic group names) and routes each record into the correct store table.
//
// Supports two resolution strategies simultaneously:
//   1. **Prop-based** (most specific): the record's `record[resolverProp]`
//      is matched against each table's `resolverValue`.
//   2. **Name-based** (fallback): the key in the payload maps directly to
//      a table's external name.
//
// All upserts are wrapped in a batch so observers receive a single
// notification round, regardless of how many records changed.
// =============================================================================

import type { ClassifyResult, ClassifySummary } from './types.js';
import { ChangeType as CT } from './types.js';
import { batch } from '../core/batch.js';
import { invariant, SilasError } from '../core/errors.js';
import type { Store } from './store.js';

// =============================================================================

/**
 * Classify a raw data payload into a store.
 *
 * The payload is expected to be an object where each key maps to an array
 * of records (or a single record object).
 *
 * All upserts are batched.
 */
export function classifyData(
  store: Store,
  data: Record<string, unknown>,
): ClassifyResult {
  invariant(
    data !== null && data !== undefined && typeof data === 'object' && !Array.isArray(data),
    'classifyData() expects a non-null, non-array object as data.',
  );

  const changes: ClassifyResult['changes'] = [];
  const summary: ClassifySummary = { inserts: 0, updates: 0, deletes: 0, skipped: 0 };
  const affectedTables = new Set<string>();
  const schema = store.schema;
  const hasPropResolvers = schema.hasPropResolvers();
  const resolvedRecords: Array<{ table: string; record: Record<string, unknown> }> = [];

  for (const key of Object.keys(data)) {
    const rawValue = data[key];

    // Normalise to array.
    const records = Array.isArray(rawValue)
      ? rawValue
      : (rawValue && typeof rawValue === 'object' ? [rawValue] : []);

    // Pre-resolve name-based target for this key (may be undefined).
    const nameResolved = schema.resolveByName(key);
    if (schema.strict && !Array.isArray(rawValue) && (!rawValue || typeof rawValue !== 'object')) {
      throw new SilasError(`Unable to classify "${key}": expected an object or array of objects.`);
    }

    if (schema.strict && records.length === 0 && !nameResolved) {
      throw new SilasError(`Unable to classify "${key}": no schema table matches this response key.`);
    }

    for (let index = 0; index < records.length; index++) {
      const record = records[index];
      if (record === null || record === undefined || typeof record !== 'object' || Array.isArray(record)) {
        if (schema.strict) {
          throw new SilasError(`Unable to classify "${key}"[${index}]: expected a record object.`);
        }
        continue;
      }
      const rec = record as Record<string, unknown>;

      // 1. Try prop-based resolution first (more specific).
      let tableName: string | null = null;

      if (hasPropResolvers) {
        const propResolved = schema.resolveByProp(rec);
        if (propResolved) {
          tableName = propResolved.name;
        }
      }

      // 2. Fall back to name-based resolution.
      if (!tableName && nameResolved) {
        tableName = nameResolved.key;
      }

      // 3. Fallback for unregistered but plausible table names.
      if (!schema.strict && !tableName && /^[a-z_][a-z0-9_]*$/i.test(key)) {
        tableName = key;
      }

      if (!tableName) {
        if (schema.strict) {
          throw new SilasError(`Unable to classify "${key}"[${index}]: no schema table matched this record.`);
        }
        continue;
      }

      resolvedRecords.push({ table: tableName, record: rec });
    }
  }

  batch(() => {
    for (const { table, record } of resolvedRecords) {
      const change = store.upsert(table, record);
      changes.push({ table, ...change });
      affectedTables.add(table);

      switch (change.type) {
        case CT.INSERT:
          summary.inserts++;
          break;
        case CT.UPDATE:
          summary.updates++;
          break;
        case CT.DELETE:
          summary.deletes++;
          break;
        case CT.NONE:
          summary.skipped++;
          break;
      }
    }
  });

  return {
    changes,
    summary,
    tables: [...affectedTables],
  };
}

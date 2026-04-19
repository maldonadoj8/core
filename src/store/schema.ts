// =============================================================================
// @silas/core — Schema Definition
//
// Provides a type-safe way to define table structures for the Store.
//
// Supports two resolution strategies that can coexist in the same schema:
//   - **Name-based**: the response key maps directly to a table's external name.
//   - **Prop-based**: each record's `record[resolverProp]` is compared against
//     a table's `resolverValue` to route it. Any field name can be used as the
//     resolver property (e.g. 'id_entidad', 'type', 'categoria').
//
// Tables with `resolverProp` set are excluded from name-based resolution so
// both modes can work simultaneously on the same response payload.
// =============================================================================

import type { SchemaConfig } from './types.js';
import { invariant } from '../core/errors.js';

// ======================== RESOLVED TABLE =====================================

/** Internal resolved (normalised) config for a single table. */
export interface ResolvedTable {
  /** Internal table name (key in the `tables` map). */
  readonly name: string;
  /** External name as it appears in server responses. */
  readonly externalName: string;
  /** Primary key field. */
  readonly key: string;
  /** Version field (if any). */
  readonly version: string | undefined;
  /** Soft-delete field (if any). */
  readonly softDelete: string | false;
  /** Per-record resolver property (if any). */
  readonly resolverProp: string | undefined;
  /** Value to match against `resolverProp` (if any). */
  readonly resolverValue: string | number | boolean | undefined;
}

// ======================== SCHEMA CLASS =======================================

export class Schema {
  /** Resolved tables keyed by internal name. */
  private _tables = new Map<string, ResolvedTable>();

  /**
   * Reverse lookup: external name → internal table names.
   * Only includes tables WITHOUT `resolverProp` (name-based resolution).
   */
  private _nameMap = new Map<string, string>();

  /**
   * Tables that use prop-based resolution, grouped by resolverProp (property
   * name), then by resolverValue → ResolvedTable for O(1) lookup.
   */
  private _byResolverProp = new Map<string, Map<string | number | boolean, ResolvedTable>>();

  constructor(config: SchemaConfig) {
    invariant(
      config !== null && config !== undefined && typeof config === 'object' && !Array.isArray(config)
        && config.tables !== null && typeof config.tables === 'object' && !Array.isArray(config.tables),
      'Schema expects a config with a non-null, non-array "tables" object.',
    );

    for (const [key, tc] of Object.entries(config.tables)) {
      // Validate resolverProp / resolverValue pairing.
      if (tc.resolverProp != null && tc.resolverValue == null) {
        throw new Error(
          `Table "${key}": resolverProp "${tc.resolverProp}" requires resolverValue to be set.`,
        );
      }
      if (tc.resolverValue != null && tc.resolverProp == null) {
        throw new Error(
          `Table "${key}": resolverValue requires resolverProp to be set.`,
        );
      }

      const resolved: ResolvedTable = {
        name:          key,
        externalName:  tc.name ?? key,
        key:           tc.key ?? 'id',
        version:       tc.version,
        softDelete:    tc.softDelete ?? false,
        resolverProp:  tc.resolverProp,
        resolverValue: tc.resolverValue,
      };

      this._tables.set(key, resolved);

      if (resolved.resolverProp == null) {
        // Name-based resolution: register external name and internal key.
        const existingByName = this._nameMap.get(resolved.externalName);
        if (existingByName !== undefined && existingByName !== key) {
          throw new Error(
            `Table "${key}": external name "${resolved.externalName}" is already registered by table "${existingByName}".`,
          );
        }
        this._nameMap.set(resolved.externalName, key);
        // Also register internal key → itself (for direct access).
        if (resolved.externalName !== key) {
          this._nameMap.set(key, key);
        }
      } else {
        // Prop-based resolution: index by resolverProp → resolverValue.
        let valueMap = this._byResolverProp.get(resolved.resolverProp);
        if (!valueMap) {
          valueMap = new Map();
          this._byResolverProp.set(resolved.resolverProp, valueMap);
        }
        const existing = valueMap.get(resolved.resolverValue!);
        if (existing) {
          throw new Error(
            `Table "${key}": duplicate resolverProp "${resolved.resolverProp}" + resolverValue "${String(resolved.resolverValue)}" (already used by table "${existing.name}").`,
          );
        }
        valueMap.set(resolved.resolverValue!, resolved);
      }
    }
  }

  // ===================== Resolution methods ==================================

  /**
   * Given a key from the server response data (e.g. 'entrega' or 'usuario'),
   * resolve the internal table key and config via **name-based** resolution.
   *
   * Only considers tables without `resolverProp`.
   */
  resolveByName(externalName: string): { key: string; config: ResolvedTable } | undefined {
    const internalKey = this._nameMap.get(externalName);
    if (internalKey === undefined) return undefined;
    const config = this._tables.get(internalKey);
    if (!config) return undefined;
    return { key: internalKey, config };
  }

  /**
   * Given a record, resolve which table it belongs to via **prop-based**
   * resolution. Checks all `resolverProp` groups and matches the record's
   * `record[resolverProp]` against each table's `resolverValue`.
   *
   * Returns the first matching ResolvedTable, or undefined.
   */
  resolveByProp(record: Record<string, unknown>): ResolvedTable | undefined {
    for (const [prop, valueMap] of this._byResolverProp) {
      const value = record[prop];
      if (value == null) continue;
      const table = valueMap.get(value as string | number | boolean);
      if (table) return table;
    }
    return undefined;
  }

  // ===================== Table accessors =====================================

  /**
   * Get config for a known internal table key.
   */
  getTable(key: string): ResolvedTable | undefined {
    return this._tables.get(key);
  }

  /**
   * Get the primary key field for a table. Default: 'id'.
   */
  getKeyField(key: string): string {
    return this._tables.get(key)?.key ?? 'id';
  }

  /**
   * Get the version field for a table (if any).
   */
  getVersionField(key: string): string | undefined {
    return this._tables.get(key)?.version;
  }

  /**
   * Check if a record is soft-deleted.
   */
  isSoftDeleted(key: string, record: Record<string, unknown>): boolean {
    const config = this._tables.get(key);
    if (!config || config.softDelete === false || config.softDelete === undefined) {
      return false;
    }
    return !record[config.softDelete];
  }

  /**
   * Get all registered table keys.
   */
  tableKeys(): string[] {
    return [...this._tables.keys()];
  }

  /**
   * Check if a table key exists.
   */
  hasTable(key: string): boolean {
    return this._tables.has(key) || this._nameMap.has(key);
  }

  /**
   * Whether any table uses prop-based resolution.
   */
  hasPropResolvers(): boolean {
    return this._byResolverProp.size > 0;
  }
}

// ======================== PUBLIC API ========================================

/**
 * Define a schema for use with a Store.
 *
 * ```ts
 * // Name-based (default):
 * const schema = defineSchema({
 *   tables: {
 *     user: { key: 'id' },
 *     post: { key: 'id', version: 'updated_at' },
 *   }
 * });
 *
 * // Prop-based resolution (Weeii entity IDs):
 * const schema = defineSchema({
 *   tables: {
 *     entrega: { key: 'id', resolverProp: 'id_entidad', resolverValue: 31, softDelete: 'activo' },
 *     paquete: { key: 'id', resolverProp: 'id_entidad', resolverValue: 50, softDelete: 'activo' },
 *   }
 * });
 *
 * // Mixed (both modes in one schema):
 * const schema = defineSchema({
 *   tables: {
 *     deposito: { key: 'id' },
 *     entrega:  { key: 'id', resolverProp: 'id_entidad', resolverValue: 31 },
 *     paquete:  { key: 'id', resolverProp: 'id_entidad', resolverValue: 50 },
 *   }
 * });
 * ```
 */
export function defineSchema(config: SchemaConfig): Schema {
  return new Schema(config);
}

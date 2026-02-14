# @silas/core

Normalized, reactive data cache for REST APIs.

Feed multi-entity server responses into `store.classify()` and silas routes each record to the correct table using schema-driven resolution — by response key name, by a discriminator field on each record, or both simultaneously. Records are cached in an in-memory normalized store with version guards, soft-delete support, and cursor-based paginated views. React hooks provide property-level granular re-renders via ES6 Proxy tracking — components only update when the specific fields they read change.

Designed for backends that return heterogeneous payloads where records from different entity types arrive in a single response and need to be normalized, cached, and rendered with minimal overhead.

## Features

- **Proxy-based reactivity** — wrap any object with `proxify()` and subscribe to changes.
- **Property-level tracking** — components only re-render when the specific properties they read change, not on every mutation.
- **Scoped trackers** — each subscription owns an isolated `Tracker`, safe for concurrent renders, nesting, and aborted renders.
- **Two-layer granular filtering** — `useProxy` syncs tracked properties into the subscription system via `setTrackedProps`, enabling the flush handler to skip irrelevant callbacks at the notification level, with snapshot comparison as a fallback for the first mutation.
- **Configurable batching** — microtask (default), synchronous, or manual batch modes.
- **In-memory store** — schema-driven tables with insert/update/delete lifecycle, version guards, and soft-delete support.
- **Flexible classification** — feed raw server payloads into `store.classify()` to auto-route records. Supports **name-based** resolution (response key = table name) and **prop-based** resolution (`resolverProp` / `resolverValue` per table), both modes working simultaneously in the same schema.
- **Paginated collections** — cursor-based, bidirectional windowed views over store tables with reactive state tracking.
- **React hooks** — `useProxy`, `useRecord`, `useCollection`, `usePaginatedCollection`, `useQuery`, `useMutation` built on `useSyncExternalStore`.
- **Legacy compatibility** — drop-in replacement for the WeeiiWebSDK `obs.js` API.

## Installation

```bash
npm install @silas/core
```

React hooks require React 18+:

```bash
npm install react@^18
```

## Quick Start

### Core — Reactive Proxy

```ts
import { proxify, subscribe, batch } from '@silas/core';

const user = proxify({ name: 'Alice', age: 30 });

subscribe(user, () => {
  console.log('User changed:', user.name, user.age);
});

// Single change — notifies after microtask.
user.name = 'Bob';

// Batched changes — single notification.
batch(() => {
  user.name = 'Charlie';
  user.age = 31;
});
```

### Property-Level Tracking

Every subscription has a `track(fn)` method. Property reads inside `fn` are recorded so the subscription **only fires when those specific properties change**.

```ts
import { proxify, subscribe } from '@silas/core';

const user = proxify({ name: 'Alice', email: 'alice@test.com', age: 30 });

const sub = subscribe(user, () => {
  console.log('Name changed!');
});

// Tell the subscription which properties we care about.
sub.track(() => {
  console.log(user.name); // Records 'name'
});

user.email = 'new@test.com'; // ✅ No notification — email is not tracked.
user.age = 31;               // ✅ No notification — age is not tracked.
user.name = 'Bob';           // 🔔 Notification fires — name IS tracked.
```

You can also set tracked properties directly without a tracking function:

```ts
sub.setTrackedProps(new Set(['name', 'age']));
// Only mutations to 'name' or 'age' will fire the callback.
```

Tracking is **scoped per subscription** — each sub has its own isolated tracker. Nested `track()` calls use save/restore, so concurrent or interleaved renders never contaminate each other:

```ts
const subA = subscribe(proxy, cbA);
const subB = subscribe(proxy, cbB);

subA.track(() => {
  void proxy.name;       // subA tracks 'name'

  subB.track(() => {
    void proxy.email;    // subB tracks 'email' — does NOT affect subA
  });

  void proxy.age;        // subA also tracks 'age'
});
// subA → { name, age },  subB → { email }
```

### Deep Proxies

Pass `{ deep: true }` to automatically proxify nested plain objects:

```ts
const state = proxify({
  user: { name: 'Alice', address: { city: 'NYC' } },
  settings: { theme: 'dark' },
}, { deep: true });

// Nested access returns proxified objects.
state.user.address.city = 'LA'; // Triggers notification on the root proxy.
```

### Store — In-Memory Database

```ts
import { createStore, defineSchema } from '@silas/core/store';

const store = createStore({
  schema: defineSchema({
    tables: {
      user: { key: 'id', version: 'version' },
      post: { key: 'id', softDelete: 'activo' },
    },
  }),
});

// Insert
store.upsert('user', { id: 1, name: 'Alice', version: 1 });

// Update (version must be ≥ existing)
store.upsert('user', { id: 1, name: 'Alice Updated', version: 2 });

// Soft delete
store.upsert('post', { id: 10, title: 'Draft', activo: false });

// Classify a server payload — auto-routes to the correct tables.
store.classify({
  user: [
    { id: 2, name: 'Bob', version: 1 },
    { id: 3, name: 'Charlie', version: 1 },
  ],
  post: [
    { id: 11, title: 'Hello World', activo: true },
  ],
});

// Read
const alice = store.get('user', 1);
const allUsers = store.all('user');
const activeUsers = store.filter('user', u => u.activo !== false);
```

### Schema — Table Resolution Strategies

Tables can be resolved in two ways, both usable simultaneously within the same schema:

#### Name-Based Resolution (default)

The response key maps directly to the table name. This is the default when no `resolverProp` is set.

```ts
const schema = defineSchema({
  tables: {
    user: { key: 'id' },
    post: { key: 'id', version: 'updated_at' },
  },
});

// Response key "user" → table "user", key "post" → table "post".
store.classify({
  user: [{ id: 1, name: 'Alice' }],
  post: [{ id: 10, title: 'Hello' }],
});
```

#### Prop-Based Resolution

When the server returns records from multiple entity types under a **single response key** (e.g., `registro`), use `resolverProp` and `resolverValue` to route each record individually based on a discriminator field.

```ts
const schema = defineSchema({
  tables: {
    entrega: { key: 'id', resolverProp: 'id_entidad', resolverValue: 31, softDelete: 'activo' },
    paquete: { key: 'id', resolverProp: 'id_entidad', resolverValue: 50, softDelete: 'activo' },
  },
});

// All records arrive under "registro", but each has an `id_entidad` field
// that determines which table it belongs to.
store.classify({
  registro: [
    { id: 1, id_entidad: 31, titulo: 'Envío A' },   // → entrega
    { id: 2, id_entidad: 50, peso: 2.5 },            // → paquete
    { id: 3, id_entidad: 31, titulo: 'Envío B' },    // → entrega
  ],
});
```

Any field name and value type (string, number, boolean) can be used as the resolver:

```ts
const schema = defineSchema({
  tables: {
    notifEmail: { key: 'id', resolverProp: 'type', resolverValue: 'email' },
    notifSms:   { key: 'id', resolverProp: 'type', resolverValue: 'sms' },
  },
});
```

#### Mixed Resolution

Name-based and prop-based tables can coexist. Prop-based resolution takes priority per record — if a record matches a `resolverProp`, it goes to that table regardless of the response key. Unmatched records fall back to name-based resolution.

```ts
const schema = defineSchema({
  tables: {
    deposito: { key: 'id' },                                                    // name-based
    entrega:  { key: 'id', resolverProp: 'id_entidad', resolverValue: 31 },     // prop-based
    paquete:  { key: 'id', resolverProp: 'id_entidad', resolverValue: 50 },     // prop-based
  },
});

store.classify({
  deposito: [{ id: 100, monto: 500 }],                        // → deposito (by name)
  registro: [
    { id: 1, id_entidad: 31, titulo: 'Envío' },               // → entrega (by prop)
    { id: 2, id_entidad: 50, peso: 1.2 },                     // → paquete (by prop)
  ],
});
```

> **Note:** `classify` expects a **flat** `Record<string, unknown>` — each top-level key maps to an array of records.  If the server response is nested (e.g., `respuesta.datos`), unwrap it before classifying: `store.classify(respuesta.datos)`.

### Paginated Collections

Cursor-based, bidirectional windowed views over store tables. Multiple independent paginated views can exist for the same table (e.g., two scroll panels).

```ts
import { createStore, defineSchema } from '@silas/core/store';

const store = createStore({
  schema: defineSchema({
    tables: { entrega: { key: 'id' } },
  }),
});

// Create a paginated view.
const page = store.paginated<Entrega>('entrega');

// Add records from a descending fetch (e.g., newest first).
page.addPage(serverRecords, 'descending');

// Add a single new record at the top.
page.addRecord(newRecord, true);

// Read reactive state.
console.log(page.proxy.items);       // Proxified<Entrega>[]
console.log(page.proxy.count);       // number
console.log(page.proxy.cursorStart); // string | undefined
console.log(page.proxy.cursorEnd);   // string | undefined
console.log(page.proxy.hasMore);     // boolean

// Dispose when done.
store.disposePaginated(page);
```

Cursor utilities are also available as pure functions:

```ts
import { recalculateCursors, cursorFor } from '@silas/core/store';

const boundaries = recalculateCursors(records, 'id');
const cursor = cursorFor(boundaries, 'descending'); // → boundaries.end
```

### React — Hooks

#### `useProxy` — Property-Level Reactive Snapshots

`useProxy` returns a **tracking snapshot**. Only the properties your component reads during render are tracked — mutations to other properties are silently ignored.

```tsx
import { useProxy } from '@silas/core/react';

function UserCard({ user }: { user: Proxified<User> }) {
  const snap = useProxy(user);

  // This component reads `name` and `age`.
  // Mutations to `email`, `address`, etc. will NOT cause a re-render.
  return (
    <div>
      <h2>{snap.name}</h2>
      <p>Age: {snap.age}</p>
    </div>
  );
}
```

Under the hood:
1. A shallow snapshot is cached (plain object, not a proxy).
2. A tracking proxy records which properties your JSX reads.
3. On the first mutation, snapshot comparison filters irrelevant changes. The tracked properties are then synced into the subscription system via `setTrackedProps`.
4. On subsequent mutations, the flush handler pre-filters at the notification level — the callback is never even invoked for unrelated property changes.
5. The tracking proxy identity is stable (`useMemo`), so passing it to children doesn't cause extra renders.

#### `useRecord` — Single Record from Store

```tsx
import { useRecord } from '@silas/core/react';

function UserProfile({ store, userId }: Props) {
  const user = useRecord<User>(store, 'user', userId);
  if (!user) return <p>Not found</p>;
  return <h1>{user.name}</h1>;
}
```

#### `useCollection` — Table Subscription

```tsx
import { useCollection } from '@silas/core/react';

function UserList({ store }: Props) {
  const { items, count } = useCollection<User>(store, 'user');
  return (
    <ul>
      {items.map(u => <li key={u.id}>{u.name}</li>)}
      <p>{count} users</p>
    </ul>
  );
}
```

#### `usePaginatedCollection` — Paginated Table View

```tsx
import { usePaginatedCollection } from '@silas/core/react';

function EntregaList({ store }: Props) {
  const {
    items, count, hasMore,
    cursorFor, addPage, clear, setHasMore,
  } = usePaginatedCollection<Entrega>(store, 'entrega');

  const fetchMore = (dir: CursorDirection) =>
    api.listar({ id_ultimo: cursorFor(dir), filas: 20 })
      .then(res => {
        addPage(res.datos.entrega, dir);
        if (res.datos.entrega.length < 20) setHasMore(false);
      });

  return <InfiniteTable items={items} onScroll={fetchMore} />;
}
```

Returns reactive state (`items`, `count`, `cursorStart`, `cursorEnd`, `hasMore`) with property-level tracking, plus stable action functions (`addPage`, `addRecord`, `removeRecord`, `clear`, `setHasMore`, `cursorFor`). The underlying `PaginatedCollection` is created on mount and disposed on unmount.

#### `useQuery` — Async Data Fetching

```tsx
import { useQuery } from '@silas/core/react';

function Users({ api }: Props) {
  const { data, isLoading, error, refetch } = useQuery(
    () => api.fetchUsers(),
    [/* deps */],
  );

  if (isLoading) return <Spinner />;
  if (error) return <Error error={error} />;
  return <UserList users={data} />;
}
```

#### `useMutation` — Imperative Async Mutations

```tsx
import { useMutation } from '@silas/core/react';

function CreateUser({ api }: Props) {
  const { mutate, isLoading } = useMutation(
    (input) => api.createUser(input),
    { onSuccess: () => alert('Created!') },
  );

  return (
    <button disabled={isLoading} onClick={() => mutate({ name: 'New User' })}>
      Create
    </button>
  );
}
```

### Compat — Legacy WeeiiWebSDK API

Drop-in replacement for the `obs.js` module. Forces `sync` batch mode for backwards compatibility.

```ts
import Obs from '@silas/core/compat';

const obj = Obs.proxify({ count: 0 });
const ticket = Obs.sub(obj, () => console.log('changed'), 'counter', false, false);
obj.count = 1; // logs "changed"
Obs.desub(ticket);
```

## Subpath Exports

| Import               | Description                                    |
|----------------------|------------------------------------------------|
| `@silas/core`        | Core proxy + subscription + batching           |
| `@silas/core/store`  | Store, Schema, Collection, PaginatedCollection, classify, cursor |
| `@silas/core/react`  | React hooks                                    |
| `@silas/core/compat` | Legacy obs.js compatibility                    |

## Batch Modes

| Mode        | Behavior                                        |
|-------------|-------------------------------------------------|
| `microtask` | Default. Defers via `queueMicrotask`             |
| `sync`      | Immediate notification after every mutation      |
| `manual`    | Only notifies inside explicit `batch()` calls    |

```ts
import { setBatchMode } from '@silas/core';

setBatchMode('sync');       // Immediate notifications
setBatchMode('manual');     // Only explicit batch()
setBatchMode('microtask');  // Default — grouped by microtask
```

## Architecture

### Tracking System

The tracking system uses **scoped trackers** instead of global mutable state, with a two-layer approach in React:

```
Component render
  └─ useProxy(proxy)
       ├─ Returns a tracking proxy (stable identity via useMemo)
       ├─ Resets trackedRef at start of each render
       └─ Property reads during JSX → recorded in trackedRef
            │
            ▼
Proxy mutation (proxy.name = 'Bob')
  └─ markDirty(proxyId, 'name')
       └─ batch system → flush → handleFlush
            └─ For each subscription:
                 ├─ Has _trackedProps (set via setTrackedProps)?
                 │   ├─ Changed prop in tracked set? → fire callback
                 │   └─ Not in set? → skip entirely (pre-filter)
                 └─ No _trackedProps? → fire callback
                      └─ useProxy callback:
                           ├─ Calls setTrackedProps(tracked) → future flushes pre-filter
                           └─ Snapshot comparison (fallback for first mutation)
                                ├─ Relevant change? → onStoreChange → re-render
                                └─ Irrelevant?     → skip (no re-render)
```

Each `Subscription` owns a `Tracker` created via `createTracker()`. The `track(fn)` method activates the tracker during `fn` via a module-level `_activeTracker` variable with save/restore for nesting safety. The proxy's `get` trap calls `recordAccess(prop)`, which delegates to `_activeTracker` if active, or no-ops if outside a tracking window.

### Classification Pipeline

```
store.classify(payload)
  └─ classifyData(store, data)
       └─ For each key in data:
            └─ For each record in data[key]:
                 ├─ 1. Prop-based: schema.resolveByProp(record)
                 │      Match record[resolverProp] === table.resolverValue
                 │      ├─ Match found → route to that table
                 │      └─ No match → continue
                 ├─ 2. Name-based: schema.resolveByName(key)
                 │      ├─ Table registered with that name → route
                 │      └─ Not found → continue
                 └─ 3. Alphanumeric key fallback:
                        /^[a-z_][a-z0-9_]*$/i → ad-hoc table with key name
```

### Proxy Virtual Properties

Every proxified object exposes virtual properties intercepted by the proxy handler:

| Property       | Type      | Description                         |
|----------------|-----------|-------------------------------------|
| `__proxy_id`   | `string`  | Unique identifier for the proxy     |
| `__source`     | `object`  | Direct access to the underlying target (bypasses proxy) |
| `__is_proxy`   | `true`    | Guard for `isProxy()` checks        |

Setting `__source` performs an **atomic full replacement** — all properties are updated in a single batch.

## API Reference

### Core

| Export                     | Description                                                     |
|----------------------------|-----------------------------------------------------------------|
| `proxify(obj, opts?)`      | Create a reactive proxy. Options: `deep`, `batch`              |
| `isProxy(obj)`             | Check if an object is a Silas proxy                            |
| `subscribe(p, cb, opts?)`  | Subscribe to changes; returns `Subscription`                   |
| `unsubscribe(id)`          | Unsubscribe by ticket ID                                       |
| `batch(fn)`                | Group mutations for a single notification                      |
| `setBatchMode(mode)`       | Set global batch mode: `microtask`, `sync`, or `manual`        |

### Subscription Object

The object returned by `subscribe()`:

| Property / Method    | Type                                     | Description                                      |
|----------------------|------------------------------------------|--------------------------------------------------|
| `ticket`             | `string`                                 | Unique subscription ID                           |
| `target`             | `Proxified<T>`                           | The observed proxy                               |
| `once`               | `boolean`                                | Auto-unsubscribe after first notification        |
| `observer`           | `object \| null`                         | Optional observer reference                      |
| `callback`           | `SubscribeCallback<T>`                   | The notification handler                         |
| `unsubscribe()`      | `() => void`                             | Cancel this subscription                         |
| `track(fn)`          | `<R>(fn: () => R) => R`                  | Record property reads for granular notification  |
| `setTrackedProps(s)` | `(props: ReadonlySet<string>) => void`   | Directly set tracked properties                  |

### Subscribe Options

| Option      | Type             | Default | Description                           |
|-------------|------------------|---------|---------------------------------------|
| `once`      | `boolean`        | `false` | Auto-unsubscribe after first notify   |
| `immediate` | `boolean`        | `false` | Execute callback immediately on subscribe |
| `observer`  | `object \| null` | `null`  | Reference to subscribing object (debug) |

### Store

| Export                        | Description                                 |
|-------------------------------|---------------------------------------------|
| `createStore(opts)`           | Create a new Store instance                 |
| `defineSchema(config)`        | Define a table schema                       |
| `classifyData(store, data)`   | Classify a raw payload into a store         |
| `Collection`                  | Observable collection class for a table     |
| `PaginatedCollection`         | Cursor-based paginated view class           |
| `recalculateCursors(recs, k)` | Pure function: compute start/end cursors    |
| `cursorFor(bounds, dir)`      | Pure function: get cursor for a direction   |
| `ChangeType`                  | Enum: `NONE`, `INSERT`, `UPDATE`, `DELETE`  |

### Schema Configuration

| `TableConfig` Property | Type                          | Default      | Description                           |
|------------------------|-------------------------------|--------------|---------------------------------------|
| `key`                  | `string`                      | `'id'`       | Primary key field                     |
| `version`              | `string`                      | `undefined`  | Version field for optimistic concurrency |
| `softDelete`           | `string \| false`             | `false`      | Field name; falsy value = deleted     |
| `name`                 | `string`                      | table key    | External name in server responses     |
| `resolverProp`         | `string`                      | `undefined`  | Record property for prop-based routing |
| `resolverValue`        | `string \| number \| boolean` | `undefined`  | Value to match against `resolverProp` |

`resolverProp` and `resolverValue` must be set together. Tables with `resolverProp` are excluded from name-based resolution.

### Store Instance

| Method                         | Description                                       |
|--------------------------------|---------------------------------------------------|
| `store.get(table, id)`         | Get a single proxified record                     |
| `store.all(table)`             | Get all records in a table                        |
| `store.filter(table, fn)`      | Filter records with a predicate                   |
| `store.find(table, fn)`        | Find first record matching a predicate            |
| `store.count(table)`           | Count records in a table                          |
| `store.upsert(table, data)`    | Insert or update a record                         |
| `store.remove(table, id)`      | Remove a record by ID                             |
| `store.classify(payload)`      | Auto-route a flat payload to tables by schema     |
| `store.collection(table)`      | Get/create the reactive collection for a table    |
| `store.paginated(table)`       | Create a new paginated view over a table          |
| `store.disposePaginated(pc)`   | Dispose a paginated view                          |
| `store.clear(table?)`          | Clear one table or all tables                     |

### React Hooks

| Hook                                | Description                                              |
|-------------------------------------|----------------------------------------------------------|
| `useProxy(proxy)`                   | Property-tracked reactive snapshot                       |
| `useRecord(store, table, id)`       | Single record from store; re-renders on changes          |
| `useCollection(store, table)`       | Subscribe to table collection (`items` + `count`)        |
| `usePaginatedCollection(store, t)`  | Paginated view with cursor actions and reactive state    |
| `useQuery(fn, deps, opts?)`         | Async fetching with `isLoading`, `error`, `data`         |
| `useMutation(fn, opts?)`            | Imperative async mutation with loading state             |

### Types

| Type                          | Description                                          |
|-------------------------------|------------------------------------------------------|
| `Proxified<T>`                | A proxified object: `T & ProxyMeta`                  |
| `ProxyMeta`                   | Virtual properties: `__proxy_id`, `__source`, `__is_proxy` |
| `ProxifyOptions`              | Options for `proxify()`: `deep`, `batch`             |
| `Tracker`                     | Scoped property tracker: `record()`, `props()`, `reset()` |
| `Subscription<T>`             | Live subscription with `track()`, `setTrackedProps()`, and `unsubscribe()` |
| `SubscribeCallback<T>`        | `(value, subscription) => boolean \| void`           |
| `SubscribeOptions`            | Options for `subscribe()`: `once`, `immediate`, `observer` |
| `BatchMode`                   | `'microtask' \| 'sync' \| 'manual'`                 |
| `TableConfig`                 | Per-table schema configuration                       |
| `SchemaConfig`                | Full schema definition (`{ tables }`)                |
| `ResolvedTable`               | Normalized internal table config returned by schema  |
| `CollectionState<T>`          | `{ items, count }` for observable collections        |
| `PaginatedState<T>`           | `{ items, count, cursorStart, cursorEnd, hasMore }`  |
| `CursorDirection`             | `'ascending' \| 'descending'`                        |
| `CursorBoundaries`            | `{ start, end }` boundary values                    |
| `ChangeType`                  | Enum: `NONE`, `INSERT`, `UPDATE`, `DELETE`           |
| `ChangeRecord<T>`             | `{ type, record, previous? }`                        |
| `ClassifyResult`              | `{ changes, summary, tables }`                       |
| `UseQueryResult<T>`           | `{ data, isLoading, error, refetch }`                |
| `UseMutationResult<T, V>`     | `{ mutate, mutateAsync, data, isLoading, error, reset }` |
| `UsePaginatedCollectionResult<T>` | Full return type of `usePaginatedCollection`     |

## License

MIT © Silas

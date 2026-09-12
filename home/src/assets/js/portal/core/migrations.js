/*
Author       : OM Academy
Description  : Schema migrations for the portal store. When a collection's shape changes, bump SCHEMA_VERSION in
               store.js and add migrations[<new version>] = ({ get, set }) => { ... } here. get(name) returns the raw
               stored value (or undefined); set(name, value) writes it. Migrations run in order on boot and on import.
*/

export const migrations = {
  // 2: ({ get, set }) => { const users = get("users") || []; set("users", users.map((u) => ({ ...u, prefs: u.prefs || {} }))); },
};

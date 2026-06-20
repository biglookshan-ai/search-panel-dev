// Generic metaobject management — works for any type by reading its definition.
// Every function takes ctx = { shop, token }.
import { graphql } from './shopify.js';

// List ALL definitions and match by type — more reliable than
// metaobjectDefinitionByType (which can return null) and lets us surface the
// store's actual type handles for debugging.
export async function getAllDefinitions(ctx) {
  const data = await graphql(ctx,
    `query{ metaobjectDefinitions(first:50){ nodes{
      id type name fieldDefinitions{ key name required type{ name } }
    } } }`
  );
  return data.metaobjectDefinitions?.nodes || [];
}

export async function getDefinition(ctx, type) {
  const all = await getAllDefinitions(ctx);
  return all.find((d) => d.type === type) || null;
}

// Which scopes the current access token actually has (to diagnose access issues).
export async function getGrantedScopes(ctx) {
  const data = await graphql(ctx, `query{ currentAppInstallation{ accessScopes{ handle } } }`);
  return (data.currentAppInstallation?.accessScopes || []).map((s) => s.handle);
}

// Map a metaobject field type name → UI input kind.
export function kindFromType(typeName = '') {
  if (typeName === 'boolean') return 'bool';
  if (typeName.startsWith('list.')) return 'list';
  if (typeName === 'color') return 'color';
  if (typeName.includes('reference') || typeName.includes('file')) return 'ref';
  return 'text';
}

// When the definition isn't visible (external apps can't read non-owned
// definitions), infer the fields/kinds from existing entries' values.
export function inferFields(entries) {
  const keys = [];
  const seen = new Set();
  for (const e of entries) {
    for (const k of Object.keys(e.fields || {})) {
      if (!seen.has(k)) { seen.add(k); keys.push(k); }
    }
  }
  return keys.map((key) => {
    let kind = 'text';
    for (const e of entries) {
      const v = e.fields?.[key];
      if (v == null || v === '') continue;
      if (v === 'true' || v === 'false') kind = 'bool';
      else if (/^\s*\[/.test(v)) kind = 'list';
      else if (/^#[0-9a-fA-F]{3,8}$/.test(v.trim())) kind = 'color';
      else if (/^gid:\/\//.test(v.trim())) kind = 'ref';
      else kind = 'text';
      break;
    }
    const name = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return { key, name, kind };
  });
}

// Directly probe access to a type's entries — surfaces Shopify's exact error.
export async function probeType(ctx, type) {
  try {
    const d = await graphql(ctx, `query($t:String!){ metaobjects(type:$t, first:1){ nodes{ id } } }`, { t: type });
    return { type, ok: true, count: (d.metaobjects?.nodes || []).length };
  } catch (e) {
    return { type, ok: false, error: String(e.message || e) };
  }
}

export async function listEntries(ctx, type) {
  const data = await graphql(ctx,
    `query($type:String!){
      metaobjects(type:$type, first:100){
        nodes{ id handle displayName fields{ key value } }
      }
    }`,
    { type }
  );
  return (data.metaobjects?.nodes || []).map((n) => ({
    id: n.id,
    handle: n.handle,
    displayName: n.displayName,
    fields: Object.fromEntries((n.fields || []).map((f) => [f.key, f.value])),
  }));
}

export async function createEntry(ctx, type, fields) {
  const input = { type, fields: toFieldArray(fields) };
  const data = await graphql(ctx,
    `mutation($input:MetaobjectCreateInput!){
      metaobjectCreate(metaobject:$input){ metaobject{ id handle } userErrors{ field message } }
    }`,
    { input }
  );
  throwUserErrors(data.metaobjectCreate);
  return data.metaobjectCreate.metaobject;
}

export async function updateEntry(ctx, id, fields) {
  const input = { fields: toFieldArray(fields) };
  const data = await graphql(ctx,
    `mutation($id:ID!,$input:MetaobjectUpdateInput!){
      metaobjectUpdate(id:$id, metaobject:$input){ metaobject{ id } userErrors{ field message } }
    }`,
    { id, input }
  );
  throwUserErrors(data.metaobjectUpdate);
  return data.metaobjectUpdate.metaobject;
}

export async function deleteEntry(ctx, id) {
  const data = await graphql(ctx,
    `mutation($id:ID!){ metaobjectDelete(id:$id){ deletedId userErrors{ field message } } }`,
    { id }
  );
  throwUserErrors(data.metaobjectDelete);
  return data.metaobjectDelete.deletedId;
}

function toFieldArray(fields) {
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([key, value]) => ({ key, value: String(value) }));
}
function throwUserErrors(payload) {
  const errs = payload?.userErrors || [];
  if (errs.length) throw new Error(errs.map((e) => `${e.field}: ${e.message}`).join('; '));
}

// Generic metaobject management — works for any type by reading its definition,
// so cgp_badge / cgp_sort_rule / search_panel are all handled the same way.
import { graphql } from './shopify.js';

export async function getDefinition(type) {
  const data = await graphql(
    `query($type:String!){
      metaobjectDefinitionByType(type:$type){
        id name type
        fieldDefinitions{ key name required type{ name } }
      }
    }`,
    { type }
  );
  return data.metaobjectDefinitionByType;
}

export async function listEntries(type) {
  const data = await graphql(
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

// fields: { key: value, ... } (values must be strings; list fields = JSON string).
export async function createEntry(type, fields) {
  const input = { type, fields: toFieldArray(fields) };
  const data = await graphql(
    `mutation($input:MetaobjectCreateInput!){
      metaobjectCreate(metaobject:$input){ metaobject{ id handle } userErrors{ field message } }
    }`,
    { input }
  );
  throwUserErrors(data.metaobjectCreate);
  return data.metaobjectCreate.metaobject;
}

export async function updateEntry(id, fields) {
  const input = { fields: toFieldArray(fields) };
  const data = await graphql(
    `mutation($id:ID!,$input:MetaobjectUpdateInput!){
      metaobjectUpdate(id:$id, metaobject:$input){ metaobject{ id } userErrors{ field message } }
    }`,
    { id, input }
  );
  throwUserErrors(data.metaobjectUpdate);
  return data.metaobjectUpdate.metaobject;
}

export async function deleteEntry(id) {
  const data = await graphql(
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

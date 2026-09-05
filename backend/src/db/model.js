import { getSb } from './supabase.js';

const PAGE = 1000;
const IN_CHUNK = 120;
const INTERNAL = Symbol('model');

function colName(key) {
  return key === '_id' ? 'id' : key;
}

function asId(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value.id || value._id || null;
  return String(value);
}

function toIso(value) {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function regexToIlike(rx) {
  const src = rx instanceof RegExp ? rx.source : String(rx);
  const safe = src
    .replace(/\\s\+/g, '%')
    .replace(/\\[.*+?^${}()|[\]\\]/g, '')
    .replace(/[%_,.()]/g, '')
    .replace(/\s+/g, '%');
  return `%${safe}%`;
}

function isPlainOp(value) {
  return (
    value
    && typeof value === 'object'
    && !(value instanceof Date)
    && !(value instanceof RegExp)
    && !Array.isArray(value)
    && ('$in' in value || '$ne' in value || '$gte' in value || '$gt' in value || '$lte' in value || '$lt' in value)
  );
}

export function dbError(error) {
  const err = new Error(error?.message || 'Database error');
  err.code = error?.code === '23505' ? 11000 : error?.code;
  err.details = error?.details;
  return err;
}

function throwIf(error) {
  if (!error) return;
  if (error.code === '22P02') {
    const err = new Error(error.message);
    err.code = '22P02';
    throw err;
  }
  throw dbError(error);
}

function parseSelect(select) {
  if (!select || typeof select !== 'string') return { mode: 'all' };
  const parts = select.split(/\s+/).filter(Boolean);
  const exclude = parts.filter((p) => p.startsWith('-')).map((p) => p.slice(1));
  const include = parts.filter((p) => !p.startsWith('-'));
  if (exclude.length) return { mode: 'exclude', fields: exclude };
  return { mode: 'include', fields: include };
}

function applySimpleFilters(query, filter) {
  if (!filter) return query;
  let q = query;

  if (filter.$or?.length) {
    const parts = filter.$or
      .map((clause) => {
        const [key, val] = Object.entries(clause)[0] || [];
        if (!key) return null;
        const col = colName(key);
        if (val instanceof RegExp) return `${col}.ilike.${regexToIlike(val)}`;
        if (val == null) return `${col}.is.null`;
        return `${col}.eq.${val}`;
      })
      .filter(Boolean);
    if (parts.length) q = q.or(parts.join(','));
  }

  for (const [key, val] of Object.entries(filter)) {
    if (key === '$or') continue;
    const col = colName(key);
    if (val == null) {
      q = q.is(col, null);
      continue;
    }
    if (val instanceof RegExp) {
      q = q.ilike(col, regexToIlike(val));
      continue;
    }
    if (isPlainOp(val)) {
      if (val.$in) q = q.in(col, val.$in.map(asId).filter(Boolean));
      if (val.$ne !== undefined) {
        q = val.$ne == null ? q.not(col, 'is', null) : q.neq(col, asId(val.$ne) ?? val.$ne);
      }
      if (val.$gte !== undefined) q = q.gte(col, toIso(val.$gte));
      if (val.$gt !== undefined) q = q.gt(col, toIso(val.$gt));
      if (val.$lte !== undefined) q = q.lte(col, toIso(val.$lte));
      if (val.$lt !== undefined) q = q.lt(col, toIso(val.$lt));
      continue;
    }
    q = q.eq(col, key === '_id' || col === 'id' ? asId(val) : val);
  }
  return q;
}

function findInKey(filter) {
  if (!filter) return null;
  for (const [key, val] of Object.entries(filter)) {
    if (key === '$or') continue;
    if (isPlainOp(val) && Array.isArray(val.$in)) return { key, ids: val.$in.map(asId).filter(Boolean) };
  }
  return null;
}

function applySort(query, sort) {
  if (!sort) return query;
  let q = query;
  for (const [key, dir] of Object.entries(sort)) {
    q = q.order(colName(key), { ascending: dir !== -1 && dir !== 'desc' });
  }
  return q;
}

function selectClause(selectSpec) {
  if (selectSpec.mode === 'include') {
    const cols = new Set(['id', ...selectSpec.fields.map(colName)]);
    return [...cols].join(',');
  }
  return '*';
}

function stripSelect(row, selectSpec) {
  if (selectSpec.mode !== 'exclude') return row;
  const copy = { ...row };
  for (const field of selectSpec.fields) delete copy[field];
  return copy;
}

export function createModel(config) {
  const {
    table,
    fields,
    uuidFields = [],
    dateFields = ['createdAt', 'updatedAt'],
    jsonFields = [],
    arrayFields = [],
    methods = {},
    statics = {},
    virtuals = {},
    prepare,
  } = config;

  const uuidSet = new Set(uuidFields);
  const dateSet = new Set(dateFields);
  const jsonSet = new Set(jsonFields);
  const arraySet = new Set(arrayFields);

  function hydrateRow(row) {
    if (!row) return null;
    const out = { ...row, _id: row.id };
    for (const key of dateSet) {
      if (out[key]) out[key] = new Date(out[key]);
    }
    for (const key of jsonSet) {
      if (out[key] == null) out[key] = key === 'refreshTokens' ? [] : {};
    }
    for (const key of arraySet) {
      if (out[key] == null) out[key] = [];
    }
    if (Array.isArray(out.refreshTokens)) {
      out.refreshTokens = out.refreshTokens.map((t) => ({
        ...t,
        expiresAt: t.expiresAt ? new Date(t.expiresAt) : t.expiresAt,
      }));
    }
    return out;
  }

  function serialize(doc, { forInsert = false } = {}) {
    const src = doc && typeof doc === 'object' ? doc : {};
    if (prepare) prepare(src);
    const row = {};
    for (const field of fields) {
      if (field === 'id' || field === '_id') continue;
      if (!(field in src) && !forInsert) continue;
      let value = src[field];
      if (value === undefined) {
        if (forInsert) continue;
        continue;
      }
      if (uuidSet.has(field)) value = asId(value);
      if (dateSet.has(field)) value = value === '' ? null : toIso(value);
      if (field === 'email' && value === '') value = null;
      if (field === 'joinCode' && value === '') value = null;
      row[field] = value;
    }
    return row;
  }

  function toObject(doc) {
    const obj = { id: doc.id, _id: doc.id };
    for (const field of fields) {
      if (field === 'id') continue;
      obj[field] = doc[field];
    }
    for (const [name, getter] of Object.entries(virtuals)) {
      obj[name] = getter.call(doc);
    }
    return obj;
  }

  class Doc {
    constructor(data) {
      this[INTERNAL] = model;
      Object.assign(this, data);
      this.id = data.id;
      this._id = data.id;
    }

    async save() {
      return model.saveDoc(this);
    }

    toObject() {
      return toObject(this);
    }

    toJSON() {
      return toObject(this);
    }
  }

  for (const [name, fn] of Object.entries(methods)) {
    Doc.prototype[name] = fn;
  }

  function wrap(row, selectSpec = { mode: 'all' }) {
    if (!row) return null;
    return new Doc(stripSelect(hydrateRow(row), selectSpec));
  }

  function wrapLean(row, selectSpec = { mode: 'all' }) {
    if (!row) return null;
    const data = stripSelect(hydrateRow(row), selectSpec);
    return { ...data, id: data.id, _id: data.id };
  }

  class Query {
    constructor(filter = {}, { single = false } = {}) {
      this.filter = filter || {};
      this.single = single;
      this._sort = null;
      this._limit = null;
      this._select = null;
      this._lean = false;
    }

    sort(spec) {
      this._sort = spec;
      return this;
    }

    limit(n) {
      this._limit = Number(n);
      return this;
    }

    select(fields) {
      this._select = fields;
      return this;
    }

    lean() {
      this._lean = true;
      return this;
    }

    then(onFulfilled, onRejected) {
      return this.exec().then(onFulfilled, onRejected);
    }

    async exec() {
      const inInfo = findInKey(this.filter);
      if (inInfo && inInfo.ids.length === 0) return this.single ? null : [];

      const selectSpec = parseSelect(this._select);
      const cols = selectClause(selectSpec);
      const sb = getSb();

      const runPage = (builder, from, to) => applySort(applySimpleFilters(builder, this.filter), this._sort).range(from, to);

      async function fetchChunked() {
        const filterWithoutIn = { ...this.filter };
        delete filterWithoutIn[inInfo.key];
        const rows = [];
        for (let i = 0; i < inInfo.ids.length; i += IN_CHUNK) {
          const ids = inInfo.ids.slice(i, i + IN_CHUNK);
          const filter = { ...filterWithoutIn, [inInfo.key]: { $in: ids } };
          let from = 0;
          while (true) {
            const { data, error } = await applySort(
              applySimpleFilters(sb.from(table).select(cols), filter),
              this._sort
            ).range(from, from + PAGE - 1);
            if (error?.code === '22P02') break;
            throwIf(error);
            rows.push(...(data || []));
            if (!data || data.length < PAGE) break;
            from += PAGE;
          }
        }
        return rows;
      }

      async function fetchPaged() {
        const rows = [];
        let from = 0;
        const max = this._limit && !this.single ? this._limit : Infinity;
        while (rows.length < max) {
          const to = from + Math.min(PAGE, max - rows.length) - 1;
          const { data, error } = await runPage(sb.from(table).select(cols), from, to);
          if (error?.code === '22P02') return [];
          throwIf(error);
          rows.push(...(data || []));
          if (!data || data.length < to - from + 1) break;
          from += PAGE;
        }
        return rows;
      }

      if (this.single && !(inInfo && inInfo.ids.length > IN_CHUNK)) {
        const { data, error } = await applySort(
          applySimpleFilters(sb.from(table).select(cols), this.filter),
          this._sort
        ).limit(1);
        if (error?.code === '22P02') return null;
        throwIf(error);
        const row = data?.[0] || null;
        return this._lean ? wrapLean(row, selectSpec) : wrap(row, selectSpec);
      }

      const needsChunk = inInfo && inInfo.ids.length > IN_CHUNK;
      let rows;
      try {
        rows = needsChunk ? await fetchChunked.call(this) : await fetchPaged.call(this);
      } catch (err) {
        if (err.code === '22P02') return this.single ? null : [];
        throw err;
      }

      if (needsChunk && this._sort) {
        const entries = Object.entries(this._sort);
        rows.sort((a, b) => {
          for (const [key, dir] of entries) {
            const av = a[colName(key)];
            const bv = b[colName(key)];
            if (av < bv) return dir === -1 || dir === 'desc' ? 1 : -1;
            if (av > bv) return dir === -1 || dir === 'desc' ? -1 : 1;
          }
          return 0;
        });
      }

      if (this.single) {
        const row = rows[0] || null;
        return this._lean ? wrapLean(row, selectSpec) : wrap(row, selectSpec);
      }
      if (this._limit) rows = rows.slice(0, this._limit);
      return rows.map((row) => (this._lean ? wrapLean(row, selectSpec) : wrap(row, selectSpec)));
    }
  }

  const model = {
    table,
    find(filter = {}) {
      return new Query(filter, { single: false });
    },
    findOne(filter = {}) {
      return new Query(filter, { single: true });
    },
    findById(id) {
      return new Query({ _id: id }, { single: true });
    },
    async create(doc) {
      const row = serialize(doc, { forInsert: true });
      const { data, error } = await getSb().from(table).insert(row).select().single();
      throwIf(error);
      return wrap(data);
    },
    async insertMany(docs) {
      if (!docs?.length) return [];
      const rows = docs.map((doc) => serialize(doc, { forInsert: true }));
      const created = [];
      for (let i = 0; i < rows.length; i += 400) {
        const chunk = rows.slice(i, i + 400);
        const { data, error } = await getSb().from(table).insert(chunk).select();
        if (error?.code === '23505') {
          for (const row of chunk) {
            const one = await getSb().from(table).insert(row).select().single();
            if (!one.error) created.push(wrap(one.data));
          }
          continue;
        }
        throwIf(error);
        created.push(...(data || []).map((row) => wrap(row)));
      }
      return created;
    },
    async exists(filter) {
      const { data, error } = await applySimpleFilters(getSb().from(table).select('id'), filter).limit(1);
      if (error?.code === '22P02') return false;
      throwIf(error);
      return Boolean(data?.length);
    },
    async countDocuments(filter = {}) {
      const { count, error } = await applySimpleFilters(
        getSb().from(table).select('id', { count: 'exact', head: true }),
        filter
      );
      if (error?.code === '22P02') return 0;
      throwIf(error);
      return count || 0;
    },
    async deleteMany(filter) {
      if (!filter || !Object.keys(filter).length) {
        throw new Error(`Refusing to delete all rows from ${table}`);
      }
      const { error } = await applySimpleFilters(getSb().from(table).delete(), filter);
      throwIf(error);
    },
    async updateMany(filter, update) {
      const patch = update.$set ? { ...update.$set } : { ...update };
      delete patch.$set;
      delete patch.$inc;
      const row = serialize(patch);
      row.updatedAt = new Date().toISOString();
      const { error } = await applySimpleFilters(getSb().from(table).update(row), filter);
      throwIf(error);
    },
    async findOneAndUpdate(filter, update, options = {}) {
      const doc = await this.findOne(filter);
      if (!doc) return null;
      if (update.$set) Object.assign(doc, update.$set);
      if (update.$inc) {
        for (const [key, amount] of Object.entries(update.$inc)) {
          doc[key] = (Number(doc[key]) || 0) + amount;
        }
      }
      for (const [key, value] of Object.entries(update)) {
        if (key.startsWith('$')) continue;
        doc[key] = value;
      }
      await doc.save();
      return options.new === false ? doc : doc;
    },
    async findByIdAndUpdate(id, update) {
      return this.findOneAndUpdate({ _id: id }, update, { new: true });
    },
    async saveDoc(doc) {
      const now = new Date().toISOString();
      if (!doc.id) {
        const row = serialize(doc, { forInsert: true });
        row.updatedAt = now;
        const { data, error } = await getSb().from(table).insert(row).select().single();
        throwIf(error);
        Object.assign(doc, hydrateRow(data));
        doc._id = doc.id;
        return doc;
      }
      const row = serialize(doc);
      row.updatedAt = now;
      const { data, error } = await getSb().from(table).update(row).eq('id', doc.id).select().single();
      throwIf(error);
      Object.assign(doc, hydrateRow(data));
      doc._id = doc.id;
      return doc;
    },
    async syncIndexes() {
      return true;
    },
  };

  Object.assign(model, statics);
  return model;
}

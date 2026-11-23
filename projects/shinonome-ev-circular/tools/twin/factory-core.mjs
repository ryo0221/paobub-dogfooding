// packages/factory-core/src/model.ts
var FACTORY_SCHEMA = 1;
var factoryDistributionTypes = Object.freeze([
  "const",
  "uniform",
  "triangular",
  "normal",
  "lognormal",
  "exponential",
  "empirical"
]);
var factoryExitStrategies = Object.freeze([
  "cyclic",
  "first-free",
  "least-busy"
]);
var factoryObjectKinds = Object.freeze([
  "source",
  "station",
  "parallel",
  "assembly",
  "buffer",
  "conveyor",
  "drain"
]);
var factorySensorSignals = Object.freeze([
  "occupied",
  "ready",
  "blocked",
  "full",
  "failed"
]);
var factoryActuatorSignals = Object.freeze([
  "run",
  "release",
  "admit"
]);
var factoryFactorKinds = Object.freeze([
  "buffer-capacity",
  "parallel-count",
  "fleet-count",
  "pool-count",
  "time-scale"
]);
var factoryLimits = Object.freeze({
  products: 50,
  objects: 500,
  links: 2e3,
  productTimes: 50,
  mix: 50,
  components: 20,
  componentCount: 100,
  empiricalValues: 1e3,
  parallelCount: 100,
  bufferCapacity: 1e5,
  /** One year. */
  maxTimeMs: 31536e6,
  maxLengthMm: 1e7,
  maxSpeedMmS: 1e5,
  /**
   * One simulation run stops with `event-limit` after this many events. #17: a year of a busy
   * line takes hundreds of millions; such a run is handled in slices (`startFactoryRun`).
   */
  events: 1e9,
  calendars: 20,
  workerPools: 50,
  pathNodes: 2e3,
  pathSegments: 4e3,
  fleets: 20,
  vehiclesPerFleet: 200,
  workersPerPool: 1e3,
  skills: 20,
  shifts: 50,
  /** FT6: wired signals of each kind, and scans in one run. */
  signals: 500,
  scans: 5e6,
  /** FT5: initial safety limits of an experiment. */
  replications: 100,
  experimentCombinations: 200,
  experimentFactors: 5,
  factorValues: 20,
  timeScalePercent: 1e3,
  idCodePoints: 128,
  nameCodePoints: 256,
  retiredIds: 1e4,
  /** FT6: deep enough for a ladder program at its own nesting limit (16) under `control`. */
  jsonDepth: 40
});
var FactoryValidationError = class extends Error {
  constructor(code, message, diagnostics = []) {
    super(message);
    this.code = code;
    this.diagnostics = diagnostics;
    this.name = "FactoryValidationError";
  }
};
function newFactory(name) {
  return {
    schemaVersion: FACTORY_SCHEMA,
    name,
    products: [{ id: "part", name: "Part" }],
    objects: [],
    links: [],
    run: { durationMs: 8 * 36e5, seed: 1 }
  };
}

// packages/factory-core/src/random.ts
function hash32(seed, text2) {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < text2.length; i++) {
    h ^= text2.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
var FactoryRandom = class {
  a;
  b;
  c;
  d;
  constructor(seed, stream) {
    this.a = hash32(seed, `a:${stream}`);
    this.b = hash32(seed, `b:${stream}`);
    this.c = hash32(seed, `c:${stream}`);
    this.d = 1;
    for (let i = 0; i < 12; i++) this.next();
  }
  /** Uniform in [0, 1). */
  next() {
    const t = (this.a + this.b | 0) + this.d | 0;
    this.d = this.d + 1 | 0;
    this.a = this.b ^ this.b >>> 9;
    this.b = this.c + (this.c << 3) | 0;
    this.c = this.c << 21 | this.c >>> 11;
    this.c = this.c + t | 0;
    return (t >>> 0) / 4294967296;
  }
  /** Uniform in (0, 1). */
  open() {
    let u = this.next();
    while (u === 0) u = this.next();
    return u;
  }
  standardNormal() {
    return Math.sqrt(-2 * Math.log(this.open())) * Math.cos(2 * Math.PI * this.next());
  }
  /** Index into `weights` with probability proportional to the weight (all ≥ 0, sum > 0). */
  pick(weights) {
    const total = weights.reduce((s2, w) => s2 + w, 0);
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }
};
function sampleDistribution(d, rng) {
  let v;
  switch (d.type) {
    case "const":
      v = d.value;
      break;
    case "uniform":
      v = d.min + (d.max - d.min) * rng.next();
      break;
    case "triangular": {
      const u = rng.next();
      const span = d.max - d.min;
      const f = span === 0 ? 0 : (d.mode - d.min) / span;
      v = u < f ? d.min + Math.sqrt(u * span * (d.mode - d.min)) : d.max - Math.sqrt((1 - u) * span * (d.max - d.mode));
      break;
    }
    case "normal": {
      const lo = d.min ?? 0;
      const hi = d.max ?? Infinity;
      v = d.mean + d.sd * rng.standardNormal();
      for (let i = 1; i < 100 && (v < lo || v > hi); i++) v = d.mean + d.sd * rng.standardNormal();
      v = Math.min(hi, Math.max(lo, v));
      break;
    }
    case "lognormal": {
      const s2 = Math.log(1 + d.sd * d.sd / (d.mean * d.mean));
      const mu = Math.log(d.mean) - s2 / 2;
      v = Math.exp(mu + Math.sqrt(s2) * rng.standardNormal());
      break;
    }
    case "exponential":
      v = -d.mean * Math.log(1 - rng.next());
      break;
    case "empirical":
      v = d.values[rng.pick(d.values.map((x) => x.weight))].value;
      break;
  }
  return Math.max(0, Math.round(v));
}
function distributionMean(d) {
  switch (d.type) {
    case "const":
      return d.value;
    case "uniform":
      return (d.min + d.max) / 2;
    case "triangular":
      return (d.min + d.mode + d.max) / 3;
    case "normal":
    case "lognormal":
    case "exponential":
      return d.mean;
    case "empirical": {
      const total = d.values.reduce((s2, x) => s2 + x.weight, 0);
      return d.values.reduce((s2, x) => s2 + x.value * x.weight / total, 0);
    }
  }
}

// packages/ladder-core/src/model.ts
var ladderTypes = ["BOOL", "INT", "TIME", "TON", "TOF", "TP", "CTU", "CTD"];
var ladderTimerTypes = ["TON", "TOF", "TP"];
var ladderCounterTypes = ["CTU", "CTD"];
var ladderRoles = ["input", "output", "internal"];
var ladderContactKinds = ["no", "nc", "rising", "falling"];
var ladderCompareOps = ["eq", "ne", "gt", "ge", "lt", "le"];
var ladderCoilKinds = ["normal", "negated", "set", "reset"];
var ladderLimits = Object.freeze({
  variables: 1e3,
  rungs: 500,
  nodesPerRung: 200,
  depth: 16,
  nameLength: 64,
  commentLength: 1e3
});

// packages/ladder-core/src/validate.ts
var identifier = /^(?:[A-Za-z]|_[A-Za-z0-9])(?:_?[A-Za-z0-9])*$/;
var keywords = new Set(
  "TRUE FALSE AND OR XOR NOT MOD BOOL INT DINT REAL TIME STRING TON TOF TP CTU CTD CTUD R_TRIG F_TRIG VAR END_VAR VAR_INPUT VAR_OUTPUT PROGRAM END_PROGRAM FUNCTION FUNCTION_BLOCK IF THEN ELSE END_IF FOR WHILE CASE OF RETURN EN ENO".split(" ")
);
function ladderIdentifierOk(name) {
  return typeof name === "string" && name.length <= ladderLimits.nameLength && identifier.test(name) && !keywords.has(name.toUpperCase());
}
var isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var isInt = (v, lo, hi) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
function ladderVariableMap(doc) {
  const map = /* @__PURE__ */ new Map();
  for (const v of doc.variables)
    if (isRecord(v) && typeof v.name === "string") map.set(v.name.toUpperCase(), v);
  return {
    get: (name) => typeof name === "string" ? map.get(name.toUpperCase()) : void 0
  };
}
function validateLadder(input) {
  const out = [];
  const err = (code, path, id2) => out.push({ severity: "error", code, path, ...id2 ? { id: id2 } : {} });
  const keys = (o, path, required, optional2 = []) => {
    for (const k of required) if (!Object.hasOwn(o, k)) err("shape", `${path}.${k}`);
    for (const k of Object.keys(o))
      if (!required.includes(k) && !optional2.includes(k)) err("shape", `${path}.${k}`);
  };
  if (!isRecord(input)) {
    err("shape", "$");
    return out;
  }
  keys(input, "$", ["schemaVersion", "name", "scanMs", "variables", "rungs"]);
  if (input.schemaVersion !== 1) err("schema-version", "$.schemaVersion");
  if (typeof input.name !== "string" || input.name.length > 200) err("shape", "$.name");
  if (!isInt(input.scanMs, 1, 1e4)) err("scan-ms", "$.scanMs");
  if (!Array.isArray(input.variables) || !Array.isArray(input.rungs)) {
    err("shape", "$");
    return out;
  }
  if (input.variables.length > ladderLimits.variables) err("limit-variables", "$.variables");
  if (input.rungs.length > ladderLimits.rungs) err("limit-rungs", "$.rungs");
  if (out.length) return out;
  const seen = /* @__PURE__ */ new Set();
  input.variables.forEach((v, i) => {
    const p = `$.variables[${i}]`;
    if (!isRecord(v)) return err("shape", p);
    keys(v, p, ["name", "type", "role"], ["initial", "comment"]);
    const name = v.name;
    if (!ladderIdentifierOk(name)) err("name-invalid", `${p}.name`, String(name));
    else if (seen.has(name.toUpperCase())) err("name-duplicate", `${p}.name`, name);
    else seen.add(name.toUpperCase());
    if (!ladderTypes.includes(v.type)) err("variable-type", `${p}.type`, name);
    if (!ladderRoles.includes(v.role)) err("variable-role", `${p}.role`, name);
    const block = [...ladderTimerTypes, ...ladderCounterTypes].includes(v.type);
    if (block && v.role !== "internal") err("variable-role", `${p}.role`, name);
    if (v.comment !== void 0 && (typeof v.comment !== "string" || v.comment.length > ladderLimits.commentLength))
      err("shape", `${p}.comment`);
    if (v.initial !== void 0) {
      const ok = v.type === "BOOL" ? typeof v.initial === "boolean" : v.type === "INT" ? isInt(v.initial, -32768, 32767) : v.type === "TIME" ? isInt(v.initial, 0, 2 ** 31 - 1) : false;
      if (!ok) err("initial", `${p}.initial`, name);
    }
  });
  const vars = ladderVariableMap(input);
  const typeOf = (name) => typeof name === "string" ? vars.get(name)?.type : void 0;
  const ids = /* @__PURE__ */ new Set();
  const id = (v, path) => {
    if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(v)) return err("id", path);
    if (ids.has(v)) err("id-duplicate", path, v);
    ids.add(v);
  };
  const instances = /* @__PURE__ */ new Map();
  const written = /* @__PURE__ */ new Map();
  const ref = (name, path, want, nodeId) => {
    const t = typeOf(name);
    if (!t) return err("variable-missing", path, nodeId), false;
    if (!want.includes(t)) return err("variable-type", path, nodeId), false;
    return true;
  };
  const operand = (o, path, nodeId) => {
    if (!isRecord(o)) return err("shape", path);
    if (Object.hasOwn(o, "value")) {
      keys(o, path, ["value"]);
      if (!isInt(o.value, -(2 ** 31), 2 ** 31 - 1)) err("operand", `${path}.value`, nodeId);
      return;
    }
    keys(o, path, ["variable"], ["member"]);
    const t = typeOf(o.variable);
    if (!t) return err("variable-missing", `${path}.variable`, nodeId);
    const ok = o.member === void 0 ? t === "INT" || t === "TIME" : o.member === "CV" ? ladderCounterTypes.includes(t) : o.member === "ET" ? ladderTimerTypes.includes(t) : false;
    if (!ok) err("variable-type", `${path}.variable`, nodeId);
  };
  input.rungs.forEach((r, i) => {
    const p = `$.rungs[${i}]`;
    if (!isRecord(r)) return err("shape", p);
    keys(r, p, ["id", "network", "coils"], ["comment"]);
    id(r.id, `${p}.id`);
    const rid = String(r.id);
    if (r.comment !== void 0 && (typeof r.comment !== "string" || r.comment.length > ladderLimits.commentLength))
      err("shape", `${p}.comment`);
    let count = 0;
    const node = (n, path, depth) => {
      if (++count > ladderLimits.nodesPerRung)
        return count === ladderLimits.nodesPerRung + 1 && err("limit-nodes", path, rid);
      if (depth > ladderLimits.depth) return err("limit-depth", path, rid);
      if (!isRecord(n)) return err("shape", path);
      id(n.id, `${path}.id`);
      const nid = String(n.id);
      switch (n.kind) {
        case "contact":
          keys(n, path, ["id", "kind", "variable", "contact"]);
          ref(n.variable, `${path}.variable`, ["BOOL"], nid);
          if (!ladderContactKinds.includes(n.contact))
            err("shape", `${path}.contact`, nid);
          break;
        case "series":
          keys(n, path, ["id", "kind", "items"]);
          if (!Array.isArray(n.items)) return err("shape", `${path}.items`);
          n.items.forEach((c, k) => node(c, `${path}.items[${k}]`, depth + 1));
          break;
        case "parallel":
          keys(n, path, ["id", "kind", "branches"]);
          if (!Array.isArray(n.branches)) return err("shape", `${path}.branches`);
          if (n.branches.length < 2) err("branch-count", `${path}.branches`, nid);
          n.branches.forEach((c, k) => node(c, `${path}.branches[${k}]`, depth + 1));
          break;
        case "timer":
        case "counter": {
          const timer = n.kind === "timer";
          keys(
            n,
            path,
            ["id", "kind", "instance", timer ? "presetMs" : "preset"],
            timer ? [] : ["reset"]
          );
          if (ref(n.instance, `${path}.instance`, timer ? ladderTimerTypes : ladderCounterTypes, nid)) {
            const key = String(n.instance).toUpperCase();
            if (instances.has(key)) err("instance-duplicate", `${path}.instance`, nid);
            instances.set(key, nid);
          }
          if (timer ? !isInt(n.presetMs, 0, 2 ** 31 - 1) : !isInt(n.preset, -32768, 32767))
            err("preset", `${path}.${timer ? "presetMs" : "preset"}`, nid);
          if (!timer && n.reset !== void 0) ref(n.reset, `${path}.reset`, ["BOOL"], nid);
          break;
        }
        case "compare":
          keys(n, path, ["id", "kind", "op", "a", "b"]);
          if (!ladderCompareOps.includes(n.op)) err("shape", `${path}.op`, nid);
          operand(n.a, `${path}.a`, nid);
          operand(n.b, `${path}.b`, nid);
          break;
        default:
          err("shape", `${path}.kind`, nid);
      }
    };
    node(r.network, `${p}.network`, 1);
    if (!Array.isArray(r.coils)) return err("shape", `${p}.coils`);
    if (r.coils.length === 0) err("rung-no-coil", `${p}.coils`, rid);
    r.coils.forEach((c, k) => {
      const q = `${p}.coils[${k}]`;
      if (!isRecord(c)) return err("shape", q);
      keys(c, q, ["id", "variable", "coil"]);
      id(c.id, `${q}.id`);
      const cid = String(c.id);
      if (!ladderCoilKinds.includes(c.coil)) err("shape", `${q}.coil`, cid);
      if (!ref(c.variable, `${q}.variable`, ["BOOL"], cid)) return;
      const v = vars.get(c.variable);
      if (v.role === "input") err("coil-input", `${q}.variable`, cid);
      if (c.coil === "normal" || c.coil === "negated") {
        const key = v.name.toUpperCase();
        if (written.has(key))
          out.push({ severity: "warning", code: "coil-duplicate", path: `${q}.variable`, id: cid });
        written.set(key, cid);
      }
    });
  });
  return out;
}

// packages/ladder-core/src/scan.ts
var dict = () => /* @__PURE__ */ Object.create(null);
function ladderInitialState(doc) {
  const values = dict();
  const blocks = dict();
  for (const v of doc.variables) {
    if (v.type === "BOOL") values[v.name] = v.initial === true;
    else if (v.type === "INT" || v.type === "TIME") values[v.name] = v.initial ?? 0;
    else if (v.type === "CTU" || v.type === "CTD") blocks[v.name] = { cu: false, cv: 0, q: false };
    else blocks[v.name] = { in: false, et: 0, q: false };
  }
  return { values, blocks, edges: dict(), scans: 0, timeMs: 0 };
}
function ladderScan(doc, previous, inputs = {}, forced = {}) {
  const vars = ladderVariableMap(doc);
  const state = {
    values: Object.assign(dict(), previous.values),
    blocks: dict(),
    edges: Object.assign(dict(), previous.edges),
    scans: previous.scans + 1,
    timeMs: previous.timeMs + doc.scanMs
  };
  for (const [k, b] of Object.entries(previous.blocks)) state.blocks[k] = { ...b };
  const decl = (name) => vars.get(name);
  const own = (o, name) => {
    for (const k of Object.keys(o)) if (k.toUpperCase() === name.toUpperCase()) return o[k];
    return void 0;
  };
  for (const v of doc.variables) {
    if (v.role === "input") {
      const x = own(inputs, v.name);
      if (x !== void 0) state.values[v.name] = v.type === "BOOL" ? !!x : Number(x);
    }
  }
  const forcedOf = (v) => own(forced, v.name);
  for (const v of doc.variables) {
    const f = forcedOf(v);
    if (f !== void 0 && Object.hasOwn(state.values, v.name)) state.values[v.name] = f;
  }
  const read = (name) => {
    const v = decl(name);
    return v ? state.values[v.name] : void 0;
  };
  const write = (name, value) => {
    const v = decl(name);
    if (!v || forcedOf(v) !== void 0) return;
    state.values[v.name] = value;
  };
  const operand = (o) => {
    if ("value" in o) return o.value;
    const v = decl(o.variable);
    if (!v) return 0;
    if (o.member === "CV") return state.blocks[v.name].cv;
    if (o.member === "ET") return state.blocks[v.name].et;
    return Number(state.values[v.name]);
  };
  const power = dict();
  const dt = doc.scanMs;
  const run = (n, pin) => {
    let out;
    switch (n.kind) {
      case "contact": {
        const x = read(n.variable) === true;
        let ok;
        if (n.contact === "no") ok = x;
        else if (n.contact === "nc") ok = !x;
        else {
          const before2 = decl(n.variable);
          const was = state.edges[n.id] ?? (before2 ? previous.values[before2.name] === true : x);
          ok = n.contact === "rising" ? x && !was : !x && was;
          state.edges[n.id] = x;
        }
        out = pin && ok;
        break;
      }
      case "series":
        out = pin;
        for (const c of n.items) out = run(c, out);
        break;
      case "parallel":
        out = false;
        for (const b of n.branches) out = run(b, pin) || out;
        break;
      case "timer": {
        const v = decl(n.instance);
        const t = state.blocks[v.name];
        const pt = n.presetMs;
        if (v.type === "TON") {
          t.et = pin ? Math.min(pt, t.et + (t.in ? dt : 0)) : 0;
          t.q = pin && t.et >= pt;
        } else if (v.type === "TOF") {
          if (pin) {
            t.et = 0;
            t.q = true;
          } else if (t.q) {
            t.et = t.in ? 0 : Math.min(pt, t.et + dt);
            if (t.et >= pt) t.q = false;
          }
        } else {
          if (t.q) {
            t.et = Math.min(pt, t.et + dt);
            if (t.et >= pt) t.q = false;
          } else if (pin && !t.in) {
            t.et = 0;
            t.q = pt > 0;
          }
          if (!t.q && !pin) t.et = 0;
        }
        t.in = pin;
        out = t.q;
        break;
      }
      case "counter": {
        const v = decl(n.instance);
        const c = state.blocks[v.name];
        const r = n.reset !== void 0 && read(n.reset) === true;
        const rise = pin && !c.cu;
        if (v.type === "CTU") {
          if (r) c.cv = 0;
          else if (rise && c.cv < 32767) c.cv = c.cv + 1;
          c.q = c.cv >= n.preset;
        } else {
          if (r) c.cv = n.preset;
          else if (rise && c.cv > 0) c.cv = c.cv - 1;
          c.q = c.cv <= 0;
        }
        c.cu = pin;
        out = c.q;
        break;
      }
      case "compare": {
        const a = operand(n.a);
        const b = operand(n.b);
        const ok = n.op === "eq" ? a === b : n.op === "ne" ? a !== b : n.op === "gt" ? a > b : n.op === "ge" ? a >= b : n.op === "lt" ? a < b : a <= b;
        out = pin && ok;
        break;
      }
    }
    power[n.id] = out;
    return out;
  };
  for (const rung of doc.rungs) {
    const p = run(rung.network, true);
    for (const c of rung.coils) {
      power[c.id] = p;
      if (c.coil === "normal") write(c.variable, p);
      else if (c.coil === "negated") write(c.variable, !p);
      else if (p) write(c.variable, c.coil === "set");
    }
  }
  return { state, power };
}

// packages/ladder-core/src/xml.ts
var ladderXmlLimits = Object.freeze({
  bytes: 4 * 1024 * 1024,
  depth: 64,
  elements: 2e5
});

// packages/factory-core/src/validation.ts
var reservedKeys = ["__proto__", "constructor", "prototype", "toJSON"];
var record = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
var codePoints = (s2) => [...s2].length;
var factoryId = (v) => typeof v === "string" && v.length > 0 && codePoints(v) <= factoryLimits.idCodePoints && v.trim() === v && !/\p{Cc}/u.test(v) && !reservedKeys.includes(v);
var text = (v) => typeof v === "string" && codePoints(v) <= factoryLimits.nameCodePoints && !/\p{Cc}/u.test(v);
var int = (v, min, max) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
var num = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
function jsonShape(value) {
  const seen = /* @__PURE__ */ new Set();
  function visit(v, depth, path) {
    if (depth > factoryLimits.jsonDepth) return { code: "json-depth", path };
    if (v === null || typeof v === "string" || typeof v === "boolean") return;
    if (typeof v === "number") return Number.isFinite(v) ? void 0 : { code: "number", path };
    if (typeof v !== "object" || seen.has(v)) return { code: "json-value", path };
    const isArray = Array.isArray(v);
    if (Object.getPrototypeOf(v) !== (isArray ? Array.prototype : Object.prototype))
      return { code: "json-value", path };
    seen.add(v);
    if (isArray) {
      for (let i = 0; i < v.length; i++)
        if (!Object.prototype.hasOwnProperty.call(v, i))
          return { code: "json-value", path: `${path}.${i}` };
    }
    for (const key of Reflect.ownKeys(v)) {
      if (isArray && key === "length") continue;
      if (typeof key !== "string" || reservedKeys.includes(key)) return { code: "json-key", path };
      if (isArray && !/^(0|[1-9][0-9]*)$/.test(key)) return { code: "json-key", path };
      const d = Object.getOwnPropertyDescriptor(v, key);
      if (!("value" in d)) return { code: "json-value", path: `${path}.${key}` };
      const r = visit(d.value, depth + 1, `${path}.${key}`);
      if (r) return r;
    }
    seen.delete(v);
  }
  return visit(value, 0, "$") ?? void 0;
}
function onlyKeys(v, keys, path, out) {
  for (const k of Object.keys(v))
    if (!keys.includes(k)) out.push({ code: "unknown-key", path: `${path}.${k}`, message: k });
}
function need(v, keys, path, out) {
  for (const k of keys)
    if (!(k in v)) out.push({ code: "missing", path: `${path}.${k}`, message: `${k} is required` });
}
var T = factoryLimits.maxTimeMs;
function checkDistribution(v, path, out) {
  const bad = (code, message, at = path) => out.push({ code, path: at, message });
  if (!record(v)) return bad("distribution", "expected a distribution");
  const type = v.type;
  if (!factoryDistributionTypes.includes(type))
    return bad("distribution-type", `unknown distribution ${shown(type)}`, `${path}.type`);
  const keys = {
    const: ["value"],
    uniform: ["min", "max"],
    triangular: ["min", "mode", "max"],
    normal: ["mean", "sd"],
    lognormal: ["mean", "sd"],
    exponential: ["mean"],
    empirical: ["values"]
  };
  const required = keys[type];
  const optional2 = type === "normal" ? ["min", "max"] : [];
  onlyKeys(v, ["type", ...required, ...optional2], path, out);
  need(v, required, path, out);
  for (const k of [...required, ...optional2])
    if (k !== "values" && k in v && !num(v[k], 0, T))
      bad("time", `${k} must be a number from 0 to ${T} ms`, `${path}.${k}`);
  const n = (k) => typeof v[k] === "number" ? v[k] : NaN;
  switch (type) {
    case "uniform":
      if (n("min") > n("max")) bad("range", "min is above max");
      break;
    case "triangular":
      if (!(n("min") <= n("mode") && n("mode") <= n("max"))) bad("range", "needs min \u2264 mode \u2264 max");
      break;
    case "normal":
      if ("min" in v && "max" in v && n("min") > n("max")) bad("range", "min is above max");
      if ("max" in v && n("max") < 0) bad("range", "max is below 0");
      break;
    case "lognormal":
    case "exponential":
      if (n("mean") === 0) bad("range", "mean must be above 0", `${path}.mean`);
      break;
    case "empirical": {
      const values = v.values;
      if (!Array.isArray(values) || values.length === 0 || values.length > factoryLimits.empiricalValues) {
        bad("values", `1 to ${factoryLimits.empiricalValues} values`, `${path}.values`);
        break;
      }
      let total = 0;
      values.forEach((x, i) => {
        const p = `${path}.values.${i}`;
        if (!record(x)) return bad("values", "expected { value, weight }", p);
        onlyKeys(x, ["value", "weight"], p, out);
        if (!num(x.value, 0, T)) bad("time", `value must be 0 to ${T} ms`, `${p}.value`);
        if (!num(x.weight, 0, 1e9)) bad("weight", "weight must be \u2265 0", `${p}.weight`);
        else total += x.weight;
      });
      if (total <= 0) bad("weight", "the weights must not all be 0", `${path}.values`);
      break;
    }
  }
}
var holding = [
  "source",
  "station",
  "parallel",
  "assembly",
  "buffer",
  "conveyor"
];
var processing = ["station", "parallel", "assembly"];
var taking = ["station", "parallel", "assembly", "buffer", "conveyor"];
var factorySensorKinds = Object.freeze({
  occupied: holding,
  ready: holding,
  blocked: holding,
  full: taking,
  failed: processing
});
var factoryActuatorKinds = Object.freeze({
  run: ["conveyor"],
  release: holding,
  admit: [...taking, "drain"]
});
var shown = (v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : v === null ? "null" : `a value of type ${typeof v}`;
var named = (v, what) => typeof v === "string" ? `no ${what} ${v}`.trim() : `expected ${what || "an"} ID`;
function validateFactory(value) {
  const out = [];
  const bad = (code, path, message) => out.push({ code, path, message });
  const shape = jsonShape(value);
  if (shape) return [{ ...shape, message: "not plain JSON data" }];
  if (!record(value)) return [{ code: "document", path: "$", message: "expected an object" }];
  const doc = value;
  onlyKeys(
    doc,
    [
      "schemaVersion",
      "name",
      "products",
      "objects",
      "links",
      "calendars",
      "workerPools",
      "paths",
      "fleets",
      "building",
      "control",
      "run",
      "experiment",
      "retiredIds"
    ],
    "$",
    out
  );
  if (doc.schemaVersion !== FACTORY_SCHEMA)
    return [
      ...out,
      { code: "schema", path: "$.schemaVersion", message: `expected ${FACTORY_SCHEMA}` }
    ];
  need(doc, ["name", "products", "objects", "links", "run"], "$", out);
  if ("name" in doc && !text(doc.name)) bad("name", "$.name", "invalid name");
  const ids = /* @__PURE__ */ new Set();
  const retired = /* @__PURE__ */ new Set();
  if ("retiredIds" in doc) {
    if (!Array.isArray(doc.retiredIds) || doc.retiredIds.length > factoryLimits.retiredIds)
      bad("retired", "$.retiredIds", `at most ${factoryLimits.retiredIds} IDs`);
    else
      doc.retiredIds.forEach((id, i) => {
        if (!factoryId(id) || retired.has(id)) bad("id", `$.retiredIds.${i}`, "invalid ID");
        else retired.add(id);
      });
  }
  const claim = (id, path) => {
    if (!factoryId(id)) return bad("id", path, "invalid ID"), false;
    if (ids.has(id)) return bad("duplicate-id", path, `${id} is used twice`), false;
    if (retired.has(id)) return bad("retired-id", path, `${id} was removed before`), false;
    ids.add(id);
    return true;
  };
  const products = /* @__PURE__ */ new Set();
  if (Array.isArray(doc.products)) {
    if (doc.products.length > factoryLimits.products)
      bad("limit-exceeded", "$.products", `at most ${factoryLimits.products}`);
    doc.products.forEach((p, i) => {
      const at = `$.products.${i}`;
      if (!record(p)) return bad("product", at, "expected a product");
      onlyKeys(p, ["id", "name"], at, out);
      if (claim(p.id, `${at}.id`)) products.add(p.id);
      if (!text(p.name)) bad("name", `${at}.name`, "invalid name");
    });
  } else if ("products" in doc) bad("products", "$.products", "expected a list");
  const product = (v, at) => {
    if (typeof v !== "string" || !products.has(v)) bad("product-missing", at, named(v, "product"));
  };
  const productTimes = (v, at) => {
    if (!Array.isArray(v) || v.length > factoryLimits.productTimes)
      return bad("product-times", at, `at most ${factoryLimits.productTimes}`);
    const seen = /* @__PURE__ */ new Set();
    v.forEach((x, j) => {
      const p = `${at}.${j}`;
      if (!record(x)) return bad("product-times", p, "expected { productId, time }");
      onlyKeys(x, ["productId", "time"], p, out);
      product(x.productId, `${p}.productId`);
      if (seen.has(x.productId)) bad("duplicate", `${p}.productId`, "product listed twice");
      seen.add(x.productId);
      checkDistribution(x.time, `${p}.time`, out);
    });
  };
  const calendars = /* @__PURE__ */ new Set();
  if (Array.isArray(doc.calendars)) {
    if (doc.calendars.length > factoryLimits.calendars)
      bad("limit-exceeded", "$.calendars", `at most ${factoryLimits.calendars}`);
    doc.calendars.forEach((c, i) => {
      const at = `$.calendars.${i}`;
      if (!record(c)) return bad("calendar", at, "expected a calendar");
      onlyKeys(c, ["id", "name", "cycleMs", "shifts"], at, out);
      need(c, ["id", "name", "cycleMs", "shifts"], at, out);
      if (claim(c.id, `${at}.id`)) calendars.add(c.id);
      if ("name" in c && !text(c.name)) bad("name", `${at}.name`, "invalid name");
      const cycle = int(c.cycleMs, 6e4, T) ? c.cycleMs : void 0;
      if (!cycle) bad("time", `${at}.cycleMs`, `1 minute to ${T} ms, whole ms`);
      if (!Array.isArray(c.shifts) || c.shifts.length === 0 || c.shifts.length > factoryLimits.shifts)
        return bad("shifts", `${at}.shifts`, `1 to ${factoryLimits.shifts} shifts`);
      let last = 0;
      c.shifts.forEach((s2, j) => {
        const p = `${at}.shifts.${j}`;
        if (!record(s2)) return bad("shifts", p, "expected { name, startMs, endMs }");
        onlyKeys(s2, ["name", "startMs", "endMs"], p, out);
        need(s2, ["name", "startMs", "endMs"], p, out);
        if ("name" in s2 && !text(s2.name)) bad("name", `${p}.name`, "invalid name");
        if (!int(s2.startMs, 0, T) || !int(s2.endMs, 0, T))
          return bad("time", p, "start and end are whole ms");
        if (s2.endMs <= s2.startMs) bad("range", p, "a shift ends after it starts");
        if (cycle && s2.endMs > cycle) bad("range", `${p}.endMs`, "ends after the cycle");
        if (s2.startMs < last) bad("range", `${p}.startMs`, "shifts in order, not overlapping");
        last = s2.endMs;
      });
    });
  } else if ("calendars" in doc) bad("calendars", "$.calendars", "expected a list");
  const skills = /* @__PURE__ */ new Set();
  let pools = 0;
  if (Array.isArray(doc.workerPools)) {
    if (doc.workerPools.length > factoryLimits.workerPools)
      bad("limit-exceeded", "$.workerPools", `at most ${factoryLimits.workerPools}`);
    doc.workerPools.forEach((w, i) => {
      const at = `$.workerPools.${i}`;
      if (!record(w)) return bad("worker-pool", at, "expected a worker pool");
      onlyKeys(w, ["id", "name", "count", "skills", "walkSpeedMmS", "home"], at, out);
      need(w, ["id", "name", "count", "skills", "walkSpeedMmS"], at, out);
      claim(w.id, `${at}.id`);
      pools++;
      if ("name" in w && !text(w.name)) bad("name", `${at}.name`, "invalid name");
      if (!int(w.count, 1, factoryLimits.workersPerPool))
        bad("count", `${at}.count`, `1 to ${factoryLimits.workersPerPool} workers`);
      if (!num(w.walkSpeedMmS, 0, factoryLimits.maxSpeedMmS) || w.walkSpeedMmS === 0)
        bad("speed", `${at}.walkSpeedMmS`, `above 0, at most ${factoryLimits.maxSpeedMmS} mm/s`);
      if (!Array.isArray(w.skills) || w.skills.length > factoryLimits.skills)
        bad("skills", `${at}.skills`, `at most ${factoryLimits.skills} skills`);
      else
        w.skills.forEach((k, j) => {
          if (!factoryId(k)) bad("skill", `${at}.skills.${j}`, "invalid skill");
          else skills.add(k);
        });
      if ("home" in w) {
        const h = w.home;
        if (!record(h)) bad("home", `${at}.home`, "expected { x, y }");
        else {
          onlyKeys(h, ["x", "y"], `${at}.home`, out);
          for (const k of ["x", "y"])
            if (!int(h[k], -factoryLimits.maxLengthMm, factoryLimits.maxLengthMm))
              bad("home", `${at}.home.${k}`, `whole mm within \xB1${factoryLimits.maxLengthMm}`);
        }
      }
    });
  } else if ("workerPools" in doc) bad("worker-pools", "$.workerPools", "expected a list");
  const pathNodes = /* @__PURE__ */ new Map();
  if ("paths" in doc) {
    const pa = doc.paths;
    if (!record(pa)) bad("paths", "$.paths", "expected { nodes, segments }");
    else {
      onlyKeys(pa, ["nodes", "segments"], "$.paths", out);
      if (!Array.isArray(pa.nodes) || pa.nodes.length > factoryLimits.pathNodes)
        bad("paths", "$.paths.nodes", `a list of at most ${factoryLimits.pathNodes}`);
      else
        pa.nodes.forEach((n, i) => {
          const at = `$.paths.nodes.${i}`;
          if (!record(n)) return bad("path-node", at, "expected { id, x, y }");
          onlyKeys(n, ["id", "x", "y"], at, out);
          const okXY = ["x", "y"].every((k) => int(n[k], -factoryLimits.maxLengthMm, factoryLimits.maxLengthMm));
          if (!okXY) bad("at", at, `x and y in whole mm within \xB1${factoryLimits.maxLengthMm}`);
          if (claim(n.id, `${at}.id`) && okXY)
            pathNodes.set(n.id, { x: n.x, y: n.y });
        });
      if (!Array.isArray(pa.segments) || pa.segments.length > factoryLimits.pathSegments)
        bad("paths", "$.paths.segments", `a list of at most ${factoryLimits.pathSegments}`);
      else {
        const pairs = /* @__PURE__ */ new Set();
        pa.segments.forEach((g, i) => {
          const at = `$.paths.segments.${i}`;
          if (!record(g)) return bad("segment", at, "expected { id, from, to, twoWay? }");
          onlyKeys(g, ["id", "from", "to", "twoWay"], at, out);
          claim(g.id, `${at}.id`);
          const a = pathNodes.get(g.from);
          const b = pathNodes.get(g.to);
          if (!a) bad("path-node-missing", `${at}.from`, `no path node ${shown(g.from)}`);
          if (!b) bad("path-node-missing", `${at}.to`, `no path node ${shown(g.to)}`);
          if (a && b && a.x === b.x && a.y === b.y) bad("segment", at, "a segment of length 0");
          if ("twoWay" in g && typeof g.twoWay !== "boolean")
            bad("segment", `${at}.twoWay`, "true or false");
          const key = `${shown(g.from)}\0${shown(g.to)}`;
          const back = `${shown(g.to)}\0${shown(g.from)}`;
          if (pairs.has(key) || g.twoWay && pairs.has(back))
            bad("duplicate-segment", at, "two segments between the same points");
          pairs.add(key);
          if (g.twoWay) pairs.add(back);
        });
      }
    }
  }
  const fleets = /* @__PURE__ */ new Set();
  if (Array.isArray(doc.fleets)) {
    if (doc.fleets.length > factoryLimits.fleets) bad("limit-exceeded", "$.fleets", `at most ${factoryLimits.fleets}`);
    doc.fleets.forEach((f, i) => {
      const at = `$.fleets.${i}`;
      if (!record(f)) return bad("fleet", at, "expected a fleet");
      const keys = ["id", "name", "count", "speedMmS", "loadMs", "unloadMs", "homeNodeId"];
      onlyKeys(f, [...keys, "battery", "widthMm"], at, out);
      if ("widthMm" in f && !int(f.widthMm, 1, factoryLimits.maxLengthMm))
        bad("size", `${at}.widthMm`, `1 to ${factoryLimits.maxLengthMm} mm, whole mm`);
      need(f, keys, at, out);
      if (claim(f.id, `${at}.id`)) fleets.add(f.id);
      if ("name" in f && !text(f.name)) bad("name", `${at}.name`, "invalid name");
      if (!int(f.count, 1, factoryLimits.vehiclesPerFleet))
        bad("count", `${at}.count`, `1 to ${factoryLimits.vehiclesPerFleet} vehicles`);
      if (!num(f.speedMmS, 0, factoryLimits.maxSpeedMmS) || f.speedMmS === 0)
        bad("speed", `${at}.speedMmS`, `above 0, at most ${factoryLimits.maxSpeedMmS} mm/s`);
      for (const k of ["loadMs", "unloadMs"])
        if (!int(f[k], 0, T)) bad("time", `${at}.${k}`, `0 to ${T} ms, whole ms`);
      if (!pathNodes.has(f.homeNodeId))
        bad("path-node-missing", `${at}.homeNodeId`, `no path node ${shown(f.homeNodeId)}`);
      if ("battery" in f) {
        const b = f.battery;
        const p = `${at}.battery`;
        if (!record(b)) bad("battery", p, "expected a battery");
        else {
          const bk = ["capacityMs", "chargeMs", "chargerNodeId", "rechargeBelow"];
          onlyKeys(b, bk, p, out);
          need(b, bk, p, out);
          if (!int(b.capacityMs, 6e4, T)) bad("time", `${p}.capacityMs`, "1 minute or more");
          if (!int(b.chargeMs, 1, T)) bad("time", `${p}.chargeMs`, "above 0, whole ms");
          if (!num(b.rechargeBelow, 0, 1)) bad("range", `${p}.rechargeBelow`, "0 to 1");
          if (!pathNodes.has(b.chargerNodeId))
            bad(
              "path-node-missing",
              `${p}.chargerNodeId`,
              `no path node ${shown(b.chargerNodeId)}`
            );
        }
      }
    });
  } else if ("fleets" in doc) bad("fleets", "$.fleets", "expected a list");
  const kinds = /* @__PURE__ */ new Map();
  const onPath = /* @__PURE__ */ new Set();
  if (Array.isArray(doc.objects)) {
    if (doc.objects.length > factoryLimits.objects) bad("limit-exceeded", "$.objects", `at most ${factoryLimits.objects}`);
    doc.objects.forEach((o, i) => {
      const at = `$.objects.${i}`;
      if (!record(o)) return bad("object", at, "expected an object");
      const kind = o.kind;
      if (!factoryObjectKinds.includes(kind))
        return bad("kind", `${at}.kind`, `unknown kind ${shown(kind)}`);
      const base = ["id", "name", "kind", "exit", "at", "size", "look", "calendarId", "pathNodeId"];
      const keys = {
        source: [
          ["interval", "mix"],
          ["limit", "startMs"]
        ],
        station: [["processTime"], ["productTimes", "failures", "setup", "workers"]],
        parallel: [
          ["count", "processTime"],
          ["productTimes", "failures", "setup", "workers"]
        ],
        assembly: [
          ["mainProductId", "components", "processTime"],
          ["outputProductId", "failures", "setup", "workers"]
        ],
        buffer: [["capacity"], ["order"]],
        conveyor: [["lengthMm", "speedMmS", "partLengthMm", "accumulating"], []],
        drain: [[], []]
      };
      const [required, optional2] = keys[kind];
      onlyKeys(o, [...base, ...required, ...optional2], at, out);
      need(o, ["id", "name", ...required], at, out);
      if (claim(o.id, `${at}.id`)) kinds.set(o.id, kind);
      if ("name" in o && !text(o.name)) bad("name", `${at}.name`, "invalid name");
      if ("exit" in o && !factoryExitStrategies.includes(o.exit))
        bad("exit", `${at}.exit`, `unknown exit strategy ${shown(o.exit)}`);
      if ("at" in o) {
        const p = o.at;
        if (!record(p)) bad("at", `${at}.at`, "expected { x, y, angle? }");
        else {
          onlyKeys(p, ["x", "y", "angle"], `${at}.at`, out);
          for (const k of ["x", "y"])
            if (!int(p[k], -factoryLimits.maxLengthMm, factoryLimits.maxLengthMm))
              bad("at", `${at}.at.${k}`, `whole mm within \xB1${factoryLimits.maxLengthMm}`);
          if ("angle" in p && !num(p.angle, 0, 360))
            bad("at", `${at}.at.angle`, "0 to 360 degrees");
          if (!("x" in p) || !("y" in p)) bad("missing", `${at}.at`, "x and y are required");
        }
      }
      if ("size" in o) {
        const z = o.size;
        const sk = ["widthMm", "depthMm", "heightMm"];
        if (!record(z)) bad("size", `${at}.size`, "expected { widthMm, depthMm, heightMm }");
        else {
          onlyKeys(z, sk, `${at}.size`, out);
          need(z, sk, `${at}.size`, out);
          for (const k of sk)
            if (k in z && !int(z[k], 1, factoryLimits.maxLengthMm))
              bad("size", `${at}.size.${k}`, `1 to ${factoryLimits.maxLengthMm} mm, whole mm`);
        }
      }
      if ("look" in o) {
        const r = o.look;
        const rk = ["artifactId", "versionId", "contentHash"];
        if (!record(r))
          bad("look", `${at}.look`, "expected { artifactId, versionId, contentHash }");
        else {
          onlyKeys(r, rk, `${at}.look`, out);
          need(r, rk, `${at}.look`, out);
          for (const k of rk)
            if (k in r && (typeof r[k] !== "string" || !r[k] || r[k].length > 200))
              bad("look", `${at}.look.${k}`, "expected a non-empty string");
        }
      }
      if ("pathNodeId" in o) {
        if (typeof o.pathNodeId !== "string" || !pathNodes.has(o.pathNodeId))
          bad("path-node-missing", `${at}.pathNodeId`, `no path node ${shown(o.pathNodeId)}`);
        else onPath.add(o.id);
      }
      if ("calendarId" in o) {
        if (!["source", "station", "parallel", "assembly"].includes(kind))
          bad("calendar", `${at}.calendarId`, `a ${shown(kind)} has no calendar`);
        else if (typeof o.calendarId !== "string" || !calendars.has(o.calendarId))
          bad("calendar-missing", `${at}.calendarId`, `no calendar ${shown(o.calendarId)}`);
      }
      if ("failures" in o) {
        const f = o.failures;
        const p = `${at}.failures`;
        if (!record(f)) bad("failures", p, "expected { uptime, repair, basis? }");
        else {
          onlyKeys(f, ["uptime", "repair", "basis"], p, out);
          need(f, ["uptime", "repair"], p, out);
          if ("uptime" in f) checkDistribution(f.uptime, `${p}.uptime`, out);
          if ("repair" in f) checkDistribution(f.repair, `${p}.repair`, out);
          if ("basis" in f && f.basis !== "operating" && f.basis !== "calendar")
            bad("basis", `${p}.basis`, "operating or calendar");
        }
      }
      if ("setup" in o) {
        const st = o.setup;
        const p = `${at}.setup`;
        if (!record(st)) bad("setup", p, "expected { time, productTimes? }");
        else {
          onlyKeys(st, ["time", "productTimes"], p, out);
          need(st, ["time"], p, out);
          if ("time" in st) checkDistribution(st.time, `${p}.time`, out);
          if ("productTimes" in st) productTimes(st.productTimes, `${p}.productTimes`);
        }
      }
      if ("workers" in o) {
        const w = o.workers;
        const p = `${at}.workers`;
        if (!record(w)) bad("workers", p, "expected { count, skill? }");
        else {
          onlyKeys(w, ["count", "skill"], p, out);
          if (!int(w.count, 1, factoryLimits.workersPerPool))
            bad("count", `${p}.count`, `1 to ${factoryLimits.workersPerPool}`);
          if ("skill" in w) {
            if (typeof w.skill !== "string" || !skills.has(w.skill))
              bad("skill-missing", `${p}.skill`, `no worker pool has ${shown(w.skill)}`);
          } else if (!pools) bad("worker-missing", p, "no worker pool");
        }
      }
      if ("processTime" in o) checkDistribution(o.processTime, `${at}.processTime`, out);
      if ("productTimes" in o) productTimes(o.productTimes, `${at}.productTimes`);
      switch (kind) {
        case "source": {
          if ("interval" in o) checkDistribution(o.interval, `${at}.interval`, out);
          if (!Array.isArray(o.mix) || o.mix.length === 0 || o.mix.length > factoryLimits.mix) {
            bad("mix", `${at}.mix`, `1 to ${factoryLimits.mix} products`);
            break;
          }
          let total = 0;
          const seen = /* @__PURE__ */ new Set();
          o.mix.forEach((m, j) => {
            const p = `${at}.mix.${j}`;
            if (!record(m)) return bad("mix", p, "expected { productId, weight }");
            onlyKeys(m, ["productId", "weight"], p, out);
            product(m.productId, `${p}.productId`);
            if (seen.has(m.productId)) bad("duplicate", `${p}.productId`, "product listed twice");
            seen.add(m.productId);
            if (!num(m.weight, 0, 1e9)) bad("weight", `${p}.weight`, "weight must be \u2265 0");
            else total += m.weight;
          });
          if (total <= 0) bad("weight", `${at}.mix`, "the weights must not all be 0");
          if ("limit" in o && !int(o.limit, 1, 1e9)) bad("limit", `${at}.limit`, "1 or more");
          if ("startMs" in o && !int(o.startMs, 0, T)) bad("time", `${at}.startMs`, "whole ms");
          break;
        }
        case "parallel":
          if (!int(o.count, 1, factoryLimits.parallelCount))
            bad("count", `${at}.count`, `1 to ${factoryLimits.parallelCount} places`);
          break;
        case "assembly": {
          product(o.mainProductId, `${at}.mainProductId`);
          if ("outputProductId" in o) product(o.outputProductId, `${at}.outputProductId`);
          if (!Array.isArray(o.components) || o.components.length === 0 || o.components.length > factoryLimits.components) {
            bad("components", `${at}.components`, `1 to ${factoryLimits.components} components`);
            break;
          }
          const seen = /* @__PURE__ */ new Set([o.mainProductId]);
          o.components.forEach((c, j) => {
            const p = `${at}.components.${j}`;
            if (!record(c)) return bad("components", p, "expected { productId, count }");
            onlyKeys(c, ["productId", "count"], p, out);
            product(c.productId, `${p}.productId`);
            if (seen.has(c.productId))
              bad("duplicate", `${p}.productId`, "listed twice or the main product");
            seen.add(c.productId);
            if (!int(c.count, 1, factoryLimits.componentCount))
              bad("count", `${p}.count`, `1 to ${factoryLimits.componentCount}`);
          });
          break;
        }
        case "buffer":
          if (!int(o.capacity, 1, factoryLimits.bufferCapacity))
            bad("capacity", `${at}.capacity`, `1 to ${factoryLimits.bufferCapacity}`);
          if ("order" in o && o.order !== "fifo" && o.order !== "lifo")
            bad("order", `${at}.order`, "fifo or lifo");
          break;
        case "conveyor":
          if (!int(o.lengthMm, 1, factoryLimits.maxLengthMm))
            bad("length", `${at}.lengthMm`, `1 to ${factoryLimits.maxLengthMm} mm`);
          if (!int(o.partLengthMm, 1, factoryLimits.maxLengthMm))
            bad("length", `${at}.partLengthMm`, `1 to ${factoryLimits.maxLengthMm} mm`);
          else if (typeof o.lengthMm === "number" && o.partLengthMm > o.lengthMm)
            bad("length", `${at}.partLengthMm`, "longer than the conveyor");
          if (!num(o.speedMmS, 0, factoryLimits.maxSpeedMmS) || o.speedMmS === 0)
            bad("speed", `${at}.speedMmS`, `above 0, at most ${factoryLimits.maxSpeedMmS} mm/s`);
          if (typeof o.accumulating !== "boolean")
            bad("accumulating", `${at}.accumulating`, "true or false");
          break;
      }
    });
  } else if ("objects" in doc) bad("objects", "$.objects", "expected a list");
  if (Array.isArray(doc.links)) {
    if (doc.links.length > factoryLimits.links) bad("limit-exceeded", "$.links", `at most ${factoryLimits.links}`);
    const pairs = /* @__PURE__ */ new Set();
    doc.links.forEach((l, i) => {
      const at = `$.links.${i}`;
      if (!record(l)) return bad("link", at, "expected a link");
      onlyKeys(l, ["id", "from", "to", "productIds", "transport"], at, out);
      if ("transport" in l) {
        const t = l.transport;
        if (!record(t)) bad("transport", `${at}.transport`, "expected { fleetId }");
        else {
          onlyKeys(t, ["fleetId"], `${at}.transport`, out);
          if (!fleets.has(t.fleetId))
            bad("fleet-missing", `${at}.transport.fleetId`, `no fleet ${shown(t.fleetId)}`);
          for (const end of ["from", "to"])
            if (kinds.has(l[end]) && !onPath.has(l[end]))
              bad("no-path-node", `${at}.${end}`, `${shown(l[end])} has no path node`);
        }
      }
      need(l, ["id", "from", "to"], at, out);
      claim(l.id, `${at}.id`);
      const from = kinds.get(l.from);
      const to = kinds.get(l.to);
      if (!from) bad("object-missing", `${at}.from`, named(l.from, "object"));
      else if (from === "drain") bad("link-from-drain", `${at}.from`, "a drain has no exit");
      if (!to) bad("object-missing", `${at}.to`, named(l.to, "object"));
      else if (to === "source") bad("link-to-source", `${at}.to`, "a source has no entry");
      if (l.from === l.to) bad("self-link", at, "an object linked to itself");
      const key = `${named(l.from, "")}\0${named(l.to, "")}`;
      if (from && to && pairs.has(key))
        bad("duplicate-link", at, "two links between the same objects");
      pairs.add(key);
      if ("productIds" in l) {
        if (!Array.isArray(l.productIds) || l.productIds.length === 0)
          bad("product-ids", `${at}.productIds`, "a non-empty list");
        else {
          const seen = /* @__PURE__ */ new Set();
          l.productIds.forEach((p, j) => {
            product(p, `${at}.productIds.${j}`);
            if (seen.has(p)) bad("duplicate", `${at}.productIds.${j}`, "product listed twice");
            seen.add(p);
          });
        }
      }
    });
    if (!out.length) {
      const next = /* @__PURE__ */ new Map();
      for (const l of doc.links)
        if (kinds.get(l.from) === "buffer" && kinds.get(l.to) === "buffer")
          next.set(l.from, [...next.get(l.from) ?? [], l.to]);
      const state = /* @__PURE__ */ new Map();
      const loop = (id) => {
        state.set(id, 1);
        for (const n of next.get(id) ?? []) {
          if (state.get(n) === 1 || !state.has(n) && loop(n)) return true;
        }
        state.set(id, 2);
        return false;
      };
      for (const id of next.keys())
        if (!state.has(id) && loop(id)) {
          bad("buffer-loop", "$.links", `buffers linked in a loop through ${id}`);
          break;
        }
    }
  } else if ("links" in doc) bad("links", "$.links", "expected a list");
  if ("building" in doc) {
    const b = doc.building;
    const bk = ["artifactId", "versionId", "contentHash"];
    if (!record(b))
      bad("building", "$.building", "expected { artifactId, versionId, contentHash }");
    else {
      onlyKeys(b, bk, "$.building", out);
      need(b, bk, "$.building", out);
      for (const k of bk)
        if (k in b && (typeof b[k] !== "string" || !b[k] || b[k].length > 200))
          bad("building", `$.building.${k}`, "expected a non-empty string");
    }
  }
  if ("control" in doc) {
    const c = doc.control;
    const at = "$.control";
    if (!record(c)) bad("control", at, "expected control settings");
    else {
      onlyKeys(c, ["program", "sensors", "actuators", "stallMs"], at, out);
      need(c, ["program", "sensors", "actuators"], at, out);
      if ("stallMs" in c && !int(c.stallMs, 1, T)) bad("time", `${at}.stallMs`, `1 to ${T} ms`);
      let ladder;
      try {
        ladder = "program" in c ? validateLadder(c.program) : [];
      } catch {
        ladder = [{ severity: "error", code: "malformed", path: "$" }];
      }
      for (const d of ladder)
        if (d.severity === "error")
          bad(
            "program",
            `${at}.program${d.path.replace(/^\$/, "")}`,
            `ladder program: ${d.code}${d.id ? ` (${d.id})` : ""}`
          );
      const program = ladder.some((d) => d.severity === "error") ? void 0 : c.program;
      const vars = program ? ladderVariableMap(program) : void 0;
      const wire = (list, what, signals, kindsOf, role) => {
        const path = `${at}.${what}`;
        if (!Array.isArray(list)) return bad("signals", path, "expected a list");
        if (list.length > factoryLimits.signals) bad("limit-exceeded", path, `at most ${factoryLimits.signals}`);
        const pairs = /* @__PURE__ */ new Set();
        const used = /* @__PURE__ */ new Set();
        list.forEach((w, i) => {
          const p = `${path}.${i}`;
          if (!record(w)) return bad("signal", p, "expected a wired signal");
          onlyKeys(w, ["id", "objectId", "signal", "variable"], p, out);
          need(w, ["id", "objectId", "signal", "variable"], p, out);
          claim(w.id, `${p}.id`);
          const kind = kinds.get(w.objectId);
          if (!kind) bad("object-missing", `${p}.objectId`, named(w.objectId, "object"));
          if (!signals.includes(w.signal))
            bad("signal", `${p}.signal`, `one of ${signals.join(", ")}`);
          else if (kind && !kindsOf[w.signal].includes(kind))
            bad("signal-kind", `${p}.signal`, `a ${kind} has no ${shown(w.signal)} signal`);
          const pair = `${shown(w.objectId)}\0${shown(w.signal)}`;
          if (kind && pairs.has(pair))
            bad("duplicate-signal", p, `${shown(w.signal)} of ${shown(w.objectId)} is wired twice`);
          pairs.add(pair);
          if (!vars) return;
          const v = vars.get(w.variable);
          if (!v) return bad("variable-missing", `${p}.variable`, named(w.variable, "variable"));
          if (v.type !== "BOOL" || v.role !== role)
            bad("variable-type", `${p}.variable`, `${v.name} must be a BOOL ${role}`);
          const key = v.name.toUpperCase();
          if (role === "input" && used.has(key))
            bad("duplicate-variable", `${p}.variable`, `${v.name} is wired to two sensors`);
          used.add(key);
        });
      };
      wire(c.sensors, "sensors", factorySensorSignals, factorySensorKinds, "input");
      wire(c.actuators, "actuators", factoryActuatorSignals, factoryActuatorKinds, "output");
    }
  }
  if (record(doc.run)) {
    const r = doc.run;
    onlyKeys(r, ["durationMs", "warmupMs", "seed"], "$.run", out);
    need(r, ["durationMs", "seed"], "$.run", out);
    if ("durationMs" in r && !int(r.durationMs, 1, T))
      bad("time", "$.run.durationMs", `1 to ${T} ms`);
    if ("warmupMs" in r && !int(r.warmupMs, 0, T)) bad("time", "$.run.warmupMs", `0 to ${T} ms`);
    if (typeof r.durationMs === "number" && typeof r.warmupMs === "number" && r.durationMs + r.warmupMs > T)
      bad("time", "$.run", "warm-up and duration together exceed one year");
    if ("seed" in r && !int(r.seed, 0, 4294967295)) bad("seed", "$.run.seed", "0 to 2\xB3\xB2\u22121");
  } else if ("run" in doc) bad("run", "$.run", "expected run settings");
  if ("experiment" in doc) checkExperiment(doc, out);
  return out;
}
var factorMax = {
  "buffer-capacity": factoryLimits.bufferCapacity,
  "parallel-count": factoryLimits.parallelCount,
  "fleet-count": factoryLimits.vehiclesPerFleet,
  "pool-count": factoryLimits.workersPerPool,
  "time-scale": factoryLimits.timeScalePercent
};
function checkExperiment(doc, out) {
  const bad = (code, path, message) => out.push({ code, path, message });
  const e = doc.experiment;
  if (!record(e)) return bad("experiment", "$.experiment", "expected an experiment");
  onlyKeys(e, ["replications", "factors"], "$.experiment", out);
  need(e, ["replications", "factors"], "$.experiment", out);
  if ("replications" in e && !int(e.replications, 1, factoryLimits.replications))
    bad("replications", "$.experiment.replications", `1 to ${factoryLimits.replications} replications`);
  if (!("factors" in e)) return;
  if (!Array.isArray(e.factors))
    return bad("experiment", "$.experiment.factors", "expected a list");
  if (e.factors.length > factoryLimits.experimentFactors)
    return bad("limit-exceeded", "$.experiment.factors", `at most ${factoryLimits.experimentFactors} factors`);
  const list = (v) => Array.isArray(v) ? v.filter(record) : [];
  const objects = new Map(list(doc.objects).map((o) => [o.id, o.kind]));
  const fleets = new Set(list(doc.fleets).map((f) => f.id));
  const pools = new Set(list(doc.workerPools).map((p) => p.id));
  const seen = /* @__PURE__ */ new Set();
  let combinations = 1;
  e.factors.forEach((f, i) => {
    const at = `$.experiment.factors.${i}`;
    if (!record(f)) return bad("factor", at, "expected a factor");
    onlyKeys(f, ["kind", "targetId", "values"], at, out);
    need(f, ["kind", "targetId", "values"], at, out);
    const kind = f.kind;
    if (!factoryFactorKinds.includes(kind)) return bad("factor", `${at}.kind`, "unknown factor");
    const id = f.targetId;
    const kindOf = typeof id === "string" ? objects.get(id) : void 0;
    const fits = typeof id === "string" && (kind === "buffer-capacity" ? kindOf === "buffer" : kind === "parallel-count" ? kindOf === "parallel" : kind === "time-scale" ? kindOf === "station" || kindOf === "parallel" || kindOf === "assembly" : kind === "fleet-count" ? fleets.has(id) : pools.has(id));
    if (!fits) bad("factor-target", `${at}.targetId`, `no fitting target for ${kind}`);
    if (typeof id === "string") {
      const key = `${kind}\0${id}`;
      if (seen.has(key)) bad("duplicate", at, "the same factor twice");
      seen.add(key);
    }
    if (!Array.isArray(f.values) || f.values.length < 1 || f.values.length > factoryLimits.factorValues)
      return bad("factor-values", `${at}.values`, `1 to ${factoryLimits.factorValues} values`);
    const values = /* @__PURE__ */ new Set();
    f.values.forEach((v, j) => {
      if (!int(v, 1, factorMax[kind]))
        bad("factor-values", `${at}.values.${j}`, `whole numbers 1 to ${factorMax[kind]}`);
      else if (values.has(v)) bad("duplicate", `${at}.values.${j}`, "a value twice");
      else values.add(v);
    });
    combinations *= f.values.length;
  });
  if (combinations > factoryLimits.experimentCombinations)
    bad(
      "limit-exceeded",
      "$.experiment.factors",
      `${combinations} combinations (at most ${factoryLimits.experimentCombinations})`
    );
}
function factoryWarnings(doc) {
  const out = [];
  const reach = /* @__PURE__ */ new Map();
  const byId2 = new Map(doc.objects.map((o) => [o.id, o]));
  const visit = (productId, from) => {
    for (const l of doc.links) {
      if (l.from !== from || l.productIds && !l.productIds.includes(productId)) continue;
      const seen = reach.get(productId) ?? /* @__PURE__ */ new Set();
      reach.set(productId, seen);
      if (seen.has(l.to)) continue;
      seen.add(l.to);
      const to = byId2.get(l.to);
      if (to?.kind === "assembly") {
        if (to.mainProductId === productId) visit(to.outputProductId ?? productId, to.id);
      } else visit(productId, l.to);
    }
  };
  for (const o of doc.objects)
    if (o.kind === "source") {
      for (const m of o.mix) if (m.weight > 0) visit(m.productId, o.id);
    }
  const reaches = (productId, id) => reach.get(productId)?.has(id) ?? false;
  doc.objects.forEach((o, i) => {
    const label = o.name || o.id;
    const ins = doc.links.some((l) => l.to === o.id);
    const outs = doc.links.some((l) => l.from === o.id);
    if (o.kind !== "source" && !ins)
      out.push({ code: "no-entry", path: `$.objects.${i}`, message: `${label}: no link in` });
    if (o.kind !== "drain" && !outs)
      out.push({ code: "no-exit", path: `$.objects.${i}`, message: `${label}: no link out` });
    if ((o.kind === "station" || o.kind === "parallel" || o.kind === "assembly") && o.workers) {
      const need2 = o.workers;
      const have = (doc.workerPools ?? []).filter((p) => need2.skill === void 0 || p.skills.includes(need2.skill)).reduce((n, p) => n + p.count, 0);
      if (have < need2.count)
        out.push({
          code: "workers-short",
          path: `$.objects.${i}.workers.count`,
          message: `${label}: needs ${need2.count} workers, the pools have ${have}`
        });
    }
    if (o.kind === "assembly") {
      if (ins && !reaches(o.mainProductId, o.id))
        out.push({
          code: "part-unreachable",
          path: `$.objects.${i}.mainProductId`,
          message: `${label}: no ${o.mainProductId} can get here`
        });
      o.components.forEach((c, j) => {
        if (ins && !reaches(c.productId, o.id))
          out.push({
            code: "part-unreachable",
            path: `$.objects.${i}.components.${j}`,
            message: `${label}: no ${c.productId} can get here`
          });
      });
    }
  });
  if (doc.paths && doc.fleets) {
    const next = /* @__PURE__ */ new Map();
    for (const g of doc.paths.segments) {
      next.set(g.from, [...next.get(g.from) ?? [], g.to]);
      if (g.twoWay) next.set(g.to, [...next.get(g.to) ?? [], g.from]);
    }
    const reachable = (a, b) => {
      const seen = /* @__PURE__ */ new Set([a]);
      const todo = [a];
      while (todo.length) {
        const n = todo.pop();
        if (n === b) return true;
        for (const m of next.get(n) ?? [])
          if (!seen.has(m)) {
            seen.add(m);
            todo.push(m);
          }
      }
      return false;
    };
    doc.links.forEach((l, i) => {
      const f = doc.fleets.find((x) => x.id === l.transport?.fleetId);
      const pick = byId2.get(l.from)?.pathNodeId;
      const drop = byId2.get(l.to)?.pathNodeId;
      if (!f || !pick || !drop) return;
      const stops = [f.homeNodeId, pick, drop, pick];
      for (let k = 0; k + 1 < stops.length; k++)
        if (!reachable(stops[k], stops[k + 1])) {
          out.push({
            code: "path-unreachable",
            path: `$.links.${i}.transport`,
            message: `${f.name || f.id}: no path from ${stops[k]} to ${stops[k + 1]}`
          });
          break;
        }
    });
  }
  return out;
}
function isFactoryDocument(input) {
  return validateFactory(input).length === 0;
}

// packages/factory-core/src/engine.ts
var factoryStates = Object.freeze([
  "working",
  "waiting",
  "blocked",
  "setup",
  "failed",
  "paused",
  "unstaffed",
  "transport",
  "held"
]);
var noVehicleStates = () => Object.fromEntries(factoryVehicleStates.map((s2) => [s2, 0]));
var noStates = () => Object.fromEntries(factoryStates.map((s2) => [s2, 0]));
var factoryHistogramBins = 20;
var EventQueue = class {
  heap = [];
  seq = 0;
  get size() {
    return this.heap.length;
  }
  push(time, kind, node, slot = 0, tag = 0) {
    const e = { time, seq: this.seq++, kind, node, slot, tag };
    const h = this.heap;
    h.push(e);
    let i = h.length - 1;
    while (i > 0) {
      const p = i - 1 >> 1;
      if (!before(h[i], h[p])) break;
      [h[i], h[p]] = [h[p], h[i]];
      i = p;
    }
  }
  peek() {
    return this.heap[0];
  }
  pop() {
    const h = this.heap;
    const top = h[0];
    const last = h.pop();
    if (h.length && last) {
      h[0] = last;
      let i = 0;
      for (; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && before(h[l], h[m])) m = l;
        if (r < h.length && before(h[r], h[m])) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m], h[i]];
        i = m;
      }
    }
    return top;
  }
};
var rank = (e) => e.kind === "shift" ? 0 : e.kind === "scan" ? 2 : 1;
var before = (a, b) => a.time < b.time || a.time === b.time && (rank(a) < rank(b) || rank(a) === rank(b) && a.seq < b.seq);
var Clock = class {
  constructor(states, now, log) {
    this.states = states;
    this.log = log;
    this.since = states.map(() => now);
    this.began = states.map(() => now);
  }
  totals = noStates();
  since;
  /** Since when each place is in its state, for the timeline (not reset at the warm-up). */
  began;
  set(slot, s2, now) {
    if (this.states[slot] === s2) return;
    this.totals[this.states[slot]] += now - this.since[slot];
    if (this.log && now > this.began[slot])
      this.log(this.began[slot], now, this.states[slot], slot);
    this.states[slot] = s2;
    this.since[slot] = now;
    this.began[slot] = now;
  }
  flush(now) {
    this.states.forEach((s2, i) => {
      this.totals[s2] += now - this.since[i];
      this.since[i] = now;
    });
  }
  /** Writes the open intervals at the end of the run. */
  close(now) {
    this.states.forEach((s2, i) => {
      if (this.log && now > this.began[i]) this.log(this.began[i], now, s2, i);
      this.began[i] = now;
    });
  }
  reset(now) {
    this.flush(now);
    this.totals = noStates();
  }
  /** FT6: since when the place is `held`, or -1. */
  heldSince(slot) {
    return this.states[slot] === "held" ? this.began[slot] : -1;
  }
};
var Node = class {
  constructor(sim, index, def, places, initial) {
    this.sim = sim;
    this.index = index;
    this.def = def;
    const log = sim.recorder?.stateLog(index);
    this.clock = new Clock(
      Array.from({ length: places }, () => initial),
      sim.now,
      log
    );
    this.contentSince = sim.now;
  }
  outs = [];
  ins = [];
  clock;
  blockedSince = -1;
  lastOut = -1;
  entered = 0;
  exited = 0;
  content = 0;
  maxContent = 0;
  contentArea = 0;
  contentSince;
  /** Working periods (start, end) after the warm-up, for the bottleneck analysis. */
  active = [];
  activeStart = -1;
  onEvent(_kind, _slot, _tag) {
  }
  /** FT3: outside its calendar's shifts. */
  offShift = false;
  /** FT3c: the parts that will leave, in order (a buffer: all of them; else the ready ones). */
  waitingParts() {
    return this.ready();
  }
  /** FT3c: links carried by vehicles out of this object. */
  transports = [];
  /** `transport` while a vehicle is called for one of its parts, else `blocked`. */
  blockedState() {
    return this.transports.some((t) => t.pending > 0) ? "transport" : "blocked";
  }
  setShift(on) {
    this.offShift = !on;
    this.refreshState();
  }
  get rng() {
    return this.sim.rngFor(this.index);
  }
  addContent(delta) {
    const now = this.sim.now;
    this.contentArea += this.content * (now - this.contentSince);
    this.contentSince = now;
    this.content += delta;
    if (this.content > this.maxContent) this.maxContent = this.content;
  }
  meanContent(now, period) {
    const area = this.contentArea + this.content * (now - this.contentSince);
    return period > 0 ? area / period : this.content;
  }
  resetStats(now) {
    this.clock.reset(now);
    this.entered = 0;
    this.exited = 0;
    this.contentArea = 0;
    this.contentSince = now;
    this.maxContent = this.content;
    this.active = [];
    if (this.activeStart >= 0) this.activeStart = now;
  }
  /** Marks whether the object is working (for the active-period bottleneck analysis). */
  setActive(on) {
    const now = this.sim.now;
    if (on && this.activeStart < 0) {
      const n = this.active.length;
      if (n && this.active[n - 1] === now) {
        this.activeStart = this.active[n - 2];
        this.active.length = n - 2;
      } else this.activeStart = now;
    } else if (!on && this.activeStart >= 0) {
      if (now > this.activeStart && this.sim.measuring) this.active.push(this.activeStart, now);
      this.activeStart = -1;
    }
  }
  closeActive(now) {
    if (this.activeStart >= 0 && now > this.activeStart) this.active.push(this.activeStart, now);
  }
  /** FT6: the PLC's gates (always on without control). */
  releaseOn = true;
  admitOn = true;
  admitOffSince = -1;
  setRelease(on) {
    if (this.releaseOn === on) return;
    this.releaseOn = on;
    this.sim.wake(this);
  }
  setAdmit(on) {
    if (this.admitOn === on) return;
    this.admitOn = on;
    this.admitOffSince = on ? -1 : this.sim.now;
    if (on) this.sim.wakeFeeders(this);
  }
  /** FT6 sensors. */
  sensorReady() {
    return this.ready().length > 0;
  }
  isFull() {
    return false;
  }
  isFailed() {
    return false;
  }
};
var SourceNode = class extends Node {
  held;
  made = 0;
  started = false;
  constructor(sim, index, def) {
    super(sim, index, def, 1, "waiting");
    sim.queue.push(def.startMs ?? 0, "create", index);
  }
  get source() {
    return this.def;
  }
  accepts() {
    return false;
  }
  receive() {
  }
  ready() {
    return this.held && !this.offShift ? [this.held] : [];
  }
  release() {
    this.held = void 0;
    this.addContent(-1);
    this.exited++;
    this.scheduleNext();
    this.refreshState();
  }
  done() {
    return this.source.limit !== void 0 && this.made >= this.source.limit;
  }
  scheduleNext() {
    if (this.done()) return;
    const gap = Math.max(1, sampleDistribution(this.source.interval, this.rng));
    this.sim.queue.push(this.sim.now + gap, "create", this.index);
  }
  /** A part fell due outside the shifts: it is made when the next shift starts. */
  due = false;
  setShift(on) {
    this.offShift = !on;
    if (on && this.due) {
      this.due = false;
      this.create();
    } else this.refreshState();
    if (on) this.sim.wake(this);
  }
  onEvent(kind) {
    if (kind !== "create" || this.done()) return;
    if (this.offShift) {
      this.due = true;
      return;
    }
    this.create();
  }
  create() {
    this.started = true;
    const mix = this.source.mix;
    const productId = mix.length === 1 ? mix[0].productId : mix[this.rng.pick(mix.map((m) => m.weight))].productId;
    this.held = this.sim.newPart(productId);
    this.sim.recorder?.move(this.sim.now, this.held, -1, this.index);
    this.made++;
    this.entered++;
    this.addContent(1);
    this.refreshState();
    this.sim.wake(this);
  }
  refreshState() {
    const s2 = this.offShift && (this.held || !this.done()) ? "paused" : this.held ? !this.releaseOn ? "held" : this.blockedSince >= 0 ? this.blockedState() : "working" : this.started && !this.done() ? "working" : "waiting";
    this.clock.set(0, s2, this.sim.now);
  }
};
var ProcessNode = class extends Node {
  places;
  /** Places whose part is finished, in the order they finished. */
  finished = [];
  constructor(sim, index, def, count) {
    super(sim, index, def, count, "waiting");
    this.places = Array.from({ length: count }, () => ({
      part: void 0,
      phase: "idle",
      left: 0,
      processMs: 0,
      since: -1,
      gen: 0,
      failed: false,
      upLeft: Infinity,
      last: void 0,
      staff: "none",
      crew: []
    }));
    if (def.failures)
      this.places.forEach((p, slot) => {
        if (this.operatingFailures) p.upLeft = this.uptime();
        else sim.queue.push(this.uptime(), "fail", index, slot);
      });
  }
  get proc() {
    return this.def;
  }
  get operatingFailures() {
    const f = this.proc.failures;
    return !!f && (f.basis ?? "operating") === "operating";
  }
  uptime() {
    return Math.max(
      1,
      sampleDistribution(this.proc.failures.uptime, this.sim.extraRng(this.index, "uptime"))
    );
  }
  /** Starts a part on a place: a setup first when the product changed. */
  begin(slot, productId, processMs) {
    const p = this.places[slot];
    const s2 = this.proc.setup;
    const setup = s2 && p.last !== void 0 && p.last !== productId ? s2.productTimes?.find((t) => t.productId === productId)?.time ?? s2.time : void 0;
    p.processMs = processMs;
    p.last = productId;
    if (setup) {
      p.phase = "setup";
      p.left = sampleDistribution(setup, this.sim.extraRng(this.index, "setup"));
    } else {
      p.phase = "process";
      p.left = processMs;
    }
    if (this.proc.workers) {
      p.staff = "waiting";
      this.sim.askWorkers(this, slot, this.proc.workers);
    }
    this.resume(slot);
    this.refreshState();
  }
  /** FT3b: workers set off for `slot`; they are there at `at`. */
  staffed(slot, crew, at) {
    const p = this.places[slot];
    p.crew = crew;
    p.staff = "walking";
    this.sim.queue.push(at, "arrive", this.index, slot);
    this.refreshState();
  }
  resume(slot) {
    const p = this.places[slot];
    if (p.since >= 0 || p.failed || this.offShift) return;
    if (p.staff === "waiting" || p.staff === "walking") return;
    if (p.phase !== "setup" && p.phase !== "process") return;
    p.since = this.sim.now;
    p.gen++;
    const dt = Math.min(p.left, this.operatingFailures ? p.upLeft : Infinity);
    this.sim.queue.push(this.sim.now + dt, "step", this.index, slot, p.gen);
  }
  pause(slot) {
    const p = this.places[slot];
    if (p.since < 0) return;
    const ran = this.sim.now - p.since;
    p.left -= ran;
    if (this.operatingFailures) p.upLeft -= ran;
    p.since = -1;
    p.gen++;
  }
  fail(slot) {
    const p = this.places[slot];
    this.pause(slot);
    p.failed = true;
    const repair = sampleDistribution(
      this.proc.failures.repair,
      this.sim.extraRng(this.index, "repair")
    );
    this.sim.queue.push(this.sim.now + repair, "repair", this.index, slot);
    this.refreshState();
  }
  /**
   * After a pause: ends a setup or a processing whose work is used up, and fails the place when
   * its operating uptime is used up (also at a shift end, so the repair runs off shift).
   */
  settle(slot) {
    const p = this.places[slot];
    if (p.left <= 0 && p.phase === "setup") {
      p.phase = "process";
      p.left = p.processMs;
    }
    if (p.left <= 0 && p.phase === "process") {
      p.phase = "done";
      if (p.crew.length) this.sim.freeWorkers(p.crew);
      p.crew = [];
      p.staff = "none";
      this.finished.push(slot);
      this.onFinished(slot);
      this.sim.wake(this);
    }
    if (this.operatingFailures && p.upLeft <= 0 && !p.failed) this.fail(slot);
  }
  /** The part of `slot` is processed (assemblies consume their components here). */
  onFinished(_slot) {
  }
  onEvent(kind, slot, tag) {
    const p = this.places[slot];
    if (kind === "step") {
      if (tag !== p.gen || p.since < 0) return;
      this.pause(slot);
      this.settle(slot);
      if (!p.failed) this.resume(slot);
      this.refreshState();
    } else if (kind === "arrive") {
      p.staff = "here";
      this.resume(slot);
      this.refreshState();
    } else if (kind === "fail") {
      if (!p.failed) this.fail(slot);
    } else if (kind === "repair") {
      p.failed = false;
      if (this.operatingFailures) p.upLeft = this.uptime();
      else this.sim.queue.push(this.sim.now + this.uptime(), "fail", this.index, slot);
      this.resume(slot);
      this.refreshState();
      this.sim.wake(this);
      this.sim.wakeFeeders(this);
    }
  }
  setShift(on) {
    this.offShift = !on;
    this.places.forEach((p, slot) => {
      if (on) this.resume(slot);
      else if (p.since >= 0) {
        this.pause(slot);
        this.settle(slot);
      }
    });
    this.refreshState();
    if (on) {
      this.sim.wake(this);
      this.sim.wakeFeeders(this);
    }
  }
  isFull() {
    return this.freePlace() < 0;
  }
  isFailed() {
    return this.places.some((p) => p.failed);
  }
  /** A place that can take a part now, or -1. */
  freePlace() {
    if (this.offShift) return -1;
    return this.places.findIndex((p) => p.phase === "idle" && !p.failed);
  }
  ready() {
    if (this.offShift) return [];
    return this.finished.filter((s2) => !this.places[s2].failed).map((s2) => this.places[s2].part);
  }
  release(part) {
    const slot = this.places.findIndex((p2) => p2.part === part);
    const p = this.places[slot];
    p.part = void 0;
    p.phase = "idle";
    this.finished.splice(this.finished.indexOf(slot), 1);
    this.exited++;
    this.addContent(-1);
    this.refreshState();
  }
  placeState(p) {
    if (p.failed) return "failed";
    if (this.offShift) return "paused";
    if (p.staff === "waiting" || p.staff === "walking") return "unstaffed";
    if (p.phase === "setup") return "setup";
    if (p.phase === "process") return "working";
    if (p.phase === "done")
      return !this.releaseOn ? "held" : this.blockedSince >= 0 ? this.blockedState() : "working";
    return "waiting";
  }
  refreshState() {
    this.places.forEach((p, slot) => this.clock.set(slot, this.placeState(p), this.sim.now));
    this.setActive(
      !this.offShift && this.places.every(
        (p) => p.failed || p.staff !== "waiting" && p.staff !== "walking" && (p.phase === "setup" || p.phase === "process")
      )
    );
  }
};
var StationNode = class extends ProcessNode {
  constructor(sim, index, def) {
    super(sim, index, def, def.kind === "parallel" ? def.count : 1);
  }
  get station() {
    return this.def;
  }
  accepts() {
    return this.freePlace() >= 0;
  }
  timeFor(productId) {
    return this.station.productTimes?.find((t) => t.productId === productId)?.time ?? this.station.processTime;
  }
  receive(part) {
    const slot = this.freePlace();
    this.places[slot].part = part;
    this.entered++;
    this.addContent(1);
    this.begin(slot, part.productId, sampleDistribution(this.timeFor(part.productId), this.rng));
  }
};
var AssemblyNode = class extends ProcessNode {
  have = /* @__PURE__ */ new Map();
  components = [];
  /** The main part while gathering, before processing starts. */
  main;
  constructor(sim, index, def) {
    super(sim, index, def, 1);
  }
  get assembly() {
    return this.def;
  }
  accepts(part) {
    if (this.freePlace() < 0) return false;
    if (part.productId === this.assembly.mainProductId) return !this.main;
    const need2 = this.assembly.components.find((c) => c.productId === part.productId);
    return !!need2 && (this.have.get(part.productId) ?? 0) < need2.count;
  }
  receive(part) {
    this.entered++;
    this.addContent(1);
    if (part.productId === this.assembly.mainProductId) this.main = part;
    else {
      this.have.set(part.productId, (this.have.get(part.productId) ?? 0) + 1);
      this.components.push(part);
    }
    if (this.main && this.assembly.components.every((c) => (this.have.get(c.productId) ?? 0) >= c.count)) {
      this.places[0].part = this.main;
      this.begin(0, this.main.productId, sampleDistribution(this.assembly.processTime, this.rng));
    }
  }
  onFinished() {
    const used = this.assembly.components.reduce((s2, c) => s2 + c.count, 0);
    this.addContent(-used);
    this.sim.consume(used);
    for (const c of this.components) this.sim.recorder?.move(this.sim.now, c, this.index, -1);
    this.components = [];
    this.have.clear();
    if (this.assembly.outputProductId) this.main.productId = this.assembly.outputProductId;
  }
  release(part) {
    this.main = void 0;
    super.release(part);
  }
};
var BufferNode = class extends Node {
  constructor(sim, index, capacity, lifo) {
    super(sim, index, sim.doc.objects[index], 1, "waiting");
    this.capacity = capacity;
    this.lifo = lifo;
  }
  parts = [];
  accepts() {
    return this.parts.length < this.capacity;
  }
  isFull() {
    return this.parts.length >= this.capacity;
  }
  receive(part) {
    this.parts.push(part);
    this.entered++;
    this.addContent(1);
    this.refreshState();
    this.sim.wake(this);
  }
  waitingParts() {
    return this.lifo ? [...this.parts].reverse() : this.parts;
  }
  /** Only the head (FIFO) or top (LIFO) may leave: a blocked one holds back the rest. */
  ready() {
    const part = this.lifo ? this.parts[this.parts.length - 1] : this.parts[0];
    return part ? [part] : [];
  }
  release(part) {
    this.parts.splice(this.parts.indexOf(part), 1);
    this.exited++;
    this.addContent(-1);
    this.refreshState();
  }
  refreshState() {
    this.clock.set(
      0,
      !this.parts.length ? "waiting" : !this.releaseOn ? "held" : this.blockedSince >= 0 ? this.blockedState() : "working",
      this.sim.now
    );
  }
};
var ConveyorNode = class extends Node {
  parts = [];
  travel;
  gap;
  capacity;
  lastEntryBelt = -Infinity;
  lastExitBelt = -Infinity;
  /** Total standing time, and since when it stands (-1 = moving). */
  stoppedTotal = 0;
  stoppedSince = -1;
  /** Non-accumulating: the head part waits at the end. */
  headStop = false;
  /** FT6: the PLC's `run`. */
  motorOn = true;
  wakeAt = -1;
  constructor(sim, index, def) {
    super(sim, index, def, 1, "waiting");
    this.travel = Math.ceil(def.lengthMm * 1e3 / def.speedMmS);
    this.gap = Math.ceil(def.partLengthMm * 1e3 / def.speedMmS);
    this.capacity = Math.floor(def.lengthMm / def.partLengthMm);
  }
  get conveyor() {
    return this.def;
  }
  belt(now = this.sim.now) {
    return now - this.stoppedTotal - (this.stoppedSince >= 0 ? now - this.stoppedSince : 0);
  }
  setStopped() {
    const stop = this.headStop || !this.motorOn;
    const now = this.sim.now;
    if (stop && this.stoppedSince < 0) {
      this.stoppedSince = now;
      this.sim.recorder?.belt(now, this.index, true);
    } else if (!stop && this.stoppedSince >= 0) {
      this.stoppedTotal += now - this.stoppedSince;
      this.stoppedSince = -1;
      this.sim.recorder?.belt(now, this.index, false);
    }
  }
  accepts() {
    if (this.parts.length >= this.capacity) return false;
    const due = this.lastEntryBelt + this.gap;
    if (this.belt() >= due) return true;
    if (this.stoppedSince < 0) this.schedule(this.sim.now + (due - this.belt()));
    return false;
  }
  isFull() {
    return this.parts.length >= this.capacity;
  }
  receive(part) {
    const belt = this.belt();
    this.parts.push({ part, belt });
    this.lastEntryBelt = belt;
    this.entered++;
    this.addContent(1);
    this.refreshState();
    this.planHead();
  }
  /** The belt time at which the head part is at the end. */
  headTarget() {
    const head = this.parts[0];
    return this.conveyor.accumulating ? Math.max(head.belt + this.travel, this.lastExitBelt + this.gap) : head.belt + this.travel;
  }
  /** The head part is at the end (whether or not the motor runs). */
  atEnd() {
    return this.parts.length > 0 && this.belt() >= this.headTarget();
  }
  /** When the head part may leave (real time), or Infinity while the belt stands short of it. */
  headReadyAt() {
    if (!this.parts.length || !this.motorOn) return Infinity;
    if (this.atEnd()) return this.sim.now;
    if (this.stoppedSince >= 0) return Infinity;
    return this.sim.now + (this.headTarget() - this.belt());
  }
  schedule(at) {
    if (this.wakeAt === at) return;
    this.wakeAt = at;
    this.sim.queue.push(at, "wake", this.index);
  }
  planHead() {
    const at = this.headReadyAt();
    if (at > this.sim.now && Number.isFinite(at)) this.schedule(at);
    else if (at <= this.sim.now) this.sim.wake(this);
  }
  onEvent(kind) {
    if (kind !== "wake") return;
    if (this.wakeAt === this.sim.now) this.wakeAt = -1;
    this.planHead();
    this.sim.wakeFeeders(this);
  }
  /** FT6: the motor turned on or off. */
  setMotor(on) {
    if (this.motorOn === on) return;
    this.motorOn = on;
    this.setStopped();
    this.refreshState();
    if (on) {
      this.planHead();
      this.sim.wakeFeeders(this);
    }
  }
  ready() {
    const head = this.parts[0];
    return head && this.headReadyAt() <= this.sim.now ? [head.part] : [];
  }
  sensorReady() {
    return this.atEnd();
  }
  release() {
    this.parts.shift();
    this.lastExitBelt = this.belt();
    this.headStop = false;
    this.setStopped();
    this.exited++;
    this.addContent(-1);
    this.refreshState();
    this.planHead();
    this.sim.wakeFeeders(this);
  }
  refreshState() {
    const blocked = this.blockedSince >= 0;
    const holding2 = !this.releaseOn && this.atEnd();
    if (!this.conveyor.accumulating && !this.headStop && (blocked || holding2)) {
      this.headStop = true;
      this.setStopped();
    }
    this.clock.set(
      0,
      !this.parts.length ? "waiting" : !this.motorOn || holding2 ? "held" : blocked ? this.blockedState() : "working",
      this.sim.now
    );
  }
};
var factoryVehicleStates = Object.freeze([
  "idle",
  "empty",
  "loaded",
  "handling",
  "traffic",
  "blocked",
  "charging"
]);
var AGV_CHECK = 0;
var AGV_LOADED = 1;
var AGV_UNLOADED = 2;
var AGV_CHARGED = 3;
var TransportNode = class extends Node {
  constructor(sim, index, link, from, fleet, pickup, drop) {
    super(
      sim,
      index,
      { id: link.id, name: link.id, kind: "buffer", capacity: 1 },
      1,
      "waiting"
    );
    this.link = link;
    this.from = from;
    this.fleet = fleet;
    this.pickup = pickup;
    this.drop = drop;
  }
  /** Vehicles called and not loaded yet (on their way, queued, or waiting at the pickup). */
  pending = 0;
  atPickup = [];
  atDrop = [];
  get to() {
    return this.outs[0].to;
  }
  accepts() {
    if (this.atPickup.length) return true;
    this.callFor();
    return false;
  }
  /** The parts waiting at `from` that this link may carry (its product filter). */
  eligible() {
    const only = this.link.productIds;
    const parts = this.from.waitingParts();
    return only ? parts.filter((p) => only.includes(p.productId)).length : parts.length;
  }
  /** One vehicle per part waiting at `from` (a buffer's whole queue) that this link carries. */
  callFor() {
    const want = this.eligible();
    while (this.pending < want) {
      this.pending++;
      this.sim.callVehicle(this);
    }
  }
  receive(part) {
    const v = this.atPickup.shift();
    this.pending--;
    this.sim.loadVehicle(v, part, this.from.index);
  }
  ready() {
    return this.atDrop.map((v) => v.part);
  }
  release(part) {
    const v = this.atDrop.splice(
      this.atDrop.findIndex((x) => x.part === part),
      1
    )[0];
    this.sim.vehicleDone(v);
  }
  refreshState() {
  }
};
var DrainNode = class extends Node {
  constructor(sim, index) {
    super(sim, index, sim.doc.objects[index], 1, "waiting");
  }
  accepts() {
    return true;
  }
  receive(part) {
    this.entered++;
    this.exited++;
    this.sim.removeFromModel(part);
  }
  ready() {
    return [];
  }
  release() {
  }
  refreshState() {
  }
};
var Recorder = class {
  constructor(doc, max) {
    this.max = max;
    this.states = doc.objects.map(() => []);
    this.products = new Map(doc.products.map((p, i) => [p.id, i]));
  }
  states;
  moves = [];
  count = 0;
  truncated = false;
  cut;
  products;
  /**
   * `at`: the simulation time now (records arrive in time order); `from`: when the record
   * begins. Past the limit the recording is cut where it is now, but what began by then is still
   * kept (a state is recorded when it ends; at most one per place, and the events of that
   * instant), so the replay is whole up to the cut.
   */
  room(at, from = at) {
    if (this.count >= this.max) {
      this.truncated = true;
      this.cut ??= at;
      return from <= this.cut;
    }
    this.count++;
    return true;
  }
  stateLog(index) {
    if (index >= this.states.length) return void 0;
    return (start, end, s2, place) => {
      if (this.room(end, start))
        this.states[index].push(start, end, factoryStates.indexOf(s2), place);
    };
  }
  move(time, part, from, to) {
    if (this.room(time))
      this.moves.push(time, part.id, this.products.get(part.productId) ?? -1, from, to);
  }
  walks = [];
  walk(start, arrive, w, to) {
    if (this.room(start)) this.walks.push(start, arrive, w.pool, w.index, to);
  }
  drives = [];
  drive(start, end, v, seg, forward) {
    if (this.room(start))
      this.drives.push(start, end, v.fleet, v.index, seg, forward ? 1 : 0, v.part?.id ?? -1);
  }
  belts = [];
  belt(time, object, stopped) {
    if (this.room(time)) this.belts.push(time, object, stopped ? 1 : 0);
  }
  loads = [];
  load(time, v, part, from) {
    if (this.room(time)) this.loads.push(time, v.fleet, v.index, part, from);
  }
  signals = [];
  signal(time, kind, index, value) {
    if (this.room(time)) this.signals.push(time, kind, index, value ? 1 : 0);
  }
  timeline() {
    return {
      states: this.states,
      moves: this.moves,
      walks: this.walks,
      drives: this.drives,
      loads: this.loads,
      belts: this.belts,
      signals: this.signals,
      truncated: this.truncated,
      ...this.cut !== void 0 ? { recordedUntilMs: this.cut } : {}
    };
  }
};
function calendarOn(cal, t) {
  const r = t % cal.cycleMs;
  return cal.shifts.some((s2) => s2.startMs <= r && r < s2.endMs);
}
function nextCalendarChange(cal, t) {
  const on = calendarOn(cal, t);
  const bounds = [
    ...new Set(cal.shifts.flatMap((s2) => [s2.startMs % cal.cycleMs, s2.endMs % cal.cycleMs]))
  ].sort((a, b) => a - b);
  const base = t - t % cal.cycleMs;
  for (let k = 0; k < 3; k++)
    for (const b of bounds) {
      const at = base + k * cal.cycleMs + b;
      if (at > t && calendarOn(cal, at) !== on) return at;
    }
  return Infinity;
}
function leadTimeSpread(values, min, max) {
  const sorted = Float64Array.from(values).sort();
  const rank3 = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] : 0;
  const histogram = Array.from({ length: factoryHistogramBins }, () => 0);
  if (sorted.length) {
    const width = (max - min) / factoryHistogramBins;
    for (const v of sorted)
      histogram[width > 0 ? Math.min(factoryHistogramBins - 1, Math.floor((v - min) / width)) : 0]++;
  }
  return { p50Ms: rank3(0.5), p90Ms: rank3(0.9), p95Ms: rank3(0.95), histogram };
}
var Sim = class {
  constructor(doc, seed, warmup, maxRecords) {
    this.doc = doc;
    this.seed = seed;
    this.warmup = warmup;
    this.flows = doc.links.map(() => 0);
    if (maxRecords !== void 0) this.recorder = new Recorder(doc, maxRecords);
    this.measuring = warmup === 0;
    this.rngs = doc.objects.map((o) => new FactoryRandom(seed, o.id));
    const byId2 = /* @__PURE__ */ new Map();
    doc.objects.forEach((o, i) => {
      const node = o.kind === "source" ? new SourceNode(this, i, o) : o.kind === "station" || o.kind === "parallel" ? new StationNode(this, i, o) : o.kind === "assembly" ? new AssemblyNode(this, i, o) : o.kind === "buffer" ? new BufferNode(this, i, o.capacity, o.order === "lifo") : o.kind === "conveyor" ? new ConveyorNode(this, i, o) : new DrainNode(this, i);
      this.nodes.push(node);
      byId2.set(o.id, node);
    });
    this.setUpPaths();
    for (const link of doc.links) {
      const from = byId2.get(link.from);
      const to = byId2.get(link.to);
      if (link.transport) {
        const fleet = doc.fleets.findIndex((f) => f.id === link.transport.fleetId);
        const t = new TransportNode(
          this,
          this.nodes.length,
          link,
          from,
          fleet,
          this.pathIndex.get(from.def.pathNodeId),
          this.pathIndex.get(to.def.pathNodeId)
        );
        this.nodes.push(t);
        from.transports.push(t);
        from.outs.push({ link, to: t, index: doc.links.indexOf(link) });
        t.ins.push(from);
        t.outs.push({ link, to, index: -1 });
        if (!to.ins.includes(t)) to.ins.push(t);
        continue;
      }
      from.outs.push({ link, to, index: doc.links.indexOf(link) });
      if (!to.ins.includes(from)) to.ins.push(from);
    }
    this.queued = this.nodes.map(() => false);
    if (warmup > 0) this.queue.push(warmup, "warmup", -1);
    const calendars = new Map((doc.calendars ?? []).map((c, i) => [c.id, i]));
    this.byCalendar = (doc.calendars ?? []).map(() => []);
    doc.objects.forEach((o, i) => {
      if (o.calendarId !== void 0)
        this.byCalendar[calendars.get(o.calendarId)].push(this.nodes[i]);
    });
    (doc.calendars ?? []).forEach((_, c) => this.shift(c));
    this.workers = (doc.workerPools ?? []).map(
      (p, pool) => Array.from({ length: p.count }, (_, index) => ({
        pool,
        index,
        x: p.home?.x ?? 0,
        y: p.home?.y ?? 0,
        busy: false,
        busySince: 0,
        busyMs: 0,
        walkMs: 0,
        walkFrom: 0,
        walkTo: 0
      }))
    );
    this.waitSum = this.workers.map(() => 0);
    this.waitCount = this.workers.map(() => 0);
    if (doc.control) this.setUpControl(doc.control, byId2);
  }
  now = 0;
  queue = new EventQueue();
  nodes = [];
  measuring;
  rngs;
  nextPartId = 1;
  work = [];
  queued = [];
  // statistics
  wip = 0;
  wipArea = 0;
  wipSince = 0;
  wipMax = 0;
  produced = 0;
  /** No prototype: product IDs such as `toString` are ordinary keys. */
  producedByProduct = /* @__PURE__ */ Object.create(null);
  assembled = 0;
  leadSum = 0;
  leadMin = Infinity;
  leadMax = 0;
  leadTimes = [];
  flows;
  recorder;
  /** FT6. */
  lastMoveMs = -1;
  plc;
  /** FT6: wires the program's variables, sets the actuators to the outputs' initial values. */
  setUpControl(control, byId2) {
    const vars = ladderVariableMap(control.program);
    const wire = (w) => ({
      node: byId2.get(w.objectId),
      def: w,
      name: vars.get(w.variable).name
    });
    const state = ladderInitialState(control.program);
    this.plc = {
      control,
      sensors: control.sensors.map(wire),
      actuators: control.actuators.map(wire),
      state,
      power: /* @__PURE__ */ Object.create(null),
      scans: 0,
      seen: [control.sensors.map(() => -1), control.actuators.map(() => -1)]
    };
    this.actuate();
    this.queue.push(0, "scan", -1);
  }
  /** FT6: one PLC scan: sensors in, the program, actuators out; plans the next scan. */
  scan() {
    const plc = this.plc;
    const inputs = /* @__PURE__ */ Object.create(null);
    plc.sensors.forEach((w, i) => {
      const n = w.node;
      const v = w.def.signal === "occupied" ? n.content > 0 : w.def.signal === "ready" ? n.sensorReady() : w.def.signal === "blocked" ? n.blockedSince >= 0 : w.def.signal === "full" ? n.isFull() : n.isFailed();
      inputs[w.name] = v;
      this.note(0, i, v);
    });
    const r = ladderScan(plc.control.program, plc.state, inputs);
    plc.state = r.state;
    plc.power = r.power;
    plc.scans++;
    this.actuate();
    this.queue.push(this.now + plc.control.program.scanMs, "scan", -1);
  }
  /** Records a wired signal's value when it changed (the first scan records them all). */
  note(kind, index, value) {
    const seen = this.plc.seen[kind];
    const v = value ? 1 : 0;
    if (seen[index] === v) return;
    seen[index] = v;
    this.recorder?.signal(this.now, kind, index, value);
  }
  actuate() {
    const plc = this.plc;
    plc.actuators.forEach((w, i) => {
      const on = plc.state.values[w.name] === true;
      if (plc.scans > 0) this.note(1, i, on);
      const n = w.node;
      if (w.def.signal === "run") n.setMotor(on);
      else if (w.def.signal === "release") n.setRelease(on);
      else n.setAdmit(on);
    });
  }
  /** FT6: objects the PLC has held for at least `stallMs` at the end. */
  stalls(end) {
    const plc = this.plc;
    const limit = plc.control.stallMs ?? 6e4;
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const w of plc.actuators) {
      const n = w.node;
      if (seen.has(n)) continue;
      let since = -1;
      let signal = "release";
      n.clock.states.forEach((_, slot) => {
        const h = n.clock.heldSince(slot);
        if (h >= 0 && (since < 0 || h < since)) since = h;
      });
      if (since >= 0 && n instanceof ConveyorNode && !n.motorOn) signal = "run";
      if (since < 0 && !n.admitOn) {
        const feeders = n.ins.filter((f) => f.blockedSince >= 0).map((f) => f.blockedSince);
        if (feeders.length) {
          since = Math.max(n.admitOffSince, Math.min(...feeders));
          signal = "admit";
        }
      }
      if (since >= 0 && end - since >= limit) {
        seen.add(n);
        out.push({ objectId: n.def.id, signal, sinceMs: since });
      }
    }
    return out;
  }
  byCalendar;
  // FT3c vehicles
  pathIndex = /* @__PURE__ */ new Map();
  pathXY = [];
  segLen = [];
  segHolder = [];
  segQueue = [];
  adj = [];
  routes = /* @__PURE__ */ new Map();
  vehicles = [];
  calls = [];
  callWaits = [];
  deadlock;
  setUpPaths() {
    const paths = this.doc.paths;
    paths?.nodes.forEach((n, i) => {
      this.pathIndex.set(n.id, i);
      this.pathXY.push({ x: n.x, y: n.y });
      this.adj.push([]);
    });
    paths?.segments.forEach((g, k) => {
      const a = this.pathIndex.get(g.from);
      const b = this.pathIndex.get(g.to);
      const len = Math.hypot(
        this.pathXY[a].x - this.pathXY[b].x,
        this.pathXY[a].y - this.pathXY[b].y
      );
      this.segLen.push(len);
      this.segHolder.push(-1);
      this.segQueue.push([]);
      this.adj[a].push({ seg: k, to: b, forward: true, len });
      if (g.twoWay) this.adj[b].push({ seg: k, to: a, forward: false, len });
    });
    (this.doc.fleets ?? []).forEach((f, fleet) => {
      this.callWaits.push({ sum: 0, n: 0 });
      for (let index = 0; index < f.count; index++)
        this.vehicles.push({
          id: this.vehicles.length,
          fleet,
          index,
          node: this.pathIndex.get(f.homeNodeId),
          seg: -1,
          waitSeg: -1,
          next: -1,
          path: [],
          task: "idle",
          part: void 0,
          job: void 0,
          callAt: 0,
          charge: f.battery?.capacityMs ?? Infinity,
          stat: "idle",
          since: 0,
          totals: noVehicleStates(),
          trips: 0
        });
    });
  }
  /** Shortest distances (mm) from path node `src` (Dijkstra), cached. */
  route(src) {
    let r = this.routes.get(src);
    if (r) return r;
    const n = this.pathXY.length;
    const dist = new Float64Array(n).fill(Infinity);
    const via = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    dist[src] = 0;
    for (; ; ) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || dist[u] === Infinity) break;
      done[u] = 1;
      this.adj[u].forEach((e, k) => {
        if (dist[u] + e.len < dist[e.to]) {
          dist[e.to] = dist[u] + e.len;
          via[e.to] = u * 65536 + k;
        }
      });
    }
    r = { dist, via };
    this.routes.set(src, r);
    return r;
  }
  pathTo(src, dst) {
    const { via } = this.route(src);
    const steps = [];
    for (let at = dst; at !== src; ) {
      const v = via[at];
      if (v < 0) return void 0;
      const u = Math.floor(v / 65536);
      const e = this.adj[u][v % 65536];
      steps.unshift({ seg: e.seg, to: e.to, forward: e.forward });
      at = u;
    }
    return steps;
  }
  vehicleStat(v) {
    const s2 = v.task === "idle" ? "idle" : v.task === "charging" ? "charging" : v.task === "atDrop" ? "blocked" : v.task === "atPickup" || v.task === "loading" || v.task === "unloading" ? "handling" : v.waitSeg >= 0 ? "traffic" : v.task === "toDrop" ? "loaded" : "empty";
    v.totals[v.stat] += this.now - v.since;
    v.since = this.now;
    v.stat = s2;
  }
  setTask(v, task) {
    this.vehicleStat(v);
    v.task = task;
    this.vehicleStat(v);
  }
  fleetOf(v) {
    return this.doc.fleets[v.fleet];
  }
  /** Takes the next segment of the vehicle's path, or waits for it; arrives at the end. */
  driveOn(v) {
    const step = v.path[0];
    if (!step) return this.arrived(v);
    const q = this.segQueue[step.seg];
    const h = this.segHolder[step.seg];
    if (h >= 0 && h !== v.id || h < 0 && q.length && q[0] !== v.id) {
      if (v.waitSeg !== step.seg) {
        this.vehicleStat(v);
        v.waitSeg = step.seg;
        q.push(v.id);
        this.vehicleStat(v);
        this.checkDeadlock(v);
      }
      return;
    }
    if (q[0] === v.id) q.shift();
    const before2 = v.seg;
    this.segHolder[step.seg] = v.id;
    this.vehicleStat(v);
    v.seg = step.seg;
    v.waitSeg = -1;
    v.path.shift();
    v.node = -1;
    v.next = step.to;
    this.vehicleStat(v);
    if (before2 >= 0 && before2 !== step.seg) this.freeSegment(before2);
    const t = Math.max(1, Math.ceil(this.segLen[step.seg] * 1e3 / this.fleetOf(v).speedMmS));
    v.charge -= t;
    this.recorder?.drive(this.now, this.now + t, v, step.seg, step.forward);
    this.queue.push(this.now + t, "drive", v.id);
  }
  driven(v) {
    v.node = v.next;
    this.driveOn(v);
  }
  freeSegment(seg) {
    this.segHolder[seg] = -1;
    const w = this.segQueue[seg][0];
    if (w !== void 0) this.driveOn(this.vehicles[w]);
  }
  /** Follows who waits for whom; a circle back to `v` is a deadlock. */
  checkDeadlock(v) {
    const chain = [];
    let cur = v;
    for (let i = 0; i <= this.vehicles.length; i++) {
      chain.push(cur);
      if (cur.waitSeg < 0) return;
      const h = this.segHolder[cur.waitSeg];
      if (h < 0) return;
      if (h === v.id) {
        this.deadlock = {
          atMs: this.now,
          vehicles: chain.map((x) => `${this.fleetOf(x).id}#${x.index + 1}`),
          segments: chain.map((x) => this.doc.paths.segments[x.seg]?.id ?? "")
        };
        return;
      }
      cur = this.vehicles[h];
    }
  }
  arrived(v) {
    if (v.seg >= 0) {
      const s2 = v.seg;
      v.seg = -1;
      this.freeSegment(s2);
    }
    const f = this.fleetOf(v);
    if (v.task === "toPickup") {
      this.setTask(v, "atPickup");
      if (this.measuring) {
        this.callWaits[v.fleet].sum += this.now - v.callAt;
        this.callWaits[v.fleet].n++;
      }
      v.job.atPickup.push(v);
      this.wake(v.job.from);
      this.queue.push(this.now, "agv", v.id, AGV_CHECK);
    } else if (v.task === "toDrop") {
      this.setTask(v, "unloading");
      this.queue.push(this.now + f.unloadMs, "agv", v.id, AGV_UNLOADED);
    } else if (v.task === "toCharger") {
      this.setTask(v, "charging");
      const b = f.battery;
      const need2 = Math.max(0, b.capacityMs - v.charge);
      this.queue.push(
        this.now + Math.ceil(need2 / b.capacityMs * b.chargeMs),
        "agv",
        v.id,
        AGV_CHARGED
      );
    }
  }
  vehicleEvent(v, what) {
    if (what === AGV_CHECK) {
      if (v.task !== "atPickup") return;
      const tn = v.job;
      tn.atPickup.splice(tn.atPickup.indexOf(v), 1);
      tn.pending--;
      tn.from.refreshState();
      v.job = void 0;
      this.vehicleIdle(v);
    } else if (what === AGV_LOADED) {
      this.setTask(v, "toDrop");
      v.path = this.pathTo(v.node, v.job.drop) ?? [];
      this.driveOn(v);
    } else if (what === AGV_UNLOADED) {
      this.setTask(v, "atDrop");
      v.job.atDrop.push(v);
      this.wake(v.job);
    } else if (what === AGV_CHARGED) {
      v.charge = this.fleetOf(v).battery.capacityMs;
      this.vehicleIdle(v);
    }
  }
  callVehicle(tn) {
    this.calls.push({ tn, since: this.now });
    this.assignVehicles();
  }
  loadVehicle(v, part, from) {
    v.part = part;
    this.recorder?.load(this.now, v, part.id, from);
    this.setTask(v, "loading");
    if (this.measuring) v.trips++;
    this.queue.push(this.now + this.fleetOf(v).loadMs, "agv", v.id, AGV_LOADED);
  }
  vehicleDone(v) {
    v.part = void 0;
    v.job = void 0;
    this.vehicleIdle(v);
  }
  vehicleIdle(v) {
    this.setTask(v, "idle");
    const b = this.fleetOf(v).battery;
    if (b && v.charge < b.rechargeBelow * b.capacityMs && this.sendToCharger(v)) return;
    this.assignVehicles();
  }
  sendToCharger(v) {
    const b = this.fleetOf(v).battery;
    const path = this.pathTo(v.node, this.pathIndex.get(b.chargerNodeId));
    if (!path) return false;
    this.setTask(v, "toCharger");
    v.path = path;
    this.driveOn(v);
    return true;
  }
  /** FT3c: the driving time from `src` to `dst` on the shortest path, as `driveOn` counts it. */
  driveMs(src, dst, fleet) {
    const path = this.pathTo(src, dst);
    if (!path) return Infinity;
    const speed = this.doc.fleets[fleet].speedMmS;
    return path.reduce(
      (t, step) => t + Math.max(1, Math.ceil(this.segLen[step.seg] * 1e3 / speed)),
      0
    );
  }
  /** Serves the calls in order, each by the nearest idle vehicle of its fleet that can get there. */
  assignVehicles() {
    for (let i = 0; i < this.calls.length; i++) {
      const c = this.calls[i];
      if (c.tn.pending > c.tn.eligible()) {
        c.tn.pending--;
        this.calls.splice(i--, 1);
        continue;
      }
      if (this.route(c.tn.pickup).dist[c.tn.drop] === Infinity) continue;
      const battery = this.doc.fleets[c.tn.fleet].battery;
      const carry = battery ? this.driveMs(c.tn.pickup, c.tn.drop, c.tn.fleet) : 0;
      let best;
      let bestD = Infinity;
      let low;
      for (const v of this.vehicles) {
        if (v.fleet !== c.tn.fleet || v.task !== "idle") continue;
        const d = this.route(v.node).dist[c.tn.pickup];
        if (battery && v.charge < this.driveMs(v.node, c.tn.pickup, v.fleet) + carry) {
          if (v.charge < battery.capacityMs) low ??= v;
          continue;
        }
        if (d < bestD) {
          best = v;
          bestD = d;
        }
      }
      if (!best) {
        if (low) this.sendToCharger(low);
        continue;
      }
      this.calls.splice(i--, 1);
      best.job = c.tn;
      best.callAt = c.since;
      this.setTask(best, "toPickup");
      best.path = this.pathTo(best.node, c.tn.pickup) ?? [];
      this.driveOn(best);
    }
  }
  // FT3b workers
  workers = [];
  asks = [];
  waitSum = [];
  waitCount = [];
  /** Wait samples whose crew is still walking (they may arrive after the end). */
  unarrived = [];
  poolsFor(need2) {
    return (this.doc.workerPools ?? []).map((_, i) => i).filter(
      (i) => need2.skill === void 0 || this.doc.workerPools[i].skills.includes(need2.skill)
    );
  }
  askWorkers(node, slot, need2) {
    this.asks.push({ node, slot, need: need2, since: this.now });
    this.assignWorkers();
  }
  freeWorkers(crew) {
    for (const w of crew) {
      w.busy = false;
      if (this.measuring) w.busyMs += this.now - Math.max(w.busySince, this.warmup);
    }
    this.assignWorkers();
  }
  /** Serves the requests in order; each takes the nearest free workers that can do it. */
  assignWorkers() {
    for (let i = 0; i < this.asks.length; i++) {
      const a = this.asks[i];
      const pos = a.node.def.at ?? { x: 0, y: 0 };
      const free = [];
      for (const pool of this.poolsFor(a.need))
        for (const w of this.workers[pool])
          if (!w.busy) free.push({ w, d: Math.hypot(w.x - pos.x, w.y - pos.y) });
      if (free.length < a.need.count) continue;
      free.sort((p, q) => p.d - q.d || p.w.pool - q.w.pool || p.w.index - q.w.index);
      const crew = free.slice(0, a.need.count);
      let arrive = this.now;
      for (const { w, d } of crew) {
        const speed = this.doc.workerPools[w.pool].walkSpeedMmS;
        const at = this.now + Math.ceil(d * 1e3 / speed);
        if (this.measuring) w.walkMs += at - this.now;
        w.walkFrom = this.now;
        w.walkTo = at;
        this.recorder?.walk(this.now, at, w, a.node.index);
        w.busy = true;
        w.busySince = this.now;
        w.x = pos.x;
        w.y = pos.y;
        arrive = Math.max(arrive, at);
      }
      if (arrive >= this.warmup) {
        this.unarrived = this.unarrived.filter((u) => u.at > this.now);
        for (const pool of new Set(crew.map((c) => c.w.pool))) {
          this.waitSum[pool] += arrive - a.since;
          this.waitCount[pool]++;
          if (arrive > this.now) this.unarrived.push({ at: arrive, wait: arrive - a.since, pool });
        }
      }
      this.asks.splice(i--, 1);
      a.node.staffed(
        a.slot,
        crew.map((c) => c.w),
        arrive
      );
    }
  }
  rngFor(i) {
    return this.rngs[i];
  }
  extra = /* @__PURE__ */ new Map();
  /**
   * FT3: a stream of its own per object and purpose (uptime, repair, setup), so that adding
   * failures or setups does not change the processing times drawn (common random numbers).
   */
  extraRng(i, purpose) {
    const key = `${i}:${purpose}`;
    let r = this.extra.get(key);
    if (!r)
      this.extra.set(
        key,
        r = new FactoryRandom(this.seed, `${this.doc.objects[i].id}\0${purpose}`)
      );
    return r;
  }
  /** FT3: turns the objects of calendar `c` on or off, and plans its next change. */
  shift(c) {
    const cal = this.doc.calendars[c];
    const on = calendarOn(cal, this.now);
    for (const n of this.byCalendar[c]) if (n.offShift === on) n.setShift(on);
    const next = nextCalendarChange(cal, this.now);
    if (Number.isFinite(next)) this.queue.push(next, "shift", c);
  }
  newPart(productId) {
    this.setWip(this.wip + 1);
    return { id: this.nextPartId++, productId, createdAt: this.now };
  }
  setWip(n) {
    this.wipArea += this.wip * (this.now - this.wipSince);
    this.wipSince = this.now;
    this.wip = n;
    if (n > this.wipMax) this.wipMax = n;
  }
  /** `count` components became part of an assembled part. */
  consume(count) {
    this.setWip(this.wip - count);
    if (this.measuring) this.assembled += count;
  }
  removeFromModel(part) {
    this.setWip(this.wip - 1);
    if (!this.measuring) return;
    this.produced++;
    this.producedByProduct[part.productId] = (this.producedByProduct[part.productId] ?? 0) + 1;
    const lead = this.now - part.createdAt;
    this.leadSum += lead;
    if (this.leadTimes.length < factoryLimits.events) this.leadTimes.push(lead);
    this.leadMin = Math.min(this.leadMin, lead);
    this.leadMax = Math.max(this.leadMax, lead);
  }
  /** Asks `node` to hand on its ready parts after the current event. */
  wake(node) {
    if (this.queued[node.index]) return;
    this.queued[node.index] = true;
    this.work.push(node);
  }
  /** Room opened in `node`: its blocked feeders try again, longest-blocked first. */
  wakeFeeders(node) {
    const waiting = node.ins.filter((n) => n.blockedSince >= 0);
    waiting.sort((a, b) => a.blockedSince - b.blockedSince || a.index - b.index);
    waiting.forEach((n) => this.wake(n));
  }
  target(node, part) {
    const outs = node.outs;
    const open = (i) => {
      const o = outs[i];
      return (!o.link.productIds || o.link.productIds.includes(part.productId)) && o.to.admitOn && o.to.accepts(part);
    };
    const queued = (to) => (to instanceof TransportNode ? to.to : to).content;
    const strategy = node.def.exit ?? "first-free";
    if (strategy === "cyclic") {
      for (let k = 1; k <= outs.length; k++) {
        const i = (node.lastOut + k) % outs.length;
        if (open(i)) return node.lastOut = i, outs[i];
      }
      return void 0;
    }
    let best = -1;
    for (let i = 0; i < outs.length; i++) {
      if (!open(i)) continue;
      if (strategy === "first-free") return outs[i];
      if (best < 0 || queued(outs[i].to) < queued(outs[best].to)) best = i;
    }
    return best < 0 ? void 0 : outs[best];
  }
  /** Hands on every ready part of `node` that some successor accepts. */
  forward(node) {
    const ready = () => node.releaseOn ? node.ready() : [];
    for (; ; ) {
      let moved = false;
      for (const part of ready()) {
        const out = this.target(node, part);
        if (!out) continue;
        node.blockedSince = -1;
        node.release(part);
        if (this.measuring && out.index >= 0) this.flows[out.index]++;
        if (!(out.to instanceof TransportNode))
          this.recorder?.move(
            this.now,
            part,
            node instanceof TransportNode ? node.from.index : node.index,
            out.to.index
          );
        out.to.receive(part);
        this.lastMoveMs = this.now;
        this.wakeFeeders(node);
        moved = true;
        break;
      }
      if (!moved) break;
    }
    const stuck = ready().length > 0;
    if (stuck && node.blockedSince < 0) node.blockedSince = this.now;
    if (!stuck) node.blockedSince = -1;
    node.refreshState();
  }
  drain() {
    while (this.work.length) {
      const node = this.work.shift();
      this.queued[node.index] = false;
      this.forward(node);
    }
  }
  /** Events handled so far, over every slice of the run. */
  handled = 0;
  /** True once the run reached its end or a deadlock. */
  ended = false;
  /**
   * #17: handles events up to `end`, at most `budget` of them in this call, and stops with
   * `event-limit` past `maxEvents` in all. A later call goes on from the next event: a run handled
   * in slices takes the same steps as one handled at once.
   */
  advance(end, maxEvents, budget = Infinity) {
    let here = 0;
    for (; ; ) {
      const e = this.queue.peek();
      if (!e || e.time > end) break;
      if (here >= budget && !(e.kind === "shift" && this.inShifts)) return false;
      this.queue.pop();
      here++;
      if (++this.handled > maxEvents)
        throw new FactoryValidationError("event-limit", `more than ${maxEvents} events`);
      this.now = e.time;
      if (e.kind === "warmup") this.startMeasuring();
      else if (e.kind === "shift") this.shift(e.node);
      else if (e.kind === "drive") this.driven(this.vehicles[e.node]);
      else if (e.kind === "agv") this.vehicleEvent(this.vehicles[e.node], e.slot);
      else if (e.kind === "scan") this.scan();
      else this.nodes[e.node].onEvent(e.kind, e.slot, e.tag);
      const next = this.queue.peek();
      this.inShifts = e.kind === "shift" && next?.kind === "shift" && next.time === e.time;
      if (this.inShifts) continue;
      this.drain();
      if (this.deadlock) {
        if (!this.measuring) this.startMeasuring();
        this.ended = true;
        return true;
      }
    }
    this.now = end;
    this.ended = true;
    return true;
  }
  inShifts = false;
  run(end, maxEvents) {
    this.advance(end, maxEvents);
    return this.handled;
  }
  startMeasuring() {
    this.measuring = true;
    this.wipArea = 0;
    this.wipSince = this.now;
    this.wipMax = this.wip;
    for (const n of this.nodes) n.resetStats(this.now);
    for (const v of this.vehicles) {
      this.vehicleStat(v);
      v.totals = noVehicleStates();
      v.trips = 0;
    }
    this.callWaits = this.callWaits.map(() => ({ sum: 0, n: 0 }));
    for (const ws of this.workers)
      for (const w of ws) {
        w.busyMs = 0;
        w.walkMs = Math.max(0, w.walkTo - this.now);
      }
  }
  finish(start, events, seed) {
    const end = this.now;
    const period = end - start;
    const stalls = this.plc ? this.stalls(end) : [];
    for (const u of this.unarrived)
      if (u.at > end) {
        this.waitSum[u.pool] -= u.wait;
        this.waitCount[u.pool]--;
      }
    this.unarrived = [];
    this.wipArea += this.wip * (end - this.wipSince);
    for (const v of this.vehicles) this.vehicleStat(v);
    const objects = this.nodes.slice(0, this.doc.objects.length).map((n) => {
      n.clock.flush(end);
      n.clock.close(end);
      n.closeActive(end);
      const places = n.clock.states.length;
      const states = { ...n.clock.totals };
      for (const s2 of factoryStates) states[s2] /= places;
      return {
        id: n.def.id,
        kind: n.def.kind,
        states,
        entered: n.entered,
        exited: n.exited,
        meanContent: n.meanContent(end, period),
        maxContent: n.maxContent
      };
    });
    return {
      seed,
      startMs: start,
      endMs: end,
      events,
      produced: this.produced,
      producedByProduct: Object.fromEntries(Object.entries(this.producedByProduct)),
      throughputPerHour: period > 0 ? this.produced * 36e5 / period : 0,
      leadTime: {
        count: this.produced,
        meanMs: this.produced ? this.leadSum / this.produced : 0,
        minMs: this.produced ? this.leadMin : 0,
        maxMs: this.leadMax,
        ...leadTimeSpread(this.leadTimes, this.leadMin, this.leadMax)
      },
      wip: { mean: period > 0 ? this.wipArea / period : this.wip, max: this.wipMax },
      flows: Object.fromEntries(this.doc.links.map((l, i) => [l.id, this.flows[i]])),
      assembled: this.assembled,
      objects,
      workers: (this.doc.workerPools ?? []).map((p, pool) => {
        const ws = this.workers[pool];
        let busy = 0;
        let walk = 0;
        for (const w of ws) {
          busy += w.busyMs + (w.busy ? end - Math.max(w.busySince, start) : 0);
          walk += w.walkMs - Math.max(0, w.walkTo - Math.max(end, w.walkFrom, start));
        }
        return {
          poolId: p.id,
          count: p.count,
          busyShare: period > 0 ? busy / ws.length / period : 0,
          walkShare: period > 0 ? walk / ws.length / period : 0,
          meanWaitMs: this.waitCount[pool] ? this.waitSum[pool] / this.waitCount[pool] : 0
        };
      }),
      fleets: (this.doc.fleets ?? []).map((f, fleet) => {
        const vs = this.vehicles.filter((v) => v.fleet === fleet);
        const shares = Object.fromEntries(
          factoryVehicleStates.map((k) => [
            k,
            period > 0 ? vs.reduce((n, v) => n + v.totals[k], 0) / vs.length / period : 0
          ])
        );
        return {
          fleetId: f.id,
          count: f.count,
          shares,
          trips: vs.reduce((n, v) => n + v.trips, 0),
          meanCallWaitMs: this.callWaits[fleet].n ? this.callWaits[fleet].sum / this.callWaits[fleet].n : 0
        };
      }),
      ...this.deadlock ? { deadlock: this.deadlock } : {},
      ...this.plc ? {
        control: {
          scans: this.plc.scans,
          lastMoveMs: this.lastMoveMs,
          stalls,
          state: this.plc.state,
          power: { ...this.plc.power }
        }
      } : {},
      ...this.recorder ? { timeline: this.recorder.timeline() } : {},
      bottlenecks: activePeriodBottlenecks(
        this.nodes.filter((n) => ["station", "parallel", "assembly"].includes(n.def.kind)).map((n) => ({ id: n.def.id, periods: n.active })),
        period
      )
    };
  }
};
function activePeriodBottlenecks(objects, period) {
  const all = [];
  objects.forEach((o, obj) => {
    for (let i = 0; i < o.periods.length; i += 2)
      all.push({ obj, start: o.periods[i], end: o.periods[i + 1] });
  });
  const cuts = [...new Set(all.flatMap((p) => [p.start, p.end]))].sort((a, b) => a - b);
  const byStart = [...all].sort((a, b) => a.start - b.start);
  const heap = [];
  const longer = (a, b) => a.end - a.start > b.end - b.start || a.end - a.start === b.end - b.start && a.obj < b.obj;
  const push = (p) => {
    heap.push(p);
    let i = heap.length - 1;
    while (i > 0) {
      const q = i - 1 >> 1;
      if (!longer(heap[i], heap[q])) break;
      [heap[i], heap[q]] = [heap[q], heap[i]];
      i = q;
    }
  };
  const pop = () => {
    const last = heap.pop();
    if (!heap.length) return;
    heap[0] = last;
    let i = 0;
    for (; ; ) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < heap.length && longer(heap[l], heap[m])) m = l;
      if (r < heap.length && longer(heap[r], heap[m])) m = r;
      if (m === i) break;
      [heap[i], heap[m]] = [heap[m], heap[i]];
      i = m;
    }
  };
  const segments = [];
  let k = 0;
  for (let c = 0; c + 1 < cuts.length; c++) {
    const a = cuts[c];
    const b = cuts[c + 1];
    while (k < byStart.length && byStart[k].start <= a) push(byStart[k++]);
    while (heap.length && heap[0].end <= a) pop();
    if (!heap.length) continue;
    const top = heap[0];
    const last = segments[segments.length - 1];
    if (last && last.p === top && last.end === a) last.end = b;
    else segments.push({ p: top, start: a, end: b });
  }
  const own = objects.map(() => []);
  const shift = objects.map(() => []);
  for (const s2 of segments) own[s2.p.obj].push([s2.start, s2.end]);
  for (let i = 1; i < segments.length; i++) {
    const a = segments[i - 1].p;
    const b = segments[i].p;
    if (a.obj === b.obj) continue;
    const from = Math.max(a.start, b.start);
    const to = Math.min(a.end, b.end);
    if (to <= from) continue;
    shift[a.obj].push([from, to]);
    shift[b.obj].push([from, to]);
  }
  return objects.map((o, i) => {
    const n = o.periods.length / 2;
    let total = 0;
    for (let j = 0; j < o.periods.length; j += 2) total += o.periods[j + 1] - o.periods[j];
    const sh = union(shift[i]);
    const won = union(own[i]);
    const soleMs = length(won) - length(intersect(won, sh));
    const shiftingMs = length(sh);
    return {
      id: o.id,
      soleMs,
      shiftingMs,
      share: period > 0 ? (soleMs + shiftingMs) / period : 0,
      meanActiveMs: n ? total / n : 0
    };
  }).sort((a, b) => b.share - a.share || b.meanActiveMs - a.meanActiveMs);
}
function union(list) {
  const out = [];
  for (const [a, b] of [...list].sort((x, y) => x[0] - y[0])) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}
function intersect(x, y) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    const a = Math.max(x[i][0], y[j][0]);
    const b = Math.min(x[i][1], y[j][1]);
    if (a < b) out.push([a, b]);
    if (x[i][1] < y[j][1]) i++;
    else j++;
  }
  return out;
}
var length = (list) => list.reduce((t, [a, b]) => t + b - a, 0);
function prepareRun(doc, options) {
  const problems = validateFactory(doc);
  if (problems.length)
    throw new FactoryValidationError(problems[0].code, problems[0].message, problems);
  const seed = options.seed ?? doc.run.seed;
  const warmup = options.warmupMs ?? doc.run.warmupMs ?? 0;
  const duration = options.durationMs ?? doc.run.durationMs;
  const maxEvents = Math.min(options.maxEvents ?? factoryLimits.events, factoryLimits.events);
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295)
    throw new FactoryValidationError("seed", "seed must be 0 to 2\xB3\xB2\u22121");
  if (!Number.isInteger(warmup) || !Number.isInteger(duration) || warmup < 0 || duration < 1 || warmup + duration > factoryLimits.maxTimeMs)
    throw new FactoryValidationError("time", "warm-up and duration must fit in one year");
  if (doc.control && Math.ceil((warmup + duration) / doc.control.program.scanMs) > factoryLimits.scans)
    throw new FactoryValidationError(
      "limit-scans",
      `more than ${factoryLimits.scans} PLC scans: a longer scan period or a shorter run`
    );
  const maxRecords = options.record ? Number.isFinite(options.maxRecords) ? Math.max(0, Math.min(Math.floor(options.maxRecords), 2e6)) : 2e6 : void 0;
  return {
    sim: new Sim(doc, seed, warmup, maxRecords),
    seed,
    warmup,
    end: warmup + duration,
    maxEvents
  };
}
function runFactory(doc, options = {}) {
  const run = startFactoryRun(doc, options);
  run.advance();
  return run.finish();
}
function startFactoryRun(doc, options = {}) {
  const { sim, seed, warmup, end, maxEvents } = prepareRun(doc, options);
  let finished;
  const progress = () => ({
    done: sim.ended,
    events: sim.handled,
    simMs: sim.ended ? sim.now : Math.min(sim.now, end),
    endMs: end
  });
  return {
    advance(events = Infinity) {
      if (!sim.ended) sim.advance(end, maxEvents, Math.max(1, events));
      return progress();
    },
    progress,
    finish() {
      if (!sim.ended) throw new Error("The run has not finished");
      return finished ??= sim.finish(Math.min(warmup, sim.now), sim.handled, seed);
    }
  };
}

// packages/artifact-core/src/index.ts
var newId = (prefix = "el") => `${prefix}_${crypto.randomUUID()}`;
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    let result = "{", separator = "";
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child === void 0) continue;
      result += separator + JSON.stringify(key) + ":" + canonicalJson(child);
      separator = ",";
    }
    return result + "}";
  }
  return JSON.stringify(value) ?? "null";
}

// packages/editor-core/src/index.ts
function withCommandReads(value, reads) {
  return { ...value, reads };
}
function command(type, label, apply, context = { origin: "local", transactionId: newId("transaction") }) {
  return { type, label, apply, context };
}
function immutableCommand(...args) {
  return { ...command(...args), readonlyInput: true };
}

// node_modules/@noble/hashes/esm/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function abytes(b, ...lengths) {
  if (!isBytes(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
var hasHexBuiltin = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
var Hash = class {
};
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}

// node_modules/@noble/hashes/esm/_md.js
function setBigUint64(view, byteOffset, value, isLE) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE);
  const _32n = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE ? 4 : 0;
  const l = isLE ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE);
  view.setUint32(byteOffset + l, wl, isLE);
}
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class extends Hash {
  constructor(blockLen, outputLen, padOffset, isLE) {
    super();
    this.finished = false;
    this.length = 0;
    this.pos = 0;
    this.destroyed = false;
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    clean(this.buffer.subarray(pos));
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i = pos; i < blockLen; i++)
      buffer[i] = 0;
    setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
    this.process(view, 0);
    const oview = createView(out);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to || (to = new this.constructor());
    to.set(...this.get());
    const { blockLen, buffer, length: length3, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length3;
    to.pos = pos;
    if (length3 % blockLen)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);

// node_modules/@noble/hashes/esm/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA256 = class extends HashMD {
  constructor(outputLen = 32) {
    super(64, outputLen, 8, false);
    this.A = SHA256_IV[0] | 0;
    this.B = SHA256_IV[1] | 0;
    this.C = SHA256_IV[2] | 0;
    this.D = SHA256_IV[3] | 0;
    this.E = SHA256_IV[4] | 0;
    this.F = SHA256_IV[5] | 0;
    this.G = SHA256_IV[6] | 0;
    this.H = SHA256_IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var sha256 = /* @__PURE__ */ createHasher(() => new SHA256());

// node_modules/@noble/hashes/esm/sha256.js
var sha2562 = sha256;

// packages/factory-core/src/operations.ts
var factoryContentHash = (doc) => bytesToHex(sha2562(new TextEncoder().encode(canonicalJson(doc))));
var fail = (code, message) => {
  throw new FactoryValidationError(code, message);
};
function objectProducts(o) {
  switch (o.kind) {
    case "source":
      return o.mix.map((m) => m.productId);
    case "station":
    case "parallel":
      return [
        ...(o.productTimes ?? []).map((t) => t.productId),
        ...(o.setup?.productTimes ?? []).map((t) => t.productId)
      ];
    case "assembly":
      return [
        ...(o.setup?.productTimes ?? []).map((t) => t.productId),
        o.mainProductId,
        ...o.components.map((c) => c.productId),
        ...o.outputProductId ? [o.outputProductId] : []
      ];
    default:
      return [];
  }
}
function applyFactoryOperation(doc, op) {
  const next = structuredClone(doc);
  const retire = (ids) => {
    if (!ids.length) return;
    const r = new Set(next.retiredIds ?? []);
    ids.forEach((id) => r.add(id));
    if (r.size > factoryLimits.retiredIds) fail("limit-exceeded", "retired IDs");
    next.retiredIds = [...r];
  };
  const put = (list, item, index) => {
    const i = list.findIndex((x) => x.id === item.id);
    if (i >= 0) return void (list[i] = structuredClone(item));
    const at = index ?? list.length;
    if (!Number.isInteger(at) || at < 0 || at > list.length) fail("index", "no such position");
    list.splice(at, 0, structuredClone(item));
  };
  const take = (list, id, what) => {
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) fail("not-found", `no ${what} ${id}`);
    list.splice(i, 1);
    retire([id]);
  };
  switch (op.type) {
    case "renameDocument":
      next.name = op.name;
      break;
    case "putProduct":
      put(next.products, op.product);
      break;
    case "removeProduct": {
      const user = next.objects.find((o) => objectProducts(o).includes(op.id)) ?? next.links.find((l) => l.productIds?.includes(op.id));
      if (user) fail("product-in-use", `${user.id} uses this product`);
      take(next.products, op.id, "product");
      break;
    }
    case "putObject": {
      const old = next.objects.find((o) => o.id === op.object.id);
      if (old && old.kind !== op.object.kind) {
        if (op.object.kind === "source" && next.links.some((l) => l.to === old.id))
          fail("object-in-use", "a source cannot have links in");
        if (op.object.kind === "drain" && next.links.some((l) => l.from === old.id))
          fail("object-in-use", "a drain cannot have links out");
      }
      put(next.objects, op.object, op.index);
      break;
    }
    case "removeObject": {
      const gone = next.links.filter((l) => l.from === op.id || l.to === op.id).map((l) => l.id);
      take(next.objects, op.id, "object");
      next.links = next.links.filter((l) => !gone.includes(l.id));
      retire(gone);
      if (next.control) {
        const c = next.control;
        const wired = [...c.sensors, ...c.actuators].filter((w) => w.objectId === op.id);
        c.sensors = c.sensors.filter((w) => w.objectId !== op.id);
        c.actuators = c.actuators.filter((w) => w.objectId !== op.id);
        retire(wired.map((w) => w.id));
      }
      break;
    }
    case "setControl": {
      const ids = (c) => c ? [...c.sensors, ...c.actuators].map((w) => w.id) : [];
      const before2 = ids(next.control);
      if (op.control) next.control = structuredClone(op.control);
      else delete next.control;
      const now = new Set(ids(next.control));
      retire(before2.filter((id) => !now.has(id)));
      break;
    }
    case "putLink":
      put(next.links, op.link);
      break;
    case "removeLink":
      take(next.links, op.id, "link");
      break;
    case "setRun":
      next.run = { ...op.run };
      break;
    case "setBuilding":
      if (op.building) next.building = { ...op.building };
      else delete next.building;
      break;
    case "setExperiment":
      if (op.experiment) next.experiment = structuredClone(op.experiment);
      else delete next.experiment;
      break;
    case "putCalendar":
      put(next.calendars ??= [], op.calendar);
      break;
    case "removeCalendar": {
      const user = next.objects.find((o) => o.calendarId === op.id);
      if (user) fail("calendar-in-use", `${user.id} works to this calendar`);
      take(next.calendars ??= [], op.id, "calendar");
      if (!next.calendars.length) delete next.calendars;
      break;
    }
    case "putWorkerPool":
      put(next.workerPools ??= [], op.pool);
      break;
    case "setPaths": {
      const before2 = [
        ...(next.paths?.nodes ?? []).map((n) => n.id),
        ...(next.paths?.segments ?? []).map((g) => g.id)
      ];
      if (op.paths) next.paths = structuredClone(op.paths);
      else delete next.paths;
      const now = /* @__PURE__ */ new Set([
        ...(next.paths?.nodes ?? []).map((n) => n.id),
        ...(next.paths?.segments ?? []).map((g) => g.id)
      ]);
      retire(before2.filter((id) => !now.has(id)));
      break;
    }
    case "putFleet":
      put(next.fleets ??= [], op.fleet);
      break;
    case "removeFleet": {
      const user = next.links.find((l) => l.transport?.fleetId === op.id);
      if (user) fail("fleet-in-use", `${user.id} is carried by this fleet`);
      take(next.fleets ??= [], op.id, "fleet");
      if (!next.fleets.length) delete next.fleets;
      break;
    }
    case "removeWorkerPool":
      take(next.workerPools ??= [], op.id, "worker pool");
      if (!next.workerPools.length) delete next.workerPools;
      break;
  }
  if (op.type !== "setExperiment") dropUnfitFactors(next);
  const problems = validateFactory(next);
  if (problems.length)
    throw new FactoryValidationError(problems[0].code, problems[0].message, problems);
  return next;
}
function dropUnfitFactors(doc) {
  if (!doc.experiment) return;
  const kinds = new Map(doc.objects.map((o) => [o.id, o.kind]));
  const fleets = new Set((doc.fleets ?? []).map((f) => f.id));
  const pools = new Set((doc.workerPools ?? []).map((p) => p.id));
  doc.experiment.factors = doc.experiment.factors.filter((f) => {
    const k = kinds.get(f.targetId);
    switch (f.kind) {
      case "buffer-capacity":
        return k === "buffer";
      case "parallel-count":
        return k === "parallel";
      case "time-scale":
        return k === "station" || k === "parallel" || k === "assembly";
      case "fleet-count":
        return fleets.has(f.targetId);
      case "pool-count":
        return pools.has(f.targetId);
      default:
        return true;
    }
  });
}
function factoryIds(doc) {
  return /* @__PURE__ */ new Set([
    ...doc.products.map((p) => p.id),
    ...doc.objects.map((o) => o.id),
    ...doc.links.map((l) => l.id),
    ...(doc.calendars ?? []).map((c) => c.id),
    ...(doc.workerPools ?? []).map((w) => w.id),
    ...(doc.paths?.nodes ?? []).map((n) => n.id),
    ...(doc.paths?.segments ?? []).map((g) => g.id),
    ...(doc.fleets ?? []).map((f) => f.id),
    ...(doc.control?.sensors ?? []).map((w) => w.id),
    ...(doc.control?.actuators ?? []).map((w) => w.id),
    ...doc.retiredIds ?? []
  ]);
}
function freshFactoryId(doc, base) {
  const taken = factoryIds(doc);
  const stem = [...base].slice(0, factoryLimits.idCodePoints - 8).join("");
  if (!taken.has(stem)) return stem;
  for (let n = 2; ; n++) if (!taken.has(`${stem}-${n}`)) return `${stem}-${n}`;
}
var labels = {
  renameDocument: "Rename model",
  putProduct: "Edit product",
  removeProduct: "Remove product",
  putObject: "Edit object",
  removeObject: "Remove object",
  putLink: "Edit link",
  removeLink: "Remove link",
  setRun: "Set run",
  setExperiment: "Set experiment",
  putCalendar: "Edit calendar",
  removeCalendar: "Remove calendar",
  putWorkerPool: "Edit worker pool",
  removeWorkerPool: "Remove worker pool",
  setPaths: "Set paths",
  setBuilding: "Set building",
  putFleet: "Edit fleet",
  removeFleet: "Remove fleet",
  setControl: "Set PLC control"
};
function factoryEditorCommand(operations, options) {
  const prepared = structuredClone(
    Array.isArray(operations) ? [...operations] : [operations]
  );
  const op = prepared[0];
  if (!op) throw new Error("no-operation");
  const run = (content) => {
    if (!options.canEdit()) throw new Error("permission-denied");
    if (factoryContentHash(content) !== options.expectedHash)
      throw new Error("factory-base-mismatch");
    return prepared.reduce(applyFactoryOperation, content);
  };
  const cmd = options.context ? immutableCommand(`factory.${op.type}`, labels[op.type], run, options.context) : immutableCommand(`factory.${op.type}`, labels[op.type], run);
  return withCommandReads(cmd, { content: ["*"] });
}

// packages/factory-core/src/fixtures.ts
var s = (seconds2) => seconds2 * 1e3;
function f170SmallLine() {
  const doc = newFactory("Small e-Axle line");
  doc.products = [
    { id: "housing", name: "Housing" },
    { id: "gearset", name: "Gear set" },
    { id: "eaxle", name: "e-Axle" }
  ];
  doc.objects = [
    {
      id: "in-housing",
      name: "Housing supply",
      kind: "source",
      interval: { type: "const", value: s(60) },
      mix: [{ productId: "housing", weight: 1 }]
    },
    {
      id: "machining",
      name: "Machining cell",
      kind: "parallel",
      count: 2,
      processTime: { type: "triangular", min: s(100), mode: s(110), max: s(130) }
    },
    { id: "buffer-1", name: "Buffer", kind: "buffer", capacity: 5 },
    {
      id: "conveyor-1",
      name: "Conveyor",
      kind: "conveyor",
      lengthMm: 6e3,
      speedMmS: 200,
      partLengthMm: 500,
      accumulating: true
    },
    {
      id: "in-gearset",
      name: "Gear set supply",
      kind: "source",
      interval: { type: "const", value: s(60) },
      mix: [{ productId: "gearset", weight: 1 }],
      startMs: s(30)
    },
    { id: "buffer-gear", name: "Gear set buffer", kind: "buffer", capacity: 10 },
    {
      id: "assembly",
      name: "Assembly",
      kind: "assembly",
      mainProductId: "housing",
      components: [{ productId: "gearset", count: 1 }],
      processTime: { type: "normal", mean: s(50), sd: s(5) },
      outputProductId: "eaxle"
    },
    {
      id: "test",
      name: "End-of-line test",
      kind: "station",
      processTime: { type: "lognormal", mean: s(55), sd: s(8) }
    },
    { id: "out", name: "Shipping", kind: "drain" }
  ];
  const link = (from, to) => ({ id: `${from}>${to}`, from, to });
  doc.links = [
    link("in-housing", "machining"),
    link("machining", "buffer-1"),
    link("buffer-1", "conveyor-1"),
    link("conveyor-1", "assembly"),
    link("in-gearset", "buffer-gear"),
    link("buffer-gear", "assembly"),
    link("assembly", "test"),
    link("test", "out")
  ];
  doc.run = { warmupMs: 36e5, durationMs: 8 * 36e5, seed: 1 };
  return doc;
}
function f172SmallLineExperiment() {
  const doc = f170SmallLine();
  doc.name = "Small e-Axle line experiment";
  for (const o of doc.objects)
    if (o.kind === "source") o.interval = { type: "const", value: s(45) };
  doc.experiment = {
    replications: 10,
    factors: [
      { kind: "parallel-count", targetId: "machining", values: [2, 3] },
      { kind: "time-scale", targetId: "test", values: [80, 100] },
      { kind: "buffer-capacity", targetId: "buffer-1", values: [1, 5] }
    ]
  };
  return doc;
}
function plcLineProgram(withReset) {
  const contact = (id, variable, kind = "no") => ({
    id,
    kind: "contact",
    variable,
    contact: kind
  });
  return {
    schemaVersion: 1,
    name: withReset ? "Transfer conveyor" : "Transfer conveyor (no reset)",
    scanMs: 100,
    variables: [
      { name: "C1_AT_END", type: "BOOL", role: "input", comment: "Part at the conveyor end" },
      { name: "ST2_BUSY", type: "BOOL", role: "input", comment: "Inspection holds a part" },
      { name: "C1_HOLD", type: "BOOL", role: "internal", comment: "Conveyor stopped for a jam" },
      { name: "C1_RUN", type: "BOOL", role: "output", initial: true, comment: "Conveyor motor" },
      { name: "C1_GATE", type: "BOOL", role: "output", comment: "Stopper at the conveyor end" }
    ],
    rungs: [
      {
        id: "r1",
        comment: "A part waits at the end and the inspection is busy: hold the conveyor.",
        network: {
          id: "r1n",
          kind: "series",
          items: [contact("r1a", "C1_AT_END"), contact("r1b", "ST2_BUSY")]
        },
        coils: [{ id: "r1c", variable: "C1_HOLD", coil: "set" }]
      },
      ...withReset ? [
        {
          id: "r2",
          comment: "The inspection is free again: release the hold.",
          network: contact("r2a", "ST2_BUSY", "nc"),
          coils: [{ id: "r2c", variable: "C1_HOLD", coil: "reset" }]
        }
      ] : [],
      {
        id: "r3",
        comment: "The motor runs unless held.",
        network: contact("r3a", "C1_HOLD", "nc"),
        coils: [{ id: "r3c", variable: "C1_RUN", coil: "normal" }]
      },
      {
        id: "r4",
        comment: "Open the stopper for a part at the end while the inspection is free.",
        network: {
          id: "r4n",
          kind: "series",
          items: [contact("r4a", "C1_AT_END"), contact("r4b", "ST2_BUSY", "nc")]
        },
        coils: [{ id: "r4c", variable: "C1_GATE", coil: "normal" }]
      }
    ]
  };
}
function f174PlcLine() {
  const doc = newFactory("PLC transfer line");
  doc.products = [{ id: "housing", name: "Housing" }];
  doc.objects = [
    {
      id: "in",
      name: "Housing supply",
      kind: "source",
      interval: { type: "const", value: s(40) },
      mix: [{ productId: "housing", weight: 1 }]
    },
    { id: "press", name: "Press", kind: "station", processTime: { type: "const", value: s(30) } },
    {
      id: "c1",
      name: "Transfer conveyor",
      kind: "conveyor",
      lengthMm: 4e3,
      speedMmS: 200,
      partLengthMm: 500,
      accumulating: true
    },
    {
      id: "inspect",
      name: "Inspection",
      kind: "station",
      processTime: { type: "uniform", min: s(30), max: s(45) }
    },
    { id: "out", name: "Shipping", kind: "drain" }
  ];
  const link = (from, to) => ({ id: `${from}>${to}`, from, to });
  doc.links = [
    link("in", "press"),
    link("press", "c1"),
    link("c1", "inspect"),
    link("inspect", "out")
  ];
  doc.control = {
    program: plcLineProgram(true),
    sensors: [
      { id: "sn-c1-end", objectId: "c1", signal: "ready", variable: "C1_AT_END" },
      { id: "sn-inspect-busy", objectId: "inspect", signal: "occupied", variable: "ST2_BUSY" }
    ],
    actuators: [
      { id: "ac-c1-run", objectId: "c1", signal: "run", variable: "C1_RUN" },
      { id: "ac-c1-gate", objectId: "c1", signal: "release", variable: "C1_GATE" }
    ]
  };
  doc.run = { durationMs: 8 * 36e5, seed: 1 };
  return doc;
}
function f175PlcLineBug() {
  const doc = f174PlcLine();
  doc.name = "PLC transfer line (bug)";
  doc.control.program = plcLineProgram(false);
  return doc;
}

// packages/factory-core/src/csv.ts
function parseFactoryCsvRows(text2) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let closed = false;
  let line = 1;
  let opened = 1;
  let i = text2.charCodeAt(0) === 65279 ? 1 : 0;
  for (; i < text2.length; i++) {
    const ch = text2[i];
    if (quoted) {
      if (ch === '"') {
        if (text2[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }
    if (closed && ch !== "," && ch !== "\n" && ch !== "\r")
      return { error: "characters after a quoted field", line };
    closed = false;
    if (ch === '"') {
      if (field !== "") return { error: "a quote inside an unquoted field", line };
      quoted = true;
      opened = line;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text2[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      line++;
    } else field += ch;
  }
  if (quoted) return { error: "a quoted field is not closed", line: opened };
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}
var factoryTimesCsvColumns = [
  "object",
  "product",
  "type",
  "value",
  "min",
  "mode",
  "max",
  "mean",
  "sd"
];
var params = {
  const: ["value"],
  uniform: ["min", "max"],
  triangular: ["min", "mode", "max"],
  normal: ["mean", "sd"],
  lognormal: ["mean", "sd"],
  exponential: ["mean"]
};
var optional = { normal: ["min", "max"] };
var allowed = (type) => [...params[type] ?? [], ...optional[type] ?? []];
var csvField = (v) => /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
var seconds = (ms) => String(Math.round(ms) / 1e3);
function writeFactoryTimesCsv(doc) {
  const lines = [factoryTimesCsvColumns.join(",")];
  const row = (object, product, d) => {
    if (d.type === "empirical") return;
    const values = d;
    lines.push(
      [
        object,
        product,
        d.type,
        ...factoryTimesCsvColumns.slice(3).map(
          (k) => allowed(d.type).includes(k) && values[k] !== void 0 ? seconds(values[k]) : ""
        )
      ].map(csvField).join(",")
    );
  };
  for (const o of doc.objects) {
    if (o.kind === "source") row(o.id, "", o.interval);
    if (o.kind === "station" || o.kind === "parallel" || o.kind === "assembly")
      row(o.id, "", o.processTime);
    if (o.kind === "station" || o.kind === "parallel")
      for (const t of o.productTimes ?? []) row(o.id, t.productId, t.time);
  }
  return lines.join("\r\n") + "\r\n";
}
function readFactoryTimesCsv(doc, text2) {
  const fail2 = (message, line) => {
    const d = { code: "csv", path: `line ${line}`, message };
    throw new FactoryValidationError("csv", `line ${line}: ${message}`, [d]);
  };
  const rows = parseFactoryCsvRows(text2);
  if (!Array.isArray(rows)) return fail2(rows.error, rows.line);
  if (!rows.length) return fail2("no header", 1);
  const header = rows[0].map((h) => h.trim().toLowerCase());
  header.forEach((h) => {
    if (!factoryTimesCsvColumns.includes(h)) fail2(`unknown column ${h}`, 1);
  });
  if (new Set(header).size !== header.length) fail2("a column twice", 1);
  for (const need2 of ["object", "type"]) if (!header.includes(need2)) fail2(`no ${need2} column`, 1);
  const objects = new Map(
    doc.objects.map((o) => [o.id, structuredClone(o)])
  );
  const changed = /* @__PURE__ */ new Set();
  const seen = /* @__PURE__ */ new Set();
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    if (r.length > header.length) fail2("more fields than columns", line);
    const get = (k) => (r[header.indexOf(k)] ?? "").trim();
    const id = get("object");
    const product = header.includes("product") ? get("product") : "";
    const o = objects.get(id) ?? fail2(`no object ${id}`, line);
    const key = `${id}\0${product}`;
    if (seen.has(key)) fail2("the same time twice", line);
    seen.add(key);
    const type = get("type");
    const names = params[type] ?? fail2(`unknown type ${type}`, line);
    const d = { type };
    for (const k of factoryTimesCsvColumns.slice(3)) {
      const v = header.includes(k) ? get(k) : "";
      if (!allowed(type).includes(k)) {
        if (v !== "") fail2(`${k} is not a value of ${type}`, line);
        continue;
      }
      if (v === "" && !names.includes(k)) continue;
      if (v === "") fail2(`${k} is required for ${type}`, line);
      const n = Number(v);
      if (!/^[0-9]+(\.[0-9]+)?$/.test(v) || !Number.isFinite(n)) fail2(`${k} is not seconds`, line);
      d[k] = Math.round(n * 1e3);
    }
    const dist = d;
    if (product) {
      if (o.kind !== "station" && o.kind !== "parallel") fail2(`${id} has no product times`, line);
      const s2 = o;
      const list = s2.productTimes ??= [];
      const at = list.findIndex((t) => t.productId === product);
      if (at >= 0) list[at] = { productId: product, time: dist };
      else list.push({ productId: product, time: dist });
    } else if (o.kind === "source") o.interval = dist;
    else if (o.kind === "station" || o.kind === "parallel" || o.kind === "assembly")
      o.processTime = dist;
    else fail2(`${id} has no time`, line);
    changed.add(id);
  });
  return doc.objects.filter((o) => changed.has(o.id)).map((o) => ({ type: "putObject", object: objects.get(o.id) }));
}

// packages/bim-core/src/model.ts
var bimLimits = Object.freeze({
  coordinateMm: 1e6,
  /** Flatter arcs lose a wall's thickness to rounding; draw them straight. */
  arcRadiusMm: 1e9,
  minDimensionMm: 1,
  maxSectionMm: 1e4,
  /** LR2: how far a wall may lean either way (60°). */
  wallLeanRad: Math.PI / 3,
  /** LR3: how far a spiral ramp may turn either way (3 turns). */
  rampSweepRad: 6 * Math.PI,
  /** LS5: a railing stands at most this high above its ramp. */
  railingHeightMm: 3e3,
  /**
   * LS6: what a stair's steps may be (where its shape holds together; no building-code check):
   * risers 50–250 mm high and 2–50 of them, treads 150–500 mm deep.
   */
  stair: { riserMm: [50, 250], risers: [2, 50], treadMm: [150, 500] },
  minStoreyMm: 1e3,
  /**
   * GV2b: a door or window type at most this wide and high (for 1,750 mm people). GV3: 20 m, not
   * 10 m: Lilliput's largest temple has a gate 4 ft high for 146 mm people (8.3 times their
   * height), and a cathedral's or a hangar's doors pass 10 m for ours.
   */
  openingMm: 2e4,
  /** GV2b: a stair at most this wide (for 1,750 mm people). */
  stairWidthMm: 1e4,
  /** GV2b: the people a building may be for, 100 mm to 30 m tall; 1,750 mm when not said. */
  inhabitantHeightMm: { default: 1750, range: [100, 3e4] },
  /** As far as a coordinate reaches (TW0d): a tall tower's decks need no unused levels between. */
  maxStoreyMm: 1e6,
  levels: 64,
  gridAxes: 256,
  types: 1e3,
  materials: 256,
  /** CS3: the densest material allowed (kg/m³; osmium is 22,600). */
  densityKgM3: 3e4,
  youngsModulusMPa: 1e6,
  elements: 1e4,
  joins: 2e4,
  views: 64,
  /** #19: saved 3D cameras. */
  cameras: 64,
  /** A saved camera may stand further out than the model reaches (a fitted view of a site). */
  cameraCoordinateMm: 1e9,
  loopVertices: 1024,
  holes: 16,
  openingsPerHost: 64,
  layers: 16,
  propertySets: 64,
  propertiesPerSet: 128,
  propertyStringCodePoints: 4096,
  idCodePoints: 128,
  /** IFC's IfcLabel holds 255 characters; names and short texts stay within it. */
  nameCodePoints: 255,
  contentBytes: 4 * 1024 * 1024,
  jsonDepth: 32
});
var bimTolerance = 1e-3;
function bimBodyLimits(doc) {
  const { default: base, range } = bimLimits.inhabitantHeightMm;
  const h = doc?.inhabitantHeightMm;
  const height = typeof h === "number" && Number.isFinite(h) && h >= range[0] && h <= range[1] ? h : base;
  const k = height / base;
  const s2 = bimLimits.stair;
  return {
    inhabitantHeightMm: height,
    scale: k,
    minStoreyMm: bimLimits.minStoreyMm * k,
    stair: {
      riserMm: [s2.riserMm[0] * k, s2.riserMm[1] * k],
      treadMm: [s2.treadMm[0] * k, s2.treadMm[1] * k],
      widthMm: bimLimits.stairWidthMm * k
    },
    railingHeightMm: bimLimits.railingHeightMm * k,
    openingMm: bimLimits.openingMm * k,
    maxSectionMm: bimLimits.maxSectionMm * Math.max(1, k)
  };
}

// packages/geometry-core/src/ops.ts
var geometryLimits = Object.freeze({
  /** Largest absolute coordinate, as in CAD. */
  coordinateMm: 1e6,
  nodes: 1e5,
  loopVertices: 1e4,
  holes: 1e3,
  tools: 1e4,
  /** LR1: sections of one loft. */
  loftSections: 256,
  /** Smallest length the ops tell apart (a vertex gap, a vector). */
  toleranceMm: 1e-6,
  /** PB7c: parts of one STEP file, and the file's largest size (as CAD's STEP export). */
  stepParts: 1e4,
  stepBytes: 64 * 1024 * 1024,
  /** Characters of a STEP name. */
  stepName: 256
});

// packages/geometry-core/src/materials.ts
var geometryLightLimits = Object.freeze({
  emissionStrength: [0, 50],
  transmission: [0, 1],
  ior: [1, 2.5],
  defaultIor: 1.5
});
var geometryDefaultFinish = Object.freeze({
  roughness: 0.55,
  metalness: 0.05
});
var preset = (id, name, category, color, roughness, metalness, opacity = 1, light = {}) => Object.freeze({
  id,
  name,
  category,
  color,
  opacity,
  roughness,
  metalness,
  ...light.emission ? { emission: Object.freeze({ ...light.emission }) } : {},
  ...light.transmission !== void 0 ? { transmission: light.transmission } : {},
  ...light.ior !== void 0 ? { ior: light.ior } : {}
});
var geometryMaterialPresets = Object.freeze([
  preset("concrete", "Concrete", "concrete", "#b5b2ab", 0.9, 0),
  preset("concrete-polished", "Polished concrete", "concrete", "#a7a49e", 0.45, 0),
  preset("brick", "Brick", "masonry", "#a4553d", 0.85, 0),
  preset("stone", "Stone", "masonry", "#c9c1b2", 0.75, 0),
  preset("steel", "Steel", "metal", "#a9adb3", 0.4, 1),
  preset("stainless-steel", "Stainless steel", "metal", "#c8ccd0", 0.25, 1),
  preset("aluminium", "Aluminium", "metal", "#d4d7db", 0.35, 1),
  preset("brass", "Brass", "metal", "#c9a24b", 0.3, 1),
  preset("copper", "Copper", "metal", "#c07a4f", 0.3, 1),
  preset("oak", "Oak", "wood", "#b48a5a", 0.7, 0),
  preset("walnut", "Walnut", "wood", "#6b4a33", 0.65, 0),
  preset("glass", "Clear glass", "glass", "#dbe9ee", 0.05, 0, 0.3),
  preset("insulation", "Insulation", "insulation", "#e8d36a", 0.95, 0),
  preset("plaster", "White plaster", "finish", "#ece9e3", 0.85, 0),
  preset("paint-gloss", "Gloss paint", "finish", "#2f5d8a", 0.2, 0),
  preset("plastic-matte", "Matte plastic", "other", "#3a3d42", 0.8, 0),
  preset("rubber", "Rubber", "other", "#26282b", 0.95, 0),
  // CR6a: the car's parts. A lamp's reflector, its clear lens (PMMA), its lit bulbs, a seat's cover.
  preset("chrome", "Chrome", "metal", "#e8eaec", 0.04, 1),
  preset("lamp-lens", "Lamp lens (clear PMMA)", "glass", "#f6f9fb", 0.02, 0, 1, {
    transmission: 1,
    ior: 1.49
  }),
  preset("lamp-white", "Lamp light (white)", "other", "#fffaf0", 0.3, 0, 1, {
    emission: { color: "#fff4e0", strength: 8 }
  }),
  preset("lamp-red", "Lamp light (red)", "other", "#b3141c", 0.3, 0, 1, {
    emission: { color: "#ff2a1f", strength: 6 }
  }),
  preset("fabric", "Seat fabric", "finish", "#3b3f46", 0.95, 0),
  preset("leather", "Leather", "finish", "#4a3426", 0.5, 0)
]);
var byId = new Map(geometryMaterialPresets.map((p) => [p.id, p]));

// packages/geometry-core/src/textures.ts
var geometryTextureRoles = Object.freeze([
  "color",
  "normal",
  "roughness",
  "metalness",
  "occlusion"
]);
var geometryTextureMediaTypes = Object.freeze([
  "image/png",
  "image/jpeg"
]);
var geometryTextureLimits = Object.freeze({
  /** Bytes of one image file. */
  imageBytes: 4 * 1024 * 1024,
  /** Pixels on the longer side (a 2K map). */
  imagePixels: 2048,
  /** Real size of the image on a face, in mm. */
  minSizeMm: 1,
  maxSizeMm: 1e5
});

// packages/bim-core/src/geometry.ts
var sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
var add = (a, b) => [a[0] + b[0], a[1] + b[1]];
var scale = (a, s2) => [a[0] * s2, a[1] * s2];
var dot = (a, b) => a[0] * b[0] + a[1] * b[1];
var cross = (a, b) => a[0] * b[1] - a[1] * b[0];
var length2 = (a) => Math.hypot(a[0], a[1]);
var distance = (a, b) => length2(sub(a, b));
var left = (a) => [-a[1], a[0]];
var unit = (a) => scale(a, 1 / length2(a));
function lineIntersection(p, d, q, e) {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-12 * length2(d) * length2(e)) return void 0;
  const t = cross(sub(q, p), e) / den;
  return add(p, scale(d, t));
}
function arcOf(p, q, b) {
  const sweep = 4 * Math.atan(b);
  const chord = sub(q, p);
  const c = length2(chord);
  const radius = c / (2 * Math.abs(Math.sin(sweep / 2)));
  const mid = scale(add(p, q), 0.5);
  const center = add(mid, scale(left(unit(chord)), c / 2 / Math.tan(sweep / 2)));
  const startAngle = Math.atan2(p[1] - center[1], p[0] - center[0]);
  return { center, radius, sweep, startAngle };
}
function arcPoint(arc, t) {
  const a = arc.startAngle + arc.sweep * t;
  return [arc.center[0] + arc.radius * Math.cos(a), arc.center[1] + arc.radius * Math.sin(a)];
}
var edge = (loop, i) => {
  const a = loop[i];
  const b = loop[(i + 1) % loop.length];
  return { p: [a[0], a[1]], q: [b[0], b[1]], bulge: a[2] ?? 0 };
};
function loopArea(loop) {
  let area = 0;
  for (let i = 0; i < loop.length; i++) {
    const { p, q, bulge } = edge(loop, i);
    area += cross(p, q) / 2;
    if (bulge) {
      const { radius, sweep } = arcOf(p, q, bulge);
      area += radius * radius * (sweep - Math.sin(sweep)) / 2;
    }
  }
  return area;
}
function loopPerimeter(loop) {
  let total = 0;
  for (let i = 0; i < loop.length; i++) {
    const { p, q, bulge } = edge(loop, i);
    total += bulge ? arcOf(p, q, bulge).radius * Math.abs(4 * Math.atan(bulge)) : distance(p, q);
  }
  return total;
}
function sampleLoop(loop, perArc = 16) {
  const out = [];
  for (let i = 0; i < loop.length; i++) {
    const { p, q, bulge } = edge(loop, i);
    out.push(p);
    if (bulge) {
      const arc = arcOf(p, q, bulge);
      for (let k = 1; k < perArc; k++) out.push(arcPoint(arc, k / perArc));
    }
  }
  return out;
}
var bboxOf = (a, b) => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.max(a[0], b[0]),
  Math.max(a[1], b[1])
];
function segmentsTouch(a, b, c, d, eps = 1e-9) {
  const [ax0, ay0, ax1, ay1] = bboxOf(a, b);
  const [cx0, cy0, cx1, cy1] = bboxOf(c, d);
  if (ax1 < cx0 - eps || cx1 < ax0 - eps || ay1 < cy0 - eps || cy1 < ay0 - eps) return false;
  const o1 = cross(sub(b, a), sub(c, a));
  const o2 = cross(sub(b, a), sub(d, a));
  const o3 = cross(sub(d, c), sub(a, c));
  const o4 = cross(sub(d, c), sub(b, c));
  const s2 = (v) => Math.abs(v) <= eps * (1 + Math.abs(v)) ? 0 : Math.sign(v);
  if (s2(o1) * s2(o2) < 0 && s2(o3) * s2(o4) < 0) return true;
  const on = (p, q, r, o) => s2(o) === 0 && r[0] >= Math.min(p[0], q[0]) - eps && r[0] <= Math.max(p[0], q[0]) + eps && r[1] >= Math.min(p[1], q[1]) - eps && r[1] <= Math.max(p[1], q[1]) + eps;
  return on(a, b, c, o1) || on(a, b, d, o2) || on(c, d, a, o3) || on(c, d, b, o4);
}
function polygonSimple(poly) {
  const n = poly.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    if (distance(a, b) <= 1e-9) return false;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsTouch(a, b, poly[j], poly[(j + 1) % n])) return false;
    }
  }
  return true;
}
function polygonsTouch(a, b) {
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++)
      if (segmentsTouch(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
  return false;
}
function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a[1] > p[1] !== b[1] > p[1]) {
      const x = (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0];
      if (p[0] < x) inside = !inside;
    }
  }
  return inside;
}
var loopEdges = (loop) => loop.map((_, i) => {
  const { p, q, bulge } = edge(loop, i);
  return bulge ? { p, q, arc: arcOf(p, q, bulge) } : { p, q };
});
function onArc(x, arc, eps) {
  const turn2 = Math.atan2(x[1] - arc.center[1], x[0] - arc.center[0]) - arc.startAngle;
  const along = (turn2 * Math.sign(arc.sweep) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const slack = eps / arc.radius;
  return along <= Math.abs(arc.sweep) + slack || along >= 2 * Math.PI - slack;
}
function segmentCircle(a, b, arc, eps) {
  const d = sub(b, a);
  const len = length2(d);
  const u = scale(d, 1 / len);
  const t0 = dot(sub(arc.center, a), u);
  const h = cross(u, sub(arc.center, a));
  if (Math.abs(h) > arc.radius + eps) return [];
  const half = Math.sqrt(Math.max(0, arc.radius * arc.radius - h * h));
  return [t0 - half, t0 + half].filter((t) => t >= -eps && t <= len + eps).map((t) => add(a, scale(u, t)));
}
function circleCircle(a, b, eps) {
  const d = distance(a.center, b.center);
  if (d <= eps) return Math.abs(a.radius - b.radius) <= eps ? void 0 : [];
  if (d > a.radius + b.radius + eps || d < Math.abs(a.radius - b.radius) - eps) return [];
  const u = scale(sub(b.center, a.center), 1 / d);
  const along = (d * d + a.radius * a.radius - b.radius * b.radius) / (2 * d);
  const h = Math.sqrt(Math.max(0, a.radius * a.radius - along * along));
  const foot = add(a.center, scale(u, along));
  return [add(foot, scale(left(u), h)), sub(foot, scale(left(u), h))];
}
function edgesTouch(e, f, eps = 1e-9) {
  if (!e.arc && !f.arc) return segmentsTouch(e.p, e.q, f.p, f.q, eps);
  if (!e.arc || !f.arc) {
    const [s2, c] = e.arc ? [f, e] : [e, f];
    const tol2 = eps * (1 + c.arc.radius);
    return segmentCircle(s2.p, s2.q, c.arc, tol2).some((x) => onArc(x, c.arc, tol2));
  }
  const tol = eps * (1 + Math.max(e.arc.radius, f.arc.radius));
  const points = circleCircle(e.arc, f.arc, tol);
  if (!points)
    return [e.p, e.q].some((x) => onArc(x, f.arc, tol)) || [f.p, f.q].some((x) => onArc(x, e.arc, tol));
  return points.some((x) => onArc(x, e.arc, tol) && onArc(x, f.arc, tol));
}
function adjacentTouch(e, f, eps = 1e-9) {
  const v = e.q;
  const tol = (r2 = 0) => eps * (1 + r2 + distance(e.p, v) + distance(f.q, v));
  if (!e.arc && !f.arc) {
    const a = sub(e.p, v);
    const b = sub(f.q, v);
    return Math.abs(cross(unit(a), unit(b))) <= eps && dot(a, b) > 0;
  }
  if (!e.arc || !f.arc) {
    const [seg, arc, far] = e.arc ? [f, e.arc, f.q] : [e, f.arc, e.p];
    const u = unit(sub(far, v));
    const t = 2 * dot(sub(arc.center, v), u);
    const len = distance(seg.p, seg.q);
    return t > tol(arc.radius) && t <= len + tol(arc.radius) && onArc(add(v, scale(u, t)), arc, tol(arc.radius));
  }
  const r = Math.max(e.arc.radius, f.arc.radius);
  const d = sub(f.arc.center, e.arc.center);
  if (length2(d) <= tol(r)) return onArc(e.p, f.arc, tol(r)) || onArc(f.q, e.arc, tol(r));
  const w = unit(d);
  const rel = sub(v, e.arc.center);
  const x = add(e.arc.center, sub(scale(w, 2 * dot(rel, w)), rel));
  return distance(x, v) > tol(r) && onArc(x, e.arc, tol(r)) && onArc(x, f.arc, tol(r));
}
function loopEdgesSimple(edges) {
  const n = edges.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    if (distance(edges[i].p, edges[i].q) <= 1e-9) return false;
    if (adjacentTouch(edges[i], edges[(i + 1) % n])) return false;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (edgesTouch(edges[i], edges[j])) return false;
    }
  }
  return true;
}
function loopsTouch(a, b) {
  return a.some((e) => b.some((f) => edgesTouch(e, f)));
}
function pointInLoop(x, loop) {
  let inside = pointInPolygon(
    x,
    loop.map((e) => e.p)
  );
  for (const { p, q, arc } of loop) {
    if (!arc || distance(x, arc.center) >= arc.radius) continue;
    const side = Math.sign(cross(sub(q, p), sub(arcPoint(arc, 0.5), p)));
    if (Math.sign(cross(sub(q, p), sub(x, p))) === side) inside = !inside;
  }
  return inside;
}
function probe(a, b) {
  const chords = b.filter((e) => e.arc);
  const candidates = a.flatMap((e) => [
    e.p,
    e.arc ? arcPoint(e.arc, 0.5) : scale(add(e.p, e.q), 0.5)
  ]);
  const onChord = (x) => chords.some(
    ({ p, q }) => Math.abs(cross(unit(sub(q, p)), sub(x, p))) <= 1e-9 * (1 + distance(p, q)) && dot(sub(x, p), sub(x, q)) <= 0
  );
  return candidates.find((x) => !onChord(x)) ?? candidates[0];
}
var loopWithin = (a, b) => pointInLoop(probe(a, b), b);
function loopInside(inner, outer) {
  return !loopsTouch(inner, outer) && loopWithin(inner, outer);
}

// packages/bim-core/src/derive.ts
var profileArea = (p) => {
  switch (p.shape) {
    case "rect":
      return p.widthMm * p.depthMm;
    case "circle":
      return Math.PI * p.diameterMm * p.diameterMm / 4;
    case "h":
    case "channel":
      return 2 * p.widthMm * p.flangeMm + (p.depthMm - 2 * p.flangeMm) * p.webMm;
    case "l":
      return p.thicknessMm * (p.widthMm + p.depthMm - p.thicknessMm);
    case "box":
      return p.widthMm * p.depthMm - (p.widthMm - 2 * p.wallMm) * (p.depthMm - 2 * p.wallMm);
    case "pipe": {
      const inner = p.diameterMm - 2 * p.wallMm;
      return Math.PI * (p.diameterMm * p.diameterMm - inner * inner) / 4;
    }
  }
};
var layersThickness = (t) => "layers" in t ? t.layers.reduce((n, l) => n + l.thicknessMm, 0) : 0;
var DeriveError = class extends Error {
  constructor(code, path) {
    super(code);
    this.code = code;
    this.path = path;
  }
};
function withinLimit(z, path) {
  if (!(Math.abs(z) <= bimLimits.coordinateMm)) throw new DeriveError("coordinate", path);
  return z;
}
var BimContext = class {
  constructor(doc) {
    this.doc = doc;
    this.body = bimBodyLimits(doc);
    this.levels = new Map(doc.levels.map((l) => [l.id, l]));
    this.grids = new Map(doc.grids.map((g) => [g.id, g]));
    this.types = new Map(doc.types.map((t) => [t.id, t]));
    this.elements = new Map(doc.elements.map((e) => [e.id, e]));
    this.sortedLevels = [...doc.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  }
  levels;
  grids;
  types;
  elements;
  sortedLevels;
  /** GV2b: the rules this building's people set. */
  body;
  /** A resolved elevation; sums of valid parts may still leave the coordinate limit. */
  height(h, path = "") {
    return withinLimit(this.levels.get(h.level).elevationMm + h.offsetMm, path);
  }
  top(base, top, path = "") {
    return "heightMm" in top ? withinLimit(base + top.heightMm, path) : this.height(top, path);
  }
  /** The level directly above `levelId`, if any. */
  levelAbove(levelId) {
    const i = this.sortedLevels.findIndex((l) => l.id === levelId);
    return this.sortedLevels[i + 1];
  }
  point(p, path) {
    if ("xy" in p) return p.xy;
    const [a, b] = p.grid.map((id) => this.grids.get(id));
    const hit = lineIntersection(a.start, sub(a.end, a.start), b.start, sub(b.end, b.start));
    if (!hit || a.id === b.id) throw new DeriveError("grid-no-intersection", path);
    if (hit.some((c) => !(Math.abs(c) <= bimLimits.coordinateMm)))
      throw new DeriveError("coordinate", path);
    return hit;
  }
};
function wallFrame(ctx, wall, path, z) {
  let s2 = ctx.point(wall.start, `${path}.start`);
  let e = ctx.point(wall.end, `${path}.end`);
  if (distance(s2, e) < bimTolerance) throw new DeriveError("wall-degenerate", path);
  const lean = wall.lean ?? 0;
  const thickness = layersThickness(ctx.types.get(wall.typeId));
  const width = thickness / Math.cos(lean);
  const [leftOff, rightOff] = wall.location === "center" ? [width / 2, -width / 2] : wall.location === "left" ? [0, -width] : [width, 0];
  const zBase = ctx.height(wall.base, `${path}.base`);
  const zTop = ctx.top(zBase, wall.top, `${path}.top`);
  if (zTop <= zBase + bimTolerance) throw new DeriveError("level-order", `${path}.top`);
  if (lean && z !== void 0 && z !== zBase) {
    const d = (z - zBase) * Math.tan(lean);
    if (!wall.bulge) {
      const right = scale(left(unit(sub(e, s2))), -d);
      s2 = add(s2, right);
      e = add(e, right);
    } else {
      const arc = arcOf(s2, e, wall.bulge);
      const r = arc.radius + Math.sign(arc.sweep) * d;
      if (!(r > bimTolerance)) throw new DeriveError("wall-degenerate", path);
      const radial = (p) => add(arc.center, scale(unit(sub(p, arc.center)), r));
      [s2, e] = [radial(s2), radial(e)];
    }
  }
  const u = unit(sub(e, s2));
  const n = left(u);
  const at = (p) => [add(p, scale(n, leftOff)), add(p, scale(n, rightOff))];
  const frame = {
    wall,
    path,
    s: s2,
    e,
    u,
    n,
    length: distance(s2, e),
    thickness,
    leftOff,
    rightOff,
    zBase,
    zTop,
    ends: { start: at(s2), end: at(e) },
    zones: { start: 0, end: 0, spans: [], heights: [] },
    lean
  };
  if (wall.bulge) {
    const arc = arcOf(s2, e, wall.bulge);
    if (!(arc.radius <= bimLimits.arcRadiusMm)) throw new DeriveError("arc-too-flat", path);
    const towardCenter = Math.sign(arc.sweep);
    const radiusAt = (off) => arc.radius - towardCenter * off;
    if (radiusAt(leftOff) <= bimTolerance || radiusAt(rightOff) <= bimTolerance)
      throw new DeriveError("wall-degenerate", path);
    const radial = (p, off) => add(arc.center, scale(unit(sub(p, arc.center)), radiusAt(off)));
    frame.arc = arc;
    frame.length = arc.radius * Math.abs(arc.sweep);
    frame.ends = {
      start: [radial(s2, leftOff), radial(s2, rightOff)],
      end: [radial(e, leftOff), radial(e, rightOff)]
    };
  }
  return frame;
}
var endPoint = (f, end) => end === "start" ? f.s : f.e;
var endAxis = (f, end) => {
  if (!f.arc || !end) return { s: f.s, u: f.u, n: f.n };
  const p = endPoint(f, end);
  const r = unit(sub(p, f.arc.center));
  const u = f.arc.sweep > 0 ? left(r) : [r[1], -r[0]];
  return { s: p, u, n: left(u) };
};
var faceLines = (f, end) => {
  const a = endAxis(f, end);
  return [
    [add(a.s, scale(a.n, f.leftOff)), a.u],
    [add(a.s, scale(a.n, f.rightOff)), a.u]
  ];
};
var into = (f, end) => {
  const { u } = endAxis(f, end);
  return end === "start" ? u : scale(u, -1);
};
var faceToward = (f, dir, end) => {
  const { n } = endAxis(f, end);
  return dot(scale(n, f.leftOff), dir) >= dot(scale(n, f.rightOff), dir) ? 0 : 1;
};
var axial = (f, p) => {
  if (!f.arc) return dot(sub(p, f.s), f.u);
  const sign = Math.sign(f.arc.sweep);
  return f.arc.radius * turn(sign * (angleOf(f, p) - f.arc.startAngle));
};
var angleOf = (f, p) => Math.atan2(p[1] - f.arc.center[1], p[0] - f.arc.center[0]);
var turn = (a) => {
  const t = ((a + Math.PI / 2) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  return (t === 0 ? 2 * Math.PI : t) - Math.PI / 2;
};
var faceCurve = (f, k) => {
  if (!f.arc) return { p: faceLines(f)[k][0], d: f.u };
  const off = k === 0 ? f.leftOff : f.rightOff;
  return { c: f.arc.center, r: f.arc.radius - Math.sign(f.arc.sweep) * off };
};
function meet(x, y, near) {
  const nearest = (ps) => ps.sort((a2, b2) => distance(a2, near) - distance(b2, near))[0];
  if ("p" in x && "p" in y) return lineIntersection(x.p, x.d, y.p, y.d);
  if ("c" in x && "p" in y) return meet(y, x, near);
  if ("p" in x && "c" in y) {
    const w = sub(x.p, y.c);
    const b2 = dot(w, x.d);
    const disc = b2 * b2 - (dot(w, w) - y.r * y.r);
    if (disc < 0) return void 0;
    return nearest([-1, 1].map((k) => add(x.p, scale(x.d, -b2 + k * Math.sqrt(disc)))));
  }
  const [a, b] = [x, y];
  const d = distance(a.c, b.c);
  if (d < bimTolerance || d > a.r + b.r || d < Math.abs(a.r - b.r)) return void 0;
  const along = (d * d + a.r * a.r - b.r * b.r) / (2 * d);
  const h = Math.sqrt(Math.max(0, a.r * a.r - along * along));
  const u = unit(sub(b.c, a.c));
  const m = add(a.c, scale(u, along));
  return nearest([add(m, scale(left(u), h)), add(m, scale(left(u), -h))]);
}
function meetFaces(f, end, other, path) {
  f.ends[end] = f.ends[end].map((near, k) => {
    const p = meet(faceCurve(f, k), other, near);
    if (!p) throw new DeriveError("join-failed", path);
    return p;
  });
}
function applyJoin(frames, join, path, used, points, fit) {
  const [a, b] = join.walls.map((id) => frames.get(id));
  const ends = ["start", "end"];
  let shape = fit?.kind === "L" ? fit : void 0;
  if (!fit) {
    for (const ea2 of ends)
      for (const eb2 of ends)
        if (distance(endPoint(a, ea2), endPoint(b, eb2)) <= bimTolerance)
          shape = { kind: "L", ea: ea2, eb: eb2 };
  }
  if ((a.arc || b.arc) && !shape) throw new DeriveError("join-unsupported", path);
  const ua = endAxis(a, shape?.ea).u;
  const ub = endAxis(b, shape?.eb).u;
  if (Math.abs(cross(ua, ub)) < 1e-9) throw new DeriveError("join-failed", path);
  let tee = fit?.kind === "T" ? { through: frames.get(fit.through), stop: frames.get(fit.stop), end: fit.end } : void 0;
  if (!shape && !tee)
    for (const [through2, stop2] of [
      [a, b],
      [b, a]
    ])
      for (const end of ends) {
        const p = endPoint(stop2, end);
        const t = axial(through2, p);
        const off = Math.abs(dot(sub(p, through2.s), through2.n));
        if (off <= bimTolerance && t > bimTolerance && t < through2.length - bimTolerance)
          tee = { through: through2, stop: stop2, end };
      }
  if (!shape && !tee) throw new DeriveError("join-not-touching", path);
  const claim = (key) => {
    if (used.has(key)) throw new DeriveError("join-unsupported", path);
    used.add(key);
  };
  const claimPoint = (p, ws) => {
    const lo = Math.max(...ws.map((w) => w.zBase));
    const hi = Math.min(...ws.map((w) => w.zTop));
    if (points.some(
      (q) => distance(q.p, p) <= bimTolerance && q.lo < hi - bimTolerance && lo < q.hi - bimTolerance
    ))
      throw new DeriveError("join-unsupported", path);
    points.push({ p, lo, hi });
  };
  if (tee) {
    if (join.kind !== "butt") throw new DeriveError("join-unsupported", path);
    if (join.through !== void 0 && join.through !== tee.through.wall.id)
      throw new DeriveError("join-through", `${path}.through`);
    claim(`${tee.stop.wall.id}:${tee.end}`);
    claimPoint(endPoint(tee.stop, tee.end), [a, b]);
    butt(tee.through, tee.stop, tee.end, void 0, path);
    return { kind: "T", through: tee.through.wall.id, stop: tee.stop.wall.id, end: tee.end };
  }
  const { ea, eb } = shape;
  claim(`${a.wall.id}:${ea}`);
  claim(`${b.wall.id}:${eb}`);
  claimPoint(endPoint(a, ea), [a, b]);
  if (join.kind === "miter") {
    if (Math.abs(a.zBase - b.zBase) > bimTolerance || Math.abs(a.zTop - b.zTop) > bimTolerance)
      throw new DeriveError("join-height-mismatch", path);
    if (Math.abs(a.thickness - b.thickness) > bimTolerance || a.wall.location !== b.wall.location)
      throw new DeriveError("join-thickness-mismatch", path);
    const la = faceLines(a, ea);
    const lb = faceLines(b, eb);
    const ia = faceToward(a, into(b, eb), ea);
    const ib = faceToward(b, into(a, ea), eb);
    const inner = lineIntersection(la[ia][0], la[ia][1], lb[ib][0], lb[ib][1]);
    const outer = lineIntersection(la[1 - ia][0], la[1 - ia][1], lb[1 - ib][0], lb[1 - ib][1]);
    const set = (f, end, innerIdx) => {
      const pair = innerIdx === 0 ? [inner, outer] : [outer, inner];
      f.ends[end] = pair;
    };
    if (a.arc || b.arc) {
      const at = (i, j, near) => {
        const p = meet(faceCurve(a, i), faceCurve(b, j), near);
        if (!p) throw new DeriveError("join-failed", path);
        return p;
      };
      const exact = [at(ia, ib, inner), at(1 - ia, 1 - ib, outer)];
      set(a, ea, ia);
      set(b, eb, ib);
      for (const [f, e, i] of [
        [a, ea, ia],
        [b, eb, ib]
      ])
        f.ends[e] = i === 0 ? [exact[0], exact[1]] : [exact[1], exact[0]];
    } else {
      set(a, ea, ia);
      set(b, eb, ib);
    }
    return shape;
  }
  const through = join.through === b.wall.id ? b : a;
  if (join.through !== void 0 && join.through !== a.wall.id && join.through !== b.wall.id)
    throw new DeriveError("join-through", `${path}.through`);
  const stop = through === a ? b : a;
  const throughEnd = through === a ? ea : eb;
  const stopEnd = through === a ? eb : ea;
  butt(through, stop, stopEnd, throughEnd, path);
  return shape;
}
function butt(through, stop, stopEnd, throughEnd, path) {
  if (through.zBase > stop.zBase + bimTolerance || through.zTop < stop.zTop - bimTolerance)
    throw new DeriveError("join-height-mismatch", path);
  const lt = faceLines(through, throughEnd);
  const ls = faceLines(stop, stopEnd);
  const nearFace = faceToward(through, into(stop, stopEnd), throughEnd);
  const near = lt[nearFace];
  stop.ends[stopEnd] = ls.map((l) => lineIntersection(l[0], l[1], near[0], near[1]));
  if (stop.arc || through.arc) meetFaces(stop, stopEnd, faceCurve(through, nearFace), path);
  if (throughEnd) {
    const farFace = faceToward(stop, scale(into(through, throughEnd), -1), stopEnd);
    const far = ls[farFace];
    through.ends[throughEnd] = lt.map((l) => lineIntersection(l[0], l[1], far[0], far[1]));
    if (stop.arc || through.arc) meetFaces(through, throughEnd, faceCurve(stop, farFace), path);
  }
  const ts = stop.ends[stopEnd].map((p) => axial(through, p));
  through.zones.spans.push([Math.min(...ts), Math.max(...ts)]);
  through.zones.heights.push([stop.zBase, stop.zTop]);
}
function leanRuled(f, base, top) {
  if (base.length !== top.length) return false;
  return base.every((v, i) => {
    const w = top[i];
    if (!!v[2] !== !!w[2]) return false;
    if (!v[2]) return true;
    if (Math.abs(v[2] - w[2]) > 1e-9) return false;
    const c = f.arc.center;
    const a = Math.atan2(v[1] - c[1], v[0] - c[0]);
    const b = Math.atan2(w[1] - c[1], w[0] - c[0]);
    return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) <= 1e-9;
  });
}
function nearRuled(base, mid, top, within2 = 1) {
  if (base.length !== mid.length || top.length !== mid.length) return false;
  const middle = (l, i) => {
    const v = l[i];
    const w = l[(i + 1) % l.length];
    return v[2] ? arcPoint(arcOf([v[0], v[1]], [w[0], w[1]], v[2]), 0.5) : [(v[0] + w[0]) / 2, (v[1] + w[1]) / 2];
  };
  const near = (p, a, b) => Math.hypot(p[0] - (a[0] + b[0]) / 2, p[1] - (a[1] + b[1]) / 2) <= within2;
  return mid.every(
    (v, i) => near([v[0], v[1]], [base[i][0], base[i][1]], [top[i][0], top[i][1]]) && near(middle(mid, i), middle(base, i), middle(top, i))
  );
}
var loopsEqual = (a, b) => a.length === b.length && a.every(
  (v, i) => Math.abs(v[0] - b[i][0]) <= 1e-9 && Math.abs(v[1] - b[i][1]) <= 1e-9 && Math.abs((v[2] ?? 0) - (b[i][2] ?? 0)) <= 1e-12
);
function loopBetween(a, b, t) {
  return a.map((v, i) => {
    const w = b[i];
    const p = [v[0] + (w[0] - v[0]) * t, v[1] + (w[1] - v[1]) * t];
    return v[2] ? [p[0], p[1], v[2]] : p;
  });
}
function wallFootprint(f) {
  const [sl, sr] = f.ends.start;
  const [el, er] = f.ends.end;
  const face = (p, q) => {
    const sign = Math.sign(f.arc.sweep);
    return sign * Math.tan(turn(sign * (angleOf(f, q) - angleOf(f, p))) / 4);
  };
  const loop = f.arc ? [
    [sl[0], sl[1], face(sl, el)],
    [el[0], el[1]],
    [er[0], er[1], -face(sr, er)],
    [sr[0], sr[1]]
  ] : [
    [sl[0], sl[1]],
    [el[0], el[1]],
    [er[0], er[1]],
    [sr[0], sr[1]]
  ];
  return loopArea(loop) < 0 ? reverseLoop(loop) : loop;
}
function reverseLoop(loop) {
  const n = loop.length;
  return loop.map((_, k) => {
    const v = loop[n - 1 - k];
    const prev = loop[(2 * n - 2 - k) % n];
    return prev[2] ? [v[0], v[1], -prev[2]] : [v[0], v[1]];
  });
}
var bimWallOpeningRiseOf = (lean, sillMm, heightMm) => [sillMm * Math.cos(lean), (sillMm + heightMm) * Math.cos(lean)];
function openingVolume(f, o) {
  if (!f.arc) return o.widthMm * f.thickness * o.heightMm;
  const towardCenter = Math.sign(f.arc.sweep);
  const rise = (o.sillMm + o.heightMm / 2) * Math.cos(f.lean);
  const mid = f.arc.radius + towardCenter * (rise * Math.tan(f.lean) - (f.leftOff + f.rightOff) / 2);
  return o.widthMm / f.arc.radius * f.thickness * mid * o.heightMm;
}
var loopPolygon = (loop) => sampleLoop(loop);
var loopSimple = (loop) => Math.abs(loopArea(loop)) > bimTolerance && loopEdgesSimple(loopEdges(loop));
function deriveBim(doc) {
  const ctx = new BimContext(doc);
  const shapes = /* @__PURE__ */ new Map();
  const quantities = /* @__PURE__ */ new Map();
  const diagnostics = [];
  const fail2 = (err, id, fallbackPath) => {
    if (!(err instanceof DeriveError)) throw err;
    diagnostics.push({ code: err.code, path: err.path || fallbackPath, severity: "error", id });
  };
  const index = new Map(doc.elements.map((e, i) => [e.id, i]));
  const pathOf = (id) => `$.elements[${index.get(id)}]`;
  const frames = /* @__PURE__ */ new Map();
  for (const e of doc.elements)
    if (e.kind === "wall")
      try {
        frames.set(e.id, wallFrame(ctx, e, pathOf(e.id)));
      } catch (err) {
        fail2(err, e.id, pathOf(e.id));
      }
  const used = /* @__PURE__ */ new Set();
  const points = [];
  const joinsOf = /* @__PURE__ */ new Map();
  const moving = /* @__PURE__ */ new Set();
  doc.joins.forEach((j, i) => {
    if (!j.walls.every((w) => frames.has(w))) return;
    const path = `$.joins[${i}]`;
    try {
      const fit = applyJoin(frames, j, path, used, points);
      for (const w of j.walls) joinsOf.set(w, [...joinsOf.get(w) ?? [], { join: j, path, fit }]);
      if (j.walls.some((w) => frames.get(w).lean !== 0)) for (const w of j.walls) moving.add(w);
    } catch (err) {
      fail2(err, j.id, path);
    }
  });
  for (const f of frames.values()) if (f.lean) moving.add(f.wall.id);
  const footprintAt = (f, z) => {
    const at = /* @__PURE__ */ new Map();
    const frameAt = (id) => {
      const w = frames.get(id);
      at.set(id, wallFrame(ctx, w.wall, w.path, z));
    };
    frameAt(f.wall.id);
    const joins = joinsOf.get(f.wall.id) ?? [];
    for (const { join } of joins) for (const w of join.walls) if (!at.has(w)) frameAt(w);
    for (const { join, path, fit } of joins) {
      applyJoin(at, join, path, /* @__PURE__ */ new Set(), [], fit);
      const stopped = frames.get(fit.kind === "T" ? fit.stop : f.wall.id);
      if (fit.kind === "T" && z >= stopped.zBase - bimTolerance && z <= stopped.zTop + bimTolerance) {
        const through = at.get(fit.through);
        const stop = at.get(fit.stop);
        if (stop.ends[fit.end].some((p) => {
          const t = axial(through, p);
          return t < -bimTolerance || t > through.length + bimTolerance;
        }))
          throw new DeriveError("wall-lean-join", path);
      }
    }
    const frame = at.get(f.wall.id);
    if ([0, 1].some(
      (k) => axial(frame, frame.ends.end[k]) - axial(frame, frame.ends.start[k]) <= bimTolerance
    ))
      throw new DeriveError("join-failed", f.path);
    return { frame, footprint: wallFootprint(frame) };
  };
  const footprints = /* @__PURE__ */ new Map();
  const leanFootprints = /* @__PURE__ */ new Map();
  for (const f of frames.values()) {
    let fp = wallFootprint(f);
    if (moving.has(f.wall.id)) {
      try {
        const base = footprintAt(f, f.zBase);
        const top2 = footprintAt(f, f.zTop);
        const mid = footprintAt(f, (f.zBase + f.zTop) / 2);
        const ruled = leanRuled(f, base.footprint, top2.footprint) && nearRuled(base.footprint, mid.footprint, top2.footprint, 1e-6);
        if (!ruled && !nearRuled(base.footprint, mid.footprint, top2.footprint))
          throw new DeriveError("wall-lean-join", f.path);
        if (!loopWithinLimit(top2.footprint)) throw new DeriveError("coordinate", f.path);
        fp = base.footprint;
        if (f.lean || !loopsEqual(base.footprint, top2.footprint))
          leanFootprints.set(f.wall.id, { top: top2.footprint, mid: mid.frame, ruled });
      } catch (err) {
        fail2(err, f.wall.id, f.path);
        continue;
      }
    }
    const inverted = [0, 1].some(
      (k) => axial(f, f.ends.end[k]) - axial(f, f.ends.start[k]) <= bimTolerance
    );
    const top = leanFootprints.get(f.wall.id)?.top;
    const tooLong = [fp, top ?? []].some((l) => l.some((v) => Math.abs(v[2] ?? 0) > 1 + 1e-9));
    const isSimple = (l) => f.arc ? loopSimple(l) : polygonSimple(loopPolygon(l));
    const simple = isSimple(fp) && (!top || isSimple(top));
    if (inverted || tooLong || !simple) {
      diagnostics.push({ code: "join-failed", path: f.path, severity: "error", id: f.wall.id });
      continue;
    }
    if (!loopWithinLimit(fp)) {
      diagnostics.push({ code: "coordinate", path: f.path, severity: "error", id: f.wall.id });
      continue;
    }
    footprints.set(f.wall.id, fp);
    f.zones.start = Math.max(0, ...f.ends.start.map((p) => axial(f, p)));
    f.zones.end = Math.max(0, ...f.ends.end.map((p) => f.length - axial(f, p)));
  }
  const wallOpenings = /* @__PURE__ */ new Map();
  const slabOpenings = /* @__PURE__ */ new Map();
  for (const e of doc.elements) {
    if (e.kind !== "opening" && e.kind !== "door" && e.kind !== "window") continue;
    const path = pathOf(e.id);
    try {
      if (e.kind === "opening" && "slab" in e) {
        const list = slabOpenings.get(e.hostId) ?? [];
        list.push({ id: e.id, loop: e.slab.boundary });
        slabOpenings.set(e.hostId, list);
      } else {
        const f = frames.get(e.hostId);
        if (!f) continue;
        const t = ctx.types.get("typeId" in e ? e.typeId : "");
        const o = e.kind === "opening" && "wall" in e ? { elementId: e.id, ...e.wall } : {
          elementId: e.id,
          alongMm: e.alongMm,
          sillMm: e.kind === "window" ? e.sillMm : 0,
          widthMm: t && "widthMm" in t ? t.widthMm : 0,
          heightMm: t && "heightMm" in t ? t.heightMm : 0
        };
        const height = (f.zTop - f.zBase) / Math.cos(f.lean);
        if (o.alongMm < -bimTolerance || o.alongMm + o.widthMm > f.length + bimTolerance || o.sillMm < -bimTolerance || o.sillMm + o.heightMm > height + bimTolerance)
          throw new DeriveError("opening-outside-host", path);
        const lo = o.alongMm;
        const hi = o.alongMm + o.widthMm;
        const moves = moving.has(e.hostId);
        if (!moves && (lo < f.zones.start - bimTolerance || hi > f.length - f.zones.end + bimTolerance || f.zones.spans.some(([a, b]) => lo < b - bimTolerance && hi > a + bimTolerance)))
          throw new DeriveError("opening-in-join", path);
        if (moves) {
          const [r0, r1] = bimWallOpeningRiseOf(f.lean, o.sillMm, o.heightMm);
          const steps = 8;
          const z0 = f.zBase + r0;
          const z1 = f.zBase + r1;
          const zs = [
            ...Array.from({ length: steps + 1 }, (_, i) => z0 + (z1 - z0) * i / steps),
            ...f.zones.heights.flat().filter((z) => z > z0 && z < z1)
          ].sort((a, b) => a - b);
          let last;
          for (const z of zs) {
            const g = footprintAt(f, z).frame;
            const k = f.arc && g.arc ? f.arc.radius / g.arc.radius : 1;
            const start = Math.max(0, ...g.ends.start.map((p) => axial(g, p))) * k;
            const end = (g.length - Math.max(0, ...g.ends.end.map((p) => g.length - axial(g, p)))) * k;
            const spans2 = g.zones.spans.map(([a, b], j) => {
              const [zb, zt] = g.zones.heights[j];
              return z < zb - bimTolerance || z > zt + bimTolerance ? void 0 : [a * k, b * k];
            });
            const swept = spans2.map((s2, j) => {
              const p = last && last.length === spans2.length ? last[j] : void 0;
              return s2 && p ? [Math.min(s2[0], p[0]), Math.max(s2[1], p[1])] : s2;
            });
            if (lo < start - bimTolerance || hi > end + bimTolerance || swept.some((s2) => s2 && lo < s2[1] - bimTolerance && hi > s2[0] + bimTolerance))
              throw new DeriveError("opening-in-join", path);
            last = spans2;
          }
        }
        const list = wallOpenings.get(e.hostId) ?? [];
        const clash = list.some(
          (p) => lo < p.alongMm + p.widthMm - bimTolerance && hi > p.alongMm + bimTolerance && o.sillMm < p.sillMm + p.heightMm - bimTolerance && o.sillMm + o.heightMm > p.sillMm + bimTolerance
        );
        if (clash) throw new DeriveError("opening-overlap", path);
        list.push(o);
        wallOpenings.set(e.hostId, list);
      }
      shapes.set(e.id, { kind: "void", hostId: e.hostId });
      quantities.set(e.id, { source: "none", values: {} });
    } catch (err) {
      fail2(err, e.id, path);
    }
  }
  for (const pass of [false, true])
    for (const e of doc.elements) {
      if (e.kind === "railing" !== pass) continue;
      const path = pathOf(e.id);
      try {
        deriveElement(e, path);
      } catch (err) {
        fail2(err, e.id, path);
      }
    }
  return { shapes, quantities, diagnostics };
  function deriveElement(e, path) {
    switch (e.kind) {
      case "wall": {
        const f = frames.get(e.id);
        const footprint = footprints.get(e.id);
        if (!f || !footprint) return;
        const openings = wallOpenings.get(e.id) ?? [];
        const height = f.zTop - f.zBase;
        const footArea = loopArea(footprint);
        const openingArea = openings.reduce((n, o) => n + o.widthMm * o.heightMm, 0);
        const openingsVolume = openings.reduce((n, o) => n + openingVolume(f, o), 0);
        const lean = leanFootprints.get(e.id);
        shapes.set(e.id, {
          kind: "wall",
          footprint,
          zBase: f.zBase,
          zTop: f.zTop,
          openings,
          ...e.clipBy ? { clipBy: e.clipBy } : {},
          ...lean ? { ...f.lean ? { lean: f.lean } : {}, footprintTop: lean.top } : {}
        });
        const faces = (w) => [0, 1].reduce(
          (n, k) => n + (axial(w, w.ends.end[k]) - axial(w, w.ends.start[k])) / 2,
          0
        );
        const sideArea = lean ? (f.length + faces(lean.mid) - faces(f)) * height / Math.cos(f.lean) : f.length * height;
        const values = {
          length: f.length,
          height,
          width: f.thickness,
          footprintArea: footArea,
          grossSideArea: sideArea,
          openingArea,
          netSideArea: sideArea - openingArea
        };
        const measured = !e.clipBy && (!lean || lean.ruled);
        if (measured) {
          const volume = lean ? height / 6 * (footArea + 4 * loopArea(loopBetween(footprint, lean.top, 0.5)) + loopArea(lean.top)) : footArea * height;
          values.grossVolume = volume;
          values.netVolume = volume - openingsVolume;
        }
        quantities.set(e.id, { source: measured ? "analytic" : "kernel", values });
        return;
      }
      case "slab": {
        checkLoop(e.boundary, `${path}.boundary`);
        const outer = loopEdges(e.boundary);
        const voids = [
          ...e.holes.map((h, i) => ({ loop: h, path: `${path}.holes[${i}]`, opening: false })),
          ...(slabOpenings.get(e.id) ?? []).map((o) => ({
            loop: o.loop,
            path: `${pathOf(o.id)}.slab.boundary`,
            opening: true
          }))
        ];
        checkVoids(outer, voids);
        const thickness = layersThickness(ctx.types.get(e.typeId));
        const zTop = ctx.height(e.top, `${path}.top`);
        const gross = Math.abs(loopArea(e.boundary));
        const area = gross - voids.reduce((n, v) => n + Math.abs(loopArea(v.loop)), 0);
        let slope;
        if (e.slope) {
          const zEnd = ctx.height(e.slope.endTop, `${path}.slope.endTop`);
          const a = e.boundary[e.slope.edge];
          const b = e.boundary[(e.slope.edge + 1) % e.boundary.length];
          const origin = [a[0], a[1]];
          const normal = left(unit(sub([b[0], b[1]], origin)));
          const reach = (d) => dot(sub(loopExtreme(e.boundary, scale(d, -1)), origin), d);
          const r1 = reach(normal);
          const r2 = reach(scale(normal, -1));
          const direction = r1 >= r2 ? normal : scale(normal, -1);
          const run = Math.max(r1, r2);
          if (!(run > bimTolerance))
            throw new DeriveError("slope-degenerate", `${path}.slope.edge`);
          withinLimit(zEnd - thickness, `${path}.slope.endTop`);
          if (Math.abs(zEnd - zTop) > bimTolerance) {
            const grade = (zEnd - zTop) / run;
            slope = { origin, direction, grade };
            const behind = Math.max(0, Math.min(r1, r2));
            const zBehind = zTop - grade * behind;
            withinLimit(zBehind, `${path}.slope.endTop`);
            withinLimit(zBehind - thickness, `${path}.slope.endTop`);
            const rise = Math.max(zTop, zEnd, zBehind) - Math.min(zTop, zEnd, zBehind) + thickness;
            if (!(rise + 20 <= bimLimits.coordinateMm))
              throw new DeriveError("coordinate", `${path}.slope.endTop`);
          }
        }
        shapes.set(e.id, {
          kind: "slab",
          boundary: ccw(e.boundary),
          holes: voids.map((v) => ccw(v.loop)),
          zBottom: withinLimit(zTop - thickness, `${path}.top`),
          zTop,
          ...slope ? { slope } : {}
        });
        quantities.set(e.id, {
          source: "analytic",
          values: {
            grossArea: gross,
            netArea: area,
            perimeter: loopPerimeter(e.boundary),
            depth: thickness,
            grossVolume: gross * thickness,
            netVolume: area * thickness,
            ...slope ? { slopedArea: area * Math.hypot(1, slope.grade) } : {}
          }
        });
        return;
      }
      case "column": {
        const at = ctx.point(e.at, `${path}.at`);
        const zBase = ctx.height(e.base, `${path}.base`);
        const zTop = ctx.top(zBase, e.top, `${path}.top`);
        if (zTop <= zBase + bimTolerance) throw new DeriveError("level-order", `${path}.top`);
        const t = ctx.types.get(e.typeId);
        planWithinLimit([at], profileReach(t.profile), `${path}.at`);
        const topAt = e.topAt ? ctx.point(e.topAt, `${path}.topAt`) : void 0;
        if (topAt) planWithinLimit([topAt], profileReach(t.profile), `${path}.topAt`);
        const leans = topAt !== void 0 && distance(at, topAt) > bimTolerance;
        const k = e.topScale ?? 1;
        const tapers = k < 1 - 1e-9;
        shapes.set(e.id, {
          kind: "column",
          at,
          rotationRad: e.rotationRad,
          profile: t.profile,
          zBase,
          zTop,
          ...e.clipBy ? { clipBy: e.clipBy } : {},
          ...leans ? { topAt } : {},
          ...tapers ? { topScale: k } : {}
        });
        const a = profileArea(t.profile);
        const length3 = Math.hypot(zTop - zBase, leans ? distance(at, topAt) : 0);
        const values = { length: length3, crossSectionArea: a };
        if (!e.clipBy) values.netVolume = a * length3 * (1 + k + k * k) / 3;
        quantities.set(e.id, { source: e.clipBy ? "kernel" : "analytic", values });
        return;
      }
      case "beam": {
        const s2 = ctx.point(e.start, `${path}.start`);
        const en = ctx.point(e.end, `${path}.end`);
        if (distance(s2, en) < bimTolerance) throw new DeriveError("beam-degenerate", path);
        const t = ctx.types.get(e.typeId);
        planWithinLimit([s2, en], profileReach(t.profile), path);
        const zTop = ctx.height(e.top, `${path}.top`);
        withinLimit(zTop - profileDepth(t.profile), `${path}.top`);
        const zTopEnd = e.endTop ? ctx.height(e.endTop, `${path}.endTop`) : void 0;
        if (zTopEnd !== void 0) withinLimit(zTopEnd - profileDepth(t.profile), `${path}.endTop`);
        const slopes = zTopEnd !== void 0 && Math.abs(zTopEnd - zTop) > bimTolerance;
        shapes.set(e.id, {
          kind: "beam",
          start: s2,
          end: en,
          zTop,
          profile: t.profile,
          ...slopes ? { zTopEnd } : {}
        });
        const a = profileArea(t.profile);
        const len = Math.hypot(distance(s2, en), slopes ? zTopEnd - zTop : 0);
        quantities.set(e.id, {
          source: "analytic",
          values: { length: len, crossSectionArea: a, netVolume: a * len }
        });
        return;
      }
      case "member": {
        const t = ctx.types.get(e.typeId);
        const [start, end] = ["start", "end"].map((k) => {
          const xy2 = ctx.point(e[k].at, `${path}.${k}.at`);
          planWithinLimit([xy2], profileReach(t.profile), `${path}.${k}.at`);
          const z = ctx.height(e[k].height, `${path}.${k}.height`);
          withinLimit(Math.abs(z) + profileReach(t.profile), `${path}.${k}.height`);
          return [xy2[0], xy2[1], z];
        });
        const length3 = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
        if (length3 < bimTolerance) throw new DeriveError("member-degenerate", path);
        shapes.set(e.id, {
          kind: "member",
          start,
          end,
          rotationRad: e.rotationRad,
          profile: t.profile
        });
        const a = profileArea(t.profile);
        quantities.set(e.id, {
          source: "analytic",
          values: { length: length3, crossSectionArea: a, netVolume: a * length3 }
        });
        return;
      }
      case "ramp": {
        const center = ctx.point(e.center, `${path}.center`);
        const [r, R] = [e.innerRadiusMm, e.outerRadiusMm];
        planWithinLimit([center], R, `${path}.center`);
        const thickness = layersThickness(ctx.types.get(e.typeId));
        const zStart = ctx.height(e.base, `${path}.base`);
        const zEnd = ctx.height(e.top, `${path}.top`);
        for (const [z, k] of [
          [zStart, "base"],
          [zEnd, "top"]
        ]) {
          withinLimit(z, `${path}.${k}`);
          withinLimit(z - thickness, `${path}.${k}`);
        }
        const turns = Math.abs(e.sweepRad) / (2 * Math.PI);
        if (turns >= 1 - 1e-12 && Math.abs(zEnd - zStart) / turns <= thickness + bimTolerance)
          throw new DeriveError("ramp-shape", `${path}.top`);
        const openings = (slabOpenings.get(e.id) ?? []).map((o) => {
          const at = `${pathOf(o.id)}.slab.boundary`;
          checkLoop(o.loop, at);
          return { loop: ccw(o.loop), turns: rampCover(center, r, R, e, o.loop, at) };
        });
        openings.forEach((o, i) => {
          const edges = loopEdges(o.loop);
          for (const q of openings.slice(0, i)) {
            const other = loopEdges(q.loop);
            if (loopsTouch(other, edges) || loopWithin(other, edges) || loopWithin(edges, other))
              throw new DeriveError("opening-overlap", `${pathOf(slabOpenings.get(e.id)[i].id)}`);
          }
        });
        if (openings.length && !(Math.abs(zEnd - zStart) + thickness + 20 <= bimLimits.coordinateMm))
          throw new DeriveError("coordinate", `${path}.top`);
        shapes.set(e.id, {
          kind: "ramp",
          center,
          innerRadius: r,
          outerRadius: R,
          startAngle: e.startAngleRad,
          sweep: e.sweepRad,
          zStart,
          zEnd,
          thickness,
          ...openings.length ? { openings: openings.map((o) => o.loop) } : {}
        });
        const sweep = Math.abs(e.sweepRad);
        const p = (zEnd - zStart) / sweep;
        const planArea = sweep / 2 * (R * R - r * r);
        const F = (q) => {
          const h = Math.hypot(q, p);
          return (q * h + p * p * Math.log(q + h)) / 2;
        };
        const rc = (r + R) / 2;
        const G = (q) => p ? F(q) - F(0) : q * q / 2;
        const patch = (loop) => {
          let sum = 0;
          for (const ed of loopEdges(loop)) {
            const arc = ed.arc;
            const at = (t) => {
              if (!arc) return [sub(add(ed.p, scale(sub(ed.q, ed.p), t)), center), sub(ed.q, ed.p)];
              const a = arc.startAngle + arc.sweep * t;
              const k = arc.radius * arc.sweep;
              return [sub(arcPoint(arc, t), center), [-k * Math.sin(a), k * Math.cos(a)]];
            };
            const n = arc ? 64 : 16;
            for (let k = 0; k < n; k++)
              for (const [x, wt] of gauss5) {
                const [q, dq] = at((k + (x + 1) / 2) / n);
                const rr = dot(q, q);
                sum += G(Math.sqrt(rr)) * ((q[0] * dq[1] - q[1] * dq[0]) / rr) * wt / (2 * n);
              }
          }
          return Math.abs(sum);
        };
        const removed = openings.reduce((n, o) => n + patch(o.loop) * o.turns, 0);
        const topArea = sweep * (F(R) - F(r));
        quantities.set(e.id, {
          source: "analytic",
          values: {
            length: sweep * Math.hypot(rc, p),
            ringWidth: R - r,
            thickness,
            rise: zEnd - zStart,
            planArea,
            topArea: topArea - removed,
            // LS4: an opening takes its area × the thickness from each turn it passes through.
            ...openings.length ? {
              openingArea: openings.reduce((n, o) => n + loopArea(o.loop) * o.turns, 0),
              grossTopArea: topArea,
              grossVolume: planArea * thickness
            } : {},
            netVolume: (planArea - openings.reduce((n, o) => n + loopArea(o.loop) * o.turns, 0)) * thickness
          }
        });
        return;
      }
      case "railing": {
        const host = shapes.get(e.hostId);
        if (host?.kind !== "ramp") throw new DeriveError("railing-host", `${path}.hostId`);
        const t = layersThickness(ctx.types.get(e.typeId));
        const [r, R] = [host.innerRadius, host.outerRadius];
        if (t >= R - r - bimTolerance) throw new DeriveError("railing-shape", `${path}.typeId`);
        const [r0, r1] = e.side === "inner" ? [r, r + t] : [R - t, R];
        const h = e.heightMm;
        for (const z of [host.zStart, host.zEnd]) withinLimit(z + h, `${path}.heightMm`);
        const turns = Math.abs(host.sweep) / (2 * Math.PI);
        const perTurn = Math.abs(host.zEnd - host.zStart) / turns;
        if (turns >= 1 - 1e-12 && h >= perTurn - host.thickness - bimTolerance)
          throw new DeriveError("railing-shape", `${path}.heightMm`);
        shapes.set(e.id, {
          kind: "railing",
          center: host.center,
          innerRadius: r0,
          outerRadius: r1,
          startAngle: host.startAngle,
          sweep: host.sweep,
          zStart: host.zStart + h,
          zEnd: host.zEnd + h,
          thickness: h
        });
        const sweep = Math.abs(host.sweep);
        const p = (host.zEnd - host.zStart) / sweep;
        const length3 = sweep * Math.hypot((r0 + r1) / 2, p);
        quantities.set(e.id, {
          source: "analytic",
          values: {
            length: length3,
            height: h,
            width: t,
            // Each face is a cylinder's strip as high throughout (Codex): sweep × radius × height,
            // whatever the rise; the mean of the two.
            sideArea: sweep * ((r0 + r1) / 2) * h,
            netVolume: sweep / 2 * (r1 * r1 - r0 * r0) * h
          }
        });
        return;
      }
      case "stair": {
        const at = ctx.point(e.start, `${path}.start`);
        const zBase = withinLimit(ctx.height(e.base, `${path}.base`), `${path}.base`);
        const zTop = withinLimit(ctx.height(e.top, `${path}.top`), `${path}.top`);
        const shape = bimStairProfile(
          e.risers,
          (zTop - zBase) / e.risers,
          e.treadMm,
          layersThickness(ctx.types.get(e.typeId)),
          ctx.body.stair.riserMm
        );
        if (shape === "riser") throw new DeriveError("stair-riser", `${path}.top`);
        if (shape === "waist") throw new DeriveError("stair-shape", `${path}.typeId`);
        const d = [Math.cos(e.directionRad), Math.sin(e.directionRad)];
        const run = (e.risers - 1) * e.treadMm;
        const n = [-d[1], d[0]];
        planWithinLimit(
          [-1, 1].flatMap((k) => [
            add(at, scale(n, k * e.widthMm / 2)),
            add(add(at, scale(d, run)), scale(n, k * e.widthMm / 2))
          ]),
          0,
          `${path}.start`
        );
        shapes.set(e.id, {
          kind: "stair",
          at,
          directionRad: e.directionRad,
          zBase,
          width: e.widthMm,
          profile: shape.profile,
          risers: e.risers,
          riser: (zTop - zBase) / e.risers,
          tread: e.treadMm,
          waist: shape.waist
        });
        const side = Math.abs(loopArea(shape.profile));
        quantities.set(e.id, {
          source: "analytic",
          values: {
            length: run,
            flightWidth: e.widthMm,
            height: zTop - zBase,
            numberOfRisers: e.risers,
            riserHeight: (zTop - zBase) / e.risers,
            treadLength: e.treadMm,
            treadArea: run * e.widthMm,
            sideArea: side,
            netVolume: side * e.widthMm
          }
        });
        return;
      }
      case "roof": {
        checkLoop(e.boundary, `${path}.boundary`);
        const thickness = layersThickness(ctx.types.get(e.typeId));
        const zBase = ctx.height(e.base, `${path}.base`);
        const projected = Math.abs(loopArea(e.boundary));
        const poly = loopPolygon(e.boundary);
        let faces = [{ origin: poly[0], direction: [1, 0], slope: 0 }];
        if (e.shape.form === "mono") {
          const direction = [Math.cos(e.shape.directionRad), Math.sin(e.shape.directionRad)];
          faces = [
            {
              origin: loopExtreme(e.boundary, direction),
              direction,
              slope: Math.tan(e.shape.slopeRad)
            }
          ];
        } else if (e.shape.form === "gable" || e.shape.form === "hip")
          faces = pitchedFaces(e.boundary, e.shape, path);
        const slope = faces[0].slope;
        const cos = Math.cos(Math.atan(slope));
        const rise = Math.max(
          ...faces.map(
            (f) => f.region ? Math.max(...f.region.map((p) => f.slope * dot(sub(p, f.origin), f.direction))) : f.slope * dot(sub(loopExtreme(e.boundary, scale(f.direction, -1)), f.origin), f.direction)
          )
        );
        withinLimit(zBase + rise + thickness / cos, `${path}.shape`);
        shapes.set(e.id, {
          kind: "roof",
          form: e.shape.form,
          boundary: ccw(e.boundary),
          zBase,
          faces,
          thicknessMm: thickness
        });
        quantities.set(e.id, {
          source: "analytic",
          values: {
            projectedArea: projected,
            grossArea: projected / cos,
            depth: thickness,
            grossVolume: projected * thickness / cos
          }
        });
        return;
      }
      case "space": {
        checkLoop(e.boundary, `${path}.boundary`);
        const zBase = ctx.height(e.base, `${path}.base`);
        let zTop;
        if (e.top) zTop = ctx.top(zBase, e.top, `${path}.top`);
        else {
          const above = ctx.levelAbove(e.base.level);
          if (!above) throw new DeriveError("space-no-level-above", `${path}.base`);
          zTop = above.elevationMm;
        }
        if (zTop <= zBase + bimTolerance) throw new DeriveError("level-order", `${path}.top`);
        const holes = e.holes ?? [];
        checkVoids(
          loopEdges(e.boundary),
          holes.map((h, i) => ({ loop: h, path: `${path}.holes[${i}]`, opening: false }))
        );
        const area = Math.abs(loopArea(e.boundary)) - holes.reduce((n, h) => n + Math.abs(loopArea(h)), 0);
        shapes.set(e.id, {
          kind: "space",
          boundary: ccw(e.boundary),
          holes: holes.map(ccw),
          zBase,
          zTop
        });
        quantities.set(e.id, {
          source: "analytic",
          values: {
            netFloorArea: area,
            netPerimeter: loopPerimeter(e.boundary),
            height: zTop - zBase,
            netVolume: area * (zTop - zBase)
          }
        });
        return;
      }
      case "part": {
        shapes.set(e.id, {
          kind: "part",
          at: ctx.point(e.at, `${path}.at`),
          rotationRad: e.rotationRad,
          zBase: ctx.height(e.base, `${path}.base`)
        });
        quantities.set(e.id, { source: "none", values: {} });
        return;
      }
      default:
        return;
    }
  }
}
function pitchedFaces(boundary, shape, path) {
  const c = loopPolygon(ccw(boundary));
  const edges = c.map((p, i) => sub(c[(i + 1) % c.length], p));
  const lens = edges.map((d) => Math.hypot(...d));
  const rectangle = c.length === 4 && boundary.every((v) => !v[2]) && edges.every(
    (d, i) => Math.abs(dot(d, edges[(i + 1) % 4])) <= 1e-9 * lens[i] * lens[(i + 1) % 4]
  );
  if (!rectangle) throw new DeriveError("roof-shape", `${path}.boundary`);
  const inward = edges.map((d) => left(unit(d)));
  const slope = Math.tan(shape.slopeRad);
  let eaves;
  let half;
  if (shape.form === "gable") {
    const ridge = [Math.cos(shape.ridgeRad), Math.sin(shape.ridgeRad)];
    eaves = [0, 1, 2, 3].filter((i) => Math.abs(cross(unit(edges[i]), ridge)) <= 1e-9);
    if (eaves.length !== 2) throw new DeriveError("roof-ridge", `${path}.shape.ridgeRad`);
    half = lens[(eaves[0] + 1) % 4] / 2;
  } else {
    eaves = [0, 1, 2, 3];
    half = Math.min(...lens) / 2;
  }
  const inner = (i, corner) => shape.form === "gable" ? add(c[corner], scale(inward[i], half)) : add(c[corner], scale(add(inward[(corner + 3) % 4], inward[corner]), half));
  return eaves.map((i) => {
    const j = (i + 1) % 4;
    const region = [c[i], c[j], inner(i, j), inner(i, i)].filter(
      (p, k, all) => k === 0 || distance(p, all[k - 1]) > bimTolerance
    );
    return { origin: c[i], direction: inward[i], slope, region };
  });
}
function loopExtreme(loop, d) {
  let best = [loop[0][0], loop[0][1]];
  const consider = (p) => {
    if (dot(p, d) < dot(best, d)) best = p;
  };
  loop.forEach((v, i) => {
    const p = [v[0], v[1]];
    consider(p);
    if (!v[2]) return;
    const next = loop[(i + 1) % loop.length];
    const arc = arcOf(p, [next[0], next[1]], v[2]);
    const target = Math.atan2(-d[1], -d[0]);
    const t = ((target - arc.startAngle) * Math.sign(arc.sweep) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    if (t <= Math.abs(arc.sweep)) consider(add(arc.center, scale([-d[0], -d[1]], arc.radius)));
  });
  return best;
}
var loopWithinLimit = (loop) => [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
].every((d) => Math.abs(dot(loopExtreme(loop, d), d)) <= bimLimits.coordinateMm);
function planWithinLimit(points, pad, path) {
  if (points.some((p) => p.some((c) => !(Math.abs(c) + pad <= bimLimits.coordinateMm))))
    throw new DeriveError("coordinate", path);
}
var profileReach = (p) => "diameterMm" in p ? p.diameterMm / 2 : Math.hypot(p.widthMm, p.depthMm) / 2;
var profileDepth = (p) => "diameterMm" in p ? p.diameterMm : p.depthMm;
function checkVoids(outer, voids) {
  const placed = [];
  for (const v of voids) {
    checkLoop(v.loop, v.path);
    const edges = loopEdges(v.loop);
    if (!loopInside(edges, outer))
      throw new DeriveError(v.opening ? "opening-outside-host" : "hole-outside", v.path);
    if (placed.some((p) => loopsTouch(p, edges) || loopWithin(p, edges) || loopWithin(edges, p)))
      throw new DeriveError(v.opening ? "opening-overlap" : "hole-overlap", v.path);
    placed.push(edges);
  }
}
function bimStairProfile(risers, riser, tread, waist, riserMm = bimLimits.stair.riserMm) {
  const [lo, hi] = riserMm;
  if (!(riser >= lo - bimTolerance && riser <= hi + bimTolerance)) return "riser";
  const slope = riser / tread;
  const drop = waist * Math.hypot(1, slope);
  const run = (risers - 1) * tread;
  const foot = (drop - riser) / slope;
  if (!(drop > riser + bimTolerance) || !(foot < run - bimTolerance)) return "waist";
  const profile = [[0, 0]];
  if (foot > bimTolerance) profile.push([foot, 0]);
  const end = risers * riser - drop;
  if (end < (risers - 1) * riser - bimTolerance) profile.push([run, end]);
  for (let k = risers - 1; k >= 1; k--)
    profile.push([k * tread, k * riser], [(k - 1) * tread, k * riser]);
  return { profile, waist };
}
var gauss5 = [
  [0, 128 / 225],
  ...[-1, 1].flatMap((sg) => [
    [sg * Math.sqrt(5 - 2 * Math.sqrt(10 / 7)) / 3, (322 + 13 * Math.sqrt(70)) / 900],
    [sg * Math.sqrt(5 + 2 * Math.sqrt(10 / 7)) / 3, (322 - 13 * Math.sqrt(70)) / 900]
  ])
];
function rampCover(center, r, R, ramp, loop, path) {
  const outside = () => new DeriveError("opening-outside-host", path);
  const pts = [];
  loop.forEach((v, i) => {
    const w = loop[(i + 1) % loop.length];
    const p = [v[0], v[1]];
    pts.push(p);
    if (!v[2]) return;
    const arc = arcOf(p, [w[0], w[1]], v[2]);
    const ts = Array.from({ length: 63 }, (_, k) => (k + 1) / 64);
    const away = sub(arc.center, center);
    const d = Math.hypot(away[0], away[1]);
    if (d > 0) {
      const base = Math.atan2(away[1], away[0]);
      const extremes = [base, base + Math.PI];
      if (d > arc.radius) {
        const off = Math.acos(-arc.radius / d);
        extremes.push(base + off, base - off);
      }
      for (const angle of extremes) {
        const turn2 = 2 * Math.PI;
        const ahead = ((angle - arc.startAngle) % turn2 + turn2) % turn2;
        const t = (arc.sweep > 0 ? ahead : ahead - turn2) / arc.sweep;
        if (t > 0 && t < 1) ts.push(t);
      }
    }
    for (const t of ts.sort((a, b) => a - b)) pts.push(arcPoint(arc, t));
  });
  let lo = Infinity;
  let hi = 0;
  loop.forEach((v, i) => {
    const w = loop[(i + 1) % loop.length];
    if (v[2]) return;
    const d = sub([w[0], w[1]], [v[0], v[1]]);
    const t = Math.max(0, Math.min(1, dot(sub(center, [v[0], v[1]]), d) / dot(d, d)));
    lo = Math.min(lo, distance(center, add([v[0], v[1]], scale(d, t))));
  });
  for (const p of pts) {
    const rho = distance(center, p);
    lo = Math.min(lo, rho);
    hi = Math.max(hi, rho);
  }
  if (lo < r - bimTolerance || hi > R + bimTolerance) throw outside();
  const angles = [];
  for (const p of [...pts, pts[0]]) {
    const a = Math.atan2(p[1] - center[1], p[0] - center[0]);
    const last = angles[angles.length - 1];
    angles.push(last === void 0 ? a : last + Math.atan2(Math.sin(a - last), Math.cos(a - last)));
  }
  if (Math.abs(angles[angles.length - 1] - angles[0]) > Math.PI) throw outside();
  const a0 = Math.min(...angles);
  const a1 = Math.max(...angles);
  const from = Math.min(ramp.startAngleRad, ramp.startAngleRad + ramp.sweepRad);
  const to = Math.max(ramp.startAngleRad, ramp.startAngleRad + ramp.sweepRad);
  const eps = 1e-9;
  let turns = 0;
  for (let m = Math.floor((from - a1) / (2 * Math.PI)) - 1; m <= Math.ceil((to - a0) / (2 * Math.PI)) + 1; m++) {
    const [b0, b1] = [a0 + 2 * Math.PI * m, a1 + 2 * Math.PI * m];
    if (b0 >= from - eps && b1 <= to + eps) turns++;
    else if (b1 > from + eps && b0 < to - eps) throw outside();
  }
  if (!turns) throw outside();
  return turns;
}
function checkLoop(loop, path) {
  if (!loopWithinLimit(loop)) throw new DeriveError("coordinate", path);
  if (loopEdges(loop).some((e) => e.arc && !(e.arc.radius <= bimLimits.arcRadiusMm)))
    throw new DeriveError("arc-too-flat", path);
  if (!loopSimple(loop)) throw new DeriveError("loop-self-intersection", path);
}
var ccw = (loop) => loopArea(loop) < 0 ? reverseLoop(loop) : loop;

// packages/bim-core/src/solids.ts
function bimWallAxis(ctx, wall) {
  const s2 = ctx.point(wall.start, "");
  const e = ctx.point(wall.end, "");
  const t = layersThickness(ctx.types.get(wall.typeId));
  const [leftOff, rightOff] = wall.location === "center" ? [t / 2, -t / 2] : wall.location === "left" ? [0, -t] : [t, 0];
  const arc = wall.bulge ? arcOf(s2, e, wall.bulge) : void 0;
  const length3 = arc ? arc.radius * Math.abs(arc.sweep) : Math.hypot(...sub(e, s2));
  const at = (along) => {
    if (!arc) {
      const u = unit(sub(e, s2));
      return [[s2[0] + u[0] * along, s2[1] + u[1] * along], u];
    }
    const p = arcPoint(arc, along / length3);
    const r = unit(sub(p, arc.center));
    return [p, Math.sign(arc.sweep) > 0 ? left(r) : [r[1], -r[0]]];
  };
  return { s: s2, e, arc, length: length3, leftOff, rightOff, at, x: unit(sub(e, s2)) };
}
function bimWallOpeningLoop(ctx, wall, alongMm, widthMm, rise = 0, band) {
  const a = bimWallAxis(ctx, wall);
  const lean = wall.lean ?? 0;
  const k = 1 / Math.cos(lean);
  const shift = rise * Math.tan(lean);
  const mid = (a.leftOff + a.rightOff) / 2;
  const leftOff = (band === void 0 ? a.leftOff : mid + Math.sign(a.leftOff - a.rightOff || 1) * band) * k;
  const rightOff = (band === void 0 ? a.rightOff : mid - Math.sign(a.leftOff - a.rightOff || 1) * band) * k;
  const m = band === void 0 ? 10 : 0;
  if (!a.arc) {
    const n = left(a.x);
    const p = (t, off) => [
      a.s[0] + a.x[0] * t + n[0] * (off - shift),
      a.s[1] + a.x[1] * t + n[1] * (off - shift)
    ];
    return [
      p(alongMm, rightOff - m),
      p(alongMm + widthMm, rightOff - m),
      p(alongMm + widthMm, leftOff + m),
      p(alongMm, leftOff + m)
    ];
  }
  const sign = Math.sign(a.arc.sweep);
  const radius = a.arc.radius + sign * shift;
  const radii = [radius - sign * leftOff, radius - sign * rightOff];
  const rOut = Math.max(...radii) + m;
  const rIn = Math.min(...radii) - Math.min(m, Math.min(...radii) / 2);
  const a0 = a.arc.startAngle + sign * alongMm / a.arc.radius;
  const a1 = a.arc.startAngle + sign * (alongMm + widthMm) / a.arc.radius;
  const q = (r, ang) => [
    a.arc.center[0] + r * Math.cos(ang),
    a.arc.center[1] + r * Math.sin(ang)
  ];
  const b = Math.tan((a1 - a0) / 4);
  const outer0 = q(rOut, a0);
  const outer1 = q(rOut, a1);
  return [
    [outer0[0], outer0[1], b],
    outer1,
    [...q(rIn, a1), -b],
    q(rIn, a0)
  ];
}
function bimWallOpeningRise(wall, sillMm, heightMm) {
  const c = Math.cos(wall.lean ?? 0);
  return [sillMm * c, (sillMm + heightMm) * c];
}
var norm3 = (v) => {
  const n = Math.hypot(...v);
  return n > 1e-12 ? [v[0] / n, v[1] / n, v[2] / n] : void 0;
};
var cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
function sectionAxes(origin, axis, x) {
  const length3 = Math.hypot(...axis);
  const z = norm3(axis);
  const d = z[0] * x[0] + z[1] * x[1] + z[2] * x[2];
  const xs = norm3([x[0] - d * z[0], x[1] - d * z[1], x[2] - d * z[2]]);
  return { origin, x: xs, y: cross3(z, xs), z, length: length3 };
}
function bimSectionAxes(s2) {
  switch (s2.kind) {
    case "column": {
      const top = s2.topAt ?? s2.at;
      return sectionAxes(
        [s2.at[0], s2.at[1], s2.zBase],
        [top[0] - s2.at[0], top[1] - s2.at[1], s2.zTop - s2.zBase],
        [Math.cos(s2.rotationRad), Math.sin(s2.rotationRad), 0]
      );
    }
    case "beam": {
      const half = profileHeight(s2.profile) / 2;
      const rise = (s2.zTopEnd ?? s2.zTop) - s2.zTop;
      const u = unit(sub(s2.end, s2.start));
      const n = left(u);
      return sectionAxes(
        [s2.start[0], s2.start[1], s2.zTop - half],
        [s2.end[0] - s2.start[0], s2.end[1] - s2.start[1], rise],
        [n[0], n[1], 0]
      );
    }
    case "member": {
      const axis = [s2.end[0] - s2.start[0], s2.end[1] - s2.start[1], s2.end[2] - s2.start[2]];
      const z = norm3(axis);
      const level = norm3(cross3([0, 0, 1], z)) ?? [1, 0, 0];
      const up = cross3(z, level);
      const [c, si] = [Math.cos(s2.rotationRad), Math.sin(s2.rotationRad)];
      return sectionAxes(s2.start, axis, [
        c * level[0] + si * up[0],
        c * level[1] + si * up[1],
        c * level[2] + si * up[2]
      ]);
    }
  }
}
var profileHeight = (p) => "diameterMm" in p ? p.diameterMm : p.depthMm;
function bimProfileLoops(p) {
  const rect = (w, d, cx = 0, cy = 0) => [
    [cx - w / 2, cy - d / 2],
    [cx + w / 2, cy - d / 2],
    [cx + w / 2, cy + d / 2],
    [cx - w / 2, cy + d / 2]
  ];
  switch (p.shape) {
    case "rect":
      return { outer: rect(p.widthMm, p.depthMm), holes: [] };
    case "circle": {
      const r = p.diameterMm / 2;
      return {
        outer: [
          [r, 0, 1],
          [-r, 0, 1]
        ],
        holes: []
      };
    }
    case "pipe": {
      const [r, ri] = [p.diameterMm / 2, p.diameterMm / 2 - p.wallMm];
      return {
        outer: [
          [r, 0, 1],
          [-r, 0, 1]
        ],
        holes: [
          [
            [ri, 0, 1],
            [-ri, 0, 1]
          ]
        ]
      };
    }
    case "box":
      return {
        outer: rect(p.widthMm, p.depthMm),
        holes: [rect(p.widthMm - 2 * p.wallMm, p.depthMm - 2 * p.wallMm)]
      };
    case "h": {
      const [w, d, t, f] = [p.widthMm / 2, p.depthMm / 2, p.webMm / 2, p.flangeMm];
      return {
        outer: [
          [-w, -d],
          [w, -d],
          [w, -d + f],
          [t, -d + f],
          [t, d - f],
          [w, d - f],
          [w, d],
          [-w, d],
          [-w, d - f],
          [-t, d - f],
          [-t, -d + f],
          [-w, -d + f]
        ],
        holes: []
      };
    }
    case "channel": {
      const [w, d, t, f] = [p.widthMm / 2, p.depthMm / 2, p.webMm, p.flangeMm];
      return {
        outer: [
          [-w, -d],
          [w, -d],
          [w, -d + f],
          [-w + t, -d + f],
          [-w + t, d - f],
          [w, d - f],
          [w, d],
          [-w, d]
        ],
        holes: []
      };
    }
    case "l": {
      const [w, d, t] = [p.widthMm / 2, p.depthMm / 2, p.thicknessMm];
      return {
        outer: [
          [-w, -d],
          [w, -d],
          [w, -d + t],
          [-w + t, -d + t],
          [-w + t, d],
          [-w, d]
        ],
        holes: []
      };
    }
  }
}

// packages/bim-core/src/ops.ts
var bimRampStepRad = Math.PI / 36;

// packages/bim-core/src/drawing.ts
var bimDrawingPaper = Object.freeze({
  cutStrokeMm: 0.5,
  seenStrokeMm: 0.18,
  symbolStrokeMm: 0.25,
  thinStrokeMm: 0.13,
  textMm: 2.5,
  bubbleRadiusMm: 4,
  /** How far grid lines run past their ends, and dimensions sit outside them. */
  gridOverrunMm: 8
});
var bimDrawingLimits = Object.freeze({
  /** Lines, arcs and polygon edges of one drawing. */
  primitives: 2e5,
  svgBytes: 32 * 1024 * 1024
});
var bimDrawingMesh = Object.freeze({ deflectionMm: 0.5, angularDeflectionRad: 0.1 });

// packages/factory-core/src/building.ts
var factoryDefaultSizes = Object.freeze({
  source: { widthMm: 1200, depthMm: 1200, heightMm: 1e3 },
  station: { widthMm: 2400, depthMm: 1600, heightMm: 2e3 },
  parallel: { widthMm: 2400, depthMm: 1600, heightMm: 2e3 },
  assembly: { widthMm: 3e3, depthMm: 2e3, heightMm: 2e3 },
  buffer: { widthMm: 1600, depthMm: 1200, heightMm: 1200 },
  conveyor: { widthMm: 3e3, depthMm: 800, heightMm: 900 },
  drain: { widthMm: 1200, depthMm: 1200, heightMm: 1e3 }
});
var factoryDefaultLaneMm = 1e3;
function factoryObjectSize(o) {
  if (o.size) return o.size;
  const d = factoryDefaultSizes[o.kind];
  return o.kind === "conveyor" ? { ...d, widthMm: o.lengthMm } : d;
}
function factoryFootprint(o, at) {
  const { widthMm: w, depthMm: d } = factoryObjectSize(o);
  const a = (at.angle ?? 0) * Math.PI / 180;
  const [c, s2] = [Math.cos(a), Math.sin(a)];
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2]
  ].map(([x, y]) => [at.x + x * c - y * s2, at.y + x * s2 + y * c]);
}
function lane(a, b, width) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const n = [-(b[1] - a[1]) / len * (width / 2), (b[0] - a[0]) / len * (width / 2)];
  return [
    [a[0] - n[0], a[1] - n[1]],
    [b[0] - n[0], b[1] - n[1]],
    [b[0] + n[0], b[1] + n[1]],
    [a[0] + n[0], a[1] + n[1]]
  ];
}
var factoryArcToleranceMm = 2;
function piecesPerArc(...loops) {
  let per = 16;
  for (const loop of loops) if (loop) per = Math.max(per, arcPieces(loop));
  return Math.min(per, 2048);
}
function arcPieces(loop) {
  let per = 16;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    const b = Math.abs(p[2] ?? 0);
    if (!b) continue;
    const theta = 4 * Math.atan(b);
    const r = Math.hypot(q[0] - p[0], q[1] - p[1]) / (2 * Math.sin(theta / 2));
    if (!(r > factoryArcToleranceMm)) continue;
    per = Math.max(per, Math.ceil(theta / (2 * Math.acos(1 - factoryArcToleranceMm / r))));
  }
  return per;
}
function fine(loop, per = piecesPerArc(loop)) {
  return sampleLoop(loop, per);
}
function factoryObstacles(bim) {
  const derived = deriveBim(bim);
  const ctx = new BimContext(bim);
  const out = [];
  for (const e of bim.elements) {
    const s2 = derived.shapes.get(e.id);
    if (!s2) continue;
    if (s2.kind === "wall" && e.kind === "wall") {
      if (s2.zTop <= 0) continue;
      const per = piecesPerArc(s2.footprint, s2.footprintTop);
      out.push({
        elementId: e.id,
        kind: "wall",
        outline: fine(s2.footprint, per),
        ...s2.footprintTop ? { outlineTop: fine(s2.footprintTop, per) } : {},
        zBase: s2.zBase,
        zTop: s2.zTop,
        // An opening counts when its sill is at the wall's lowest occupied height (the floor, or
        // the base of a wall raised above it: below that nothing stands in the way).
        // A leaning wall's openings are measured along its face: their rise is less.
        passages: s2.openings.map((o) => ({ o, rise: bimWallOpeningRise(e, o.sillMm, o.heightMm) })).filter(({ rise }) => s2.zBase + rise[0] <= Math.max(0, s2.zBase)).map(({ o, rise }) => {
          const base = bimWallOpeningLoop(ctx, e, o.alongMm, o.widthMm);
          const top = s2.footprintTop ? bimWallOpeningLoop(ctx, e, o.alongMm, o.widthMm, s2.zTop - s2.zBase) : void 0;
          const n = piecesPerArc(base, top);
          return {
            outline: fine(base, n),
            ...top ? { outlineTop: fine(top, n) } : {},
            heightMm: s2.zBase + rise[1]
          };
        })
      });
    } else if (s2.kind === "column") {
      const loops = bimProfileLoops(s2.profile);
      const scale2 = s2.topScale ?? 1;
      const ax = bimSectionAxes(s2);
      const c = (scale2 - 1) / ax.length;
      const vec = (p) => [0, 1, 2].map((i) => ax.x[i] * p[0] + ax.y[i] * p[1]);
      const point = (p, w) => {
        const v = vec(p);
        return [0, 1, 2].map((i) => ax.origin[i] + ax.z[i] * w + (1 + c * w) * v[i]);
      };
      const cutOf = (loop, z) => {
        const out2 = [];
        for (const p of loop) {
          const v = vec(p);
          const dz = ax.z[2] + c * v[2];
          if (Math.abs(dz) < 1e-9) return void 0;
          const w = (z - ax.origin[2] - v[2]) / dz;
          const q = point(p, w);
          out2.push([q[0], q[1]]);
        }
        return out2;
      };
      const section = fine(loops.outer);
      const base3 = section.map((p) => point(p, 0));
      const top3 = section.map((p) => point(p, ax.length));
      const zs = (pts) => pts.map((p) => p[2]);
      const z0 = Math.min(...zs(base3), ...zs(top3));
      const z1 = Math.max(...zs(base3), ...zs(top3));
      const zb = Math.max(...zs(base3));
      const zt = Math.min(...zs(top3));
      if (z1 <= 0) continue;
      const voids = (from, to) => loops.holes.flatMap((h) => {
        const f = fine(h);
        const [hl, hh] = [cutOf(f, from), cutOf(f, to)];
        return hl && hh ? [{ outline: hl, ...to > from ? { outlineTop: hh } : {} }] : [];
      });
      const add2 = (o) => {
        if (o.zTop <= 0 || o.zTop <= o.zBase) return;
        const holes = o.holes?.length ? { holes: o.holes } : {};
        out.push({ elementId: e.id, kind: "column", ...o, passages: [], ...holes });
      };
      const flat = (pts) => convexHull(pts.map((p) => [p[0], p[1]]));
      const swept = !!s2.topAt || scale2 !== 1;
      const lo = cutOf(section, zb);
      const hi = cutOf(section, zt);
      const along = (q, z) => (q[0] - ax.origin[0]) * ax.z[0] + (q[1] - ax.origin[1]) * ax.z[1] + (z - ax.origin[2]) * ax.z[2];
      const clipped = (z) => {
        const cut = cutOf(section, z);
        if (!cut) return void 0;
        return clipHalfPlane(
          clipHalfPlane(cut, (q) => along(q, z)),
          (q) => ax.length - along(q, z)
        );
      };
      const slabs = (from, to) => {
        from = Math.max(0, from);
        if (to - from <= 1e-6) return true;
        const n = Math.min(48, Math.max(1, Math.ceil((to - from) / 100)));
        const at = Array.from({ length: n + 1 }, (_, i) => from + (to - from) * i / n);
        const cuts = at.map(clipped);
        if (cuts.some((c2) => !c2)) return false;
        for (let i = 0; i < n; i++) {
          const [a, b] = [at[i], at[i + 1]];
          const corners = [...base3, ...top3].filter((q) => q[2] >= a && q[2] <= b);
          const pts = [...cuts[i], ...cuts[i + 1], ...corners];
          if (pts.length < 3) continue;
          add2({
            outline: cutOf(section, a),
            outlineTop: cutOf(section, b),
            zBase: a,
            zTop: b,
            holes: voids(a, b),
            within: flat(pts)
          });
        }
        return true;
      };
      if (zt - zb > 1e-6 && lo && hi) {
        add2({
          outline: lo,
          ...swept ? { outlineTop: hi } : {},
          zBase: zb,
          zTop: zt,
          holes: voids(zb, zt)
        });
        if (zb - z0 > 1e-6 && !slabs(z0, zb))
          add2({ outline: flat([...base3, ...lo]), zBase: z0, zTop: zb, holes: voids(z0, zb) });
        if (z1 - zt > 1e-6 && !slabs(zt, z1))
          add2({ outline: flat([...top3, ...hi]), zBase: zt, zTop: z1, holes: voids(zt, z1) });
      } else if (!slabs(z0, z1)) {
        add2({ outline: flat([...base3, ...top3]), zBase: z0, zTop: z1, holes: voids(z0, z1) });
      }
    }
  }
  return out;
}
function clipHalfPlane(poly, f) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const [fa, fb] = [f(a), f(b)];
    if (fa >= 0) out.push(a);
    if (fa >= 0 !== fb >= 0) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
function convexHull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross2 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (pts) => {
    const h = [];
    for (const q of pts) {
      while (h.length >= 2 && cross2(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  return [...half(p), ...half([...p].reverse())];
}
function between(base, top, k) {
  if (!top || top.length !== base.length || k <= 0) return base;
  return base.map(([x, y], i) => [x + (top[i][0] - x) * k, y + (top[i][1] - y) * k]);
}
function sweptOverlap(box, o, h) {
  const ks = slices(o, h);
  const k0 = ks[0];
  const k1 = ks[ks.length - 1];
  const lo = between(o.outline, o.outlineTop, k0);
  if (factoryPolygonsOverlap(box, lo)) return true;
  if (k1 === k0) return false;
  const hi = between(o.outline, o.outlineTop, k1);
  if (factoryPolygonsOverlap(box, hi)) return true;
  for (let i = 0; i < lo.length; i++) {
    const j = (i + 1) % lo.length;
    if (factoryPolygonsOverlap(box, [lo[i], lo[j], hi[j], hi[i]])) return true;
  }
  return false;
}
function spans(o, h) {
  const ks = slices(o, h);
  return ks.length > 1 ? ks.slice(1).map((k, j) => [ks[j], k]) : [[ks[0], ks[0]]];
}
function slices(o, h) {
  const lo = Math.max(0, o.zBase);
  const hi = Math.min(h, o.zTop);
  const k = (z) => o.zTop > o.zBase ? (z - o.zBase) / (o.zTop - o.zBase) : 0;
  if (!o.outlineTop || hi <= lo) return [k(lo)];
  const n = Math.min(16, Math.max(1, Math.ceil((hi - lo) / 250)));
  return Array.from({ length: n + 1 }, (_, i) => k(lo + (hi - lo) * i / n));
}
function factoryPolygonsOverlap(a, b) {
  return polygonsTouch(a, b) || !!a[0] && pointInPolygon(a[0], b) || !!b[0] && pointInPolygon(b[0], a);
}
function inVoid(shape, o, h) {
  if (!o.holes) return false;
  const k = (z) => o.zTop > o.zBase ? (z - o.zBase) / (o.zTop - o.zBase) : 0;
  const ends = [k(Math.max(0, o.zBase)), k(Math.min(h, o.zTop))];
  return o.holes.some(
    (v) => ends.every((k2) => {
      const at = between(v.outline, v.outlineTop, k2);
      return shape.every((p) => within(p, at));
    })
  );
}
function within(p, outline, tol = 1) {
  if (pointInPolygon(p, outline)) return true;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const l2 = dx * dx + dy * dy;
    const k = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    if (Math.hypot(p[0] - a[0] - k * dx, p[1] - a[1] - k * dy) <= tol) return true;
  }
  return false;
}
function checkFactoryBuilding(doc, bim, obstacles = factoryObstacles(bim)) {
  const out = [];
  doc.objects.forEach((o, i) => {
    if (!o.at) return;
    const box = factoryFootprint(o, o.at);
    const h = factoryObjectSize(o).heightMm;
    const met = /* @__PURE__ */ new Set();
    for (const b of obstacles) {
      if (met.has(b.elementId)) continue;
      if (b.zBase >= h || b.zTop <= 0) continue;
      if (!sweptOverlap(box, b, h)) continue;
      if (b.within && !factoryPolygonsOverlap(box, b.within)) continue;
      if (inVoid(box, b, h)) continue;
      met.add(b.elementId);
      out.push({
        code: "object-clash",
        path: `$.objects.${i}`,
        message: `${o.name || o.id} runs into ${b.kind} ${b.elementId}`
      });
    }
  });
  const nodes = new Map((doc.paths?.nodes ?? []).map((n) => [n.id, n]));
  const width = Math.max(0, ...(doc.fleets ?? []).map((f) => f.widthMm ?? factoryDefaultLaneMm)) || factoryDefaultLaneMm;
  const vehicleHeight = 2e3;
  (doc.paths?.segments ?? []).forEach((g, i) => {
    const a = nodes.get(g.from);
    const b = nodes.get(g.to);
    if (!a || !b) return;
    const band = lane([a.x, a.y], [b.x, b.y], width);
    const met = /* @__PURE__ */ new Set();
    for (const o of obstacles) {
      if (met.has(o.elementId)) continue;
      if (o.zBase >= vehicleHeight || o.zTop <= 0) continue;
      const blocked = spans(o, vehicleHeight).some(([k0, k1]) => {
        const wall = pieces(o.outline, o.outlineTop, k0, k1);
        if (!wall.some((w) => factoryPolygonsOverlap(band, w))) return false;
        if (o.within && !factoryPolygonsOverlap(band, o.within)) return false;
        return !o.passages.some(
          (p) => (
            // Clear up to the vehicle's height, or the wall's top where that is lower.
            p.heightMm >= Math.min(vehicleHeight, o.zTop) && passesThrough(band, wall, pieces(p.outline, p.outlineTop, k0, k1))
          )
        );
      });
      if (!blocked || inVoid(band, o, vehicleHeight)) continue;
      met.add(o.elementId);
      out.push({
        code: "path-clash",
        path: `$.paths.segments.${i}`,
        message: `${g.id} runs into ${o.kind} ${o.elementId}`
      });
    }
  });
  return out;
}
function pieces(base, top, k0, k1) {
  const lo = between(base, top, k0);
  if (k1 === k0 || !top) return [lo];
  const hi = between(base, top, k1);
  return [
    lo,
    hi,
    ...lo.map((_, i) => {
      const j = (i + 1) % lo.length;
      return [lo[i], lo[j], hi[j], hi[i]];
    })
  ];
}
function passesThrough(band, wall, opening) {
  const pts = band.filter((p) => wall.some((w) => within(p, w)));
  for (const w of wall) {
    for (const p of w) if (pointInPolygon(p, band)) pts.push(p);
    for (let i = 0; i < band.length; i++) {
      const p = band[i];
      const q = band[(i + 1) % band.length];
      for (let j = 0; j < w.length; j++) {
        const x = crossing(p, q, w[j], w[(j + 1) % w.length]);
        if (x) pts.push(x);
      }
    }
  }
  return pts.length > 0 && pts.every((p) => opening.some((o) => within(p, o)));
}
function crossing(p, q, a, b) {
  const r = [q[0] - p[0], q[1] - p[1]];
  const s2 = [b[0] - a[0], b[1] - a[1]];
  const den = r[0] * s2[1] - r[1] * s2[0];
  if (Math.abs(den) < 1e-9) return void 0;
  const t = ((a[0] - p[0]) * s2[1] - (a[1] - p[1]) * s2[0]) / den;
  const u = ((a[0] - p[0]) * r[1] - (a[1] - p[1]) * r[0]) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return void 0;
  return [p[0] + t * r[0], p[1] + t * r[1]];
}

// packages/factory-core/src/replay.ts
var shownOrder = [
  "failed",
  "setup",
  "working",
  "unstaffed",
  "transport",
  "blocked",
  "held",
  "paused",
  "waiting"
];
var rank2 = factoryStates.map(
  (s2) => shownOrder.includes(s2) ? shownOrder.indexOf(s2) : shownOrder.length
);
var checkpointEvery = 512;
function lastAtOrBefore(n, starts, t) {
  let lo = 0;
  let hi = n - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = lo + hi >> 1;
    if (starts(mid) <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}
var FactoryReplay = class {
  constructor(doc, timeline, places, endMs) {
    this.doc = doc;
    this.places = places;
    this.endMs = Math.min(endMs, timeline.recordedUntilMs ?? Infinity);
    this.states = timeline.states.map((rows) => {
      const out = [];
      for (let k = 0; k + 3 < rows.length; k += 4)
        (out[rows[k + 3]] ??= []).push(rows.slice(k, k + 4));
      for (const p of out) p?.sort((a, b2) => a[0] - b2[0]);
      return out.filter(Boolean);
    });
    const open = /* @__PURE__ */ new Map();
    const stays = this.stays;
    const m = timeline.moves;
    for (let k = 0; k + 4 < m.length; k += 5) {
      const [time, part, product, , to] = m.slice(k, k + 5);
      const was = open.get(part);
      if (was) was[1] = time;
      open.delete(part);
      if (to < 0 || doc.objects[to]?.kind === "drain") continue;
      const stay = [time, Infinity, part, product, to];
      stays.push(stay);
      open.set(part, stay);
    }
    const live = /* @__PURE__ */ new Set();
    stays.forEach((s2, i) => {
      if (i % checkpointEvery === 0) {
        for (const x of live) if (x[1] <= s2[0]) live.delete(x);
        this.checkpoints.push([...live]);
      }
      live.add(s2);
    });
    const belts = /* @__PURE__ */ new Map();
    const b = timeline.belts;
    for (let k = 0; k + 2 < b.length; k += 3) {
      const [time, object, stop] = [b[k], b[k + 1], b[k + 2]];
      const rows = belts.get(object) ?? [];
      if (stop) rows.push([time, Infinity]);
      else if (rows.length && rows[rows.length - 1][1] === Infinity)
        rows[rows.length - 1][1] = time;
      belts.set(object, rows);
    }
    for (const [object, rows] of belts) {
      const before2 = [];
      let sum = 0;
      for (const r of rows) {
        before2.push(sum);
        sum += Math.min(r[1], this.endMs) - r[0];
      }
      this.stopped.set(object, {
        from: rows.map((r) => r[0]),
        to: rows.map((r) => r[1]),
        before: before2
      });
    }
    const fleets = doc.fleets ?? [];
    this.drives = fleets.map((f) => Array.from({ length: f.count }, () => []));
    const d = timeline.drives;
    for (let k = 0; k + 6 < d.length; k += 7)
      this.drives[d[k + 2]]?.[d[k + 3]]?.push(d.slice(k, k + 7));
    const staysOf = /* @__PURE__ */ new Map();
    for (const st of stays) {
      const key = `${st[2]},${st[4]}`;
      const l = staysOf.get(key) ?? [];
      l.push(st);
      staysOf.set(key, l);
    }
    for (const l of staysOf.values()) l.sort((a, b2) => a[0] - b2[0]);
    this.holds = this.drives.map((fleet) => fleet.map(() => []));
    const pickups = /* @__PURE__ */ new Map();
    const ld = timeline.loads;
    for (let k = 0; k + 4 < ld.length; k += 5) {
      const [at, f, v, part, from] = [ld[k], ld[k + 1], ld[k + 2], ld[k + 3], ld[k + 4]];
      const rows = this.holds[f]?.[v];
      if (!rows) continue;
      const own = staysOf.get(`${part},${from}`) ?? [];
      const last = own[lastAtOrBefore(own.length, (j) => own[j][0], at)];
      const pick = last && at <= last[1] ? last : void 0;
      const until = pick ? pick[1] : Infinity;
      rows.push([at, until, part]);
      const p = pickups.get(part) ?? [];
      p.push(at);
      pickups.set(part, p);
    }
    for (const fleet of this.holds) for (const rows of fleet) rows.sort((a, b2) => a[0] - b2[0]);
    for (const p of pickups.values()) p.sort((a, b2) => a - b2);
    for (const st of stays) {
      const o = doc.objects[st[4]];
      if (o?.kind !== "conveyor" || !o.accumulating) continue;
      const p = pickups.get(st[2]) ?? [];
      let [first, hi] = [0, p.length];
      while (first < hi) {
        const mid = first + hi >> 1;
        if (p[mid] < st[0]) first = mid + 1;
        else hi = mid;
      }
      const left2 = first < p.length && p[first] < st[1] ? p[first] : st[1];
      if (left2 === Infinity) continue;
      const l = this.leaves.get(st[4]) ?? [];
      l.push(left2);
      this.leaves.set(st[4], l);
    }
    for (const l of this.leaves.values()) l.sort((a, b2) => a - b2);
    const pools = doc.workerPools ?? [];
    this.walks = pools.map((p) => Array.from({ length: p.count }, () => []));
    const w = timeline.walks;
    for (let k = 0; k + 4 < w.length; k += 5)
      this.walks[w[k + 2]]?.[w[k + 3]]?.push(w.slice(k, k + 5));
    this.nodes = new Map((doc.paths?.nodes ?? []).map((n) => [n.id, n]));
  }
  startMs = 0;
  endMs;
  states;
  /** Part stays by start; at every `checkpointEvery`-th, the stays still open when it starts. */
  stays = [];
  checkpoints = [];
  /** Per non-accumulating conveyor (object index): its stopped intervals, and their sums. */
  stopped = /* @__PURE__ */ new Map();
  /** Per accumulating conveyor (object index): the times parts left it, in order. */
  leaves = /* @__PURE__ */ new Map();
  drives;
  /**
   * Per fleet and vehicle, in time order: `[from, until, part]` while it holds a part, from the
   * start of its loading to the part's arrival (through driving, unloading and waits);
   * `until` is Infinity for a part not delivered (the run, or its recording, ended on the way).
   */
  holds;
  walks;
  nodes;
  /** Time the conveyor's belt has run by `t` (a non-accumulating one stands while blocked). */
  beltTime(object, t) {
    const s2 = this.stopped.get(object);
    if (!s2) return t;
    const i = lastAtOrBefore(s2.from.length, (j) => s2.from[j], t);
    if (i < 0) return t;
    return t - s2.before[i] - (Math.min(t, s2.to[i]) - s2.from[i]);
  }
  place(object) {
    const o = this.doc.objects[object];
    return (o && this.places.get(o.id)) ?? { x: 0, y: 0 };
  }
  /** The factory at `t` (clamped to the run). */
  at(t) {
    t = Math.max(0, Math.min(this.endMs, t));
    const states = this.states.map((places) => {
      let best = -1;
      for (const rows of places) {
        const r = rows[lastAtOrBefore(rows.length, (j) => rows[j][0], t)];
        if (!r || r[1] <= t && !(t === this.endMs && r[1] === t)) continue;
        if (best < 0 || rank2[r[2]] < rank2[best]) best = r[2];
      }
      return best;
    });
    const carried = /* @__PURE__ */ new Set();
    const holding2 = (fi, v) => {
      const rows = this.holds[fi]?.[v] ?? [];
      const r = rows[lastAtOrBefore(rows.length, (j) => rows[j][0], t)];
      return r && t < r[1] ? r[2] : -1;
    };
    this.holds.forEach(
      (fleet, fi) => fleet.forEach((_, v) => {
        const part = holding2(fi, v);
        if (part >= 0) carried.add(part);
      })
    );
    const parts = [];
    const conveyors = /* @__PURE__ */ new Map();
    const last = lastAtOrBefore(this.stays.length, (j) => this.stays[j][0], t);
    const c = Math.floor(Math.max(0, last) / checkpointEvery);
    const candidates = last < 0 ? [] : [...this.checkpoints[c] ?? [], ...this.stays.slice(c * checkpointEvery, last + 1)];
    for (const s2 of candidates) {
      if (!(s2[0] <= t && t < s2[1]) && !(t === this.endMs && s2[1] === Infinity)) continue;
      if (carried.has(s2[2])) continue;
      const p = { part: s2[2], product: s2[3], object: s2[4] };
      const o = this.doc.objects[s2[4]];
      if (o.kind === "conveyor") {
        const moved = this.beltTime(s2[4], t) - this.beltTime(s2[4], s2[0]);
        p.along = Math.min(1, moved * o.speedMmS / 1e3 / o.lengthMm);
        const on = conveyors.get(s2[4]) ?? [];
        on.push(Object.assign(p, { enter: s2[0] }));
        conveyors.set(s2[4], on);
      }
      parts.push(p);
    }
    for (const [object, on] of conveyors) {
      const o = this.doc.objects[object];
      if (o.kind !== "conveyor") continue;
      if (!o.accumulating) {
        for (const p of on) delete p.enter;
        continue;
      }
      const gap = o.partLengthMm / o.lengthMm;
      on.sort(
        (a, b) => a.enter - b.enter
      );
      const l = this.leaves.get(object) ?? [];
      const left2 = l[lastAtOrBefore(l.length, (j) => l[j], t)];
      const lead = left2 === void 0 ? 1 : 1 - gap + (this.beltTime(object, t) - this.beltTime(object, left2)) * o.speedMmS / 1e3 / o.lengthMm;
      on.forEach((p, k) => {
        delete p.enter;
        const ahead = k ? on[k - 1].along - gap : lead;
        p.along = Math.min(p.along, Math.max(0, ahead));
      });
    }
    parts.sort((a, b) => a.part - b.part);
    const segs = this.doc.paths?.segments ?? [];
    const vehicles = [];
    (this.doc.fleets ?? []).forEach((f, fi) => {
      for (let v = 0; v < f.count; v++) {
        const rows = this.drives[fi][v];
        const i = lastAtOrBefore(rows.length, (j) => rows[j][0], t);
        const home = this.nodes.get(f.homeNodeId) ?? { x: 0, y: 0 };
        if (i < 0) {
          vehicles.push({
            fleet: fi,
            vehicle: v,
            ...xy(home),
            heading: 0,
            driving: false,
            loaded: holding2(fi, v) >= 0
          });
          continue;
        }
        const [start, end, , , seg, forward] = rows[i];
        const g = segs[seg];
        const a = (g && this.nodes.get(forward ? g.from : g.to)) ?? home;
        const b = (g && this.nodes.get(forward ? g.to : g.from)) ?? home;
        const driving = t < end;
        const k = driving ? (t - start) / Math.max(1, end - start) : 1;
        vehicles.push({
          fleet: fi,
          vehicle: v,
          x: a.x + (b.x - a.x) * k,
          y: a.y + (b.y - a.y) * k,
          heading: Math.atan2(b.y - a.y, b.x - a.x),
          driving,
          loaded: holding2(fi, v) >= 0
        });
      }
    });
    const workers = [];
    (this.doc.workerPools ?? []).forEach((p, pi) => {
      for (let w = 0; w < p.count; w++) {
        const rows = this.walks[pi][w];
        const i = lastAtOrBefore(rows.length, (j) => rows[j][0], t);
        const home = { x: p.home?.x ?? 0, y: p.home?.y ?? 0 };
        if (i < 0) {
          workers.push({ pool: pi, worker: w, ...home, heading: 0, walking: false });
          continue;
        }
        const [start, arrive, , , object] = rows[i];
        const a = i > 0 ? this.place(rows[i - 1][4]) : home;
        const b = this.place(object);
        const walking = t < arrive;
        const k = walking ? (t - start) / Math.max(1, arrive - start) : 1;
        workers.push({
          pool: pi,
          worker: w,
          x: a.x + (b.x - a.x) * k,
          y: a.y + (b.y - a.y) * k,
          heading: b.x === a.x && b.y === a.y ? 0 : Math.atan2(b.y - a.y, b.x - a.x),
          walking
        });
      }
    });
    return { timeMs: t, states, parts, vehicles, workers };
  }
};
var xy = (p) => ({ x: p.x, y: p.y });

// packages/factory-core/src/experiments.ts
var factoryExperimentMetrics = Object.freeze([
  "throughputPerHour",
  "produced",
  "leadTimeMeanMs",
  "leadTimeP95Ms",
  "wipMean",
  "deadlock"
]);
var factoryExperimentOf = (doc) => doc.experiment ?? { replications: 5, factors: [] };
function factoryExperimentCombinations(experiment) {
  let out = [[]];
  for (const f of experiment.factors) out = out.flatMap((c) => f.values.map((v) => [...c, v]));
  return out;
}
var factoryExperimentSize = (experiment) => factoryExperimentCombinations(experiment).length * experiment.replications;
var scaled = (d, percent) => {
  const s2 = (v) => Math.round(v * percent / 100);
  switch (d.type) {
    case "const":
      return { type: "const", value: s2(d.value) };
    case "uniform":
      return { type: "uniform", min: s2(d.min), max: s2(d.max) };
    case "triangular":
      return { type: "triangular", min: s2(d.min), mode: s2(d.mode), max: s2(d.max) };
    case "normal":
      return {
        type: "normal",
        mean: s2(d.mean),
        sd: s2(d.sd),
        ...d.min !== void 0 ? { min: s2(d.min) } : {},
        ...d.max !== void 0 ? { max: s2(d.max) } : {}
      };
    case "lognormal":
      return { type: "lognormal", mean: s2(d.mean), sd: s2(d.sd) };
    case "exponential":
      return { type: "exponential", mean: s2(d.mean) };
    case "empirical":
      return {
        type: "empirical",
        values: d.values.map((v) => ({ value: s2(v.value), weight: v.weight }))
      };
  }
};
function applyFactoryFactors(doc, factors, values) {
  const next = structuredClone(doc);
  delete next.experiment;
  factors.forEach((f, i) => {
    const v = values[i];
    if (f.kind === "fleet-count") {
      const fleet = next.fleets?.find((x) => x.id === f.targetId);
      if (fleet) fleet.count = v;
      return;
    }
    if (f.kind === "pool-count") {
      const pool = next.workerPools?.find((x) => x.id === f.targetId);
      if (pool) pool.count = v;
      return;
    }
    const o = next.objects.find((x) => x.id === f.targetId);
    if (!o) return;
    if (f.kind === "buffer-capacity" && o.kind === "buffer") o.capacity = v;
    else if (f.kind === "parallel-count" && o.kind === "parallel") o.count = v;
    else if (f.kind === "time-scale" && (o.kind === "station" || o.kind === "parallel" || o.kind === "assembly")) {
      o.processTime = scaled(o.processTime, v);
      if (o.kind !== "assembly" && o.productTimes)
        o.productTimes = o.productTimes.map((t) => ({ ...t, time: scaled(t.time, v) }));
    }
  });
  return next;
}
function factoryExperimentValues(result) {
  return {
    throughputPerHour: result.throughputPerHour,
    produced: result.produced,
    leadTimeMeanMs: result.leadTime.meanMs,
    leadTimeP95Ms: result.leadTime.p95Ms,
    wipMean: result.wip.mean,
    deadlock: result.deadlock ? 1 : 0
  };
}
function* runFactoryExperiment(doc, options = {}) {
  const experiment = factoryExperimentOf(doc);
  const problems = validateFactory(doc);
  if (problems.length)
    throw new FactoryValidationError(problems[0].code, problems[0].message, problems);
  const combinations = factoryExperimentCombinations(experiment);
  const variants = combinations.map(
    (values) => applyFactoryFactors(doc, experiment.factors, values)
  );
  for (let replication = 0; replication < experiment.replications; replication++) {
    const seed = doc.run.seed + replication >>> 0;
    for (let combination = 0; combination < combinations.length; combination++) {
      try {
        const result = runFactory(variants[combination], {
          seed,
          ...options.maxEvents ? { maxEvents: options.maxEvents } : {}
        });
        yield {
          combination,
          replication,
          seed,
          values: factoryExperimentValues(result),
          ...result.bottlenecks[0] && result.bottlenecks[0].share > 0 ? { bottleneck: result.bottlenecks[0].id } : {}
        };
      } catch (error) {
        yield {
          combination,
          replication,
          seed,
          error: error instanceof FactoryValidationError ? error.code : error instanceof Error ? error.message : "failed"
        };
      }
    }
  }
}
var t975 = [
  12.706,
  4.303,
  3.182,
  2.776,
  2.571,
  2.447,
  2.365,
  2.306,
  2.262,
  2.228,
  2.201,
  2.179,
  2.16,
  2.145,
  2.131,
  2.12,
  2.11,
  2.101,
  2.093,
  2.086,
  2.08,
  2.074,
  2.069,
  2.064,
  2.06,
  2.056,
  2.052,
  2.048,
  2.045,
  2.042
];
function studentT975(df) {
  if (!(df >= 1)) return NaN;
  const n = Math.floor(df);
  if (n <= 30) return t975[n - 1];
  const z = 1.959963985;
  const z3 = z ** 3;
  const z5 = z ** 5;
  const z7 = z ** 7;
  return z + (z3 + z) / (4 * n) + (5 * z5 + 16 * z3 + 3 * z) / (96 * n ** 2) + (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * n ** 3);
}
function factoryStat(values) {
  const n = values.length;
  if (!n) return { n: 0, mean: 0, sd: 0 };
  const mean = values.reduce((s2, v) => s2 + v, 0) / n;
  if (n < 2) return { n, mean, sd: 0 };
  const sd = Math.sqrt(values.reduce((s2, v) => s2 + (v - mean) ** 2, 0) / (n - 1));
  return { n, mean, sd, halfWidth: studentT975(n - 1) * sd / Math.sqrt(n) };
}
function summarizeFactoryExperiment(experiment, runs) {
  return factoryExperimentCombinations(experiment).map((values, combination) => {
    const mine = runs.filter((r) => r.combination === combination);
    const ok = mine.filter((r) => r.values);
    const stats = Object.fromEntries(
      factoryExperimentMetrics.map((m) => [m, factoryStat(ok.map((r) => r.values[m]))])
    );
    const counts = /* @__PURE__ */ new Map();
    for (const r of ok)
      if (r.bottleneck) counts.set(r.bottleneck, (counts.get(r.bottleneck) ?? 0) + 1);
    let bottleneck;
    for (const [id, c] of counts) if (!bottleneck || c > counts.get(bottleneck)) bottleneck = id;
    return {
      combination,
      values,
      runs: mine.length,
      failed: mine.length - ok.length,
      stats,
      ...bottleneck ? { bottleneck } : {}
    };
  });
}
var factoryFactorColumn = (f) => `${f.kind}:${f.targetId}`;
var csvField2 = (v) => /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
var num2 = (v) => v === void 0 || !Number.isFinite(v) ? "" : String(Math.round(v * 1e6) / 1e6);
var csv = (rows) => rows.map((r) => r.map(csvField2).join(",")).join("\r\n") + "\r\n";
function writeFactoryExperimentCsv(experiment, runs) {
  const header = [
    ...experiment.factors.map(factoryFactorColumn),
    "runs",
    "failed",
    ...factoryExperimentMetrics.flatMap((m) => [
      `${m}_mean`,
      `${m}_ci95_low`,
      `${m}_ci95_high`,
      `${m}_sd`
    ]),
    "bottleneck"
  ];
  const rows = summarizeFactoryExperiment(experiment, runs).map((s2) => [
    ...s2.values.map(String),
    String(s2.runs),
    String(s2.failed),
    ...factoryExperimentMetrics.flatMap((m) => {
      const st = s2.stats[m];
      if (!st.n) return ["", "", "", ""];
      const h = st.halfWidth;
      return [
        num2(st.mean),
        h === void 0 ? "" : num2(st.mean - h),
        h === void 0 ? "" : num2(st.mean + h),
        num2(st.sd)
      ];
    }),
    s2.bottleneck ?? ""
  ]);
  return csv([header, ...rows]);
}
function writeFactoryExperimentRunsCsv(experiment, runs) {
  const combinations = factoryExperimentCombinations(experiment);
  const header = [
    ...experiment.factors.map(factoryFactorColumn),
    "replication",
    "seed",
    ...factoryExperimentMetrics,
    "bottleneck",
    "error"
  ];
  const rows = [...runs].sort((a, b) => a.combination - b.combination || a.replication - b.replication).map((r) => [
    ...(combinations[r.combination] ?? []).map(String),
    String(r.replication),
    String(r.seed),
    ...factoryExperimentMetrics.map((m) => num2(r.values?.[m])),
    r.bottleneck ?? "",
    r.error ?? ""
  ]);
  return csv([header, ...rows]);
}
export {
  FACTORY_SCHEMA,
  FactoryRandom,
  FactoryReplay,
  FactoryValidationError,
  activePeriodBottlenecks,
  applyFactoryFactors,
  applyFactoryOperation,
  calendarOn,
  checkFactoryBuilding,
  distributionMean,
  f170SmallLine,
  f172SmallLineExperiment,
  f174PlcLine,
  f175PlcLineBug,
  factoryActuatorKinds,
  factoryActuatorSignals,
  factoryArcToleranceMm,
  factoryContentHash,
  factoryDefaultLaneMm,
  factoryDefaultSizes,
  factoryDistributionTypes,
  factoryEditorCommand,
  factoryExitStrategies,
  factoryExperimentCombinations,
  factoryExperimentMetrics,
  factoryExperimentOf,
  factoryExperimentSize,
  factoryExperimentValues,
  factoryFactorColumn,
  factoryFactorKinds,
  factoryFootprint,
  factoryHistogramBins,
  factoryId,
  factoryIds,
  factoryLimits,
  factoryObjectKinds,
  factoryObjectSize,
  factoryObstacles,
  factoryPolygonsOverlap,
  factorySensorKinds,
  factorySensorSignals,
  factoryStat,
  factoryStates,
  factoryTimesCsvColumns,
  factoryVehicleStates,
  factoryWarnings,
  freshFactoryId,
  isFactoryDocument,
  newFactory,
  nextCalendarChange,
  parseFactoryCsvRows,
  readFactoryTimesCsv,
  runFactory,
  runFactoryExperiment,
  sampleDistribution,
  startFactoryRun,
  studentT975,
  summarizeFactoryExperiment,
  validateFactory,
  writeFactoryExperimentCsv,
  writeFactoryExperimentRunsCsv,
  writeFactoryTimesCsv
};
/*! Bundled license information:

@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/

// Tiny zero-dependency test harness. Collects cases, runs them, prints a
// summary, and exits non-zero on any failure (so `npm test` fails CI).
let suite = 'tests';
const cases = [];

export function describe(name, fn) { suite = name; fn(); }
export function test(name, fn) { cases.push({ suite, name, fn }); }

export function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}
export function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'eq'}: expected ${expected}, got ${actual}`);
  }
}
export function approx(actual, expected, tol = 1e-6, msg) {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${msg || 'approx'}: expected ~${expected}, got ${actual}`);
  }
}
export function ok(cond, msg) { assert(cond, msg); }

export async function run() {
  let pass = 0, fail = 0;
  for (const c of cases) {
    try {
      await c.fn();
      pass++;
      console.log(`  ✓ ${c.suite} › ${c.name}`);
    } catch (e) {
      fail++;
      console.error(`  ✗ ${c.suite} › ${c.name}\n      ${e.message}`);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

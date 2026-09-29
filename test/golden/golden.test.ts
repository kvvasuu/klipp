// @vitest-environment node
/**
 * Golden trajectory tests: the behavior safety net for the math/DOD migration.
 *
 *   pnpm vitest run test/golden --mode golden-record   record fixtures from the CURRENT code
 *                                                      (once, before migrating; commit them)
 *   pnpm test                                          compare against fixtures (normal suite)
 *
 * Tolerance is 1e-6 per number; quaternions are compared up to sign (q and -q are one rotation).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scenarios } from './scenarios';
import { COLUMNS } from './world';

const RECORD = import.meta.env.MODE === 'golden-record';
const TOLERANCE = 1e-6;
const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

type Fixture = { columns: readonly string[]; samples: number[][] };

function firstMismatch(expected: number[][], actual: number[][]): string | null {
  if (expected.length !== actual.length) return `sample count ${actual.length} !== ${expected.length}`;
  for (let s = 0; s < expected.length; s++) {
    const e = expected[s];
    const a = actual[s];
    // q and -q are the same rotation: align signs before comparing
    const dot = e[3] * a[3] + e[4] * a[4] + e[5] * a[5] + e[6] * a[6];
    for (let c = 0; c < COLUMNS.length; c++) {
      const flip = dot < 0 && c >= 3 && c <= 6 ? -1 : 1;
      const diff = Math.abs(e[c] - flip * a[c]);
      if (!(diff <= TOLERANCE))
        return `sample ${s}, ${COLUMNS[c]}: expected ${e[c]}, got ${flip * a[c]} (|diff| ${diff})`;
    }
  }
  return null;
}

describe('golden trajectories', () => {
  for (const scenario of scenarios) {
    it(scenario.name, () => {
      const samples = scenario.run().map((row) => row.map((n) => Number(n.toPrecision(12))));
      const file = `${FIXTURES}${scenario.name}.json`;

      if (RECORD) {
        mkdirSync(FIXTURES, { recursive: true });
        writeFileSync(file, `${JSON.stringify({ columns: COLUMNS, samples } satisfies Fixture)}\n`);
        return;
      }

      expect(
        existsSync(file),
        `missing fixture: run \`pnpm vitest run test/golden --mode golden-record\` on the pre-migration code`,
      ).toBe(true);
      const fixture = JSON.parse(readFileSync(file, 'utf8')) as Fixture;
      expect(firstMismatch(fixture.samples, samples)).toBeNull();
    });
  }
});

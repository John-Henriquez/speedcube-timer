import test from 'node:test';
import assert from 'node:assert/strict';
import { MODE, VALIDATION, createAttempt } from './attempts.js';
import { OLL_CASES } from './cases.js';
import { caseRows, countByZone, zoneSummary } from './zoneStats.js';

const exec = (caseId, timeMs, validation = VALIDATION.VALID, zone = 'oll') =>
  createAttempt({ zone, caseId, scramble: 'R', timeMs, validation });
const know = (caseId, validation) =>
  createAttempt({ zone: 'oll', caseId, mode: MODE.KNOWLEDGE, scramble: 'R', timeMs: null, validation });

const attempts = [
  exec('oll-sune', 1800), exec('oll-sune', 2000), exec('oll-sune', 2200, VALIDATION.INVALID),
  exec('oll-pi', 3100, VALIDATION.UNVERIFIED),
  know('oll-sune', VALIDATION.VALID), know('oll-sune', VALIDATION.INVALID), know('oll-pi', VALIDATION.UNVERIFIED),
  exec('pll-ua', 2500, VALIDATION.VALID, 'pll'),
];

test('zoneSummary separa ejecución de conocimiento y no mezcla zonas', () => {
  const s = zoneSummary(attempts, 'oll');
  assert.equal(s.execution.attempts, 4); // 3 de sune + 1 de pi; el de PLL no cuenta
  assert.equal(s.execution.invalid, 1);
  assert.equal(s.knowledge.total, 3);
  assert.equal(s.knowledge.known, 1);
  assert.equal(zoneSummary(attempts, 'pll').execution.attempts, 1);
  assert.equal(zoneSummary(attempts, 'cross').execution.attempts, 0);
});

test('caseRows lista todos los casos, practicados o no', () => {
  const rows = caseRows(attempts, 'oll', OLL_CASES);
  assert.equal(rows.length, OLL_CASES.length);
  const sune = rows.find((r) => r.case.id === 'oll-sune');
  assert.equal(sune.stats.attempts, 3);
  assert.equal(sune.stats.best, 1800);
  assert.equal(sune.stats.invalid, 1);
  assert.deepEqual(sune.knowledge, { total: 2, known: 1 });
  const untouched = rows.find((r) => r.case.id === 'oll-h');
  assert.equal(untouched.stats.attempts, 0);
  assert.equal(untouched.stats.best, null);
  assert.deepEqual(untouched.knowledge, { total: 0, known: 0 });
});

test('un conocimiento sin verificar no cuenta como "sabido"', () => {
  const pi = caseRows(attempts, 'oll', OLL_CASES).find((r) => r.case.id === 'oll-pi');
  assert.deepEqual(pi.knowledge, { total: 1, known: 0 });
  assert.equal(pi.stats.unverified, 1);
});

test('countByZone cuenta intentos por zona', () => {
  assert.deepEqual(countByZone(attempts), { oll: 7, pll: 1 });
  assert.deepEqual(countByZone([]), {});
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupActivity, parseRobotInput, ValidationError } from './fleet.js';

const robot = {
  id: 'muc-dlv-01',
  kind: 'delivery',
  siteId: 'muc',
  model: 'Courier D2',
  serialNumber: 'SN-1',
  firmware: '5.0.0',
  maxSpeedMps: 1.2,
  batteryWh: 900,
};

test('create requires every field and accepts a valid robot', () => {
  assert.deepEqual(parseRobotInput(robot, 'create'), robot);
  const { firmware: _, ...missing } = robot;
  assert.throws(() => parseRobotInput(missing, 'create'), /firmware is required/);
});

test('update accepts a partial body but never the id', () => {
  assert.deepEqual(parseRobotInput({ firmware: ' 5.1.0 ' }, 'update'), { firmware: '5.1.0' });
  assert.throws(() => parseRobotInput({ id: 'other' }, 'update'), /unexpected field id/);
  assert.throws(() => parseRobotInput({}, 'update'), /nothing to update/);
});

test('rejects invalid values and unknown fields', () => {
  const bad = [
    { ...robot, kind: 'vacuum' },
    { ...robot, id: 'Muc Robot' },
    { ...robot, maxSpeedMps: 0 },
    { ...robot, batteryWh: 1.5 },
    { ...robot, model: '   ' },
    { ...robot, owner: 'me' },
  ];
  for (const body of bad) assert.throws(() => parseRobotInput(body, 'create'), ValidationError);
});

test('groups activity per site and kind, counting robots without samples', () => {
  const rows = groupActivity(
    [
      { robotId: 'muc-dlv-01', tasksStarted: 10, elevatorRides: 3, faults: 1, avgBattery: 80 },
      { robotId: 'muc-dlv-02', tasksStarted: 4, elevatorRides: 1, faults: 0, avgBattery: 60 },
      { robotId: 'ghost-01', tasksStarted: 99, elevatorRides: 99, faults: 99, avgBattery: 1 },
    ],
    [
      { id: 'muc-dlv-01', siteId: 'muc', kind: 'delivery' },
      { id: 'muc-dlv-02', siteId: 'muc', kind: 'delivery' },
      { id: 'muc-dlv-03', siteId: 'muc', kind: 'delivery' },
      { id: 'lon-cln-01', siteId: 'lon', kind: 'cleaning' },
    ],
  );
  assert.deepEqual(rows, [
    { siteId: 'muc', kind: 'delivery', robots: 3, tasksStarted: 14, elevatorRides: 4, faults: 1, avgBattery: 70 },
    { siteId: 'lon', kind: 'cleaning', robots: 1, tasksStarted: 0, elevatorRides: 0, faults: 0, avgBattery: null },
  ]);
});

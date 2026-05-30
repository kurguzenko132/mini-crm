import assert from 'node:assert/strict';
import { demoUsers } from '../lib/demo-data';
import { dashboardMetrics, filterUsers, stageCounts, topCounts, uniqueSorted } from '../lib/stats';
import { usersToCsv } from '../lib/export';
import type { EarlyUser } from '../lib/types';

const now = new Date().toISOString();
const users = demoUsers.map((user, index) => ({
  ...user,
  id: String(index + 1),
  owner_id: 'test-user',
  contact: user.contact || null,
  next_step: user.next_step || null,
  next_contact_date: user.next_contact_date || null,
  source: user.source || null,
  notes: user.notes || null,
  created_at: now,
  updated_at: now,
})) satisfies EarlyUser[];

assert.equal(users.length, 7, 'demo dataset should include 7 users');

const metrics = dashboardMetrics(users);
assert.equal(metrics.total, 7, 'total metric should count active users');
assert.equal(metrics.free, 3, 'free metric should count free conditions');
assert.equal(metrics.discounted, 2, 'discount metric should count percent conditions');
assert.equal(metrics.connected, 1, 'connected metric should count connected users');

const filteredByCity = filterUsers(users, {
  search: '',
  city: 'Минск',
  industry: '',
  terms: '',
  stage: '',
  priority: '',
  onlyToday: false,
});
assert.equal(filteredByCity.length, 2, 'city filter should work');

const searchResult = filterUsers(users, {
  search: 'beauty',
  city: '',
  industry: '',
  terms: '',
  stage: '',
  priority: '',
  onlyToday: false,
});
assert.equal(searchResult[0]?.name, 'Beauty Line', 'text search should search names');

const stages = stageCounts(users);
assert.equal(stages['Подключён'], 1, 'stage counter should count connected stage');
assert.equal(stages['Пауза'], 1, 'stage counter should count pause stage');

const cities = topCounts(users, 'city');
assert.equal(cities[0]?.name, 'Минск', 'top cities should be sorted by count');
assert.equal(cities[0]?.count, 2, 'top cities should include count');

const uniq = uniqueSorted(['Минск', 'Гомель', 'Минск', null, undefined, '']);
assert.deepEqual(uniq, ['Гомель', 'Минск'], 'uniqueSorted should deduplicate and sort');

const csv = usersToCsv(users);
assert.ok(csv.includes('Название / Имя'), 'CSV should contain header');
assert.ok(csv.includes('Barber Pro'), 'CSV should contain user names');
assert.ok(csv.includes('"Бесплатно 2 месяца"'), 'CSV should quote values');

console.log('✅ Logic tests passed');

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FEATURE_SCOPES, scopesFor, WRITING_FEATURES } from '../src/features';
import { customRewardFromApi, redemptionFromEvent } from '../src/redemption';

test('a redemption event is read defensively and bounded', () => {
  const event = {
    id: 'r1',
    user_id: '42',
    user_login: 'Viewer',
    user_name: 'Viewer',
    user_input: 'x'.repeat(600),
    reward: { id: 'rw1', title: 'Play a sound', cost: 500 },
  };
  const redemption = redemptionFromEvent(event, 1_000)!;
  assert.equal(redemption.id, 'r1');
  assert.equal(redemption.login, 'viewer');
  assert.equal(redemption.name, 'Viewer');
  assert.equal(redemption.rewardId, 'rw1');
  assert.equal(redemption.rewardTitle, 'Play a sound');
  assert.equal(redemption.cost, 500);
  assert.equal(redemption.input.length, 500);
  assert.equal(redemption.receivedAt, 1_000);

  // Without an id or a reward there is nothing to act on; odd shapes are ignored.
  assert.equal(redemptionFromEvent({ reward: { id: 'rw1' } }), undefined);
  assert.equal(redemptionFromEvent({ id: 'r2' }), undefined);
  assert.equal(redemptionFromEvent('nope'), undefined);
  assert.equal(redemptionFromEvent({ id: 'r3', reward: { id: 'rw1', cost: -5 }, user_name: 7 })!.cost, 0);
  assert.equal(redemptionFromEvent({ id: 'r3', reward: { id: 'rw1' }, user_login: 'a' })!.name, 'a');
});

test('custom rewards from the API keep id, title, cost and whether they are enabled', () => {
  assert.deepEqual(customRewardFromApi({ id: 'rw1', title: 'Hydrate', cost: 100, is_enabled: false }), { id: 'rw1', title: 'Hydrate', cost: 100, enabled: false });
  assert.equal(customRewardFromApi({ id: 'rw2' })!.enabled, true);
  assert.equal(customRewardFromApi({ title: 'no id' }), undefined);
});

test('the new features map to their scopes; chatWrite is the only writing one', () => {
  assert.equal(FEATURE_SCOPES.redemptions, 'channel:read:redemptions');
  assert.equal(FEATURE_SCOPES.chatWrite, 'user:write:chat');
  assert.deepEqual(WRITING_FEATURES, ['chatWrite']);
  assert.deepEqual(scopesFor(['chatWrite', 'chat', 'redemptions']), ['user:read:chat', 'channel:read:redemptions', 'user:write:chat']);
});

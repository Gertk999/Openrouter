import { buildMemorySystemMessage, prependMemoryToMessages } from '../lib/memory';

test('buildMemorySystemMessage returns null for empty entries', () => {
  expect(buildMemorySystemMessage([])).toBeNull();
  expect(buildMemorySystemMessage(null)).toBeNull();
});

test('buildMemorySystemMessage bullets each entry into a system message', () => {
  const msg = buildMemorySystemMessage([{ id: '1', text: 'Likes concise answers' }, { id: '2', text: 'Name is Søren' }]);
  expect(msg.role).toBe('system');
  expect(msg.content).toContain('- Likes concise answers');
  expect(msg.content).toContain('- Name is Søren');
});

test('prependMemoryToMessages leaves messages unchanged with no memories', () => {
  const messages = [{ role: 'user', content: 'hi' }];
  expect(prependMemoryToMessages(messages, [])).toBe(messages);
});

test('prependMemoryToMessages adds system message in front when memories exist', () => {
  const messages = [{ role: 'user', content: 'hi' }];
  const result = prependMemoryToMessages(messages, [{ id: '1', text: 'fact' }]);
  expect(result).toHaveLength(2);
  expect(result[0].role).toBe('system');
  expect(result[1]).toBe(messages[0]);
});

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { runners } from '../src/agents/index.js';
import { runTask } from '../src/runner.js';
import type { Task, AgentRunner } from '../src/types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    slug: 'test-task',
    name: 'Test Task',
    cron: '0 9 * * *',
    prompt: 'test prompt',
    ...overrides,
  };
}

function captureConsole(): { messages: string[]; restore: () => void } {
  const messages: string[] = [];
  const origError = console.error.bind(console);
  const origLog = console.log.bind(console);
  console.error = (...args: unknown[]) => messages.push(String(args[0]));
  console.log = (...args: unknown[]) => messages.push(String(args[0]));
  return { messages, restore() { console.error = origError; console.log = origLog; } };
}

describe('runTask', () => {
  const originalRunners = { ...runners };

  beforeEach(() => {
    Object.keys(runners).forEach((k) => delete (runners as Record<string, unknown>)[k]);
    Object.assign(runners, originalRunners);
  });

  test('HEARTBEAT_OK logs no new content', async () => {
    (runners as Record<string, AgentRunner>)['claude'] = { async run() { return 'HEARTBEAT_OK'; } };
    const cap = captureConsole();
    await runTask(makeTask());
    cap.restore();
    assert.ok(cap.messages.some((m) => m.includes('no new content')));
  });

  test('HEARTBEAT_OK with whitespace is treated as HEARTBEAT_OK', async () => {
    (runners as Record<string, AgentRunner>)['claude'] = { async run() { return '  HEARTBEAT_OK  \n'; } };
    const cap = captureConsole();
    await runTask(makeTask());
    cap.restore();
    assert.ok(cap.messages.some((m) => m.includes('no new content')));
  });

  test('successful result logs done', async () => {
    (runners as Record<string, AgentRunner>)['claude'] = { async run() { return '# Content'; } };
    const cap = captureConsole();
    await runTask(makeTask());
    cap.restore();
    assert.ok(cap.messages.some((m) => m.includes('done')));
  });

  test('unknown agent logs error', async () => {
    const cap = captureConsole();
    await runTask(makeTask({ agent: 'nonexistent-agent' }));
    cap.restore();
    assert.ok(cap.messages.some((m) => m.includes('unknown agent') && m.includes('nonexistent-agent')));
  });

  test('empty result logs error', async () => {
    (runners as Record<string, AgentRunner>)['claude'] = { async run() { return ''; } };
    const cap = captureConsole();
    await runTask(makeTask());
    cap.restore();
    assert.ok(cap.messages.some((m) => m.includes('no result returned')));
  });

  test('agent throw logs error and does not rethrow', async () => {
    (runners as Record<string, AgentRunner>)['claude'] = { async run() { throw new Error('SDK error'); } };
    const cap = captureConsole();
    await runTask(makeTask());
    cap.restore();
    assert.ok(cap.messages.some((m) => m.includes('agent error')));
  });

  test('substitutes {date} in prompt', async () => {
    let receivedPrompt = '';
    (runners as Record<string, AgentRunner>)['claude'] = { async run(prompt) { receivedPrompt = prompt; return 'HEARTBEAT_OK'; } };
    const cap = captureConsole();
    await runTask(makeTask({ prompt: 'Today is {date}.' }));
    cap.restore();
    assert.ok(!receivedPrompt.includes('{date}'));
    assert.match(receivedPrompt, /Today is \d{4}\/\d+\/\d+\./);
  });
});

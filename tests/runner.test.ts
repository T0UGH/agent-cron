import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { runners } from '../src/agents/index.js';
import { channels } from '../src/outputs/index.js';
import { runTask } from '../src/runner.js';
import type { Task, AgentRunner, OutputChannel } from '../src/types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    slug: 'test-task',
    name: 'Test Task',
    cron: '0 9 * * *',
    output: 'file',
    prompt: 'test prompt',
    ...overrides,
  };
}

// Capture console.error/log calls
function captureConsole(): { messages: string[]; restore: () => void } {
  const messages: string[] = [];
  const origError = console.error.bind(console);
  const origLog = console.log.bind(console);
  console.error = (...args: unknown[]) => messages.push(String(args[0]));
  console.log = (...args: unknown[]) => messages.push(String(args[0]));
  return {
    messages,
    restore() {
      console.error = origError;
      console.log = origLog;
    },
  };
}

describe('runTask', () => {
  // Save original registry entries
  const originalRunners = { ...runners };
  const originalChannels = { ...channels };

  beforeEach(() => {
    // Restore registries before each test
    Object.keys(runners).forEach((k) => delete (runners as Record<string, unknown>)[k]);
    Object.assign(runners, originalRunners);
    Object.keys(channels).forEach((k) => delete (channels as Record<string, unknown>)[k]);
    Object.assign(channels, originalChannels);
  });

  test('HEARTBEAT_OK skips output channel', async () => {
    let outputCalled = false;

    (runners as Record<string, AgentRunner>)['claude'] = {
      async run() { return 'HEARTBEAT_OK'; },
    };
    (channels as Record<string, OutputChannel>)['file'] = {
      async send() { outputCalled = true; },
    };

    const cap = captureConsole();
    await runTask(makeTask({ output: 'file' }));
    cap.restore();

    assert.ok(!outputCalled, 'output channel should not be called for HEARTBEAT_OK');
    assert.ok(
      cap.messages.some((m) => m.includes('no new content')),
      'expected "no new content" log message'
    );
  });

  test('HEARTBEAT_OK with whitespace is treated as HEARTBEAT_OK', async () => {
    let outputCalled = false;

    (runners as Record<string, AgentRunner>)['claude'] = {
      async run() { return '  HEARTBEAT_OK  \n'; },
    };
    (channels as Record<string, OutputChannel>)['file'] = {
      async send() { outputCalled = true; },
    };

    const cap = captureConsole();
    await runTask(makeTask({ output: 'file' }));
    cap.restore();

    assert.ok(!outputCalled);
  });

  test('calls output channel when agent returns real content', async () => {
    let sentResult = '';

    (runners as Record<string, AgentRunner>)['claude'] = {
      async run() { return '# Real Content\n\nSome news.'; },
    };
    (channels as Record<string, OutputChannel>)['file'] = {
      async send(result) { sentResult = result; },
    };

    const cap = captureConsole();
    await runTask(makeTask({ output: 'file' }));
    cap.restore();

    assert.equal(sentResult, '# Real Content\n\nSome news.');
  });

  test('logs error and returns when agent name is unknown', async () => {
    const cap = captureConsole();
    await runTask(makeTask({ agent: 'nonexistent-agent', output: 'file' }));
    cap.restore();

    assert.ok(
      cap.messages.some((m) => m.includes('unknown agent') && m.includes('nonexistent-agent')),
      'expected unknown agent error message'
    );
  });

  test('logs error and returns when output channel is unknown', async () => {
    (runners as Record<string, AgentRunner>)['claude'] = {
      async run() { return 'some result'; },
    };

    const cap = captureConsole();
    await runTask(makeTask({ output: 'nonexistent-channel' }));
    cap.restore();

    assert.ok(
      cap.messages.some((m) => m.includes('unknown output channel') && m.includes('nonexistent-channel')),
      'expected unknown channel error message'
    );
  });

  test('logs error and returns when agent returns empty string', async () => {
    (runners as Record<string, AgentRunner>)['claude'] = {
      async run() { return ''; },
    };

    const cap = captureConsole();
    await runTask(makeTask({ output: 'file' }));
    cap.restore();

    assert.ok(
      cap.messages.some((m) => m.includes('no result returned')),
      'expected "no result returned" error message'
    );
  });

  test('logs error and continues when agent throws', async () => {
    (runners as Record<string, AgentRunner>)['claude'] = {
      async run() { throw new Error('SDK error'); },
    };

    const cap = captureConsole();
    await runTask(makeTask({ output: 'file' })); // should not throw
    cap.restore();

    assert.ok(
      cap.messages.some((m) => m.includes('agent error')),
      'expected agent error message'
    );
  });

  test('substitutes {date} in prompt before passing to agent', async () => {
    let receivedPrompt = '';

    (runners as Record<string, AgentRunner>)['claude'] = {
      async run(prompt) { receivedPrompt = prompt; return 'HEARTBEAT_OK'; },
    };

    const cap = captureConsole();
    await runTask(makeTask({ prompt: 'Today is {date}.' }));
    cap.restore();

    assert.ok(!receivedPrompt.includes('{date}'), 'expected {date} to be substituted');
    // Should contain a date string like 2026/3/3
    assert.match(receivedPrompt, /Today is \d{4}\/\d+\/\d+\./);
  });
});

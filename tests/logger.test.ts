import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Override home dir to a temp dir for testing
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cron-test-'));
const origHome = os.homedir;
(os as any).homedir = () => tmpHome;

import { Logger } from '../src/logger.js';

after(() => {
  (os as any).homedir = origHome;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe('Logger', () => {
  test('creates log file at correct path', () => {
    const logger = new Logger('my-task');
    logger.start();
    const today = new Date().toISOString().slice(0, 10);
    const logPath = path.join(tmpHome, '.agent-cron', 'logs', 'my-task', `${today}.log`);
    assert.ok(fs.existsSync(logPath), `expected log file at ${logPath}`);
  });

  test('log file contains START entry', () => {
    const logger = new Logger('task-start');
    logger.start();
    const today = new Date().toISOString().slice(0, 10);
    const logPath = path.join(tmpHome, '.agent-cron', 'logs', 'task-start', `${today}.log`);
    const content = fs.readFileSync(logPath, 'utf-8');
    assert.ok(content.includes('[START]'), 'expected [START] in log');
  });

  test('end logs status=ok with duration', () => {
    const logger = new Logger('task-end-ok');
    logger.start();
    logger.end('ok');
    const today = new Date().toISOString().slice(0, 10);
    const logPath = path.join(tmpHome, '.agent-cron', 'logs', 'task-end-ok', `${today}.log`);
    const content = fs.readFileSync(logPath, 'utf-8');
    assert.ok(content.includes('[END]') && content.includes('status=ok'), 'expected [END] status=ok');
    assert.ok(content.includes('duration='), 'expected duration in END log');
  });

  test('end logs status=error with error message', () => {
    const logger = new Logger('task-end-err');
    logger.start();
    logger.end('error', 'something went wrong');
    const today = new Date().toISOString().slice(0, 10);
    const logPath = path.join(tmpHome, '.agent-cron', 'logs', 'task-end-err', `${today}.log`);
    const content = fs.readFileSync(logPath, 'utf-8');
    assert.ok(content.includes('status=error') && content.includes('something went wrong'));
  });

  test('end logs status=heartbeat', () => {
    const logger = new Logger('task-heartbeat');
    logger.start();
    logger.end('heartbeat');
    const today = new Date().toISOString().slice(0, 10);
    const logPath = path.join(tmpHome, '.agent-cron', 'logs', 'task-heartbeat', `${today}.log`);
    const content = fs.readFileSync(logPath, 'utf-8');
    assert.ok(content.includes('status=heartbeat'));
  });

  test('tool logs name, input, output truncated to 500 chars', () => {
    const logger = new Logger('task-tool');
    logger.start();
    logger.tool('web_search', { query: 'AI news' }, 'a'.repeat(600));
    const today = new Date().toISOString().slice(0, 10);
    const logPath = path.join(tmpHome, '.agent-cron', 'logs', 'task-tool', `${today}.log`);
    const content = fs.readFileSync(logPath, 'utf-8');
    assert.ok(content.includes('[TOOL]') && content.includes('web_search'));
    // output truncated — should not contain 600 'a's
    assert.ok(!content.includes('a'.repeat(501)), 'output should be truncated to 500 chars');
  });
});

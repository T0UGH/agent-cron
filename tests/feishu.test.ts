import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { markdownToFeishuPost } from '../src/outputs/feishu.js';

describe('markdownToFeishuPost', () => {
  test('extracts h1 as title', () => {
    const { title } = markdownToFeishuPost('# My Title\n\nsome text');
    assert.equal(title, 'My Title');
  });

  test('uses first h1 as title when multiple exist', () => {
    const { title } = markdownToFeishuPost('# First\n# Second');
    assert.equal(title, 'First');
  });

  test('falls back to "Agent Report" when no h1', () => {
    const { title } = markdownToFeishuPost('## Section\n\ntext');
    assert.equal(title, 'Agent Report');
  });

  test('h1 is not included in content lines', () => {
    const { content } = markdownToFeishuPost('# Title\n\nhello');
    const texts = content.flatMap((line) => line.map((el) => el.tag === 'text' ? el.text : ''));
    assert.ok(!texts.includes('Title'));
  });

  test('h2 becomes bold text line', () => {
    const { content } = markdownToFeishuPost('## Section Header');
    assert.equal(content.length, 1);
    const el = content[0][0];
    assert.equal(el.tag, 'text');
    assert.equal((el as { tag: 'text'; text: string; style?: string[] }).text, 'Section Header');
    assert.deepEqual((el as { tag: 'text'; text: string; style?: string[] }).style, ['bold']);
  });

  test('h3 becomes bold text line', () => {
    const { content } = markdownToFeishuPost('### Sub Header');
    const el = content[0][0];
    assert.equal(el.tag, 'text');
    assert.deepEqual((el as { tag: 'text'; text: string; style?: string[] }).style, ['bold']);
  });

  test('list items get bullet prefix', () => {
    const { content } = markdownToFeishuPost('- item one\n- item two');
    const texts = content.map((line) =>
      line[0].tag === 'text' ? (line[0] as { tag: 'text'; text: string }).text : ''
    );
    assert.ok(texts[0].startsWith('• item one'));
    assert.ok(texts[1].startsWith('• item two'));
  });

  test('* list items also get bullet prefix', () => {
    const { content } = markdownToFeishuPost('* star item');
    const el = content[0][0];
    assert.equal(el.tag, 'text');
    assert.ok((el as { tag: 'text'; text: string }).text.startsWith('• star item'));
  });

  test('empty line produces empty text element', () => {
    const { content } = markdownToFeishuPost('line one\n\nline two');
    assert.equal(content.length, 3);
    const el = content[1][0];
    assert.equal(el.tag, 'text');
    assert.equal((el as { tag: 'text'; text: string }).text, '');
  });

  test('parses inline link as anchor element', () => {
    const { content } = markdownToFeishuPost('See [OpenAI](https://openai.com) here');
    const line = content[0];
    const link = line.find((el) => el.tag === 'a');
    assert.ok(link, 'expected an anchor element');
    assert.equal((link as { tag: 'a'; text: string; href: string }).text, 'OpenAI');
    assert.equal((link as { tag: 'a'; text: string; href: string }).href, 'https://openai.com');
  });

  test('parses **bold** as bold text', () => {
    const { content } = markdownToFeishuPost('This is **important** text');
    const line = content[0];
    const bold = line.find(
      (el) => el.tag === 'text' && (el as { tag: 'text'; text: string; style?: string[] }).style?.includes('bold')
    );
    assert.ok(bold, 'expected a bold element');
    assert.equal((bold as { tag: 'text'; text: string }).text, 'important');
  });

  test('horizontal rule becomes empty line', () => {
    const { content } = markdownToFeishuPost('---');
    assert.equal(content.length, 1);
    const el = content[0][0];
    assert.equal(el.tag, 'text');
    assert.equal((el as { tag: 'text'; text: string }).text, '');
  });
});

import type { OutputChannel, Task } from '../types.js';

type FeishuInlineElement =
  | { tag: 'text'; text: string; style?: string[] }
  | { tag: 'a'; text: string; href: string };

type FeishuLine = FeishuInlineElement[];

function parseInline(raw: string): FeishuInlineElement[] {
  const elements: FeishuInlineElement[] = [];
  // Match [text](url) links and **bold**
  const re = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) {
      elements.push({ tag: 'text', text: raw.slice(last, m.index) });
    }
    if (m[1] && m[2]) {
      elements.push({ tag: 'a', text: m[1], href: m[2] });
    } else if (m[3]) {
      elements.push({ tag: 'text', text: m[3], style: ['bold'] });
    }
    last = re.lastIndex;
  }

  if (last < raw.length) {
    elements.push({ tag: 'text', text: raw.slice(last) });
  }

  return elements.length > 0 ? elements : [{ tag: 'text', text: raw }];
}

function markdownToFeishuPost(markdown: string): { title: string; content: FeishuLine[] } {
  const lines = markdown.split('\n');
  let title = '';
  const content: FeishuLine[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();

    // h1 → card title (first one wins)
    if (/^#\s+/.test(line)) {
      if (!title) title = line.replace(/^#\s+/, '');
      continue;
    }

    // h2/h3 → bold line
    if (/^#{2,3}\s+/.test(line)) {
      const text = line.replace(/^#{2,3}\s+/, '');
      content.push([{ tag: 'text', text, style: ['bold'] }]);
      continue;
    }

    // horizontal rule → empty line
    if (/^---+$/.test(line)) {
      content.push([{ tag: 'text', text: '' }]);
      continue;
    }

    // empty line → empty line
    if (line === '') {
      content.push([{ tag: 'text', text: '' }]);
      continue;
    }

    // list items → bullet prefix
    if (/^[-*]\s+/.test(line)) {
      const text = line.replace(/^[-*]\s+/, '• ');
      content.push(parseInline(text));
      continue;
    }

    // regular paragraph
    content.push(parseInline(line));
  }

  return { title: title || 'Agent Report', content };
}

export class FeishuChannel implements OutputChannel {
  async send(result: string, task: Task): Promise<void> {
    const webhook =
      (task.feishuWebhook as string | undefined) ?? process.env.FEISHU_WEBHOOK;

    if (!webhook) {
      throw new Error(
        `[agent-cron] feishu: missing webhook for task "${task.name}". Set feishuWebhook in frontmatter or FEISHU_WEBHOOK env var.`
      );
    }

    const { title, content } = markdownToFeishuPost(result);

    const body = {
      msg_type: 'post',
      content: {
        post: {
          zh_cn: { title, content },
        },
      },
    };

    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`[agent-cron] feishu: request failed: ${res.status} ${await res.text()}`);
    }

    const json = (await res.json()) as { code?: number; msg?: string };
    if (json.code !== 0) {
      throw new Error(`[agent-cron] feishu: error response: code=${json.code} msg=${json.msg}`);
    }

    console.log(`[agent-cron] pushed to Feishu (${task.name})`);
  }
}

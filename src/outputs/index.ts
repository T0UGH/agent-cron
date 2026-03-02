import type { OutputChannel } from '../types.js';
import { FileChannel } from './file.js';
import { FeishuChannel } from './feishu.js';
import { GithubChannel } from './github.js';

export const channels: Record<string, OutputChannel> = {
  file:   new FileChannel(),
  feishu: new FeishuChannel(),
  github: new GithubChannel(),
  // future: slack, telegram, discord, webhook, ...
};

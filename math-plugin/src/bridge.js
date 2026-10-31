import { App } from '@modelcontextprotocol/ext-apps';

const app = new App({ name: 'math-lab', version: '0.1.0' }, {}, { autoResize: true });
let pendingContext;
let contextWork = Promise.resolve();
const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

function applyHostContext(context) {
  if (context?.theme === 'light' || context?.theme === 'dark') {
    document.documentElement.style.colorScheme = context.theme;
  }
  emit('math-lab:host-context', context);
}

const bridge = {
  ready: false,
  lastToolResult: undefined,
  async sendMessage(prompt) {
    if (!bridge.ready) throw new Error('当前页面尚未连接聊天宿主。');
    if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('消息不能为空。');
    await contextWork;
    const result = await app.sendMessage({ role: 'user', content: [{ type: 'text', text: prompt }] });
    if (result.isError) throw new Error('聊天宿主未接受这条消息。');
    return result;
  },
  async updateContext(modelContent) {
    pendingContext = modelContent;
    if (!bridge.ready) return false;
    const params = typeof modelContent === 'string'
      ? { content: [{ type: 'text', text: modelContent }] }
      : { structuredContent: modelContent };
    // Serialize updates so older slider states cannot arrive after newer ones.
    contextWork = contextWork.catch(() => {}).then(() => app.updateModelContext(params));
    await contextWork;
    return true;
  }
};
window.mathMcpBridge = bridge;

// Register handlers before initialization: a host may send its first result immediately.
app.ontoolresult = result => {
  bridge.lastToolResult = result.structuredContent;
  emit('math-lab:tool-result', result.structuredContent);
};
app.onhostcontextchanged = context => applyHostContext(context);
app.onclose = () => { bridge.ready = false; emit('math-lab:disconnected'); };

// A local browser preview is a complete independent math app. It never waits for a host.
if (window.parent !== window) {
  app.connect(undefined, { timeout: 10000 }).then(async () => {
    bridge.ready = true;
    applyHostContext(app.getHostContext());
    emit('math-lab:ready');
    if (pendingContext !== undefined) await bridge.updateContext(pendingContext);
  }).catch(error => {
    bridge.ready = false;
    emit('math-lab:connection-error', { message: error.message });
  });
}

(function(root) {
  'use strict';
  const LIMITS = Object.freeze({ length: 256, tokens: 128, nodes: 96, depth: 24 });
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const functions = Object.freeze({
    sin: [1, Math.sin], cos: [1, Math.cos],
    tan: [1, x => Math.abs(Math.cos(x)) < 1e-12 ? NaN : Math.tan(x)],
    asin: [1, Math.asin], acos: [1, Math.acos], atan: [1, Math.atan],
    sqrt: [1, Math.sqrt], cbrt: [1, Math.cbrt], abs: [1, Math.abs],
    exp: [1, Math.exp], log: [1, Math.log], ln: [1, Math.log], log10: [1, Math.log10],
    sinh: [1, Math.sinh], cosh: [1, Math.cosh], tanh: [1, Math.tanh],
    min: [2, Math.min], max: [2, Math.max], atan2: [2, Math.atan2]
  });
  const constants = Object.freeze({ pi: Math.PI, e: Math.E });
  const variables = new Set(['x', 'y', 'a', 'b', 't']);
  function compile(source) {
    if (typeof source !== 'string') throw new Error('请输入函数表达式。');
    const expression = source.trim();
    if (!expression) throw new Error('请输入函数表达式。');
    if (expression.length > LIMITS.length) throw new Error('表达式最多 256 个字符。');
    const tokens = [];
    let offset = 0;
    while (offset < expression.length) {
      const rest = expression.slice(offset);
      const whitespace = /^\s+/.exec(rest);
      if (whitespace) { offset += whitespace[0].length; continue; }
      const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
      const identifier = /^[A-Za-z][A-Za-z0-9]*/.exec(rest);
      if (number) {
        const value = Number(number[0]);
        if (!Number.isFinite(value)) throw new Error('数值超出可计算范围。');
        tokens.push({ type: 'number', value, offset }); offset += number[0].length;
      } else if (identifier) {
        tokens.push({ type: 'name', value: identifier[0].toLowerCase(), offset }); offset += identifier[0].length;
      } else if (rest.startsWith('**')) {
        tokens.push({ type: '^', offset }); offset += 2;
      } else if ('+-*/^(),'.includes(rest[0])) {
        tokens.push({ type: rest[0], offset }); offset++;
      } else {
        throw new Error('第 ' + (offset + 1) + ' 个字符不支持；只接受数学表达式。');
      }
      if (tokens.length > LIMITS.tokens) throw new Error('表达式过于复杂，请拆成更短的函数。');
    }
    tokens.push({ type: 'end', offset: expression.length });
    let cursor = 0, nodes = 0;
    const node = value => { if (++nodes > LIMITS.nodes) throw new Error('表达式过于复杂，请简化。'); return value; };
    const expect = type => {
      if (tokens[cursor].type !== type) throw new Error('第 ' + (tokens[cursor].offset + 1) + ' 个字符附近需要 ' + type + '。');
      return tokens[cursor++];
    };
    function parse(minimum = 0, depth = 0) {
      if (depth > LIMITS.depth) throw new Error('括号或运算嵌套太深，请简化。');
      const token = tokens[cursor++];
      let left;
      if (token.type === 'number') left = node({ kind: 'number', value: token.value });
      else if (token.type === '+' || token.type === '-') left = node({ kind: 'unary', op: token.type, child: parse(30, depth + 1) });
      else if (token.type === '(') { left = parse(0, depth + 1); expect(')'); }
      else if (token.type === 'name') {
        const name = token.value;
        if (own(functions, name)) {
          expect('(');
          const args = [parse(0, depth + 1)];
          while (tokens[cursor].type === ',') { cursor++; args.push(parse(0, depth + 1)); }
          expect(')');
          if (args.length !== functions[name][0]) throw new Error(name + ' 需要 ' + functions[name][0] + ' 个参数。');
          left = node({ kind: 'call', name, args });
        } else if (own(constants, name)) left = node({ kind: 'number', value: constants[name] });
        else if (variables.has(name)) left = node({ kind: 'variable', name });
        else throw new Error('不支持 ' + name + '；变量只能用 x、y、a、b、t。');
      } else throw new Error('第 ' + (token.offset + 1) + ' 个字符附近缺少数字、变量或函数。');
      while (true) {
        const op = tokens[cursor].type;
        const precedence = op === '+' || op === '-' ? 10 : op === '*' || op === '/' ? 20 : op === '^' ? 40 : -1;
        if (precedence < minimum) break;
        cursor++;
        const right = parse(op === '^' ? precedence : precedence + 1, depth + 1);
        left = node({ kind: 'binary', op, left, right });
      }
      return left;
    }
    const ast = parse();
    if (tokens[cursor].type !== 'end') throw new Error('第 ' + (tokens[cursor].offset + 1) + ' 个字符附近语法不完整；乘法请写 *。');
    function evaluate(vars = {}) {
      function visit(item) {
        let value;
        if (item.kind === 'number') value = item.value;
        else if (item.kind === 'variable') value = own(vars, item.name) && Number.isFinite(vars[item.name]) ? vars[item.name] : NaN;
        else if (item.kind === 'unary') { const child = visit(item.child); value = item.op === '-' ? -child : child; }
        else if (item.kind === 'call') {
          const args = item.args.map(visit);
          value = args.every(Number.isFinite) ? functions[item.name][1](...args) : NaN;
        } else {
          const left = visit(item.left), right = visit(item.right);
          if (!Number.isFinite(left) || !Number.isFinite(right)) return NaN;
          if (item.op === '+') value = left + right;
          else if (item.op === '-') value = left - right;
          else if (item.op === '*') value = left * right;
          else if (item.op === '/') value = right === 0 ? NaN : left / right;
          else value = Math.pow(left, right);
        }
        return Number.isFinite(value) ? value : NaN;
      }
      return visit(ast);
    }
    return Object.freeze({ expression, evaluate });
  }
  const api = Object.freeze({ compile, limits: LIMITS });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MathLabExpression = api;
})(typeof window !== 'undefined' ? window : globalThis);

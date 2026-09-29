import { ToolError } from './tool.types';

const MAX_EXPRESSION_LENGTH = 200;
const MAX_NODES = 200;

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

const FUNCTIONS: Record<string, (...values: number[]) => number> = {
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
  sqrt: Math.sqrt,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  log: Math.log,
  exp: Math.exp,
};

function applyBinary(operator: string, left: number, right: number): number {
  let result: number;
  switch (operator) {
    case '+':
      result = left + right;
      break;
    case '-':
      result = left - right;
      break;
    case '*':
      result = left * right;
      break;
    case '/':
      if (right === 0) throw new ToolError('Division by zero.', 'DIVISION_BY_ZERO');
      result = left / right;
      break;
    case '%':
      if (right === 0) throw new ToolError('Modulo by zero.', 'DIVISION_BY_ZERO');
      result = left % right;
      break;
    case '^':
      result = left ** right;
      break;
    default:
      throw new ToolError(`Unsupported operator "${operator}".`, 'INVALID_EXPRESSION');
  }
  if (!Number.isFinite(result)) {
    throw new ToolError(`"${left} ${operator} ${right}" is not a finite result.`, 'INVALID_EXPRESSION');
  }
  return result;
}

function applyFunction(name: string, fn: (...values: number[]) => number, values: number[]): number {
  if (values.length === 0) {
    throw new ToolError(`${name}() needs at least one argument.`, 'INVALID_EXPRESSION');
  }
  if ((name === 'sqrt' || name === 'log') && values[0] < 0) {
    throw new ToolError(`${name}() is undefined for negative input.`, 'INVALID_EXPRESSION');
  }
  if (name === 'log' && values[0] === 0) {
    throw new ToolError('log() is undefined for zero.', 'INVALID_EXPRESSION');
  }
  const result = fn(...values);
  if (!Number.isFinite(result)) {
    throw new ToolError(`${name}() produced a non-finite result.`, 'INVALID_EXPRESSION');
  }
  return result;
}

/**
 * Arithmetic evaluator for the `math.evaluate` tool.
 *
 * A hand-written recursive-descent parser, deliberately not `eval`/`Function`:
 * the expression comes from a language model, so there must be no path from
 * model output into the JavaScript runtime. The node budget bounds CPU per call
 * independently of expression length, and every operation is checked for a
 * finite result instead of silently returning NaN or Infinity.
 */
class Parser {
  private index = 0;
  private nodes = 0;

  constructor(private readonly source: string) {}

  parse(): number {
    const value = this.parseExpression();
    this.skipWhitespace();
    if (this.index < this.source.length) {
      throw new ToolError(
        `Unexpected character "${this.source[this.index]}" at position ${this.index}.`,
        'INVALID_EXPRESSION',
      );
    }
    return value;
  }

  private parseExpression(): number {
    let left = this.parseTerm();
    for (;;) {
      this.skipWhitespace();
      const char = this.source[this.index];
      if (char !== '+' && char !== '-') return left;
      this.index += 1;
      const right = this.parseTerm();
      this.countNode();
      left = applyBinary(char, left, right);
    }
  }

  private parseTerm(): number {
    let left = this.parseUnary();
    for (;;) {
      this.skipWhitespace();
      const char = this.source[this.index];
      if (char !== '*' && char !== '/' && char !== '%') return left;
      this.index += 1;
      const right = this.parseUnary();
      this.countNode();
      left = applyBinary(char, left, right);
    }
  }

  private parseUnary(): number {
    this.skipWhitespace();
    const char = this.source[this.index];
    if (char === '-') {
      this.index += 1;
      const value = this.parseUnary();
      this.countNode();
      return -value;
    }
    if (char === '+') {
      this.index += 1;
      return this.parseUnary();
    }
    return this.parsePower();
  }

  private parsePower(): number {
    const base = this.parsePrimary();
    this.skipWhitespace();
    if (this.source[this.index] === '^') {
      this.index += 1;
      const exponent = this.parseUnary();
      this.countNode();
      return applyBinary('^', base, exponent);
    }
    return base;
  }

  private parsePrimary(): number {
    this.skipWhitespace();
    const char = this.source[this.index];
    if (char === undefined) {
      throw new ToolError('Expression ended unexpectedly.', 'INVALID_EXPRESSION');
    }
    if (char === '(') {
      this.index += 1;
      const value = this.parseExpression();
      this.skipWhitespace();
      if (this.source[this.index] !== ')') {
        throw new ToolError('Missing closing parenthesis.', 'INVALID_EXPRESSION');
      }
      this.index += 1;
      return value;
    }
    if (/[0-9.]/.test(char)) return this.parseNumber();
    if (/[a-z]/i.test(char)) return this.parseIdentifier();
    throw new ToolError(`Unexpected character "${char}" at position ${this.index}.`, 'INVALID_EXPRESSION');
  }

  private parseNumber(): number {
    const match = /^[0-9]*\.?[0-9]+(e[+-]?[0-9]+)?/i.exec(this.source.slice(this.index));
    if (!match) {
      throw new ToolError(`Malformed number at position ${this.index}.`, 'INVALID_EXPRESSION');
    }
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) {
      throw new ToolError(`"${match[0]}" is not a finite number.`, 'INVALID_EXPRESSION');
    }
    this.countNode();
    return value;
  }

  private parseIdentifier(): number {
    const match = /^[a-z]+/i.exec(this.source.slice(this.index));
    if (!match) {
      throw new ToolError(`Malformed identifier at position ${this.index}.`, 'INVALID_EXPRESSION');
    }
    const name = match[0].toLowerCase();
    this.index += name.length;
    this.skipWhitespace();

    if (this.source[this.index] === '(') {
      const fn = FUNCTIONS[name];
      if (!fn) {
        throw new ToolError(`Unknown function "${name}".`, 'INVALID_EXPRESSION');
      }
      this.index += 1;
      const values: number[] = [];
      this.skipWhitespace();
      if (this.source[this.index] === ')') {
        this.index += 1;
      } else {
        for (;;) {
          values.push(this.parseExpression());
          this.skipWhitespace();
          const separator = this.source[this.index];
          if (separator === ',') {
            this.index += 1;
            continue;
          }
          if (separator === ')') {
            this.index += 1;
            break;
          }
          throw new ToolError('Malformed function arguments.', 'INVALID_EXPRESSION');
        }
      }
      this.countNode();
      return applyFunction(name, fn, values);
    }

    if (name in CONSTANTS) {
      this.countNode();
      return CONSTANTS[name];
    }
    throw new ToolError(`Unknown constant "${name}".`, 'INVALID_EXPRESSION');
  }

  /** Counts parsed nodes and enforces the per-call operation budget. */
  private countNode(): void {
    this.nodes += 1;
    if (this.nodes > MAX_NODES) {
      throw new ToolError(`Expression exceeded the ${MAX_NODES} operation budget.`, 'RESOURCE_LIMIT');
    }
  }

  private skipWhitespace(): void {
    while (this.index < this.source.length && /\s/.test(this.source[this.index])) {
      this.index += 1;
    }
  }
}

export function evaluateExpression(raw: string): { expression: string; result: number } {
  const expression = String(raw ?? '').trim();
  if (!expression) {
    throw new ToolError('An expression is required.', 'INVALID_EXPRESSION');
  }
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new ToolError(`Expression exceeds ${MAX_EXPRESSION_LENGTH} characters.`, 'RESOURCE_LIMIT');
  }
  return { expression, result: new Parser(expression).parse() };
}

import { ErrorElement } from "../eval/model.js";
export class MochaError extends Error {
    constructor(msg) {
        super(msg);
    }
}

export class LexError extends MochaError {
    constructor(msg, input, position) {
        super(msg);
        this.input = input;
        this.position = position;
    }
    toString() {
        return `[LEX] error ${this.message}, error near '${this.input.substring(this.position - 5, this.position + 5)}'`
    }
}

export class ParseError extends MochaError {
    constructor(msg, tokens, position) {
        super(msg);
        this.tokens = tokens;
        this.position = position;
    }
    toString() {
        var token = this.tokens[this.position];
        return `[PARSE] error ${this.message}${this.token ? ` at line ${token.line}:${token.pos}, error near '${this.token.value}'`: ""}`
    }
}

export class RuntimeError extends MochaError {
    constructor(msg, position, element) {
        super(msg);
        this.element = element ? element: new ErrorElement(msg, [{position}]);
    }
}
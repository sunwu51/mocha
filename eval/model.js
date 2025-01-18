import { evalBlockStatement } from "./eval.js";

export class Element {
    constructor(type) {
        this.type = type;
        // 普通对象的属性存到map
        this.map = new Map();
        // 类的属性存到pro
        this.$$pro$$ = new Map();
        this.$$pro$$.set("$$pro$$", new Map());
    }
    setPro(key, value) {
        this.$$pro$$.set(key, value);
    }
    set(key, value) {
        this.map.set(key, value);
    }
    get(key) {
        if (key == "type") return new StringElement(this.type);
        if (this.map.get(key) != undefined) {
            return this.map.get(key);
        }
        if (this.$$pro$$.get(key) != undefined) {
            return this.$$pro$$.get(key);
        }
        // 原型链向上搜索
        var pro = this.$$pro$$.get("$$pro$$")
        while (pro != undefined) {
            if (pro.get(key) != undefined) {
                return pro.get(key);
            }
            pro = pro.get("$$pro$$");
        }
        return nil;
    }
    toString() {
        return `{ ${Array.from(this.map.entries()).map(it=>it[0]+":"+it[1].toString()).join(',')} }`;
    }
    toNative() {
        function elementToJsObject(element) {
            if (element instanceof Element) {
                switch(element.type) {
                    case "number":
                    case "boolean":
                    case "null":
                    case "string":
                    case "array":
                        return element.toNative();
                    default:
                        var iter = element.map.keys();
                        var res = {};
                        var item;
                        while (!(item = iter.next()).done) {
                            var key = item.value;
                            res[key] = elementToJsObject(element.map.get(key))
                        }
                        return res;
                }
            }
            return element;
        }
        return elementToJsObject(this);
    }
}

export class NumberElement extends Element {
    // value是数字或者字符串
    constructor(value) {
        super('number');
        if (isNaN(value) || isNaN(parseFloat(value))) {
            throw new Error('Invalid number');
        }
        this.value = parseFloat(value);
    }
    toNative() {
        return this.value;
    }
    toString() {
        return this.value.toString();
    }
}

export class BooleanElement extends Element {
    constructor(value) {
        super('boolean');
        this.value = value;
    }
    toNative() {
        return this.value;
    }
    toString() {
        return this.value.toString();
    }
}

export class StringElement extends Element {
    constructor(value) {
        super('string');
        this.value = value;
        this.$$pro$$ = stringProto;
    }
    toNative() {
        return this.value;
    }
    toString() {
        return this.value.toString();
    }
}

export class NullElement extends Element {
    constructor() {
        super('null');
    }
    toNative() {
        return null;
    }
    toString() {
        return "null";
    }
}

export class ArrayElement extends Element {
    // array: Element[]
    constructor(array) {
        super('array');
        this.array = array;
        this.$$pro$$ = arrayProto;
    }
    toString() {
        return `[${this.array.map(v => v.toString()).join(', ')}]`;
    }
    toNative() {
        return this.array.map(e =>e.toNative());
    }
}

export class FunctionElement extends Element {
    // params: string[], body: BlockStatement, closureCtx: Context
    constructor(params, body, closureCtx) {
        super('function');
        this.params = params;
        this.body = body;
        // 函数声明的时候的上下文引用
        this.closureCtx = closureCtx;
    }

    toString() {
        return `FUNCTION`
    }

    // name: string, args: Element[], _this: Element, _super: Element, exp: 打印异常堆栈相关
    call(name, args, _this, _super, exp) {
        // 允许长度不匹配和js一样灵活
        // if (args.length != this.params.length) {
        //     throw new RuntimeError(`function ${name+" "}call error: args count not match`);
        // }
        var newCtx = new Context(this.closureCtx);
        if (_this) {
            newCtx.set("this", _this);
        }
        if (_super) {
            newCtx.set("super", _super);
        }
        newCtx.funCtx.name = name;
        this.params.forEach((param, index) => {
            newCtx.set(param, args[index] ? args[index] : nil);
        });
        try {
            evalBlockStatement(this.body, newCtx);
        } catch (e) {
            if (e instanceof RuntimeError) {
                if (e.element instanceof ErrorElement) {
                    e.element.updateFunctionName(name);
                    e.element.pushStack({position: `${exp.token.line}:${exp.token.pos}`})
                }
            }
            throw e;
        }
        return newCtx.funCtx.returnElement =  newCtx.funCtx.returnElement ?  newCtx.funCtx.returnElement : nil;
    }
}
export class ErrorElement extends Element {
    constructor(msg, stack = []) {
        super('error');
        this.set("msg", jsObjectToElement(msg));
        this.set("stack", jsObjectToElement(stack));
    }
    pushStack(info) {
        this.get("stack").array.push(jsObjectToElement(info));
    }
    updateFunctionName(name) {
        var last = this.get("stack").array[this.get("stack").array.length - 1];
        if (last && last.get("functionName") == nil) {
            last.set("functionName", new StringElement(name));
        }
    }
    toNative() {
        return {
            msg: this.get("msg") ? this.get("msg").toNative() : null,
            stack: this.get("stack") ? this.get("stack").toNative() : null
        }
    }
}

export class ProtoElement extends Element {
    // className: string;
    // parent: ProtoElement | null;
    // methods: Map<String, Element>;
    constructor(className, parent, methods) {
        super();
        this.className = className;
        if (parent != undefined) {  
            this.setPro("$$pro$$", parent.$$pro$$);
        }
        if (methods) {
            methods.forEach((v, k) => {
                this.setPro(k, v ? v : nil);
            })
        }
    }
    toString() {
        return "PROTOTYPE"
    }
}
export class NativeFunctionElement extends FunctionElement {
    constructor(jsFunction, params) {
        // body和ctx都不需要
        super(params, null, null);
        this.jsFunction = jsFunction;
    }
    // args : NumberElement / BooleanElement / StringElement / NullElement
    call(name, args, _this, _super, ctx) {
        try {
            // 直接把参数转换成js对象，然后调用jsFunction
            var nativeArgs = args.map(e => e.toNative());

            // 注意这里的_this还是原Element，没有转换成js对象。因为像array的push操作需要修改的是_this的
            var res = this.jsFunction.apply(_this, nativeArgs);

            // 返回值也需要是element，道理与_this一样，转换会导致引用类型变化
            return res ? res : nil;
        } catch (e) {
            throw new RuntimeError("Error calling native method " + name + ":" + e.message);
        }
    }
}

// null / true / false 只有一种，所以采用单例
export const nil = new NullElement(),
trueElement = new BooleanElement(true),
falseElement = new BooleanElement(false);

// 声明运行时的报错
export class RuntimeError extends Error {
    constructor(msg, position, element) {
        super(msg);
        this.element = element ? element: new ErrorElement(msg, [{position}]);
    }
}

export class Context {
    constructor(parent) {
        this.variables = new Map();
        this.funCtx = {name : undefined, returnElement: undefined};
        // inFor主要是判断是否在for循环中，当出现break或continue的时候，设置对应的字段，并且从自己开始不断向上找到inFor=true，并将遍历路径上的上下文的对应字段都进行设置。
        this.forCtx = {inFor: false, break: false, continue: false};
        this.parent = parent;
    }
    get(name) {
        // 自己有这个变量，就返回这个变量的值
        if (this.variables.has(name)) {
            return this.variables.get(name);
        }
        // 自己没有，则从parent中不断向上查找
        if (this.parent) {
            return this.parent.get(name);
        }
        // 最后也没有，返回null
        return null;
    }
    // 对应Varstatement
    set(name, value) {
        this.variables.set(name, value);
    }
    // 这个函数中可能又有多个块域，每个都需要设置返回值
    setReturnElement(element) {
        this.funCtx.returnElement = element;
        if (!this.funCtx.name) {
            if (this.parent) this.parent.setReturnElement(element);
            else throw new RuntimeError("return outside function")
        }
    }
    // 获取当前所在的函数名，throw的时候有用
    getFunctionName() {
        if (this.funCtx.name) return this.funCtx.name;
        if (this.parent) return this.parent.getFunctionName();
        return null;
    }
    // 更新变量，对应ASSIGN操作符
    update(name, value) {
        if (this.variables.has(name)) {
            this.set(name, value);
            return;
        } else if (this.parent) {
            this.parent.update(name, value);
            return;
        }
        // 没有声明就更新，直接报错
        throw new RuntimeError(`Identifier ${name} is not defined`);
    }
    setBreak() {
        this.forCtx.break = true;
        if (this.forCtx.inFor) {
            return; //找到最近的for就结束
        } else if (this.parent) {
            // 不能跨函数
            if (this.funCtx.name) throw new RuntimeError(`break not in for`);
            this.parent.setBreak();
        } else {
            throw new RuntimeError('break not in for');
        }
    }
    setContinue() {
        this.forCtx.continue = true;
        if (this.forCtx.inFor) {
            return; //找到最近的for就结束
        } else if (this.parent) {
            if (this.funCtx.name) throw new RuntimeError(`continue not in for`);
            this.parent.setContinue();
        } else {
            throw new RuntimeError('continue not in for');
        }
    }
}

const arrayProto = new ProtoElement();
arrayProto.setPro("at", new NativeFunctionElement(function(index){ return this.array[index]; }));
arrayProto.setPro("length", new NativeFunctionElement(function(){ return new NumberElement(this.array.length); }));
arrayProto.setPro("push", new NativeFunctionElement(function(item){ this.array.push(jsObjectToElement(item)); }));
arrayProto.setPro("pop", new NativeFunctionElement(function(){ return this.array.pop(); }));
arrayProto.setPro("shift", new NativeFunctionElement(function(){ return this.array.shift(); }));
arrayProto.setPro("unshift", new NativeFunctionElement(function(item){ this.array.unshift(jsObjectToElement(item)); }));
arrayProto.setPro("join", new NativeFunctionElement(function(str){ return new StringElement(this.array.map(item=>item.toString()).join(str)); }));

const stringProto = new ProtoElement();
stringProto.setPro("length", new NativeFunctionElement(function(c){ return new NumberElement(this.value.length);}));
stringProto.setPro("split", new NativeFunctionElement(function(c){ return new ArrayElement(this.value.split(c).map(item => new StringElement(item)));}));
stringProto.setPro("charAt", new NativeFunctionElement(function(index){ return new StringElement(this.value[index]) }));
stringProto.setPro("indexOf", new NativeFunctionElement(function(str){ return new NumberElement(this.value.indexOf(str)) }));
stringProto.setPro("startsWith", new NativeFunctionElement(function(str){ return this.value.startsWith(str) ? trueElement :falseElement }));
stringProto.setPro("endsWith", new NativeFunctionElement(function(str){ return this.value.endsWith(str) ? trueElement :falseElement }));
stringProto.setPro("replaceAll", new NativeFunctionElement(function(src, des){ return new StringElement(this.value.replaceAll(src, des)) }));
stringProto.setPro("substring", new NativeFunctionElement(function(start, end){ return new StringElement(this.value.substring(start, end)) }));
stringProto.setPro("toUpperCase", new NativeFunctionElement(function(){ return new StringElement(this.value.toUpperCase()) }));
stringProto.setPro("toLowerCase", new NativeFunctionElement(function(){ return new StringElement(this.value.toLowerCase()) }));
stringProto.setPro("trim", new NativeFunctionElement(function(){ return new StringElement(this.value.trim()) }));
stringProto.setPro("trimLeft", new NativeFunctionElement(function(){ return new StringElement(this.value.trimLeft()) }));
stringProto.setPro("trimRight", new NativeFunctionElement(function(){ return new StringElement(this.value.trimRight()) }));
stringProto.setPro("toNumber", new NativeFunctionElement(function(){ return isNaN(this.value) ? new NumberElement(NaN) : new NumberElement(parseFloat(this.value)) }));

function jsObjectToElement(obj) {
    if (obj === null || obj === undefined) return nil;
    if (typeof obj === 'number') {
        return new NumberElement(obj);
    } else if (typeof obj === 'string') {
        return new StringElement(obj);
    } else if (typeof obj === 'boolean') {
        return obj ? trueElement: falseElement;
    } else if (obj === null) {
        return nil;
    } else if (Array.isArray(obj)) {
        return new ArrayElement(obj.map(e => jsObjectToElement(e)));
    }
    // obj类型
    const keys = Object.keys(obj);
    const res = new Element("nomalMap")
    res.map = new Map();
    keys.forEach(key => res.map.set(key, jsObjectToElement(obj[key])));
    return res;
}
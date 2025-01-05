import { evalExpression, evalStatement, throwToParent } from "./eval.js";

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
        this.$$pro$$.set("$$pro$$", stringProto);
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

export class FunctionElement extends Element {
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

    call(name, args, _this, _super, ctx) {
        // 允许长度不匹配和js一样灵活
        // if (args.length != this.params.length) {
        //     throw new RuntimeError(`function ${name+" "}call error: args count not match`);
        // }
        var newCtx = new Context(this.closureCtx);
        if (_this) {
            newCtx.setCur("this", _this);
        }
        if (_super) {
            newCtx.setCur("super", _super);
        }
        newCtx.funCtx.info = {name, id: ++functionId};
        this.params.forEach((param, index) => {
            newCtx.setCur(param, args[index] ? args[index] : nil);
        });
        evalStatement(this.body, newCtx);
        if (newCtx.throwElement) {
            ctx.throwElement = newCtx.throwElement;
        }
        return newCtx.funCtx.returnElement =  newCtx.funCtx.returnElement ?  newCtx.funCtx.returnElement : nil;
    }
}

export class NativeFunctionElement extends FunctionElement {
    constructor(jsFunction, params) {
        super(params, null, null)
        this.jsFunction = jsFunction;
    }
    // args : NumberElement / BooleanElement / StringElement / NullElement
    call(name, args, _this, _super, ctx) {
        // 调用栈上有异常，当前函数跳过执行
        if (ctx.throwElement) {
            return nil;
        }
        var nativeArgs = args.map(e => e.toNative())
        var res = this.jsFunction.apply(_this, nativeArgs);
        return res ? res : nil;
    }
}

export class ArrayElement extends Element {
    // value: Element[]
    constructor(array) {
        super('array');
        this.array = array;
        this.$$pro$$.set("$$pro$$", arrayProto)
    }
    toString() {
        return `[${this.array.map(v => v.toString()).join(', ')}]`;
    }
    toNative() {
        return this.array.map(e =>e.toNative());
    }
}


// 基础的类型信息，也是一种Object
export class ProtoElement extends Element {
    constructor(className, parent, props, ctx = new Context()) {
        super();
        this.className = className;
        if (parent != undefined) {  
            this.setPro("$$pro$$", parent.$$pro$$);
        }
        if (props) {
            props.forEach((v, k) => {
                if (!v) {
                    this.setPro(k.toString(), nil);
                } else {
                    this.setPro(k.toString(), evalExpression(v, ctx));
                }
            })
        }
    }
    toString() {
        return "PROTOTYPE"
    }
}

export class Context {
    constructor(parent) {
        this.varibales = new Map();
        this.funCtx = {info: parent ? parent.funCtx.info : undefined, returnElement: undefined};
        this.forCtx = {inFor: false, break: false, continue: false};
        this.parent = parent;
        this.throwElement = undefined;
    }
    setReturnElement(element, info = this.funCtx.info) {
        if (this.funCtx.info === info) {
            this.funCtx.returnElement = element;
            if (this.parent) this.parent.setReturnElement(element, info);
        }
    }

    setBreak(info=this.funCtx.info) {
        if (info != this.funCtx.info) {
            throw new RuntimeError('break not in for');
        }
        this.forCtx.break = true;
        if (this.forCtx.inFor) {
            return;
        } else if (this.parent) {
            this.parent.setBreak(info);
        } else {
            throw new RuntimeError('break not in for');
        }
    }
    setContinue(info=this.funCtx.info) {
        if (info != this.funCtx.info) {
            throw new RuntimeError('break not in for');
        }
        this.forCtx.continue = true;
        if (this.forCtx.inFor) {
            return;
        } else if (this.parent) {
            this.parent.setContinue();
        } else {
            throw new RuntimeError('continue not in for');
        }
    }
    setCur(name, value) {
        this.varibales.set(name, value);
    }
    set(name, value) {
        if (!this.get(name)) {
            // 不能直接赋值未声明变量
            throw new RuntimeError('Cannot set value for undefined variable');
        }
        if (this.getCur(name)) {
            this.setCur(name, value);
        } else {
            this.parent.set(name, value);
        }
    }
    getCur(name) {
        return this.varibales.get(name);
    }
    get(name) {
        if (this.varibales.get(name) != undefined) {
            return this.varibales.get(name);
        }
        // 有闭包环境，闭包优先级仅次于当前上下文
        if (this.closureCtx && this.closureCtx.get(name)) {
            return this.closureCtx.get(name);
        } else if (this.parent) { 
            return this.parent.get(name);
        }
        return null;
    }
}
// 这三个都用一个常量即可
export const nil = new NullElement(),
trueElement = new BooleanElement(true),
falseElement = new BooleanElement(false);

let functionId = 0;

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
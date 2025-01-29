import * as LEX  from "../lexer/lexer.js";
import { RuntimeError } from "../common/error.js";
import {VarStatement, ThrowStatement, ReturnStatement, BlockStatement, ExpressionStatement, TryCatchStatement, precedenceMap, IfStatement, ForStatement, BreakStatement, ContinueStatement, EmptyStatement, ClassStatement, NewAstNode, NullAstNode, ArrayDeclarationAstNode, IndexAstNode, MapObjectDeclarationAstNode} from '../parser/model.js'
import {AstNode, IdentifierAstNode, BooleanAstNode, StringAstNode, NumberAstNode, InfixOperatorAstNode, PrefixOperatorAstNode, PostfixOperatorAstNode, GroupAstNode, FunctionDeclarationAstNode, FunctionCallAstNode} from '../parser/model.js'
import { Element, NumberElement, StringElement, BooleanElement, NullElement, ArrayElement, FunctionElement, NativeFunctionElement, ProtoElement, Context, nil, trueElement, falseElement, ErrorElement  } from "./model.js";


// 对statement[]求值，最终返回最后一个语句的求值结果
export function evalStatements(statements, ctx) {
    var res = nil;
    for (let statement of statements) {
        if (ctx.funCtx.returnElement || ctx.forCtx.break || ctx.forCtx.continue) break;
        try {
            res = evalStatement(statement, ctx);
        } catch(e) {
            if (e instanceof RuntimeError) {
                if (e.stack[e.stack.length-1].position == "") {
                    e.stack[e.stack.length-1].position = `${statement.token.line}:${statement.token.pos}`;
                }
                if (!ctx.parent) { // 根上下文了，则直接结束进程，打印异常堆栈
                    console.error("Uncaught Error: " + e.message);
                    e.element.toNative().stack.forEach(item=> {
                        console.error(` at ${item.functionName ? item.functionName : "__root__"}  ${item.position}`);
                    });
                    // 打印堆栈后，退出运行
                    process.exit(1);
                }
            }
            throw e;
        }
    }
    return res;
}


function evalStatement(statement, ctx) {
    if (statement instanceof ExpressionStatement) {
        return evalExpression(statement.expression, ctx);
    } else if (statement instanceof VarStatement) {
        return evalVarStatement(statement, ctx);
    } else if (statement instanceof BlockStatement) {
        return evalBlockStatement(statement, new Context(ctx));
    } else if (statement instanceof ReturnStatement) {
        ctx.setReturnElement(evalExpression(statement.valueAstNode, ctx));
    } else if (statement instanceof IfStatement) {
        var condRes = evalExpression(statement.conditionAstNode, ctx);
        if ((condRes instanceof NumberElement) && condRes.value == 0 && statement.elseBlockStatement) {
            evalBlockStatement(statement.elseBlockStatement, new Context(ctx));
        } else if (condRes == nil || condRes == falseElement) {
            if (statement.elseBlockStatement) {
                evalBlockStatement(statement.elseBlockStatement, new Context(ctx));
            }
        } else {
            evalBlockStatement(statement.ifBlockStatement, new Context(ctx));
        }
    } else if (statement instanceof ForStatement) {
        if (statement.initStatement) {
            evalStatement(statement.initStatement, ctx);
        }
        while (true) {
            if (statement.conditionStatement) {
                if (!(statement.conditionStatement instanceof ExpressionStatement)) {
                    throw new RuntimeError("Condition should be an ExpressionStatement", `${statement.token.line}:${statement.token.pos}`);
                }
                var condRes = evalExpression(statement.conditionStatement.expression, ctx);
                if (condRes instanceof NumberElement && condRes.value === 0) {
                    return nil;
                }
                if (condRes == nil || condRes == falseElement) {
                    return nil;
                }
            }
            var newCtx = new Context(ctx);
            newCtx.forCtx.inFor = true;
            evalBlockStatement(statement.bodyBlockStatement, newCtx);
            if (newCtx.forCtx.break || newCtx.funCtx.returnElement) break;
            if (statement.stepAstNode) {
                evalExpression(statement.stepAstNode, ctx);
            }
        }
    } else if (statement instanceof BreakStatement) {
        ctx.setBreak();
    } else if (statement instanceof ContinueStatement) {
        ctx.setContinue();
    } else if (statement instanceof ThrowStatement) { 
        var err = evalExpression(statement.valueAstNode, ctx);
        err.pushStack({functionName : ctx.getFunctionName(), position: `${statement.token.line}:${statement.token.pos}`});
        var jsErr = new RuntimeError(err.get("msg").toNative(), null, err);
        throw jsErr
    } else if (statement instanceof TryCatchStatement) {
        try {
            return evalBlockStatement(statement.tryBlockStatement, new Context(ctx));
        } catch(e) {
            if (e instanceof RuntimeError) {
                var catchCtx = new Context(ctx);
                // try-catch的没机会上翻到函数定义的ctx了，所以主动设置
                e.element.updateFunctionName(ctx.getFunctionName());
                catchCtx.set(statement.catchParamIdentifierAstNode.toString(), e.element);
                evalBlockStatement(statement.catchBlockStatement, catchCtx);
            } else {
                throw e; //未知异常，可能是程序bug了
            }

        }
    } else if (statement instanceof ClassStatement) {
        var parent =  null;
        if (statement.parentIdentifierAstNode) {
            parent = ctx.get(statement.parentIdentifierAstNode.toString());
            if (!(parent instanceof ProtoElement)) {
                throw new RuntimeError("parent class " + 
                    statement.parentIdentifierAstNode.toString() + " must be a class")
            }
        }
        var className = statement.nameIdentifierAstNode.toString();
        var methods = new Map();
        if (statement.methods) {
            statement.methods.forEach((v, k)=> {
                var func = evalExpression(v, ctx);
                if (!(func instanceof FunctionElement)) throw new RuntimeError("method " + k.toString() + " must be a function");
                methods.set(k.toString(), evalExpression(v, ctx));
            });
        }
        // 在语法分析中，我们已经把类中的字段赋值的语法糖写法，转为了在constructor中赋值，所以类中只有方法。
        ctx.set(className, new ProtoElement(className, parent, methods))
    } 
    // 其他语句暂时不处理返回个nil
    return nil;
}

export function evalBlockStatement(blockStatement, ctx) {
    return evalStatements(blockStatement.statements, ctx);
}

function evalVarStatement(varStatement, ctx) {
    if (varStatement instanceof VarStatement) {
        // 对等号之后的表达式求值
        var value = evalExpression(varStatement.valueAstNode, ctx);
        if (value instanceof NumberElement) {
            value = new NumberElement(value.toNative());
        }
        var name = varStatement.nameIdentifierAstNode.toString();
        // 将变量名和对应的值set到一个全局的map中
        ctx.set(name, value);
    }
}

function evalExpression(exp, ctx) {
    // 基础数据类型
    if (exp instanceof NumberAstNode) {
        return new NumberElement(exp.toString());
    } else if (exp instanceof StringAstNode) {
        return new StringElement(exp.toString());
    } else if (exp instanceof NullAstNode) {
        return nil;
    } if (exp instanceof BooleanAstNode) {
        var str = exp.toString();
        if (str == 'true') {
            return trueElement;
        } else if (str == 'false') {
            return falseElement;
        } else {
            throw new Error('invalid boolean');
        }
    }
    // 变量值
    else if (exp instanceof IdentifierAstNode) {
        var value = ctx.get(exp.toString());
        if (value) return value;
        // 没有赋值，直接拿来用，抛出异常
        throw new RuntimeError(`Identifier ${exp.toString()} is not defined`, `${exp.token.line}:${exp.token.pos}`);
    }
    // 前缀 后缀 中缀 运算符，单独定义函数
    else if (exp instanceof PrefixOperatorAstNode) {
        return evalPrefixOperator(exp, ctx);
    } else if (exp instanceof PostfixOperatorAstNode) {
        return evalPostfixOperator(exp, ctx);
    } else if (exp instanceof InfixOperatorAstNode) {
        return evalInfixOperator(exp, ctx);
    } 
    // 数组声明 [1,2,3,"a"]，分别对每个item 求值，整合成数组即可
    else if (exp instanceof ArrayDeclarationAstNode) {
        return new ArrayElement(exp.items.map(item => evalExpression(item, ctx)));
    } 
    // 分组，直接求里面的表达式即可
    else if (exp instanceof GroupAstNode) {
        return evalExpression(exp.exp, ctx);
    } 
    // 对象声明的节点 {a:1, b: 2, c: {a : 3}}，对于每个key直接按toString求值，value则是递归表达式求值
    // 注意这里声明了一个普通的Element，在map上追加了kv
    else if (exp instanceof MapObjectDeclarationAstNode) {
        var res = new Element("nomalMap");
        exp.pairs.forEach(item => {
            var v = evalExpression(item.value, ctx);
            res.set(item.key.toString(), v);
        });
        return res;
    }
    // 函数声明
    else if (exp instanceof FunctionDeclarationAstNode) {
        return new FunctionElement(exp.params.map(item=>item.toString()), exp.body, ctx);
    }
    // 函数调用
    else if (exp instanceof FunctionCallAstNode) {
        var funcExpression = exp.funcExpression;
        // 去掉冗余的组
        while (funcExpression instanceof GroupAstNode) {
            funcExpression = funcExpression.exp;
        }
        var fname = null, _this = nil, _super = nil, funcElement = nil;
        // 全局方法
        if (funcExpression instanceof IdentifierAstNode) {
            fname = funcExpression.toString();
            // 注入一个print函数，来辅助调试
            if (fname == 'print') {
                console.log(...(exp.args.map((arg) => evalExpression(arg, ctx).toNative())));
                return nil;
            }
            if (fname == 'error') {
                if (exp.args.length == 0) {
                    throw new RuntimeError("error() takes at least 1 argument",`${exp.token.line}:${exp.token.pos}`);
                }
                var msg = evalExpression(exp.args[0], ctx);
                if (!(msg instanceof StringElement)) {
                    throw new RuntimeError("msg should be a String",`${exp.token.line}:${exp.token.pos}`);
                }
                return new ErrorElement(msg.toNative());
            }
            funcElement = evalExpression(funcExpression, ctx);
        } 
        // 对象方法
        else if (funcExpression instanceof InfixOperatorAstNode) {
            // xx.method() => 先对xx求值，结果赋值给_this；然后找到method这个functionElement
            if ((funcExpression.op.type === LEX.POINT && funcExpression.right instanceof IdentifierAstNode) ||
            (funcExpression.op.type === LEX.LBRACKET && funcExpression.right instanceof StringAstNode)) {
                _this = evalExpression(funcExpression.left, ctx)
                funcElement = _this.get(funcExpression.right.toString());
                fname = funcExpression.right.toString();
                var curClsPro = _this.$$pro$$;
                var parentClsPro = curClsPro ? curClsPro.get("$$pro$$") : null;
                _super = new Element(); // 临时的
                _super.$$pro$$ = parentClsPro ? parentClsPro : new Map();
                // super比较特殊，调用super.xx的时候，父类方法中的this指向自身，而是指向当前的对象
                if (funcExpression.left.toString() === 'super') {
                    _this = ctx.get("this");
                }
            }
        }
        // 其他形式，例如 "b()()",函数的返回值也是个函数，直接去调用
        if (funcElement == nil) {
            funcElement = evalExpression(funcExpression, ctx);
        } 
        if (!fname) {
            fname = "<anonymous>"
        }
        
        if (funcElement instanceof FunctionElement) {
            return funcElement.call(fname, exp.args.map((arg) => evalExpression(arg, ctx)), _this, _super, exp);
        } else if (funcExpression.right && funcExpression.right.toString() == "constructor") {
            // 默认构造方法，啥也不做
            return nil;
        } else {
            throw new RuntimeError(`${funcExpression.toString()} is not a function`,`${exp.token.line}:${exp.token.pos}`);
        }
    }
    // new对象
    else if (exp instanceof NewAstNode) {
        var className = exp.clsIdentifierAstNode.toString();
        var args = exp.args.map((arg) => evalExpression(arg, ctx));
        var clsElement = ctx.get(className);
        if (!(clsElement instanceof ProtoElement)) throw new RuntimeError(`${className} is not a class`);
        // 1 创建空对象
        var _this = new Element(className);
        // 2 当前对象原型 指向 类的原型
        var curClsPro = _this.$$pro$$ = clsElement.$$pro$$;
        var parentClsPro = curClsPro.get("$$pro$$"); 
        // 3 this指向空对象，super指向一个只有父类方法（原型）的对象，这样super.只能调用父类方法
        var _super = new Element();
        _super.$$pro$$ = parentClsPro ? parentClsPro : new Map();

        // 4 运行构造方法，原型链一直往上找constructor构造方法，如果全都没有的话，就不执行任何操作
        if (clsElement.get("constructor") && clsElement.get("constructor") != nil) {
            if (!(clsElement.get("constructor") instanceof FunctionElement)) throw new RuntimeError(`${className}.constructor is not a function`); 
            // 运行构造方法，这里用到了call方法的第三第四个参数分别为this和super的指向
            clsElement.get("constructor").call("constructor", args, _this, _super, exp);
        }
        return _this;
    }
    return nil;
}
// 前缀运算符节点求值 + - ! ~
function evalPrefixOperator(prefixOperatorAstNode, ctx) {
    var right = evalExpression(prefixOperatorAstNode.right, ctx);
    switch (prefixOperatorAstNode.op.type) {
        case LEX.PLUS:
            if (right instanceof NumberElement) {
                return right;
            } else {
                throw new RuntimeError("+ should only used with numbers", `${prefixOperatorAstNode.op.line}:${prefixOperatorAstNode.op.pos}`);
            }
        case LEX.MINUS:
            if (right instanceof NumberElement) {
                right.value = -right.value;
                return right;
            } else {
                throw new RuntimeError("- should only used with numbers", `${prefixOperatorAstNode.op.line}:${prefixOperatorAstNode.op.pos}`);
            }
        case LEX.NOT:
            if (right instanceof BooleanElement) {
                right.value = !right.value;
                return right;
            }
            if (right instanceof NullElement) {
                return trueElement;
            }
            return falseElement;
        case LEX.BIT_NOT:
            if (right instanceof NumberElement) {
                right.value = ~right.value;
                return right;
            } else {
                throw new RuntimeError("~ should only used with numbers", `${prefixOperatorAstNode.op.line}:${prefixOperatorAstNode.op.pos}`);
            }
        case LEX.INCREMENT:
            if (checkSelfOps(prefixOperatorAstNode.right)) {
                var item = evalExpression(prefixOperatorAstNode.right, ctx);
                if (item instanceof NumberElement) {
                    item.value++;
                    return item;
                }
            }
            throw new RuntimeError("++ should only used with number variable", `${prefixOperatorAstNode.op.line}:${prefixOperatorAstNode.op.pos}`);
        case LEX.DECREMENT:
            if (checkSelfOps(prefixOperatorAstNode.right)) {
                var item = evalExpression(prefixOperatorAstNode.right, ctx);
                if (item instanceof NumberElement) {
                    item.value--;
                    return item;
                }
            }
            throw new RuntimeError("-- should only used with number variable", `${prefixOperatorAstNode.op.line}:${prefixOperatorAstNode.op.pos}`);
        default:
            throw new RuntimeError(`Unsupported prefix operator: ${prefixOperatorAstNode.op.type}`, `${prefixOperatorAstNode.op.line}:${prefixOperatorAstNode.op.pos}`);
    }
}

// 后缀运算符节点求值 ++ --
function evalPostfixOperator(postfixOperatorAstNode, ctx) {
    if (checkSelfOps(postfixOperatorAstNode.left)) {
        var left = evalExpression(postfixOperatorAstNode.left, ctx);
        if (left instanceof NumberElement) {
            // 需要返回一个新的NumberElement对象保持原来的value，原来的对象的value+1
            switch (postfixOperatorAstNode.op.type) {
                case LEX.INCREMENT:
                    return new NumberElement(left.value++);
                case LEX.DECREMENT:
                    return new NumberElement(left.value--);
                default:
                    throw new RuntimeError("unknown postfix operator " + postfixOperatorAstNode.op.type, `${prefixOperatorAstNode.op.line}:${prefixOperatorAstNode.op.pos}`);
            }
        }
        throw new RuntimeError("++/-- should only used with number variable", `${prefixOperatorAstNode.op.line}:${prefixOperatorAstNode.op.pos}`);
    }
}
// ++ --等操作符的使用场景判断：只能用在 a++  p.a++ (p.a)++ 这些场景下
function checkSelfOps(node) {
    if (node instanceof IdentifierAstNode) return true;
    if (node instanceof InfixOperatorAstNode && node.op.type === LEX.POINT && node.right instanceof IdentifierAstNode) return true;
    if (node instanceof InfixOperatorAstNode && node.op.type === LEX.LBRACKET && node.right instanceof IndexAstNode) return true;
    if (node instanceof GroupAstNode) return checkSelfOps(node.exp);
    return false;
}

// 中缀运算符节点求值
function evalInfixOperator(infixOperatorAstNode, ctx) {
    switch (infixOperatorAstNode.op.type) {
        // 基础操作符
        case LEX.PLUS:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return new NumberElement(l.value + r.value);
            }
            if ((l instanceof StringElement || r instanceof StringElement)) {
                return new StringElement(l.toString() + r.toString());
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, `${infixOperatorAstNode.op.line}:${infixOperatorAstNode.op.pos}`);
        case LEX.MINUS:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return new NumberElement(l.value - r.value);
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, `${infixOperatorAstNode.op.line}:${infixOperatorAstNode.op.pos}`);
        case LEX.MULTIPLY:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return new NumberElement(l.value * r.value);
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, `${infixOperatorAstNode.op.line}:${infixOperatorAstNode.op.pos}`);
        case LEX.DIVIDE:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return new NumberElement(l.value / r.value);
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, `${infixOperatorAstNode.op.line}:${infixOperatorAstNode.op.pos}`);
        case LEX.MODULUS:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return new NumberElement(l.value % r.value);
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, `${infixOperatorAstNode.op.line}:${infixOperatorAstNode.op.pos}`);
        case LEX.BSHR:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return new NumberElement(l.value >> r.value);
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, `${infixOperatorAstNode.op.line}:${infixOperatorAstNode.op.pos}`);
        case LEX.BSHL:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return new NumberElement(l.value << r.value);
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, `${infixOperatorAstNode.op.line}:${infixOperatorAstNode.op.pos}`);
        case LEX.LT:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return l.value < r.value ? trueElement : falseElement;
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, `${infixOperatorAstNode.op.line}:${infixOperatorAstNode.op.pos}`);
        case LEX.GT:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return l.value > r.value ? trueElement : falseElement;
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, `${infixOperatorAstNode.op.line}:${infixOperatorAstNode.op.pos}`);
        case LEX.LTE:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return l.value <= r.value ? trueElement : falseElement;
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, `${infixOperatorAstNode.op.line}:${infixOperatorAstNode.op.pos}`);
        case LEX.GTE:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return l.value >= r.value ? trueElement : falseElement;
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, `${infixOperatorAstNode.op.line}:${infixOperatorAstNode.op.pos}`);
        case LEX.EQ:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return l.value == r.value ? trueElement : falseElement;
            }
            if (l instanceof StringElement && r instanceof StringElement) {
                return l.value == r.value ? trueElement : falseElement;
            }
            return l == r ? trueElement : falseElement;
        case LEX.NEQ:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return l.value != r.value ? trueElement : falseElement;
            }
            if (l instanceof StringElement && r instanceof StringElement) {
                return l.value != r.value ? trueElement : falseElement;
            }
            return l != r ? trueElement : falseElement;
        case LEX.AND:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l == nil || r == nil) {
                return falseElement;
            }
            if (l == falseElement || r == falseElement) {
                return falseElement;
            }
            if (l instanceof NumberElement && l.value == 0) {
                return falseElement;
            }
            if (r instanceof NumberElement && r.value == 0) {
                return falseElement;
            }
            return trueElement;
        case LEX.OR:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && l.value != 0) {
                return trueElement;
            }
            if (l != nil && l != falseElement) {
                return trueElement;
            }
            if (r instanceof NumberElement && r.value != 0) {
                return trueElement;
            }
            if (r != nil && r != falseElement) {
                return trueElement;
            }
            return falseElement;
        // 赋值运算符
        case LEX.ASSIGN:
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (infixOperatorAstNode.left instanceof IdentifierAstNode) {
                var l = evalExpression(infixOperatorAstNode.left, ctx);
                if (r instanceof NumberElement) {
                    r = new NumberElement(r.value);
                }
                ctx.update(infixOperatorAstNode.left.toString(), r);
                return  r;
            }
            // 点、index运算符，就不要求值了，直接赋值
            if (infixOperatorAstNode.left instanceof InfixOperatorAstNode) {
                if (infixOperatorAstNode.left.op.type === LEX.POINT) {
                    var lhost = evalExpression(infixOperatorAstNode.left.left, ctx);
                    assert(lhost instanceof Map || lhost instanceof Element, "Point should used on Element", infixOperatorAstNode.left.op);
                    if (r instanceof NumberElement) {
                        r = new NumberElement(r.value);
                    }
                    lhost.set(infixOperatorAstNode.left.right.toString(), r);
                    return r;
                } else if (infixOperatorAstNode.left.op.type === LEX.LBRACKET) {
                    var lhost = evalExpression(infixOperatorAstNode.left.left, ctx);
                    assert(lhost instanceof Map || lhost instanceof Element, "[index] should used after Element", infixOperatorAstNode.left.op);
                    assert(infixOperatorAstNode.left.right instanceof IndexAstNode, "[index] should be IndexAstNode", infixOperatorAstNode.left.op);
                    var index = evalExpression(infixOperatorAstNode.left.right.index, ctx);
                    assert(index instanceof NumberElement || index instanceof StringElement, "[index] should be Number or String", infixOperatorAstNode.left.op);
                    if (r instanceof NumberElement) {
                        r = new NumberElement(r.value);
                    }
                    lhost.set(index.toNative(), r);
                    return r;
                }
            }
            throw new RuntimeError(`Assignment to non-identifier ${infixOperatorAstNode.left.toString()}`, `${infixOperatorAstNode.op.line}:${infixOperatorAstNode.op.pos}`);
        // 点运算符是获取对象的属性，而我们的属性都是存到Element的map中，所以点运算符就是取map的value，对应我们在Element中定义的get方法直接使用即可
        // 后面的LBRACKET运算符也是类似的，只不过后者还支持数组或字符串索引case
        case LEX.POINT:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            if (l instanceof Element || l instanceof Map) {
                if (infixOperatorAstNode.right instanceof IdentifierAstNode) {
                    return l.get(infixOperatorAstNode.right.toString());
                }
            }
            throw new RuntimeError(". should be after an Element", `${infixOperatorAstNode.op.line}:${infixOperatorAstNode.op.pos}`);
        case LEX.LPAREN: // 小括号运算符特指函数执行
            var functionCall = new FunctionCallAstNode(infixOperatorAstNode.token, infixOperatorAstNode.left, infixOperatorAstNode.right.args);
            return evalExpression(functionCall, ctx);
        case LEX.LBRACKET: // 中括号运算符特指index访问
            assert(infixOperatorAstNode.right instanceof IndexAstNode, "Invalid infix operator usage for []", infixOperatorAstNode.op);
            var index = evalExpression(infixOperatorAstNode.right.index, ctx);
            assert(index instanceof NumberElement || index instanceof StringElement, "[] operator only support number or string index", infixOperatorAstNode.op);
            var target = evalExpression(infixOperatorAstNode.left, ctx);
            // 数组/字符串 [数字]
            if (index instanceof NumberElement) {
                assert(target instanceof ArrayElement || target instanceof StringElement, "[number] operator only support array or string index", infixOperatorAstNode.op);
                if (target instanceof ArrayElement) {
                    return target.array[index.value];
                } else {
                    return new StringElement(target.value.charAt(index.value));
                }
            }
            // obj["字符串"]
            if (target instanceof Element) {
                return target.get(index.value);
            }
            throw new RuntimeError("Invalid infix operator usage for []", `${infixOperatorAstNode.op.line}:${infixOperatorAstNode.op.pos}`);
        default:
            throw new RuntimeError(`Unknown operator ${infixOperatorAstNode.toString()}`, `${infixOperatorAstNode.op.line}:${infixOperatorAstNode.op.pos}`);
    }
}

function assert(condition, msg, token) {
    if (!condition) {
        throw new RuntimeError(msg, `${token.line}:${token.pos}`);
    }
}

import * as LEX  from "../lexer/lexer.js";
import { RuntimeError } from "../common/error.js";
import { Parser } from "../parser/parser.js";
import {VarStatement, ThrowStatement, ReturnStatement, BlockStatement, ExpressionStatement, TryCatchStatement, precedenceMap, IfStatement, ForStatement, BreakStatement, ContinueStatement, EmptyStatement, ClassStatement, NewAstNode, NullAstNode, ArrayDeclarationAstNode, IndexAstNode, MapObjectDeclarationAstNode} from '../parser/model.js'
import {AstNode, IdentifierAstNode, BooleanAstNode, StringAstNode, NumberAstNode, InfixOperatorAstNode, PrefixOperatorAstNode, PostfixOperatorAstNode, GroupAstNode, FunctionDeclarationAstNode, FunctionCallAstNode} from '../parser/model.js'
import { Element, NumberElement, StringElement, BooleanElement, NullElement, ArrayElement, FunctionElement, NativeFunctionElement, ProtoElement, Context, nil, trueElement, falseElement  } from "./model.js";
import { buildIn } from "../sdk/util.js";

// 表达式求值
export function evalExpression(exp, ctx) {
    // 调用栈上有异常，当前跳过执行
    if (ctx.throwElement) {
        return nil;
    }
    if (exp instanceof NumberAstNode) {
        return new NumberElement(exp.toString());
    }
    if (exp instanceof StringAstNode) {
        return new StringElement(exp.toString());
    }
    if (exp instanceof NullAstNode) {
        return nil;
    }
    if (exp instanceof BooleanAstNode) {
        var str = exp.toString();
        if (str == 'true') {
            return trueElement;
        } else if (str == 'false') {
            return falseElement;
        } else {
            throw new RuntimeError('invalid boolean', exp.token);
        }
    }
    if (exp instanceof IdentifierAstNode) {
        var res =  ctx.get(exp.toString());
        return res ? res : nil;
    }
    if (exp instanceof FunctionDeclarationAstNode) {
        return new FunctionElement(exp.params.map(item=>item.toString()), exp.body, ctx)
    }
    if (exp instanceof PrefixOperatorAstNode) {
        return evalPrefixOperator(exp, ctx);
    }
    if (exp instanceof PostfixOperatorAstNode) {
        return evalPostfixOperator(exp, ctx);
    }
    if (exp instanceof InfixOperatorAstNode) {
        return evalInfixOperator(exp, ctx);
    }
    if (exp instanceof FunctionCallAstNode) {
        var funcExpression = exp.funcExpression;
        var funcElement = null,  _this = null, _super=null, fname = null;
        // 去掉冗余的组
        while (funcExpression instanceof GroupAstNode) {
            funcExpression = funcExpression.exp;
        }
        if (funcExpression instanceof InfixOperatorAstNode) {
            // xx.method
            if ((funcExpression.op.type === LEX.POINT && funcExpression.right instanceof IdentifierAstNode) ||
            (funcExpression.op.type === LEX.LBRACKET && funcExpression.right instanceof StringAstNode)) {
                _this = evalExpression(funcExpression.left, ctx)
                funcElement = _this.get(funcExpression.right.toString());
                fname = funcExpression.right.toString();
                // super比较特殊，调用super.xx的时候，this指向还是当前this而不是super
                if (funcExpression.left.toString() === 'super') {
                    var curClsPro = _this.$$pro$$.get("$$pro$$");
                    var parentClsPro = curClsPro ? curClsPro.get("$$pro$$") : null;
                    _super = new Element(); // 临时的
                    _super.$$pro$$ = parentClsPro ? parentClsPro : new Map();
                    _this = ctx.get("this");
                } else {
                    var curClsPro = _this.$$pro$$.get("$$pro$$");
                    var parentClsPro = curClsPro ? curClsPro.get("$$pro$$") : null;
                    _super = new Element(); // 临时的
                    _super.$$pro$$ = parentClsPro ? parentClsPro : new Map();
                }
            }
        }
        if (!fname) {
            if (funcExpression instanceof IdentifierAstNode) {
                fname = funcExpression.toString();
            } else {
                fname = "uname";
            }
        }
        if (!funcElement) {
            funcElement = evalExpression(funcExpression, ctx);
        }
        if (funcElement instanceof FunctionElement) {
            // newCtx.setCur("super", superEle);
            return funcElement.call(fname, exp.args.map((arg) => evalExpression(arg, ctx)), _this, _super,  ctx);
        } else if (funcExpression.right && funcExpression.right.toString() == "constructor") {
            // 默认构造方法，啥也不做
            return nil;
        } else {
            throw new RuntimeError(`${funcExpression.toString()} is not a function`, exp.token);
        }
    }
    if (exp instanceof NewAstNode) {
        var className = exp.clsIdentifierAstNode.toString();
        var args = exp.args.map((arg) => evalExpression(arg, ctx));
        var clsElement = ctx.get(className);
        assert(clsElement instanceof ProtoElement, `${className} is not a class`, exp.clsIdentifierAstNode.token);
        var obj = new Element(className);
        // 继承原型cls中是只读的，这样防止修改
        obj.$$pro$$.set("$$pro$$", clsElement.$$pro$$);
        var curClsPro = obj.$$pro$$.get("$$pro$$");
        var parentClsPro = curClsPro.get("$$pro$$");
        var superEle = new Element(); // 临时的
        superEle.$$pro$$ = parentClsPro ? parentClsPro : new Map();
        // 原型链一直往上找constructor构造方法，如果全都没有的话，就不执行任何操作
        if (clsElement.get("constructor") && clsElement.get("constructor") != nil) {
            assert(clsElement.get("constructor") instanceof FunctionElement, `${className}.constructor is not a function`, exp.clsIdentifierAstNode.token);    
            clsElement.get("constructor").call("constructor", args, obj, superEle, ctx);
        }
        return obj;
        
    }
    if (exp instanceof ArrayDeclarationAstNode) {
        return new ArrayElement(exp.items.map(item => evalExpression(item, ctx)));
    }
    if (exp instanceof GroupAstNode) {
        return evalExpression(exp.exp, ctx);
    }
    if (exp instanceof MapObjectDeclarationAstNode) {
        var res = new Element("nomalMap");
        exp.pairs.forEach(item => {
            var v = evalExpression(item.value, ctx);
            if (v instanceof FunctionElement) {
                res.setPro(item.key.toString(), v);
            } else {
                res.set(item.key.toString(), v);
            }
        });
        return res;
    }
    return nil;
}

// 前缀运算符节点求值
function evalPrefixOperator(prefixOperatorAstNode, ctx) {
    var right = evalExpression(prefixOperatorAstNode.right, ctx);
    switch (prefixOperatorAstNode.op.type) {
        case LEX.PLUS:
            if (right instanceof NumberElement) {
                return right;
            } else {
                throw new RuntimeError("+ should only used with numbers", prefixOperatorAstNode.op);
            }
        case LEX.MINUS:
            if (right instanceof NumberElement) {
                right.value = -right.value;
                return right;
            } else {
                throw new RuntimeError("- should only used with numbers", prefixOperatorAstNode.op);
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
                throw new RuntimeError("~ should only used with numbers", prefixOperatorAstNode.op);
            }
        case LEX.INCREMENT:
            if (checkSelfOps(prefixOperatorAstNode.right)) {
                var item = evalExpression(prefixOperatorAstNode.right, ctx);
                if (item instanceof NumberElement) {
                    item.value++;
                    return item;
                }
            }
            throw new RuntimeError("++ should only used with number varible", prefixOperatorAstNode.op);
        case LEX.DECREMENT:
            if (checkSelfOps(prefixOperatorAstNode.right)) {
                var item = evalExpression(prefixOperatorAstNode.right, ctx);
                if (item instanceof NumberElement) {
                    item.value--;
                    return item;
                }
            }
            throw new RuntimeError("-- should only used with number varible", prefixOperatorAstNode.op);
        default:
            throw new RuntimeError(`Unsupported prefix operator: ${prefixOperatorAstNode.op.type}`, prefixOperatorAstNode.op);
    }
}

// 后缀运算符节点求值
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
                    throw new RuntimeError("unknown postfix operator " + postfixOperatorAstNode.op.type, postfixOperatorAstNode.op);
            }
        }
        throw new RuntimeError("++/-- should only used with number varible", postfixOperatorAstNode.op);
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
        case LEX.PLUS:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return new NumberElement(l.value + r.value);
            }
            if ((l instanceof StringElement || r instanceof StringElement)) {
                return new StringElement(l.toString() + r.toString());
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, infixOperatorAstNode.op);
        case LEX.MINUS:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return new NumberElement(l.value - r.value);
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, infixOperatorAstNode.op);
        case LEX.MULTIPLY:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return new NumberElement(l.value * r.value);
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, infixOperatorAstNode.op);
        case LEX.DIVIDE:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return new NumberElement(l.value / r.value);
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, infixOperatorAstNode.op);
        case LEX.MODULUS:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return new NumberElement(l.value % r.value);
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, infixOperatorAstNode.op);
        case LEX.BSHR:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return new NumberElement(l.value >> r.value);
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, infixOperatorAstNode.op);
        case LEX.BSHL:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return new NumberElement(l.value << r.value);
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, infixOperatorAstNode.op);
        case LEX.LT:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return l.value < r.value ? trueElement : falseElement;
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, infixOperatorAstNode.op);
        case LEX.GT:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return l.value > r.value ? trueElement : falseElement;
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, infixOperatorAstNode.op);
        case LEX.LTE:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return l.value <= r.value ? trueElement : falseElement;
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, infixOperatorAstNode.op);
        case LEX.GTE:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (l instanceof NumberElement && r instanceof NumberElement) {
                return l.value >= r.value ? trueElement : falseElement;
            }
            throw new RuntimeError(`Invalid infix operator ${infixOperatorAstNode.op.type} for ${l.type} and ${r.type}`, infixOperatorAstNode.op);
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
        case LEX.ASSIGN:
            var r = evalExpression(infixOperatorAstNode.right, ctx);
            if (infixOperatorAstNode.left instanceof IdentifierAstNode) {
                var l = evalExpression(infixOperatorAstNode.left, ctx);
                if (ctx.get(infixOperatorAstNode.left.toString())  == undefined) {
                    throw new  RuntimeError("Undefined variable " + infixOperatorAstNode.left.toString(), infixOperatorAstNode.left.token);
                }
                ctx.set(infixOperatorAstNode.left.toString(), r);
                if (r instanceof NumberElement) {
                    return new NumberElement(r.value);
                }
                return  r;
            }
            // 点、index运算符，就不要求值了，直接赋值
            if (infixOperatorAstNode.left instanceof InfixOperatorAstNode) {
                if (infixOperatorAstNode.left.op.type === LEX.POINT) {
                    var lhost = evalExpression(infixOperatorAstNode.left.left, ctx);
                    assert(lhost instanceof Map || lhost instanceof Element, "Point should used on Element", infixOperatorAstNode.left.op);
                    lhost.set(infixOperatorAstNode.left.right.toString(), r);
                    if (r instanceof NumberElement) {
                        return new NumberElement(r.value);
                    }
                    return r;
                } else if (infixOperatorAstNode.left.op.type === LEX.LBRACKET) {
                    var lhost = evalExpression(infixOperatorAstNode.left.left, ctx);
                    assert(lhost instanceof Map || lhost instanceof Element, "[index] should used after Element", infixOperatorAstNode.left.op);
                    assert(infixOperatorAstNode.left.right instanceof IndexAstNode, "[index] should be IndexAstNode", infixOperatorAstNode.left.op);
                    var index = evalExpression(infixOperatorAstNode.left.right.index, ctx);
                    assert(index instanceof NumberElement || index instanceof StringElement, "[index] should be Number or String", infixOperatorAstNode.left.op);
                    lhost.set(index.toNative(), r);
                    if (r instanceof NumberElement) {
                        return new NumberElement(r.value);
                    }
                    return r;
                }
            }
            throw new RuntimeError(`Assignment to non-identifier ${infixOperatorAstNode.left.toString()}`, infixOperatorAstNode.op);
        case LEX.POINT:
            var l = evalExpression(infixOperatorAstNode.left, ctx);
            if (l instanceof Element || l instanceof Map) {
                if (infixOperatorAstNode.right instanceof IdentifierAstNode) {
                    return l.get(infixOperatorAstNode.right.toString());
                }
            }
            throw new RuntimeError(". should be after an Element", infixOperatorAstNode.op);
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
            if (target instanceof Element || target instanceof Map) {
                var res = target.get(index.value);
                return res ? res : nil;
            }
            throw new RuntimeError("Invalid infix operator usage for []", infixOperatorAstNode.op);
        default:
            throw new RuntimeError(`Unknown operator ${infixOperatorAstNode.toString()}`, infixOperatorAstNode.op);
    }
}

// 语句求值
export function evalStatement(statement, ctx) {
    if (statement instanceof EmptyStatement) {
        return nil;
    } else if (statement instanceof ExpressionStatement) {
        return evalExpression(statement.expression, ctx);
    } else if (statement instanceof VarStatement) {
        var name = statement.nameIdentifierAstNode.toString();
        ctx.setCur(name, evalExpression(statement.valueAstNode, ctx));
    } else if (statement instanceof BlockStatement) {
        return evalStatements(statement.statements, new Context(ctx));
    } else if (statement instanceof ReturnStatement) {
        if (ctx.funCtx.info == undefined) {
            throw new RuntimeError("return statement outside of function", statement.token);
        }
        ctx.setReturnElement(evalExpression(statement.valueAstNode, ctx));
    } else if (statement instanceof ThrowStatement) { 
        var err = evalExpression(statement.valueAstNode, ctx);
        if (err.type != "Error") {
            throw new RuntimeError("need to throw an error")
        }
        err.set("stack", [{funcInfo : ctx.funCtx.info, position: `${statement.token.line}:${statement.token.pos}`}])
        ctx.throwElement = err;
    } else if (statement instanceof IfStatement) {
        var condRes = evalExpression(statement.conditionAstNode, ctx);
        if ((condRes instanceof NumberElement) && condRes.value == 0 && statement.elseBlockStatement) {
            evalStatements(statement.elseBlockStatement, ctx);
        } else if (condRes == nil || condRes == falseElement) {
            if (statement.elseBlockStatement) {
                evalStatement(statement.elseBlockStatement, ctx);
            }
        } else {
            evalStatement(statement.ifBlockStatement, ctx);
        }
    } else if (statement instanceof ForStatement) {
        if (statement.initStatement) {
            evalStatement(statement.initStatement, ctx);
        }
        var newCtx = new Context(ctx);
        newCtx.forCtx.inFor = true;
        while (true) {
            if (statement.conditionStatement) {
                if (!(statement.conditionStatement instanceof ExpressionStatement)) {
                    throw new RuntimeError("Condition should be an ExpressionStatement", statement.token);
                }
                var condRes = evalExpression(statement.conditionStatement.expression, ctx);
                if (condRes instanceof NumberElement && condRes.value === 0) {
                    return nil;
                }
                if (condRes == nil || condRes == falseElement) {
                    return nil;
                }
            }
            evalStatement(statement.bodyBlockStatement, newCtx);
            if (newCtx.forCtx.break) break;
            if (statement.stepAstNode) {
                evalExpression(statement.stepAstNode, ctx);
            }
        }
    } else if (statement instanceof BreakStatement) {
        ctx.setBreak();
    } else if (statement instanceof ContinueStatement) {
        ctx.setContinue();
    } else if (statement instanceof ClassStatement) {
        var parent =  null;
        if (statement.parentIdentifierAstNode) {
            parent = ctx.get(statement.parentIdentifierAstNode.toString());
            assert(parent instanceof ProtoElement, "parent must be a class", statement.parentIdentifierAstNode.token);
        }
        ctx.setCur(statement.nameIdentifierAstNode.toString(), new ProtoElement(statement.nameIdentifierAstNode.toString(), parent, statement.methods, ctx))
    } else if (statement instanceof TryCatchStatement) {
        var tryCtx = new Context(ctx);
        var res = evalStatement(statement.tryBlockStatement, tryCtx);
        if (tryCtx.throwElement) {
            var err = tryCtx.throwElement;
            tryCtx.throwElement = null;
            var catchCtx = new Context(ctx);
            catchCtx.setCur(statement.catchParamIdentifierAstNode.toString(), err);
            res = evalStatement(statement.catchBlockStatement, catchCtx);
        }
        return res;
    }
    return nil;
}

function init(ctx) {
    buildIn.forEach((v, k) => ctx.varibales.set(k, v));
    evaluate(`
        class Error { constructor = function(msg){super(); this.msg = msg;}}
        `, ctx);
}

function evaluate(input, ctx = new Context()) {
    var tokens = LEX.lex(input);
    var statements = new Parser(tokens).parse();
    return evalStatements(statements, ctx);
}
// 语句数组求值
export function evalStatements(statements, ctx=new Context(), inited = true) {
    if (!inited) init(ctx);
    var res = nil;
    for (var i = 0; i< statements.length; i++) {
        try {
            res = evalStatement(statements[i], ctx);
        } catch (e) {
            if (e instanceof RuntimeError) {
                var err = new Element("Error");
                err.set("msg",  e.toString());
                err.set("stack", [{funcInfo : ctx.funCtx.info, position: `${statements[i].token.line}:${statements[i].token.pos}`}])
                ctx.throwElement = err;
            } else {
                console.error(e)
            }
            
        }
        if (ctx.throwElement) {
            throwToParent(ctx, statements[i]);
        }
        if (ctx.forCtx.break || ctx.forCtx.continue || ctx.funCtx.returnElement || ctx.throwElement) {
            break;
        }
    }
    return res;
}

function assert(condition, message, token) {
    if (!condition) {
        throw new RuntimeError(message, token);
    }
}

export function throwToParent(ctx, statement) {
    if (ctx.throwElement) {
        var stack = ctx.throwElement.get("stack");
        if (ctx.parent) {
            var token = statement.token;
            stack.push({funcInfo : ctx.parent.funCtx.info, position: `${token.line}:${token.pos}`})
            ctx.parent.throwElement = ctx.throwElement;
        } else {
            // 最顶层都没有catch
            console.error("Runtime Error: " + ctx.throwElement.get('msg'));
            stack.forEach(v => {
                console.error(`${v.funcInfo? v.funcInfo.name : ""} at ${v.position}`);
            });
            process.exit(1);
        }
    }
}
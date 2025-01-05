import * as LEX from '../lexer/lexer.js'
import { Parser } from '../parser/parser.js';
import { evalStatements } from './eval.js';
import { Context } from './model.js';
import { buildIn } from '../sdk/util.js';

// var tokens = LEX.lex(`var a = 1; var b = 1; print("outer a=" + a + ", b=" + b ); {var a = 2; b = 2; print("inner a=" + a + ", b=" + b );} print("outer a=" + a + ", b=" + b );`);
// var tokens = LEX.lex(`var a = 100; var b =10; if (a > b) {print("a > b");} else {print("a <= b");}`);
// var tokens = LEX.lex(`for(var i = 0; i < 10; i++) { if (i == 3) {continue;} if (i==6) {break;} print(i); }`);
// var tokens = LEX.lex(`var add = function(a, b) { if (a > b) { return a + b; } return 111;};print(add(1, 2), add(2,1));`);
// var tokens = LEX.lex(`var fib = function(n) {if (n<2) { return n; } else {return  fib(n - 1) + fib(n - 2);} }; print(fib(10));`)
// var tokens = LEX.lex(`var fib = function(n) {if (n<2) { return n; } else {return  fib(n - 1) + fib(n - 2);} }; var fibFactory = function() { return fib;};  print(fibFactory()(10))`);
// var tokens = LEX.lex(`
//     class Person {
//         age = 10;
//         name;
//         constructor = function(name) {
//             this.name = name;
//         }
//         getAge = function() {
//             return this.age;
//         }
//         getName = function(prefix) {
//             return prefix + this.name;
//         }
//     }
//     var p = new Person("liming").getName("hello,");
//     print(p);
//     var p2 = new Person("zhangsan");
//     print(p2.getName("hello,"));
// `);
// var tokens = LEX.lex(`
//     class Person {
//         age = 10;
//         name;
//         constructor = function(name) {
//             this.name = name;
//         }
//         getAge = function() {
//             return this.age;
//         }
//         getName = function(prefix) {
//             return prefix + this.name;
//         }
//     }
//     class Woman extends Person {
//         constructor = function(name) {
//             super("Beautiful:" + name);
//         }
//         getAge = function() {
//             return super.getAge() - 5;
//         }
//     }
//     print(new Woman("Anna").getAge());
//     print(new Woman("Anna").getName("Mr."));
// `);

// var statements = new Parser(tokens).parse();
// evalStatements(statements);

function test1() {
    console.log("test1")
    var tokens = LEX.lex(`var a = 1; var b = 1; print("outer a=" + a + ", b=" + b ); {var a = 2; b = 2; print("inner a=" + a + ", b=" + b );} print("outer a=" + a + ", b=" + b );`);
    evalStatements(new Parser(tokens).parse(), new Context(), false);;
    var tokens = LEX.lex(`var a = 100; var b =10; if (a > b) {print("a > b");} else {print("a <= b");}`);
    evalStatements(new Parser(tokens).parse(), new Context(),  false);;
    var tokens = LEX.lex(`for(var i = 0; i < 10; i++) { if (i == 3) {continue;} if (i==6) {break;} print(i); }`);
    evalStatements(new Parser(tokens).parse(), new Context(),  false);;
    var tokens = LEX.lex(`var add = function(a, b) { if (a > b) { return a + b; } return 111;};print(add(1, 2), add(2,1));`);
    evalStatements(new Parser(tokens).parse(), new Context(),  false);;
    var tokens = LEX.lex(`var fib = function(n) {if (n<2) { return n; } else {return  fib(n - 1) + fib(n - 2);} }; print(fib(10));`)
    evalStatements(new Parser(tokens).parse(), new Context(),  false);;
    var tokens = LEX.lex(`var fib = function(n) {if (n<2) { return n; } else {return  fib(n - 1) + fib(n - 2);} }; var fibFactory = function() { return fib;};  print(fibFactory()(10))`);
    evalStatements(new Parser(tokens).parse(), new Context(),  false);;
}
function test2() {
    console.log("test2")
    var tokens = LEX.lex(`print("提供标准库数组操作：");
    var arr = [1, 2, 3];
    print("arr=", arr); 
    print("arr.length()=", arr.length());
    print("arr.at(2)=",arr.at(2));
    print("arr[2]=",arr[2]);
    arr.push(4); arr.push(5);
    print("push 4 5 => arr=", arr);
    print("pop =>", arr.pop(5), "arr=", arr);
    arr.unshift(0); arr.unshift(-1);
    print("unshift 0 -1 => arr=", arr);
    print("shift =>", arr.shift(), "arr=", arr);
    print("循环与判断流程控制");
    for (var i = 0; i < arr.length(); i++) {
        if (i % 2 == 1) { print("arr[" + i + "]=", arr[i]);}
    }`)
    evalStatements(new Parser(tokens).parse(), new Context(),  false);
}

function test3() {
    console.log("test3")
    var tokens = LEX.lex(`
        class Person {
            constructor = function(name, age) {
                super();
                this.name = name; this.age = age;
            }
            say = function() { print("name=" + this.name +", age=" + this.age); }
        }
        class Student extends Person {
            constructor = function(name, age, score) {
                super(name, age); this.score = score;
            }
            say = function() { super.say(); print("score=" + this.score);}
        }
        new Person("person1", 22).say();
        new Student("zhangsan", 18, 100).say();
        print("闭包与递归");
        var fibFactory = function() { 
            var fib = function(n) {if (n<2) { return n; } else {return  fib(n - 1) + fib(n - 2);} };
            return fib;
        };  
        print("斐波那契10 = ", fibFactory()(10));
        
        var p = new Person("person1", 22);
        p.age++;
        print(p.age);
        print(++p["age"]);
        p.age = 222;
        print(p.age);
        p['age'] = 333;
        print(p['age']);
        print(p.type);
        print(new Student("zhangsan", 18, 100).type);
    `);
    evalStatements(new Parser(tokens).parse(), new Context(),  false);
}
function test4() {
    console.log("test4")
    var tokens = LEX.lex(`
        var obj = {name: "liming" + 10, age: 22};
        print(obj.name.type);
        print(obj.type);
    `)
    evalStatements(new Parser(tokens).parse(), new Context(),  false);
    var tokens = LEX.lex(`
        var a = "1,2, 3  , a, b , ";
        print(a.split(","));
        print(a.toUpperCase());
        print(a.trim().replaceAll(" ", ""));
        a = a.trim().replaceAll(" ", "").replaceAll(",", "");
        print(a);
        print(a.substring(1, a.length() - 1));
        print(a.indexOf("3"));
        print(a.substring(0, 3).toNumber() + 100 == 223);
    `);
    evalStatements(new Parser(tokens).parse(), new Context(),  false);
    var tokens = LEX.lex(`
        // 你好
        var map = {};
        map["a"] = 1;
        map.b = 2;
        print(map);
        var newMap = {a: 3, b: 4};
        newMap.c = map;
        print(newMap);
        map.c = 100;
        print(newMap);
        print(newMap.c.b);
        `
    )
    evalStatements(new Parser(tokens).parse(), new Context(),  false);
}
var tokens = LEX.lex(`
print("123"[1]);
    `)
var statements = new Parser(tokens).parse();
// statements.forEach(s=>console.log(s.toString()))
var res = evalStatements(statements, new Context(),  false);
// console.log(res);
// test1();
// test2();
// test3();
// test4();
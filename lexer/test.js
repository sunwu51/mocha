import * as LEX from './lexer.js';
var tokens = LEX.lex(`
    var a = 1;
    var b = function(a, b) { return a + b; };
    var c = add(1, 2);
    class Person {
        age;
        name;
        constructor = function(name, age) {
            this.name = name;
            this.age = age;
        };
        toString = function() {
            return "name: " + this.name + ", age: " + this.age;
        };
    }
    print(new Person("frank", "10").toString());
    `)
console.log(tokens)

// 错误测试
var tokens = LEX.lex(`a + b
    你好`);

console.log(tokens)
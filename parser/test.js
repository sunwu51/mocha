import * as LEX from '../lexer/lexer.js';
import { Parser } from './parser.js';
var tokens = LEX.lex(`
    class Person {
        age = 18;
        constructor(name, age) {
            super();
            this.name = name;
        }
        sayName = function() {
            print(this.name + "," + this.age);
        }
    }

    var tom = new Person("Tom", 30);
    var lily = new Person("Lily"); 
    tom.sayName();
    lily.sayName();
    `)

// var tokens = LEX.lex(`function(a, b) { if (a> b) { for(;b<a;b++){print(b);}}};`);
var statements = new Parser(tokens).parse();
statements.forEach(stat => console.log(stat.toString()));
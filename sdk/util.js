import { NativeFunctionElement,ProtoElement,NumberElement,StringElement, BooleanElement, Element, nil} from "../eval/model.js";
import fs from 'fs';
import { RuntimeError } from "../common/error.js";
import request from 'sync-request';

export const buildIn = new Map();
// print函数
buildIn.set('print', new NativeFunctionElement(
    function(...args) {
        console.log(...args);
    }
));

// Math库
const math = new ProtoElement('Math');

math.set('random', new NativeFunctionElement(function(max) {
    if (max === undefined) max = 1;
    return new NumberElement(Math.random() * max);
}));

math.set('floor', new NativeFunctionElement(function(num) {
    return new NumberElement(Math.floor(num));
}));

math.set('ceil', new NativeFunctionElement(function(num) {
    return new NumberElement(Math.ceil(num));
}));

math.set('abs', new NativeFunctionElement(function(num) {
    return new NumberElement(Math.abs(num));
}));

buildIn.set("Math", math);

// File库
const file = new ProtoElement("File");

file.set("readFile", new NativeFunctionElement(function(filename, charset) {
    try {
        if (!charset) charset = 'UTF-8';
        return new StringElement(fs.readFileSync(filename, charset));
    } catch (e) {
        throw new RuntimeError(e.message)
    }
}));

file.set("writeFile", new NativeFunctionElement(function(filename, content) {
    try {
        fs.writeFileSync(filename, content);
    } catch (e) {
        throw new RuntimeError(e.message);
    }
}));


file.set("appendFile", new NativeFunctionElement(function(filename, content) {
    try {
        fs.appendFileSync(filename, content);
    } catch (e) {
        throw new RuntimeError(e.message);
    }
}));

buildIn.set('File', file);

// json<->element
const json = new ProtoElement("JSON");


function elementToJsonString(element) {
    if (!(element instanceof Element)) return "null";
    switch (element.type) {
        case "number":
        case "boolean":
        case "null":
        case "string":
            return JSON.stringify(obj.toString());
        default:
            var keys = element.map.keys;
            var content = keys.map(k => `"${k}": ${elementToJsonString(element.map.get(k))}`).join(", ")
            return `{ ${content} }`
    }
}

function jsonStringToElement(str) {
    if (!(str instanceof StringElement)) return nil;
    str = str.value;
    const obj = JSON.parse(str);
    return jsObjectToElement(obj)
}

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

function elementToJsObject(element) {
    if (element.toNative) {
        return element.toNative()
    }
    var keys = element.map.keys;
    var res = {};
    keys.forEach(k=>res[k] = elementToJsObject(element.map.get(k)))
    return res;
}

json.set("stringify", new NativeFunctionElement(function(obj, opt1, opt2) {
    return new StringElement(JSON.stringify(obj, opt1, opt2));
}));

json.set("parse", new NativeFunctionElement(function(str) {
    return jsObjectToElement(JSON.parse(str))
}));
buildIn.set("JSON", json);

// http
const http = new ProtoElement('Http')

http.set("request", new NativeFunctionElement(function(method, url, options){
    try {
        var res = request(method, url, options);
        var body = res.getBody().toString();
        var status = res.statusCode;
        return jsObjectToElement({body, status});
    } catch(e) {
        throw new RuntimeError("http request error " + e.message);
    }
}))


buildIn.set("Http", http);



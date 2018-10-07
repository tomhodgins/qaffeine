# qaffeine

Decaffeinate your JS-powered CSS stylesheets

## About

This project provides a way to parse extended CSS on the server and separate out the plain CSS from the JS-powered styles. This allows you to write CSS stylesheets that include styles supported by JavaScript plugins.

## Installation

The easiest way to install qaffeine is via npm:

```bash
npm install qaffeine
```

## Plugin Usage

Qaffeine is distributed as a CommonJS module, ready to be used with Node. The easiest way to import qaffeine into your project is with a line similar to this:

```js
const qaffeine = require('qaffeine')
```

### From Node

To use qaffeine in node scripts, you can run the function supplying the following arguments:

```js
qaffeine(plugins, inputCSS, outputJS, outputCSS)
```

- `plugins` is an object containing `stylesheet` and `rule` properties, optionally containing any stylesheet or rule plugins you want to make available to qaffeine.

- `inputCSS` is the filename of a CSS file you want to read
- `outputJS` is an optional argument that defines the filename of the JavaScript output
- `outputCSS` is an optional argument that defines the filename of any CSS output

#### Printing JS to the console

If the plugin is run with no `outputJS` or `outputCSS` supplied, the resulting JavaScript will be printed in the console/

#### Outputting JavaScript-only

If the plugin is run with `outputJS` defined, but no `outputCSS`, the resulting JavaScript will be written to a file at the location specified by `outputJS`, and also include a copy of all CSS styles.

#### Outputting CSS and JavaScript

This is the recommended way to use qaffeine. When both `outputJS` and `outputCSS` filenames are specified, all output JavaScript will be written to a file at the location specified by `outputJS`, and all output CSS will be written to a file at the location specified by `outputCSS`.

### Defining Plugins

To extend CSS with JavaScript functions, the two following possibilities exist: a rule plugin, or a stylesheet plugin.

A rule plugin accepts a CSS selector list, as well as any additional options, and lastly takes a CSS declaration list (everything inside the curly brackets `{}` after the selector list. A rule plugin must return a string that is a valid CSS stylesheet.

The other type of plugin is a stylesheet plugin, which takes 0 or more optional arguments, as well as one last argument that contains a CSS stylesheet as a string, and returns a string that is a valid CSS stylesheet.

If you had a plugin named `example()` that was loaded in the file where you're using qaffeine, suppose it looks like this:

```js
example(selector, rule) {
  return Math.random() > .5
  ? `${selector} { ${rule} }`
  : ''
}
```

That function would return a rule written for the supplied selector 50% of the time, and return nothing the other 50% of the time. A function like this could be given to qaffeine like this:

```js
qaffeine(
  {
    stylesheet: {},
    rule: {
      example
    }
  },
  'input.css'
)
```

This would load a file named `input.css`, process any rules that include `[--example]` in the selector, and would process them with our `example()` plugin.

On the other hand if we had a simple stylesheet plugin which takes a CSS stylesheet:

```js
function example(stylesheet) {
  return Math.random() > .5
  ? stylesheet
  : ''
}
```

This function would return the supplied stylesheet 50% of the time, and return nothing the other half of the time. We could pass this into qaffeine like this:

```js
qaffeine(
  {
    stylesheet: {
      example
    },
    rule: {}
  },
  'input.css'
)
```

This would load a file named `input.css`, process any `@supports` rules that include `--example()` in the condition, and would process them with our `example()` plugin.

By supplying plugins to qaffeine through this structure we can include rule and stylesheet plugins with the same name, as well as give functions a custom name for our use with qaffeine, even if the function has a different name in your JavaScript code. This makes for a flexible and comfortable stylesheet writing experience.

> To see an example of a node script using qaffeine, check out [index.js](https://github.com/tomhodgins/qaffeine-demo/blob/master/index.js) from the [qaffeine-demo](https://github.com/tomhodgins/qaffeine-demo) project

## Writing Extended Selectors for JS-Powered Rules

```css
selector, list, here[--custom="'extended', 'selector', 'here'"] { }
```

To extend a CSS rule for use with qaffeine, add a custom extended selector between the normal selector list and the declaration list, effectively splitting the rule in two: everything before the extended selector is your CSS selector list, and everything after your extended selector is part of the declaration list:

```css
selector <HERE> { property: value; }
```

To this location you can add an attribute selector `[]` that's written for any name you want, as long as it starts with a double dash `--`. If we were going to extend a rule with a plugin named `demo()`, we could add `[--demo]`.

```css
h1[--demo] {
  background: lime;
}
```

This would allow qaffeine to parse out the selector list `h1`, as well as the declaration list `background: lime;`, and write a call to our `demo()` function like this:

```js
demo('h1', 'background: lime;')
```

> To see an example of an extended selector qaffeine can read, check out [stylesheet.css](https://github.com/tomhodgins/qaffeine-demo/blob/master/src/stylesheet.css#L110) from the [qaffeine-demo](https://github.com/tomhodgins/qaffeine-demo) project:

```css
.minwidth[--element="{minWidth: 300}"] {
  border-color: limegreen;
}
```

## Writing Extended @supports Rules for JS-Powered At-rules

```css
@supports --custom('extended', 'at-rule', 'here') { }
```

To extend an `@supports` rule for use with qaffeine, add a custom extended selector between the `@supports` text and the group body rule.

```css
@supports <HERE> { }
```

To this location you can add any name you want, as long as it starts with a double dash `--`, and ends with a pair of brackets `()`. If we were going to extend a rule with a plugin named `demo()`, we could add `--demo()`.

```css
@supports --demo() {
  html {
    background: lime;
  }
}
```

This would allow qaffeine to parse out the group body rule and write a call to our `demo()` function like this:

```js
demo('html { background: lime; }')
```

> To see an example of an extended selector qaffeine can read, check out [stylesheet.css](https://github.com/tomhodgins/qaffeine-demo/blob/master/src/stylesheet.css#L114) from the [qaffeine-demo](https://github.com/tomhodgins/qaffeine-demo) project:

```css
@supports --element('.minwidth', {minWidth: 300}) {
  [--self] {
    background: greenyellow;
  }
}
```

## Known Compatible Stylesheet Plugins

- [jsincss-compare-attribute](https://github.com/tomhodgins/jsincss-compare-attribute)
- [jsincss-days](https://github.com/tomhodgins/jsincss-days)
- [jsincss-element-query](https://github.com/tomhodgins/jsincss-element-query)
- [jsincss-overflow](https://github.com/tomhodgins/jsincss-overflow)
- [jsincss-protocol-sniffer](https://github.com/tomhodgins/jsincss-protocol-sniffer)
- [jsincss-viewport](https://github.com/tomhodgins/jsincss-viewport)
- [qaffeine-demo: element query plugin, at-rule edition](https://github.com/tomhodgins/qaffeine-demo/blob/master/src/element-query-at-rule.js)
- [css-polyfill-patterns: dynamic values examples, at-rule examples](https://github.com/tomhodgins/css-polyfill-patterns)

## Known Compatible Rule Plugins

- [jsincss-ancestor-selector](https://github.com/tomhodgins/jsincss-ancestor-selector)
- [jsincss-auto-expand](https://github.com/tomhodgins/jsincss-auto-expand)
- [jsincss-closest-selector](https://github.com/tomhodgins/jsincss-closest-selector)
- [jsincss-custom-specificity](https://github.com/tomhodgins/jsincss-custom-specificity)
- [jsincss-elder-selector](https://github.com/tomhodgins/jsincss-elder-selector)
- [jsincss-element-units](https://github.com/tomhodgins/jsincss-element-units)
- [jsincss-first-selector](https://github.com/tomhodgins/jsincss-first-selector)
- [jsincss-frontend-variables](https://github.com/tomhodgins/jsincss-frontend-variables)
- [jsincss-has-selector](https://github.com/tomhodgins/jsincss-has-selector)
- [jsincss-last-selector](https://github.com/tomhodgins/jsincss-last-selector)
- [jsincss-parent-selector](https://github.com/tomhodgins/jsincss-parent-selector)
- [jsincss-previous-selector](https://github.com/tomhodgins/jsincss-previous-selector)
- [jsincss-regex-match](https://github.com/tomhodgins/jsincss-regex-match)
- [jsincss-scoped-eval](https://github.com/tomhodgins/jsincss-scoped-eval)
- [jsincss-string-match](https://github.com/tomhodgins/jsincss-string-match)
- [jsincss-xpath-selector](https://github.com/tomhodgins/jsincss-xpath-selector)
- [qaffeine-demo: element query plugin, selector edition](https://github.com/tomhodgins/qaffeine-demo/blob/master/src/element-query-selector.js)
- [css-polyfill-patterns: pseudo class examples, simple selector examples](https://github.com/tomhodgins/css-polyfill-patterns)

## More Reading

- [Qaffeine walkthrough video](https://www.youtube.com/watch?v=6pRRB1gXgPo)
- [Caffeinated Style Sheets talk slides [Web Unleashed 2018]](https://tomhodgins.com/caffeinated-style-sheets.pdf)
- [Qaffeine demo project](https://github.com/tomhodgins/qaffeine-demo)
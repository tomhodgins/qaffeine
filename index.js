// npm install jsincss puppeteer
const fs = require('fs')
const jsincss = require('jsincss')
const puppeteer = require('puppeteer')

module.exports = function(
  plugins = {},
  inputCSS = '',
  outputJS = '',
  outputCSS = ''
) {

  return (async () => {

    const browser = await puppeteer.launch()
    const page = await browser.newPage()

    // Load CSS in headless web browser
    await page.goto(`data:text/html,`, {waitUntil: 'networkidle2'})
    await page.addStyleTag({content: fs.readFileSync(inputCSS).toString()})

    const result = await page.evaluate(
      pluginStrings => {

        let plugins = {}

        pluginStrings
          .forEach(plugin => plugins[plugin[0]] = 'loaded')

        let output = {
          plugins: {},
          generic: [],
          custom: [],
          stylesheets: []
        }

        for (let i=0; i<document.styleSheets.length; i++) {

          for (let j=0; j<document.styleSheets[i].cssRules.length; j++) {

            const rule = document.styleSheets[i].cssRules[j]

            if (/^.*\[js-.*\]$/.test(rule.selectorText)) {

              let ast = {
                selector: /^(.*)\[js-.*\]$/
                  .exec(rule.selectorText)
                  .slice(1)
                  .toString()
                  .replace(/ $/, ' *')
                  || '*',
                pseudo: /^.*\[js-([^=]+)(?:=.*)?\]$/
                  .exec(rule.selectorText)
                  .slice(1)
                  .toString()
                  .replace(/-(\w)/g, (string, match) => match.toUpperCase()),
                args: /^.*\[js-[^=]+(?:="([^"]*)")?\]$/
                  .exec(rule.selectorText)
                  .slice(1)
                  .toString()
                  .replace(/([^,]),[^,]/g, (string, match) => `${match}\n`)
                  .replace(/,,/, ',')
                  .split('\n')
                  .filter(el => el),
                properties: Array.from(rule.style),
                declarations: rule.cssText
                  .substring(rule.selectorText.length)
                  .trim()
                  .slice(1, -1)
                  .trim()
              }

              if (plugins[ast.pseudo]) {

                document.styleSheets[i].deleteRule(j)
                j--

                output.plugins[ast.pseudo] = 'used'

                if (
                  ast.properties.includes('--js-selector')
                  && ast.properties.includes('--js-events')
                ) {

                  const customSelector = new RegExp(/--js-selector: ([^;]+);/).exec(ast.declarations)[1]
                  const customEvents = new RegExp(/--js-events: ([^;]+);/).exec(ast.declarations)[1]

                  output.custom.push(
                    ast.args && ast.args.length
                    ? `jsincss(() => ${ast.pseudo}('${ast.selector}', ${ast.args.map(arg => `'${arg}'`).join(', ')}, \`${ast.declarations}\`), ${customSelector}, ${customEvents})`
                    : `jsincss(() => ${ast.pseudo}('${ast.selector}', \`${ast.declarations}\`), ${customSelector}, ${customEvents})`
                  )

                } else {

                  output.generic.push(
                    ast.args && ast.args.length
                    ? `${ast.pseudo}('${ast.selector}', ${ast.args.map(arg => `'${arg}'`).join(', ')}, \`${ast.declarations}\`)`
                    : `${ast.pseudo}('${ast.selector}', \`${ast.declarations}\`)`
                  )

                }

              }

            }

          }

          let keptRules = ''

          for (var k=0; k<document.styleSheets[i].cssRules.length; k++) {

            let keptRule = document.styleSheets[i].cssRules[k]

            if (keptRule.type === 4) {

              output.media = keptRule

              for (var l=0; l<keptRule.cssRules.length; l++) {

                keptRules +=

`\n@media ${keptRule.media.mediaText} {
  ${keptRule.cssRules[l].cssText}
}
`

              }

            }

            if (keptRule.type === 1) {

              keptRules += keptRule.cssText + '\n'

            }

          }

          output.stylesheets.push(keptRules)

        }

        return output

      },
      Object.entries(plugins)
        .map(plugin => [plugin[0], 'hello'])
    )

    let file =

`// jsincss
const jsincss = ${jsincss.toString()}

// jsincss plugins
${
  Object.entries(result.plugins)
    .map(plugin => `const ${plugin[0]} = ${plugins[plugin[0]].toString()}`)
    .join('\n\n')
}

${result.generic.length ? `// JS-powered rules with default event listeners
jsincss(() =>

  [
${result.generic.map(func => new Function('return ' + func)).join(',\n')}
  ]
  .map(func => func())
  .join('')

)` : ''}

${result.custom.length ? `// JS-powered rules with custom event listeners
${result.custom.join('\n')}`: ''}`

    let renderedCSS = result.stylesheets.join('\n  ')

    if (outputCSS) {

      fs.writeFileSync(outputCSS, renderedCSS)

    } else {

      file +=

`// Original CSS
let style = document.createElement('style')

style.textContent = \`
${renderedCSS}\`

document.head.appendChild(style)`

    }

    if (outputJS) {

      fs.writeFileSync(outputJS, file)

    } else {

      console.log(file)

    }

    await browser.close()

  })()

}

// If run from CLI with arguments
if (process.argv[2] && process.argv[3]) {
  module.exports(
    (require(process.argv[2]) || {}), // plugins filename
    (process.argv[3] || ''), // input CSS filename
    (process.argv[4] || ''), // output JS filename
    (process.argv[5] || '') // output CSS filename
  )
}
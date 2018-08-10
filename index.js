// npm install jsincss puppeteer
const fs = require('fs')
const jsincss = require('jsincss')
const puppeteer = require('puppeteer')

module.exports = function(
  plugins = {
    stylesheet: {},
    rule: {}
  },
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
      plugins => {

        let output = {
          plugins: {
            stylesheet: {},
            rule: {}
          },
          generic: [],
          custom: [],
          css: []
        }

        for (let i=0; i<document.styleSheets.length; i++) {

          for (let j=0; j<document.styleSheets[i].cssRules.length; j++) {

            const rule = document.styleSheets[i].cssRules[j]

            // If JS-powered style rule
            if (rule.type === 1 && /--js-/.test(rule.selectorText)) {

              // selector[]
              const selector =
                /(.*)\[--js-.+\]/.test(rule.selectorText)
                && rule.selectorText.match(/(.*)\[--js-.+\]/)[1]
                || '*'

              // [plugin]
              const plugin = rule.selectorText.replace(/.*\[--js-([^=]+).*\]/, '$1')

              if (plugins.rule.includes(plugin)) {

                // [="(args)"]
                const args = /.*\[--js-.+="\((.*)\)"\]/.test(rule.selectorText)
                  && rule.selectorText.match(/.*\[--js-.+="\((.*)\)"\]/)[1] + ', '
                  || ''

                // { declarations }
                const declarations = rule.cssText
                  .substring(rule.selectorText.length)
                  .trim()
                  .slice(1, -1)
                  .trim()

                output.plugins.rule[plugin] = 'used'

                if (
                  Array.from(rule.style).includes('--selector')
                  && Array.from(rule.style).includes('--events')
                ) {

                const customSelector = new RegExp(/--selector: ([^;]+);/)
                  .exec(declarations)[1]
                
                const customEvents = new RegExp(/--events: ([^;]+);/)
                  .exec(declarations)[1]

                  output.custom.push(
                    `jsincss(() =>\n`
                    + '  ' + plugin + '(\n'
                    + '    `' + selector + '`,\n'
                    + (args.length
                      ? '    ' + args + '\n'
                      : '')
                    + '    `' + declarations + '`\n'
                    + '  ),\n'
                    + '  ' + customSelector + ',\n'
                    + '  ' + customEvents + '\n'
                    + ')'
                  )

                } else {

                  output.generic.push(
                    plugin + '(\n'
                    + '    `' + selector + '`,\n'
                    + (args.length
                      ? '    ' + args + '\n'
                      : '')
                    + '    `' + declarations + '`\n'
                    + '  )'

                  )

                }

              }

            // If JS-powered @supports rule
            } else if (rule.type === 12 && /--js-/.test(rule.conditionText)) {

              // plugin()
              const plugin = rule.conditionText.replace(
                /\(--js-([^)]+)\(.+\)\)/, 
                '$1'
              )

              if (plugins.stylesheet.includes(plugin)) {

                // (args)
                const args = /^\(--js-.*\((.*)\)\)/.test(rule.conditionText)
                  && rule.conditionText.replace(/\(--js-.*\((.*)\)\)/, '$1') + ', '
                  || ''

                // { body }
                const body = rule.cssText
                  .substring(`@supports `.length + rule.conditionText.length)
                  .trim()
                  .slice(1, -1)

                output.plugins.stylesheet[plugin] = 'used'

                if (body.includes('--selector') && body.includes('--events')) {

                  let customSelector = ''
                  let customEvents = ''

                  body.replace(
                    /--selector: ([^;]+);/g, 
                    (string, match) => customSelector = match
                  )

                  body.replace(
                    /--events: ([^;]+);/g, 
                    (string, match) => customEvents = match
                  )

                  output.custom.push(
                    'jsincss(() =>\n'
                    + '  ' + plugin + '(\n' 
                    + (args.length
                      ? '    ' + args + '\n'
                      : '')
                    + '    \`' + body
                    + '  \`),\n'
                    + '  ' + customSelector + ',\n'
                    + '  ' + customEvents + '\n'
                    + ')'
                  )

                } else {

                  output.generic.push(
                    plugin + '(\n' 
                    + (args.length
                      ? '    ' + args + '\n'
                      : '')
                    + '    \`\n'
                    + body + '\n'
                    + '  `\n'
                    + ')'
                  )

                }

              }

            // Otherwise pass rule through untouched
            } else {

              output.css.push(rule.cssText)

            }

          }

        }

        return output

      },
      {
        stylesheet: Object.keys(plugins.stylesheet),
        rule: Object.keys(plugins.rule)
      }
    )

    // Output JavaScript
    let file = ''

    // If plugins
    if (
      Object.keys(result.plugins.stylesheet).length
      || Object.keys(result.plugins.rule).length
    ) {

      file += '// jsincss\n'
              + `const jsincss = ${jsincss.toString()}\n`
              + '\n// jsincss plugins\n'

      if (Object.keys(result.plugins.stylesheet).length) {

        file += Object.keys(result.plugins.stylesheet)
          .map(plugin => `const ${plugin} = ${plugins.stylesheet[plugin].toString()}`)
          .join('')
          + '\n'

      }

      if (Object.keys(result.plugins.rule).length) {

        file += Object.keys(result.plugins.rule)
          .map(plugin => `\nconst ${plugin} = ${plugins.rule[plugin].toString()}`)
          .join('\n')
          + '\n'

      }

      file += '\n'

    }

    if (result.generic.length) {

      file += '\n// JS-powered rules with default event listeners\n'
              + 'jsincss(() =>\n'
              + '  [\n'
              + result.generic
                  .map(func => new Function('  return ' + func))
                  .join(',\n') + '\n'
              + '  ]\n'
              + '  .map(func => func())\n'
              + '  .join(``)\n'
              + ')\n'

    }

    if (result.custom.length) {

      file += '\n// JS-powered rules with custom event listeners\n'
              + result.custom.join('\n')

    }

    // Output CSS stylesheet
    let renderedCSS = result.css.join('\n')

    if (outputCSS) {

      fs.writeFileSync(outputCSS, renderedCSS)

    } else {

      file += '\n\n// Original CSS\n'
              + 'let style = document.createElement(`style`)\n\n'
              + 'style.textContent = \`\n'
              + renderedCSS.replace(/`/g, '\`') + '\n`\n\n'
              + 'document.head.appendChild(style)'

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
    (process.argv[3] || ''),          // input CSS filename
    (process.argv[4] || ''),          // output JS filename
    (process.argv[5] || '')           // output CSS filename
  )
}
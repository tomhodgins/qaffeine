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

        for (let stylesheet of document.styleSheets) {

          for (let rule of stylesheet.cssRules) {

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
                    + '  customStyleRule.' + plugin + '(\n'
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
                    'customStyleRule.' + plugin + '(\n'
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
                /\(\s*--js-([^(]+)\(.+\)\s*\)/, 
                '$1'
              )

              if (plugins.stylesheet.includes(plugin)) {

                // (args)
                const args = /^\(\s*--js-.*\((.*)\s*\)\s*\)/.test(rule.conditionText)
                  && rule.conditionText
                    .slice(1, -1)
                    .trim()
                    .replace(/[^(]+\((.*)\)/, '$1')
                    .trim()
                    + ', '
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
                    + '  customAtRule.' + plugin + '(\n' 
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
                    'customAtRule.' + plugin + '(\n' 
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

        file += 'let customAtRule = {}\n\n'
          + Object.keys(result.plugins.stylesheet)
            .map(plugin => `customAtRule.${plugin} = ${plugins.stylesheet[plugin].toString()}`)
            .join('\n')
          + '\n\n'

      }

      if (Object.keys(result.plugins.rule).length) {

        file += 'let customStyleRule = {}\n\n'
          + Object.keys(result.plugins.rule)
            .map(plugin => `customStyleRule.${plugin} = ${plugins.rule[plugin].toString()}`)
            .join('\n')
          + '\n\n'

      }

    }

    if (result.generic.length) {

      file += '// JS-powered rules with default event listeners\n'
              + 'jsincss(() =>\n'
              + '  [\n'
              + result.generic
                  .join(',\n') + '\n'
              + '  ]\n'
              + '  .join(\'\')\n'
              + ')\n\n'

    }

    if (result.custom.length) {

      file += '// JS-powered rules with custom event listeners\n'
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
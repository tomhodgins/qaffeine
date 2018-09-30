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

    // Exit if no CSS input specified
    if (!inputCSS || !fs.existsSync(inputCSS)) {

      if (!inputCSS) {

        console.error('Error: No CSS stylesheet filename specified as input')

      }

      if (inputCSS && !fs.existsSync(inputCSS)) {

        console.error(`Error: File named "${inputCSS}" cannot be found`)

      }

      process.exit(1)

    }

    // Launch Chrome on the command-line via Puppeteer
    const browser = await puppeteer.launch()
    const page = await browser.newPage()

    // Load CSS in a blank page in Chrome
    await page.goto(`data:text/html,`, {waitUntil: 'networkidle2'})
    await page.addStyleTag({content: fs.readFileSync(inputCSS).toString()})

    // Parse CSSOM and separate CSS from JS-powered styles
    const result = await page.evaluate(plugins => {

      const output = {
        plugins: {
          stylesheet: {},
          rule: {}
        },
        generic: [],
        custom: [],
        css: [],
        errors: []
      }

      // For each stylesheet in the CSSOM
      Array.from(document.styleSheets).forEach(stylesheet => {

        // For each rule in the stylesheet
        Array.from(stylesheet.cssRules).forEach(rule => {

          // If JS-powered style rule
          if (rule.type === 1 && rule.selectorText.includes('--')) {

            // selector[]
            const selector = /(.*)\[--.+\]/.test(rule.selectorText)
              && rule.selectorText.match(/(.*)\[--.+\]/)[1]
              || '*'

            // [plugin]
            const plugin = rule.selectorText
              .replace(/.*\[--([^=]+).*\]/, '$1')
              .replace(/-([a-z])/g, (string, match) => match.toUpperCase())

            // If we have a rule plugin with the same name
            if (plugins.rule.includes(plugin)) {

              // [="(args)"]
              const args = /.*\[--.+="(.*)"\]/.test(rule.selectorText)
                && rule.selectorText.match(/.*\[--.+="(.*)"\]/)[1] + ', '
                || ''

              // { declarations }
              const declarations = rule.cssText
                .substring(rule.selectorText.length)
                .trim()
                .slice(1, -1)
                .trim()

              // Remember that this plugin has been used
              output.plugins.rule[plugin] = 'used'

              // If rule defines custom --selector and --events properties
              if (
                Array.from(rule.style).includes('--selector')
                && Array.from(rule.style).includes('--events')
              ) {

                // Push a rule with custom events to output
                output.custom.push(
                  'jsincss(() =>\n'
                  + '  customStyleRule.' + plugin + '(\n'
                  + '    `' + selector + '`,\n'
                  + (args.length
                    ? '    ' + args + '\n'
                    : '')
                  + '    `' + declarations + '`\n'
                  + '  ),\n'
                  + '  ' + rule.style.getPropertyValue('--selector').trim() + ',\n'
                  + '  ' + rule.style.getPropertyValue('--events').trim() + '\n'
                  + ')'
                )

              } else {

                // Otherwise push a generic rule to output
                output.generic.push(
                  'customStyleRule.' + plugin + '(\n'
                  + '  `' + selector + '`,\n'
                  + (args.length
                    ? '  ' + args + '\n'
                    : '')
                  + '  `' + declarations + '`\n'
                  + ')'

                )

              }

            } else {

              output.errors.push(`No rule plugin named "${plugin}"`)
              output.css.push(rule.cssText)

            }

          // If JS-powered @supports rule
          } else if (rule.type === 12 && rule.conditionText.includes('--')) {

            // plugin()
            const plugin = rule.conditionText
              .replace(/--([^(]+)\(.+\)/, '$1')
              .replace(/-([a-z])/g, (string, match) => match.toUpperCase())

            // If we have an at-rule plugin with the same name
            if (plugins.stylesheet.includes(plugin)) {

              // (args)
              const args = /--[^(]+(.*)/.test(rule.conditionText)
                && rule.conditionText
                  .replace(/^[^(]*\((.*)\)$/, '$1')
                  .trim()
                  + ', '
                || ''

              // { body }
              const body = rule.cssText
                .substring(`@supports `.length + rule.conditionText.length)
                .trim()
                .slice(1, -1)

              // Remember that this plugin has been used
              output.plugins.stylesheet[plugin] = 'used'

              // If group body rule contains a top-level rule for [--options]
              // And that rule contains custom --selector and --events properties
              if (
                Array.from(rule.cssRules)
                  .find(rule => rule.selectorText === '[--options]')
                && ['--selector', '--events'].every(prop =>
                    Array.from(rule.cssRules)
                      .reverse()
                      .find(rule => rule.selectorText === '[--options]')
                      .style
                      .getPropertyValue(prop) !== null
                )
              ) {

                const props = Array.from(rule.cssRules)
                  .reverse()
                  .find(rule => rule.selectorText === '[--options]')
                  .style

                // Push a stylesheet with custom events to output
                output.custom.push(
                  'jsincss(() =>\n'
                  + '  customAtRule.' + plugin + '(\n' 
                  + (args.length
                    ? '    ' + args + '\n'
                    : '')
                  + '    `\n'
                  + '      ' + body.trim().replace(/\n/g, '\n    ') + '\n'
                  + '    `\n'
                  + '  ),\n'
                  + '  ' + props.getPropertyValue('--selector').trim() + ',\n'
                  + '  ' + props.getPropertyValue('--events').trim() + '\n'
                  + ')'
                )

              } else {

                // Otherwise push a generic stylesheet to output
                output.generic.push(
                  'customAtRule.' + plugin + '(\n' 
                  + (args.length
                    ? '  ' + args + '\n'
                    : '')
                  + '  `\n'
                  + '    ' + body.trim().replace(/\n/g, '\n  ') + '\n'
                  + '  `\n'
                  + ')'
                )

              }

            } else {

              output.errors.push(`No stylesheet plugin named "${plugin}"`)
              output.css.push(rule.cssText)

            }

          // Otherwise pass all non-JS-powered CSS rules through untouched to output
          } else {

            output.css.push(rule.cssText)

          }

        })

      })

      // Return all JS-powered rules, names of plugins used, and CSS
      return output

    },
    {
      stylesheet: Object.keys(plugins.stylesheet),
      rule: Object.keys(plugins.rule)
    })

    // Log errors
    result.errors.forEach(error => console.error(`Error: ${error}`))

    // Create JavaScript file to output
    let file = ''

    // If there were plugins used
    if (
      Object.keys(result.plugins.stylesheet).length
      || Object.keys(result.plugins.rule).length
    ) {

      // Add jsincss to JS file
      file += '// jsincss\n'
        + `const jsincss = ${jsincss.toString()}\n`
        + '\n// jsincss plugins\n'

      // Add any rule plugins used to JS file
      if (Object.keys(result.plugins.stylesheet).length) {

        file += 'const customAtRule = {}\n\n'
          + Object.keys(result.plugins.stylesheet)
            .map(plugin => `customAtRule.${plugin} = ${plugins.stylesheet[plugin].toString()}`)
            .join('\n')
          + '\n\n'

      }

      // Add any at-rule plugins used to JS file
      if (Object.keys(result.plugins.rule).length) {

        file += 'const customStyleRule = {}\n\n'
          + Object.keys(result.plugins.rule)
            .map(plugin => `customStyleRule.${plugin} = ${plugins.rule[plugin].toString()}`)
            .join('\n')
          + '\n\n'

      }

    }

    // Add any generic rules to JS file
    if (result.generic.length) {

      file += '// JS-powered rules with default event listeners\n'
        + 'jsincss(() =>\n'
        +'  [\n'
        + '    ' + result.generic.join(',\n').replace(/\n/gm, '\n    ') + '\n'
        + '  ].join(\'\')\n'
        + ')\n\n'

    }

    // Add rules with custom events to JS file
    if (result.custom.length) {

      file += '// JS-powered rules with custom event listeners\n'
        + result.custom.join('\n')

    }

    // Output CSS stylesheet
    let renderedCSS = result.css.join('\n')

    // If CSS output filename specified
    if (outputCSS) {

      // Write CSS file
      fs.writeFileSync(outputCSS, renderedCSS)

    } else {

      // Otherwise add CSS styles to JS file
      file += '\n\n// Original CSS\n'
        + 'const style = document.createElement(`style`)\n\n'
        + 'style.textContent = \`\n'
        + renderedCSS.replace(/`/g, '\`') + '\n`\n\n'
        + 'document.head.appendChild(style)'

    }

    // If JS output filename specified
    if (outputJS) {

      // Write JS file
      fs.writeFileSync(outputJS, file)

    } else {

      // Otherwise output JS file to console
      console.log(file)

    }

    // Close Chome
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
/* global jestPlaywright, browserName, deviceName */
const { getSkipFlag } = require('./lib/utils')

const DEBUG_OPTIONS = {
  launchType: 'LAUNCH',
  launchOptions: {
    headless: false,
    devtools: true,
  },
}

const runDebugTest = (jestTestType, ...args) => {
  const isConfigProvided = typeof args[0] === 'object'
  // TODO Looks wierd - need to be rewritten
  let options = DEBUG_OPTIONS
  if (isConfigProvided) {
    const {
      contextOptions,
      launchOptions = {},
      launchType = DEBUG_OPTIONS.launchType,
    } = args[0]
    // TODO Add function for deep objects merging
    options = {
      ...DEBUG_OPTIONS,
      launchType,
      launchOptions: { ...DEBUG_OPTIONS.launchOptions, ...launchOptions },
      contextOptions,
    }
  }

  jestTestType(args[isConfigProvided ? 1 : 0], async () => {
    const { browser, context, page } = await jestPlaywright._configSeparateEnv(
      options,
      true,
    )
    try {
      await args[isConfigProvided ? 2 : 1]({ browser, context, page })
    } finally {
      await browser.close()
    }
  })
}

it.jestPlaywrightDebug = (...args) => {
  runDebugTest(it, ...args)
}

it.jestPlaywrightDebug.only = (...args) => {
  runDebugTest(it.only, ...args)
}

it.jestPlaywrightDebug.skip = (...args) => {
  runDebugTest(it.skip, ...args)
}

const runConfigTest = (jestTypeTest, playwrightOptions, ...args) => {
  if (playwrightOptions.browser && playwrightOptions.browser !== browserName) {
    it.skip(...args)
  } else {
    jestTypeTest(args[0], async () => {
      const {
        browser,
        context,
        page,
      } = await jestPlaywright._configSeparateEnv(playwrightOptions)
      try {
        await args[1]({ browser, context, page })
      } finally {
        await browser.close()
      }
    })
  }
}

it.jestPlaywrightConfig = (playwrightOptions, ...args) => {
  runConfigTest(it, playwrightOptions, ...args)
}

it.jestPlaywrightConfig.only = (...args) => {
  runConfigTest(it.only, ...args)
}

it.jestPlaywrightConfig.skip = (...args) => {
  runConfigTest(it.skip, ...args)
}

const customSkip = (skipOption, type, ...args) => {
  const skipFlag = getSkipFlag(skipOption, browserName, deviceName)
  if (skipFlag) {
    global[type].skip(...args)
  } else {
    global[type](...args)
  }
}

// TODO Put information about changes in Readme before 1.3.0
it.jestPlaywrightSkip = (skipOption, ...args) => {
  customSkip(skipOption, 'it', ...args)
}

describe.jestPlaywrightSkip = (skipOption, ...args) => {
  customSkip(skipOption, 'describe', ...args)
}

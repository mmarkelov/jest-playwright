/* eslint-disable no-console, @typescript-eslint/no-unused-vars */
import type { Event, State } from 'jest-circus'
import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  Page,
} from 'playwright-core'
import type {
  BrowserType,
  ConfigDeviceType,
  ConfigParams,
  ConnectOptions,
  GenericBrowser,
  JestPlaywrightConfig,
  JestPlaywrightProjectConfig,
  Nullable,
  Playwright,
  TestPlaywrightConfigOptions,
} from '../types/global'
import {
  CHROMIUM,
  CONFIG_ENVIRONMENT_NAME,
  DEFAULT_CONFIG,
  FIREFOX,
  IMPORT_KIND_PLAYWRIGHT,
  PERSISTENT,
  LAUNCH,
} from './constants'
import {
  deepMerge,
  formatError,
  getBrowserOptions,
  getBrowserType,
  getDeviceBrowserType,
  getDeviceType,
  getPlaywrightInstance,
} from './utils'
import { saveCoverageOnPage, saveCoverageToFile } from './coverage'

const handleError = (error: Error): void => {
  process.emit('uncaughtException', error)
}

const KEYS = {
  CONTROL_C: '\u0003',
  CONTROL_D: '\u0004',
  ENTER: '\r',
}

const getBrowserPerProcess = async (
  playwrightInstance: GenericBrowser,
  browserType: BrowserType,
  config: JestPlaywrightConfig,
): Promise<Browser | BrowserContext> => {
  const { launchType, userDataDir, launchOptions, connectOptions } = config

  if (launchType === LAUNCH || launchType === PERSISTENT) {
    // https://github.com/mmarkelov/jest-playwright/issues/42#issuecomment-589170220
    if (browserType !== CHROMIUM && launchOptions?.args) {
      launchOptions.args = launchOptions.args.filter(
        (item: string) => item !== '--no-sandbox',
      )
    }

    const options = getBrowserOptions(browserType, launchOptions)

    if (launchType === LAUNCH) {
      return playwrightInstance.launch(options)
    }

    if (launchType === PERSISTENT) {
      return playwrightInstance.launchPersistentContext(userDataDir!, options)
    }
  }

  const options = getBrowserOptions(browserType, connectOptions)
  return playwrightInstance.connect(options)
}

const getDeviceConfig = (
  device: Nullable<ConfigDeviceType> | undefined,
  availableDevices: Playwright['devices'],
): BrowserContextOptions => {
  if (device) {
    if (typeof device === 'string') {
      const { defaultBrowserType, ...deviceProps } = availableDevices[device]
      return deviceProps
    } else {
      const { name, defaultBrowserType, ...deviceProps } = device
      return deviceProps
    }
  }
  return {}
}

const getDeviceName = (
  device: Nullable<ConfigDeviceType>,
): Nullable<string> => {
  let deviceName: Nullable<string> = null
  if (device != null) {
    if (typeof device === 'string') {
      deviceName = device
    } else {
      deviceName = device.name
    }
  }
  return deviceName
}

export const getPlaywrightEnv = (basicEnv = 'node'): unknown => {
  const RootEnv = require(basicEnv === 'node'
    ? 'jest-environment-node'
    : 'jest-environment-jsdom')

  return class PlaywrightEnvironment extends RootEnv {
    readonly _config: JestPlaywrightProjectConfig
    _jestPlaywrightConfig!: JestPlaywrightConfig

    constructor(config: JestPlaywrightProjectConfig) {
      super(config)
      this._config = config
    }

    _getSeparateEnvBrowserConfig(
      isDebug: boolean,
      config: TestPlaywrightConfigOptions,
    ): JestPlaywrightConfig {
      const { debugOptions } = this._jestPlaywrightConfig
      const defaultBrowserConfig: JestPlaywrightConfig = {
        ...DEFAULT_CONFIG,
        launchType: LAUNCH,
      }
      let resultBrowserConfig: JestPlaywrightConfig = deepMerge(
        defaultBrowserConfig,
        config,
      )
      if (isDebug) {
        if (debugOptions) {
          resultBrowserConfig = deepMerge(resultBrowserConfig, debugOptions)
        }
      } else {
        resultBrowserConfig = deepMerge(
          this._jestPlaywrightConfig,
          resultBrowserConfig,
        )
      }
      return resultBrowserConfig
    }

    _getSeparateEnvContextConfig(
      isDebug: boolean,
      config: TestPlaywrightConfigOptions,
      browserName: BrowserType,
      devices: Playwright['devices'],
    ): BrowserContextOptions {
      const { device, contextOptions } = config
      const { debugOptions } = this._jestPlaywrightConfig
      const deviceContextOptions: BrowserContextOptions = getDeviceConfig(
        device,
        devices,
      )
      let resultContextOptions: BrowserContextOptions = contextOptions || {}
      if (isDebug) {
        if (debugOptions?.contextOptions) {
          resultContextOptions = deepMerge(
            resultContextOptions,
            debugOptions.contextOptions!,
          )
        }
      } else {
        resultContextOptions = deepMerge(
          this._jestPlaywrightConfig.contextOptions!,
          resultContextOptions,
        )
      }
      resultContextOptions = deepMerge(
        deviceContextOptions,
        resultContextOptions,
      )
      return getBrowserOptions(browserName, resultContextOptions)
    }

    async setup(): Promise<void> {
      const { wsEndpoint, browserName, testEnvironmentOptions } = this._config
      this._jestPlaywrightConfig = testEnvironmentOptions[
        CONFIG_ENVIRONMENT_NAME
      ] as JestPlaywrightConfig
      const {
        connectOptions,
        collectCoverage,
        exitOnPageError,
        selectors,
        launchType,
        skipInitialization,
      } = this._jestPlaywrightConfig
      if (wsEndpoint) {
        this._jestPlaywrightConfig.connectOptions = {
          ...connectOptions,
          wsEndpoint,
        }
      }
      const browserType = getBrowserType(browserName)
      let contextOptions = getBrowserOptions(
        browserName,
        this._jestPlaywrightConfig.contextOptions,
      )
      const device = getDeviceType(this._config.device)
      const deviceName: Nullable<string> = getDeviceName(device)
      const {
        name,
        instance: playwrightInstance,
        devices,
      } = getPlaywrightInstance(browserType)

      if (name === IMPORT_KIND_PLAYWRIGHT) {
        const playwright = require('playwright')
        if (selectors) {
          await Promise.all(
            selectors.map(({ name, script }) =>
              playwright.selectors
                .register(name, script)
                .catch((e: Error): void => {
                  if (!e.toString().includes('has been already')) {
                    throw e
                  }
                }),
            ),
          )
        }
      }

      const deviceBrowserContextOptions = getDeviceConfig(device, devices)
      contextOptions = deepMerge(deviceBrowserContextOptions, contextOptions)
      if (browserType === FIREFOX && contextOptions.isMobile) {
        console.warn(formatError(`isMobile is not supported in ${FIREFOX}.`))
        delete contextOptions.isMobile
      }
      this.global.browserName = browserType
      this.global.deviceName = deviceName
      if (!skipInitialization) {
        const browserOrContext = await getBrowserPerProcess(
          playwrightInstance as GenericBrowser,
          browserType,
          this._jestPlaywrightConfig,
        )
        this.global.browser =
          launchType === PERSISTENT ? null : browserOrContext
        this.global.context =
          launchType === PERSISTENT
            ? browserOrContext
            : await this.global.browser.newContext(contextOptions)
        if (collectCoverage) {
          ;(this.global.context as BrowserContext).exposeFunction(
            'reportCodeCoverage',
            saveCoverageToFile,
          )
          ;(this.global.context as BrowserContext).addInitScript(() =>
            window.addEventListener('beforeunload', () => {
              // @ts-ignore
              reportCodeCoverage(window.__coverage__)
            }),
          )
        }
        this.global.page = await this.global.context.newPage()
        if (exitOnPageError) {
          this.global.page.on('pageerror', handleError)
        }
      }
      this.global.jestPlaywright = {
        configSeparateEnv: async (
          config: TestPlaywrightConfigOptions,
          isDebug = false,
        ): Promise<ConfigParams> => {
          const { device } = config
          const browserName =
            config.useDefaultBrowserType && device
              ? getDeviceBrowserType(device, devices)
              : config.browser || browserType
          const resultBrowserConfig: JestPlaywrightConfig = this._getSeparateEnvBrowserConfig(
            isDebug,
            config,
          )
          const resultContextOptions: BrowserContextOptions = this._getSeparateEnvContextConfig(
            isDebug,
            config,
            browserName,
            devices,
          )
          const { instance } = getPlaywrightInstance(browserName)
          const browser = await getBrowserPerProcess(
            instance as GenericBrowser,
            browserName,
            resultBrowserConfig,
          )
          const context = await (browser as Browser)!.newContext(
            resultContextOptions,
          )
          const page = await context!.newPage()
          return { browser, context, page }
        },
        resetPage: async (): Promise<void> => {
          const { context, page } = this.global
          try {
            if (page) {
              page.removeListener('pageerror', handleError)
              await page.close()
            }
            // eslint-disable-next-line no-empty
          } catch (e) {}

          this.global.page = await context.newPage()
          if (exitOnPageError) {
            this.global.page.addListener('pageerror', handleError)
          }
        },
        resetContext: async (newOptions?: ConnectOptions): Promise<void> => {
          const { browser, context } = this.global

          await context?.close()

          let newContextOptions = contextOptions

          if (newOptions) {
            newContextOptions = deepMerge(newContextOptions, newOptions)
          }

          this.global.context = await browser.newContext(newContextOptions)

          await this.global.jestPlaywright.resetPage()
        },
        resetBrowser: async (newOptions?: ConnectOptions): Promise<void> => {
          const { browser } = this.global

          await browser?.close()

          this.global.browser = await getBrowserPerProcess(
            playwrightInstance as GenericBrowser,
            browserType,
            this._jestPlaywrightConfig,
          )

          await this.global.jestPlaywright.resetContext(newOptions)

          await this.global.jestPlaywright.resetPage()
        },
        debug: async (): Promise<void> => {
          // Run a debugger (in case Playwright has been launched with `{ devtools: true }`)
          await this.global.page.evaluate(() => {
            // eslint-disable-next-line no-debugger
            debugger
          })
          // eslint-disable-next-line no-console
          console.log('\n\n🕵️‍  Code is paused, press enter to resume')
          // Run an infinite promise
          return new Promise((resolve) => {
            const { stdin } = process
            const listening = stdin.listenerCount('data') > 0
            const onKeyPress = (key: string): void => {
              if (Object.values(KEYS).includes(key)) {
                stdin.removeListener('data', onKeyPress)
                if (!listening) {
                  if (stdin.isTTY) {
                    stdin.setRawMode(false)
                  }
                  stdin.pause()
                }
                resolve()
              }
            }
            if (!listening) {
              if (stdin.isTTY) {
                stdin.setRawMode(true)
              }
              stdin.resume()
              stdin.setEncoding('utf8')
            }
            stdin.on('data', onKeyPress)
          })
        },
        saveCoverage: async (page: Page): Promise<void> =>
          saveCoverageOnPage(page, collectCoverage),
      }
    }

    async handleTestEvent(event: Event, state: State): Promise<void> {
      // Hack to set testTimeout for jestPlaywright debugging
      if (
        event.name === 'add_test' &&
        event.fn?.toString().includes('jestPlaywright.debug()')
      ) {
        // Set timeout to 4 days
        state.testTimeout = 4 * 24 * 60 * 60 * 1000
      }
    }

    async teardown(): Promise<void> {
      const { browser, context, page } = this.global
      const { collectCoverage } = this._jestPlaywrightConfig
      page?.removeListener('pageerror', handleError)
      if (collectCoverage) {
        await Promise.all(
          (context as BrowserContext).pages().map((p) =>
            p.close({
              runBeforeUnload: true,
            }),
          ),
        )
        // wait until coverage data was sent successfully to the exposed function
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      await browser?.close()

      await super.teardown()
    }
  }
}

export default getPlaywrightEnv()

import {
  Page,
  Browser,
  BrowserContext,
  BrowserType as PlaywrightBrowserType,
  ChromiumBrowser,
  FirefoxBrowser,
  WebKitBrowser,
} from 'playwright-core'

type BrowserType = 'chromium' | 'firefox' | 'webkit'

type GenericBrowser = PlaywrightBrowserType<
  WebKitBrowser | ChromiumBrowser | FirefoxBrowser
>

type SkipOption = {
  browsers: BrowserType[]
  devices?: string[] | RegExp
}

type ContextOptions = Parameters<GenericBrowser['connect']>[0]

interface JestPlaywright {
  skip: (
    options: SkipOption,
    name: string,
    fn?: jest.ProvidesCallback,
    timeout?: number,
  ) => void
  /**
   * Reset global.page
   *
   * ```ts
   * it('should reset page', async () => {
   *   await jestPlaywright.resetPage()
   * })
   * ```
   */
  resetPage: () => Promise<void>
  /**
   * Reset global.context
   *
   * ```ts
   * it('should reset context', async () => {
   *   await jestPlaywright.resetContext()
   * })
   * ```
   */
  resetContext: (newOptions?: ContextOptions) => Promise<void>
  /**
   * Reset global.browser, global.context, and global.page
   *
   * ```ts
   * it('should reset page', async () => {
   *   await jestPlaywright.resetBrowser()
   * })
   * ```
   */
  resetBrowser: (newOptions?: ContextOptions) => Promise<void>
  /**
   * Suspends test execution and gives you opportunity to see what's going on in the browser
   * - Jest is suspended (no timeout)
   * - A debugger instruction to the Browser, if Playwright has been launched with { devtools: true } it will stop
   *
   * ```ts
   * it('should put test in debug mode', async () => {
   *   await jestPlaywright.debug()
   * })
   * ```
   */
  debug: () => Promise<void>
  /**
   * Saves the coverage to the disk which will only work if `collectCoverage`
   * in `jest-playwright.config.js` file is set to true. The merged coverage file
   * is then available in `.nyc_output/coverage.json`. Mostly its needed in the
   * `afterEach` handler like that:
   *
   * ```ts
   * afterEach(async () => {
   *   await jestPlaywright.saveCoverage(page)
   * })
   * ```
   */
  saveCoverage: (page: Page) => Promise<void>
}

declare global {
  const browserName: BrowserType
  const deviceName: string | null
  const page: Page
  const browser: Browser
  const context: BrowserContext
  const jestPlaywright: JestPlaywright
}

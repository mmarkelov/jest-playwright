import { spawn, spawnSync, SpawnSyncOptions } from 'child_process'
import { checkBrowserEnv, readConfig, readPackage } from '../utils'
import { checkCommand, getLogMessage } from './utils'
import { PARALLEL, BrowserType } from '../constants'

const getSpawnOptions = (
  browser: BrowserType,
  device: string | null,
): SpawnSyncOptions => ({
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    BROWSER: browser,
    ...(device ? { DEVICE: device } : {}),
  },
})

const exec = ({
  sequence,
  browser,
  device = null,
  params,
}: {
  sequence: string
  browser: BrowserType
  device?: string | null
  params: string[]
}): void => {
  const options = getSpawnOptions(browser, device)
  if (sequence === PARALLEL) {
    const process = spawn('node', [`node_modules/.bin/jest ${params}`], options)
    process.on('close', status => {
      console.log(getLogMessage(browser, status, device))
    })
  } else {
    const { status } = spawnSync(
      'node',
      [`node_modules/.bin/jest ${params}`],
      options,
    )
    console.log(getLogMessage(browser, status, device))
  }
}

const runner = async (sequence: string, params: string[]): Promise<void> => {
  const { browsers = [], devices = [] } = await readConfig()
  checkCommand(browsers, devices)
  if (!browsers.length && devices.length) {
    const browser = await readPackage()
    // TODO Add check for browser
    devices.forEach(device => exec({ sequence, browser, device, params }))
  }
  if (browsers.length) {
    if (devices.length) {
      browsers.forEach(browser =>
        devices.forEach(device => exec({ sequence, browser, device, params })),
      )
    } else {
      browsers.forEach(browser => exec({ sequence, browser, params }))
    }
  }
}

export default runner

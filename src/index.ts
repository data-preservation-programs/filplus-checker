import { ApplicationFunction, Probot } from 'probot'
import { ApplicationFunctionOptions } from 'probot/lib/types'

const handler: ApplicationFunction = (app: Probot, options: ApplicationFunctionOptions): void => {
  app.log('Yay, the app was loaded!')
  app.log('options', options)
}

export = handler

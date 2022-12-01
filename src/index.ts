import { ApplicationFunction, Probot } from 'probot'
import { ApplicationFunctionOptions } from 'probot/lib/types'
import { parseIdentifiers } from './utils'
import CidChecker from './checker/CidChecker'
import { Pool } from 'pg'

const handler: ApplicationFunction = (app: Probot, options: ApplicationFunctionOptions): void => {
  const checker = new CidChecker(
    new Pool(), (str: string) => { app.log(str) }
  )

  app.log('Yay, the app was loaded!')
  app.log('options', options)

  app.on(['issue_comment.created'], async (context) => {
    app.log.info({ context })
    const { body } = context.payload.comment

    if (body.match(/Stats & Info for DataCap Allocation/i) != null) {
      const { notaryAddress, clientAddress, interplanetaryLink, datasetIssueLink } = parseIdentifiers(app, body)
      app.log.info({ notaryAddress, clientAddress, interplanetaryLink, datasetIssueLink })

      const result = await checker.check(context.payload.issue)

      const issueComment = context.issue({
        body: result
      })

      app.log.info({ issueComment })
      await context.octokit.issues.createComment(issueComment)
    }
  })
}

export = handler

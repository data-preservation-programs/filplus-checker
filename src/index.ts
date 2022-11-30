import { ApplicationFunction, Probot } from 'probot'
import { ApplicationFunctionOptions } from 'probot/lib/types'
import { parseIdentifiers } from './utils'

const handler: ApplicationFunction = (app: Probot, options: ApplicationFunctionOptions): void => {
  app.log('Yay, the app was loaded!')
  app.log('options', options)

  app.on(['issue_comment.created'], async (context) => {
    app.log.info({ context })
    const { body } = context.payload.comment

    if (body.match(/Stats & Info for DataCap Allocation/i) != null) {
      const { notaryAddress, clientAddress, interplanetaryLink, datasetIssueLink } = parseIdentifiers(app, body)

      app.log.info({ notaryAddress, clientAddress, interplanetaryLink, datasetIssueLink })

      const issueComment = context.issue({
        body: JSON.stringify({
          comment: 'Thanks for opening this issue!',
          notaryAddress,
          clientAddress,
          interplanetaryLink,
          datasetIssueLink
        })
      })

      app.log.info({ issueComment })
      await context.octokit.issues.createComment(issueComment)
    }
  })
}

export = handler

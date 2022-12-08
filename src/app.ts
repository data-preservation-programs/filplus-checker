import { ApplicationFunction, Probot } from 'probot'
import { ApplicationFunctionOptions } from 'probot/lib/types'
import { getCidChecker } from './Dependency'

const handler: ApplicationFunction = (app: Probot, _options: ApplicationFunctionOptions): void => {
  app.on(['issue_comment.created'], async (context) => {
    const { body } = context.payload.comment

    if (body.match(/Stats & Info for DataCap Allocation/i) != null) {
      const checker = getCidChecker(app.log)

      const result = await checker.check(context.payload)
      app.log({ body: result })
      const issueComment = context.issue({
        body: result
      })

      if (process.env.DRY_RUN !== 'true' && process.env.DRY_RUN !== '1') {
        await context.octokit.issues.createComment(issueComment)
      }
    }
  })
}

export = handler

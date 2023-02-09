import { ApplicationFunction, Probot } from 'probot'
import { ApplicationFunctionOptions } from 'probot/lib/types'
import { getCidChecker } from './Dependency'
import { Criteria } from './checker/CidChecker'

const handler: ApplicationFunction = (app: Probot, _options: ApplicationFunctionOptions): void => {
  app.on(['issues.labeled', 'issue_comment.created'], async (context) => {
    const otherAddresses: string[] = []
    if (context.payload.action === 'labeled') {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion,@typescript-eslint/no-non-null-asserted-optional-chain
      if (!process.env.TARGET_LABEL!.split(',').includes(context.payload.label?.name!)) {
        return
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    } else if (!context.payload.comment.body.trim().startsWith(process.env.TARGET_COMMENT!)) {
      return
    } else {
      const addresses = context.payload.comment.body.trim().split(/\s+/).slice(1).filter(s => s.match(/[0-9a-zA-Z]+/))
      otherAddresses.push(...addresses)
    }

    const criteria: Criteria[] = JSON.parse(process.env.CRITERIA ?? '[]')
    if (criteria.length === 0 || criteria.some(c =>
      c.lowReplicaThreshold === undefined ||
      c.maxDuplicationPercentage === undefined ||
      c.maxProviderDealPercentage === undefined ||
      c.maxPercentageForLowReplica === undefined)) {
      throw new Error('Invalid environment variable CRITERIA')
    }
    const checker = getCidChecker(app.log.child({ contextId: context.id }))
    const result = await checker.check(context.payload, criteria, otherAddresses)
    if (result === undefined) {
      app.log.info('No comment to post')
      return
    }
    app.log({ body: result })
    const issueComment = context.issue({
      body: result
    })

    if (process.env.DRY_RUN !== 'true' && process.env.DRY_RUN !== '1') {
      await context.octokit.issues.createComment(issueComment)
    }
  })
}

export = handler

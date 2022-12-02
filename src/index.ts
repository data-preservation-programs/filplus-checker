import { ApplicationFunction, Probot, ProbotOctokit } from 'probot'
import { ApplicationFunctionOptions } from 'probot/lib/types'
import { parseIdentifiers } from './utils'
import CidChecker, { FileUploadConfig } from './checker/CidChecker'
import { Pool } from 'pg'

const handler: ApplicationFunction = (app: Probot, options: ApplicationFunctionOptions): void => {
  const pool = new Pool()
  if (process.env.UPLOAD_REPO_OWNER === undefined ||
    process.env.UPLOAD_REPO_NAME === undefined ||
    process.env.UPLOAD_REPO_COMMITTER_NAME === undefined ||
    process.env.UPLOAD_TOKEN === undefined ||
    process.env.UPLOAD_REPO_COMMITTER_EMAIL === undefined) {
    throw new Error('UPLOAD_TOKEN, UPLOAD_REPO_OWNER, UPLOAD_REPO_NAME, UPLOAD_REPO_COMMITTER_NAME, UPLOAD_REPO_COMMITTER_EMAIL must be defined')
  }

  const fileUploadConfig: FileUploadConfig = {
    owner: process.env.UPLOAD_REPO_OWNER,
    repo: process.env.UPLOAD_REPO_NAME,
    branch: process.env.UPLOAD_REPO_BRANCH,
    committerName: process.env.UPLOAD_REPO_COMMITTER_NAME,
    committerEmail: process.env.UPLOAD_REPO_COMMITTER_EMAIL
  }

  const octokit = new ProbotOctokit({
    auth: {
      token: process.env.UPLOAD_TOKEN
    },
    log: app.log.child({ name: 'uploader-octokit' })
  })

  app.log('Yay, the app was loaded!')
  app.log('options', options)

  app.on(['issue_comment.created'], async (context) => {
    app.log.info({ context })
    const { body } = context.payload.comment

    if (body.match(/Stats & Info for DataCap Allocation/i) != null) {
      const { notaryAddress, clientAddress, interplanetaryLink, datasetIssueLink } = parseIdentifiers(app, body)
      app.log.info({ notaryAddress, clientAddress, interplanetaryLink, datasetIssueLink })

      const checker = new CidChecker(
        pool,
        octokit,
        fileUploadConfig,
        (str: string) => {
          app.log(str)
        }
      )

      const result = await checker.check(context.payload)

      const issueComment = context.issue({
        body: result
      })

      app.log.info({ issueComment })
      await context.octokit.issues.createComment(issueComment)
    }
  })
}

export = handler

import { Pool } from 'pg'
import { DeprecatedLogger } from 'probot/lib/types'
import CidChecker, { FileUploadConfig } from './checker/CidChecker'
import { Octokit } from '@octokit/core'

export const pool = new Pool()
export function getCidChecker (logger: DeprecatedLogger): CidChecker {
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
    committerEmail: process.env.UPLOAD_REPO_COMMITTER_EMAIL,
    searchRepo: 'filecoin-project/filecoin-plus-large-datasets'
  }

  const octokit = new Octokit({
    auth: process.env.UPLOAD_TOKEN,
    log: logger
  })

  return new CidChecker(
    pool,
    octokit,
    fileUploadConfig,
    (str: string) => {
      logger.info(str)
    }
  )
}

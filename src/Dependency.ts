import { Pool } from 'pg'
import { Logger } from 'pino'
import CidChecker, { FileUploadConfig } from './checker/CidChecker'
import { Octokit } from '@octokit/core'

export const pool = new Pool()
export function getCidChecker (logger: Logger): CidChecker {
  if (process.env.UPLOAD_REPO_OWNER === undefined ||
    process.env.UPLOAD_REPO_NAME === undefined ||
    process.env.UPLOAD_REPO_COMMITTER_NAME === undefined ||
    process.env.UPLOAD_TOKEN === undefined ||
    process.env.IPINFO_TOKEN === undefined ||
    process.env.UPLOAD_REPO_COMMITTER_EMAIL === undefined) {
    throw new Error('IPINFO_TOKEN, UPLOAD_TOKEN, UPLOAD_REPO_OWNER, UPLOAD_REPO_NAME, UPLOAD_REPO_COMMITTER_NAME, UPLOAD_REPO_COMMITTER_EMAIL must be defined')
  }

  const allocationBotId = parseInt(process.env.ALLOCATION_BOT_ID ?? '0')
  if (allocationBotId <= 0 || isNaN(allocationBotId)) {
    throw new Error('ALLOCATION_BOT_ID must be defined')
  }

  if (process.env.RETRIEVAL_BOT_MONGO_URL === undefined) {
    throw new Error('RETRIEVAL_BOT_MONGO_URL must be defined')
  }

  const fileUploadConfig: FileUploadConfig = {
    owner: process.env.UPLOAD_REPO_OWNER,
    repo: process.env.UPLOAD_REPO_NAME,
    branch: process.env.UPLOAD_REPO_BRANCH,
    committerName: process.env.UPLOAD_REPO_COMMITTER_NAME,
    committerEmail: process.env.UPLOAD_REPO_COMMITTER_EMAIL,
    searchRepoLarge: 'filecoin-project/filecoin-plus-large-datasets',
    searchRepo: 'filecoin-project/filecoin-plus-client-onboarding'
  }

  const octokit = new Octokit({
    auth: process.env.UPLOAD_TOKEN,
    log: logger
  })

  return new CidChecker(
    pool,
    octokit,
    fileUploadConfig,
    logger,
    process.env.IPINFO_TOKEN,
    allocationBotId
  )
}

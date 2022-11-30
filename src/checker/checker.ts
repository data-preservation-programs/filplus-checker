import { Octokit } from '@octokit/core'
import { Issue } from '@octokit/webhooks-types'
import { Pool } from 'pg'
import { StorageProviderDistribution } from './types'

export type TokenGenerator = () => string

export default class CidChecker {
  // Got from https://github.com/keyko-io/filecoin-verifier-tools/blob/master/utils/large-issue-parser.js line 41
  private static readonly RegexAddress = /[\n\r][ \t]*-\s*On-chain\s*address\s*for\s*first\s*allocation:[ \t]*([^\n\r]*)/m

  private static readonly DistributionQuery = `
      WITH miners AS (SELECT provider, SUM(piece_size) AS totalDealSize
                      FROM current_state,
                           client_mapping
                      WHERE client_address = ?
                        AND current_state.client = client_mapping.client
                        AND verified_deal = true
                        AND (slash_epoch < 0 OR slash_epoch > ?)
                        AND (sector_start_epoch > 0 AND sector_start_epoch < ?)
                        AND end_epoch > ?
                      GROUP BY provider)
      SELECT miners.provider, totalDealSize, country, region, city, latitude, longitude
      FROM miners
               LEFT OUTER JOIN active_miners ON miners.provider = active_miners.miner_id
      ORDER BY totalDealSize DESC`

  public constructor (
    private readonly sql: Pool,
    private readonly githubToken: TokenGenerator,
    private readonly oktokit: Octokit) {
  }

  private static getClientAddress (body: string): string {
    const matches = CidChecker.RegexAddress.exec(body)
    if (matches === null || matches.length < 2) {
      throw new Error('No client address found in the issue body')
    }

    return matches[1].trim()
  }

  private static getCurrentEpoch (): number {
    return Math.floor((Date.now() / 1000 - 1598306400) / 30)
  }

  private async getStorageProviderDistribution (client: string): Promise<StorageProviderDistribution[]> {
    const currentEpoch = CidChecker.getCurrentEpoch()
    const queryResult = await this.sql.query(
      CidChecker.DistributionQuery,
      [client, currentEpoch, currentEpoch, currentEpoch])
    const distributions = queryResult.rows as StorageProviderDistribution[]
    const total = distributions.reduce((acc, cur) => acc + cur.totalDealSize, 0)
    for (const distribution of distributions) {
      distribution.percentage = distribution.totalDealSize / total
    }
    return distributions
  }

  public async check (issue: Issue) {
    const clientAddress = CidChecker.getClientAddress(issue.body ?? '')
    const distributions = await this.getStorageProviderDistribution(clientAddress)
  }
}

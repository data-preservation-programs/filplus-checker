import { Issue, IssueCommentCreatedEvent } from '@octokit/webhooks-types'
import { Pool } from 'pg'
import {
  ApplicationInfo,
  CidSharing,
  ReplicationDistribution,
  ProviderDistribution,
  ProviderDistributionRow, ReplicationDistributionRow, CidSharingRow
} from './types'
import { parseIssue } from '../../dep/filecoin-verifier-tools/utils/large-issue-parser'
import { generateGfmTable } from './MarkdownUtils'
import xbytes from 'xbytes'
import emoji from 'node-emoji'
import { Octokit } from '@octokit/core'
import { randomUUID } from 'crypto'

export type TokenGenerator = () => string
export type Logger = (message: string) => void

export interface FileUploadConfig {
  token: string
  owner: string
  repo: string
  branch?: string
  committerName: string
  committerEmail: string
}

export default class CidChecker {
  private static readonly ProviderDistributionQuery = `
      WITH miners AS (SELECT provider, SUM(piece_size) AS total_deal_size
                      FROM current_state,
                           client_mapping
                      WHERE client_address = $1
                        AND current_state.client = client_mapping.client
                        AND verified_deal = true
                        AND slash_epoch < 0
                        AND (sector_start_epoch > 0 AND sector_start_epoch < $2)
                        AND end_epoch > $2
                      GROUP BY provider)
      SELECT miners.provider, total_deal_size, country, region, city, latitude, longitude
      FROM miners
               LEFT OUTER JOIN active_miners ON miners.provider = active_miners.miner_id
      ORDER BY total_deal_size DESC`

  private static readonly ReplicaDistributionQuery = `
      WITH replicas AS (SELECT COUNT(*) AS num_of_replicas, SUM(piece_size) AS total_deal_size, piece_cid
                        FROM current_state,
                             client_mapping
                        WHERE client_address = $1
                          AND current_state.client = client_mapping.client
                          AND verified_deal = true
                          AND slash_epoch < 0
                          AND (sector_start_epoch > 0 AND sector_start_epoch < $2)
                          AND end_epoch > $2
                        GROUP BY piece_cid)
      SELECT SUM(total_deal_size) AS total_deal_size, num_of_replicas::INT
      FROM replicas
      GROUP BY num_of_replicas
      ORDER BY num_of_replicas ASC`

  private static readonly CidSharingQuery = `
      WITH cids AS (SELECT DISTINCT piece_cid
                    FROM current_state,
                         client_mapping
                    WHERE client_address = $1
                      AND current_state.client = client_mapping.client
                      AND verified_deal = true)
      SELECT SUM(piece_size)                              AS total_deal_size,
             COUNT(DISTINCT current_state.piece_cid)::INT AS unique_cid_count,
             client_address                               as other_client_address
      FROM cids,
           current_state,
           client_mapping
      WHERE cids.piece_cid = current_state.piece_cid
        AND current_state.client = client_mapping.client
        AND client_address != $1
      GROUP BY client_address
      ORDER BY total_deal_size DESC`

  private readonly octokit: Octokit

  public constructor (
    private readonly sql: Pool,
    public readonly appOctokit: Octokit,
    private readonly fileUploadConfig: FileUploadConfig,
    private readonly logger: Logger) {
    this.octokit = new Octokit({ auth: fileUploadConfig.token })
  }

  private static getProjectNameFromTitle (titleStr: string): string {
    let title = titleStr.replace(/\[DataCap\s*Application\]/i, '')
    const splitted = title.trim().split('-')
    if (splitted.length >= 2) {
      title = splitted.slice(1).join('-')
    }
    title = title.trim()
    if (title.startsWith('<') && title.endsWith('>')) {
      title = title.substring(1, title.length - 1)
    }
    return title
  }

  private static getApplicationInfo (issue: Issue): ApplicationInfo {
    const parseResult = parseIssue(issue.body ?? '')
    if (!parseResult.correct) {
      throw new Error(`Invalid issue body.\n  errorMessage: ${parseResult.errorMessage}\n  errorDetails: ${parseResult.errorDetails}`)
    }

    return {
      clientAddress: parseResult.address,
      organizationName: parseResult.name,
      projectName: CidChecker.getProjectNameFromTitle(issue.title)
    }
  }

  private static getCurrentEpoch (): number {
    return Math.floor((Date.now() / 1000 - 1598306400) / 30)
  }

  private async getStorageProviderDistribution (client: string): Promise<ProviderDistribution[]> {
    const currentEpoch = CidChecker.getCurrentEpoch()
    const queryResult = await this.sql.query(
      CidChecker.ProviderDistributionQuery,
      [client, currentEpoch])
    const distributions = queryResult.rows as ProviderDistribution[]
    const total = distributions.reduce((acc, cur) => acc + parseFloat(cur.total_deal_size), 0)
    for (const distribution of distributions) {
      distribution.percentage = parseFloat(distribution.total_deal_size) / total
    }
    return distributions
  }

  private async getReplicationDistribution (client: string): Promise<ReplicationDistribution[]> {
    const currentEpoch = CidChecker.getCurrentEpoch()
    const queryResult = await this.sql.query(
      CidChecker.ReplicaDistributionQuery,
      [client, currentEpoch])
    const distributions = queryResult.rows as ReplicationDistribution[]
    const total = distributions.reduce((acc, cur) => acc + parseFloat(cur.total_deal_size), 0)
    for (const distribution of distributions) {
      distribution.percentage = parseFloat(distribution.total_deal_size) / total
    }
    return distributions
  }

  private async getCidSharing (client: string): Promise<CidSharing[]> {
    const queryResult = await this.sql.query(
      CidChecker.CidSharingQuery,
      [client])
    const sharing = queryResult.rows as CidSharing[]
    return sharing
  }

  private async uploadFile (path: string, base64Content: string, commitMessage: string): Promise<string> {
    const { owner, repo } = this.fileUploadConfig
    const response = await this.octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner,
      repo,
      path,
      message: commitMessage,
      content: base64Content,
      committer: {
        name: this.fileUploadConfig.committerName,
        email: this.fileUploadConfig.committerEmail
      }
    })
    if (response.status !== 201) {
      // https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28#create-or-update-file-contents--status-codes
      throw new Error(`Failed to upload file. status: ${response.status}`)
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return response.data.content!.download_url!
  }

  private getImageForProviderDistribution (_providerDistributions: ProviderDistribution[]): string {
    return 'iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAApgAAAKYB3X3/OAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAANCSURBVEiJtZZPbBtFFMZ/M7ubXdtdb1xSFyeilBapySVU8h8OoFaooFSqiihIVIpQBKci6KEg9Q6H9kovIHoCIVQJJCKE1ENFjnAgcaSGC6rEnxBwA04Tx43t2FnvDAfjkNibxgHxnWb2e/u992bee7tCa00YFsffekFY+nUzFtjW0LrvjRXrCDIAaPLlW0nHL0SsZtVoaF98mLrx3pdhOqLtYPHChahZcYYO7KvPFxvRl5XPp1sN3adWiD1ZAqD6XYK1b/dvE5IWryTt2udLFedwc1+9kLp+vbbpoDh+6TklxBeAi9TL0taeWpdmZzQDry0AcO+jQ12RyohqqoYoo8RDwJrU+qXkjWtfi8Xxt58BdQuwQs9qC/afLwCw8tnQbqYAPsgxE1S6F3EAIXux2oQFKm0ihMsOF71dHYx+f3NND68ghCu1YIoePPQN1pGRABkJ6Bus96CutRZMydTl+TvuiRW1m3n0eDl0vRPcEysqdXn+jsQPsrHMquGeXEaY4Yk4wxWcY5V/9scqOMOVUFthatyTy8QyqwZ+kDURKoMWxNKr2EeqVKcTNOajqKoBgOE28U4tdQl5p5bwCw7BWquaZSzAPlwjlithJtp3pTImSqQRrb2Z8PHGigD4RZuNX6JYj6wj7O4TFLbCO/Mn/m8R+h6rYSUb3ekokRY6f/YukArN979jcW+V/S8g0eT/N3VN3kTqWbQ428m9/8k0P/1aIhF36PccEl6EhOcAUCrXKZXXWS3XKd2vc/TRBG9O5ELC17MmWubD2nKhUKZa26Ba2+D3P+4/MNCFwg59oWVeYhkzgN/JDR8deKBoD7Y+ljEjGZ0sosXVTvbc6RHirr2reNy1OXd6pJsQ+gqjk8VWFYmHrwBzW/n+uMPFiRwHB2I7ih8ciHFxIkd/3Omk5tCDV1t+2nNu5sxxpDFNx+huNhVT3/zMDz8usXC3ddaHBj1GHj/As08fwTS7Kt1HBTmyN29vdwAw+/wbwLVOJ3uAD1wi/dUH7Qei66PfyuRj4Ik9is+hglfbkbfR3cnZm7chlUWLdwmprtCohX4HUtlOcQjLYCu+fzGJH2QRKvP3UNz8bWk1qMxjGTOMThZ3kvgLI5AzFfo379UAAAAASUVORK5CYII='
  }

  private getImageForReplicationDistribution (_replicationDistributions: ReplicationDistribution[]): string {
    return 'iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAApgAAAKYB3X3/OAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAANCSURBVEiJtZZPbBtFFMZ/M7ubXdtdb1xSFyeilBapySVU8h8OoFaooFSqiihIVIpQBKci6KEg9Q6H9kovIHoCIVQJJCKE1ENFjnAgcaSGC6rEnxBwA04Tx43t2FnvDAfjkNibxgHxnWb2e/u992bee7tCa00YFsffekFY+nUzFtjW0LrvjRXrCDIAaPLlW0nHL0SsZtVoaF98mLrx3pdhOqLtYPHChahZcYYO7KvPFxvRl5XPp1sN3adWiD1ZAqD6XYK1b/dvE5IWryTt2udLFedwc1+9kLp+vbbpoDh+6TklxBeAi9TL0taeWpdmZzQDry0AcO+jQ12RyohqqoYoo8RDwJrU+qXkjWtfi8Xxt58BdQuwQs9qC/afLwCw8tnQbqYAPsgxE1S6F3EAIXux2oQFKm0ihMsOF71dHYx+f3NND68ghCu1YIoePPQN1pGRABkJ6Bus96CutRZMydTl+TvuiRW1m3n0eDl0vRPcEysqdXn+jsQPsrHMquGeXEaY4Yk4wxWcY5V/9scqOMOVUFthatyTy8QyqwZ+kDURKoMWxNKr2EeqVKcTNOajqKoBgOE28U4tdQl5p5bwCw7BWquaZSzAPlwjlithJtp3pTImSqQRrb2Z8PHGigD4RZuNX6JYj6wj7O4TFLbCO/Mn/m8R+h6rYSUb3ekokRY6f/YukArN979jcW+V/S8g0eT/N3VN3kTqWbQ428m9/8k0P/1aIhF36PccEl6EhOcAUCrXKZXXWS3XKd2vc/TRBG9O5ELC17MmWubD2nKhUKZa26Ba2+D3P+4/MNCFwg59oWVeYhkzgN/JDR8deKBoD7Y+ljEjGZ0sosXVTvbc6RHirr2reNy1OXd6pJsQ+gqjk8VWFYmHrwBzW/n+uMPFiRwHB2I7ih8ciHFxIkd/3Omk5tCDV1t+2nNu5sxxpDFNx+huNhVT3/zMDz8usXC3ddaHBj1GHj/As08fwTS7Kt1HBTmyN29vdwAw+/wbwLVOJ3uAD1wi/dUH7Qei66PfyuRj4Ik9is+hglfbkbfR3cnZm7chlUWLdwmprtCohX4HUtlOcQjLYCu+fzGJH2QRKvP3UNz8bWk1qMxjGTOMThZ3kvgLI5AzFfo379UAAAAASUVORK5CYII='
  }

  public async check (event: IssueCommentCreatedEvent): Promise<string> {
    const { issue, repository } = event
    this.logger(`Checking issue #${issue.number}...`)
    const applicationInfo = CidChecker.getApplicationInfo(issue)
    this.logger(`Retrieved Application Info: ${JSON.stringify(applicationInfo)}`)
    const [providerDistributions, replicationDistributions, cidSharing] = await Promise.all([
      this.getStorageProviderDistribution(applicationInfo.clientAddress),
      this.getReplicationDistribution(applicationInfo.clientAddress),
      this.getCidSharing(applicationInfo.clientAddress)])
    this.logger(`Retrieved Provider Distribution: ${JSON.stringify(providerDistributions)}`)
    this.logger(`Retrieved Replication Distribution: ${JSON.stringify(replicationDistributions)}`)
    this.logger(`Retrieved CID Sharing: ${JSON.stringify(cidSharing)}`)

    const providerDistributionRows: ProviderDistributionRow[] = providerDistributions.map(distribution => {
      const totalDealSize = xbytes(parseFloat(distribution.total_deal_size), { iec: true })
      let location = [distribution.city, distribution.region, distribution.country].filter(x => x).join(', ')
      if (location === '') {
        location = emoji.emojify(':warning: Unknown')
      }
      return {
        provider: distribution.provider,
        totalDealSize,
        location,
        percentage: `${(distribution.percentage * 100).toFixed(2)}%`
      }
    })

    const replicationDistributionRows: ReplicationDistributionRow[] = replicationDistributions.map(distribution => {
      const totalDealSize = xbytes(parseFloat(distribution.total_deal_size), { iec: true })
      return {
        numOfReplica: distribution.num_of_replicas,
        totalDealSize,
        percentage: `${(distribution.percentage * 100).toFixed(2)}%`
      }
    })

    const cidSharingRows: CidSharingRow[] = cidSharing.map(share => {
      const totalDealSize = xbytes(parseFloat(share.total_deal_size), { iec: true })
      return {
        otherClientAddress: share.other_client_address,
        totalDealSize,
        uniqueCidCount: share.unique_cid_count.toLocaleString('en-US')
      }
    })

    const providerDistributionImage = this.getImageForProviderDistribution(providerDistributions)
    const replicationDistributionImage = this.getImageForReplicationDistribution(replicationDistributions)
    const providerDistributionImageUrl = await this.uploadFile(
      `${repository.full_name}/issues/${issue.id}/${randomUUID()}.png`,
      providerDistributionImage,
      `Upload provider distribution image for issue #${issue.id} of ${repository.full_name}`)
    const replicationDistributionImageUrl = await this.uploadFile(
      `${repository.full_name}/issues/${issue.id}/${randomUUID()}.png`,
      replicationDistributionImage,
      `Upload replication distribution image for issue #${issue.id} of ${repository.full_name}`)

    const content: string[] = []
    content.push('## DataCap and CID Checker Report')
    content.push(` - Organization: \`${applicationInfo.organizationName}\``)
    content.push(` - Project: \`${applicationInfo.projectName}\``)
    content.push(` - Client: \`${applicationInfo.clientAddress}\``)
    content.push('### Storage Provider Distribution')
    content.push(generateGfmTable(providerDistributionRows,
      [
        ['provider', { name: 'Provider', align: 'l' }],
        ['totalDealSize', { name: 'Total Deals Made', align: 'r' }],
        ['location', { name: 'Location', align: 'r' }],
        ['percentage', { name: 'Percentage', align: 'r' }]
      ]))
    content.push('')
    content.push(`![Provider Distribution](${providerDistributionImageUrl})`)
    content.push('### Deal Data Replication')
    content.push(generateGfmTable(replicationDistributionRows, [
      ['numOfReplica', { name: 'Number of Replicas', align: 'r' }],
      ['totalDealSize', { name: 'Total Deals Made', align: 'r' }],
      ['percentage', { name: 'Percentage', align: 'r' }]
    ]))
    content.push('')
    content.push(`![Replication Distribution](${replicationDistributionImageUrl})`)
    content.push('### Deal Data Shared with other Clients')
    content.push(generateGfmTable(cidSharingRows, [
      ['otherClientAddress', { name: 'Other Client', align: 'r' }],
      ['totalDealSize', { name: 'Total Deals Made', align: 'r' }],
      ['uniqueCidCount', { name: 'Unique CIDs', align: 'r' }]
    ]))

    content.push('')
    return content.join('\n')
  }
}

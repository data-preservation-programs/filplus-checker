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
import { generateGfmTable } from './markdown_utils'
import xbytes from 'xbytes'
import emoji from 'node-emoji'
import { randomUUID } from 'crypto'
import retry from 'async-retry'
import { Octokit } from '@octokit/core'
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods'

export type Logger = (message: string) => void

export interface FileUploadConfig {
  owner: string
  repo: string
  branch?: string
  committerName: string
  committerEmail: string
  searchRepo: string
}

export default class CidChecker {
  private static readonly ProviderDistributionQuery = `
      WITH miner_pieces AS (SELECT provider,
                                   piece_cid,
                                   SUM(piece_size) AS total_deal_size,
                                   MIN(piece_size) AS piece_size
                            FROM current_state,
                                 client_mapping
                            WHERE client_address = $1
                              AND current_state.client = client_mapping.client
                              AND verified_deal = true
                              AND slash_epoch < 0
                              AND (sector_start_epoch > 0 AND sector_start_epoch < $2)
                              AND end_epoch > $2
                            GROUP BY provider, piece_cid),
           miners AS (SELECT provider,
                             SUM(total_deal_size) AS total_deal_size,
                             SUM(piece_size)      AS unique_data_size
                      FROM miner_pieces
                      GROUP BY provider)
      SELECT miners.provider,
             total_deal_size,
             unique_data_size,
             total_deal_size::FLOAT / unique_data_size AS duplication_factor,
             country,
             region,
             city,
             latitude,
             longitude
      FROM miners
               LEFT OUTER JOIN active_miners ON miners.provider = active_miners.miner_id
      ORDER BY total_deal_size DESC`

  private static readonly ReplicaDistributionQuery = `
      WITH replicas AS (SELECT COUNT(DISTINCT provider) AS num_of_replicas,
                               SUM(piece_size)          AS total_deal_size,
                               MAX(piece_size)          AS piece_size,
                               piece_cid
                        FROM current_state,
                             client_mapping
                        WHERE client_address = $1
                          AND current_state.client = client_mapping.client
                          AND verified_deal = true
                          AND slash_epoch < 0
                          AND (sector_start_epoch > 0 AND sector_start_epoch < $2)
                          AND end_epoch > $2
                        GROUP BY piece_cid)
      SELECT SUM(total_deal_size) AS total_deal_size,
             SUM(piece_size)      AS unique_data_size,
             num_of_replicas::INT
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

  public constructor (
    private readonly sql: Pool,
    private readonly octokit: Octokit,
    private readonly fileUploadConfig: FileUploadConfig,
    private readonly logger: Logger) {
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
      projectName: CidChecker.getProjectNameFromTitle(issue.title),
      url: issue.html_url
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
    type Params = RestEndpointMethodTypes['repos']['createOrUpdateFileContents']['parameters']
    type Response = RestEndpointMethodTypes['repos']['createOrUpdateFileContents']['response']
    const params: Params = {
      owner,
      repo,
      path,
      message: commitMessage,
      content: base64Content,
      committer: {
        name: this.fileUploadConfig.committerName,
        email: this.fileUploadConfig.committerEmail
      }
    }
    const response: Response = await this.octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', params)
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

  private async findIssueForClient (client: string): Promise<ApplicationInfo[]> {
    type Params = RestEndpointMethodTypes['search']['issuesAndPullRequests']['parameters']
    type Response = RestEndpointMethodTypes['search']['issuesAndPullRequests']['response']
    const params: Params = {
      q: `repo:${this.fileUploadConfig.searchRepo} is:issue ${client}`
    }
    const response: Response = await this.octokit.request('GET /search/issues', params)

    const result = []
    for (const item of response.data.items) {
      const issue = item as Issue
      const info = CidChecker.getApplicationInfo(issue)
      if (info.clientAddress === client) {
        result.push(info)
      }
    }

    return result
  }

  public async check (event: IssueCommentCreatedEvent): Promise<string> {
    const { issue, repository } = event
    this.logger(`Checking issue #${issue.number}...`)
    const applicationInfo = CidChecker.getApplicationInfo(issue)
    this.logger(`Retrieved Application Info: ${JSON.stringify(applicationInfo)}`)
    const [providerDistributions, replicationDistributions, cidSharing] = await Promise.all([
      retry(async () => {
        return await this.getStorageProviderDistribution(applicationInfo.clientAddress)
      }, { retries: 3 }),
      retry(async () => {
        return await this.getReplicationDistribution(applicationInfo.clientAddress)
      }, { retries: 3 }),
      retry(async () => {
        return await this.getCidSharing(applicationInfo.clientAddress)
      }, { retries: 3 })
    ])
    this.logger(`Retrieved Provider Distribution: ${JSON.stringify(providerDistributions)}`)
    this.logger(`Retrieved Replication Distribution: ${JSON.stringify(replicationDistributions)}`)
    this.logger(`Retrieved CID Sharing: ${JSON.stringify(cidSharing)}`)

    const providerDistributionRows: ProviderDistributionRow[] = providerDistributions.map(distribution => {
      const totalDealSize = xbytes(parseFloat(distribution.total_deal_size), { iec: true })
      const uniqueDataSize = xbytes(parseFloat(distribution.unique_data_size), { iec: true })
      let location = [distribution.city, distribution.region, distribution.country].filter(x => x).join(', ')
      if (location === '' || location == null) {
        location = 'Unknown'
      }
      return {
        provider: `[${distribution.provider}](https://filfox.info/en/address/${distribution.provider})`,
        totalDealSize,
        uniqueDataSize,
        location,
        percentage: `${(distribution.percentage * 100).toFixed(2)}%`,
        duplicationFactor: distribution.duplication_factor.toFixed(2)
      }
    })

    const replicationDistributionRows: ReplicationDistributionRow[] = replicationDistributions.map(distribution => {
      const totalDealSize = xbytes(parseFloat(distribution.total_deal_size), { iec: true })
      const uniqueDataSize = xbytes(parseFloat(distribution.unique_data_size), { iec: true })
      return {
        numOfReplica: distribution.num_of_replicas,
        totalDealSize,
        uniqueDataSize,
        percentage: `${(distribution.percentage * 100).toFixed(2)}%`
      }
    })

    const cidSharingRows: CidSharingRow[] = await Promise.all(
      cidSharing.map(
        async (share) => {
          const totalDealSize = xbytes(parseFloat(share.total_deal_size), { iec: true })
          const otherApplications = await this.findIssueForClient(share.other_client_address)
          return {
            otherClientAddress: share.other_client_address,
            totalDealSize,
            uniqueCidCount: share.unique_cid_count.toLocaleString('en-US'),
            otherClientOrganizationNames: otherApplications.map(x => x.organizationName).join('<br/>'),
            otherClientProjectNames: otherApplications.map(x => `[${x.projectName}](${x.url})`).join('<br/>')
          }
        }
      )
    )

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
    content.push('The below table shows the distribution of storage providers that have stored data for this client.')
    content.push('For most of the datacap application, below restrictions should apply. GeoIP locations are resolved with Maxmind GeoIP database.')
    content.push(' - Storage provider should not exceed 25% of total deal size.')
    content.push(' - Storage provider should not be storing same data more than 25%.')
    content.push(' - Storage provider should have published its public IP address.')
    content.push(' - The storage providers should be located in different regions.')
    content.push('')
    for (const provider of providerDistributions) {
      const providerLink = `[${provider.provider}](https://filfox.info/en/address/${provider.provider})`
      if (provider.percentage > 0.25) {
        content.push(emoji.get('warning') + ` ${providerLink} has sealed more than 25% of total deals.`)
        content.push('')
      }
      if (provider.duplication_factor > 1.25) {
        content.push(emoji.get('warning') + ` ${providerLink} has sealed same data more than 25%.`)
        content.push('')
      }
      if (provider.country == null || provider.country === '') {
        content.push(emoji.get('warning') + ` ${providerLink} has unknown IP location.`)
        content.push('')
      }
    }
    if (new Set(providerDistributionRows.map(row => row.location)).size <= 1) {
      content.push(emoji.get('warning') + ' All storage providers are located in the same region.')
      content.push('')
    }

    content.push(generateGfmTable(providerDistributionRows,
      [
        ['provider', { name: 'Provider', align: 'l' }],
        ['location', { name: 'Location', align: 'r' }],
        ['totalDealSize', { name: 'Total Deals Made', align: 'r' }],
        ['percentage', { name: 'Percentage', align: 'r' }],
        ['uniqueDataSize', { name: 'Unique Data', align: 'r' }],
        ['duplicationFactor', { name: 'Duplication Factor', align: 'r' }]
      ]))
    content.push('')
    content.push(`![Provider Distribution](${providerDistributionImageUrl})`)

    content.push('### Deal Data Replication')
    content.push('The below table shows how each many unique data are replicated across storage providers.')
    content.push('For most of the datacap application, the number of replicas should be more than 3.')
    content.push('')
    const lowReplicaPercentage = replicationDistributions
      .filter(distribution => distribution.num_of_replicas <= 3)
      .map(distribution => distribution.percentage)
      .reduce((a, b) => a + b, 0)
    if (lowReplicaPercentage > 0.25) {
      content.push(emoji.get('warning') + ` ${(lowReplicaPercentage * 100).toFixed(2)} of deals are for data replicated across less than 4 storage providers.`)
      content.push('')
    }
    content.push('')
    content.push(generateGfmTable(replicationDistributionRows, [
      ['numOfReplica', { name: 'Number of Replicas', align: 'r' }],
      ['uniqueDataSize', { name: 'Unique Data Size', align: 'r' }],
      ['totalDealSize', { name: 'Total Deals Made', align: 'r' }],
      ['percentage', { name: 'Deal Percentage', align: 'r' }]
    ]))
    content.push('')

    content.push(`![Replication Distribution](${replicationDistributionImageUrl})`)
    content.push('### Deal Data Shared with other Clients')
    content.push('The below table shows how many unique data are shared with other clients.')
    content.push('Usually different applications owns different data and should not resolve to the same CID.')
    content.push('')
    if (cidSharingRows.length > 0) {
      content.push(emoji.get('warning') + ' CID sharing has been observed.')
      content.push('')
      content.push(generateGfmTable(cidSharingRows, [
        ['otherClientAddress', { name: 'Other Client', align: 'r' }],
        ['otherClientOrganizationNames', { name: 'Organizations', align: 'l' }],
        ['otherClientProjectNames', { name: 'Projects', align: 'l' }],
        ['totalDealSize', { name: 'Total Deals Made', align: 'r' }],
        ['uniqueCidCount', { name: 'Unique CIDs', align: 'r' }]
      ]))
    } else {
      content.push(emoji.get('white_check_mark') + ' No CID sharing has been observed.')
    }

    content.push('')
    return content.join('\n')
  }
}

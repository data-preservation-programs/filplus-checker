import { Issue } from '@octokit/webhooks-types'
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

export type TokenGenerator = () => string
export type Logger = (message: string) => void

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

  public constructor (
    private readonly sql: Pool,
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

  public async check (issue: Issue): Promise<string> {
    this.logger(`Checking issue #${issue.number}...`)
    const applicationInfo = CidChecker.getApplicationInfo(issue)
    this.logger(`Retrieved Application Info: ${JSON.stringify(applicationInfo)}`)
    const providerDistributions = await this.getStorageProviderDistribution(applicationInfo.clientAddress)
    this.logger(`Retrieved Provider Distribution: ${JSON.stringify(providerDistributions)}`)
    const replicationDistributions = await this.getReplicationDistribution(applicationInfo.clientAddress)
    this.logger(`Retrieved Replication Distribution: ${JSON.stringify(replicationDistributions)}`)
    const cidSharing = await this.getCidSharing(applicationInfo.clientAddress)
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
    content.push('### Deal Data Replication')
    content.push(generateGfmTable(replicationDistributionRows, [
      ['numOfReplica', { name: 'Number of Replicas', align: 'r' }],
      ['totalDealSize', { name: 'Total Deals Made', align: 'r' }],
      ['percentage', { name: 'Percentage', align: 'r' }]
    ]))
    content.push('### Deal Data Shared with other Clients')
    content.push(generateGfmTable(cidSharingRows, [
      ['otherClientAddress', { name: 'Other Client', align: 'r' }],
      ['totalDealSize', { name: 'Total Deals Made', align: 'r' }],
      ['uniqueCidCount', { name: 'Unique CIDs', align: 'r' }]
    ]))
    return content.join('\n')
  }
}

import { Issue, IssuesLabeledEvent, Repository } from '@octokit/webhooks-types'
import { Pool } from 'pg'
import {
  ApplicationInfo,
  CidSharing,
  ReplicationDistribution,
  ProviderDistribution,
  ProviderDistributionRow,
  ReplicationDistributionRow,
  CidSharingRow,
  Location,
  ProviderDistributionWithLocation,
  MinerInfo, IpInfoResponse, GetVerifiedClientResponse
} from './Types'
import { parseIssue } from '../../dep/filecoin-verifier-tools/utils/large-issue-parser'
import { generateGfmTable, escape, generateLink, wrapInCode } from './MarkdownUtils'
import xbytes from 'xbytes'
import emoji from 'node-emoji'
import retry from 'async-retry'
import { Octokit } from '@octokit/core'
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods'
import { Logger } from 'pino'
import ordinal from 'ordinal'
import { resolve4, resolve6 } from 'dns/promises'
import axios from 'axios'
import { Multiaddr } from 'multiaddr'
import BarChart from '../charts/BarChart'
import DealDistributionMap from '../charts/DealDistributionMap'

export type Logger = (message: string) => void

export interface FileUploadConfig {
  owner: string
  repo: string
  branch?: string
  committerName: string
  committerEmail: string
  searchRepoLarge: string
  searchRepo: string
}

export interface Criteria {
  maxProviderDealPercentage: number
  maxDuplicationPercentage: number
  lowReplicaThreshold: number
  maxPercentageForLowReplica: number
}

export default class CidChecker {
  private static readonly issueApplicationInfoCache: Map<string, ApplicationInfo | null> = new Map()
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
             (total_deal_size::FLOAT - unique_data_size) / total_deal_size::FLOAT AS duplication_percentage
      FROM miners
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
                      AND current_state.verified_deal = true
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
    private readonly logger: Logger,
    private readonly ipinfoToken: string,
    private readonly allocationLabels: string[]) {
  }

  private getClientAddress (issue: Issue): string {
    const parseResult = parseIssue(issue.body ?? '')
    if (!parseResult.correct) {
      throw new Error(`Invalid issue body.\n  errorMessage: ${parseResult.errorMessage}\n  errorDetails: ${parseResult.errorDetails}`)
    }

    return parseResult.address
  }

  private static getCurrentEpoch (): number {
    return Math.floor((Date.now() / 1000 - 1598306400) / 30)
  }

  private async getStorageProviderDistribution (client: string): Promise<ProviderDistribution[]> {
    const currentEpoch = CidChecker.getCurrentEpoch()
    this.logger.info({ client, currentEpoch }, 'Getting storage provider distribution')
    const queryResult = await retry(async () => await this.sql.query(
      CidChecker.ProviderDistributionQuery,
      [client, currentEpoch]))
    const distributions = queryResult.rows as ProviderDistribution[]
    const total = distributions.reduce((acc, cur) => acc + parseFloat(cur.total_deal_size), 0)
    for (const distribution of distributions) {
      distribution.percentage = parseFloat(distribution.total_deal_size) / total
    }
    this.logger.debug({ distributions }, 'Got Storage provider distribution')
    return distributions
  }

  private async getReplicationDistribution (client: string): Promise<ReplicationDistribution[]> {
    const currentEpoch = CidChecker.getCurrentEpoch()
    this.logger.info({ client, currentEpoch }, 'Getting replication distribution')
    const queryResult = await retry(async () => await this.sql.query(
      CidChecker.ReplicaDistributionQuery,
      [client, currentEpoch]))
    const distributions = queryResult.rows as ReplicationDistribution[]
    const total = distributions.reduce((acc, cur) => acc + parseFloat(cur.total_deal_size), 0)
    for (const distribution of distributions) {
      distribution.percentage = parseFloat(distribution.total_deal_size) / total
    }
    this.logger.debug({ distributions }, 'Got replication distribution')
    return distributions
  }

  private async getCidSharing (client: string): Promise<CidSharing[]> {
    this.logger.info({ client }, 'Getting cid sharing')
    const queryResult = await retry(async () => await this.sql.query(
      CidChecker.CidSharingQuery,
      [client]))
    const sharing = queryResult.rows as CidSharing[]
    this.logger.debug({ sharing }, 'Got cid sharing')
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

    this.logger.info({ owner: params.owner, repo: params.repo, path: params.path, message: params.message }, 'Uploading file')
    const response: Response = await retry(async () => await this.octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', params))

    this.logger.info({ owner: params.owner, repo: params.repo, path: params.path, message: params.message }, 'Uploaded file')
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return response.data.content!.download_url!
  }

  private getImageForProviderDistribution (_providerDistributions: ProviderDistributionWithLocation[]): string {
    return 'iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAApgAAAKYB3X3/OAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAANCSURBVEiJtZZPbBtFFMZ/M7ubXdtdb1xSFyeilBapySVU8h8OoFaooFSqiihIVIpQBKci6KEg9Q6H9kovIHoCIVQJJCKE1ENFjnAgcaSGC6rEnxBwA04Tx43t2FnvDAfjkNibxgHxnWb2e/u992bee7tCa00YFsffekFY+nUzFtjW0LrvjRXrCDIAaPLlW0nHL0SsZtVoaF98mLrx3pdhOqLtYPHChahZcYYO7KvPFxvRl5XPp1sN3adWiD1ZAqD6XYK1b/dvE5IWryTt2udLFedwc1+9kLp+vbbpoDh+6TklxBeAi9TL0taeWpdmZzQDry0AcO+jQ12RyohqqoYoo8RDwJrU+qXkjWtfi8Xxt58BdQuwQs9qC/afLwCw8tnQbqYAPsgxE1S6F3EAIXux2oQFKm0ihMsOF71dHYx+f3NND68ghCu1YIoePPQN1pGRABkJ6Bus96CutRZMydTl+TvuiRW1m3n0eDl0vRPcEysqdXn+jsQPsrHMquGeXEaY4Yk4wxWcY5V/9scqOMOVUFthatyTy8QyqwZ+kDURKoMWxNKr2EeqVKcTNOajqKoBgOE28U4tdQl5p5bwCw7BWquaZSzAPlwjlithJtp3pTImSqQRrb2Z8PHGigD4RZuNX6JYj6wj7O4TFLbCO/Mn/m8R+h6rYSUb3ekokRY6f/YukArN979jcW+V/S8g0eT/N3VN3kTqWbQ428m9/8k0P/1aIhF36PccEl6EhOcAUCrXKZXXWS3XKd2vc/TRBG9O5ELC17MmWubD2nKhUKZa26Ba2+D3P+4/MNCFwg59oWVeYhkzgN/JDR8deKBoD7Y+ljEjGZ0sosXVTvbc6RHirr2reNy1OXd6pJsQ+gqjk8VWFYmHrwBzW/n+uMPFiRwHB2I7ih8ciHFxIkd/3Omk5tCDV1t+2nNu5sxxpDFNx+huNhVT3/zMDz8usXC3ddaHBj1GHj/As08fwTS7Kt1HBTmyN29vdwAw+/wbwLVOJ3uAD1wi/dUH7Qei66PfyuRj4Ik9is+hglfbkbfR3cnZm7chlUWLdwmprtCohX4HUtlOcQjLYCu+fzGJH2QRKvP3UNz8bWk1qMxjGTOMThZ3kvgLI5AzFfo379UAAAAASUVORK5CYII='
  }

  // private getImageForReplicationDistribution (_replicationDistributions: ReplicationDistribution[]): string {
  //   return 'iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAApgAAAKYB3X3/OAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAANCSURBVEiJtZZPbBtFFMZ/M7ubXdtdb1xSFyeilBapySVU8h8OoFaooFSqiihIVIpQBKci6KEg9Q6H9kovIHoCIVQJJCKE1ENFjnAgcaSGC6rEnxBwA04Tx43t2FnvDAfjkNibxgHxnWb2e/u992bee7tCa00YFsffekFY+nUzFtjW0LrvjRXrCDIAaPLlW0nHL0SsZtVoaF98mLrx3pdhOqLtYPHChahZcYYO7KvPFxvRl5XPp1sN3adWiD1ZAqD6XYK1b/dvE5IWryTt2udLFedwc1+9kLp+vbbpoDh+6TklxBeAi9TL0taeWpdmZzQDry0AcO+jQ12RyohqqoYoo8RDwJrU+qXkjWtfi8Xxt58BdQuwQs9qC/afLwCw8tnQbqYAPsgxE1S6F3EAIXux2oQFKm0ihMsOF71dHYx+f3NND68ghCu1YIoePPQN1pGRABkJ6Bus96CutRZMydTl+TvuiRW1m3n0eDl0vRPcEysqdXn+jsQPsrHMquGeXEaY4Yk4wxWcY5V/9scqOMOVUFthatyTy8QyqwZ+kDURKoMWxNKr2EeqVKcTNOajqKoBgOE28U4tdQl5p5bwCw7BWquaZSzAPlwjlithJtp3pTImSqQRrb2Z8PHGigD4RZuNX6JYj6wj7O4TFLbCO/Mn/m8R+h6rYSUb3ekokRY6f/YukArN979jcW+V/S8g0eT/N3VN3kTqWbQ428m9/8k0P/1aIhF36PccEl6EhOcAUCrXKZXXWS3XKd2vc/TRBG9O5ELC17MmWubD2nKhUKZa26Ba2+D3P+4/MNCFwg59oWVeYhkzgN/JDR8deKBoD7Y+ljEjGZ0sosXVTvbc6RHirr2reNy1OXd6pJsQ+gqjk8VWFYmHrwBzW/n+uMPFiRwHB2I7ih8ciHFxIkd/3Omk5tCDV1t+2nNu5sxxpDFNx+huNhVT3/zMDz8usXC3ddaHBj1GHj/As08fwTS7Kt1HBTmyN29vdwAw+/wbwLVOJ3uAD1wi/dUH7Qei66PfyuRj4Ik9is+hglfbkbfR3cnZm7chlUWLdwmprtCohX4HUtlOcQjLYCu+fzGJH2QRKvP3UNz8bWk1qMxjGTOMThZ3kvgLI5AzFfo379UAAAAASUVORK5CYII='
  // }

  private async findApplicationInfoForClient (client: string): Promise<ApplicationInfo | null> {
    if (CidChecker.issueApplicationInfoCache.has(client)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return CidChecker.issueApplicationInfoCache.get(client)!
    }
    this.logger.info({ client }, 'Finding application info for client')
    const response = await retry(async () => await axios.get(
      `https://api.filplus.d.interplanetary.one/api/getVerifiedClients?limit=10&page=1&filter=${client}`))
    const data: GetVerifiedClientResponse = response.data
    if (data.data.length === 0) {
      CidChecker.issueApplicationInfoCache.set(client, null)
      return null
    }
    const primary = data.data.reduce((prev, curr) => parseInt(prev.initialAllowance) > parseInt(curr.initialAllowance) ? prev : curr)
    const result = {
      clientAddress: client,
      organizationName: (primary.name ?? '') + (primary.orgName ?? ''),
      url: primary.allowanceArray[0]?.auditTrail,
      verifier: primary.verifierName
    }
    CidChecker.issueApplicationInfoCache.set(client, result)
    return result
  }

  private static linkifyAddress (address: string): string {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return `[${address.match(/.{1,41}/g)!.join('<br/>')}](https://filfox.info/en/address/${address})`
  }

  private static linkifyApplicationInfo (applicationInfo: ApplicationInfo | null): string {
    return applicationInfo != null
      ? (applicationInfo.url != null
        ? `[${escape(applicationInfo.organizationName)}](${applicationInfo.url})`
        : wrapInCode(applicationInfo.organizationName))
      : 'Unknown'
  }

  private async getNumberOfAllocations (issue: Issue, repo: Repository): Promise<number> {
    type Params = RestEndpointMethodTypes['issues']['listEvents']['parameters']
    type Response = RestEndpointMethodTypes['issues']['listEvents']['response']
    let page = 1
    const events = []
    while (true) {
      const params: Params = {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        owner: repo.owner.login,
        repo: repo.name,
        issue_number: issue.number,
        per_page: 100,
        page
      }
      this.logger.info(params, 'Getting events for issue')
      const response: Response = await retry(async () => await this.octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}/events', params))
      events.push(...response.data)
      if (response.data.length < 100) {
        break
      }
      page++
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion,@typescript-eslint/no-non-null-asserted-optional-chain
    return events.filter(event => event.event === 'labeled' && this.allocationLabels.includes(event.label?.name!)).length
  }

  private async getIpFromMultiaddr (multiAddr: string): Promise<string[]> {
    const m = new Multiaddr(Buffer.from(multiAddr, 'base64'))
    const address = m.nodeAddress().address
    const proto = m.protos()[0].name
    switch (proto) {
      case 'dns4':
        return await resolve4(address)
      case 'dns6':
        return await resolve6(address)
      case 'ip4':
      case 'ip6':
        return [address]
      default:
        this.logger.error({ multiAddr }, 'Unknown protocol')
        return []
    }
  }

  private async getMinerInfo (miner: string): Promise<MinerInfo> {
    this.logger.info({ miner }, 'Getting miner info')
    return await retry(async () => {
      const response = await axios.post('https://api.node.glif.io/rpc/v0', {
        jsonrpc: '2.0',
        id: 1,
        method: 'Filecoin.StateMinerInfo',
        params: [
          miner, null
        ]
      })
      return response.data.result
    })
  }

  private async getLocation (provider: string): Promise<Location | null> {
    const minerInfo = await this.getMinerInfo(provider)
    if (minerInfo.Multiaddrs == null || minerInfo.Multiaddrs.length === 0) {
      return null
    }
    const ips: string[] = []
    for (const multiAddr of minerInfo.Multiaddrs) {
      this.logger.info({ multiAddr }, 'Getting IP from multiaddr')
      const ip = await this.getIpFromMultiaddr(multiAddr)
      ips.push(...ip)
    }
    for (const ip of ips) {
      this.logger.info({ ip }, 'Getting location for IP')
      const data = await retry(async () => {
        const response = await axios.get(`https://ipinfo.io/${ip}?token=${this.ipinfoToken}`)
        return response.data
      }) as IpInfoResponse
      if (data.bogon === true) {
        continue
      }
      this.logger.info({ ip, data }, 'Got location for IP')
      return {
        city: data.city,
        country: data.country,
        region: data.region,
        latitude: (data.loc != null) ? parseFloat(data.loc.split(',')[0]) : undefined,
        longitude: (data.loc != null) ? parseFloat(data.loc.split(',')[1]) : undefined
      }
    }
    return null
  }

  public async check (event: IssuesLabeledEvent, criterias: Criteria[] = [{
    maxProviderDealPercentage: 0.25,
    maxDuplicationPercentage: 0.20,
    maxPercentageForLowReplica: 0.25,
    lowReplicaThreshold: 3
  }]): Promise<string | undefined> {
    const { issue, repository } = event
    let logger = this.logger.child({ issueNumber: issue.number })
    logger.info({ label: event.label }, 'Checking issue')
    const address = this.getClientAddress(issue)
    const applicationInfo = await this.findApplicationInfoForClient(address)
    if (applicationInfo == null) {
      throw new Error('Invalid issue')
    }
    logger = logger.child({ clientAddress: applicationInfo.clientAddress })
    logger.info(applicationInfo, 'Retrieved application info')
    const allocations = await this.getNumberOfAllocations(issue, repository)
    const isEarlyAllocation = criterias.length > allocations
    logger.info({ allocations }, 'Retrieved number of previous allocations')
    if (allocations === 0) {
      return undefined
    }
    const criteria = criterias.length > allocations - 1 ? criterias[allocations - 1] : criterias[criterias.length - 1]

    const [providerDistributions, replicationDistributions, cidSharing] = await Promise.all([(async () => {
      const result = await this.getStorageProviderDistribution(applicationInfo.clientAddress)
      const withLocations = []
      for (const item of result) {
        const location = await this.getLocation(item.provider)
        withLocations.push({ ...item, ...location })
      }
      return withLocations
    })(),
    this.getReplicationDistribution(applicationInfo.clientAddress),
    this.getCidSharing(applicationInfo.clientAddress)
    ])

    const providerDistributionRows: ProviderDistributionRow[] = providerDistributions.map(distribution => {
      const totalDealSize = xbytes(parseFloat(distribution.total_deal_size), { iec: true })
      const uniqueDataSize = xbytes(parseFloat(distribution.unique_data_size), { iec: true })
      let location = [distribution.city, distribution.region, distribution.country].filter(x => x).join(', ')
      if (location === '' || location == null) {
        location = 'Unknown'
      }
      return {
        provider: generateLink(distribution.provider, `https://filfox.info/en/address/${distribution.provider}`),
        totalDealSize,
        uniqueDataSize,
        location,
        percentage: `${(distribution.percentage * 100).toFixed(2)}%`,
        duplicatePercentage: `${(distribution.duplication_percentage * 100).toFixed(2)}%`
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
          const otherApplication = await this.findApplicationInfoForClient(share.other_client_address)
          return {
            otherClientAddress: CidChecker.linkifyAddress(share.other_client_address),
            totalDealSize,
            uniqueCidCount: share.unique_cid_count.toLocaleString('en-US'),
            otherClientOrganizationName: CidChecker.linkifyApplicationInfo(otherApplication),
            verifier: otherApplication?.verifier ?? 'Unknown'
          }
        }
      )
    )

    // https://github.com/xinaxu/filecoin-plus-large-datasets/issues/3 - image
    // https://github.com/data-preservation-programs/filecoin-plus-large-datasets/issues/1 - data

    // const replicationDistributionImage = this.getImageForReplicationDistribution(replicationDistributions)
    const barChart = new BarChart(replicationDistributions)
    const replicationDistributionImage = await barChart.generateChartImage()

    const wolrdDealDistributions = new DealDistributionMap(replicationDistributions)
    const providerDistributionImage = await wolrdDealDistributions.generateChartImage()

    // const providerDistributionImage = this.getImageForProviderDistribution(providerDistributions)
    const providerDistributionImageUrl = await this.uploadFile(
      `${repository.full_name}/issues/${issue.number}/${Date.now()}.png`,
      providerDistributionImage,
      `Upload provider distribution image for issue #${issue.number} of ${repository.full_name}`)

    const replicationDistributionImageUrl = await this.uploadFile(
      `${repository.full_name}/issues/${issue.number}/${Date.now()}.png`,
      replicationDistributionImage,
      `Upload replication distribution image for issue #${issue.number} of ${repository.full_name}`)

    const content: string[] = []
    content.push('## DataCap and CID Checker Report')
    content.push(` - Organization: ${wrapInCode(applicationInfo.organizationName)}`)
    content.push(` - Client: ${wrapInCode(applicationInfo.clientAddress)}`)
    content.push('### Storage Provider Distribution')
    content.push('The below table shows the distribution of storage providers that have stored data for this client.')
    content.push('For most of the datacap application, below restrictions should apply.')
    if (isEarlyAllocation) {
      content.push('')
      content.push(`**Since this is the ${ordinal(allocations + 1)} allocation, the following restrictions have been relaxed:**`)
    }
    content.push(` - Storage provider should not exceed ${(criteria.maxProviderDealPercentage * 100).toFixed(0)}% of total datacap.`)
    content.push(` - Storage provider should not be storing duplicate data for more than ${(criteria.maxDuplicationPercentage * 100).toFixed(0)}%.`)
    content.push(' - Storage provider should have published its public IP address.')
    content.push(' - All storage providers should be located in different regions.')
    content.push('')
    let providerDistributionHealthy = true
    for (const provider of providerDistributions) {
      const providerLink = generateLink(provider.provider, `https://filfox.info/en/address/${provider.provider}`)
      if (provider.percentage > criteria.maxProviderDealPercentage) {
        logger.info({ provider: provider.provider, percentage: provider.percentage }, 'Provider exceeds max percentage')
        content.push(emoji.get('warning') + ` ${providerLink} has sealed ${(provider.percentage * 100).toFixed(2)}% of total datacap.`)
        content.push('')
        providerDistributionHealthy = false
      }
      if (provider.duplication_percentage > criteria.maxDuplicationPercentage) {
        logger.info({ provider: provider.provider, duplicationFactor: provider.duplication_percentage }, 'Provider exceeds max duplication percentage')
        content.push(emoji.get('warning') + ` ${(provider.duplication_percentage * 100).toFixed(2)}% of total deal sealed by ${providerLink} are duplicate data.`)
        content.push('')
        providerDistributionHealthy = false
      }
      if (provider.country == null || provider.country === '') {
        logger.info({ provider: provider.provider }, 'Provider does not have IP location')
        content.push(emoji.get('warning') + ` ${providerLink} has unknown IP location.`)
        content.push('')
        providerDistributionHealthy = false
      }
    }
    if (new Set(providerDistributionRows.map(row => row.location)).size <= 1) {
      logger.info('Client has data stored in only one region')
      content.push(emoji.get('warning') + ' All storage providers are located in the same region.')
      content.push('')
      providerDistributionHealthy = false
    }

    if (providerDistributionHealthy) {
      content.push(emoji.get('heavy_check_mark') + ' Storage provider distribution looks healthy.')
      content.push('')
    }

    content.push(generateGfmTable(providerDistributionRows,
      [
        ['provider', { name: 'Provider', align: 'l' }],
        ['location', { name: 'Location', align: 'r' }],
        ['totalDealSize', { name: 'Total Deals Sealed', align: 'r' }],
        ['percentage', { name: 'Percentage', align: 'r' }],
        ['uniqueDataSize', { name: 'Unique Data', align: 'r' }],
        ['duplicatePercentage', { name: 'Duplicate Deals', align: 'r' }]
      ]))
    content.push('')
    content.push(`![Provider Distribution](${providerDistributionImageUrl})`)

    content.push('### Deal Data Replication')
    content.push('The below table shows how each many unique data are replicated across storage providers.')
    if (criteria.maxPercentageForLowReplica < 1) {
      if (isEarlyAllocation) {
        content.push('')
        content.push(`**Since this is the ${ordinal(allocations + 1)} allocation, the following restrictions have been relaxed:**`)
      }
      content.push(`- No more than ${(criteria.maxPercentageForLowReplica * 100).toFixed(0)}% of unique data are stored with less than ${criteria.lowReplicaThreshold + 1} providers.`)
    }
    content.push('')
    const lowReplicaPercentage = replicationDistributions
      .filter(distribution => distribution.num_of_replicas <= criteria.lowReplicaThreshold)
      .map(distribution => distribution.percentage)
      .reduce((a, b) => a + b, 0)
    if (lowReplicaPercentage > criteria.maxPercentageForLowReplica) {
      logger.info({ lowReplicaPercentage }, 'Low replica percentage exceeds max percentage')
      content.push(emoji.get('warning') + ` ${(lowReplicaPercentage * 100).toFixed(2)}% of deals are for data replicated across less than ${criteria.lowReplicaThreshold + 1} storage providers.`)
      content.push('')
    } else {
      content.push(emoji.get('heavy_check_mark') + ' Data replication looks healthy.')
      content.push('')
    }
    content.push(generateGfmTable(replicationDistributionRows, [
      ['uniqueDataSize', { name: 'Unique Data Size', align: 'r' }],
      ['totalDealSize', { name: 'Total Deals Made', align: 'r' }],
      ['numOfReplica', { name: 'Number of Providers', align: 'r' }],
      ['percentage', { name: 'Deal Percentage', align: 'r' }]
    ]))
    content.push('')

    content.push(`![Replication Distribution](${replicationDistributionImageUrl})`)
    content.push('### Deal Data Shared with other Clients')
    content.push('The below table shows how many unique data are shared with other clients.')
    content.push('Usually different applications owns different data and should not resolve to the same CID.')
    content.push('')
    if (cidSharingRows.length > 0) {
      for (const row of cidSharingRows) {
        logger.info({ otherClientAddress: row.otherClientAddress }, 'CID is shared with another client')
      }
      content.push(emoji.get('warning') + ' CID sharing has been observed.')
      content.push('')
      content.push(generateGfmTable(cidSharingRows, [
        ['otherClientAddress', { name: 'Other Client', align: 'l' }],
        ['otherClientOrganizationName', { name: 'Application', align: 'l' }],
        ['totalDealSize', { name: 'Total Deals Affected', align: 'r' }],
        ['uniqueCidCount', { name: 'Unique CIDs', align: 'r' }],
        ['verifier', { name: 'Verifier', align: 'r' }]
      ]))
    } else {
      content.push(emoji.get('heavy_check_mark') + ' No CID sharing has been observed.')
    }

    content.push('')
    const joinedContent = content.join('\n')
    const contentUrl = await this.uploadFile(
      `${repository.full_name}/issues/${issue.number}/${Date.now()}.md`,
      Buffer.from(joinedContent).toString('base64'),
      `Upload report for issue #${issue.number} of ${repository.full_name}`)
    logger.info({ contentUrl }, 'Report content uploaded')
    return joinedContent
  }
}

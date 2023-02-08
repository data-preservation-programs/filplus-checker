import { Issue, Repository } from '@octokit/webhooks-types'
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
  MinerInfo,
  IpInfoResponse,
  GetVerifiedClientResponse
} from './Types'
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
import BarChart, { BarChartEntry } from '../charts/BarChart'
import GeoMap, { GeoMapEntry } from '../charts/GeoMap'
import { Chart, LegendOptions } from 'chart.js'
import { matchGroupLargeNotary } from '../../dep/filecoin-verifier-tools/utils/common-utils'

const RED = 'rgba(255, 99, 132)'
const GREEN = 'rgba(75, 192, 192)'
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
  private static readonly ErrorTemplate = `
  ## DataCap and CID Checker Report[^1]
  {message}
  
  [^1]: To manually trigger this report, add a comment with text \`checker:manualTrigger\`
  `

  private static getErrorContent (message: string): string {
    return CidChecker.ErrorTemplate.replace('{message}', message)
  }

  private static readonly issueApplicationInfoCache: Map<string, ApplicationInfo | null> = new Map()
  private static readonly ProviderDistributionQuery = `
      WITH miner_pieces AS (SELECT provider,
                                   piece_cid,
                                   SUM(piece_size) AS total_deal_size,
                                   MIN(piece_size) AS piece_size
                            FROM current_state,
                                 client_mapping
                            WHERE client_address = ANY($1)
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
                        WHERE client_address = ANY($1)
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
                    WHERE client_address = ANY($1)
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
        AND client_address != ANY($1)
      GROUP BY client_address
      ORDER BY total_deal_size DESC`

  public constructor (
    private readonly sql: Pool,
    public readonly octokit: Octokit,
    private readonly fileUploadConfig: FileUploadConfig,
    private readonly logger: Logger,
    private readonly ipinfoToken: string,
    private readonly allocationBotId: number) {
  }

  private getClientAddress (issue: Issue): string | undefined {
    const regexAddress = /[\n\r][ \t]*-\s*On-chain\s*address\s*for\s*first\s*allocation:[ \t]*([^\n\r]*)/m
    const regexAddress2 = /[\n\r]*###\s*On-chain\s*address\s*for\s*first\s*allocation[\r\n\t]*([^\n\r]*)/
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    const address: string | undefined = matchGroupLargeNotary(regexAddress, issue.body) || matchGroupLargeNotary(regexAddress2, issue.body)
    if (address == null || address[0] !== 'f') {
      this.logger.warn('Could not find address in issue %s', issue.number)
      return undefined
    }
    this.logger.info(`Found address ${address} for issue ${issue.number}`)
    return address
  }

  private static getCurrentEpoch (): number {
    return Math.floor((Date.now() / 1000 - 1598306400) / 30)
  }

  private async getFirstClientByProviders (providers: string[]): Promise<Map<string, string>> {
    const params = []
    for (let i = 1; i <= providers.length; i++) {
      params.push('$' + i.toString())
    }
    const firstClientQuery = 'WITH mapping AS (SELECT DISTINCT ON (provider) provider, client FROM current_state WHERE verified_deal = true AND sector_start_epoch > 0 AND provider IN (' +
      params.join(', ') + ') ORDER BY provider, sector_start_epoch ASC) SELECT provider, client_address FROM mapping, client_mapping WHERE mapping.client = client_mapping.client'
    this.logger.info({ firstClientQuery, providers })
    const queryResult = await retry(async () => await this.sql.query(firstClientQuery, providers), { retries: 3 })
    const rows: Array<{ provider: string, client_address: string }> = queryResult.rows
    const result = new Map<string, string>()
    for (const row of rows) {
      result.set(row.provider, row.client_address)
    }
    return result
  }

  private async getStorageProviderDistribution (clients: string[]): Promise<ProviderDistribution[]> {
    const currentEpoch = CidChecker.getCurrentEpoch()
    this.logger.info({ clients, currentEpoch }, 'Getting storage provider distribution')
    const queryResult = await retry(async () => await this.sql.query(
      CidChecker.ProviderDistributionQuery,
      [clients, currentEpoch]), { retries: 3 })
    const distributions = queryResult.rows as ProviderDistribution[]
    const total = distributions.reduce((acc, cur) => acc + parseFloat(cur.total_deal_size), 0)
    for (const distribution of distributions) {
      distribution.percentage = parseFloat(distribution.total_deal_size) / total
    }
    this.logger.debug({ distributions }, 'Got Storage provider distribution')
    return distributions
  }

  private async getReplicationDistribution (clients: string[]): Promise<ReplicationDistribution[]> {
    const currentEpoch = CidChecker.getCurrentEpoch()
    this.logger.info({ clients, currentEpoch }, 'Getting replication distribution')
    const queryResult = await retry(async () => await this.sql.query(
      CidChecker.ReplicaDistributionQuery,
      [clients, currentEpoch]), { retries: 3 })
    const distributions = queryResult.rows as ReplicationDistribution[]
    const total = distributions.reduce((acc, cur) => acc + parseFloat(cur.total_deal_size), 0)
    for (const distribution of distributions) {
      distribution.percentage = parseFloat(distribution.total_deal_size) / total
    }
    this.logger.debug({ distributions }, 'Got replication distribution')
    return distributions
  }

  private async getCidSharing (clients: string[]): Promise<CidSharing[]> {
    this.logger.info({ clients }, 'Getting cid sharing')
    const queryResult = await retry(async () => await this.sql.query(
      CidChecker.CidSharingQuery,
      [clients]), { retries: 3 })
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
    const response: Response = await retry(async () => await this.octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', params), { retries: 3 })

    this.logger.info({ owner: params.owner, repo: params.repo, path: params.path, message: params.message }, 'Uploaded file')
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return response.data.content!.download_url!
  }

  private getImageForReplicationDistribution (replicationDistributions: ReplicationDistribution[], colorThreshold: number): string {
    const replicationEntries: BarChartEntry[] = []

    for (const distribution of replicationDistributions) {
      replicationEntries.push({
        yValue: parseFloat(distribution.unique_data_size),
        xValue: distribution.num_of_replicas,
        barLabel: xbytes(parseFloat(distribution.unique_data_size), { iec: true }),
        label: distribution.num_of_replicas.toString()
      })
    }

    const backgroundColors = replicationEntries.map((row) => row.xValue <= colorThreshold ? RED : GREEN)
    const borderColors = replicationEntries.map((row) => row.xValue <= colorThreshold ? RED : GREEN)

    // not sure why typescript is complaining here on labels
    // ive nested the Partial as well and its still complaining
    // leaving labels as any for now.
    const legendOpts: Partial<LegendOptions<'bar'> & { labels: any }> = {
      display: true,
      labels: {
        generateLabels: (_: Chart<'bar'>) => [
          { text: 'low provider count', fillStyle: RED, strokeStyle: '#fff' },
          { text: 'healthy provider count', fillStyle: GREEN, strokeStyle: '#fff' }
        ]
      }
    }

    return BarChart.getImage(replicationEntries, {
      title: 'Unique Data Bytes by Number of Providers',
      titleYText: 'Unique Data Bytes',
      titleXText: 'Number of Providers',
      legendOpts,
      backgroundColors,
      borderColors
    })
  }

  private getImageForProviderDistribution (providerDistributions: ProviderDistributionWithLocation[]): string {
    const geoMapEntries: GeoMapEntry[] = []

    for (const distribution of providerDistributions) {
      if (distribution.longitude != null && distribution.latitude != null) {
        geoMapEntries.push({
          longitude: distribution.longitude,
          latitude: distribution.latitude,
          value: distribution.percentage,
          label: distribution.provider
        })
      }
    }
    return GeoMap.getImage(geoMapEntries)
  }

  private async findApplicationInfoForClient (client: string): Promise<ApplicationInfo | null> {
    if (CidChecker.issueApplicationInfoCache.has(client)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return CidChecker.issueApplicationInfoCache.get(client)!
    }
    this.logger.info({ client }, 'Finding application info for client')
    const response = await retry(async () => await axios.get(
      `https://api.filplus.d.interplanetary.one/api/getVerifiedClients?limit=10&page=1&filter=${client}`), { retries: 6 })
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
      verifier: primary.verifierName,
      issueNumber: primary.allowanceArray[0]?.auditTrail?.split('/').pop()
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
    const comments = await this.getComments(issue.number, repo)
    return comments.filter((comment) => comment.user?.id === this.allocationBotId && comment.body?.includes('## DataCap Allocation requested')).length
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
    }, { retries: 3 })
  }

  private static renderApprovers (approvers: Array<[string, number]>): string {
    return approvers.map(([name, count]) => `${wrapInCode(count.toString())}${name}`).join('<br/>')
  }

  private static readonly commentsCache = new Map<number, Array<{ body?: string, user: { login: string | undefined, id: number } | undefined | null }>>()

  private async getComments (issueNumber: number, repo: Repository): Promise<Array<{ body?: string, user: { login: string | undefined, id: number } | undefined | null }>> {
    if (CidChecker.commentsCache.has(issueNumber)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return CidChecker.commentsCache.get(issueNumber)!
    }
    type Params = RestEndpointMethodTypes['issues']['listComments']['parameters']
    type Response = RestEndpointMethodTypes['issues']['listComments']['response']
    let page = 1
    const comments = []
    while (true) {
      const params: Params = {
        owner: repo.owner.login,
        repo: repo.name,
        issue_number: issueNumber,
        per_page: 100,
        page
      }
      this.logger.info(params, 'Getting comments for issue')
      const response: Response | null = await retry(async () => {
        try {
          return await this.octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}/comments', params)
        } catch (e) {
          if ((e as any).status === 404) {
            return null
          }
          throw e
        }
      }, { retries: 3 })
      if (response != null) {
        comments.push(...response.data)
      }
      if (response == null || response.data.length < 100) {
        break
      }
      page++
    }

    CidChecker.commentsCache.set(issueNumber, comments)
    return comments
  }

  private async getApprovers (issueNumber: number, repo: Repository): Promise<Array<[string, number]>> {
    const approvers = new Map<string, number>()
    const comments = await this.getComments(issueNumber, repo)
    for (const comment of comments) {
      if (comment.body?.startsWith('## Request Approved') === true ||
        comment.body?.startsWith('## Request Proposed') === true) {
        const approver = comment.user?.login ?? 'Unknown'
        const count = approvers.get(approver) ?? 0
        approvers.set(approver, count + 1)
      }
    }
    return [...approvers.entries()].sort((a, b) => a[0].localeCompare(b[0]))
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
      }, { retries: 3 }) as IpInfoResponse
      if (data.bogon === true) {
        continue
      }
      this.logger.info({ ip, data }, 'Got location for IP')
      return {
        city: data.city,
        country: data.country,
        region: data.region,
        latitude: (data.loc != null) ? parseFloat(data.loc.split(',')[0]) : undefined,
        longitude: (data.loc != null) ? parseFloat(data.loc.split(',')[1]) : undefined,
        orgName: data.org != null ? data.org.split(' ').slice(1).join(' ') : 'Unknown'
      }
    }
    return null
  }

  public async check (event: { issue: Issue, repository: Repository }, criterias: Criteria[] = [{
    maxProviderDealPercentage: 0.25,
    maxDuplicationPercentage: 0.20,
    maxPercentageForLowReplica: 0.25,
    lowReplicaThreshold: 3
  }]): Promise<string | undefined> {
    const { issue, repository } = event
    let logger = this.logger.child({ issueNumber: issue.number })
    logger.info('Checking issue')
    const allocations = await this.getNumberOfAllocations(issue, repository)
    const isEarlyAllocation = criterias.length > allocations
    logger.info({ allocations }, 'Retrieved number of previous allocations')
    if (allocations === 0) {
      return await this.uploadReport(CidChecker.getErrorContent('There is no previous allocation for this issue.'), event)
    }
    const address = this.getClientAddress(issue)
    if (address == null) {
      return await this.uploadReport(CidChecker.getErrorContent('No client address found for this issue.'), event)
    }
    const applicationInfo = await this.findApplicationInfoForClient(address)
    if (applicationInfo == null) {
      return await this.uploadReport(CidChecker.getErrorContent('No application info found for this issue on https://filplus.d.interplanetary.one/clients.'), event)
    }
    logger = logger.child({ clientAddress: applicationInfo.clientAddress })
    logger.info(applicationInfo, 'Retrieved application info')

    const addressGroup: string[] = []
    if (!addressGroup.includes(applicationInfo.clientAddress)) {
      addressGroup.push(applicationInfo.clientAddress)
    }
    logger.info({ groups: addressGroup }, 'Retrieved address groups')

    const criteria = criterias.length > allocations - 1 ? criterias[allocations - 1] : criterias[criterias.length - 1]

    const [providerDistributions, replicationDistributions, cidSharing] = await Promise.all([(async () => {
      const result = await this.getStorageProviderDistribution(addressGroup)
      const providers = result.map(r => r.provider)
      if (providers.length === 0) {
        return []
      }
      const firstClientByProvider = await this.getFirstClientByProviders(providers)
      const withLocations: ProviderDistributionWithLocation[] = []
      for (const item of result) {
        const location = await this.getLocation(item.provider)
        const isNew = addressGroup.includes(firstClientByProvider.get(item.provider) ?? '')
        withLocations.push({ ...item, ...location, new: isNew })
      }
      return withLocations.sort((a, b) => a.orgName?.localeCompare(b.orgName ?? '') ?? 0)
    })(),
    this.getReplicationDistribution(addressGroup),
    this.getCidSharing(addressGroup)
    ])

    if (providerDistributions.length === 0) {
      return await this.uploadReport(CidChecker.getErrorContent('No active deals found for this client.'), event)
    }

    const providerDistributionRows: ProviderDistributionRow[] = providerDistributions.map(distribution => {
      const totalDealSize = xbytes(parseFloat(distribution.total_deal_size), { iec: true })
      const uniqueDataSize = xbytes(parseFloat(distribution.unique_data_size), { iec: true })
      let location = [distribution.city, distribution.region, distribution.country].filter(x => x).join(', ')
      if (location === '' || location == null) {
        location = 'Unknown'
      }
      const orgName = distribution.orgName ?? 'Unknown'
      return {
        provider: generateLink(distribution.provider, `https://filfox.info/en/address/${distribution.provider}`) + (distribution.new ? '`new` ' : ''),
        totalDealSize,
        uniqueDataSize,
        location: location + '<br/>' + wrapInCode(orgName),
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
            verifier: otherApplication?.issueNumber == null
              ? 'Unknown'
              : CidChecker.renderApprovers(await this.getApprovers(parseInt(otherApplication.issueNumber), repository))
          }
        }
      )
    )

    const providerDistributionImage = this.getImageForProviderDistribution(providerDistributions)
    const replicationDistributionImage = this.getImageForReplicationDistribution(replicationDistributions, criteria.lowReplicaThreshold)
    const providerDistributionImageUrl = await this.uploadFile(
      `${repository.full_name}/issues/${issue.number}/${Date.now()}.png`,
      providerDistributionImage,
      `Upload provider distribution image for issue #${issue.number} of ${repository.full_name}`)

    const replicationDistributionImageUrl = await this.uploadFile(
      `${repository.full_name}/issues/${issue.number}/${Date.now()}.png`,
      replicationDistributionImage,
      `Upload replication distribution image for issue #${issue.number} of ${repository.full_name}`)

    const content: string[] = []
    content.push('## DataCap and CID Checker Report[^1]')
    content.push(` - Organization: ${wrapInCode(applicationInfo.organizationName)}`)
    content.push(` - Client: ${wrapInCode(applicationInfo.clientAddress)}`)
    content.push('### Approvers')
    content.push(CidChecker.renderApprovers(await this.getApprovers(issue.number, repository)))
    content.push('')
    if (addressGroup.length > 1) {
      content.push('### Other Addresses')
      for (const address of addressGroup) {
        if (address !== applicationInfo.clientAddress) {
          content.push(` - ${wrapInCode(address)}: ${CidChecker.linkifyAddress(address)}`)
          content.push('')
        }
      }
    }
    content.push('### Storage Provider Distribution')
    content.push('The below table shows the distribution of storage providers that have stored data for this client.')
    content.push('')
    content.push('If this is the first time a provider takes verified deal, it will be marked as `new`.')
    content.push('')
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
    content.push('However, this could be possible if all below clients use same software to prepare for the exact same dataset or they belong to a series of LDN applications for the same dataset.')
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
        ['verifier', { name: 'Approvers', align: 'l' }]
      ]))
    } else {
      content.push(emoji.get('heavy_check_mark') + ' No CID sharing has been observed.')
    }

    content.push('')
    content.push('[^1]: To manually trigger this report, add a comment with text `checker:manualTrigger`')
    content.push('')
    const joinedContent = content.join('\n')
    return await this.uploadReport(joinedContent, event)
  }

  private async uploadReport (joinedContent: string, event: { issue: Issue, repository: Repository }): Promise<string> {
    const { issue, repository } = event
    const logger = this.logger.child({ issueNumber: issue.number })
    const contentUrl = await this.uploadFile(
      `${repository.full_name}/issues/${issue.number}/${Date.now()}.md`,
      Buffer.from(joinedContent).toString('base64'),
      `Upload report for issue #${issue.number} of ${repository.full_name}`)
    logger.info({ contentUrl }, 'Report content uploaded')
    return joinedContent
  }
}

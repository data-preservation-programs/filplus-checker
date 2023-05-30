export interface ProviderDistribution {
  provider: string
  total_deal_size: string
  unique_data_size: string
  duplication_percentage: number
  percentage: number
}

export interface Location {
  city?: string
  region?: string
  country?: string
  latitude?: number
  longitude?: number
  orgName?: string
}

export interface IpInfoResponse {
  city?: string
  region?: string
  country?: string
  loc?: string
  bogon?: boolean
  org?: string
}

export interface MinerInfo {
  PeerId: string
  Multiaddrs: string[] | null | undefined
  SectorSize: number
}

export type ProviderDistributionWithLocation = ProviderDistribution & Location & { new: boolean }

export interface ProviderDistributionRow {
  provider: string
  totalDealSize: string
  uniqueDataSize: string
  duplicatePercentage: string
  percentage: string
  location: string
}

export interface RetrievalRow {
  provider: string
  graphsyncAttempts: number
  graphsyncSuccessRatio: number
  graphsyncSuccessRatioStr: string
  httpAttempts: number
  httpSuccessRatio: number
  httpSuccessRatioStr: string
  bitswapAttempts: number
  bitswapSuccessRatio: number
  bitswapSuccessRatioStr: string
}

export interface RetrievalProviderViewRow {
  provider: string
  type: string
  result: string
  count: number
}

export interface ReplicationDistribution {
  num_of_replicas: number
  unique_data_size: string
  total_deal_size: string
  percentage: number
}

export interface ReplicationDistributionRow {
  numOfReplica: number
  uniqueDataSize: string
  totalDealSize: string
  percentage: string
}

export interface CidSharing {
  total_deal_size: string
  unique_cid_count: number
  other_client_address: string
}

export interface CidSharingRow {
  totalDealSize: string
  uniqueCidCount: string
  otherClientAddress: string
  otherClientOrganizationName: string
  verifier: string
}

export interface ApplicationInfo {
  organizationName: string
  clientAddress: string
  verifier: string
  url: string
  issueNumber: string | undefined
}

export interface GetVerifiedClientResponse {
  count: number
  data: Array<{
    address: string
    addressId: string
    initialAllowance: string
    orgName: string | null
    name: string | null
    verifierName: string
    allowanceArray: Array<{
      auditTrail: string
    }>
  }>
}

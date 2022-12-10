export interface ProviderDistribution {
  provider: string
  total_deal_size: string
  unique_data_size: string
  duplication_factor: number
  percentage: number
}

export interface Location {
  city?: string
  region?: string
  country?: string
  latitude?: number
  longitude?: number
}

export interface IpInfoResponse {
  city?: string
  region?: string
  country?: string
  loc?: string
  bogon?: boolean
}

export interface MinerInfo {
  PeerId: string
  Multiaddrs: string[] | null | undefined
  SectorSize: number
}

export type ProviderDistributionWithLocation = ProviderDistribution & Location

export interface ProviderDistributionRow {
  provider: string
  totalDealSize: string
  uniqueDataSize: string
  duplicationFactor: string
  percentage: string
  location: string
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
  otherClientOrganizationNames: string
  otherClientProjectNames: string
}

export interface ApplicationInfo {
  organizationName: string
  clientAddress: string
  projectName: string
  url: string
}

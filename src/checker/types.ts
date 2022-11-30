export interface StorageProviderDistribution {
  provider: string
  totalDealSize: number
  percentage: number
  country?: string
  region?: string
  city?: string
  latitude?: number
  longitude?: number
}

import DealDistributionMap from "../../src/charts/DealDistributionMap"
import { ProviderDistribution } from "../../src/checker/Types"

const sanFrancisco = {
  longitude: -122.4194,
  latitude: 37.7749
}

const paris = {
  longitude: 2.3522,
  latitude: 48.8566
}

describe('DealDistributionMap', () => {
  let dealDistributionMap: DealDistributionMap
  let data: ProviderDistribution[]

  beforeEach(() => {
    data = [
      {
        ...sanFrancisco,
        "provider": "f0123456",
        "total_deal_size": '100'
      },
      {
        ...paris,
        "provider": "f0123457",
        "total_deal_size": '200'
      }
    ] as ProviderDistribution[]


    dealDistributionMap = new DealDistributionMap(data)
  })

  it('should generate a chart image', async () => {
    const image = await dealDistributionMap.generateChartImage()
    expect(image).toBeTruthy()
  })
})

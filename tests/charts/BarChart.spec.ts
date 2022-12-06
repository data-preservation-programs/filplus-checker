import BarChart from "../../src/charts/BarChart"
import { ReplicationDistribution } from "../../src/checker/Types"


describe('BarChart', () => {
  let barChart: BarChart
  let data: ReplicationDistribution[]

  beforeEach(() => {
    data = [
      {
        "num_of_replicas": 1,
        "total_deal_size": '100',
      },
      {
        "num_of_replicas": 2,
        "total_deal_size": '200',
      }
    ] as ReplicationDistribution[]


    barChart = new BarChart(data)
  })

  it('should generate a chart image', async () => {
    const image = await barChart.generateChartImage()
    expect(image).toContain('data:image/png;base64')
  })
})

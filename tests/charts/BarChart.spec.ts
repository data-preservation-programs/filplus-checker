import BarChart from "../../src/charts/BarChart"
import { ReplicationDistribution } from "../../src/checker/Types"
import * as fs from "fs"


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
      },
      {
        "num_of_replicas": 4,
        "total_deal_size": '500',
      },
      {
        "num_of_replicas": 6,
        "total_deal_size": '1000',
      }
    ] as ReplicationDistribution[]
  })

  it('should generate a chart image', async () => {
    barChart = new BarChart(data)

    const image = await barChart.generateChartImage()
    fs.writeFileSync('tests/fixtures/barchart.png', image, 'base64')
    expect(fs.readFileSync('tests/fixtures/barchart.png', 'base64')).toEqual(image)
  })
})

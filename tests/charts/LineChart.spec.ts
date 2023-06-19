import {RetrievalWeekly} from "../../src/checker/CidChecker";
import LineChart from "../../src/charts/LineChart";
import * as fs from "fs"

describe('LineChart', () => {
  it('should generate time series', () => {
    const data: RetrievalWeekly[] = [
      {
        _id: {
          module: 'http',
          week: '2021-01-01',
        },
        successRate: 0.3
      },
      {
        _id: {
          module: 'http',
          week: '2021-01-08',
        },
        successRate: 0.4
      },
      {
        _id: {
          module: 'http',
          week: '2021-01-15',
        },
        successRate: 0.6
      },
      {
        _id: {
          module: 'http',
          week: '2021-01-022',
        },
        successRate: 0.5
      },
    ]
    const image = LineChart.getRetrievalWeeklyImage(data)
    fs.writeFileSync('tests/fixtures/linechart.png', image, 'base64')
    expect(fs.readFileSync('tests/fixtures/linechart.png', 'base64')).toEqual(image)
  })
})

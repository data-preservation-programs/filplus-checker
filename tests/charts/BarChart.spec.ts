import BarChart, { BarChartEntry } from "../../src/charts/BarChart"
import * as fs from "fs"
import xbytes from "xbytes"


describe('BarChart', () => {
  let data: BarChartEntry[]

  beforeEach(() => {
    data = [
      {
        yValue: 100,
        xValue: 1,
        barLabel: xbytes(100)

      },
      {
        yValue: 200,
        xValue: 2,
        barLabel: xbytes(200)
      },
      {
        yValue: 500,
        xValue: 3,
        barLabel: xbytes(300)
      },
      {
        yValue: 800,
        xValue: 4,
        barLabel: xbytes(400)
      }
    ] as BarChartEntry[]
  })

  it('should generate a chart image', async () => {
    const image = BarChart.getImage(data)
    fs.writeFileSync('tests/fixtures/barchart.png', image, 'base64')
    expect(fs.readFileSync('tests/fixtures/barchart.png', 'base64')).toEqual(image)
  })
})

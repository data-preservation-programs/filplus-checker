import BarChart, { BarChartEntry } from "../../src/charts/BarChart"
import * as fs from "fs"
import xbytes from "xbytes"
import { Chart } from "chart.js"


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
    const image = BarChart.getImage(data, {
      title: 'Bar Chart',
      titleXText: 'X Axis',
      titleYText: 'Y Axis',
      backgroundColors: [
        'rgba(255, 99, 132)',
        'rgba(255, 99, 132)',
        'rgba(75, 192, 192)',
        'rgba(75, 192, 192)',
      ],
      borderColors: [
        '#fff',
        '#fff',
        '#fff',
        '#fff',
      ],
      legendOpts: {
        display: true,
        labels: {
          generateLabels: (_: Chart) => {
            return [
              { text: 'low provider count', fillStyle: 'rgba(255, 99, 132)', strokeStyle: '#fff' },
              { text: 'healthy provider count', fillStyle: 'rgba(75, 192, 192)', strokeStyle: '#fff' }
            ]
          }
        }
      } as any
    })
    //fs.writeFileSync('tests/fixtures/barchart.png', image, 'base64')
    expect(fs.readFileSync('tests/fixtures/barchart.png', 'base64')).toEqual(image)
  })
})

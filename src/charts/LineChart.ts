import { createCanvas } from 'canvas'
import { Chart } from 'chart.js'
import { RetrievalWeekly } from '../checker/CidChecker'
// @ts-expect-error
require('chartjs-adapter-date-fns')

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export default class LineChart {
  public static getRetrievalWeeklyImage (data: RetrievalWeekly[]): string {
    const modules = ['http', 'graphsync', 'bitswap']
    const datasets = modules.map(module => ({
      label: module,
      data: data
        .filter(item => item._id.module === module)
        .map(item => ({ x: item._id.week, y: item.successRate })),
      fill: false,
      borderColor: module === 'http' ? 'red' : module === 'graphsync' ? 'green' : 'blue'
    }))
    const canvas = createCanvas(2000, 1000)
    const ctx = canvas.getContext('2d')
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets
      },
      options: {
        scales: {
          x: {
            type: 'time',
            time: {
              parser: 'yyyy-MM-dd',
              unit: 'week'
            }
          },
          y: {
            beginAtZero: true,
            max: 1
          }
        },
        plugins: {
          tooltip: {
            enabled: false
          },
          datalabels: {
            display: false
          }
        }
      }
    })
    return chart.toBase64Image().split(',')[1]
  }
}

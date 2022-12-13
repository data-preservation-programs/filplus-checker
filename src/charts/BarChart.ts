import { Chart, LegendOptions } from 'chart.js'
import { createCanvas } from 'canvas'
import { customCanvasBackgroundColor } from './plugins'

type Color = string
export interface BarChartEntry {
  yValue: number
  xValue: number
  barLabel: string
  label?: string
}

interface BarOptions {
  title: string
  titleYText: string
  titleXText: string
  legendOpts?: Partial<LegendOptions<'bar'>>
  backgroundColors?: Color[]
  borderColors?: Color[]
  colorThreshold?: number
  width?: number
  height?: number
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export default class BarChart {
  static {
    Chart.defaults.font.weight = 'bold'
    Chart.defaults.font.size = 24
  }

  public static getImage (
    entries: BarChartEntry[],
    opts: BarOptions
  ): string {
    const canvas = createCanvas(opts?.width ?? 2000, opts?.height ?? 1000)
    const ctx = canvas.getContext('2d')

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: entries.map((entry) => entry.xValue),
        datasets: [{
          data: entries.map((entry) => ({ y: entry.yValue, x: entry.xValue, label: entry.barLabel })),
          backgroundColor: opts.backgroundColors,
          borderColor: opts.borderColors,
          borderWidth: 1
        }]
      },
      options: {
        elements: {
          bar: {
            borderRadius: 10
          }
        },
        plugins: {
          legend: opts.legendOpts,
          title: {
            display: true,
            text: opts.title
          },
          // @ts-expect-error
          customCanvasBackgroundColor: {
            color: '#fff'
          }
        },
        scales: {
          y: {
            title: {
              display: true,
              text: opts.titleYText
            },
            beginAtZero: true,
            ticks: {
              count: 6,
              precision: 2
            }
          },
          x: {
            title: {
              display: true,
              text: opts.titleXText
            },
            ticks: {
              count: 0
            }
          }
        }
      },
      plugins: [customCanvasBackgroundColor]
    })
    return chart.toBase64Image().split(',')[1]
  }
}

import { Chart, LegendOptions } from 'chart.js'
import { createCanvas } from 'canvas'
import { customCanvasBackgroundColor } from './plugins'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import xbytes from 'xbytes'

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
  width?: number
  height?: number
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export default class BarChart {
  static {
    Chart.defaults.font.weight = 'bold'
    Chart.defaults.font.size = 24
    Chart.register(ChartDataLabels)
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
          },
          datalabels: {
            offset: 5,
            anchor: 'end',
            align: 'top',
            clamp: true,
            font: {
              size: 20,
              weight: 800
            },
            formatter: (_, context) => {
              const data: any = context.dataset.data[context.dataIndex]
              return data.label
            }
          }
        },
        scales: {
          y: {
            title: {
              display: true,
              text: opts.titleYText
            },
            suggestedMax: Math.max.apply(null, entries.map((e) => e.yValue)) * 1.05,
            ticks: {
              maxRotation: 45,
              minRotation: 45,
              count: 6,
              callback: (tickValue: number | string) => {
                return xbytes(tickValue as number, { iec: true, fixed: 0 })
              }
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

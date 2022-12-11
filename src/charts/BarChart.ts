import { Chart } from 'chart.js'
import { createCanvas } from 'canvas'
import { customCanvasBackgroundColor } from './plugins'

const RED = 'rgba(255, 99, 132)'
const GREEN = 'rgba(75, 192, 192)'

export interface BarChartEntry {
  yValue: number,
  xValue: number,
  barLabel: string,
  label?: string
}

export default class BarChart {
  public static getImage (entries: BarChartEntry[], width = 2000, height = 1000): string {
    Chart.defaults.font.weight = 'bold'
    Chart.defaults.font.size = 24

    // Chartjs requires is requiring canvas.getContext('2d')
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: entries.map((entry) => entry.xValue),
        datasets: [{
          data: entries.map((entry) => ({ y: entry.yValue, x: entry.xValue, label: entry.barLabel })),
          backgroundColor: entries.map(((row) => row.xValue <= 2 ? RED : GREEN)),
          borderColor: entries.map(((row) => row.xValue <= 2 ? RED : GREEN)),
          borderWidth: 1,
        }],
      },
      options: {
        elements: {
          bar: {
            borderRadius: 10
          },
        },
        plugins: {
          legend: {
            display: true,
            labels: {
              generateLabels: ((_: Chart) => [
                {text: 'low replica count', fillStyle: RED, strokeStyle: '#fff'},
                {text: 'healthy replica count', fillStyle: GREEN, strokeStyle: '#fff'}
              ])
            }
          },
          title: {
            display: true,
            text: 'Deal Bytes by Number of Replicas'
          },
          // @ts-ignore
          customCanvasBackgroundColor: {
            color: '#fff',
          }
        },
        scales: {
          y: {
            title: {
              display: true,
              text: 'Total Deal Size'
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
              text: 'Number of Replicas',
            },
            ticks: {
              count: 0
            }
          },
        },
      },
      plugins: [customCanvasBackgroundColor]
    })
    return chart.toBase64Image().split(',')[1]
  }
}

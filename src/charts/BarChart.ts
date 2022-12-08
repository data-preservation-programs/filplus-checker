import { Chart } from 'chart.js'
import { createCanvas } from 'canvas'
import { ReplicationDistribution } from '../checker/Types'
import xbytes from 'xbytes'

const RED = 'rgba(255, 99, 132)'
const GREEN = 'rgba(75, 192, 192)'

export default class BarChart {
  private config: any
  public readonly data: any
  public readonly options: any

  constructor(data: ReplicationDistribution[], opts: any = {}) {
    this.data = data
    this.options = opts
  }

  public generateChartImage(): string {
    this.generateConfig()

    // Chartjs requires is requiring canvas.getContext('2d')
    const canvas = createCanvas(800, 400)
    const ctx = canvas.getContext('2d')

    const chart = new Chart(ctx, this.config)
    return chart.toBase64Image().split(',')[1]
  }

  private generateConfig(): any {
    this.config = {
      type: 'bar',
      data: {
        labels: this.data.map((d: ReplicationDistribution) => d.num_of_replicas),
        datasets: [{
          data: this.data.map((d: ReplicationDistribution) => {
            return { y: parseFloat(d.total_deal_size), x: d.num_of_replicas, label: xbytes(parseFloat(d.total_deal_size)) }
          }),
          backgroundColor: this.data.map(((row: ReplicationDistribution) => row.num_of_replicas <= 2 ? RED : GREEN)),
          borderColor: this.data.map(((row: ReplicationDistribution) => row.num_of_replicas <= 2 ? RED : GREEN)),
          borderWidth: 1,
        }],
      },
      options: {
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
          bounds: 'data',
          axis: 'x',
          grid: {
            display: false,
            drawBorder: false,
            drawOnChartArea: false,
            drawTicks: false,
            offset: false,
            z: 0
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
              text: 'Number of Replicas'
            },
            ticks: {
              count: 0
            }
          },
        },
      }
    }
  }
}

import { Chart } from 'chart.js';
import { createCanvas } from 'canvas' // loadImage
import { ReplicationDistribution } from '../checker/Types';
// import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

const RED = 'rgba(255, 99, 132)'
const GREEN = 'rgba(75, 192, 192)'

export default class BarChart {
  private config: any;
  public readonly data: any;
  public readonly options: any;

  constructor(data: ReplicationDistribution[], opts: any = {}) {
    this.data = data;
    this.options = opts;
  }

  public generateChartImage(): string {
    this.generateConfig();

    // Chartjs requires is requiring canvas.getContext('2d')
    const canvas = createCanvas(800, 400)
    const ctx = canvas.getContext('2d');

    const chart = new Chart(ctx, this.config);

    return chart.toBase64Image();
  }

  private generateConfig(): any {
    return {
        type: 'bar',
        data: {
          labels: this.data.map((row: ReplicationDistribution) => row.num_of_replicas),
          datasets: [
            {
              legend: {
                display: false,
              },
              label: 'Total Deal Size (TiB)',
              data: this.data.map((row: ReplicationDistribution) => parseFloat(row.total_deal_size)),
              backgroundColor: this.data.map(((row: ReplicationDistribution) => row.num_of_replicas <= 2 ? RED : GREEN)),
              borderColor: this.data.map(((row: ReplicationDistribution) => row.num_of_replicas <= 2 ? RED : GREEN)),
              borderWidth: 1
          },
        ]
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Total Deal Size (TiB)'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Number of Replicas'
            }
          }
        }
      },
      plugins: {
        title: {
          display: true,
          text: 'Deal Bytes by Number of Replicas'
        },
        legend: {
          display: false,
        }
      }
    }
  }
}

// private generateConfig(): void {
//   this.config = {
//     type: 'bar',
//     labels: this.data.map((d: ReplicationDistribution) => d.total_deal_size),
//     datasets: [{
//       label: 'Deal Distribtuon Data',
//       data: this.data.map((d: ReplicationDistribution) => d.num_of_replicas),
//       backgroundColor: [
//         'rgba(255, 99, 132, 0.2)',
//         'rgba(255, 159, 64, 0.2)',
//         'rgba(255, 205, 86, 0.2)',
//         'rgba(75, 192, 192, 0.2)',
//         'rgba(54, 162, 235, 0.2)',
//         'rgba(153, 102, 255, 0.2)',
//         'rgba(201, 203, 207, 0.2)'
//       ],
//       borderColor: [
//         'rgb(255, 99, 132)',
//         'rgb(255, 159, 64)',
//         'rgb(255, 205, 86)',
//         'rgb(75, 192, 192)',
//         'rgb(54, 162, 235)',
//         'rgb(153, 102, 255)',
//         'rgb(201, 203, 207)'
//       ],
//       borderWidth: 1
//     }]
//   };
// }
// }



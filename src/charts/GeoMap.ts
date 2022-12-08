import * as worldJson from '../../assets/countries-110m.json'
import * as ChartGeo from 'chartjs-chart-geo'
import { GeometryCollection } from 'topojson-specification'
import {
  BubbleMapController,
  ColorScale,
  Feature, GeoFeature,
  ProjectionScale,
  SizeLogarithmicScale,
  SizeScale
} from 'chartjs-chart-geo'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import { Chart } from 'chart.js'
import { createCanvas } from 'canvas'

export interface GeoMapEntry {
  label: string
  value: number
  latitude: number
  longitude: number
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export default class GeoMap {
  private static countries: Feature[]

  static {
    Chart.register(BubbleMapController, ColorScale, ProjectionScale, SizeScale, SizeLogarithmicScale, GeoFeature, ChartDataLabels)
    const world = worldJson as any
    GeoMap.countries = ChartGeo.topojson.feature(world, world.objects.countries as GeometryCollection).features
  }

  public static getImage (entries: GeoMapEntry[], width = 2000, height = 1000): string {
    const canvas = createCanvas(width, height) as any
    const doc = {
      createElement: () => {
        return createCanvas(width, height)
      }
    }

    canvas.ownerDocument = doc
    const ctx = canvas.getContext('2d')
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const chart = new Chart(ctx, <any>{
      type: 'bubbleMap',
      data: {
        labels: entries.map(e => e.label),
        datasets: [{
          outline: GeoMap.countries,
          outlineBackgroundColor: '#BDBDBD',
          outlineBorderWidth: 0.3,
          outlineBorderColor: 'rgba(0,0,0,1)',
          showOutline: true,
          backgroundColor: '#424242',
          data: entries
        }]
      },
      options: {
        plugins: {
          legend: {
            display: false
          },
          datalabels: {
            align: 'top',
            font: {
              size: 18
            },
            padding: {
              bottom: 20
            },
            formatter: (v: GeoMapEntry) => {
              return v.label
            }
          }
        },
        scales: {
          xy: {
            projection: 'equirectangular'
          },
          r: {
            type: 'sizeLogarithmic',
            range: [5, 20]
          }
        }
      }
    })

    return chart.toBase64Image().split(',')[1]
  }
}

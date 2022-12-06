
import { Chart, BasicPlatform } from 'chart.js';
import * as WorldJson from '../../assets/world.json';
import { Topology, GeometryCollection } from 'topojson-specification';
import {GeoFeature, BubbleMapController, ColorScale, ProjectionScale, SizeLogarithmicScale, SizeScale } from 'chartjs-chart-geo';
import * as ChartGeo from 'chartjs-chart-geo';
import { createCanvas } from 'canvas';
import { ProviderDistribution } from '../checker/Types';

// import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

export default class DealDistributionMap {
  private countries: any
  public readonly data: any;
  public readonly options: any;

  public constructor(data: ProviderDistribution[], opts: any = {}) {
    this.data = data;
    this.options = opts;
    this.initCountries();
  }

  private initCountries() {
    const json = WorldJson as unknown as Topology;
    this.countries = ChartGeo.topojson.feature(json, json.objects.countries as GeometryCollection).features;

    console.log(this.countries)
  }

  public async generateChartImage(): Promise<string> {
    // const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 800, height: 400 });
    // const dataUrl = await chartJSNodeCanvas.renderToDataURL(this.exampleConfig());

    const canvas = createCanvas(800, 400)
    const ctx = canvas.getContext('2d');
    Chart.register(BubbleMapController, ColorScale, ProjectionScale, SizeScale, SizeLogarithmicScale);


    Chart.register(GeoFeature, BubbleMapController, ColorScale);

    const chart = new Chart(
      ctx,
      this.exampleConfig()
    )

    return chart.toBase64Image();
  }

  private exampleConfig(): any {
    return {
      type: 'bubbleMap',
      platform: BasicPlatform,
      data: {
        datasets: [{
          outline: this.countries,
          showOutline: true,
          backgroundColor: 'steelblue',
          data: this.data.map((d: any) => Object.assign(d, {value: d.total_deal_size})),
        }]
      },
      options: {
        plugins: {
          legend: {
            display: false
          },
        },
      },
      plugins: {
        title: {
            display: true,
            text: '',
            padding: {
                top: 10,
                bottom: 30
            }
        }
      }
    }
  }
}

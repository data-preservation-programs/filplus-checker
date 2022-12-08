import { Chart } from "chart.js";

export const customCanvasBackgroundColor = {
  id: 'customCanvasBackgroundColor',
  beforeDraw: (chart: Chart, _args: any, options: any) => {
    const {ctx} = chart;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = options.color || '#fff';
    ctx.fillRect(0, 0, chart.width, chart.height);
    ctx.restore();
  }
};

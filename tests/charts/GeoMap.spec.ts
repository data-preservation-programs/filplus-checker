import * as fs from "fs";
import GeoMap, {GeoMapEntry} from "../../src/charts/GeoMap"

describe('GeoMap', () => {
  it('should generate a chart image', async () => {
    const data: GeoMapEntry[] = [
      {
        label: 'f01000',
        value: 32 * 1024 ** 3,
        latitude: 32,
        longitude: -86,
      },
      {
        label: 'f02000',
        value: 1.5 * 1024 ** 5,
        latitude: 58,
        longitude: -134,
      },
      {
        label: 'f03000',
        value: 3 * 1024 ** 4,
        latitude: 41,
        longitude: -70,
      },
      {
        label: 'f04000',
        value: 300 * 1024 ** 4,
        latitude: 44,
        longitude: -100,
      },
    ]

    const image = GeoMap.getImage(data)
    fs.writeFileSync('tests/fixtures/geomap.png', image, 'base64')
    expect(fs.readFileSync('tests/fixtures/geomap.png', 'base64')).toEqual(image)
  })
})

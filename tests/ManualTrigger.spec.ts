import {manualTrigger} from "../src/ManualTrigger";
import * as fs from 'fs';

xdescribe('manualTrigger', () => {
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 86400000
  it('should trigger the check', async () => {
    const i = 1126
    console.log(`Triggering ${i}`)
    const event = {
      queryStringParameters: {
        issueId: i.toString()
      }
    }
    const body = await manualTrigger(event as any, {} as any)
    console.log(body.statusCode)
    fs.writeFileSync('manual_test_report.md', body.body)
  })
})

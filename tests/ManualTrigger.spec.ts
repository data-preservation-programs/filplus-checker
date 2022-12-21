import {manualTrigger} from "../src/ManualTrigger";

xdescribe('manualTrigger', () => {
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 86400000
  it('should trigger the check', async () => {
    const i = 1006
    console.log(`Triggering ${i}`)
    const event = {
      queryStringParameters: {
        issueId: i.toString()
      }
    }
    const body = await manualTrigger(event as any, {} as any)
    console.log(body.statusCode)
    console.log(`Finished ${i}`)
  })
})

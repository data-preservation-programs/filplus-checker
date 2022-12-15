import {manualTrigger} from "../src/ManualTrigger";

xdescribe('manualTrigger', () => {
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 86400000
  it ('should trigger the check', async () => {
    for (let i = 1; i <= 1500; i++) {
      console.log(`Triggering ${i}`)
      const event = {
        queryStringParameters: {
          issueId: i.toString()
        }
      }
      const body = await manualTrigger(event as any, {} as any)
      console.log(body.statusCode)
      console.log(`Finished ${i}`)
    }
  })
})

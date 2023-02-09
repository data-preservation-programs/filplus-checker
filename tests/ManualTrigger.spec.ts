import {manualTrigger} from "../src/ManualTrigger";

xdescribe('manualTrigger', () => {
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 86400000
  it('should trigger the check', async () => {
    const i = 339
    console.log(`Triggering ${i}`)
    const event = {
      queryStringParameters: {
        issueId: i.toString(),
        otherAddresses: 'f15cps7yo2x4fosvp45opfihk3a4wg2qukmwyet7a f1pc5usvsbfgxxbq7c7quhhg6k7l6y5reiwqr3noy'
      }
    }
    const body = await manualTrigger(event as any, {} as any)
    console.log(body.statusCode)
    console.log(`Finished ${i}`)
  })
})

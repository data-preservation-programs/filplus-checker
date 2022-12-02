import { Probot } from 'probot'

/**
  example payload, for full details see comment-created-event.json
  * @param {Probot} app
  * @param  {string} body
*/
export const parseIdentifiers = (app: Probot, body: string): Record<string, string | undefined> => {
  const text = body.replace(/[\r\n>]+/g, '')

  const notaryAddressMatch = /#### Multisig Notary address (f0\w+)/gi
  const clientAddressMatch = /#### Client address (f1\w+)/gi
  const interplanetaryMatch = /(https:\/\/filplus.d.interplanetary.one\/clients\?filter=t0\w+)/gi
  const datasetIssueMatch = /(https:\/\/github.com\/filecoin-project\/filecoin-plus-large-datasets\/issues\/\d+#issuecomment-\d+)_/gi

  const identifiers = {
    notaryAddress: text.match(notaryAddressMatch)?.at(0)?.split(' ')?.at(-1)?.trim(),
    clientAddress: text.match(clientAddressMatch)?.at(0)?.split(' ')?.at(-1)?.trim(),
    interplanetaryLink: text.match(interplanetaryMatch)?.at(0)?.trim(),
    datasetIssueLink: text.match(datasetIssueMatch)?.at(0)?.trim()
  }

  for (const [key, value] of Object.entries(identifiers)) {
    if (value === undefined) {
      app.log.error(`failed to parse ${key}`)
    }
  }

  return identifiers
}

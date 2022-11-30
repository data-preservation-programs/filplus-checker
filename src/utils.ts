import { Probot } from 'probot'

/**
  example payload, for full details see comment-created-event.json
  * {
  *   "event": "issue_comment",
  *   "payload": {
  *     "action": "created",
  *     "issue": {
  *       "comments": 4,
  *       "body": "test issue"
  *     },
  *     "comment": {
  *       "id": 1331576265,
  *       "created_at": "2022-11-30T02:46:48Z",
  *       "updated_at": "2022-11-30T02:46:48Z",
  *       "user": {
  *         "login": "brossetti1",
  *         "id": 5998100,
  *         "type": "User"
  *       },
  *       "body": "## Stats & Info for DataCap Allocation\r\n    \r\n#### Multisig Notary address\r\n> f01858410\r\n    \r\n#### Client address\r\n> f1bstbq5bi72kyovhh7zoo2f6l6uivsjz4ey5dnqq \r\n\r\n    \r\n#### Last two approvers\r\n> **kernelogic** & **cryptowhizzard** \r\n\r\n    \r\n#### Rule to calculate the allocation request amount\r\n> 400% of weekly dc amount requested\r\n    \r\n#### DataCap allocation requested\r\n> 400TiB\r\n    \r\n#### Total DataCap granted for client so far\r\n> 350TiB\r\n    \r\n#### Datacap to be granted to reach the total amount requested by the client (5 PiB)\r\n> 4.65PiB\r\n    \r\n#### **[Stats](https://filplus.d.interplanetary.one/clients?filter=t01943349 \"Go to stats\")**\r\n| Number of deals  | Number of storage providers | Previous DC Allocated  |  Top provider | Remaining DC\r\n|---|---|---|---|---|\r\n| 6575  | 26  |  200TiB | 18.26  | 42.28TiB\r\n\r\n_Originally posted by @large-datacap-requests[bot] in https://github.com/filecoin-project/filecoin-plus-large-datasets/issues/917#issuecomment-1315037140_",
  *     }
  *   }
  * }
  * @param {Probot} app
  * @param  {string} body
  * @returns string
*/
export const parseIdentifiers = (app: Probot, body: string) => {
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
    if (!value) {
      app.log.error(`failed to parse ${key}`)
    }
  }

  return identifiers
}

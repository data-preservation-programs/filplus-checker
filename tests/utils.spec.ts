import { parseIdentifiers } from "../src/utils";

const HEXREF = '0,1,2,3,4,5,6,7,8,9,a,b,c,d,e,f'.split(',')
const getRandomId = (length: number, type: 'hexidecimal' | 'number' = 'number') => {
  let result = ''

  switch (type) {
    case 'hexidecimal':
      for (let i = 0; i < length; i++) {
        result += HEXREF[Math.floor(Math.random() * HEXREF.length)]
      }
      break;
    default:
      for (let i = 0; i < length; i++) {
        result += Math.floor(Math.random() * 10)
      }
      break;
  }

  return result;
}

describe('utils', () => {
  const appStub = {log: {info: () => {}, error: () => {}}} as any;
  const notaryAddress = `f0${getRandomId(39)}`
  const clientAddress = `f1${getRandomId(39, 'hexidecimal')}`
  const interplanetaryLink = `https://filplus.d.interplanetary.one/clients?filter=t0${getRandomId(8)}`
  const datasetIssueLink = `https://github.com/filecoin-project/filecoin-plus-large-datasets/issues/${getRandomId(2)}#issuecomment-${getRandomId(6)}_`

  const body = `## Stats & Info for DataCap Allocation\r\n
    \r\n#### Multisig Notary address\r\n> ${notaryAddress}\r\n
    \r\n#### Client address\r\n> ${clientAddress} \r\n\r\n
    \r\n#### Last two approvers\r\n> **kernelogic** & **cryptowhizzard** \r\n\r\n
    \r\n#### Rule to calculate the allocation request amount\r\n> 400% of weekly dc amount requested\r\n
    \r\n#### DataCap allocation requested\r\n> 400TiB\r\n
    \r\n#### Total DataCap granted for client so far\r\n> 350TiB\r\n
    \r\n#### Datacap to be granted to reach the total amount requested by the client (5 PiB)\r\n> 4.65PiB\r\n
    \r\n#### **[Stats](${interplanetaryLink} \"Go to stats\")**\r\n| Number of deals  | Number of storage providers | Previous DC Allocated  |  Top provider | Remaining DC\r\n|---|---|---|---|---|\r\n| 6575  | 26  |  200TiB | 18.26  | 42.28TiB\r\n
    \r\n_Originally posted by @large-datacap-requests[bot] in ${datasetIssueLink}"
  `

  it('match comment variables', () => {
    const result = parseIdentifiers(appStub, body)
    expect(result).toEqual({
      notaryAddress,
      clientAddress,
      interplanetaryLink,
      datasetIssueLink,
    });
  })
})

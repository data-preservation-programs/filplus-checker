// @ts-nocheck
/* eslint-disable */
import { regexForAdress } from '../common-utils'

export function parseNewLdn (trimmed) {
  const data = {
    name: 'Data Owner Name',
    region: "Data Owner Country/Region", //eslint-disable-line
    website: 'Website',
    datacapRequested: 'Total amount of DataCap being requested',
    dataCapWeeklyAllocation: 'Weekly allocation of DataCap requested',
    address: 'On-chain address for first allocation',
    isCustomNotary: 'Custom multisig',
    identifier: 'Identifier',
    dataType: 'Data Type of Application'
  }

  const parsedData = {
    name: '',
    region: "", //eslint-disable-line
    website: '',
    datacapRequested: '',
    dataCapWeeklyAllocation: '',
    address: '',
    isCustomNotary: '',
    identifier: '',
    dataType: '',
    correct: true,
    errorMessage: '',
    errorDetails: '',
    isAddressFormatted: false
  }

  for (const [k, v] of Object.entries(data)) {
    const rg = new RegExp(`(?<=${v})(.*?)(?=#)`)
    const regexIsNull =
      !trimmed.match(rg) || !trimmed.match(rg).length || !trimmed.match(rg)[0]

    if ((k === 'identifier' || k === 'Custom multisig') && regexIsNull) { continue }

    if (regexIsNull) {
      parsedData.correct = false
      parsedData.errorMessage += `We could not find **${v}** field in the information provided\n`
      if (parsedData.errorDetails !== '') { parsedData.errorDetails = 'Unable to find required attributes.' }
      continue
    }

    parsedData[k] = trimmed.match(rg) ? trimmed.match(rg)[0] : null

    const isCustomRg = /- \[x\] Use Custom Multisig/gi

    // @ts-expect-error
    if (k === 'isCustomNotary') parsedData[k] = isCustomRg.test(parsedData[k])

    if (parsedData[k] === '_No response_') parsedData[k] = null

    if (k === 'address') {
      parsedData["isAddressFormatted"] = regexForAdress.test(parsedData[k]); //eslint-disable-line
    }
  }
  return parsedData
}

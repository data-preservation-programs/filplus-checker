// @ts-nocheck
/* eslint-disable */
import { parseNewLdn } from './parseNewLdn'
import { parseOldLDN } from './parseOldLDN'

// ldn template parser
export function parseIssue (issueContent: string) {
  const trimmed = issueContent.replace(/(\n)|(\r)/gm, '')

  if (trimmed.startsWith('### Data Owner Name')) { return parseNewLdn(trimmed) }

  return parseOldLDN(issueContent)
}

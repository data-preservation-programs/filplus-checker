import { APIGatewayProxyEventV2, APIGatewayProxyResult, Context } from 'aws-lambda'
import { getCidChecker } from './Dependency'
import pino from 'pino'
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods'
import * as dotenv from 'dotenv'
import { ProbotOctokit } from 'probot'

export async function manualTrigger (event: APIGatewayProxyEventV2, _: Context): Promise<APIGatewayProxyResult> {
  dotenv.config()
  const issueId = event.queryStringParameters?.issueId
  if (issueId === undefined) {
    return {
      statusCode: 400,
      body: 'Missing issueId'
    }
  }

  const logger = pino()
  const cidchecker = getCidChecker(logger)
  type Params = RestEndpointMethodTypes['issues']['get']['parameters']
  type Response = RestEndpointMethodTypes['issues']['get']['response']
  const params: Params = {
    owner: 'filecoin-project',
    repo: 'filecoin-plus-large-datasets',
    issue_number: parseInt(issueId)
  }
  logger.info(`Fetching issue ${issueId}`)
  let response: Response
  try {
    response = await cidchecker.octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}', params)
  } catch (e) {
    return {
      statusCode: 500,
      body: 'Error fetching issue ' + issueId
    }
  }
  const body = await cidchecker.check({
    issue: response.data,
    repository: {
      owner: {
        login: 'filecoin-project'
      },
      name: 'filecoin-plus-large-datasets',
      full_name: 'filecoin-project/filecoin-plus-large-datasets'
    }
  } as any)

  if (body !== undefined) {
    const octokit = new ProbotOctokit({
      auth: {
        token: process.env.UPLOAD_TOKEN
      }
    })
    await octokit.issues.createComment({
      owner: 'filecoin-project',
      repo: 'filecoin-plus-large-datasets',
      issue_number: parseInt(issueId),
      body
    })
  }

  return {
    statusCode: 200,
    body: ''
  }
}

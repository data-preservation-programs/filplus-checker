import { createLambdaFunction, createProbot } from '@probot/adapter-aws-lambda-serverless'
import app from './src/app'

module.exports.webhooks = createLambdaFunction(app, {
  probot: createProbot()
})

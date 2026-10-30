// handler.ts

import {
  EC2Client,
  ReleaseAddressCommand
} from '@aws-sdk/client-ec2'

import type {
  APIGatewayProxyHandler
} from 'aws-lambda'


const ec2 = new EC2Client({
  region: process.env.AWS_REGION
})


export const handler: APIGatewayProxyHandler = async (
  event
) => {

  try {

    const body =
      typeof event.body === 'string'
        ? JSON.parse(event.body)
        : event.body

    const {
      allocationId
    } = body


    if (!allocationId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'allocationId is required'
        })
      }
    }


    await ec2.send(
      new ReleaseAddressCommand({
        AllocationId: allocationId
      })
    )


    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        allocationId
      })
    }


  } catch {

    console.error(
      'Error in releaseElasticIpLambda'
    )


    return {
      statusCode: 500,
      body: JSON.stringify({
        error:
          'Internal server error in releaseElasticIpLambda'
      })
    }
  }
}
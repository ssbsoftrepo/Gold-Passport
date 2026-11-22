#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { deployInputsFromEnv, ENVIRONMENTS } from "../lib/config";
import { GoldPassportStack } from "../lib/gold-passport-stack";

const app = new cdk.App();
const inputs = deployInputsFromEnv();

// One stack per environment: `npx cdk deploy GoldPassport-staging` (or GoldPassport-production).
// Account and region come from the AWS credentials of whoever deploys (the GitHub workflow).
for (const config of Object.values(ENVIRONMENTS)) {
  new GoldPassportStack(app, `GoldPassport-${config.name}`, {
    config,
    inputs,
    description: `Gold Passport ${config.name}: web, API, database, evidence storage and sign-in`,
  });
}

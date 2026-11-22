# infra

AWS CDK app for Gold Passport: one stack per environment (`GoldPassport-staging`,
`GoldPassport-production`). How to set up and deploy: [docs/deploy.md](../docs/deploy.md).

```bash
npm ci
npm test            # CDK assertion tests
npm run synth       # CloudFormation templates into cdk.out/
npx cdk diff GoldPassport-staging     # needs AWS credentials
```

- `lib/config.ts`: sizes and settings per environment
- `lib/gold-passport-stack.ts`: the stack
- `setup/github-deploy-role.yml`: one-time GitHub OIDC deploy role (CloudFormation)

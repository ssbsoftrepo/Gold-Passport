import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { type DeployInputs, deployInputsFromEnv, ENVIRONMENTS, type EnvironmentName } from "../lib/config";
import { GoldPassportStack } from "../lib/gold-passport-stack";

const cache = new Map<string, Template>();
function synth(name: EnvironmentName, inputs: DeployInputs = {}): Template {
  const key = `${name}:${JSON.stringify(inputs)}`;
  if (!cache.has(key)) {
    const app = new cdk.App();
    const stack = new GoldPassportStack(app, `GoldPassport-${name}`, { config: ENVIRONMENTS[name], inputs });
    cache.set(key, Template.fromStack(stack));
  }
  return cache.get(key)!;
}

function backendEnvironment(template: Template): Record<string, unknown> {
  const tasks = template.findResources("AWS::ECS::TaskDefinition");
  for (const task of Object.values(tasks)) {
    for (const container of task.Properties.ContainerDefinitions) {
      if (container.Name === "backend") {
        return Object.fromEntries(container.Environment.map((e: { Name: string; Value: unknown }) => [e.Name, e.Value]));
      }
    }
  }
  throw new Error("backend container not found");
}

function webBuildArgs(name: EnvironmentName, inputs: DeployInputs = {}): Record<string, string> {
  const app = new cdk.App();
  const stack = new GoldPassportStack(app, `GoldPassport-${name}`, { config: ENVIRONMENTS[name], inputs });
  const assembly = app.synth();
  const manifest = JSON.parse(readFileSync(path.join(assembly.directory, `${stack.artifactId}.assets.json`), "utf8"));
  const images = Object.values(manifest.dockerImages) as { source: { dockerFile?: string; dockerBuildArgs?: Record<string, string> } }[];
  const web = images.find((image) => !image.source.dockerFile);
  assert.ok(web, "web image asset");
  return web.source.dockerBuildArgs ?? {};
}

/** Every ingress rule in the template, inline or standalone. */
function ingressRules(template: Template): Record<string, unknown>[] {
  const inline = Object.values(template.findResources("AWS::EC2::SecurityGroup")).flatMap(
    (group) => group.Properties.SecurityGroupIngress ?? [],
  );
  const standalone = Object.values(template.findResources("AWS::EC2::SecurityGroupIngress")).map((r) => r.Properties);
  return [...inline, ...standalone];
}

for (const name of ["staging", "production"] as const) {
  describe(`GoldPassport-${name}`, () => {
    const template = synth(name);

    it("exposes only CloudFront: internal load balancer, no open security group", () => {
      template.hasResourceProperties("AWS::ElasticLoadBalancingV2::LoadBalancer", { Scheme: "internal" });
      template.resourceCountIs("AWS::CloudFront::Distribution", 1);
      template.resourceCountIs("AWS::CloudFront::VpcOrigin", 1);
      const rules = ingressRules(template);
      assert.ok(rules.length > 0);
      for (const rule of rules) {
        assert.equal(rule.CidrIp, undefined, "ingress comes from security groups or CloudFront only");
        assert.equal(rule.CidrIpv6, undefined, "ingress comes from security groups or CloudFront only");
      }
      template.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
        FromPort: 80,
        SourcePrefixListId: Match.anyValue(),
      });
    });

    it("routes /api/* to the backend and everything else to the web app", () => {
      template.hasResourceProperties("AWS::ElasticLoadBalancingV2::ListenerRule", {
        Conditions: [{ Field: "path-pattern", PathPatternConfig: { Values: ["/api/*"] } }],
      });
      template.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
        Port: 8080,
        HealthCheckPath: "/actuator/health/readiness",
      });
      template.hasResourceProperties("AWS::CloudFront::Distribution", {
        DistributionConfig: Match.objectLike({
          DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: "redirect-to-https" }),
          PriceClass: "PriceClass_All",
        }),
      });
    });

    it("forwards the Authorization header to the API without caching responses", () => {
      template.hasResourceProperties("AWS::CloudFront::CachePolicy", {
        CachePolicyConfig: Match.objectLike({
          DefaultTTL: 0,
          ParametersInCacheKeyAndForwardedToOrigin: Match.objectLike({
            HeadersConfig: { HeaderBehavior: "whitelist", Headers: ["Authorization"] },
          }),
        }),
      });
    });

    it("keeps the database private, encrypted and backed up", () => {
      const db = ENVIRONMENTS[name].database;
      template.hasResourceProperties("AWS::RDS::DBInstance", {
        Engine: "postgres",
        EngineVersion: Match.stringLikeRegexp("^16\\."),
        PubliclyAccessible: false,
        StorageEncrypted: true,
        MultiAZ: db.multiAz,
        DeletionProtection: db.deletionProtection,
        BackupRetentionPeriod: db.backupRetentionDays,
      });
      template.hasResourceProperties("AWS::SecretsManager::Secret", {
        GenerateSecretString: Match.objectLike({ SecretStringTemplate: '{"username":"goldpassport"}' }),
      });
    });

    it("stores evidence with Object Lock, versioning and a customer-managed key, and keeps it", () => {
      template.hasResource("AWS::S3::Bucket", {
        DeletionPolicy: "Retain",
        Properties: Match.objectLike({
          ObjectLockEnabled: true,
          ObjectLockConfiguration: {
            ObjectLockEnabled: "Enabled",
            Rule: { DefaultRetention: { Mode: ENVIRONMENTS[name].evidence.lockMode, Days: ENVIRONMENTS[name].evidence.retentionDays } },
          },
          VersioningConfiguration: { Status: "Enabled" },
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            BlockPublicPolicy: true,
            IgnorePublicAcls: true,
            RestrictPublicBuckets: true,
          },
          BucketEncryption: {
            ServerSideEncryptionConfiguration: [
              Match.objectLike({ ServerSideEncryptionByDefault: Match.objectLike({ SSEAlgorithm: "aws:kms" }) }),
            ],
          },
        }),
      });
      template.hasResourceProperties("AWS::KMS::Key", { EnableKeyRotation: true });
    });

    it("signs people in with phone number + PIN, never by SMS", () => {
      template.hasResourceProperties("AWS::Cognito::UserPool", {
        UserPoolTier: "LITE",
        UsernameAttributes: ["phone_number"],
        Policies: Match.objectLike({
          PasswordPolicy: Match.objectLike({
            MinimumLength: 6,
            RequireLowercase: false,
            RequireUppercase: false,
            RequireNumbers: false,
            RequireSymbols: false,
            TemporaryPasswordValidityDays: 7,
          }),
        }),
        AccountRecoverySetting: { RecoveryMechanisms: [{ Name: "admin_only", Priority: 1 }] },
        LambdaConfig: { PreSignUp: Match.anyValue() },
        MfaConfiguration: "OFF",
      });
      const pool = Object.values(template.findResources("AWS::Cognito::UserPool"))[0].Properties;
      assert.equal(pool.SmsConfiguration, undefined, "no SMS configuration");
      assert.deepEqual(pool.AutoVerifiedAttributes ?? [], [], "no phone verification by SMS");
      assert.equal(
        Object.values(template.findResources("AWS::IAM::Role")).some((role) =>
          JSON.stringify(role.Properties.AssumeRolePolicyDocument).includes("cognito-idp.amazonaws.com"),
        ),
        false,
        "no role for Cognito to send SMS",
      );
      template.hasResourceProperties("AWS::Lambda::Function", {
        Code: { ZipFile: Match.stringLikeRegexp("autoConfirmUser = true") },
      });
      template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
        GenerateSecret: false,
        ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
        PreventUserExistenceErrors: "ENABLED",
      });
    });

    it("lets the backend reset a forgotten PIN and nothing more in Cognito", () => {
      assert.ok(backendEnvironment(template).PMD_COGNITO_USER_POOL_ID, "the backend knows the user pool");
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: ["cognito-idp:AdminSetUserPassword", "cognito-idp:AdminUserGlobalSignOut"],
              Resource: { "Fn::GetAtt": [Match.stringLikeRegexp("^Users"), "Arn"] },
            }),
          ]),
        },
      });
    });

    it("configures the backend for AWS, never the local profile", () => {
      const env = backendEnvironment(template);
      assert.equal(env.SPRING_PROFILES_ACTIVE, "aws");
      assert.equal(env.PMD_AUTH_MODE, "cognito");
      assert.equal(env.PMD_STORAGE_PROVIDER, "s3");
      assert.equal(env.PMD_PUSH_PROVIDER, "log");
      assert.equal(env.PMD_KYC_PROVIDER, ENVIRONMENTS[name].kycProvider);
      assert.ok(env.PMD_AUTH_CORSALLOWEDORIGINS_0, "the CloudFront origin is allowed");
      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: [
          Match.objectLike({
            Name: "backend",
            Secrets: [
              Match.objectLike({ Name: "DB_USERNAME" }),
              Match.objectLike({ Name: "DB_PASSWORD" }),
            ],
          }),
        ],
      });
    });

    it("makes the first admin with a one-off task, passing the phone as a quoted psql variable", () => {
      const tasks = Object.values(template.findResources("AWS::ECS::TaskDefinition"));
      const admin = tasks
        .flatMap((task) => task.Properties.ContainerDefinitions)
        .find((container: { Name: string }) => container.Name === "make-admin");
      assert.ok(admin, "make-admin container");
      const sql = admin.Environment.find((e: { Name: string }) => e.Name === "MAKE_ADMIN_SQL").Value as string;
      assert.match(sql, /:'phone'/);
      assert.doesNotMatch(sql, /\$ADMIN_PHONE/);
      assert.match(admin.Command[2], /psql -v ON_ERROR_STOP=1 -v phone="\$ADMIN_PHONE"/);
      assert.ok(template.toJSON().Outputs.MakeAdminCommand, "the CloudShell command is an output");
    });

    it("rolls back a release that never becomes healthy", () => {
      const services = template.findResources("AWS::ECS::Service");
      assert.equal(Object.keys(services).length, 2, "backend and web");
      for (const service of Object.values(services)) {
        assert.deepEqual(service.Properties.DeploymentConfiguration.DeploymentCircuitBreaker, {
          Enable: true,
          Rollback: true,
        });
        assert.equal(service.Properties.DesiredCount >= 1, true);
      }
    });
  });
}

describe("web build", () => {
  it("calls the API on its own origin", () => {
    assert.equal(webBuildArgs("staging").NEXT_PUBLIC_API_BASE_URL, "");
  });
  it("ships only Phase 1 to production and every feature to staging", () => {
    assert.equal(webBuildArgs("production").NEXT_PUBLIC_RELEASE_PHASE, "1");
    assert.equal(webBuildArgs("staging").NEXT_PUBLIC_RELEASE_PHASE, undefined);
  });
  it("adds Sentry only when a DSN is configured", () => {
    assert.equal(webBuildArgs("staging").NEXT_PUBLIC_SENTRY_DSN, undefined);
    const args = webBuildArgs("staging", { webSentryDsn: "https://key@o1.ingest.sentry.io/1" });
    assert.equal(args.NEXT_PUBLIC_SENTRY_DSN, "https://key@o1.ingest.sentry.io/1");
    assert.equal(args.NEXT_PUBLIC_SENTRY_ENVIRONMENT, "staging");
  });
});

describe("push notifications", () => {
  const android = "arn:aws:sns:sa-east-1:111111111111:app/GCM/pmd-android";

  it("switch on with an SNS platform application and may only publish to endpoints", () => {
    const template = synth("staging", { snsAndroidArn: android });
    const env = backendEnvironment(template);
    assert.equal(env.PMD_PUSH_PROVIDER, "sns");
    assert.equal(env.PMD_SNS_ANDROID_ARN, android);
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: "sns:CreatePlatformEndpoint", Resource: android }),
          Match.objectLike({ Action: "sns:Publish" }),
        ]),
      },
    });
  });

  it("read optional settings from the environment, ignoring blanks", () => {
    assert.deepEqual(deployInputsFromEnv({ PMD_SNS_ANDROID_ARN: android, PMD_SNS_IOS_ARN: " ", NEXT_PUBLIC_SENTRY_DSN: "" }), {
      snsAndroidArn: android,
      snsIosArn: undefined,
      webSentryDsn: undefined,
    });
  });
});

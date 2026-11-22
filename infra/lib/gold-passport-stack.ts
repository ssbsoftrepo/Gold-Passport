import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import type { DeployInputs, EnvironmentConfig } from "./config";

export interface GoldPassportStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
  readonly inputs?: DeployInputs;
  /** Repository root holding backend/ and apps/web/ (defaults to the parent of infra/). */
  readonly repoRoot?: string;
}

const DATABASE_NAME = "goldpassport";
const CLOUDFRONT_PREFIX_LIST = "com.amazonaws.global.cloudfront.origin-facing";

/**
 * One complete Gold Passport environment (docs/deploy.md):
 *
 *   browser / mobile app ──HTTPS──> CloudFront ──VPC origin──> internal load balancer
 *       /api/*  -> backend (ECS Fargate)  -> RDS PostgreSQL, S3 evidence bucket, Cognito, SNS
 *       else    -> web (ECS Fargate, Next.js)
 *
 * Nothing but CloudFront is reachable from the internet: the load balancer, containers and
 * database sit in private subnets. The web app calls the API on its own origin, so no CORS.
 */
export class GoldPassportStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GoldPassportStackProps) {
    super(scope, id, props);
    const { config } = props;
    const inputs = props.inputs ?? {};
    const repoRoot = props.repoRoot ?? path.join(__dirname, "..", "..");
    const production = config.name === "production";
    const retainOrDestroy = production ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    cdk.Tags.of(this).add("project", "gold-passport");
    cdk.Tags.of(this).add("environment", config.name);

    // ---------------------------------------------------------------- network
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: config.natGateways,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "app", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 22 },
        { name: "data", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
      // Evidence uploads reach S3 without crossing the NAT gateway.
      gatewayEndpoints: { S3: { service: ec2.GatewayVpcEndpointAwsService.S3 } },
    });

    // ---------------------------------------------------------------- database
    const database = new rds.DatabaseInstance(this, "Database", {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16_13 }),
      instanceType: new ec2.InstanceType(config.database.instanceType),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      databaseName: DATABASE_NAME,
      // The password is generated and kept in Secrets Manager; nobody types it anywhere.
      credentials: rds.Credentials.fromGeneratedSecret("goldpassport"),
      multiAz: config.database.multiAz,
      allocatedStorage: config.database.allocatedStorageGiB,
      maxAllocatedStorage: config.database.allocatedStorageGiB * 4,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      backupRetention: cdk.Duration.days(config.database.backupRetentionDays),
      deletionProtection: config.database.deletionProtection,
      removalPolicy: production ? cdk.RemovalPolicy.SNAPSHOT : cdk.RemovalPolicy.DESTROY,
      autoMinorVersionUpgrade: true,
      cloudwatchLogsExports: ["postgresql"],
      cloudwatchLogsRetention: config.logRetentionDays as logs.RetentionDays,
    });

    // ---------------------------------------------------------------- evidence files
    const evidenceKey = new kms.Key(this, "EvidenceKey", {
      description: `Gold Passport ${config.name} evidence files`,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const retention = cdk.Duration.days(config.evidence.retentionDays);
    const evidence = new s3.Bucket(this, "EvidenceBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: evidenceKey,
      bucketKeyEnabled: true,
      versioned: true,
      // Evidence must not be deletable: Object Lock can only be switched on when the bucket is created.
      objectLockEnabled: true,
      objectLockDefaultRetention:
        config.evidence.lockMode === "COMPLIANCE"
          ? s3.ObjectLockRetention.compliance(retention)
          : s3.ObjectLockRetention.governance(retention),
      lifecycleRules: [
        {
          id: "glacier-instant-retrieval",
          transitions: [
            { storageClass: s3.StorageClass.GLACIER_INSTANT_RETRIEVAL, transitionAfter: cdk.Duration.days(90) },
          ],
        },
      ],
      // Locked objects outlive the stack on purpose.
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ---------------------------------------------------------------- sign-in (Cognito)
    const userPool = new cognito.UserPool(this, "Users", {
      userPoolName: `gold-passport-${config.name}`,
      // Choice-based sign-in with SMS codes needs the Essentials plan.
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: true,
      signInAliases: { phone: true },
      autoVerify: { phone: true },
      standardAttributes: { phoneNumber: { required: true, mutable: true } },
      // Passwordless: users sign in with a code sent by SMS (Cognito requires password to stay listed).
      signInPolicy: { allowedFirstAuthFactors: { password: true, smsOtp: true } },
      accountRecovery: cognito.AccountRecovery.PHONE_ONLY_WITHOUT_MFA,
      mfa: cognito.Mfa.OFF,
      deletionProtection: production,
      removalPolicy: retainOrDestroy,
    });
    const appClient = userPool.addClient("AppClient", {
      userPoolClientName: "gold-passport-apps",
      generateSecret: false,
      authFlows: { user: true },
      disableOAuth: true,
      // The apps sign new phone numbers up when Cognito answers UserNotFoundException.
      preventUserExistenceErrors: false,
      enableTokenRevocation: true,
      idTokenValidity: cdk.Duration.hours(1),
      accessTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // ---------------------------------------------------------------- load balancer + CloudFront
    const albSecurityGroup = new ec2.SecurityGroup(this, "LoadBalancerSecurityGroup", {
      vpc,
      description: "Gold Passport load balancer: CloudFront only",
      allowAllOutbound: false,
    });
    // CloudFront reaches the internal load balancer through a VPC origin, from its origin-facing
    // addresses. The managed prefix list id differs per region, so it is looked up at deploy time.
    const cloudFrontPrefixList = new cr.AwsCustomResource(this, "CloudFrontPrefixList", {
      onUpdate: {
        service: "EC2",
        action: "DescribeManagedPrefixLists",
        parameters: { Filters: [{ Name: "prefix-list-name", Values: [CLOUDFRONT_PREFIX_LIST] }] },
        physicalResourceId: cr.PhysicalResourceId.of(CLOUDFRONT_PREFIX_LIST),
        outputPaths: ["PrefixLists.0.PrefixListId"],
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE }),
      installLatestAwsSdk: false,
    });
    albSecurityGroup.addIngressRule(
      ec2.Peer.prefixList(cloudFrontPrefixList.getResponseField("PrefixLists.0.PrefixListId")),
      ec2.Port.tcp(80),
      "CloudFront VPC origin",
    );
    const alb = new elbv2.ApplicationLoadBalancer(this, "LoadBalancer", {
      vpc,
      internetFacing: false,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroup: albSecurityGroup,
      dropInvalidHeaderFields: true,
    });
    const listener = alb.addListener("Http", { port: 80, open: false });

    const origin = origins.VpcOrigin.withApplicationLoadBalancer(alb, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
      readTimeout: cdk.Duration.seconds(60),
    });
    // API responses are never cached (the backend sends no-store); the Authorization header is
    // part of the key only so that CloudFront forwards it on GET requests.
    const apiCachePolicy = new cloudfront.CachePolicy(this, "ApiCachePolicy", {
      comment: "Gold Passport API: forward Authorization, cache nothing",
      minTtl: cdk.Duration.seconds(0),
      defaultTtl: cdk.Duration.seconds(0),
      maxTtl: cdk.Duration.seconds(1),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList("Authorization"),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });
    const dynamic: Omit<cloudfront.BehaviorOptions, "cachePolicy"> = {
      origin,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      compress: true,
    };
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: `Gold Passport ${config.name}`,
      // South American edge locations are only in the "all" price class.
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: { ...dynamic, cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED },
      additionalBehaviors: {
        "/api/*": { ...dynamic, cachePolicy: apiCachePolicy },
        // Next.js build output has content hashes in its file names: cache it at the edge.
        "/_next/static/*": {
          origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
        },
      },
    });
    const publicUrl = `https://${distribution.distributionDomainName}`;

    // ---------------------------------------------------------------- containers
    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      containerInsightsV2: production ? ecs.ContainerInsights.ENABLED : ecs.ContainerInsights.DISABLED,
    });
    const runtimePlatform: ecs.RuntimePlatform = {
      cpuArchitecture: ecs.CpuArchitecture.X86_64,
      operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
    };
    const logGroup = (name: string) =>
      new logs.LogGroup(this, `${name}Logs`, {
        retention: config.logRetentionDays as logs.RetentionDays,
        removalPolicy: retainOrDestroy,
      });

    // Backend (Spring Boot). Images are built from the repository Dockerfiles during the deploy.
    const backendTask = new ecs.FargateTaskDefinition(this, "BackendTask", {
      cpu: config.backend.cpu,
      memoryLimitMiB: config.backend.memoryMiB,
      runtimePlatform,
    });
    const pushEnabled = Boolean(inputs.snsAndroidArn || inputs.snsIosArn);
    const kycRegion = config.kycRegion ?? this.region;
    backendTask.addContainer("backend", {
      image: ecs.ContainerImage.fromAsset(repoRoot, {
        file: "backend/Dockerfile",
        platform: Platform.LINUX_AMD64,
      }),
      portMappings: [{ containerPort: 8080 }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "backend", logGroup: logGroup("Backend") }),
      environment: {
        SPRING_PROFILES_ACTIVE: "aws",
        DB_URL: `jdbc:postgresql://${database.dbInstanceEndpointAddress}:${database.dbInstanceEndpointPort}/${DATABASE_NAME}`,
        PMD_AUTH_MODE: "cognito",
        PMD_COGNITO_ISSUER_URI: userPool.userPoolProviderUrl,
        PMD_COGNITO_REGION: this.region,
        PMD_COGNITO_CLIENT_ID: appClient.userPoolClientId,
        PMD_AUTH_CORSALLOWEDORIGINS_0: publicUrl,
        PMD_STORAGE_PROVIDER: "s3",
        PMD_S3_BUCKET: evidence.bucketName,
        PMD_S3_REGION: this.region,
        PMD_S3_KMS_KEY_ID: evidenceKey.keyArn,
        PMD_KYC_PROVIDER: config.kycProvider,
        ...(config.kycProvider === "aws" ? { PMD_KYC_REGION: kycRegion } : {}),
        PMD_PUSH_PROVIDER: pushEnabled ? "sns" : "log",
        ...(pushEnabled
          ? {
              PMD_PUSH_REGION: this.region,
              PMD_SNS_ANDROID_ARN: inputs.snsAndroidArn ?? "",
              PMD_SNS_IOS_ARN: inputs.snsIosArn ?? "",
            }
          : {}),
        // Business metrics and alarms (docs/monitoring.md).
        PMD_METRICS_CLOUDWATCH_ENABLED: "true",
        PMD_METRICS_CLOUDWATCH_NAMESPACE: "GoldPassport",
      },
      secrets: {
        DB_USERNAME: ecs.Secret.fromSecretsManager(database.secret!, "username"),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(database.secret!, "password"),
      },
    });
    evidence.grantReadWrite(backendTask.taskRole);
    backendTask.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"],
        conditions: { StringEquals: { "cloudwatch:namespace": "GoldPassport" } },
      }),
    );
    if (config.kycProvider === "aws") {
      backendTask.taskRole.addToPrincipalPolicy(
        new iam.PolicyStatement({ actions: ["rekognition:CompareFaces", "rekognition:DetectText"], resources: ["*"] }),
      );
    }
    if (pushEnabled) {
      const apps = [inputs.snsAndroidArn, inputs.snsIosArn].filter((arn): arn is string => Boolean(arn));
      backendTask.taskRole.addToPrincipalPolicy(
        new iam.PolicyStatement({ actions: ["sns:CreatePlatformEndpoint"], resources: apps }),
      );
      backendTask.taskRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ["sns:Publish"],
          resources: [this.formatArn({ service: "sns", resource: "endpoint", resourceName: "*" })],
        }),
      );
    }

    const backendService = new ecs.FargateService(this, "BackendService", {
      cluster,
      taskDefinition: backendTask,
      desiredCount: config.backend.desiredCount,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      // Database migrations (Flyway) run at startup; give the first start time.
      healthCheckGracePeriod: cdk.Duration.minutes(3),
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      // A release that never becomes healthy is rolled back automatically.
      circuitBreaker: { enable: true, rollback: true },
    });
    database.connections.allowDefaultPortFrom(backendService, "Backend");

    // Web (Next.js). It calls the API on its own origin (NEXT_PUBLIC_API_BASE_URL is empty).
    const webTask = new ecs.FargateTaskDefinition(this, "WebTask", {
      cpu: config.web.cpu,
      memoryLimitMiB: config.web.memoryMiB,
      runtimePlatform,
    });
    const webBuildArgs: Record<string, string> = { NEXT_PUBLIC_API_BASE_URL: "" };
    if (config.releasePhase) webBuildArgs.NEXT_PUBLIC_RELEASE_PHASE = config.releasePhase;
    if (inputs.webSentryDsn) {
      webBuildArgs.NEXT_PUBLIC_SENTRY_DSN = inputs.webSentryDsn;
      webBuildArgs.NEXT_PUBLIC_SENTRY_ENVIRONMENT = config.name;
    }
    webTask.addContainer("web", {
      image: ecs.ContainerImage.fromAsset(path.join(repoRoot, "apps", "web"), {
        platform: Platform.LINUX_AMD64,
        buildArgs: webBuildArgs,
      }),
      portMappings: [{ containerPort: 3000 }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "web", logGroup: logGroup("Web") }),
    });
    const webService = new ecs.FargateService(this, "WebService", {
      cluster,
      taskDefinition: webTask,
      desiredCount: config.web.desiredCount,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { enable: true, rollback: true },
    });

    // ---------------------------------------------------------------- routing
    listener.addTargets("Backend", {
      priority: 10,
      conditions: [elbv2.ListenerCondition.pathPatterns(["/api/*"])],
      port: 8080,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [backendService],
      deregistrationDelay: cdk.Duration.seconds(30),
      healthCheck: {
        path: "/actuator/health/readiness",
        healthyHttpCodes: "200",
        interval: cdk.Duration.seconds(15),
        healthyThresholdCount: 2,
      },
    });
    listener.addTargets("Web", {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [webService],
      deregistrationDelay: cdk.Duration.seconds(30),
      healthCheck: { path: "/", healthyHttpCodes: "200-399", interval: cdk.Duration.seconds(15) },
    });

    // ---------------------------------------------------------------- first PMD admin
    // The database is private, so the first admin is made with a one-off task (docs/deploy.md):
    // it pre-creates (or promotes) the user with that phone number; the account is linked on the
    // first sign-in. The phone number is passed to psql as a quoted variable, never spliced into SQL.
    const adminTask = new ecs.FargateTaskDefinition(this, "MakeAdminTask", {
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform,
    });
    adminTask.addContainer("make-admin", {
      image: ecs.ContainerImage.fromRegistry("public.ecr.aws/docker/library/postgres:16-alpine"),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "make-admin", logGroup: logGroup("MakeAdmin") }),
      environment: {
        PGHOST: database.dbInstanceEndpointAddress,
        PGPORT: database.dbInstanceEndpointPort,
        PGDATABASE: DATABASE_NAME,
        PGSSLMODE: "require",
        MAKE_ADMIN_SQL: [
          "with n as (select gen_random_uuid() as id)",
          "insert into identity.users (id, phone, role, auth_subject, created_at, updated_at)",
          "select n.id, :'phone', 'ADMIN', n.id::text, now(), now() from n",
          "on conflict (phone) do update set role = 'ADMIN', updated_at = now()",
          "returning phone, role;",
        ].join(" "),
      },
      secrets: {
        PGUSER: ecs.Secret.fromSecretsManager(database.secret!, "username"),
        PGPASSWORD: ecs.Secret.fromSecretsManager(database.secret!, "password"),
      },
      command: [
        "sh",
        "-c",
        'bad() { echo "ADMIN_PHONE must be a full number such as +51987654321" >&2; exit 2; }; ' +
          'case "$ADMIN_PHONE" in *[!0-9+]*|+*+*) bad;; +[1-9][0-9][0-9][0-9][0-9][0-9][0-9]*) ;; *) bad;; esac; ' +
          'printf "%s\\n" "$MAKE_ADMIN_SQL" | psql -v ON_ERROR_STOP=1 -v phone="$ADMIN_PHONE"',
      ],
    });
    const adminSecurityGroup = new ec2.SecurityGroup(this, "MakeAdminSecurityGroup", {
      vpc,
      description: "Gold Passport one-off admin task",
    });
    database.connections.allowDefaultPortFrom(adminSecurityGroup, "Make admin task");
    const appSubnets = vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds;

    // ---------------------------------------------------------------- outputs
    new cdk.CfnOutput(this, "Url", { value: publicUrl, description: "Web app (and API under /api)" });
    new cdk.CfnOutput(this, "MobileApiBaseUrl", {
      value: publicUrl,
      description: "EXPO_PUBLIC_API_BASE_URL for the mobile app builds (apps/mobile/eas.json)",
    });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "EvidenceBucketName", { value: evidence.bucketName });
    new cdk.CfnOutput(this, "DatabaseSecretArn", {
      value: database.secret!.secretArn,
      description: "Database credentials (Secrets Manager)",
    });
    new cdk.CfnOutput(this, "ClusterName", { value: cluster.clusterName });
    new cdk.CfnOutput(this, "MakeAdminCommand", {
      description: "Run in AWS CloudShell, with the person's phone number, to make them a PMD admin",
      value:
        `aws ecs run-task --cluster ${cluster.clusterName} --task-definition ${adminTask.family} --launch-type FARGATE` +
        ` --network-configuration "awsvpcConfiguration={subnets=[${cdk.Fn.join(",", appSubnets)}],securityGroups=[${adminSecurityGroup.securityGroupId}]}"` +
        ` --overrides '{"containerOverrides":[{"name":"make-admin","environment":[{"name":"ADMIN_PHONE","value":"+51XXXXXXXXX"}]}]}'`,
    });
  }
}

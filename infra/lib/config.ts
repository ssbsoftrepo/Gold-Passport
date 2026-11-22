/**
 * Per-environment settings. Everything an operator may want to change lives here, so a deploy
 * is always the same button press: `npx cdk deploy GoldPassport-<name>`.
 */
export type EnvironmentName = "staging" | "production";

export interface EnvironmentConfig {
  readonly name: EnvironmentName;
  /** NAT gateways: 1 is cheaper, 2 keeps outbound traffic up if one Availability Zone fails. */
  readonly natGateways: number;
  readonly database: {
    /** RDS instance class, e.g. "t4g.micro". */
    readonly instanceType: string;
    readonly multiAz: boolean;
    readonly allocatedStorageGiB: number;
    readonly backupRetentionDays: number;
    /** Production keeps the database (and a final snapshot) when the stack is deleted. */
    readonly deletionProtection: boolean;
  };
  readonly backend: { readonly cpu: number; readonly memoryMiB: number; readonly desiredCount: number };
  readonly web: { readonly cpu: number; readonly memoryMiB: number; readonly desiredCount: number };
  readonly evidence: {
    /**
     * Object Lock mode for new evidence files. GOVERNANCE can be lifted by an administrator with
     * a special permission; COMPLIANCE cannot be lifted by anyone, including the account root.
     * Switch to COMPLIANCE once legal has agreed the retention period (docs/deploy.md).
     */
    readonly lockMode: "GOVERNANCE" | "COMPLIANCE";
    readonly retentionDays: number;
  };
  /**
   * Identity checks on sign-up documents. "stub" leaves every application for a PMD reviewer
   * (Phase 1). "aws" adds automatic Amazon Rekognition checks; check that Rekognition is offered
   * in the deployment region first, or set `kycRegion`.
   */
  readonly kycProvider: "stub" | "aws";
  readonly kycRegion?: string;
  /** Release phase built into the web app (docs/releases.md); undefined = every feature. */
  readonly releasePhase?: string;
  /** CloudWatch log retention for the containers. */
  readonly logRetentionDays: number;
}

export const ENVIRONMENTS: Record<EnvironmentName, EnvironmentConfig> = {
  staging: {
    name: "staging",
    natGateways: 1,
    database: {
      instanceType: "t4g.micro",
      multiAz: false,
      allocatedStorageGiB: 20,
      backupRetentionDays: 7,
      deletionProtection: false,
    },
    backend: { cpu: 512, memoryMiB: 1024, desiredCount: 1 },
    web: { cpu: 256, memoryMiB: 512, desiredCount: 1 },
    evidence: { lockMode: "GOVERNANCE", retentionDays: 1 },
    kycProvider: "stub",
    logRetentionDays: 30,
  },
  production: {
    name: "production",
    natGateways: 2,
    database: {
      instanceType: "t4g.small",
      multiAz: true,
      allocatedStorageGiB: 50,
      backupRetentionDays: 35,
      deletionProtection: true,
    },
    backend: { cpu: 1024, memoryMiB: 2048, desiredCount: 2 },
    web: { cpu: 512, memoryMiB: 1024, desiredCount: 2 },
    evidence: { lockMode: "GOVERNANCE", retentionDays: 3650 },
    kycProvider: "stub",
    releasePhase: "1",
    logRetentionDays: 365,
  },
};

/** Optional values read from the environment at deploy time (GitHub environment variables). */
export interface DeployInputs {
  /** SNS platform application ARNs for push; push stays in the in-app inbox when unset. */
  readonly snsAndroidArn?: string;
  readonly snsIosArn?: string;
  /** Sentry DSN for the web app (docs/crash-reporting.md). */
  readonly webSentryDsn?: string;
}

export function deployInputsFromEnv(env: NodeJS.ProcessEnv = process.env): DeployInputs {
  const value = (key: string) => (env[key] && env[key]!.trim() !== "" ? env[key]!.trim() : undefined);
  return {
    snsAndroidArn: value("PMD_SNS_ANDROID_ARN"),
    snsIosArn: value("PMD_SNS_IOS_ARN"),
    webSentryDsn: value("NEXT_PUBLIC_SENTRY_DSN"),
  };
}

# Monitoring and alerts

How you know the system is working, and who is told when it stops. Everything here is for the AWS
setup in [deployment-aws.md](deployment-aws.md). It is off on laptops.

## What is watched

| Signal | Comes from | Alarm (`pmd-<env>-…`) |
| --- | --- | --- |
| API server errors (5xx rate) | Load balancer | `api-5xx-rate` |
| API response time (95th percentile) | Load balancer | `api-latency-p95` |
| API up (healthy backend tasks) | Load balancer | `api-no-healthy-backend` |
| Requests waiting for a database connection | Backend (`hikaricp.connections.*`) | `db-connections-waiting`, `db-connection-timeouts` |
| Notifications not sent (events whose listener has not completed after 15 minutes) | Backend (`pmd.events.stuck`) | `notifications-stuck` |
| Photos and documents not saved or shown (S3 calls rejected or failing) | Backend (`pmd.aws.calls`) | `evidence-storage-failing` |
| Push messages or identity checks failing (SNS, Rekognition unavailable or throttled) | Backend (`pmd.aws.calls`) | `push-or-kyc-failing` |
| Errors in the backend's logs, including background work no user sees | Backend logs | `backend-errors-logged` |
| The backend stopped sending metrics (so the alarms above cannot fire) | Backend | `metrics-missing` |
| Backend CPU and memory | ECS | `backend-cpu`, `backend-memory` |
| Database CPU and free disk | RDS | `db-cpu`, `db-storage-low` |
| How long field work waited on phones before reaching the server | Backend (`pmd.field.sync.delay`) | none: dashboard only |

The last one is the server's view of the phones' offline queues: a photo taken at a mine at 9:00
and sent from the road at 15:00 waited 6 hours. Hours are normal; a wait that keeps growing across
users means queues are not emptying. Crashes and stuck queues on the phones themselves need crash
reporting in the apps, which is not part of this yet.

Alarms email the address given when the template is deployed. Add more subscribers (SMS, a chat
webhook) to the SNS topic in the stack's outputs.

## Turning it on

1. **Task role:** allow the backend to send metrics, only to its namespace:

   ```json
   {
     "Effect": "Allow",
     "Action": "cloudwatch:PutMetricData",
     "Resource": "*",
     "Condition": { "StringEquals": { "cloudwatch:namespace": "GoldPassport/prod" } }
   }
   ```

2. **Backend environment:**

   | Variable | Value |
   | --- | --- |
   | `PMD_METRICS_CLOUDWATCH_ENABLED` | `true` |
   | `PMD_METRICS_CLOUDWATCH_NAMESPACE` | `GoldPassport/prod` (one namespace per environment: `GoldPassport/staging`, …) |
   | `LOGGING_STRUCTURED_FORMAT_CONSOLE` | `ecs`: one JSON object per log line, so CloudWatch Logs Insights can filter by level, logger and trace |

   The region and credentials come from the ECS task (`AWS_REGION`, task role).

3. **Alarms and dashboard:** deploy [`infra/monitoring.yml`](../infra/monitoring.yml) once per
   environment, after the load balancer, ECS service and database exist:

   ```bash
   aws cloudformation deploy \
     --stack-name pmd-prod-monitoring \
     --template-file infra/monitoring.yml \
     --parameter-overrides \
       EnvironmentName=prod \
       AlarmEmail=ops@example.pe \
       MetricsNamespace=GoldPassport/prod \
       LoadBalancerFullName=app/pmd-prod/0123456789abcdef \
       TargetGroupFullName=targetgroup/pmd-api/0123456789abcdef \
       EcsClusterName=pmd-prod \
       EcsServiceName=pmd-backend \
       DbInstanceId=pmd-prod \
       BackendLogGroup=/ecs/pmd-backend
   ```

   Confirm the subscription email AWS sends, or no alarm reaches you. When infrastructure as code
   arrives (CDK or Terraform), move these resources into it.

4. **Check it works:** after ten minutes the `metrics-missing` alarm should be OK and the
   dashboard `pmd-prod` should show data. Send yourself a test alarm:

   ```bash
   aws cloudwatch set-alarm-state --alarm-name pmd-prod-notifications-stuck \
     --state-value ALARM --state-reason "Testing the alarm email"
   ```

## Metrics the backend sends

Only these go to CloudWatch (`CloudWatchMetricsConfig.SENT`); request counts, latency and error
rates come free from the load balancer. CloudWatch adds a suffix to each name.

| Name in CloudWatch | Dimensions | Meaning |
| --- | --- | --- |
| `pmd.aws.calls.count` (also `.sum`, `.avg`, `.max` in ms) | `service` (`s3`, `sns`, `rekognition`, `cloudwatch`), `outcome` | AWS SDK calls. `ok`; `rejected`: AWS said no (4xx: access denied, missing object, disabled push endpoint, unreadable ID photo); `failed`: unavailable, throttled or no answer, after the SDK's retries |
| `pmd.events.stuck.value` | | Domain events whose listener has not completed after `pmd.metrics.events-stuck-after` (15 minutes) |
| `pmd.field.sync.delay.percentile.value` (ms; also `.count`, `.sum`, `.max`) | `kind` (`photo`, `gps_step`), `phi` (`0.5`, `0.95`) | Time from the phone's timestamp to arrival at the server |
| `hikaricp.connections.active.value`, `.pending.value`, `.max.value`, `.timeout.count` | `pool` | The database connection pool, per backend task |
| `backend.log.errors` | | `ERROR` lines in the backend's logs (a log metric filter in the template) |

None of them carries personal data: no user ids, phone numbers, lot codes or locations.

The AWS call metrics come from an AWS SDK interceptor registered in
`src/main/resources/software/amazon/awssdk/global/handlers/execution.interceptors`, so a new AWS
adapter is measured without code changes.

**Cost:** about 50 custom metrics (roughly US$15 a month at US$0.30 each), the alarms (US$0.10 a
month per metric they read, about US$2) and the dashboard (US$3).

## Runbook

Each alarm's description links here. Start with the dashboard (`pmd-<env>`) and the backend's
logs:

```bash
aws logs tail /ecs/pmd-backend --since 30m --filter-pattern ERROR
```

### api-5xx-rate

More than 2% of requests failed with a server error in 3 of the last 5 minutes.

1. Look at the logs for the exceptions behind the 500s (the request's path and the stack trace).
2. If it started with a deployment, roll back to the previous task definition.
3. If the database or S3 alarms are also firing, fix those first: they are usually the cause.

### api-latency-p95

The slowest 5% of requests took more than 3 seconds for 8 of the last 10 minutes.

1. Check `db-connections-waiting` and database CPU: slow queries and a full pool show up there.
2. Photo uploads from phones on weak signal are slow by nature. If only upload paths are slow
   and nothing else is wrong, raise `LatencyThresholdSeconds`.

### api-no-healthy-backend

No backend task passes the load balancer's health check (`/actuator/health/readiness`): the API
is down for everyone.

1. Look at the ECS service's events and stopped tasks (out of memory, failed to start).
2. A task that fails at startup usually logs why: a missing variable, a failed Flyway migration,
   or no database connection.
3. The phones keep queueing work while the API is down and send it when it is back.

### db-connections-waiting

Requests waited for a database connection for 5 minutes in a row (`db-connection-timeouts`:
some gave up after 30 seconds and failed).

1. Is traffic higher than usual? Add backend tasks, but keep tasks × `DB_POOL_SIZE` under the
   database's connection limit.
2. Is the database slow (CPU, locks)? Look for long-running queries:
   `select pid, now() - query_start, state, query from pg_stat_activity where state <> 'idle' order by 2 desc;`
3. Calls to AWS made while holding a database transaction keep connections busy; check the logs
   for slow S3, SNS or Rekognition calls.

### notifications-stuck

Domain events have waited more than 15 minutes for their listener, so users are not being told
about handovers, lab results or payments (Spring Modulith keeps each event in
`event_publication` until its listener succeeds).

1. Find them and the listener that fails:
   `select listener_id, event_type, count(*), min(publication_date) from event_publication where completion_date is null group by 1, 2;`
2. The logs show why the listener failed (often push or the database).
3. Incomplete events are sent again when the backend restarts
   (`spring.modulith.events.republish-outstanding-events-on-restart`); restart one task once the
   cause is fixed.

### metrics-missing

The backend sent no metrics for 10 minutes, so the other backend alarms cannot fire.

1. Is the backend running (see `api-no-healthy-backend`)?
2. Look for `error sending metric data` in the logs: usually the task role is missing
   `cloudwatch:PutMetricData` for this namespace, or `PMD_METRICS_CLOUDWATCH_NAMESPACE` differs
   from the template's `MetricsNamespace`.

### evidence-storage-failing

At least 3 calls to the evidence bucket were rejected or failed in 5 minutes: photos and
documents cannot be saved or shown. Phones keep their queued photos and retry.

1. `rejected` (dashboard, AWS calls): usually `AccessDenied` after a change to the task role, the
   bucket policy or the KMS key policy. The logs name the operation.
2. `failed`: S3 or KMS is unavailable or throttling; check the AWS Health Dashboard.

### push-or-kyc-failing

SNS or Rekognition calls failed (unavailable, throttled or no answer) at least 5 times in 5
minutes. Push is best effort (the in-app inbox is complete), and identity checks can be run again
from the back office; neither loses data. Rejected calls (a phone that uninstalled the app, an
unreadable ID photo) are normal and not counted here.

1. Check the AWS Health Dashboard and the service quotas (Rekognition calls per second).

### backend-errors-logged

At least 10 `ERROR` lines in the backend's logs in 5 minutes. This catches failures nobody sees
as an HTTP error: listeners, scheduled jobs, metric publishing.

1. Find them: CloudWatch Logs Insights on the backend's log group:

   ```
   fields @timestamp, log.logger, message, error.message
   | filter log.level = "ERROR"
   | sort @timestamp desc
   | limit 50
   ```

   (Without structured logging: `filter @message like /ERROR/`.)

### backend-cpu-or-memory

Backend tasks used more than 85% CPU, or more than 90% of their memory, for 15 minutes.

1. Add tasks or give each more CPU or memory in the task definition. The JVM uses 75% of the
   task's memory for its heap (`-XX:MaxRAMPercentage=75` in the Dockerfile).
2. Memory that only grows between deployments points to a leak: take a heap dump from one task
   before replacing it.

### db-cpu-or-storage

The database used more than 80% CPU for 15 minutes, or has less than 5 GiB of free disk.

1. CPU: find the expensive queries in RDS Performance Insights. Admin lists without pages are
   a known cause as data grows (see [handover.md](handover.md)).
2. Disk: turn on storage autoscaling for the instance or add storage. Evidence files are in S3,
   not the database, so growth should be slow; fast growth needs a look at what is being written.

# Engineering Calculator Platform

PMV/PPD and moist-air calculators deployed as a secure AWS serverless web application.

This repository is intended to grow into a collection of engineering calculation tools with a shared web interface and AWS platform.

## Architecture

- CloudFront is the public HTTPS endpoint and adds security headers.
- A private, versioned S3 bucket stores the static web application.
- CloudFront routes `/api/*` to an API Gateway HTTP API.
- Separate Python Lambda functions calculate PMV/PPD and moist-air properties.
- API requests are throttled and validated server-side.

The stack deploys independently, so existing calculators can remain available during acceptance testing and migration.

## Source layout

- `template-deploy.yaml` — canonical AWS SAM/CloudFormation template
- `functions/pmv/app.py` — ISO 7730 Fanger PMV/PPD calculation
- `functions/air/app.py` and `app_release.py` — psychrometric calculations and release handler
- `web-release/` — canonical static site
- `tests_verified/` — regression and validation tests
- `scripts/deploy-production.ps1` — AWS CLI packaging and deployment

## Validation

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -c pytest-verified.ini
```

The PMV tests include representative values captured from the legacy API. The moist-air tests cover standard conditions, reverse calculation, and invalid-input responses.

## Deployment

Prerequisites:

- Authenticated AWS CLI
- An existing private S3 artifact bucket for Lambda deployment packages

```powershell
./scripts/deploy-production.ps1 `
  -StackName engineering-calculators `
  -Region ap-northeast-1 `
  -ArtifactBucket your-private-artifact-bucket
```

The script validates and packages the template, deploys the stack, uploads `web-release/`, invalidates CloudFront, and prints the HTTPS URL.

Deploy to a parallel stack first and complete acceptance testing before removing legacy resources.

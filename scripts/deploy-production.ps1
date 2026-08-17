param(
  [string]$StackName = "engineering-calculators",
  [string]$Region = "ap-northeast-1",
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$ArtifactBucket
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PackageDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "engineering-calculators"
$PackagedTemplate = Join-Path $PackageDirectory "packaged-template.yaml"
New-Item -ItemType Directory -Path $PackageDirectory -Force | Out-Null

aws s3api head-bucket --bucket $ArtifactBucket
if ($LASTEXITCODE -ne 0) { throw "Artifact bucket is not accessible: $ArtifactBucket" }

aws cloudformation validate-template `
  --region $Region `
  --template-body "file://$ProjectRoot\template-deploy.yaml" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "CloudFormation template validation failed." }

aws cloudformation package `
  --region $Region `
  --template-file "$ProjectRoot\template-deploy.yaml" `
  --s3-bucket $ArtifactBucket `
  --s3-prefix engineering-calculators `
  --output-template-file $PackagedTemplate
if ($LASTEXITCODE -ne 0) { throw "CloudFormation packaging failed." }

aws cloudformation deploy `
  --region $Region `
  --template-file $PackagedTemplate `
  --stack-name $StackName `
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND `
  --tags Application=engineering-calculators `
  --no-fail-on-empty-changeset
if ($LASTEXITCODE -ne 0) { throw "CloudFormation deployment failed." }

$stack = aws cloudformation describe-stacks --region $Region --stack-name $StackName | ConvertFrom-Json
$outputs = $stack.Stacks[0].Outputs
$bucket = ($outputs | Where-Object OutputKey -eq "SiteBucketName").OutputValue
$distribution = ($outputs | Where-Object OutputKey -eq "DistributionId").OutputValue
$siteUrl = ($outputs | Where-Object OutputKey -eq "SiteUrl").OutputValue

aws s3 sync "$ProjectRoot\web-release" "s3://$bucket" --delete --region $Region --cache-control "public,max-age=300"
if ($LASTEXITCODE -ne 0) { throw "Static asset upload failed." }
aws s3 cp "$ProjectRoot\web-release" "s3://$bucket" --recursive --exclude "*" --include "*.html" --region $Region --cache-control "no-cache"
if ($LASTEXITCODE -ne 0) { throw "HTML upload failed." }

$invalidation = aws cloudfront create-invalidation --distribution-id $distribution --paths "/*" | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw "CloudFront invalidation failed." }
aws cloudfront wait invalidation-completed --distribution-id $distribution --id $invalidation.Invalidation.Id
if ($LASTEXITCODE -ne 0) { throw "CloudFront invalidation wait failed." }

Write-Host "Deployment complete: $siteUrl"

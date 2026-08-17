param(
  [string]$StackName = "iguchi-lab-calculators",
  [string]$Region = "ap-northeast-1",
  [string]$ArtifactBucket = "iguchi-lab-calculators-artifacts-389363572829-ap-northeast-1"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WorkspaceRoot = Split-Path -Parent $ProjectRoot
$PackagedTemplate = Join-Path $WorkspaceRoot "work\packaged-calculator-template.yaml"

aws cloudformation validate-template `
  --region $Region `
  --template-body "file://$ProjectRoot\template-deploy.yaml" | Out-Null

aws cloudformation package `
  --region $Region `
  --template-file "$ProjectRoot\template-deploy.yaml" `
  --s3-bucket $ArtifactBucket `
  --s3-prefix calculator-platform `
  --output-template-file $PackagedTemplate

aws cloudformation deploy `
  --region $Region `
  --template-file $PackagedTemplate `
  --stack-name $StackName `
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND `
  --tags Application=iguchi-lab-calculators ManagedBy=Codex `
  --no-fail-on-empty-changeset

$stack = aws cloudformation describe-stacks --region $Region --stack-name $StackName | ConvertFrom-Json
$outputs = $stack.Stacks[0].Outputs
$bucket = ($outputs | Where-Object OutputKey -eq "SiteBucketName").OutputValue
$distribution = ($outputs | Where-Object OutputKey -eq "DistributionId").OutputValue
$siteUrl = ($outputs | Where-Object OutputKey -eq "SiteUrl").OutputValue

aws s3 sync "$ProjectRoot\web-release" "s3://$bucket" --delete --region $Region --cache-control "public,max-age=300"
aws s3 cp "$ProjectRoot\web-release" "s3://$bucket" --recursive --exclude "*" --include "*.html" --region $Region --cache-control "no-cache"
$invalidation = aws cloudfront create-invalidation --distribution-id $distribution --paths "/*" | ConvertFrom-Json
aws cloudfront wait invalidation-completed --distribution-id $distribution --id $invalidation.Invalidation.Id

Write-Host "Deployment complete: $siteUrl"


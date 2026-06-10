<#
  One-time Azure setup for the Within Tolerance book API + Cosmos DB.

  Reuses the EXISTING free-tier Cosmos account (goal-reacher-db) and just adds a `books`
  database + `content` container to it (shared 400 RU/s, under the free 1000). Creates a Free
  (F1) Linux App Service web app for the API, its managed identity, and the passwordless Cosmos
  RBAC role assignments scoped to the books database (the API reads; you write via the Tools
  seeder). No keys, no Key Vault.

  Prereqs:  az CLI, logged in (`az login`), correct subscription selected
            (`az account set --subscription <id>`).

  Run it section by section the first time (review each step), or end-to-end. It's safe to
  re-run: creates are idempotent and role assignments dedupe.

  After it finishes it prints the Cosmos endpoint + the next manual steps (seed, deploy, SWA).
#>

$ErrorActionPreference = 'Stop'

# ---- Edit these ----------------------------------------------------------------------------
$Rg          = 'ai-mysteries'                    # resource group for the web app
$Location    = 'westus2'                         # az account list-locations -o table
$CosmosRg    = 'goal-reacher'                    # RG of the EXISTING shared Cosmos account
$CosmosAcct  = 'goal-reacher-db'                 # reuse the existing free-tier account
$Database    = 'books'                           # new database inside that account
$Container   = 'content'
$Plan        = 'ai-mysteries-plan'
$WebApp      = 'ai-mysteries-api'                # must be globally unique -> <name>.azurewebsites.net
$SwaOrigin   = 'https://therealending.com'       # prod front-end origin (lock CORS to this)
# Scope the API/seeder to only the books database (the account also hosts goal-reacher data).
$DbScope     = "/dbs/$Database"
# --------------------------------------------------------------------------------------------

# Built-in Cosmos data-plane role definition ids (stable GUIDs, same in every subscription).
$DataReader      = '00000000-0000-0000-0000-000000000001'
$DataContributor = '00000000-0000-0000-0000-000000000002'

Write-Host "==> Resource group" -ForegroundColor Cyan
az group create -n $Rg -l $Location | Out-Null

# Reusing an existing free-tier Cosmos account (goal-reacher-db); we don't create it. Add a
# database with shared 400 RU/s (the minimum) so the container fits under the free 1000 RU/s.
Write-Host "==> Cosmos database + container in existing account $CosmosAcct (partition key /bookId)" -ForegroundColor Cyan
az cosmosdb sql database create -a $CosmosAcct -g $CosmosRg -n $Database --throughput 400 | Out-Null
az cosmosdb sql container create -a $CosmosAcct -g $CosmosRg -d $Database -n $Container `
  --partition-key-path '/bookId' | Out-Null

Write-Host "==> App Service plan (Linux, Free F1) + web app" -ForegroundColor Cyan
az appservice plan create -g $Rg -n $Plan --sku F1 --is-linux | Out-Null
# .NET 10 may not be an available built-in stack yet; we deploy self-contained, so the stack
# value is not load-bearing. Check `az webapp list-runtimes --os linux` and bump if 10 exists.
az webapp create -g $Rg -p $Plan -n $WebApp --runtime 'DOTNETCORE:8.0' | Out-Null
# Self-contained apps are launched by their own executable:
az webapp config set -g $Rg -n $WebApp --startup-file 'AiMysteries.Api' | Out-Null

Write-Host "==> Managed identity for the web app" -ForegroundColor Cyan
$principalId = az webapp identity assign -g $Rg -n $WebApp --query principalId -o tsv

Write-Host "==> Cosmos RBAC (scoped to the books database): web app = Data Reader, you = Data Contributor" -ForegroundColor Cyan
az cosmosdb sql role assignment create -a $CosmosAcct -g $CosmosRg `
  --role-definition-id $DataReader --principal-id $principalId --scope $DbScope | Out-Null
$me = az ad signed-in-user show --query id -o tsv
az cosmosdb sql role assignment create -a $CosmosAcct -g $CosmosRg `
  --role-definition-id $DataContributor --principal-id $me --scope $DbScope | Out-Null

Write-Host "==> App settings (endpoint is not a secret; auth is via managed identity)" -ForegroundColor Cyan
$endpoint = az cosmosdb show -n $CosmosAcct -g $CosmosRg --query documentEndpoint -o tsv
az webapp config appsettings set -g $Rg -n $WebApp --settings `
  ContentSource=Cosmos `
  Cosmos__Endpoint=$endpoint `
  Cosmos__Database=$Database `
  Cosmos__Container=$Container `
  Cors__AllowedOrigins__0=$SwaOrigin | Out-Null

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "Cosmos endpoint : $endpoint"
Write-Host "Web app URL     : https://$WebApp.azurewebsites.net"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Seed the data (you have Data Contributor):"
Write-Host "       dotnet run --project ai-mysteries-tools -- seed --endpoint $endpoint"
Write-Host "  2. Verify parity:"
Write-Host "       dotnet run --project ai-mysteries-tools -- diff --endpoint $endpoint"
Write-Host "  3. Deploy the API: add repo secrets AZURE_WEBAPP_NAME ($WebApp) and"
Write-Host "     AZURE_WEBAPP_PUBLISH_PROFILE (Get publish profile from the portal), then push"
Write-Host "     to main (.github/workflows/api.yml), or zip-deploy the self-contained publish."
Write-Host "  4. Point the front end at the API: set VITE_API_BASE_URL=https://$WebApp.azurewebsites.net"
Write-Host "     in the Static Web App build configuration and redeploy the web app."

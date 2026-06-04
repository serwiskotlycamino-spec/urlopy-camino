param(
  [Parameter(Mandatory = $true)]
  [string]$ResourceGroup,

  [Parameter(Mandatory = $true)]
  [string]$WebAppName,

  [Parameter(Mandatory = $false)]
  [string]$SettingsFile = "docs/azure-appsettings.template.json"
)

if (-not (Test-Path $SettingsFile)) {
  throw "Nie znaleziono pliku ustawien: $SettingsFile"
}

Write-Host "Ustawiam App Settings dla $WebAppName w grupie $ResourceGroup..." -ForegroundColor Cyan
az webapp config appsettings set --resource-group $ResourceGroup --name $WebAppName --settings "@$SettingsFile"

Write-Host "" 
Write-Host "Gotowe. Sprawdz aktualne ustawienia:" -ForegroundColor Green
az webapp config appsettings list --resource-group $ResourceGroup --name $WebAppName --output table

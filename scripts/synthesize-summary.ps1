param(
  [Parameter(Mandatory = $true)]
  [string]$TextFile,

  [Parameter(Mandatory = $true)]
  [string]$AudioFile
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Speech

$text = Get-Content -Path $TextFile -Raw -Encoding UTF8

if ([string]::IsNullOrWhiteSpace($text)) {
  throw "O texto do resumo esta vazio."
}

$directory = Split-Path -Path $AudioFile -Parent

if ($directory -and -not (Test-Path -Path $directory)) {
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 0
$synth.Volume = 100
$synth.SetOutputToWaveFile($AudioFile)
$synth.Speak($text)
$synth.Dispose()

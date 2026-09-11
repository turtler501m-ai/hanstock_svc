param(
    [string]$HostName = $(if ($env:HANSTOCK_VM_HOST) { $env:HANSTOCK_VM_HOST } else { "168.110.102.249" }),
    [string]$User = $(if ($env:HANSTOCK_VM_USER) { $env:HANSTOCK_VM_USER } else { "ubuntu" }),
    [string]$KeyPath = $(if ($env:HANSTOCK_SSH_KEY) { $env:HANSTOCK_SSH_KEY } else { "" }),
    [string]$RemoteCommand = ""
)

$ssh = Get-Command ssh -ErrorAction SilentlyContinue
if (-not $ssh) {
    $defaultSsh = Join-Path $env:WINDIR "System32\OpenSSH\ssh.exe"
    if (Test-Path -LiteralPath $defaultSsh) {
        $ssh = Get-Item -LiteralPath $defaultSsh
    } else {
        throw "OpenSSH client was not found. Install OpenSSH or add ssh.exe to PATH."
    }
}

function Resolve-SshKeyPath {
    param([string]$RequestedPath)

    if ($RequestedPath) {
        if (Test-Path -LiteralPath $RequestedPath) {
            return $RequestedPath
        }
        throw "SSH key was not found: $RequestedPath. Set HANSTOCK_SSH_KEY or pass -KeyPath."
    }

    $candidates = @(
        "C:\0.DOC\id_ed25519",
        (Join-Path $env:USERPROFILE ".ssh\id_ed25519"),
        (Join-Path $env:USERPROFILE ".ssh\hanstock_vm_ed25519"),
        (Join-Path $env:USERPROFILE ".ssh\google_compute_engine"),
        (Join-Path $env:USERPROFILE ".ssh\id_rsa")
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    throw "SSH key was not found. Set HANSTOCK_SSH_KEY or pass -KeyPath."
}

$KeyPath = Resolve-SshKeyPath -RequestedPath $KeyPath
$target = "$User@$HostName"
$sshArgs = @(
    "-i", $KeyPath,
    "-o", "IdentitiesOnly=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=15",
    $target
)
if ($RemoteCommand) {
    $sshArgs += $RemoteCommand
}

& $ssh.Source @sshArgs
exit $LASTEXITCODE

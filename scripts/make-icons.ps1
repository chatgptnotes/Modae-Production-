# Regenerates the PWA / favicon icons from the full official ModAE logo.
#
# This is the one PowerShell helper in scripts/ (everything else is .mjs): the
# repo has no image dependency (no sharp, no ImageMagick on the box), and
# Windows PowerShell's System.Drawing does the resize + padding with nothing to
# install. Run it whenever assets/brand/modae/images/official-logo.png changes:
#
#   powershell -ExecutionPolicy Bypass -File scripts/make-icons.ps1
#
# Afterwards bump CACHE in public/sw.js, or installed service workers keep
# serving the previous icons through the offline cache fallback.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'assets\brand\modae\images\official-logo.png'

# Preserve the entire official artwork without cropping. The 512px icon is
# maskable, so keep the full logo inside the central 80%-diameter safe circle.
# At the source aspect ratio, 76% canvas width leaves every corner inside it.
$markWidthRatio = 0.76

$targets = @(
  @{ Name = 'icon-192.png';        Size = 192 },
  @{ Name = 'icon-512.png';        Size = 512 },
  @{ Name = 'apple-touch-icon.png'; Size = 180 }
)

$src = [System.Drawing.Bitmap]::FromFile($source)
try {
  foreach ($t in $targets) {
    $size = $t.Size
    $out = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($out)
    try {
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

      # Opaque black, matching the supplied artwork's own background.
      $g.Clear([System.Drawing.Color]::FromArgb(255, 0, 0, 0))

      $w = [int][Math]::Round($size * $markWidthRatio)
      $h = [int][Math]::Round($w * $src.Height / $src.Width)
      $dest = New-Object System.Drawing.Rectangle ([int](($size - $w) / 2)), ([int](($size - $h) / 2)), $w, $h
      $g.DrawImage($src, $dest, (New-Object System.Drawing.Rectangle 0, 0, $src.Width, $src.Height), [System.Drawing.GraphicsUnit]::Pixel)
    } finally {
      $g.Dispose()
    }

    $path = Join-Path $root "public\$($t.Name)"
    $out.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $out.Dispose()
    Write-Output "wrote $path ($size x $size)"
  }
} finally {
  $src.Dispose()
}

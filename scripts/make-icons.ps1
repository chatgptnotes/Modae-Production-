# Regenerates the PWA / favicon icons from the ModAE mark.
#
# This is the one PowerShell helper in scripts/ (everything else is .mjs): the
# repo has no image dependency (no sharp, no ImageMagick on the box), and
# Windows PowerShell's System.Drawing does the crop + resize with nothing to
# install. Run it whenever assets/brand/modae/images/icon-source.png changes:
#
#   powershell -ExecutionPolicy Bypass -File scripts/make-icons.ps1
#
# Afterwards bump CACHE in public/sw.js, or installed service workers keep
# serving the previous icons (they are cached by filename, cache-first).

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'assets\brand\modae\images\icon-source.png'

# Bounding box of the mark itself (both glyphs + dot) inside the 1770x485
# source. The thin purple bar at x 22-102 and yellow bar at x 1671-1750 are
# gradient reference swatches, not part of the logo, so they are cropped away.
$crop = New-Object System.Drawing.Rectangle 387, 86, 999, 316

# Fraction of the canvas width the mark occupies. icon-512 is declared
# "purpose": "any maskable" in the manifest, so Android may clip it to a circle
# and only the centre 80%-diameter safe zone is guaranteed visible. For this
# 3.16:1 mark the corners stay inside that circle up to ~76% width - do not
# widen this without dropping "maskable" from public/manifest.webmanifest.
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
      $h = [int][Math]::Round($w * $crop.Height / $crop.Width)
      $dest = New-Object System.Drawing.Rectangle ([int](($size - $w) / 2)), ([int](($size - $h) / 2)), $w, $h
      $g.DrawImage($src, $dest, $crop, [System.Drawing.GraphicsUnit]::Pixel)
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

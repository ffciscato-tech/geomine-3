# Large BigTIFF initial import — 2026-09-23

Reported folder contains four MDT TIFFs, 5.92–6.93 GB each. Examined metadata
from MDT1 and MDT3: uncompressed Float32 BigTIFF, one-row strips, no overviews.
MDT3 has 35,745 × 41,424 cells (1.48 billion), with its IFD and many strip
offsets above 4 GB. The bundled GeoTIFF library correctly reads these offsets.
The bottleneck was the scalar importer's complete native scan for block means
before first display, compounded by 4 MiB read-ahead on sparse sampled rows.

Changes (modular source, no vendor edits):

- `raster/large-preview.js`: above 150 million source cells, initial display is
  bounded to one million cells. If the selected image still exceeds the
  threshold, use the existing bounded nearest-neighbor block sampler. Smaller
  rasters and reduced overviews retain block-mean behavior. Unsupported sampled
  formats retain the existing banded reader.
- `raster/import-reader.js`: files >=1 GiB use 128 KiB physical read blocks;
  smaller sources retain 4 MiB coalescing. Global cache and concurrency stay
  16 MiB / two readers. Offsets remain safe Numbers, including beyond 4 GiB.
- Core 19 integrates the helper, real progress/cancellation, TIFF-declared
  elevation extremes and approximate-stat labeling. Original image, extent,
  CRS, dimensions, NoData and TIFF handles remain linked for native reads.
- Android does not automatically copy >=1 GiB to OPFS before import; direct
  source access avoids duplicating several GB. Downloading to local Files /
  Downloads is still necessary for reliable access when a cloud provider
  cannot supply ranges. Smaller Android files retain stable OPFS caching.
- The properties panel identifies sampled previews, and project save/reopen
  retains this distinction. The preview is not an analytical terrain model;
  products still use the existing native-source paths and memory limits.

Validation:

- `validate_large_tiff.mjs`: virtual 5.74 GB BigTIFF with real 64-bit metadata,
  native elevation/NoData checks, offsets above 4 GB, bounded I/O, cancellation,
  and preserved original handles. Reads 293 MB (~5.1%) for 992,838 preview cells.
- Optional private MDT3 excerpts: exact comparison of 35,745 Float32 samples
  from row 40,000, whose offset is 5,719,200,016; georeferencing EPSG:31982 and
  declared extremes 21.8745059967041–324.28594970703125 m verified. Excerpts are
  local diagnostics only, excluded from source promotion and Hosting.
- `smoke_large_tiff.mjs`: complete browser file-picker/import with a sparse
  5.74 GB synthetic BigTIFF, desktop and Android user-agent simulation; one
  raster committed, original linked, no OPFS duplication, no page errors.
- Existing 228 MB real MDT browser test passes desktop and simulated Android,
  including cancel, timeout, provider failure and exact original statistics.
- Existing reader (14), fast-open (14), sampled-reader (14 / 151 exact
  comparisons), MDT control (10), source-cache (26), and native-resolution
  checks pass.

Limits: no full download/import of all four remote multi-GB originals; no
physical Android device test. Sparse test timings are not a promise for cloud
downloads or physical storage. The change does not generate persistent COG
overviews, remove analytical memory limits, or repair a truncated source file.
